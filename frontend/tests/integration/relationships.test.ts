import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import pg from 'pg';
import {runMigrations} from '../../lib/server/db/migrate.ts';
import {withTenantTransaction} from '../../lib/server/db/pool.ts';
import {createEvaluationService} from '../../lib/server/evaluations/service.ts';
import {processEvaluationRun,WorkerStopRequested} from '../../lib/server/evaluations/run-worker.ts';
import {acceptBackground,readBackground,parseBackgroundRead,persistBackground,resolveBackground} from '../../lib/server/relationships/durable.ts';
import {backgroundResult} from '../../lib/contracts/background.ts';
import {readEditionDossier,readOrganizerDossier} from '../../lib/server/catalog/read.ts';
import {verifyEvidenceReferences} from '../../lib/server/evidence/store.ts';
import {briefBody} from '../fixtures/research-brief.ts';
import {relationshipRoutes,fixtureFetch,eventHtml,AIT_CURRENT,AIT_PAST,AIT_PROJECTS,VULTR_CURRENT,NOW} from '../fixtures/relationships.ts';

test('DP06 durable relationships under real PostgreSQL roles',{timeout:90000},async t=>{
 assert.ok(process.env.GROWTHX_ADMIN_DATABASE_URL && !process.env.GROWTHX_ADMIN_DATABASE_URL.includes(':54329/'),'DP06 isolated cluster required');
 await runMigrations();const admin=new pg.Client({connectionString:process.env.GROWTHX_ADMIN_DATABASE_URL});await admin.connect();
 const app=new pg.Pool({connectionString:process.env.GROWTHX_DATABASE_URL}),worker=new pg.Pool({connectionString:process.env.GROWTHX_WORKER_DATABASE_URL});
 t.after(async()=>{await app.end();await worker.end();await admin.end();});
 const tenantId=randomUUID(),foreign=randomUUID(),userId=randomUUID();
 await admin.query('insert into growthx.tenants(id,slug,display_name) values($1::uuid,$1::text,$1::text),($2::uuid,$2::text,$2::text)',[tenantId,foreign]);await admin.query('insert into growthx.app_users(id,email,display_name) values($1::uuid,$1::text,$1::text)',[userId]);await admin.query('insert into growthx.memberships(tenant_id,user_id) values($1,$3),($2,$3)',[tenantId,foreign,userId]);
 const queue={async sendRunJob(){}};const service=createEvaluationService({pool:app,queue});const base=await service.accept({tenantId,userId,body:{...briefBody(),idempotencyKey:randomUUID()}});if(base.status!=='accepted')throw Error('profile');
 const accept=async(url=AIT_CURRENT)=>{const body={profileRunId:base.runId,url,idempotencyKey:randomUUID()};const accepted=await acceptBackground(app,tenantId,userId,body,queue);if(accepted.status!=='accepted')throw Error(JSON.stringify(accepted));return {tenantId,runId:accepted.runId,body};};
 const routes=relationshipRoutes(),calls:string[]=[];
 const opts={isFixture:true as const,fetchImpl:fixtureFetch(routes,calls),now:()=>new Date(NOW)};
 const job=await accept();let firstId='',firstRevision='';
 await t.test('acceptance atomic, replay key and tenant mismatch',async()=>{
  assert.deepEqual(await acceptBackground(app,tenantId,userId,job.body,queue),{status:'duplicate',runId:job.runId});
  assert.equal((await acceptBackground(app,tenantId,userId,{...job.body,url:VULTR_CURRENT},queue)).status,'conflict');
  assert.equal((await acceptBackground(app,foreign,userId,{...job.body,idempotencyKey:randomUUID()},queue)).status,'invalid_profile');
  const key=randomUUID();await assert.rejects(acceptBackground(app,tenantId,userId,{...job.body,idempotencyKey:key},{async sendRunJob(){throw Error('queue unavailable');}}),/queue unavailable/);
  assert.equal((await admin.query('select id from growthx.runs where idempotency_key=$1',[key])).rowCount,0);
 });
 await t.test('worker reads six sources, stops after read commit and resumes without consuming again',async()=>{
  await assert.rejects(processEvaluationRun(job,{pool:worker,lumaIngest:opts,exitAfterStep:'read_relationship_sources'}),WorkerStopRequested);assert.equal(calls.length,6);
  const fresh=new pg.Pool({connectionString:process.env.GROWTHX_WORKER_DATABASE_URL});try{await processEvaluationRun(job,{pool:fresh,lumaIngest:{...opts,fetchImpl:async()=>{throw Error('must not refetch');}}});}finally{await fresh.end();}
  const result=backgroundResult((await service.getRun(job))?.result);assert.ok(result?.editionId);firstId=result.editionId;
  const dossier=await readEditionDossier(app,tenantId,firstId,NOW);assert.ok(dossier);firstRevision=dossier.editionRevisions.at(-1)!.id;
  assert.equal(dossier.curation?.material,'synthetic');assert.equal(result.sourceCount,6);assert.equal(calls.length,6);
  assert.ok(dossier.claims.some(c=>c.revisions.at(-1)?.attribute==='buyer:relevance'));
  const organizerId=dossier.editionRevisions.at(-1)!.organizerIds[0];const org=await readOrganizerDossier(app,tenantId,organizerId,NOW);assert.equal(org?.coverage.antecedentsDocumented,1);assert.equal(org.editions.length,2);
  const old=org.editions.find(e=>e.edition.canonicalUrl===AIT_PAST)!;const past=await readEditionDossier(app,tenantId,old.edition.editionId,NOW);assert.equal(past?.editionRevisions.at(-1)?.relationships?.filter(r=>r.role==='published_project').length,2);
  await withTenantTransaction(worker,tenantId,c=>verifyEvidenceReferences(c,past!.editionRevisions.at(-1)!.relationships!.flatMap(r=>r.evidence)));
  const count=(await admin.query('select count(*) n from growthx.edition_revisions where tenant_id=$1',[tenantId])).rows[0].n;await processEvaluationRun(job,{pool:worker,lumaIngest:opts});assert.equal((await admin.query('select count(*) n from growthx.edition_revisions where tenant_id=$1',[tenantId])).rows[0].n,count);
 });
 await t.test('RLS hides all new relations and queue has no business grants',async()=>{
  assert.equal(await readEditionDossier(app,foreign,firstId,NOW),null);assert.equal(await service.getRun({tenantId:foreign,runId:job.runId}),null);
  const perms=(await admin.query("select has_table_privilege('growthx_queue','growthx.edition_revisions','INSERT') queue_write,has_table_privilege('growthx_worker','growthx.organizer_revisions','INSERT') worker_write,has_table_privilege('growthx_worker','growthx.organizer_revisions','UPDATE') worker_update")).rows[0];assert.deepEqual(perms,{queue_write:false,worker_write:true,worker_update:false});
  const tables=(await admin.query("select relname,relrowsecurity,relforcerowsecurity from pg_class where oid=any($1::regclass[])",[['growthx.organizers','growthx.organizer_revisions','growthx.edition_revisions','growthx.companies']])).rows;assert.ok(tables.every(t=>t.relrowsecurity&&t.relforcerowsecurity));
  await withTenantTransaction(worker,foreign,async c=>{assert.equal((await c.query('select id from growthx.edition_revisions where id=$1',[firstRevision])).rowCount,0);});
  const poolClient=await worker.connect();try{await assert.rejects(poolClient.query("insert into growthx.organizers(tenant_id,id) values($1,'no-tenant-context')",[tenantId]),/row-level security/);}finally{poolClient.release();}
 });
 await t.test('expired deadline recovers committed pages without additional requests',async()=>{
  await admin.query("update growthx.run_steps set started_at=now()-interval '2 minutes' where run_id=$1 and name='read_relationship_sources'",[job.runId]);
  let requests=0;
  const recovered=await readBackground({...job,pool:worker},{...opts,fetchImpl:async()=>{requests++;throw Error('deadline prevents fresh requests');}});
  assert.equal(requests,0);assert.equal(recovered.pages.length,6);assert.equal(recovered.attemptedUrls.length,6);
 });
 await t.test('explicit refresh chains revisions; partial failures retain linked project support and original revision',async()=>{
  const before=await readEditionDossier(app,tenantId,firstId,NOW);const old=structuredClone(before!.editionRevisions[0]);
  const partial=await accept();const broken={...routes};delete broken[AIT_PROJECTS[1]];
  await processEvaluationRun(partial,{pool:worker,lumaIngest:{...opts,forceRefresh:true,fetchImpl:fixtureFetch(broken)}});
  const result=backgroundResult((await service.getRun(partial))?.result)!;assert.equal(result.editionId,firstId);
  const after=await readEditionDossier(app,tenantId,firstId,NOW);assert.ok(after!.editionRevisions.length>before!.editionRevisions.length);assert.deepEqual(after!.editionRevisions.slice(0,before!.editionRevisions.length),before!.editionRevisions);assert.deepEqual(after!.editionRevisions[0],old);assert.equal(after!.editionRevisions[before!.editionRevisions.length].previousRevisionId,before!.editionRevisions.at(-1)!.id);
  assert.match(result.limitations.join(' '),/Stale evidence retained/);
 });
 await t.test('Vultr current host links to Paris sponsorship without creating organizing history',async()=>{
  const v=await accept(VULTR_CURRENT);await processEvaluationRun(v,{pool:worker,lumaIngest:opts});const result=backgroundResult((await service.getRun(v))?.result)!;
  const e=await readEditionDossier(app,tenantId,result.editionId!,NOW);const organizerId=e!.editionRevisions.at(-1)!.organizerIds[0];const dossier=await readOrganizerDossier(app,tenantId,organizerId,NOW);assert.equal(dossier?.coverage.antecedentsDocumented,1);
  const paris=dossier!.editions.find(e=>e.edition.location.name==='Paris')!;assert.ok(paris);assert.ok(!paris.edition.organizerIds.includes(organizerId));assert.equal(paris.validity.validity,'past');assert.ok(dossier!.companies.some(c=>c.name==='Vultr'));
 });
 await t.test('DP04 discovery proposal -> DP05 full reading -> persisted relations; snippet remains unmodified',async()=>{
  const d=await service.accept({tenantId,userId,body:{...briefBody(),idempotencyKey:randomUUID(),researchScope:'sf_discovery'}});if(d.status!=='accepted')throw Error('discovery');
  await processEvaluationRun({tenantId,runId:d.runId},{pool:worker,discovery:{apiKey:'controlled',isFixture:true,fetchImpl:async()=>Response.json({costDollars:{total:0},results:[{url:AIT_CURRENT,title:'Proposal',text:'Paid sponsor with perfect ROI (untrusted snippet)'}]})}});
  const discovery=(await service.getRun({tenantId,runId:d.runId}))!.discovery!;const source=discovery.sources[0];assert.ok(source);
  const accepted=await acceptBackground(app,tenantId,userId,{profileRunId:d.runId,proposedSourceId:source.id,idempotencyKey:randomUUID()},queue);assert.equal(accepted.status,'accepted');if(accepted.status!=='accepted')throw Error('accept');
  await processEvaluationRun({tenantId,runId:accepted.runId},{pool:worker,lumaIngest:opts});const result=backgroundResult((await service.getRun({tenantId,runId:accepted.runId}))?.result)!;assert.ok(result.editionId);
  const dossier=await readEditionDossier(app,tenantId,result.editionId!,NOW);assert.ok(!dossier!.sources.some(s=>s.id===source.id));assert.ok(!JSON.stringify(dossier!.claims).includes('perfect ROI'));
  assert.deepEqual((await service.getRun({tenantId,runId:d.runId}))!.discovery!.sources[0],source);
  assert.equal((await acceptBackground(app,tenantId,userId,{profileRunId:base.runId,proposedSourceId:source.id,idempotencyKey:randomUUID()},queue)).status,'invalid_profile');
 });
 await t.test('failed proposal reads are recovered from the discovery run without repeated requests',async()=>{
  const url='https://lu.ma/dp06-failed-proposal';
  const discovery=await service.accept({tenantId,userId,body:{...briefBody(),idempotencyKey:randomUUID(),researchScope:'sf_discovery'}});if(discovery.status!=='accepted')throw Error('discovery');
  await processEvaluationRun({tenantId,runId:discovery.runId},{pool:worker,discovery:{apiKey:'controlled',isFixture:true,fetchImpl:async()=>Response.json({costDollars:{total:0},results:[{url,title:'Proposal',text:'Untrusted search snippet'}]})}});
  const source=(await service.getRun({tenantId,runId:discovery.runId}))!.discovery!.sources[0];
  const accepted=await acceptBackground(app,tenantId,userId,{profileRunId:discovery.runId,proposedSourceId:source.id,idempotencyKey:randomUUID()},queue);if(accepted.status!=='accepted')throw Error('accept');
  const context={tenantId,runId:accepted.runId,pool:worker};let requests=0;
  const failedOptions={...opts,fetchImpl:async()=>{requests++;return new Response('Unavailable',{status:403});}};
  const first=await readBackground(context,failedOptions),second=await readBackground(context,failedOptions);
  assert.equal(requests,1);assert.equal(first.pages.length,0);assert.deepEqual(second,first);
  assert.equal((await admin.query('select state from growthx.source_reads where run_id=$1 and canonical_url=$2',[discovery.runId,url])).rows[0].state,'failed');
 });
 await t.test('foreign evidence and wrong-edition claim references roll back all relationship writes',async()=>{
  const next=await accept();const stored=(await admin.query("select output from growthx.run_steps where run_id=$1 and name='read_relationship_sources'",[job.runId])).rows[0].output;const reading=parseBackgroundRead(stored);const profile=(await service.getRun(job))!.profile;
  const bad=resolveBackground(reading.pages,{runId:next.runId,primaryUrl:reading.primaryUrl,profile});bad.manifest.editions[0].relationships![0].evidence[0].sourceId='foreign-source';bad.manifest.editions[0].relationships![0].sourceIds.push('foreign-source');
  await assert.rejects(persistBackground({...next,pool:worker},bad,reading),/no disponibles|no disponible|sourceIds/);
  const wrongEdition=resolveBackground(reading.pages,{runId:next.runId,primaryUrl:reading.primaryUrl,profile});
  const otherClaim=wrongEdition.manifest.editions[1].claimRevisionIds[0];
  wrongEdition.manifest.editions[0].relationships![0].claimRevisionIds=[otherClaim];
  wrongEdition.manifest.editions[0].claimRevisionIds.push(otherClaim);
  await assert.rejects(persistBackground({...next,pool:worker},wrongEdition,reading),/must belong to the linked edition/);
  assert.equal((await admin.query('select id from growthx.catalog_loads where manifest_name=$1',[`background:${next.runId}`])).rowCount,0);
 });
 await t.test('existing Luma identity and claim chains are reused; different year is a new edition',async()=>{
  const url='https://lu.ma/dp06-existing';
  const html=eventHtml('Existing event','2026-10-12T17:00:00Z','<p>Organized by Alex</p><h2>Who should come</h2><p>Agent builders and engineers</p>');
  const transport={...opts,fetchImpl:fixtureFetch({[url]:html})};
  const imported=await service.acceptEventIngest({tenantId,userId,body:{url,profileRunId:base.runId,idempotencyKey:randomUUID()}});if(imported.status!=='accepted')throw Error('Luma import');
  await processEvaluationRun({tenantId,runId:imported.runId},{pool:worker,lumaIngest:transport});
  const oldId=((await service.getRun({tenantId,runId:imported.runId}))!.result as {editionId:string}).editionId;
  const before=await readEditionDossier(app,tenantId,oldId,NOW);const oldAudience=before!.claims.find(c=>c.revisions.at(-1)?.attribute==='audience')!;
  const enriched=await accept(url);await processEvaluationRun(enriched,{pool:worker,lumaIngest:transport});assert.equal(backgroundResult((await service.getRun(enriched))?.result)?.editionId,oldId);
  const after=await readEditionDossier(app,tenantId,oldId,NOW);const audiences=after!.claims.filter(c=>c.revisions.at(-1)?.attribute==='audience');assert.equal(audiences.length,1);assert.equal(audiences[0].claimId,oldAudience.claimId);assert.equal(audiences[0].revisions.at(-1)?.previousRevisionId,oldAudience.revisions.at(-1)?.id);
  const nextYear=await accept(url);await processEvaluationRun(nextYear,{pool:worker,lumaIngest:{...transport,forceRefresh:true,fetchImpl:fixtureFetch({[url]:html.replace('2026-10-12','2027-10-12')})}});assert.notEqual(backgroundResult((await service.getRun(nextYear))?.result)?.editionId,oldId);
 });
});
