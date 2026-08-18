import assert from 'node:assert/strict';
import test from 'node:test';

import type { SearchRequest } from '../../lib/contracts/growxth.ts';
import type { ApifyActorResult } from '../../lib/server/connectors/apify.ts';
import {
  normalizeGoogleTrends,
  normalizeTweets,
  rankGlobalMarkets,
  searchTermForRequest,
  type GlobalSignalBundle,
} from '../../lib/server/pipeline/global-market-search.ts';
import { resolveMarketCity } from '../../lib/server/markets/city-catalog.ts';

const REQUEST: SearchRequest = {
  product: 'AI observability for production agents',
  icpStack: [],
  budgetUsd: 0,
  goal: 'adoption',
};

function actor(items: unknown[]): ApifyActorResult {
  return {
    actorId: 'test/actor',
    runId: 'run-1',
    status: 'SUCCEEDED',
    items,
    warning: null,
  };
}

test('normalizes worldwide Trends rows and explicit X locations', () => {
  const trends = normalizeGoogleTrends(
    actor([
      {
        geoData: [
          { geoCode: 'IN', geoName: 'India', value: [96] },
          { geoCode: 'GB', geoName: 'United Kingdom', value: [82] },
        ],
      },
    ]),
    'ai observability',
  );
  assert.equal(trends[0]?.city.city, 'Bengaluru');
  assert.equal(trends[0]?.value, 96);

  const tweets = normalizeTweets(
    actor([
      {
        url: 'https://x.com/example/status/1',
        text: 'Testing observability for agents',
        createdAt: '2026-07-24T00:00:00Z',
        likeCount: 8,
        place: { fullName: 'London, England' },
        author: {},
      },
    ]),
    '2026-07-24T00:00:00Z',
  );
  assert.equal(tweets[0]?.city.city, 'London');
  assert.equal(tweets[0]?.engagement, 8);

  const profiles = normalizeTweets(
    actor([
      {
        url: 'https://x.com/OpenObserve',
        username: 'OpenObserve',
        name: 'OpenObserve',
        location: 'San Francisco',
        followers: 1200,
        scrapedAt: '2026-07-24T00:00:00Z',
      },
    ]),
    '2026-07-24T00:00:00Z',
  );
  assert.equal(profiles[0]?.city.city, 'San Francisco');
  assert.equal(profiles[0]?.engagement, 1200);
  assert.equal(profiles[0]?.kind, 'profile');
});

test('builds focused signal queries from natural product descriptions', () => {
  assert.equal(
    searchTermForRequest({
      ...REQUEST,
      product:
        'We build AI agent observability for Python teams and want developer adoption',
    }),
    'ai observability',
  );
  assert.equal(
    searchTermForRequest({
      ...REQUEST,
      product: 'Want a startup that focuses on replacing the current focus',
    }),
    'developer tools',
  );
});

test('ranks three countries from query-specific geographic evidence', () => {
  const bengaluru = resolveMarketCity('Bangalore')!;
  const london = resolveMarketCity('London')!;
  const buenosAires = resolveMarketCity('Buenos Aires')!;
  const bundle: GlobalSignalBundle = {
    term: 'ai observability',
    collectedAt: '2026-07-24T00:00:00Z',
    trends: [
      { city: bengaluru, value: 96, basis: 'country', geoLabel: 'India', url: 'https://trends.google.com/' },
      { city: london, value: 82, basis: 'country', geoLabel: 'United Kingdom', url: 'https://trends.google.com/' },
    ],
    tweets: [
      {
        city: london,
        url: 'https://x.com/example/status/1',
        text: 'Agent observability',
        engagement: 12,
        observedAt: '2026-07-24T00:00:00Z',
        basis: 'city',
      },
    ],
    github: [
      {
        city: buenosAires,
        repoName: 'example/agent-observability',
        repoUrl: 'https://github.com/example/agent-observability',
        profileUrl: 'https://github.com/example',
        location: 'Buenos Aires',
        stars: 1200,
        observedAt: '2026-07-24T00:00:00Z',
      },
    ],
    sources: [
      { source: 'google_trends', available: true, warning: null, globalCount: 2, globalEvidenceUrl: 'https://trends.google.com/' },
      { source: 'github', available: true, warning: null, globalCount: 10, globalEvidenceUrl: 'https://github.com/' },
      { source: 'x', available: true, warning: null, globalCount: 1, globalEvidenceUrl: 'https://x.com/example/status/1' },
    ],
  };

  const response = rankGlobalMarkets(REQUEST, bundle);
  assert.equal(response.opportunities.length, 3);
  assert.equal(
    new Set(response.opportunities.map((item) => item.market?.countryCode)).size,
    3,
  );
  assert.ok(response.opportunities.some((item) => item.market?.city === 'Bengaluru'));
  assert.ok(response.opportunities.some((item) => item.market?.city === 'London'));
  assert.ok(response.coverage.sourcesUsed.includes('google_trends'));
  assert.ok(Object.values(response.evidence).some((item) => item.collector === 'apify'));
});

test('keeps a labeled worldwide fallback when every live source is unavailable', () => {
  const response = rankGlobalMarkets(REQUEST, {
    term: 'ai observability',
    collectedAt: '2026-07-24T00:00:00Z',
    trends: [],
    tweets: [],
    github: [],
    sources: [
      { source: 'google_trends', available: false, warning: 'offline', globalCount: 0, globalEvidenceUrl: null },
      { source: 'github', available: false, warning: 'offline', globalCount: 0, globalEvidenceUrl: null },
      { source: 'x', available: false, warning: 'offline', globalCount: 0, globalEvidenceUrl: null },
    ],
  });
  assert.equal(response.opportunities.length, 3);
  assert.equal(new Set(response.opportunities.map((item) => item.market?.countryCode)).size, 3);
  assert.equal(response.degraded, true);
  assert.ok(response.opportunities.every((item) => item.status === 'prepared'));
  assert.ok(Object.values(response.evidence).every((item) => item.status === 'prepared'));
});
