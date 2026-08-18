import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';

import {
  createLinqChat,
  parseLinqInbound,
  verifyLinqWebhook,
} from '../../lib/server/connectors/linq.ts';

test('parses official message.received payloads', () => {
  const parsed = parseLinqInbound({
    event_type: 'message.received',
    event_id: 'evt-1',
    created_at: '2026-07-24T20:00:00Z',
    data: {
      id: 'msg-1',
      chat: { id: 'chat-1', is_group: false },
      sender_handle: { handle: '+14155550123', service: 'iMessage' },
      parts: [{ type: 'text', value: 'Python SDK near me' }],
    },
  });
  assert.deepEqual(parsed, {
    kind: 'message',
    eventId: 'evt-1',
    messageId: 'msg-1',
    from: '+14155550123',
    chatId: 'chat-1',
    text: 'Python SDK near me',
    receivedAt: '2026-07-24T20:00:00Z',
    service: 'iMessage',
    isGroup: false,
  });
});

test('parses reactions and location sharing without treating them as market evidence', () => {
  const reaction = parseLinqInbound({
    event_type: 'reaction.added',
    event_id: 'evt-2',
    data: {
      chat_id: 'chat-1',
      message_id: 'msg-out',
      reaction_type: 'love',
      from: '+14155550123',
    },
  });
  assert.equal(reaction?.kind, 'reaction');
  if (reaction?.kind === 'reaction') assert.equal(reaction.reaction, 'love');

  const location = parseLinqInbound({
    event_type: 'location.sharing.started',
    event_id: 'evt-3',
    data: {
      shared_by: '+14155550123',
      shared_with: '+14155550999',
      began_at: '2026-07-24T20:00:00Z',
      ends_at: '2026-07-24T21:00:00Z',
    },
  });
  assert.equal(location?.kind, 'location_started');
});

test('verifies official Linq webhook signatures and rejects stale timestamps', () => {
  const raw = '{"event_type":"message.received"}';
  const key = Buffer.from('local-webhook-test-key');
  const secret = `whsec_${key.toString('base64')}`;
  const webhookId = 'msg_test';
  const timestamp = 1_700_000_000;
  const signature = createHmac('sha256', key)
    .update(`${webhookId}.${timestamp}.${raw}`)
    .digest('base64');
  const headers = new Headers({
    'webhook-id': webhookId,
    'webhook-timestamp': String(timestamp),
    'webhook-signature': `v1,${signature}`,
  });
  assert.equal(verifyLinqWebhook(raw, headers, secret, timestamp + 10), true);
  assert.equal(verifyLinqWebhook(raw, headers, secret, timestamp + 301), false);
});

test('discovers an assigned healthy sender before creating a new chat', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.LINQ_API_KEY;
  const originalPhone = process.env.LINQ_PHONE_NUMBER;
  const calls: Array<{ url: string; body: unknown }> = [];
  process.env.LINQ_API_KEY = 'test-key';
  delete process.env.LINQ_PHONE_NUMBER;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({
      url,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
    });
    if (url.endsWith('/phone_numbers')) {
      return Response.json({
        phone_numbers: [
          {
            id: 'line-1',
            phone_number: '+12025550199',
            reputation: { status: 'HEALTHY' },
          },
        ],
      });
    }
    return Response.json({
      chat: {
        id: 'chat-1',
        service: 'iMessage',
        message: { id: 'message-1', service: 'iMessage' },
      },
    });
  }) as typeof fetch;

  try {
    const result = await createLinqChat({
      to: '+14155550123',
      text: 'Campaign ready for approval.',
    });
    assert.equal(result.ok, true);
    assert.equal(result.chatId, 'chat-1');
    assert.equal(result.id, 'message-1');
    assert.equal(
      (calls[1]?.body as { from?: string } | null)?.from,
      '+12025550199',
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey == null) delete process.env.LINQ_API_KEY;
    else process.env.LINQ_API_KEY = originalKey;
    if (originalPhone == null) delete process.env.LINQ_PHONE_NUMBER;
    else process.env.LINQ_PHONE_NUMBER = originalPhone;
  }
});
