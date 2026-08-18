import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Community, Evidence, SearchRequest } from '../../lib/contracts/growxth.ts';
import { scoreCommunity } from '../../lib/server/scoring/community-score.ts';

const REQUEST: SearchRequest = {
  product: 'Postgres-native background jobs',
  icpStack: ['Python', 'Postgres'],
  budgetUsd: 5000,
  goal: 'adoption',
};

function community(overrides: Partial<Community> = {}): Community {
  return {
    id: 'com-test',
    name: 'Test Community',
    url: 'https://example.com',
    kind: 'meetup-series',
    cadence: 'monthly',
    eventsRun12mo: 12,
    foundedYear: 2016,
    sizeEstimate: 500,
    sizeBasis: 'estimated',
    stack: ['Python', 'Postgres'],
    organizerIds: ['org-1'],
    pastSponsors: [],
    evidenceIds: ['ev-1'],
    ...overrides,
  };
}

const EVIDENCE: Evidence[] = [
  {
    id: 'ev-1',
    source: 'exa',
    kind: 'web_page',
    url: 'https://example.com',
    title: 'archive',
    observedAt: '2026-07-01T00:00:00.000Z',
    location: 'San Francisco, CA',
    confidence: 0.8,
    rightsBasis: 'public_web',
    status: 'observed',
  },
];

test('comunidad completa con evidencia: score alto y reasons respaldadas', () => {
  const res = scoreCommunity({ community: community(), evidence: EVIDENCE, request: REQUEST });
  assert.ok(res.score > 60, `score ${res.score} debería ser alto`);
  assert.ok(res.reasons.length > 0);
  for (const r of res.reasons) {
    assert.ok(r.evidenceIds.length > 0, 'toda reason lleva evidenceIds no vacío');
  }
});

test('evidencia vacía: sin reasons y confidence null (pero score se computa)', () => {
  const res = scoreCommunity({ community: community(), evidence: [], request: REQUEST });
  assert.equal(res.reasons.length, 0);
  assert.equal(res.breakdown.confidence, null);
  assert.ok(res.score > 0);
});

test('stack vacío → stackOverlap null (no 0)', () => {
  const res = scoreCommunity({ community: community({ stack: [] }), evidence: EVIDENCE, request: REQUEST });
  assert.equal(res.breakdown.stackOverlap, null);
});

test('sin cadencia conocida → cadenceReliability null', () => {
  const res = scoreCommunity({
    community: community({ eventsRun12mo: null }),
    evidence: EVIDENCE,
    request: REQUEST,
  });
  assert.equal(res.breakdown.cadenceReliability, null);
});

test('sin evidencia de sponsors → exclusivityGap null (no inferir ausencia)', () => {
  const res = scoreCommunity({ community: community({ pastSponsors: [] }), evidence: EVIDENCE, request: REQUEST });
  assert.equal(res.breakdown.exclusivityGap, null);
});
