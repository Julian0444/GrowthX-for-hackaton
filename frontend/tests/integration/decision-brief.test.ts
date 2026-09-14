import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import pg from 'pg';
import {withTenantTransaction} from '../../lib/server/db/pool.ts';
import {readSnapshotSourceIds} from '../../lib/server/evaluations/snapshot-store.ts';
import {runMigrations} from '../../lib/server/db/migrate.ts';
import {loadCuratedCatalog} from '../../lib/server/catalog/store.ts';
import {createEvaluationService} from '../../lib/server/evaluations/service.ts';
import {processEvaluationRun} from '../../lib/server/evaluations/run-worker.ts';
import {buildComparisonResult} from '../../lib/server/evaluations/compare.ts';
import {saveDecision,reviseDecision,readDecision} from '../../lib/server/decisions/store.ts';
import {parseDecisionSaveBody,parseDecisionReviseBody} from '../../lib/server/decisions/wire.ts';
import {parseCampaignDraft,parseEvaluationDecision} from '../../lib/contracts/evaluation-validation.ts';
import {composeDecisionBrief} from '../../lib/research/decision-brief.ts';
import {comparisonFixture} from '../fixtures/comparison.ts';
import {briefBody} from '../fixtures/research-brief.ts';
import {NOW} from '../fixtures/relationships.ts';
import {seedSession} from '../support/source-browser.ts';
import type {DecisionSaveBody,DecisionReviseBody} from '../../lib/contracts/decision.ts';

test('DP11 durable actionable decision, exact revision and concurrency',{timeout:90000},async t=>{
 assert.ok(/:554(?:61|72)\//.test(process.env.GROWTHX_ADMIN_DATABASE_URL ?? ''),'Owned DP11/DP12 isolated DB required');
 await runMigrations();const admin=new pg.Client({connectionString:process.env.GROWTHX_ADMIN_DATABASE_URL});await admin.connect();
 const app=new pg.Pool({connectionString:process.env.GROWTHX_DATABASE_URL}),worker=new pg.Pool({connectionString:process.env.GROWTHX_WORKER_DATABASE_URL});
 t.after(async()=>{await app.end();await worker.end();await admin.end()});
 const session=await seedSession(admin),foreign=await seedSession(admin),fixture=comparisonFixture();await loadCuratedCatalog(app,session.tenantId,fixture.manifest);
 const service=createEvaluationService({pool:app,queue:{async sendRunJob(){}}});
 const base=await service.accept({...session,body:{...briefBody(),idempotencyKey:randomUUID()}});if(base.status!=='accepted')throw Error('profile');
 async function comparison(){const accepted=await service.accept({...session,body:{mode:'investment_comparison',profileRunId:base.runId,editionIds:[fixture.ait.editionId,fixture.vultr.editionId],idempotencyKey:randomUUID()}});if(accepted.status!=='accepted')throw Error('comparison');await processEvaluationRun({tenantId:session.tenantId,runId:accepted.runId},{pool:worker,comparison:{evaluationInstant:NOW,narrative:{apiKey:null}}});return {...await buildComparisonResult(app,session.tenantId,accepted.runId),runId:accepted.runId}}
 const original=await comparison();const frozen=structuredClone(original.bundle);
 const body:DecisionSaveBody={idempotencyKey:randomUUID(),snapshotId:original.snapshotId,editionId:fixture.ait.editionId,verdict:'pending',intent:'explore_first',reasons:['Explore monitoring workshop before spending'],conditions:[],campaignDraft:{owner:'Alex',objective:'Get feedback from agent builders',successDefinition:'Feedback on debugging',modality:{kind:'workshop',detail:'Hands-on debugging',basis:'proposed'},costItems:[{label:'Travel estimate',amount:{status:'estimated',amount:500,currency:'USD',basis:'Buyer travel estimate'}}],openQuestions:['Can we run a technical workshop?'],commitments:[]}};
 const saved=await saveDecision(app,session,body);assert.equal(saved.status,'saved');if(saved.status!=='saved')throw Error(JSON.stringify(saved));const v1=saved.read;
 const patch=(fields:Partial<DecisionReviseBody>):DecisionReviseBody=>({idempotencyKey:randomUUID(),expectedRevision:1,verdict:null,reasons:null,addConditions:[],resolveConditions:[],campaignDraft:null,...fields});
 await t.test('explore-first is pending participation with complete buyer brief; original costs and all conditions retained',async()=>{
   assert.equal(v1.decision.intent,'explore_first');assert.equal(v1.decision.verdict,'pending');assert.equal(v1.campaign?.owner,'Alex');assert.equal(v1.campaign?.modality.status,'defined');
   for(const condition of original.bundle.snapshot.alternatives.find(a=>a.editionId===body.editionId)!.conditions)assert.ok(v1.decision.conditions.some(c=>c.id===condition.id));
   assert.ok(v1.campaign!.costItems.some(c=>c.evidence));assert.equal(v1.campaign!.costItems.find(c=>c.label==='Travel estimate')!.declaration!.recordedBy,session.userId);
   assert.deepEqual(await readDecision(app,session.tenantId,v1.decisionId),v1);assert.equal((await saveDecision(app,session,body)).status,'saved');
 });
 await t.test('empty reasons, false intent, unsupported offer and foreign sources rejected atomically',async()=>{
   assert.equal(parseDecisionSaveBody({...body,reasons:[]}).ok,false);
   assert.equal(parseDecisionSaveBody({...body,decidedBy:'pretend'}).ok,false);
   assert.equal(parseDecisionSaveBody({...body,campaignDraft:{...body.campaignDraft,modality:{kind:'workshop',detail:'x',basis:'offered'}}}).ok,false);
   assert.equal(parseDecisionReviseBody({expectedRevision:1,resolveConditions:[{conditionId:'x',resolvedNote:'answer',attribution:{attributedTo:'x',support:'x',recordedBy:'pretend'}}]}).ok,false);
   assert.equal(parseEvaluationDecision({...v1.decision,verdict:'chosen'}).ok,false);
   assert.equal((await reviseDecision(app,session,v1.decisionId,patch({campaignDraft:{...body.campaignDraft!,costItems:[{label:'fake quote',amount:{status:'quoted',amount:1,currency:'USD',sourceIds:['foreign-source']}}]}}))).status,'invalid');
   assert.deepEqual(await readDecision(app,session.tenantId,v1.decisionId),v1);
 });
 let revision=1;
 await t.test('simultaneous edits have one winner, immutable original and retry-safe idempotency',async()=>{
   const a=patch({reasons:['Tab A reason']}),b=patch({reasons:['Tab B reason']});const results=await Promise.all([reviseDecision(app,session,v1.decisionId,a),reviseDecision(app,session,v1.decisionId,b)]);
   assert.equal(results.filter(r=>r.status==='revised').length,1);assert.equal(results.filter(r=>r.status==='stale_revision').length,1);
   const winningIndex=results.findIndex(r=>r.status==='revised');const retry=await reviseDecision(app,session,v1.decisionId,winningIndex===0?a:b);assert.equal(retry.status,'revised');if(retry.status==='revised')assert.equal(retry.deduplicated,true);
   assert.deepEqual(await readDecision(app,session.tenantId,v1.decisionId,1),v1);revision=2;
 });
 await t.test('resolving a condition records attribution and support, preserves snapshot and removes resolved question',async()=>{
   const condition=v1.decision.conditions[0];assert.ok(condition);
   const revised=await reviseDecision(app,session,v1.decisionId,patch({expectedRevision:revision,resolveConditions:[{conditionId:condition.id,resolvedNote:'Buyer accepts the remaining uncertainty for research only',attribution:{attributedTo:'Alex, buyer',support:'Internal planning note; no organizer confirmation',sourceIds:[]}}]}));
   assert.equal(revised.status,'revised');if(revised.status!=='revised')throw Error('resolve');revision++;
   const answer=revised.read.decision.conditions.find(c=>c.id===condition.id)!;assert.equal(answer.status,'resolved');assert.equal(answer.response?.recordedBy,session.userId);assert.match(answer.response!.support,/no organizer/);assert.ok(!revised.read.campaign!.openQuestions.includes(condition.description));
   assert.equal((await reviseDecision(app,session,v1.decisionId,patch({expectedRevision:revision,resolveConditions:[{conditionId:condition.id,resolvedNote:'again'}]}))).status,'invalid');
   assert.deepEqual((await buildComparisonResult(app,session.tenantId,original.runId)).bundle,frozen);
 });
 await t.test('revising modality/owner/costs is another transaction; attributed offer does not rewrite earlier brief',async()=>{
   const campaign={...body.campaignDraft!,owner:'Sam',modality:{kind:'workshop' as const,detail:'Received offer',basis:'offered' as const,attribution:{attributedTo:'Organizer, as reported by buyer',support:'Email quoted by buyer; not independently verified',sourceIds:[]}},costItems:[{label:'Uncertain materials',amount:{status:'contradicted',amount:250,currency:'USD',basis:'Two buyer estimates conflict',note:'Confirm amount',sourceIds:[original.bundle.sources[0].id]}}]};
   const result=await reviseDecision(app,session,v1.decisionId,patch({expectedRevision:revision,campaignDraft:campaign}));assert.equal(result.status,'revised',JSON.stringify(result));if(result.status!=='revised')throw Error('campaign');revision++;
   assert.equal(result.read.campaign!.owner,'Sam');assert.equal(result.read.campaign!.costItems.find(c=>c.label==='Uncertain materials')!.amount.status,'contradicted');assert.equal(parseCampaignDraft(result.read.campaign).ok,true);
   assert.deepEqual(await readDecision(app,session.tenantId,v1.decisionId,1),v1);
   const text=composeDecisionBrief(result.read,frozen,`http://localhost/?run=${original.runId}&decision=${v1.decisionId}&revision=${revision}`);
   for(const expected of ['Official event:','Buyer context:','Conditions and answers:','Next questions:','offer reported by buyer','contradicted','revision='])assert.ok(text.includes(expected),expected);
 });
 await t.test('chosen/discarded/pending retain reasons and inherited conditions',async()=>{
   for(const verdict of ['chosen','discarded','pending'] as const){const comparisonRun=await comparison();const out=await saveDecision(app,session,{...body,idempotencyKey:randomUUID(),snapshotId:comparisonRun.snapshotId,verdict,intent:null,campaignDraft:null});assert.equal(out.status,'saved');if(out.status==='saved'){assert.equal(out.read.decision.verdict,verdict);assert.ok(out.read.decision.conditions.length);assert.equal(!!out.read.campaign,verdict==='chosen')}}
 });
 await t.test('clearing optional brief fields persists pending instead of silently restoring old values',async()=>{
   const revised=await reviseDecision(app,session,v1.decisionId,patch({expectedRevision:revision,campaignDraft:{...body.campaignDraft!,modality:null,successDefinition:null,owner:null}}));
   assert.equal(revised.status,'revised');if(revised.status!=='revised')throw Error('clear');revision++;
   assert.equal(revised.read.campaign!.modality.status,'pending');assert.equal(revised.read.campaign!.successDefinition,null);assert.equal(revised.read.campaign!.owner,null);
   assert.deepEqual(await readDecision(app,session.tenantId,v1.decisionId,1),v1);
 });
 await t.test('legacy snapshots without explicit sourceIds keep the sources of their pinned revisions',async()=>{
   const legacy=structuredClone(frozen.snapshot);delete legacy.sourceIds;
   const ids=await withTenantTransaction(app,session.tenantId,client=>readSnapshotSourceIds(client,legacy));
   assert.deepEqual([...new Set(ids)].sort(),frozen.sources.map(s=>s.id).sort());
 });
 await t.test('tenant isolation and unknown historical revision never expose a decision or campaign',async()=>{
   assert.equal(await readDecision(app,foreign.tenantId,v1.decisionId),null);assert.equal(await readDecision(app,foreign.tenantId,v1.decisionId,1),null);assert.equal(await readDecision(app,session.tenantId,v1.decisionId,999),null);
   assert.equal((await reviseDecision(app,foreign,v1.decisionId,patch({expectedRevision:revision}))).status,'not_found');assert.equal((await saveDecision(app,foreign,{...body,idempotencyKey:randomUUID()})).status,'snapshot_not_found');
 });
});
