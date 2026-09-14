import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildDiscoveryPlan } from '../../lib/research/discovery-plan.ts';
import { buildEvaluationProfile, parseEvaluationStartBody } from '../../lib/server/evaluations/wire.ts';
import { parseDiscoveryPlan, parseDiscoveryResponse } from '../../lib/contracts/evaluation-validation.ts';
import { canonicalDiscoveryUrl, parseExaResponse, searchExa, EXA_SEARCH_URL } from '../../lib/server/discovery/exa-search.ts';
import { briefBody } from '../fixtures/research-brief.ts';

test('DP04 queries follow product, audience, goal, window, geography; budget cannot buy more calls', () => {
  const body = briefBody();
  const a = buildEvaluationProfile(body, { profileId: 'brief-a', createdAt: '2026-09-10T20:00:00Z' });
  const b = structuredClone(a); b.product = 'Payment infrastructure'; b.audience.description = 'Fintech engineers'; b.objective.kind = 'hiring'; b.window = { from: '2026-10-01', to: '2026-11-01' }; b.budget = { status: 'declared', amount: 100000, currency: 'EUR' };
  const p = buildDiscoveryPlan(a), q = buildDiscoveryPlan(b);
  assert.ok(parseDiscoveryPlan(p).ok); assert.notDeepEqual(p.queries, q.queries); assert.deepEqual(p.limits,q.limits);
  for (const query of q.queries) { assert.match(query.text,/Payment infrastructure/); assert.match(query.text,/Fintech/); assert.match(query.text,/recruiting/); assert.match(query.text,/San Francisco/); assert.match(query.text,/2026-10-01/); assert.ok(query.questionIds.length); }
  assert.ok(!parseDiscoveryPlan({ ...p, limits: { ...p.limits, maxQueries: 50 } }).ok);
  assert.throws(() => buildDiscoveryPlan(a, { maxQueries: 4 }));
  assert.equal(parseEvaluationStartBody({ ...body, researchScope: 'sf_discovery', discoveryLimits: { maxQueries: 100 } }).ok, false);
});

test('DP04 URL identity only merges proven aliases; same names and different query editions remain separate', () => {
  assert.equal(canonicalDiscoveryUrl('https://luma.com/agents?utm_source=mail#info'), 'https://lu.ma/agents');
  assert.equal(canonicalDiscoveryUrl('https://lu.ma/agents'), 'https://lu.ma/agents');
  assert.notEqual(canonicalDiscoveryUrl('https://events.example/event?edition=2025'), canonicalDiscoveryUrl('https://events.example/event?edition=2026'));
  for (const url of ['javascript:alert(1)', 'https://user:secret@example.com/path', 'http://127.0.0.1/x', 'https://localhost/x']) assert.equal(canonicalDiscoveryUrl(url),null);
  const parsed = parseExaResponse({ results: [{ url: 'https://events.example/a', title: 'Same name', publishedDate: '2020-01-01', text: 'San Francisco. Free. A sponsor.' }, { url: 'https://events.example/b', title: 'Same name' }, { url: 'javascript:alert(1)' }] }, 'op-1', 5);
  assert.equal(parsed.pages.length,2); assert.equal(parsed.costUsd,null); assert.equal(parsed.discardedResults,1);
  assert.ok(parseDiscoveryResponse(parsed).ok); assert.equal(parsed.pages[0].publishedAt,'2020-01-01T00:00:00.000Z');
  assert.equal('city' in parsed.pages[0],false); assert.equal('cost' in parsed.pages[0],false);
});

test('DP04 transport bounds requests, bodies and timeouts; never echoes provider credentials/errors', async () => {
  let calls = 0;
  const result = await searchExa({ apiKey: 'private-test-key', query: 'developer workshops', operationId: 'op', numResults: 2, timeoutMs: 500,
    fetchImpl: (async (url, init) => {
      calls++; assert.equal(url,EXA_SEARCH_URL); assert.equal(init?.redirect,'error');
      const body = JSON.parse(String(init?.body)); assert.equal(body.numResults,2); assert.equal(body.type,'auto'); assert.equal(body.startPublishedDate,undefined);
      return Response.json({ results: [{ url: 'https://events.example/a', text: 'private-test-key' }], costDollars: { total: .007 }, requestId: 'public-request-id', apiKey: 'private-test-key' });
    }) as typeof fetch });
  assert.equal(calls,1); assert.equal(result.costUsd,.007); assert.ok(!JSON.stringify(result).includes('private-test-key'));
  for (const code of [429,402,401,500]) {
    await assert.rejects(searchExa({ apiKey: 'test', query: 'query', operationId: 'op', numResults: 5, timeoutMs: 500, fetchImpl: (async () => new Response('DO NOT EXPOSE private-error', { status: code })) as typeof fetch }), e => e instanceof Error && !e.message.includes('private-error'));
  }
  await assert.rejects(searchExa({ apiKey:'test',query:'q',operationId:'op',numResults:5,timeoutMs:20,fetchImpl: (() => new Promise<Response>(() => {})) as typeof fetch }), /timed out/);
  for (const body of ['not json', JSON.stringify({ results: [], padding: 'x'.repeat(300000) }), JSON.stringify({ missing: [] })]) {
    await assert.rejects(searchExa({ apiKey:'test',query:'q',operationId:'op',numResults:5,timeoutMs:500,fetchImpl: (async () => new Response(body)) as typeof fetch }), /invalid/);
  }
});
