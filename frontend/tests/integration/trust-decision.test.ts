import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import pg from 'pg';
import type { ClaimRevision } from '../../lib/contracts/evaluation.ts';
import { parseCampaignDraft, parseClaimRevision } from '../../lib/contracts/evaluation-validation.ts';
import { runMigrations } from '../../lib/server/db/migrate.ts';
import { closePools, getAppPool } from '../../lib/server/db/pool.ts';
import { loadCuratedCatalog } from '../../lib/server/catalog/store.ts';
import { parseCurationManifest, type CurationManifest } from '../../lib/server/catalog/manifest.ts';
import { createEvaluationService } from '../../lib/server/evaluations/service.ts';
import { processEvaluationRun } from '../../lib/server/evaluations/run-worker.ts';
import { stopEvaluationQueue } from '../../lib/server/evaluations/queue.ts';
import type { ComparisonRunResult } from '../../lib/server/evaluations/compare.ts';
import { saveDecision, readDecision, reviseDecision } from '../../lib/server/decisions/store.ts';
import { researchSfOrganizers } from '../../lib/server/evaluations/research.ts';
import { projectCampaignDraft, projectComparisonResult } from '../../lib/api/opportunity-adapter.ts';
import { now, profile, baseClaims, dossier } from '../fixtures/trust.ts';

// Ejecutar con las URLs de un cluster de verificación. Nunca usa defaults
// que puedan apuntar silenciosamente a la base del usuario.
test('DP-02: comparación → guardado → lectura con incertidumbre y confirmed (PostgreSQL real)', async t => {
 if (!process.env.GROWTHX_ADMIN_DATABASE_URL) { t.skip('Requiere URLs explícitas de PostgreSQL aislado'); return; }
 const admin=new pg.Client({connectionString:process.env.GROWTHX_ADMIN_DATABASE_URL});
 await admin.connect();
 const worker=new pg.Pool({connectionString:process.env.GROWTHX_WORKER_DATABASE_URL});
 t.after(async()=>{ await stopEvaluationQueue(); await closePools(); await worker.end(); await admin.end(); });
 await runMigrations();
 const tenantId=randomUUID(), userId=randomUUID(), decoy=randomUUID();
 await admin.query('insert into growthx.tenants (id,slug,display_name) values ($1,$2,$3),($4,$5,$6)',[tenantId,`dp02-${tenantId}`,'DP02 synthetic',decoy,`dp02-${decoy}`,'Decoy']);
 await admin.query('insert into growthx.app_users (id,email,display_name) values ($1,$2,$3)',[userId,`${userId}@test.local`,'DP02']);
 await admin.query('insert into growthx.memberships (tenant_id,user_id) values ($1,$2)',[tenantId,userId]);
 const app=getAppPool();
 const states=['observed','inferred','contradicted','pending'] as const;
 const manifest:CurationManifest={
  manifestVersion:'1',name:'DP02 synthetic regression',material:'synthetic',authorizedBy:'test',verifiedAt:now,note:'Controlled cases; no provider research',
  sources:dossier().sources,companies:[],participations:[],
  organizers:[{contractVersion:'1',id:'o-r1',organizerId:'o',displayName:'Synthetic DP02',aliases:[],claimRevisionIds:[],revisedAt:now,previousRevisionId:null}],
  editions:states.map(status=>({...dossier().editionRevisions[0],editionId:`e-${status}`,id:`er-${status}`,organizerIds:['o'],claimRevisionIds:[]})),
  claims:states.flatMap(status=>baseClaims.map(c=>({
   ...c,id:`${c.id}-${status}`,claimId:`${c.claimId}-${status}`,subject:{type:'edition' as const,editionId:`e-${status}`},
   ...(c.attribute.startsWith('cost:')?{status,note:status==='contradicted'?'Cotización disputada':status==='inferred'?'Estimación por antecedente':null,
    method:status==='inferred'?'historical_estimate':c.method,
    ...(status==='inferred'?{costComposition:{kind:'alternative' as const,groupId:'sponsorship',optionId:'workshop'}}:{}),
    ...(status==='pending'?{value:{kind:'pending' as const,note:'Precio no publicado'},sourceIds:[]}:{}),
   }:{}),
   ...(status==='pending' && ['audience','access'].includes(c.attribute)?{status:'pending' as const,value:{kind:'pending' as const,note:'Por confirmar'},sourceIds:[]}:{}),
  }))),
 };
 for(const e of manifest.editions) e.claimRevisionIds=manifest.claims.filter(c=>c.subject.type==='edition'&&c.subject.editionId===e.editionId).map(c=>c.id);
 const parsed=parseCurationManifest(manifest);
 assert.ok(parsed.ok,JSON.stringify(parsed));
 assert.equal((await loadCuratedCatalog(app,tenantId,parsed.manifest)).status,'loaded');
 const service=createEvaluationService({now:()=>new Date(now)});
 const prior=await service.accept({tenantId,userId,body:{idempotencyKey:randomUUID(),mode:'catalog_research',researchScope:'sf_organizers',profile:{product:profile.product,audienceDescription:profile.audience.description,audienceProfiles:[],stack:['Python'],budget:profile.budget,window:{from:'2026-10-01',to:'2026-10-01'},objective:{kind:'adoption'}}}});
 assert.equal(prior.status,'accepted');
 if(prior.status!=='accepted') return;
 const cancel=async(runId:string)=>admin.query("update pgboss.job set state='cancelled' where singleton_key=$1 and state in ('created','retry')",[runId]);
 await cancel(prior.runId);
 const runComparison=async(editionIds:string[])=>{
  const accepted=await service.accept({tenantId,userId,body:{idempotencyKey:randomUUID(),mode:'investment_comparison',profileRunId:prior.runId,editionIds}});
  assert.equal(accepted.status,'accepted'); if(accepted.status!=='accepted') throw Error('comparison rejected');
  await cancel(accepted.runId);
  await processEvaluationRun({runId:accepted.runId,tenantId},{pool:worker,comparison:{evaluationInstant:now,policyProvider:()=>null,v0Reference:async()=>null,narrative:{apiKey:null}}});
  const run=await service.getRun({tenantId,runId:accepted.runId});
  assert.equal(run?.state,'completed'); return run!.result as ComparisonRunResult;
 };
 for(const ids of [['e-observed','e-inferred','e-contradicted'],['e-pending']]) {
  const result=await runComparison(ids);
  const projected=projectComparisonResult(result,{readAt:now});
  for(const editionId of ids) {
   const expected=editionId.slice(2);
   const candidate=projected.candidates.find(c=>c.editionId===editionId)!;
   assert.equal(candidate.dossier.eligibility.status,expected==='observed'?'eligible':'conditional');
   const body={idempotencyKey:randomUUID(),snapshotId:result.snapshotId,editionId,verdict:'chosen' as const,reasons:['Explorar sujeto a condiciones'],conditions:[],campaignDraft:null};
   const saved=await saveDecision(app,{tenantId,userId},body);
   assert.equal(saved.status,'saved',JSON.stringify(saved)); if(saved.status!=='saved') throw Error('save failed');
   const stored=await readDecision(app,tenantId,saved.read.decisionId);
   assert.deepEqual(stored,saved.read);
   assert.ok(stored?.campaign); assert.ok(parseCampaignDraft(stored.campaign).ok);
   const item=stored.campaign.costItems[0];
   assert.equal(item.amount.status,expected==='observed'?'quoted':expected==='pending'?'unknown':expected);
   assert.equal(item.evidence?.status,expected);
   if(expected==='inferred'||expected==='contradicted') {
    const promoted=structuredClone(stored.campaign);
    promoted.costItems[0].amount={status:'quoted',amount:3000,currency:'USD',sourceIds:['s']};
    assert.equal(parseCampaignDraft(promoted).ok,false,'el parser también rechaza la promoción');
   }
   if(expected==='inferred') assert.deepEqual(item.evidence?.costComposition,{kind:'alternative',groupId:'sponsorship',optionId:'workshop'});
   t.diagnostic(`${editionId}: comparación ${candidate.dossier.eligibility.status}; campaña ${item.amount.status}; revisión y fuentes conservadas; lectura idéntica`);
   const campaign=projectCampaignDraft(stored.campaign,result.bundle.sources);
   if(expected!=='observed') {
    assert.equal(campaign.costCompleteness,'has_unknown_items');
    assert.ok(stored.decision.conditions.some(c=>/costo/i.test(c.description)));
    if(item.amount.status==='inferred'||item.amount.status==='contradicted') {
     assert.equal(item.amount.basis,item.evidence?.method);
     assert.equal(item.amount.note,item.evidence?.note);
     assert.deepEqual(item.amount.sourceIds,['s']);
     assert.match(JSON.stringify(campaign.costItems),/no es cotización/);
    }
   }
   if(expected==='pending') {
    assert.equal(candidate.dossier.costs[0].value.state,'pending');
    assert.equal(campaign.costItems[0].value.state,'pending');
    for(const topic of ['audiencia','acceso','costo']) assert.ok(stored.decision.conditions.some(c=>c.description.toLowerCase().includes(topic)));
    assert.ok(campaign.openQuestions.some(q=>/audiencia/i.test(q)));
   }
   const retry=await saveDecision(app,{tenantId,userId},body);
   assert.equal(retry.status,'saved'); if(retry.status==='saved') assert.equal(retry.deduplicated,true);
   assert.equal(await readDecision(app,decoy,stored.decisionId),null);
   const foreign=await saveDecision(app,{tenantId:decoy,userId},body); assert.equal(foreign.status,'snapshot_not_found');
   const revised=await reviseDecision(app,{tenantId,userId},stored.decisionId,{idempotencyKey:randomUUID(),expectedRevision:1,verdict:null,reasons:['Motivo actualizado'],addConditions:[],resolveConditions:[],campaignDraft:null});
   assert.equal(revised.status,'revised'); if(revised.status==='revised') assert.deepEqual(revised.read.campaign?.costItems,stored.campaign.costItems);
  }
 }
 const pendingRun=await runComparison(['e-pending']);
 const pendingDecision=await saveDecision(app,{tenantId,userId},{idempotencyKey:randomUUID(),snapshotId:pendingRun.snapshotId,editionId:'e-pending',verdict:'pending',reasons:['Esperar respuesta'],conditions:[],campaignDraft:null});
 assert.equal(pendingDecision.status,'saved');
 if(pendingDecision.status==='saved') {
  assert.equal(pendingDecision.read.campaign,null);
  for(const topic of ['audiencia','acceso','costo']) assert.ok(pendingDecision.read.decision.conditions.some(c=>c.description.toLowerCase().includes(topic)));
 }
 const before=await researchSfOrganizers(app,tenantId,profile,now);
 assert.equal(before.candidates.length,1);
 assert.ok(before.candidates[0].futureSfEditionIds.includes('e-observed'));
 const updated:ClaimRevision[]=manifest.claims.filter(c=>c.subject.type==='edition'&&c.subject.editionId==='e-observed').map(c=>({...c,id:`${c.id}-r2`,previousRevisionId:c.id,status:'confirmed',reviewer:'Human test reviewer'}));
 updated.forEach(c=>assert.ok(parseClaimRevision(c).ok));
 const oldEdition=manifest.editions[0];
 const amendment:CurationManifest={...manifest,name:'DP02 strengthened',claims:updated,editions:[{...oldEdition,id:`${oldEdition.id}-r2`,previousRevisionId:oldEdition.id,claimRevisionIds:updated.map(c=>c.id)}],organizers:[]};
 const amended=parseCurationManifest(amendment); assert.ok(amended.ok,JSON.stringify(amended));
 assert.equal((await loadCuratedCatalog(app,tenantId,amended.manifest)).status,'loaded');
 const after=await researchSfOrganizers(app,tenantId,profile,now);
 assert.equal(after.candidates.length,before.candidates.length);
 assert.deepEqual(after.candidates[0].futureSfEditionIds,before.candidates[0].futureSfEditionIds);
 assert.ok(after.candidates[0].reasons.some(r=>r.text.includes('confirmed')));
 t.diagnostic('Fortalecer a confirmed: mismo organizador y mismas ediciones futuras; razones usan las revisiones confirmadas');
});
