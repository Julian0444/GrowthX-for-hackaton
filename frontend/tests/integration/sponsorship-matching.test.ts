import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import pg from 'pg';
import { runMigrations } from '../../lib/server/db/migrate.ts';
import { createEvaluationService } from '../../lib/server/evaluations/service.ts';
import { publishSponsorshipOpportunity, readSponsorshipMarketplace, requestSponsorshipIntroduction } from '../../lib/server/sponsorships/store.ts';
import { briefBody } from '../fixtures/research-brief.ts';
import { seedSession } from '../support/source-browser.ts';

test('sponsorship: RLS, perfil persistido e idempotencia append-only', { timeout: 60_000 }, async (t) => {
  assert.ok(process.env.GROWTHX_ADMIN_DATABASE_URL && process.env.GROWTHX_DATABASE_URL, 'usar base de integracion explicita');
  await runMigrations();
  const admin = new pg.Client({ connectionString: process.env.GROWTHX_ADMIN_DATABASE_URL });
  const app = new pg.Pool({ connectionString: process.env.GROWTHX_DATABASE_URL });
  await admin.connect();
  t.after(async () => { await app.end(); await admin.end(); });
  const sponsor = await seedSession(admin);
  const foreign = await seedSession(admin);
  const service = createEvaluationService({ pool: app, queue: { async sendRunJob() {} } });
  const brief = briefBody(); brief.idempotencyKey = randomUUID();
  const accepted = await service.accept({ ...sponsor, body: brief });
  assert.equal(accepted.status, 'accepted');
  if (accepted.status !== 'accepted') throw new Error('brief no aceptado');

  const input = {
    idempotencyKey: randomUUID(), organizerName: 'SF Builders', communityName: 'Agent Builders SF',
    eventName: 'Agent Systems Hack', eventUrl: 'https://example.com/hack', city: 'San Francisco' as const,
    startsAt: '2026-10-20T17:00:00-07:00',
    audience: { description: 'AI agent developers', estimatedSize: 100, evidenceStatus: 'source_verified' as const, sourceUrl: 'https://example.com/audience' },
    themes: ['AI agents', 'Python'], formats: ['hackathon_track' as const, 'workshop' as const],
    packages: [{ id: 'track', label: 'Track', formats: ['hackathon_track' as const], contribution: { kind: 'cash' as const, amount: 3_000, currency: 'USD' }, includes: ['Challenge and mentor hours'], trackAvailable: true }],
    sponsorGoals: ['adoption' as const, 'feedback' as const], notes: null,
  };
  const first = await publishSponsorshipOpportunity(app, sponsor, input);
  assert.equal(first.status, 'published');
  if (first.status !== 'published') throw new Error('publicacion fallida');
  const replay = await publishSponsorshipOpportunity(app, sponsor, input);
  assert.equal(replay.status, 'published');
  if (replay.status === 'published') { assert.equal(replay.deduplicated, true); assert.equal(replay.opportunity.id, first.opportunity.id); }
  assert.equal((await publishSponsorshipOpportunity(app, sponsor, { ...input, eventName: 'Changed' })).status, 'idempotency_conflict');

  const market = await readSponsorshipMarketplace(app, sponsor.tenantId, accepted.runId);
  assert.equal(market.status, 'read');
  if (market.status === 'read') {
    const item = market.marketplace.opportunities.find((candidate) => candidate.opportunity.id === first.opportunity.id);
    assert.ok(item?.match);
    assert.equal(item.match.sponsorRunId, accepted.runId);
  }
  const hidden = await readSponsorshipMarketplace(app, foreign.tenantId, null);
  assert.equal(hidden.status, 'read');
  if (hidden.status === 'read') assert.equal(hidden.marketplace.opportunities.some((candidate) => candidate.opportunity.id === first.opportunity.id), false);
  assert.equal((await readSponsorshipMarketplace(app, foreign.tenantId, accepted.runId)).status, 'run_not_found');

  const interestBody = { idempotencyKey: randomUUID(), sponsorRunId: accepted.runId, message: 'Please make an opt-in introduction.', activation: null };
  const request = await requestSponsorshipIntroduction(app, sponsor, first.opportunity.id, interestBody);
  assert.equal(request.status, 'requested');
  if (request.status !== 'requested') throw new Error('solicitud fallida');
  const retry = await requestSponsorshipIntroduction(app, sponsor, first.opportunity.id, interestBody);
  assert.equal(retry.status, 'requested');
  if (retry.status === 'requested') { assert.equal(retry.deduplicated, true); assert.equal(retry.interest.id, request.interest.id); }
  assert.equal((await requestSponsorshipIntroduction(app, sponsor, first.opportunity.id, { ...interestBody, idempotencyKey: randomUUID() })).status, 'already_requested');
  assert.equal((await requestSponsorshipIntroduction(app, foreign, first.opportunity.id, { ...interestBody, idempotencyKey: randomUUID() })).status, 'not_found');
});
