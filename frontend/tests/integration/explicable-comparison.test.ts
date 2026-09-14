import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import pg from 'pg';
import {runMigrations} from '../../lib/server/db/migrate.ts';
import {loadCuratedCatalog} from '../../lib/server/catalog/store.ts';
import {readEditionDossier} from '../../lib/server/catalog/read.ts';
import {withTenantTransaction} from '../../lib/server/db/pool.ts';
import {createEvaluationService} from '../../lib/server/evaluations/service.ts';
import {parseEvaluationStartBody,comparisonPayloadHash} from '../../lib/server/evaluations/wire.ts';
import {processEvaluationRun} from '../../lib/server/evaluations/run-worker.ts';
import {buildComparisonResult,runEvaluateCandidatesStep} from '../../lib/server/evaluations/compare.ts';
import {readSnapshotByRun} from '../../lib/server/evaluations/snapshot-store.ts';
import {composeSnapshotNarrative} from '../../lib/server/evaluations/model-adapter.ts';
import {parseEvaluationSnapshot} from '../../lib/contracts/evaluation-validation.ts';
import {comparisonFixture} from '../fixtures/comparison.ts';
import {briefBody} from '../fixtures/research-brief.ts';
import {NOW} from '../fixtures/relationships.ts';
import {seedSession} from '../support/source-browser.ts';

test('DP07 persisted comparison, revised brief, immutable antecedents and model authority',{timeout:90000},async t=>{
 assert.ok(process.env.GROWTHX_ADMIN_DATABASE_URL&&!process.env.GROWTHX_ADMIN_DATABASE_URL.includes(':54329/'),'Isolated DB required');
 await runMigrations();const admin=new pg.Client({connectionString:process.env.GROWTHX_ADMIN_DATABASE_URL});await admin.connect();
 const app=new pg.Pool({connectionString:process.env.GROWTHX_DATABASE_URL}),worker=new pg.Pool({connectionString:process.env.GROWTHX_WORKER_DATABASE_URL});t.after(async()=>{await app.end();await worker.end();await admin.end();});
 const session=await seedSession(admin),foreign=await seedSession(admin),fixture=comparisonFixture();await loadCuratedCatalog(app,session.tenantId,fixture.manifest);
 const service=createEvaluationService({pool:app,queue:{async sendRunJob(){}}});const base=await service.accept({...session,body:{...briefBody(),idempotencyKey:randomUUID()}});if(base.status!=='accepted')throw Error('base profile');
 const body={mode:'investment_comparison' as const,profileRunId:base.runId,editionIds:[fixture.ait.editionId,fixture.vultr.editionId],idempotencyKey:randomUUID()};
 const accepted=await service.accept({...session,body});if(accepted.status!=='accepted')throw Error(JSON.stringify(accepted));const ctx={tenantId:session.tenantId,runId:accepted.runId};
 await processEvaluationRun(ctx,{pool:worker,comparison:{evaluationInstant:NOW,narrative:{apiKey:null}}});const original=await buildComparisonResult(app,session.tenantId,accepted.runId);const frozen=structuredClone(original.bundle);
 await t.test('snapshot fixes selected and historical edition, relationship, claim and source revisions',async()=>{
   assert.ok(original.bundle.editions.length>2);assert.equal(original.bundle.snapshot.decisionReading?.priority.kind,'investigate_first');assert.equal(original.bundle.profile.profileVersion,1);assert.equal(original.narrative?.status,'deterministic_only');
   assert.ok(original.bundle.snapshot.sourceIds?.length);assert.ok(original.bundle.snapshot.editionRevisionIds.some(id=>fixture.dossiers.some(d=>d.validity.validity==='past'&&d.editionRevisions[0].id===id)));
   assert.equal(parseEvaluationSnapshot(original.bundle.snapshot).ok,true);
   const bad=structuredClone(original.bundle.snapshot);bad.decisionReading!.alternatives.find(a=>a.relevance.basis.length)!.relevance.basis[0].claimRevisionIds.push('foreign');assert.equal(parseEvaluationSnapshot(bad).ok,false);
   const old=structuredClone(original.bundle.snapshot);delete old.decisionReading;delete old.sourceIds;assert.equal(parseEvaluationSnapshot(old).ok,true,'legacy snapshots remain readable');
   assert.equal((await runEvaluateCandidatesStep(worker,session.tenantId,ctx.runId,original.bundle.profile,body.editionIds)).persisted,'already_persisted');
 });
 await t.test('new brief is validated, versioned and changes explanation, constraints, objective and question',async()=>{
   const profile={...briefBody().profile,product:'Pagos para comercios',audienceDescription:'Equipos de pagos',stack:[],objective:{kind:'hiring' as const,confirmation:'confirmed' as const},restrictions:['Solo contactos con opt-in'],budget:{status:'declared' as const,amount:200,currency:'EUR'},window:{from:'2026-09-20',to:'2026-10-30'}};
   const next={...body,profile,profileRunId:ctx.runId,previousRunId:ctx.runId,idempotencyKey:randomUUID()};assert.ok(parseEvaluationStartBody(next).ok);assert.notEqual(comparisonPayloadHash(next),comparisonPayloadHash({...next,profile:briefBody().profile}));
   assert.equal(parseEvaluationStartBody({...next,profile:{...profile,tenantId:'foreign'}}).ok,false);
   const revised=await service.accept({...session,body:next});if(revised.status!=='accepted')throw Error(JSON.stringify(revised));assert.equal((await service.accept({...session,body:next})).status,'duplicate');
   await processEvaluationRun({tenantId:session.tenantId,runId:revised.runId},{pool:worker,comparison:{evaluationInstant:NOW,narrative:{apiKey:null}}});
   const result=await buildComparisonResult(app,session.tenantId,revised.runId);assert.equal(result.bundle.profile.profileVersion,2);assert.notEqual(result.bundle.profile.id,original.bundle.profile.id);
   assert.equal(result.bundle.snapshot.decisionReading?.priority.kind,'insufficient');assert.ok(result.bundle.snapshot.decisionReading!.differences!.briefChanges.some(c=>c.field==='budget'));
   assert.ok(result.bundle.snapshot.alternatives.some(a=>a.eligibility.status==='excluded'));assert.match(JSON.stringify(result.bundle.snapshot.decisionReading),/Pagos para comercios/);assert.match(JSON.stringify(result.bundle.snapshot.alternatives),/opt-in/);
   assert.deepEqual((await buildComparisonResult(app,session.tenantId,ctx.runId)).bundle,frozen);
 });
 await t.test('new catalog revision does not change the original dossier, historical organizer, sources or decisions',async()=>{
   const history=fixture.dossiers.find(d=>d.validity.validity==='past')!;const revised=structuredClone(history.editionRevisions[0]);revised.id=randomUUID();revised.previousRevisionId=history.editionRevisions[0].id;revised.name='Changed current history';revised.revisedAt='2026-09-11T00:00:00Z';
   await withTenantTransaction(worker,session.tenantId,async c=>{const row=(await c.query('select load_id from growthx.edition_revisions where id=$1',[revised.previousRevisionId])).rows[0];await c.query('insert into growthx.edition_revisions(id,tenant_id,edition_id,load_id,contract_version,payload,revised_at,previous_revision_id) values($1,$2,$3,$4,\'1\',$5,$6,$7)',[revised.id,session.tenantId,revised.editionId,row.load_id,JSON.stringify(revised),revised.revisedAt,revised.previousRevisionId]);});
   assert.equal((await readEditionDossier(app,session.tenantId,history.editionId,NOW))!.editionRevisions.at(-1)!.name,'Changed current history');assert.deepEqual((await buildComparisonResult(app,session.tenantId,ctx.runId)).bundle,frozen);
 });
 await t.test('foreign tenant cannot read snapshot or select editions/profiles; invalid references roll back',async()=>{
   assert.equal(await readSnapshotByRun(app,foreign.tenantId,ctx.runId),null);assert.equal((await service.accept({...foreign,body:{...body,idempotencyKey:randomUUID()}})).status,'invalid_profile');
   assert.equal((await service.accept({...session,body:{...body,editionIds:['foreign'],idempotencyKey:randomUUID()}})).status,'invalid_profile');
   assert.equal((await service.accept({...session,body:{...body,profile:{...briefBody().profile,comparableCompanies:[{companyId:'foreign',name:'Other tenant',relation:'comparable',confirmation:'confirmed'}]},idempotencyKey:randomUUID()}})).status,'invalid_profile');
 });
 await t.test('model cannot create prices or success from historical years, change priority, or cite another edition',async()=>{
   const snap=original.bundle.snapshot,reading=snap.decisionReading!.alternatives.find(a=>a.editionId===fixture.ait.editionId)!;
   const validId=reading.relevance.basis.flatMap(b=>b.claimRevisionIds).find(id=>original.bundle.claims.find(c=>c.id===id)?.attribute.startsWith('program:'))!;assert.ok(validId);
   let prompt='';const model=async(summary:string,ids:string[])=>composeSnapshotNarrative({snapshot:snap,claims:original.bundle.claims},{apiKey:'controlled',transport:async(_url,init)=>{prompt=String(init?.body);return Response.json({candidates:[{content:{parts:[{text:JSON.stringify({ranking:['fake'],proposals:[{editionId:fixture.ait.editionId,summary,selectedClaimRevisionIds:ids,score:100,eligibility:'eligible'}]})}]}}]});}});
   const output=await model('Guaranteed sales and free sponsorship',[validId]);assert.equal(output.status,'validated');assert.ok(!output.proposals[0].summary.includes('Guaranteed'));assert.ok(output.discarded?.attemptedScores);assert.match(prompt,/Activities marked proposed/);assert.match(output.proposals[0].summary,/Historical edition/);
   assert.equal((await model('price 999999 USD and 99 percent success',[validId])).proposals[0].withheldNote!==null,true);
   assert.equal((await model('Invented',['missing'])).status,'rejected');
   const foreignClaim=original.bundle.claims.find(c=>c.subject.type==='edition'&&c.subject.editionId===fixture.vultr.editionId&&c.attribute==='date')!;
   assert.equal((await model('Wrong citation',[foreignClaim.id])).status,'rejected');
   const fail=await composeSnapshotNarrative({snapshot:snap,claims:original.bundle.claims},{apiKey:'controlled',transport:async()=>{throw Error('offline');}});assert.equal(fail.status,'deterministic_only');assert.deepEqual(snap,frozen.snapshot);
 });
});
