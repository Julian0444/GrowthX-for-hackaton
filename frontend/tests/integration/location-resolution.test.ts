import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {ComparisonRunResult} from '../../lib/api/atlas-client.ts';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {runMigrations} from '../../lib/server/db/migrate.ts';
import {withTenantTransaction} from '../../lib/server/db/pool.ts';
import {createEvaluationService} from '../../lib/server/evaluations/service.ts';
import {readEditionDossier,listCatalogEditions} from '../../lib/server/catalog/read.ts';
import {fetchLumaEvent,persistLumaDossier} from '../../lib/server/catalog/luma-adapter.ts';
import {resolveEditionLocation} from '../../lib/server/geocoding/resolve.ts';
import {cachedGeocode} from '../../lib/server/geocoding/cache.ts';
import {censusGeocoder,GeocodingError,type Geocoder} from '../../lib/server/geocoding/census.ts';
import {projectEditionDossierView,snapshotEditionDossiers} from '../../lib/api/opportunity-adapter.ts';
import {projectEditionPosition} from '../../lib/research/edition-location.ts';
import {processEvaluationRun} from '../../lib/server/evaluations/run-worker.ts';
import {briefBody} from '../fixtures/research-brief.ts';
import {geoInput,locationHtml,censusResponse} from '../fixtures/location-resolution.ts';
import {seedSession} from '../support/source-browser.ts';

test('DP-08 durable location evidence and current consumers',{timeout:90000},async t=>{
  assert.ok(process.env.GROWTHX_ADMIN_DATABASE_URL && !process.env.GROWTHX_ADMIN_DATABASE_URL.includes(':54329/'),'Explicit isolated DB required; shared localhost:54329 is prohibited');
  const admin=new pg.Client({connectionString:process.env.GROWTHX_ADMIN_DATABASE_URL});await admin.connect();await runMigrations();
  const app=new pg.Pool({connectionString:process.env.GROWTHX_DATABASE_URL}),worker=new pg.Pool({connectionString:process.env.GROWTHX_WORKER_DATABASE_URL,max:6});
  t.after(async()=>{await app.end();await worker.end();await admin.end();});
  const session=await seedSession(admin),decoy=await seedSession(admin);
  const service=createEvaluationService({pool:app,queue:{async sendRunJob(){}}});
  const base=await service.accept({...session,body:{...briefBody(),idempotencyKey:randomUUID()}});assert.equal(base.status,'accepted');if(base.status!=='accepted')throw Error('base');
  const accept=async(url='https://lu.ma/dp08-location')=>{const r=await service.acceptEventIngest({...session,body:{url,profileRunId:base.runId,idempotencyKey:randomUUID()}});if(r.status!=='accepted')throw Error(JSON.stringify(r));return {pool:worker,tenantId:session.tenantId,runId:r.runId};};
  const allowance=()=>admin.query('update growthx.location_allowance set starts=0,last_start=null');
  let calls=0;const provider=censusGeocoder(async()=>{calls++;return Response.json(censusResponse());});
  const fetchOutput=await fetchLumaEvent('https://lu.ma/dp08-location',{isFixture:true,fetchImpl:async()=>new Response(locationHtml())});
  await allowance();
  const firstJob=await accept();const first=await persistLumaDossier(worker,session.tenantId,firstJob.runId,fetchOutput,provider);
  const read=await readEditionDossier(app,session.tenantId,first.editionId,new Date().toISOString());assert.ok(read);
  const firstEdition=read.editionRevisions.at(-1)!;const view=projectEditionDossierView(read);
  await t.test('complete address persists query, provider, interpolated accuracy, date, original claims and UI point',()=>{
    assert.equal(calls,1);assert.equal(view.publicLocation.method,'geocoded');assert.equal(view.publicLocation.status,'announced');assert.equal(view.publicLocation.resolution?.outcome,'resolved');assert.equal(view.publicLocation.resolution?.accuracy,'interpolated');assert.equal(view.publicLocation.resolution?.countyGeoid,'06075');assert.ok(view.publicLocation.resolution?.claimRevisionIds.includes(`luma-${firstJob.runId}-address`));assert.ok(view.mapPoint);assert.equal(read.sources.find(s=>s.provider==='us-census')?.method,'address_geocoding');
  });
  await t.test('replay after commit and new DB connection keep ids and avoid another call',async()=>{
    assert.deepEqual(await persistLumaDossier(worker,session.tenantId,firstJob.runId,fetchOutput,provider),first);assert.equal(calls,1);
    const fresh=new pg.Pool({connectionString:process.env.GROWTHX_DATABASE_URL});try{assert.deepEqual(await readEditionDossier(fresh,session.tenantId,first.editionId,read.evaluatedAt),read);}finally{await fresh.end();}
  });
  await t.test('same normalized query/source version cache survives independent run, while new source version makes a request',async()=>{
    const job=await accept();const l=geoInput().edition.publicLocation!;
    await allowance();let count=0;const p=censusGeocoder(async()=>{count++;return Response.json(censusResponse());});
    const a=await cachedGeocode(job,p,'501 Folsom Street, San Francisco, CA','source-v1',l);
    const b=await cachedGeocode(await accept(),p,'501 FOLSOM ST San Francisco CA','source-v1',l);assert.equal(a.cache,'miss');assert.equal(b.cache,'hit');assert.equal(count,1);
    await allowance();await cachedGeocode(await accept(),p,'501 FOLSOM ST San Francisco CA','source-v2',l);assert.equal(count,2);
  });
  await t.test('new address creates a revision; saved snapshot consumers retain original position and source',async()=>{
    // Read bundles are frozen on the revision selected by an official comparison.
    const compare=await service.accept({...session,body:{mode:'investment_comparison',profileRunId:base.runId,editionIds:[first.editionId],idempotencyKey:randomUUID()}});
    assert.equal(compare.status,'accepted');if(compare.status!=='accepted')throw Error(JSON.stringify(compare));
    await processEvaluationRun({tenantId:session.tenantId,runId:compare.runId},{pool:worker});
    const before=await service.getRun({tenantId:session.tenantId,runId:compare.runId});assert.ok((before?.result as ComparisonRunResult)?.bundle);
    const updated=await fetchLumaEvent('https://lu.ma/dp08-location',{isFixture:true,fetchImpl:async()=>new Response(locationHtml({street:'599 Folsom St'}))});
    const changed:Geocoder={id:'controlled-census',version:'v1',supportsStreet:false,async lookup(){return [{coordinates:{lat:37.7878,lng:-122.395},precision:'address',accuracy:'interpolated',matchedAddress:'599 FOLSOM ST',countyGeoid:'06075'}];}};
    await allowance();const secondJob=await accept();const second=await persistLumaDossier(worker,session.tenantId,secondJob.runId,updated,changed);assert.notEqual(second.editionRevisionId,first.editionRevisionId);
    const after=await service.getRun({tenantId:session.tenantId,runId:compare.runId});assert.deepEqual(after?.result,before?.result);
    const historical=snapshotEditionDossiers((after!.result as ComparisonRunResult).bundle);assert.equal(historical[0].editionRevisions[0].id,first.editionRevisionId);assert.deepEqual(historical[0].editionRevisions[0].coordinates,firstEdition.coordinates);
    assert.deepEqual(projectEditionPosition(firstEdition,read.sources,read.claims.map(c=>c.revisions.at(-1)!)).mapPoint?.geojson.coordinates,[-122.3944,37.7872]);
  });
  await t.test('published source coordinates make zero geocoder calls; city, hidden, street and invalid coordinates stay in list',async()=>{
    const cases=[['source',{coordinates:{latitude:37.7872,longitude:-122.3944}},true],['city',{street:null},false],['street',{street:'Folsom St'},false],['hidden',{hidden:true},false],['invalid',{coordinates:{latitude:-122.4,longitude:37.78}},false]] as const;
    for(const [slug,options,point] of cases){await allowance();let invoked=0;const p:Geocoder={...provider,async lookup(){invoked++;throw Error('must not call');}};const url=`https://lu.ma/dp08-${slug}`;const job=await accept(url);const output=await fetchLumaEvent(url,{isFixture:true,fetchImpl:async()=>new Response(locationHtml(options))});const result=await persistLumaDossier(worker,session.tenantId,job.runId,output,p);const dossier=await readEditionDossier(app,session.tenantId,result.editionId,new Date().toISOString());assert.ok(dossier);assert.equal(Boolean(projectEditionDossierView(dossier).mapPoint),point,slug);assert.equal(invoked,0,slug);if(!point)assert.ok(projectEditionDossierView(dossier).withoutPointReason);}
    assert.ok((await listCatalogEditions(app,session.tenantId,new Date().toISOString())).editions.some(e=>e.editionId==='luma-dp08-city'));
  });
  await t.test('provider failure is persisted and replayed; the existing worker still completes the research run',async()=>{
    const url='https://lu.ma/dp08-failed',job=await accept(url);const output=await fetchLumaEvent(url,{isFixture:true,fetchImpl:async()=>new Response(locationHtml())});let count=0;
    await allowance();const failure:Geocoder={...provider,async lookup(){count++;throw new GeocodingError('provider_http','Geocodificador no disponible (HTTP 503).');}};
    const result=await persistLumaDossier(worker,session.tenantId,job.runId,output,failure);assert.equal(count,1);
    const dossier=await readEditionDossier(app,session.tenantId,result.editionId,new Date().toISOString());assert.ok(dossier);assert.match(projectEditionDossierView(dossier).withoutPointReason!,/503/);assert.equal(projectEditionDossierView(dossier).mapPoint,null);
    await processEvaluationRun(job,{pool:worker,lumaIngest:{isFixture:true,fetchImpl:async()=>new Response(locationHtml())}});assert.equal((await service.getRun(job))?.state,'completed');assert.equal(count,1);
  });
  await t.test('street-capable adapter represents one match only as approximate; multiple matches stay pending',async()=>{
    for(const n of [1,2]){await allowance();const url=`https://lu.ma/dp08-street-${n}`,job=await accept(url);const output=await fetchLumaEvent(url,{isFixture:true,fetchImpl:async()=>new Response(locationHtml({street:'Folsom St'}))});const p:Geocoder={id:`controlled-street-${n}`,version:'v1',supportsStreet:true,async lookup(){return Array.from({length:n},()=>({coordinates:{lat:37.7872,lng:-122.3944},precision:'street',accuracy:'unknown',matchedAddress:'Folsom St',countyGeoid:'06075'}));}};const result=await persistLumaDossier(worker,session.tenantId,job.runId,output,p);const dossier=await readEditionDossier(app,session.tenantId,result.editionId,new Date().toISOString());assert.ok(dossier);const e=dossier.editionRevisions.at(-1)!;const pnt=projectEditionPosition(e,dossier.sources,dossier.claims.map(c=>c.revisions.at(-1)!));assert.equal(Boolean(pnt.mapPoint),n===1);if(n===1)assert.equal(pnt.mapPoint?.approximate,true);}
  });
  await t.test('tenant isolation, aggregate allowance and crash reservation prevent leaks or duplicate starts',async()=>{
    assert.equal(await readEditionDossier(app,decoy.tenantId,first.editionId,new Date().toISOString()),null);
    await assert.rejects(resolveEditionLocation(worker,decoy.tenantId,firstJob.runId,first,provider),/tenant/);
    await withTenantTransaction(app,decoy.tenantId,async c=>assert.equal((await c.query('select * from growthx.location_lookups')).rowCount,0));
    await assert.rejects(withTenantTransaction(app,session.tenantId,c=>c.query('select growthx.reserve_location_lookup($1)',[firstJob.runId])),/permission denied/);
    await admin.query('update growthx.location_allowance set starts=29,last_start=null');
    const otherBase=await service.accept({...decoy,body:{...briefBody(),idempotencyKey:randomUUID()}});if(otherBase.status!=='accepted')throw Error('other');
    const r=await Promise.all([firstJob,{pool:worker,tenantId:decoy.tenantId,runId:otherBase.runId}].map(j=>withTenantTransaction(worker,j.tenantId,c=>c.query('select growthx.reserve_location_lookup($1) as ok',[j.runId]))));assert.equal(r.filter(v=>v.rows[0].ok).length,1);
    await allowance();const job=await accept();let invoked=0;const p:Geocoder={...provider,id:'controlled-crash',async lookup(){invoked++;return [];}};
    await cachedGeocode(job,p,'501 Folsom St','crash-source',geoInput().edition.publicLocation!);
    await admin.query("update growthx.location_lookups set state='started',output=null where run_id=$1",[job.runId]);
    const retry=await cachedGeocode(job,p,'501 Folsom St','crash-source',geoInput().edition.publicLocation!);assert.equal(retry.failureCode,'uncertain');assert.equal(invoked,1);
  });
});
