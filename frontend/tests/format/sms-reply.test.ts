import assert from 'node:assert/strict';
import test from 'node:test';

import type { SearchResponse } from '../../lib/contracts/growxth.ts';
import { formatSmsReply } from '../../lib/server/format/sms-reply.ts';

test('includes a durable query fallback in every Linq market link', () => {
  const response = {
    opportunities: [
      { id: 'opp-tokyo', title: 'Tokyo developer market', distanceMiles: null },
      { id: 'opp-seoul', title: 'Seoul developer market', distanceMiles: null },
      { id: 'opp-sf', title: 'San Francisco developer market', distanceMiles: null },
    ],
  } as SearchResponse;

  const reply = formatSmsReply(response, {
    baseUrl: 'https://growxth.vercel.app/',
    shareId: 'share-that-may-expire',
    request: {
      product: 'AI observability for Python teams',
      icpStack: ['Python', 'AI'],
      budgetUsd: 0,
      goal: 'adoption',
    },
  });

  assert.equal((reply.match(/q=AI\+observability\+for\+Python\+teams/g) ?? []).length, 3);
  assert.equal((reply.match(/g=adoption/g) ?? []).length, 3);
  assert.equal((reply.match(/s=Python%2CAI/g) ?? []).length, 3);
  assert.equal((reply.match(/linq=/g) ?? []).length, 0);
  assert.equal(reply.split('\n').length, 4);
  assert.ok(reply.length <= 500);
});
