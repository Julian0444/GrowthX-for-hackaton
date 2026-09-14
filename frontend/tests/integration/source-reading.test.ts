import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
import {runMigrations} from '../../lib/server/db/migrate.ts';
import {withTenantTransaction} from '../../lib/server/db/pool.ts';
import {createEvaluationService} from '../../lib/server/evaluations/service.ts';
import {processEvaluationRun} from '../../lib/server/evaluations/run-worker.ts';
import {readEditionDossier} from '../../lib/server/catalog/read.ts';
import {projectEditionDossierView} from '../../lib/api/opportunity-adapter.ts';
import {cachedSourceRead} from '../../lib/server/sources/cache.ts';
import {readKnownSource,parseKnownSourceRead} from '../../lib/server/sources/reader.ts';
import {runWebsiteCrawler} from '../../lib/server/sources/website-crawler.ts';
import {readProposedSource} from '../../lib/server/sources/proposed-source.ts';
import {verifyEvidenceReferences} from '../../lib/server/evidence/store.ts';
import {briefBody} from '../fixtures/research-brief.ts';
import {richSourceHtml,RICH_SOURCE_URL,SOURCE_NOW} from '../fixtures/source-reading.ts';

test('DP-05 durable source reading: PostgreSQL, replay, partial evidence, tenant boundaries and Actor recovery',{timeout:90000},async t=>{
  assert.ok(process.env.GROWTHX_ADMIN_DATABASE_URL && !process.env.GROWTHX_ADMIN_DATABASE_URL.includes(':54329/'),'Explicit isolated DB required; shared localhost:54329 is prohibited');
  const admin=new pg.Client({connectionString:process.env.GROWTHX_ADMIN_DATABASE_URL});await admin.connect();await runMigrations();
  const app=new pg.Pool({connectionString:process.env.GROWTHX_DATABASE_URL});
  const worker=new pg.Pool({connectionString:process.env.GROWTHX_WORKER_DATABASE_URL,max:3});
  t.after(async()=>{await app.end();await worker.end();await admin.end();});
  const tenantId=randomUUID(),decoy=randomUUID(),userId=randomUUID();
  await admin.query('insert into growthx.tenants(id,slug,display_name) values($1::uuid,$1::text,$1::text),($2::uuid,$2::text,$2::text)',[tenantId,decoy]);
  await admin.query('insert into growthx.app_users(id,email,display_name) values($1::uuid,$1::text,$1::text)',[userId]);
  await admin.query('insert into growthx.memberships(tenant_id,user_id) values($1,$3),($2,$3)',[tenantId,decoy,userId]);
  const service=createEvaluationService({pool:app,queue:{async sendRunJob(){}}});
  const base=await service.accept({tenantId,userId,body:{...briefBody(),idempotencyKey:randomUUID()}});assert.equal(base.status,'accepted');
  const baseRunId=(base as {runId:string}).runId;
  const accept=async(url=RICH_SOURCE_URL)=>{
    const accepted=await service.acceptEventIngest({tenantId,userId,body:{url,idempotencyKey:randomUUID(),profileRunId:baseRunId}});assert.equal(accepted.status,'accepted');
    return {pool:worker,tenantId,runId:(accepted as {runId:string}).runId};
  };
  let editionId='',firstRevision='',audienceId='';
  await t.test('DP-04 proposed source is read in its tenant/run; new full evidence does not rewrite the search source or invent entities',async()=>{
    const accepted=await service.accept({tenantId,userId,body:{...briefBody(),researchScope:'sf_discovery',idempotencyKey:randomUUID()}});assert.equal(accepted.status,'accepted');
    const job={pool:worker,tenantId,runId:(accepted as {runId:string}).runId};
    await processEvaluationRun(job,{pool:worker,discovery:{apiKey:'controlled',isFixture:true,fetchImpl:async()=>Response.json({costDollars:{total:0},results:[{url:RICH_SOURCE_URL,title:'Proposed rich source',text:'Search snippet only'}]})}});
    const proposal=(await service.getRun(job))!.discovery!.sources[0];let calls=0;
    const options={isFixture:true as const,now:()=>new Date(SOURCE_NOW),fetchImpl:async()=>{calls++;return new Response(richSourceHtml());}};
    const full=await readProposedSource(job,proposal.id,options);
    assert.notEqual(full.source.id,proposal.id);assert.ok(full.observations.some(o=>o.attribute==='audience'));
    await withTenantTransaction(worker,tenantId,client=>verifyEvidenceReferences(client,full.observations.flatMap(o=>o.evidence)));
    assert.deepEqual(await readProposedSource(job,proposal.id,options),full);assert.equal(calls,1);
    assert.deepEqual((await service.getRun(job))!.discovery!.sources.find(s=>s.id===proposal.id),proposal);
    assert.equal((await admin.query('select count(*)::int n from growthx.event_editions where tenant_id=$1',[tenantId])).rows[0].n,0);
    await assert.rejects(readProposedSource({...job,tenantId:decoy},proposal.id,options),/tenant/);
    const ingest=await accept();
    await processEvaluationRun(ingest,{pool:worker,lumaIngest:{...options,cacheTtlMs:300000,fetchImpl:async()=>{throw Error('the full proposed-source cache should be reused');}}});
    const imported=await service.getRun(ingest);assert.equal(imported?.state,'completed');
    assert.equal((imported!.result as {reading:{cache:string}}).reading.cache,'hit');assert.equal(calls,1);
  });
  await t.test('rich source persists exact fragments, contradicted dates and public location; fresh DB connection reads identical evidence',async()=>{
    const job=await accept();let calls=0;
    await processEvaluationRun(job,{pool:worker,lumaIngest:{fetchImpl:async()=>{calls++;return new Response(richSourceHtml());},isFixture:true,now:()=>new Date(SOURCE_NOW)}});
    const run=await service.getRun(job);assert.equal(run?.state,'completed');
    editionId=(run!.result as {editionId:string}).editionId;
    const read=await readEditionDossier(app,tenantId,editionId,SOURCE_NOW);assert.ok(read);firstRevision=read.editionRevisions.at(-1)!.id;
    const view=projectEditionDossierView(read);assert.equal(view.date.conflict,true);assert.equal(view.audience.field.state,'known');
    const heads=read.claims.map(c=>c.revisions.at(-1)!);audienceId=heads.find(c=>c.attribute==='audience')!.id;
    const sponsor=heads.find(c=>c.attribute==='sponsors:announced')!.value;
    assert.match(sponsor.kind==='text'?sponsor.text:'',/Wasmer[\s\S]*Tenki/);
    assert.equal(read.editionRevisions.at(-1)!.publicLocation?.address?.postalCode,'94105');
    assert.deepEqual(heads.find(c=>c.attribute==='address')!.value,{kind:'text',text:read.editionRevisions.at(-1)!.publicLocation!.originalAddress});
    for(const claim of heads.filter(c=>c.status!=='pending')){
      assert.equal(claim.reviewer,null);assert.ok(claim.evidence?.length,claim.attribute);
      for(const ref of claim.evidence!){const source=read.sources.find(s=>s.id===ref.sourceId);assert.ok(source?.fragments?.some(f=>f.id===ref.fragmentId));}
    }
    await processEvaluationRun(job,{pool:worker,lumaIngest:{fetchImpl:async()=>{throw Error('must not call twice');}}});assert.equal(calls,1);
    const fresh=new pg.Pool({connectionString:process.env.GROWTHX_DATABASE_URL});
    try{assert.deepEqual(await readEditionDossier(fresh,tenantId,editionId,SOURCE_NOW),read);}finally{await fresh.end();}
    assert.equal(await readEditionDossier(app,decoy,editionId,SOURCE_NOW),null);
  });
  await t.test('a sparse new page keeps prior supported attributes, public address and revision IDs',async()=>{
    const job=await accept();
    await processEvaluationRun(job,{pool:worker,lumaIngest:{fetchImpl:async()=>new Response('<script type="application/ld+json">{"@type":"Event","name":"Sparse update"}</script>'),isFixture:true,forceRefresh:true}});
    const read=await readEditionDossier(app,tenantId,editionId,SOURCE_NOW);assert.ok(read);
    const latest=read.editionRevisions.at(-1)!;
    assert.equal(latest.previousRevisionId,firstRevision);assert.ok(latest.claimRevisionIds.includes(audienceId));
    assert.equal(latest.publicLocation?.address?.streetAddress,'501 Folsom St');
    assert.equal(read.claims.find(c=>c.revisions.at(-1)!.attribute==='audience')!.revisions.at(-1)!.id,audienceId);
  });
  await t.test('published venue coordinates without city remain usable under the DP-03 venue scope',async()=>{
    const job=await accept('https://lu.ma/dp05-venue-only');
    await processEvaluationRun(job,{pool:worker,lumaIngest:{isFixture:true,fetchImpl:async()=>new Response('<script type="application/ld+json">{"@type":"Event","name":"Venue source","location":{"@type":"Place","name":"Public venue","geo":{"latitude":37.78,"longitude":-122.4}}}</script>')}});
    const run=await service.getRun(job);assert.equal(run?.state,'completed');
    const read=await readEditionDossier(app,tenantId,(run!.result as {editionId:string}).editionId,SOURCE_NOW);
    assert.equal(read?.editionRevisions.at(-1)!.location.scope,'venue');assert.equal(read?.editionRevisions.at(-1)!.publicLocation?.precision,'venue');
    assert.deepEqual(read?.editionRevisions.at(-1)!.coordinates,{lat:37.78,lng:-122.4});
  });
  await t.test('cache reuse retains fetchedAt, failure retains stale evidence, and caches cannot cross tenants',async()=>{
    const url='https://lu.ma/dp05-cache';const first=await accept(url);let calls=0;
    const options={isFixture:true as const,now:()=>new Date(SOURCE_NOW),cacheTtlMs:300000,fetchImpl:async()=>{calls++;return new Response(richSourceHtml());}};
    const a=await cachedSourceRead(first,url,()=>readKnownSource(url,options),parseKnownSourceRead,options);
    const second=await accept(url);const b=await cachedSourceRead(second,url,()=>{throw Error('cache expected');},parseKnownSourceRead,options);
    assert.equal(b.reading.cache,'hit');assert.equal(b.fetchedAt,a.fetchedAt);assert.equal(calls,1);
    const third=await accept(url);const failure=await cachedSourceRead(third,url,()=>readKnownSource(url,{fetchImpl:async()=>new Response('private provider error',{status:503})}),parseKnownSourceRead,{...options,forceRefresh:true});
    assert.equal(failure.reading.cache,'stale_fallback');assert.equal(failure.reading.freshness,'stale');assert.deepEqual(failure.fullContent,a.fullContent);assert.doesNotMatch(JSON.stringify(failure),/private provider error/);
    await assert.rejects(cachedSourceRead({...first,tenantId:decoy},url,()=>readKnownSource(url,options),parseKnownSourceRead,options),/tenant/);
    await withTenantTransaction(worker,decoy,async c=>assert.equal((await c.query('select * from growthx.source_reads where tenant_id=$1',[tenantId])).rowCount,0));
  });
  await t.test('Actor run ID survives actual SIGKILL; restarted client polls exactly that Actor and retains a partial failed dataset',async()=>{
    const job=await accept('https://lu.ma/dp05-actor-recovery');
    const moduleUrl=new URL('../../lib/server/sources/website-crawler.ts',import.meta.url).href;
    const code=`import pg from 'pg';import {runWebsiteCrawler} from ${JSON.stringify(moduleUrl)};const ctx=JSON.parse(process.env.DP05_ACTOR_CONTEXT);const pool=new pg.Pool({connectionString:process.env.GROWTHX_WORKER_DATABASE_URL});await runWebsiteCrawler({...ctx,pool},'https://lu.ma/dp05-actor-recovery',{token:'controlled-token',materialGap:'Controlled missing rendered text',isFixture:true,fetchImpl:async()=>Response.json({data:{id:'ActorDP05Recovery',status:'RUNNING'}}),testBarrier:p=>{if(p==='actor:run_id_committed')process.kill(process.pid,'SIGKILL')}});`;
    const child=spawn(process.execPath,['--input-type=module','-e',code],{cwd:fileURLToPath(new URL('../..',import.meta.url)),env:{...process.env,DP05_ACTOR_CONTEXT:JSON.stringify({tenantId,runId:job.runId})},stdio:'ignore'});
    const ended=await new Promise<string|null>(resolve=>child.once('exit',(_c,signal)=>resolve(signal)));assert.equal(ended,'SIGKILL');
    const requests:string[]=[];const resumed=new pg.Pool({connectionString:process.env.GROWTHX_WORKER_DATABASE_URL,max:1});
    try{
      const result=await runWebsiteCrawler({...job,pool:resumed},'https://lu.ma/dp05-actor-recovery',{token:'controlled-token',materialGap:'Controlled missing text',isFixture:true,fetchImpl:async(input,init)=>{assert.notEqual(init?.method,'POST');requests.push(String(input));return String(input).includes('/dataset/')?Response.json([{url:'https://lu.ma/dp05-actor-recovery',markdown:'# Who should come\nDevelopers and agent builders.'}]):Response.json({data:{id:'ActorDP05Recovery',status:'FAILED',usageTotalUsd:.02}});}});
      assert.equal(result.state,'failed');assert.equal(result.actorRunId,'ActorDP05Recovery');assert.ok(result.reading?.fullContent.attributes.some(a=>a.attribute==='audience'));assert.deepEqual(result.consumption?.cost,{status:'known',amount:.02,currency:'USD'});
      assert.equal(requests.length,2);assert.ok(requests.every(u=>u.includes('/ActorDP05Recovery')));
      assert.equal((await runWebsiteCrawler({...job,pool:resumed},'https://lu.ma/dp05-actor-recovery',{token:'controlled-token',materialGap:'Missing',fetchImpl:async()=>{throw Error('terminal replay must not call');}})).state,'failed');
    }finally{await resumed.end();}
  });
  await t.test('unknown Actor start response is never repeated; reservation survives and provider secrets are not logged',async()=>{
    const job=await accept('https://lu.ma/dp05-actor-uncertain');let calls=0;
    const options={token:'controlled-token',materialGap:'Missing',fetchImpl:async()=>{calls++;throw Error('secret provider body');}};
    const one=await runWebsiteCrawler(job,'https://lu.ma/dp05-actor-uncertain',options);const two=await runWebsiteCrawler(job,'https://lu.ma/dp05-actor-uncertain',options);
    assert.equal(one.state,'uncertain');assert.deepEqual(two,one);assert.equal(calls,1);assert.doesNotMatch(JSON.stringify(two),/secret provider body|controlled-token/);
  });
  await t.test('global budget caps concurrent runs across tenants; no per-session reset; missing key consumes nothing',async()=>{
    const a=await accept('https://lu.ma/dp05-budget-a');
    const decoyBase=await service.accept({tenantId:decoy,userId,body:{...briefBody(),idempotencyKey:randomUUID()}});assert.equal(decoyBase.status,'accepted');
    const decoyIngest=await service.acceptEventIngest({tenantId:decoy,userId,body:{url:'https://lu.ma/dp05-budget-b',idempotencyKey:randomUUID(),profileRunId:(decoyBase as {runId:string}).runId}});assert.equal(decoyIngest.status,'accepted');
    const b={pool:worker,tenantId:decoy,runId:(decoyIngest as {runId:string}).runId};
    const before=Number((await admin.query("select reserved_usd from growthx.source_provider_allowance where provider='apify'")).rows[0].reserved_usd);
    assert.equal((await runWebsiteCrawler(a,'https://lu.ma/dp05-budget-a',{token:'',materialGap:'Missing'})).state,'unavailable');
    assert.equal(Number((await admin.query("select reserved_usd from growthx.source_provider_allowance where provider='apify'")).rows[0].reserved_usd),before);
    await admin.query("update growthx.source_provider_allowance set reserved_usd=14,halted=false where provider='apify'");
    let starts=0;const opts={token:'controlled-token',materialGap:'Missing',fetchImpl:async(_u:RequestInfo|URL,init?:RequestInit)=>{if(init?.method==='POST'){starts++;const body=JSON.parse(String(init.body));assert.equal(body.maxCrawlDepth,0);assert.equal(body.maxCrawlPages,1);assert.equal(body.summarize,false);}return Response.json({data:{id:'BoundedActor',status:'RUNNING'}});}};
    const results=await Promise.all([runWebsiteCrawler(a,'https://lu.ma/dp05-budget-a',opts),runWebsiteCrawler(b,'https://lu.ma/dp05-budget-b',opts)]);
    assert.equal(starts,1);assert.equal(results.filter(r=>r.state==='unavailable').length,1);assert.equal(Number((await admin.query("select reserved_usd from growthx.source_provider_allowance where provider='apify'")).rows[0].reserved_usd),15);
    await withTenantTransaction(worker,decoy,async c=>{assert.equal((await c.query('select * from growthx.source_actor_operations where tenant_id=$1',[tenantId])).rowCount,0);await assert.rejects(c.query('select growthx.reserve_source_actor($1)',[a.runId]),/unavailable/);});
    // Only the explicitly isolated test DB is reset; no real credit was used.
    await admin.query("update growthx.source_provider_allowance set reserved_usd=0,halted=false where provider='apify'");
  });
});
