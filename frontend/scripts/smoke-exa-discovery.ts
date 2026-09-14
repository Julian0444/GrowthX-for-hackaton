// Opt-in ONLY: one paid Exa request against an explicitly selected test DB.
// node --env-file=.env.local scripts/smoke-exa-discovery.ts <evidence-directory>
// Set the four GROWTHX_*DATABASE_URL vars to the isolated cluster first.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, randomBytes } from 'node:crypto';
import pg from 'pg';
import { createEvaluationService } from '../lib/server/evaluations/service.ts';
import { processEvaluationRun, WorkerStopRequested } from '../lib/server/evaluations/run-worker.ts';
import { hashSessionToken } from '../lib/server/auth/session.ts';
import type { EvaluationStartBody } from '../lib/server/evaluations/wire.ts';

async function main() {
assert.ok(process.env.EXA_API_KEY, 'EXA_API_KEY required; no fallback');
assert.ok(process.env.GROWTHX_ADMIN_DATABASE_URL, 'explicit isolated admin database required');
assert.ok(process.argv[2], 'evidence directory required');
const dir=path.resolve(process.argv[2]); await mkdir(dir,{recursive:true});
const admin=new pg.Client({connectionString:process.env.GROWTHX_ADMIN_DATABASE_URL}); await admin.connect();
const app=new pg.Pool({connectionString:process.env.GROWTHX_DATABASE_URL});
const worker=new pg.Pool({connectionString:process.env.GROWTHX_WORKER_DATABASE_URL});
try {
  const tenantId=randomUUID(), userId=randomUUID();
  await admin.query('insert into growthx.tenants(id,slug,display_name) values($1::uuid,$1::text,$2)',[tenantId,'DP04 real Exa smoke']);
  await admin.query('insert into growthx.app_users(id,email,display_name) values($1::uuid,$1::text,$2)',[userId,'DP04 smoke']);
  await admin.query('insert into growthx.memberships(tenant_id,user_id) values($1,$2)',[tenantId,userId]);
  const body:EvaluationStartBody={idempotencyKey:`dp04-real-${randomUUID()}`,mode:'catalog_research',researchScope:'sf_discovery',profile:{
    product:'Developer platform for AI agent observability and evaluation',audienceDescription:'Developers building production AI agents',audienceProfiles:['Backend engineers','AI engineers'],stack:['Python','AI agents'],budget:{status:'declared',amount:5000,currency:'USD'},window:{from:'2026-09-10',to:'2026-10-22'},objective:{kind:'adoption',confirmation:'confirmed'},formats:['hackathon','workshop'],geography:{city:'San Francisco',timezone:'America/Los_Angeles'},restrictions:['Hands-on projects rather than logo placement'],comparableCompanies:[],
  }};
  const service=createEvaluationService({pool:app,queue:{async sendRunJob(){}},discoveryLimits:{maxQueries:1}});
  const accepted=await service.accept({tenantId,userId,body}); assert.equal(accepted.status,'accepted'); if(accepted.status!=='accepted') throw Error('accept failed');
  const job={tenantId,runId:accepted.runId};
  // Stop AFTER source persistence, before publishing. Then reopen from a new
  // connection and finish with a transport that would fail if called again.
  await assert.rejects(processEvaluationRun(job,{pool:worker,exitAfterStep:'discover_sources'}),WorkerStopRequested);
  const partial=await service.getRun(job); assert.ok(partial?.discovery);
  await writeFile(path.join(dir,'real-reference-response.json'),JSON.stringify({query:partial.discovery.plan.queries,operations:partial.discovery.operations,sourceRecords:partial.discovery.sources},null,2)+'\n');
  const fresh=new pg.Pool({connectionString:process.env.GROWTHX_DATABASE_URL});
  try { assert.deepEqual((await createEvaluationService({pool:fresh}).getRun(job))?.discovery,partial.discovery); } finally {await fresh.end();}
  await processEvaluationRun(job,{pool:worker,discovery:{apiKey:'must-not-call',fetchImpl:(async()=>{throw Error('Unexpected repeated Exa call');}) as typeof fetch}});
  const final=await service.getRun(job); assert.ok(final?.discovery); assert.equal(final.state,'completed');
  assert.deepEqual(final.discovery,partial.discovery);
  await writeFile(path.join(dir,'real-smoke.json'),JSON.stringify({at:new Date().toISOString(),runId:job.runId,tenantId,profile:final.profile,discovery:final.discovery,reopened:true,resumedWithoutAnotherRequest:true,limitations:['Exa costDollars is provider-reported estimated cost, not final billing.','Search proposals await DP-05 reading and DP-06 identity/relationships.','Isolated PostgreSQL; no user catalog or decision was changed.']},null,2)+'\n');
  // Short-lived browser session is kept OUTSIDE the evidence and repository.
  const token=randomBytes(24).toString('hex');
  await admin.query("insert into growthx.sessions(token_hash,user_id,tenant_id,expires_at) values($1,$2,$3,now()+interval '3 hours')",[hashSessionToken(token),userId,tenantId]);
  await writeFile('/tmp/growthx-dp04-smoke-session.json',JSON.stringify({token,runId:job.runId}),{mode:0o600});
  console.log(JSON.stringify({runId:job.runId,providerCalls:final.discovery.operations.length,pages:final.discovery.candidates.length,budget:final.discovery.budget,status:final.discovery.progress.status,reopened:true}));
  assert.equal(final.discovery.operations.length,1); assert.ok(final.discovery.candidates.length>0,'Real Exa did not return usable sources; inspect saved limitations.');
} finally {await app.end();await worker.end();await admin.end();}

}
void main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
