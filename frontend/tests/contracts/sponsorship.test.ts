import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { EvaluationProfile } from '../../lib/contracts/evaluation.ts';
import type { SponsorshipOpportunity, SponsorshipOpportunityCreateBody } from '../../lib/contracts/sponsorship.ts';
import { buildSponsorshipMatch } from '../../lib/server/sponsorships/matcher.ts';
import { parseSponsorshipInterestCreateBody, parseSponsorshipOpportunityCreateBody } from '../../lib/server/sponsorships/wire.ts';

const profile: EvaluationProfile = {
  contractVersion: '1', id: 'profile-ai', profileVersion: 1, createdAt: '2026-09-01T00:00:00Z',
  product: 'AI agent deployment platform',
  audience: { description: 'Developers building AI agents', profiles: ['AI engineers'] },
  stack: ['TypeScript', 'Python'], budget: { status: 'declared', amount: 5_000, currency: 'USD' },
  window: { from: '2026-10-01', to: '2026-11-30' }, restrictions: ['Opt-in follow-up only'],
  objective: { kind: 'feedback', confirmation: 'confirmed', successDefinition: { status: 'defined', text: 'Collect structured developer feedback' } },
  comparableCompanies: [], geography: { city: 'San Francisco', timezone: 'America/Los_Angeles' },
  formats: ['hackathon', 'workshop'],
};

const body: SponsorshipOpportunityCreateBody = {
  idempotencyKey: 'opportunity-test-1', organizerName: 'SF Builders', communityName: 'Agent Builders SF',
  eventName: 'Agent Systems Hack', eventUrl: 'https://example.com/agent-hack', city: 'San Francisco',
  startsAt: '2026-10-20T17:00:00-07:00',
  audience: { description: 'Developers shipping AI agents', estimatedSize: 120, evidenceStatus: 'source_verified', sourceUrl: 'https://example.com/audience' },
  themes: ['AI agents', 'Developer tools'], formats: ['hackathon_track', 'workshop'],
  packages: [{ id: 'track', label: 'Builder track', formats: ['hackathon_track'], contribution: { kind: 'cash', amount: 3_000, currency: 'USD' }, includes: ['Dedicated challenge', 'Mentor hours'], trackAvailable: true }],
  sponsorGoals: ['feedback', 'adoption', 'hiring'], notes: null,
};

const opportunity: SponsorshipOpportunity = {
  contractVersion: '1', id: '00000000-0000-4000-8000-000000000011', status: 'open',
  ...Object.fromEntries(Object.entries(body).filter(([key]) => key !== 'idempotencyKey')) as Omit<SponsorshipOpportunityCreateBody, 'idempotencyKey'>,
  timezone: 'America/Los_Angeles', createdAt: '2026-09-15T18:00:00Z',
};

test('sponsorship v1 valida publicaciones estrictas y conserva evidencia declarada', () => {
  const parsed = parseSponsorshipOpportunityCreateBody(body);
  assert.ok(parsed.ok, JSON.stringify(parsed));
  assert.equal(parsed.value.audience.evidenceStatus, 'source_verified');
  assert.equal(parseSponsorshipOpportunityCreateBody({ ...body, tenantId: 'foreign' }).ok, false);
  assert.equal(parseSponsorshipOpportunityCreateBody({ ...body, audience: { ...body.audience, sourceUrl: null } }).ok, false);
  assert.equal(parseSponsorshipOpportunityCreateBody({ ...body, packages: [{ ...body.packages[0], formats: ['workshop'] }] }).ok, false, 'un track no puede ofrecerse fuera de hackathon_track');
});

test('matching explicable usa brief persistido sin score ni promesa de ROI', () => {
  const match = buildSponsorshipMatch({ sponsorRunId: '00000000-0000-4000-8000-000000000012', profile, opportunity, now: '2026-09-15T18:00:00Z' });
  assert.equal(match.fit, 'strong');
  assert.equal(match.evidenceConfidence, 'verified');
  assert.equal(match.recommendedActivation.format, 'hackathon_track');
  assert.equal(match.recommendedActivation.packageId, 'track');
  assert.equal(match.recommendedActivation.trackTheme, 'AI agents');
  assert.ok(match.reasons.some((reason) => reason.kind === 'theme'));
  assert.ok(match.gaps.some((gap) => gap.includes('Opt-in follow-up only')));
  assert.match(match.measurementPlan.caveat, /does not guarantee.*ROI/i);
  assert.equal('score' in match, false);
});

test('fecha pasada impide un match fuerte y paquete barato incompatible no confirma presupuesto', () => {
  const past = { ...opportunity, startsAt: '2026-08-20T17:00:00-07:00' };
  const pastMatch = buildSponsorshipMatch({ sponsorRunId: '00000000-0000-4000-8000-000000000012', profile, opportunity: past, now: '2026-09-15T18:00:00Z' });
  assert.equal(pastMatch.fit, 'limited');
  assert.ok(pastMatch.gaps.some((gap) => gap.includes('already passed')));

  const incompatible: SponsorshipOpportunity = {
    ...opportunity,
    packages: [
      { id: 'cheap-dinner', label: 'Dinner', formats: ['dinner'], contribution: { kind: 'cash', amount: 500, currency: 'USD' }, includes: ['Seat'], trackAvailable: false },
      { ...opportunity.packages[0], contribution: { kind: 'cash', amount: 8_000, currency: 'USD' } },
    ],
  };
  const match = buildSponsorshipMatch({ sponsorRunId: '00000000-0000-4000-8000-000000000012', profile, opportunity: incompatible, now: '2026-09-15T18:00:00Z' });
  assert.notEqual(match.fit, 'strong');
  assert.equal(match.recommendedActivation.packageId, 'track');
  assert.equal(match.reasons.some((reason) => reason.kind === 'budget'), false);
});

test('solicitud de introduccion exige run UUID y no acepta identidad del tenant', () => {
  const valid = parseSponsorshipInterestCreateBody({
    idempotencyKey: 'interest-test-1', sponsorRunId: '00000000-0000-4000-8000-000000000012',
    message: 'We would like to review the track.', activation: null,
  });
  assert.ok(valid.ok);
  assert.equal(parseSponsorshipInterestCreateBody({ ...valid.value, tenantId: 'foreign' }).ok, false);
  assert.equal(parseSponsorshipInterestCreateBody({ ...valid.value, sponsorRunId: 'not-a-run' }).ok, false);
});
