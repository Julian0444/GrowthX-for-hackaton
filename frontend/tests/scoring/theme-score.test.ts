import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Community, Evidence, SearchRequest, Theme } from '../../lib/contracts/growxth.ts';
import { scoreTheme } from '../../lib/server/scoring/theme-score.ts';

const REQUEST: SearchRequest = {
  product: 'x',
  icpStack: ['Python', 'Postgres'],
  budgetUsd: 5000,
  goal: 'adoption',
};

const COMMUNITY: Community = {
  id: 'com-1',
  name: 'SF Python',
  url: 'https://example.com',
  kind: 'meetup-series',
  cadence: 'monthly',
  eventsRun12mo: 11,
  foundedYear: 2011,
  sizeEstimate: 4000,
  sizeBasis: 'estimated',
  stack: ['Python', 'Postgres'],
  organizerIds: ['org-1'],
  pastSponsors: [],
  evidenceIds: [],
};

function theme(overrides: Partial<Theme> = {}): Theme {
  return {
    id: 'theme-1',
    label: 'background jobs',
    githubMomentum: 2, // +100%
    newsSalience: 0.7,
    saturationSF: 1,
    requiredCapabilities: ['Python', 'Postgres'],
    evidenceIds: ['ev-1'],
    ...overrides,
  };
}

const EVIDENCE: Evidence[] = [
  {
    id: 'ev-1',
    source: 'github',
    kind: 'repo_activity',
    url: 'https://github.com',
    title: 'momentum',
    observedAt: '2026-07-01T00:00:00.000Z',
    location: null,
    confidence: 0.7,
    rightsBasis: 'public_api',
    status: 'observed',
  },
];

test('momentum: ratio 2.0 (+100%) → 1.0', () => {
  const res = scoreTheme({ theme: theme(), community: COMMUNITY, evidence: EVIDENCE, request: REQUEST });
  assert.equal(res.breakdown.momentum, 1);
});

test('sin githubMomentum cae a newsSalience', () => {
  const res = scoreTheme({
    theme: theme({ githubMomentum: null, newsSalience: 0.6 }),
    community: COMMUNITY,
    evidence: EVIDENCE,
    request: REQUEST,
  });
  assert.equal(res.breakdown.momentum, 0.6);
});

test('sin requiredCapabilities → criticalPath null', () => {
  const res = scoreTheme({
    theme: theme({ requiredCapabilities: [] }),
    community: COMMUNITY,
    evidence: EVIDENCE,
    request: REQUEST,
  });
  assert.equal(res.breakdown.criticalPath, null);
  assert.equal(res.breakdown.communityCapability, null);
});

test('reasons del tema citan evidencia no vacía', () => {
  const res = scoreTheme({ theme: theme(), community: COMMUNITY, evidence: EVIDENCE, request: REQUEST });
  assert.ok(res.reasons.length > 0);
  for (const r of res.reasons) assert.ok(r.evidenceIds.length > 0);
});
