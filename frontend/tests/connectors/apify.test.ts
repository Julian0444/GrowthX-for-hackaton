import assert from 'node:assert/strict';
import test from 'node:test';

import { runApifyActor } from '../../lib/server/connectors/apify.ts';

test('runs an Actor with server-side auth and reads its dataset', async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.APIFY_TOKEN;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  process.env.APIFY_TOKEN = 'test-apify-token';

  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = String(input);
    calls.push({ url, init });
    if (url.includes('/runs?')) {
      return Response.json({
        data: { id: 'run-1', status: 'READY', defaultDatasetId: 'dataset-1' },
      });
    }
    if (url.includes('/actor-runs/run-1?')) {
      return Response.json({
        data: { id: 'run-1', status: 'SUCCEEDED', defaultDatasetId: 'dataset-1' },
      });
    }
    if (url.includes('/actor-runs/run-1/dataset/items')) {
      return Response.json([{ id: 'item-1' }]);
    }
    return Response.json({ error: { message: 'unexpected request' } }, { status: 500 });
  }) as typeof fetch;

  try {
    const result = await runApifyActor(
      'apidojo/tweet-scraper',
      { searchTerms: ['developer tools'] },
      { waitSeconds: 1, maxItems: 10, maxTotalChargeUsd: 0.02 },
    );
    assert.equal(result.status, 'SUCCEEDED');
    assert.deepEqual(result.items, [{ id: 'item-1' }]);
    assert.match(calls[0]?.url ?? '', /actors\/apidojo~tweet-scraper\/runs/);
    assert.equal(
      new Headers(calls[0]?.init?.headers).get('authorization'),
      'Bearer test-apify-token',
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken == null) delete process.env.APIFY_TOKEN;
    else process.env.APIFY_TOKEN = originalToken;
  }
});

test('degrades without exposing or requiring a token', async () => {
  const originalToken = process.env.APIFY_TOKEN;
  delete process.env.APIFY_TOKEN;
  try {
    const result = await runApifyActor('apidojo/tweet-scraper', {});
    assert.equal(result.status, 'UNAVAILABLE');
    assert.deepEqual(result.items, []);
  } finally {
    if (originalToken != null) process.env.APIFY_TOKEN = originalToken;
  }
});

test('keeps partial dataset items when an Actor exceeds its wait budget', async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.APIFY_TOKEN;
  process.env.APIFY_TOKEN = 'test-apify-token';

  globalThis.fetch = (async (
    input: string | URL | Request,
  ): Promise<Response> => {
    const url = String(input);
    if (url.includes('/runs?')) {
      return Response.json({
        data: { id: 'run-partial', status: 'READY', defaultDatasetId: 'dataset-partial' },
      });
    }
    if (url.includes('/actor-runs/run-partial?')) {
      return Response.json({
        data: { id: 'run-partial', status: 'RUNNING', defaultDatasetId: 'dataset-partial' },
      });
    }
    if (url.endsWith('/abort')) {
      return Response.json({ data: { id: 'run-partial', status: 'ABORTED' } });
    }
    if (url.includes('/dataset/items')) {
      return Response.json([{ id: 'partial-item' }]);
    }
    return Response.json({ error: { message: 'unexpected request' } }, { status: 500 });
  }) as typeof fetch;

  try {
    const result = await runApifyActor(
      'example/slow-actor',
      {},
      { waitSeconds: 1 },
    );
    assert.equal(result.status, 'TIMED-OUT');
    assert.deepEqual(result.items, [{ id: 'partial-item' }]);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken == null) delete process.env.APIFY_TOKEN;
    else process.env.APIFY_TOKEN = originalToken;
  }
});
