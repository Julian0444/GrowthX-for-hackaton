// Persistencia tenant-safe del marketplace de sponsorship. Oportunidades y
// solicitudes son append-only; cada lectura revalida el JSON persistido.

import { createHash, randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { EvaluationProfile } from '../../contracts/evaluation.ts';
import { parseEvaluationProfile } from '../../contracts/evaluation-validation.ts';
import type {
  SponsorshipActivation,
  SponsorshipInterestCreateBody,
  SponsorshipInterestRequest,
  SponsorshipMarketplaceResponse,
  SponsorshipOpportunity,
  SponsorshipOpportunityCreateBody,
} from '../../contracts/sponsorship.ts';
import { withTenantTransaction } from '../db/pool.ts';
import { buildSponsorshipMatch } from './matcher.ts';
import { parseSponsorshipInterestRequest, parseSponsorshipOpportunity } from './wire.ts';

export interface SponsorshipSessionContext { tenantId: string; userId: string }

export type PublishOpportunityOutcome =
  | { status: 'published'; opportunity: SponsorshipOpportunity; deduplicated: boolean }
  | { status: 'idempotency_conflict'; message: string };

export type ReadMarketplaceOutcome =
  | { status: 'read'; marketplace: SponsorshipMarketplaceResponse }
  | { status: 'run_not_found' };

export type RequestIntroductionOutcome =
  | { status: 'requested'; interest: SponsorshipInterestRequest; deduplicated: boolean }
  | { status: 'not_found' }
  | { status: 'run_not_found' }
  | { status: 'invalid'; message: string }
  | { status: 'already_requested'; interest: SponsorshipInterestRequest; message: string }
  | { status: 'idempotency_conflict'; message: string };

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)]));
  return value;
}

function hashPayload(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function uniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

function mustOpportunity(value: unknown): SponsorshipOpportunity {
  const parsed = parseSponsorshipOpportunity(value);
  if (!parsed.ok) throw new Error(`Persisted SponsorshipOpportunity violates v1: ${parsed.issues.join('; ')}`);
  return parsed.value;
}

function mustInterest(value: unknown): SponsorshipInterestRequest {
  const parsed = parseSponsorshipInterestRequest(value);
  if (!parsed.ok) throw new Error(`Persisted SponsorshipInterestRequest violates v1: ${parsed.issues.join('; ')}`);
  return parsed.value;
}

async function profileForRun(client: pg.PoolClient, runId: string): Promise<EvaluationProfile | null> {
  const { rows } = await client.query(
    `select p.payload
       from growthx.runs r
       join growthx.profiles p on p.tenant_id = r.tenant_id and p.id = r.profile_id
      where r.id = $1`,
    [runId],
  );
  if (rows.length === 0) return null;
  const parsed = parseEvaluationProfile(rows[0].payload);
  if (!parsed.ok) throw new Error(`Persisted EvaluationProfile violates v1: ${parsed.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ')}`);
  return parsed.value;
}

async function opportunityById(client: pg.PoolClient, id: string): Promise<SponsorshipOpportunity | null> {
  const { rows } = await client.query('select payload from growthx.sponsorship_opportunities where id = $1', [id]);
  return rows.length ? mustOpportunity(rows[0].payload) : null;
}

async function opportunityByKey(client: pg.PoolClient, key: string): Promise<{ opportunity: SponsorshipOpportunity; hash: string } | null> {
  const { rows } = await client.query('select payload, payload_hash from growthx.sponsorship_opportunities where idempotency_key = $1', [key]);
  return rows.length ? { opportunity: mustOpportunity(rows[0].payload), hash: rows[0].payload_hash as string } : null;
}

async function interestByKey(client: pg.PoolClient, key: string): Promise<{ interest: SponsorshipInterestRequest; hash: string } | null> {
  const { rows } = await client.query('select payload, payload_hash from growthx.sponsorship_interest_requests where idempotency_key = $1', [key]);
  return rows.length ? { interest: mustInterest(rows[0].payload), hash: rows[0].payload_hash as string } : null;
}

async function interestByPair(client: pg.PoolClient, opportunityId: string, runId: string): Promise<SponsorshipInterestRequest | null> {
  const { rows } = await client.query(
    'select payload from growthx.sponsorship_interest_requests where opportunity_id = $1 and sponsor_run_id = $2',
    [opportunityId, runId],
  );
  return rows.length ? mustInterest(rows[0].payload) : null;
}

export async function publishSponsorshipOpportunity(
  pool: pg.Pool,
  ctx: SponsorshipSessionContext,
  body: SponsorshipOpportunityCreateBody,
): Promise<PublishOpportunityOutcome> {
  const payloadHash = hashPayload(body);
  const execute = () => withTenantTransaction(pool, ctx.tenantId, async (client): Promise<PublishOpportunityOutcome> => {
    const existing = await opportunityByKey(client, body.idempotencyKey);
    if (existing) return existing.hash === payloadHash
      ? { status: 'published', opportunity: existing.opportunity, deduplicated: true }
      : { status: 'idempotency_conflict', message: 'This idempotency key was already used with different opportunity content.' };
    const { idempotencyKey, ...published } = body;
    const opportunity = mustOpportunity({
      contractVersion: '1', id: randomUUID(), status: 'open', ...published,
      timezone: 'America/Los_Angeles', createdAt: new Date().toISOString(),
    });
    await client.query(
      `insert into growthx.sponsorship_opportunities
        (tenant_id, id, created_by, status, contract_version, idempotency_key, payload_hash, payload, created_at)
       values ($1,$2,$3,'open','1',$4,$5,$6,$7)`,
      [ctx.tenantId, opportunity.id, ctx.userId, idempotencyKey, payloadHash, JSON.stringify(opportunity), opportunity.createdAt],
    );
    return { status: 'published', opportunity, deduplicated: false };
  });
  try { return await execute(); }
  catch (error) { if (uniqueViolation(error)) return execute(); throw error; }
}

export async function readSponsorshipMarketplace(
  pool: pg.Pool,
  tenantId: string,
  sponsorRunId: string | null,
): Promise<ReadMarketplaceOutcome> {
  return withTenantTransaction(pool, tenantId, async (client): Promise<ReadMarketplaceOutcome> => {
    const profile = sponsorRunId ? await profileForRun(client, sponsorRunId) : null;
    if (sponsorRunId && !profile) return { status: 'run_not_found' };
    const { rows } = await client.query('select payload from growthx.sponsorship_opportunities order by created_at desc, id');
    const opportunities = rows.map((row) => mustOpportunity(row.payload));
    const { rows: interestRows } = sponsorRunId
      ? await client.query('select payload from growthx.sponsorship_interest_requests where sponsor_run_id = $1 order by requested_at desc', [sponsorRunId])
      : await client.query(`select distinct on (opportunity_id) payload
          from growthx.sponsorship_interest_requests order by opportunity_id, requested_at desc`);
    const interests = new Map(interestRows.map((row) => {
      const interest = mustInterest(row.payload);
      return [interest.opportunityId, interest] as const;
    }));
    return {
      status: 'read',
      marketplace: {
        contractVersion: '1', sponsorRunId,
        opportunities: opportunities.map((opportunity) => ({
          opportunity,
          match: sponsorRunId && profile ? buildSponsorshipMatch({ sponsorRunId, profile, opportunity }) : null,
          interest: interests.get(opportunity.id) ?? null,
        })),
      },
    };
  });
}

function selectedActivation(
  body: SponsorshipInterestCreateBody,
  opportunity: SponsorshipOpportunity,
  recommended: SponsorshipActivation,
): SponsorshipActivation | string {
  if (!body.activation) return recommended;
  if (!opportunity.formats.includes(body.activation.format)) return 'The selected format is not offered by this opportunity.';
  const selectedPackage = body.activation.packageId
    ? opportunity.packages.find((item) => item.id === body.activation?.packageId)
    : null;
  if (body.activation.packageId && !selectedPackage) return 'The selected package is not part of this opportunity.';
  if (selectedPackage && !selectedPackage.formats.includes(body.activation.format)) return 'The selected package does not include the selected format.';
  if (body.activation.trackTheme && (body.activation.format !== 'hackathon_track' || !opportunity.themes.includes(body.activation.trackTheme)))
    return 'A track theme must be one of the published themes and use the hackathon track format.';
  if (body.activation.trackTheme && selectedPackage && !selectedPackage.trackAvailable)
    return 'The selected package does not offer a dedicated track.';
  return {
    ...body.activation,
    rationale: 'Selected by the sponsor from the published options; deliverables and instrumentation still require human confirmation.',
  };
}

export async function requestSponsorshipIntroduction(
  pool: pg.Pool,
  ctx: SponsorshipSessionContext,
  opportunityId: string,
  body: SponsorshipInterestCreateBody,
): Promise<RequestIntroductionOutcome> {
  const payloadHash = hashPayload({ opportunityId, ...body });
  const execute = () => withTenantTransaction(pool, ctx.tenantId, async (client): Promise<RequestIntroductionOutcome> => {
    const byKey = await interestByKey(client, body.idempotencyKey);
    if (byKey) return byKey.hash === payloadHash
      ? { status: 'requested', interest: byKey.interest, deduplicated: true }
      : { status: 'idempotency_conflict', message: 'This idempotency key was already used with different introduction content.' };
    const opportunity = await opportunityById(client, opportunityId);
    if (!opportunity) return { status: 'not_found' };
    const profile = await profileForRun(client, body.sponsorRunId);
    if (!profile) return { status: 'run_not_found' };
    const prior = await interestByPair(client, opportunityId, body.sponsorRunId);
    if (prior) return { status: 'already_requested', interest: prior, message: 'This sponsor brief already requested an introduction for the opportunity.' };
    const match = buildSponsorshipMatch({ sponsorRunId: body.sponsorRunId, profile, opportunity });
    const activation = selectedActivation(body, opportunity, match.recommendedActivation);
    if (typeof activation === 'string') return { status: 'invalid', message: activation };
    const interest = mustInterest({
      contractVersion: '1', id: randomUUID(), opportunityId, sponsorRunId: body.sponsorRunId,
      status: 'requested', message: body.message, activation, fitAtRequest: match.fit,
      evidenceConfidence: match.evidenceConfidence, reasonsAtRequest: match.reasons,
      gapsAtRequest: match.gaps, measurementPlan: match.measurementPlan, requestedAt: new Date().toISOString(),
    });
    await client.query(
      `insert into growthx.sponsorship_interest_requests
        (tenant_id,id,opportunity_id,sponsor_run_id,requested_by,status,contract_version,idempotency_key,payload_hash,payload,requested_at)
       values ($1,$2,$3,$4,$5,'requested','1',$6,$7,$8,$9)`,
      [ctx.tenantId, interest.id, opportunityId, body.sponsorRunId, ctx.userId, body.idempotencyKey, payloadHash, JSON.stringify(interest), interest.requestedAt],
    );
    return { status: 'requested', interest, deduplicated: false };
  });
  try { return await execute(); }
  catch (error) {
    if (!uniqueViolation(error)) throw error;
    return withTenantTransaction(pool, ctx.tenantId, async (client): Promise<RequestIntroductionOutcome> => {
      const byKey = await interestByKey(client, body.idempotencyKey);
      if (byKey) return byKey.hash === payloadHash
        ? { status: 'requested', interest: byKey.interest, deduplicated: true }
        : { status: 'idempotency_conflict', message: 'This idempotency key was already used with different introduction content.' };
      const prior = await interestByPair(client, opportunityId, body.sponsorRunId);
      if (prior) return { status: 'already_requested', interest: prior, message: 'Another request for this sponsor brief and opportunity already exists.' };
      throw error;
    });
  }
}
