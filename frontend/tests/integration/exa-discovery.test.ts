import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { runMigrations } from '../../lib/server/db/migrate.ts';
import { withTenantTransaction } from '../../lib/server/db/pool.ts';
import { createEvaluationService } from '../../lib/server/evaluations/service.ts';
import { processEvaluationRun } from '../../lib/server/evaluations/run-worker.ts';
import { runDiscoveryStep } from '../../lib/server/discovery/durable.ts';
import { verifyEvidenceReferences, upsertClaimRevisions } from '../../lib/server/evidence/store.ts';
import { briefBody } from '../fixtures/research-brief.ts';

const response = () => ({ requestId: 'reference-request', costDollars: { total: .007 }, results: [
  { url:'https://lu.ma/dp04-event', title:'Technical gathering', text:'San Francisco, tickets free, sponsors mentioned. This search text is not a verified claim.' },
  { url:'https://luma.com/dp04-event?utm_source=mail', title:'Alias of technical gathering' },
  { url:'https://events.example/2025', title:'Same recurring name' },
  { url:'https://events.example/2026', title:'Same recurring name' },
] });

test('DP04 durable Exa discovery: tenant source store, recovery and aggregate allowance', { timeout: 60000 }, async t => {
  assert.ok(process.env.GROWTHX_ADMIN_DATABASE_URL, 'explicit isolated database required');
  const admin = new pg.Client({ connectionString: process.env.GROWTHX_ADMIN_DATABASE_URL }); await admin.connect(); await runMigrations();
  const app = new pg.Pool({ connectionString: process.env.GROWTHX_DATABASE_URL });
  const worker = new pg.Pool({ connectionString: process.env.GROWTHX_WORKER_DATABASE_URL, max: 2 });
  t.after(async () => { await app.end(); await worker.end(); await admin.end(); });
  const tenantId = randomUUID(), decoy = randomUUID(), userId = randomUUID();
  await admin.query('insert into growthx.tenants(id,slug,display_name) values($1::uuid,$1::text,$1::text),($2::uuid,$2::text,$2::text)',[tenantId,decoy]);
  await admin.query('insert into growthx.app_users(id,email,display_name) values($1::uuid,$1::text,$1::text)',[userId]);
  await admin.query('insert into growthx.memberships(tenant_id,user_id) values($1,$3),($2,$3)',[tenantId,decoy,userId]);
  const service = createEvaluationService({ pool:app, queue:{ async sendRunJob() {} } });
  async function accept(limits = {}, tenant = tenantId) {
    const api = createEvaluationService({ pool: app, queue:{ async sendRunJob() {} }, discoveryLimits: limits });
    const body = { ...briefBody(), researchScope:'sf_discovery' as const, idempotencyKey:randomUUID() };
    const accepted = await api.accept({tenantId:tenant,userId,body}); if(accepted.status!=='accepted') throw Error('accept');
    return {runId:accepted.runId,tenantId:tenant};
  }
  const read = async (job: {runId:string;tenantId:string}) => { const run=await service.getRun(job); assert.ok(run?.discovery); return run; };
  let calls=0;
  const fetchImpl = (async () => {calls++; return Response.json(response());}) as typeof fetch;

  await t.test('new workflow acceptance is idempotent and atomic with its queued job',async()=>{
    const body={...briefBody(),researchScope:'sf_discovery' as const,idempotencyKey:randomUUID()};
    const first=await service.accept({tenantId,userId,body}),second=await service.accept({tenantId,userId,body});
    assert.equal(first.status,'accepted');assert.equal(second.status,'duplicate');
    if(first.status!=='accepted'||second.status!=='duplicate')throw Error('accept');assert.equal(first.runId,second.runId);
    assert.equal((await admin.query('select count(*)::int n from growthx.discovery_runs where run_id=$1',[first.runId])).rows[0].n,1);
    const failing=createEvaluationService({pool:app,queue:{async sendRunJob(){throw Error('queue failure');}}});
    const failureBody={...body,idempotencyKey:randomUUID()};await assert.rejects(failing.accept({tenantId,userId,body:failureBody}),/queue failure/);
    assert.equal((await admin.query('select count(*)::int n from growthx.runs where idempotency_key=$1',[failureBody.idempotencyKey])).rows[0].n,0);
  });

  await t.test('acceptance idempotency and real persisted sources; aliases deduplicate without claims', async () => {
    const job=await accept();
    const initial=await read(job); assert.equal(initial.discovery!.progress.status,'queued'); assert.equal(initial.researchPlan!.providerLimits[0].maxRequests,3);
    await processEvaluationRun(job,{pool:worker,discovery:{apiKey:'test',fetchImpl,isFixture:true}});
    const done=await read(job); assert.equal(done.state,'completed'); assert.equal(done.discovery!.progress.status,'partial'); assert.equal(done.discovery!.progress.terminal,true);
    assert.equal(done.discovery!.candidates.length,3); assert.equal(done.discovery!.sources.length,12); assert.equal(calls,3);
    assert.equal(done.discovery!.budget.reservedByRun,.06); assert.equal(done.discovery!.budget.reportedCost,.021);
    assert.equal(done.discovery!.sources[0].geoScope,'unknown'); assert.equal(done.discovery!.sources[0].retrieval!.status,'partial');
    const sourceId=done.discovery!.sources.find(s=>s.fragments?.length)!.id;
    await assert.rejects(withTenantTransaction(worker,tenantId,client=>verifyEvidenceReferences(client,[{sourceId,fragmentId:'search-excerpt',locator:null}])),/resultado de búsqueda/);
    await assert.rejects(withTenantTransaction(worker,tenantId,client=>upsertClaimRevisions(client,tenantId,[{contractVersion:'1',id:'unsupported-search-claim',claimId:'unsupported-search-claim',subject:{type:'edition',editionId:'unknown-edition'},attribute:'cost',value:{kind:'text',text:'free'},status:'announced',sourceIds:[sourceId],method:'search',note:null,reviewer:null,reviewedAt:new Date().toISOString(),previousRevisionId:null}],randomUUID())),/resultado de búsqueda/);
    assert.deepEqual(done.discovery!.progress.findings,[]); assert.equal(done.discovery!.candidates[0].requestedUrls.length,2);
    assert.equal((await admin.query('select count(*)::int n from growthx.event_editions where tenant_id=$1',[tenantId])).rows[0].n,0);
    await processEvaluationRun(job,{pool:worker,discovery:{apiKey:'test',fetchImpl}}); assert.equal(calls,3);
    const fresh=new pg.Pool({connectionString:process.env.GROWTHX_DATABASE_URL});
    try { assert.deepEqual((await createEvaluationService({pool:fresh}).getRun(job))?.discovery,done.discovery); } finally {await fresh.end();}
    assert.equal(await service.getRun({...job,tenantId:decoy}),null);
    await withTenantTransaction(worker,decoy,async client=> { for(const table of ['discovery_runs','discovery_operations','sources']) assert.equal((await client.query(`select * from growthx.${table} where tenant_id=$1`,[tenantId])).rowCount,0); await assert.rejects(client.query('select growthx.reserve_exa_discovery($1)',[job.runId]),/unavailable/); });
  });

  await t.test('missing key performs no calls and no reservations, never fixture fallback', async () => {
    const job=await accept(); const before=calls;
    await processEvaluationRun(job,{pool:worker,discovery:{apiKey:'',fetchImpl}});
    const run=await read(job); assert.equal(calls,before); assert.equal(run.discovery!.budget.reservedByRun,0); assert.deepEqual(run.discovery!.candidates,[]); assert.match(run.discovery!.progress.limitations.join(' '),/EXA_API_KEY/);
  });

  await t.test('partial first response survives 429, no repeat of the charged attempt', async () => {
    const job=await accept(); let count=0;
    const transport=(async()=> ++count===1 ? Response.json(response()) : new Response('private detail',{status:429})) as typeof fetch;
    await processEvaluationRun(job,{pool:worker,discovery:{apiKey:'test',fetchImpl:transport}});
    const run=await read(job); assert.equal(count,2); assert.equal(run.discovery!.candidates.length,3); assert.equal(run.discovery!.budget.unknownCostOperations,1); assert.match(run.discovery!.progress.limitations.join(' '),/429/);
    await runDiscoveryStep(worker,tenantId,job.runId,{apiKey:'test',fetchImpl:transport}); assert.equal(count,2);
  });

  await t.test('timeouts and missing response are explicit, bounded and retain reservations', async () => {
    const job=await accept({requestTimeoutMs:20});
    await processEvaluationRun(job,{pool:worker,discovery:{apiKey:'test',fetchImpl:(()=>new Promise<Response>(()=>{})) as typeof fetch}});
    const run=await read(job); assert.equal(run.discovery!.progress.status,'failed'); assert.equal(run.discovery!.budget.unknownCostOperations,1); assert.equal(run.discovery!.budget.reservedByRun,.02);
    const empty=await accept(); await processEvaluationRun(empty,{pool:worker,discovery:{apiKey:'test',fetchImpl:(async()=>Response.json({results:[]})) as typeof fetch}});
    const noResults=await read(empty); assert.equal(noResults.discovery!.progress.status,'insufficient'); assert.equal(noResults.discovery!.budget.unknownCostOperations,3);
  });

  await t.test('crash after dispatch: restart preserves uncertain attempt, no additional provider call', async () => {
    const job=await accept(); const before=calls;
    await assert.rejects(runDiscoveryStep(worker,tenantId,job.runId,{apiKey:'test',fetchImpl,testBarrier:point=>{if(point==='discovery:after_dispatch:opportunities') throw Error('simulated crash');}}),/simulated crash/);
    assert.equal(calls,before);
    await runDiscoveryStep(worker,tenantId,job.runId,{apiKey:'test',fetchImpl}); assert.equal(calls,before);
    const run=await read(job); assert.equal(run.discovery!.operations[0].state,'uncertain'); assert.equal(run.discovery!.operations[0].consumption.requests.status,'unknown'); assert.equal(run.discovery!.budget.reservedByRun,.02);
  });

  await t.test('SIGKILL of a separate worker releases lease and preserves the dispatched attempt',async()=>{
    const job=await accept();
    const code=`import pg from 'pg'; import { runDiscoveryStep } from './lib/server/discovery/durable.ts'; const pool=new pg.Pool({connectionString:process.env.GROWTHX_WORKER_DATABASE_URL}); await runDiscoveryStep(pool,${JSON.stringify(job.tenantId)},${JSON.stringify(job.runId)},{apiKey:'fixture-only',fetchImpl:async()=>{throw Error('must not send');},testBarrier:point=>{if(point==='discovery:after_dispatch:opportunities')process.kill(process.pid,'SIGKILL');}});`;
    const child=spawn(process.execPath,['--input-type=module','--eval',code],{cwd:fileURLToPath(new URL('../..',import.meta.url)),env:process.env,stdio:'ignore'});
    const exit=await new Promise<{code:number|null;signal:NodeJS.Signals|null}>((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}));});
    assert.equal(exit.signal,'SIGKILL');const before=calls;
    await processEvaluationRun(job,{pool:worker,discovery:{apiKey:'test',fetchImpl}});assert.equal(calls,before);
    assert.equal((await read(job)).discovery!.operations[0].state,'uncertain');
  });

  await t.test('crash after provider response before commit cannot silently spend again', async () => {
    const job=await accept(); const before=calls;
    await assert.rejects(runDiscoveryStep(worker,tenantId,job.runId,{apiKey:'test',fetchImpl,testBarrier:p=>{if(p==='discovery:before_response_commit:opportunities') throw Error('crash');}}),/crash/);
    await runDiscoveryStep(worker,tenantId,job.runId,{apiKey:'test',fetchImpl}); assert.equal(calls,before+1);
    const run=await read(job); assert.equal(run.discovery!.operations[0].state,'uncertain'); assert.equal(run.discovery!.candidates.length,0);
  });

  await t.test('crash after source commit reuses same source IDs and continues remaining queries', async () => {
    const job=await accept(); const before=calls;
    await assert.rejects(runDiscoveryStep(worker,tenantId,job.runId,{apiKey:'test',fetchImpl,testBarrier:p=>{if(p==='discovery:after_response_commit:opportunities') throw Error('crash');}}),/crash/);
    const partial=await read(job); const sources=partial.discovery!.sources;
    await processEvaluationRun(job,{pool:worker,discovery:{apiKey:'test',fetchImpl}});
    const run=await read(job); assert.equal(calls,before+3); for(const source of sources) assert.deepEqual(run.discovery!.sources.find(s=>s.id===source.id),source);
  });

  await t.test('deadline survives restart and excludes new calls', async () => {
    const job=await accept(); const before=calls;
    await assert.rejects(runDiscoveryStep(worker,tenantId,job.runId,{apiKey:'test',fetchImpl,testBarrier:p=>{if(p==='discovery:after_response_commit:opportunities') throw Error('crash');}}),/crash/);
    await admin.query("update growthx.discovery_runs set deadline_at=now()-interval '1 second' where run_id=$1",[job.runId]);
    await processEvaluationRun(job,{pool:worker,discovery:{apiKey:'test',fetchImpl}}); assert.equal(calls,before+1); assert.match((await read(job)).discovery!.progress.limitations.join(' '),/Maximum run duration reached/);
  });

  await t.test('concurrent delivery cannot duplicate the live provider request', async () => {
    const job=await accept({maxQueries:1}); let release!:()=>void, entered!:()=>void;
    const entry=new Promise<void>(r=>entered=r), wait=new Promise<void>(r=>release=r); let count=0;
    const first=runDiscoveryStep(worker,tenantId,job.runId,{apiKey:'test',fetchImpl:(async()=>{count++;entered();await wait;return Response.json(response());}) as typeof fetch});
    await entry; await assert.rejects(runDiscoveryStep(worker,tenantId,job.runId,{apiKey:'test',fetchImpl}),/active worker/); release(); await first; assert.equal(count,1);
  });

  await t.test('aggregate cap is shared across runs and tenants, even in parallel', async () => {
    await admin.query("update growthx.discovery_allowance set reserved_usd=9.98,halted=false where provider='exa'");
    const a=await accept({maxQueries:1}), b=await accept({maxQueries:1},decoy); const before=calls;
    await Promise.all([a,b].map(job=>processEvaluationRun(job,{pool:worker,discovery:{apiKey:'test',fetchImpl}})));
    assert.equal(calls,before+1); const views=await Promise.all([read(a),read(b)]);
    assert.equal(views.filter(r=>r.discovery!.budget.reservedByRun===0).length,1);
    assert.equal(Number((await admin.query('select reserved_usd from growthx.discovery_allowance')).rows[0].reserved_usd),10);
    await assert.rejects(app.query("update growthx.discovery_allowance set reserved_usd=0"),/permission denied/);
    // Restore this isolated test allowance for the separately executed smoke.
    await admin.query("update growthx.discovery_allowance set reserved_usd=0,halted=false where provider='exa'");
  });

  await t.test('unexpected reported charge suspends new calls rather than trusting an obsolete tariff',async()=>{
    const first=await accept(),second=await accept();let count=0;
    await processEvaluationRun(first,{pool:worker,discovery:{apiKey:'test',fetchImpl:(async()=>{count++;return Response.json({...response(),costDollars:{total:.03}});}) as typeof fetch}});
    assert.equal(count,1);assert.equal((await read(first)).discovery!.budget.reportedCost,.03);
    const before=calls;await processEvaluationRun(second,{pool:worker,discovery:{apiKey:'test',fetchImpl}});assert.equal(calls,before);
    assert.match((await read(second)).discovery!.progress.limitations.join(' '),/suspended/);
    await admin.query("update growthx.discovery_allowance set reserved_usd=0,halted=false where provider='exa'");
  });
});
