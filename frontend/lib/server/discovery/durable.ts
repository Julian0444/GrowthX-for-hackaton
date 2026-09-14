import type pg from 'pg';
import type { ProviderConsumption, SourceRecord } from '../../contracts/evaluation.ts';
import { DISCOVERY_RESERVATION_USD, type DiscoveryView, type DiscoveryOperation, type DiscoveryResponse } from '../../contracts/discovery.ts';
import { parseDiscoveryPlan, parseDiscoveryResponse, parseProviderConsumption, parseResearchProgress, parseSourceRecord, type ValidationResult } from '../../contracts/evaluation-validation.ts';
import { upsertSources, readSourcesByIds } from '../evidence/store.ts';
import { discoveryId, searchExa, ExaSearchFailure } from './exa-search.ts';

const READING_PENDING = 'Discovered pages are proposed sources. They must be read and their claims linked to an edition; they do not confirm cost, city, date, participation, or success.';
const must = <T>(parsed: ValidationResult<T>): T => { if (!parsed.ok) throw new Error('Invalid persisted discovery contract'); return parsed.value; };

export interface DiscoveryStepOptions {
  apiKey?: string;
  fetchImpl?: typeof fetch;
  isFixture?: boolean;
  testBarrier?: (point: string) => void;
}

export async function readDiscovery(client: pg.ClientBase, runId: string): Promise<DiscoveryView | null> {
  const { rows } = await client.query('select * from growthx.discovery_runs where run_id=$1', [runId]);
  if (!rows.length) return null;
  const row = rows[0];
  const plan = must(parseDiscoveryPlan(row.plan));
  const ops = await client.query('select * from growthx.discovery_operations where run_id=$1 order by seq', [runId]);
  const operations: DiscoveryOperation[] = ops.rows.map(op => ({
    id: op.id, query: plan.queries[Number(op.seq)], state: op.state,
    startedAt: op.started_at.toISOString(), finishedAt: op.finished_at?.toISOString() ?? null,
    limitation: op.limitation, response: op.response ? must(parseDiscoveryResponse(op.response)) : null,
    consumption: must(parseProviderConsumption(op.consumption)),
  }));
  const candidates = new Map<string, DiscoveryView['candidates'][number]>();
  for (const op of operations) for (const page of op.response?.pages ?? []) {
    const id = discoveryId('candidate', page.canonicalUrl);
    const candidate = candidates.get(id) ?? { id, canonicalUrl: page.canonicalUrl, requestedUrls: [], title: page.title, sourceIds: [], queryIds: [], status: 'awaiting_reading' as const };
    candidate.requestedUrls = [...new Set([...candidate.requestedUrls, page.url])];
    candidate.sourceIds = [...new Set([...candidate.sourceIds, page.sourceId])];
    candidate.queryIds = [...new Set([...candidate.queryIds, op.query.id])];
    candidates.set(id, candidate);
  }
  const sourceIds = [...candidates.values()].flatMap(c => c.sourceIds);
  const sources = (await readSourcesByIds(client, sourceIds)).map(s => must(parseSourceRecord(s))).sort((a,b) => a.id.localeCompare(b.id));
  if (sources.length !== new Set(sourceIds).size) throw new Error('Fuente discovery no disponible bajo el tenant');
  const terminal = Boolean(row.finished_at);
  const limitations: string[] = [...new Set([...(row.limitations as string[]), ...operations.flatMap(o => o.limitation ? [o.limitation] : []), ...operations.flatMap(o => o.response?.discardedResults ? [`Discarded ${o.response.discardedResults} results rejected or exceeding the query limit for ${o.query.id}.`] : []), ...(candidates.size ? [READING_PENDING] : [])])];
  const status = !terminal ? (row.started_at ? 'running' : 'queued') : candidates.size ? 'partial' : operations.some(o => ['failed','uncertain'].includes(o.state)) ? 'failed' : 'insufficient';
  if (terminal && !limitations.length) limitations.push('Exa returned no usable sources for the saved queries.');
  const updatedAt = row.finished_at ?? ops.rows.at(-1)?.finished_at ?? ops.rows.at(-1)?.started_at ?? row.started_at;
  const progress = must(parseResearchProgress({ contractVersion: '1', runId, status, stage: terminal ? 'discovery_finished' : operations.length ? 'searching_sources' : 'waiting_for_discovery', terminal, attempts: operations.length, findings: [], limitations, material: row.material, updatedAt: updatedAt?.toISOString() ?? (await client.query('select created_at from growthx.runs where id=$1', [runId])).rows[0].created_at.toISOString() }));
  return {
    kind: 'source_discovery', plan, progress, candidates: [...candidates.values()], sources, operations,
    budget: { currency: 'USD', initiativeLimit: 10, reservedByRun: operations.length * DISCOVERY_RESERVATION_USD, remainingAfterLastReservation: ops.rows.length ? Number(ops.rows.at(-1).remaining_budget) : null, reportedCost: operations.reduce((sum, o) => sum + (o.consumption.cost.status === 'known' ? o.consumption.cost.amount : 0), 0), unknownCostOperations: operations.filter(o => o.consumption.cost.status === 'unknown').length, basis: 'conservative_reservations' },
  };
}

async function saveResponse(client: pg.ClientBase, tenantId: string, runId: string, operationId: string, response: DiscoveryResponse, fetchedAt: string, isFixture: boolean): Promise<void> {
  const hash = discoveryId('exa-load', operationId);
  const load = await client.query(`insert into growthx.catalog_loads(tenant_id,manifest_name,manifest_hash,material,authorized_by,verified_at,note,summary)
    select $1,$2,$3,$4,requested_by::text,$5,$6,$7 from growthx.runs where id=$8
    on conflict (tenant_id,manifest_hash) do update set summary=excluded.summary returning id`,
  [tenantId, `exa-discovery:${operationId}`, hash, isFixture ? 'synthetic' : 'imported', fetchedAt, 'Automatically retrieved search results. verified_at records retrieval, not human review. Full reading pending.', JSON.stringify({ sources: response.pages.length, operationId, requestId: response.requestId }), runId]);
  if (!load.rows.length) throw new Error('Run discovery no disponible');
  const sources: SourceRecord[] = response.pages.map(page => ({
    contractVersion: '1', id: page.sourceId, url: page.url, requestedUrl: page.url, canonicalUrl: page.canonicalUrl,
    title: page.title, locator: null, provider: new URL(page.url).hostname, collector: 'exa', fetchedAt, publishedAt: page.publishedAt,
    method: isFixture ? 'test_fixture+exa_search' : 'exa_search', geoScope: 'unknown',
    content: page.excerpt ? { kind: 'excerpt', excerpt: page.excerpt } : { kind: 'none' },
    fragments: page.excerpt ? [{ id: 'search-excerpt', text: page.excerpt, locator: 'Exa Search result text; partial indexed content' }] : [],
    retrieval: { status: 'partial', limitation: READING_PENDING, freshness: 'unknown' },
    usageRestrictions: ['Search snippet for research; does not establish permission for full republication.'],
  }));
  await upsertSources(client, tenantId, sources, load.rows[0].id);
}

export async function runDiscoveryStep(pool: pg.Pool, tenantId: string, runId: string, options: DiscoveryStepOptions = {}): Promise<DiscoveryView> {
  // Session lock spans the HTTP call but no open DB transaction. A process
  // death releases it. A concurrent delivery cannot relabel an active call.
  const lease = await pool.connect();
  const lockKey = `exa-discovery:${tenantId}:${runId}`;
  let locked = false;
  // Reuse the leased connection, including with max:1 pools. Acquiring a
  // second pooled connection here could deadlock concurrent runs.
  const tx = async <T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> => {
    await lease.query('begin');
    try {
      await lease.query("select set_config('growthx.tenant_id',$1,true)",[tenantId]);
      const result=await fn(lease);await lease.query('commit');return result;
    } catch(error) {await lease.query('rollback');throw error;}
  };
  try {
    locked = (await lease.query('select pg_try_advisory_lock(hashtextextended($1,0)) as locked', [lockKey])).rows[0].locked;
    if (!locked) throw new Error('Discovery already has an active worker; redelivery pending.');
    const start = await tx(async client => {
      const row = (await client.query('select * from growthx.discovery_runs where run_id=$1', [runId])).rows[0];
      if (!row) throw new Error('Run discovery no disponible bajo el tenant');
      const plan = must(parseDiscoveryPlan(row.plan));
      if (!row.started_at) await client.query(`update growthx.discovery_runs set started_at=now(), deadline_at=now()+($2 * interval '1 millisecond'), material=$3 where run_id=$1`, [runId, plan.limits.durationMs, options.isFixture ? 'synthetic' : 'real']);
      // Dispatched before a crash is NOT safe to send again. Preserve an
      // unknown charge and its reservation, even if the request never arrived.
      const pending = await client.query("select id,consumption from growthx.discovery_operations where run_id=$1 and state='dispatched'", [runId]);
      for (const op of pending.rows) {
        const reason = 'Worker interrupted after reserving the attempt; response and usage unknown. The query was not sent again.';
        const consumption = must(parseProviderConsumption(op.consumption));
        consumption.requests = { status: 'unknown', reason }; consumption.cost = { status: 'unknown', reason }; consumption.recordedAt = new Date().toISOString();
        await client.query("update growthx.discovery_operations set state='uncertain',finished_at=now(),limitation=$2,consumption=$3 where id=$1", [op.id, reason, JSON.stringify(consumption)]);
      }
      return { plan, finished: Boolean(row.finished_at) };
    });
    if (start.finished) return (await tx(client => readDiscovery(client, runId)))!;
    const apiKey = options.apiKey ?? process.env.EXA_API_KEY;
    const limitations: string[] = [];
    if (!apiKey?.trim()) limitations.push('EXA_API_KEY is missing from the worker. Exa was not queried and fixtures did not replace results.');
    else for (const [seq, query] of start.plan.queries.entries()) {
      const reservation = await tx(async client => {
        const existing = await client.query('select state from growthx.discovery_operations where run_id=$1 and seq=$2', [runId, seq]);
        if (existing.rows.length) {
          if (existing.rows[0].state === 'succeeded') return { kind: 'skip' } as const;
          return { kind: 'stop', reason: 'The failed or uncertain attempt is preserved; starting another research run requires an explicit action.' } as const;
        }
        const row = (await client.query('select extract(epoch from (deadline_at-clock_timestamp()))*1000 as remaining from growthx.discovery_runs where run_id=$1', [runId])).rows[0];
        const remainingMs = Number(row.remaining);
        if (remainingMs <= 0) return { kind: 'stop', reason: 'Maximum run duration reached; retrieved sources are preserved.' } as const;
        const budget = (await client.query('select growthx.reserve_exa_discovery($1) as remaining', [runId])).rows[0].remaining;
        if (budget === null) return { kind: 'stop', reason: 'Exa operational allowance exhausted or suspended. No additional query was sent.' } as const;
        const id = discoveryId('exa-operation', `${runId}:${query.id}`);
        const now = new Date().toISOString();
        const consumption: ProviderConsumption = { provider: 'exa', runId, operationId: id, requests: { status: 'known', count: 1 }, cost: { status: 'unknown', reason: 'Attempt reserved; response pending.' }, recordedAt: now };
        await client.query(`insert into growthx.discovery_operations(tenant_id,run_id,id,seq,query,state,consumption,remaining_budget) values($1,$2,$3,$4,$5,'dispatched',$6,$7)`, [tenantId,runId,id,seq,JSON.stringify(query),JSON.stringify(consumption),budget]);
        await client.query("insert into growthx.run_logs(tenant_id,run_id,step_name,level,message,context) values($1,$2,'discover_sources','info','Intento Exa reservado antes de enviar',$3)", [tenantId,runId,JSON.stringify({ operationId: id, queryId: query.id, reservedUsd: DISCOVERY_RESERVATION_USD })]);
        return { kind: 'send', id, consumption, timeoutMs: Math.max(1, Math.min(Math.floor(remainingMs), start.plan.limits.requestTimeoutMs)) } as const;
      });
      if (reservation.kind === 'skip') continue;
      if (reservation.kind === 'stop') { limitations.push(reservation.reason); break; }
      options.testBarrier?.(`discovery:after_dispatch:${query.id}`);
      let response: DiscoveryResponse | null = null, failure: string | null = null;
      try { response = await searchExa({ apiKey, query: query.text, operationId: reservation.id, numResults: start.plan.limits.resultsPerQuery, timeoutMs: reservation.timeoutMs, fetchImpl: options.fetchImpl }); }
      catch (error) { if (!(error instanceof ExaSearchFailure)) throw error; failure = error.message; }
      options.testBarrier?.(`discovery:before_response_commit:${query.id}`);
      const fetchedAt = new Date().toISOString();
      const consumption: ProviderConsumption = { ...reservation.consumption, recordedAt: fetchedAt, cost: response?.costUsd !== null && response?.costUsd !== undefined ? { status: 'known', amount: response.costUsd, currency: 'USD' } : { status: 'unknown', reason: failure ?? 'Exa did not report costDollars.total; zero cost is not assumed.' } };
      await tx(async client => {
        if (response) await saveResponse(client, tenantId, runId, reservation.id, response, fetchedAt, Boolean(options.isFixture));
        if (response?.costUsd !== null && response?.costUsd !== undefined && response.costUsd > DISCOVERY_RESERVATION_USD) {
          failure = 'Reported cost exceeded the per-query reservation. Further queries are suspended pending a pricing review.';
          await client.query('select growthx.halt_exa_discovery()');
        }
        await client.query('update growthx.discovery_operations set state=$2,finished_at=$3,limitation=$4,response=$5,consumption=$6 where id=$1', [reservation.id, response ? 'succeeded' : 'failed', fetchedAt, failure, response ? JSON.stringify(response) : null, JSON.stringify(consumption)]);
      });
      options.testBarrier?.(`discovery:after_response_commit:${query.id}`);
      if (failure) { limitations.push(failure); break; }
    }
    return await tx(async client => {
      await client.query('update growthx.discovery_runs set finished_at=now(),limitations=$2 where run_id=$1', [runId, JSON.stringify(limitations)]);
      return (await readDiscovery(client, runId))!;
    });
  } finally {
    if (locked) await lease.query('select pg_advisory_unlock(hashtextextended($1,0))', [lockKey]);
    lease.release();
  }
}
