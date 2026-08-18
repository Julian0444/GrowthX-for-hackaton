import { createHmac, timingSafeEqual } from 'node:crypto';

const LINQ_BASE_URL = 'https://api.linqapp.com/api/partner/v3';
const REQUEST_TIMEOUT_MS = 8000;

export interface LinqInboundMessage {
  kind: 'message';
  eventId: string;
  messageId: string;
  from: string;
  chatId: string;
  text: string;
  receivedAt: string;
  service: string;
  isGroup: boolean;
}

export interface LinqInboundReaction {
  kind: 'reaction';
  eventId: string;
  messageId: string;
  from: string;
  chatId: string;
  reaction: string;
  receivedAt: string;
  service: string;
}

export interface LinqInboundLocation {
  kind: 'location_started' | 'location_stopped';
  eventId: string;
  sharedBy: string;
  sharedWith: string;
  receivedAt: string;
  endsAt: string | null;
}

export type LinqInboundEvent =
  | LinqInboundMessage
  | LinqInboundReaction
  | LinqInboundLocation;

export interface LinqSendResult {
  ok: boolean;
  id: string | null;
  chatId: string | null;
  service?: string | null;
  error?: string;
  status?: number;
  mocked?: boolean;
}

export interface LinqLocation {
  handle: string;
  lat: number;
  lng: number;
  altitude: number | null;
  address: string | null;
  locality: string | null;
  updatedAt: string | null;
}

export interface LinqLocationResult {
  ok: boolean;
  locations: LinqLocation[];
  error?: string;
  status?: number;
  mocked?: boolean;
}

function header(headers: Headers, name: string): string | null {
  return headers.get(name) ?? headers.get(name.toLowerCase());
}

function safeEqual(a: string, b: string, encoding: BufferEncoding): boolean {
  const left = Buffer.from(a, encoding);
  const right = Buffer.from(b, encoding);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function verifyLinqWebhook(
  rawBody: string,
  headers: Headers,
  secret: string | null,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (!secret) return process.env.NODE_ENV !== 'production';

  const webhookId = header(headers, 'webhook-id');
  const timestamp = header(headers, 'webhook-timestamp');
  const signatures = header(headers, 'webhook-signature');
  if (webhookId && timestamp && signatures) {
    const numericTimestamp = Number(timestamp);
    if (!Number.isFinite(numericTimestamp) || Math.abs(nowSeconds - numericTimestamp) > 300) {
      return false;
    }
    const encodedSecret = secret.startsWith('whsec_') ? secret.slice(6) : secret;
    const key = Buffer.from(encodedSecret, 'base64');
    if (key.length === 0) return false;
    const expected = createHmac('sha256', key)
      .update(`${webhookId}.${timestamp}.${rawBody}`, 'utf8')
      .digest('base64');
    return signatures
      .split(/\s+/)
      .filter((signature) => signature.startsWith('v1,'))
      .some((signature) => safeEqual(expected, signature.slice(3), 'base64'));
  }

  // Compatibilidad con los headers legacy de Linq.
  const legacySignature =
    header(headers, 'x-webhook-signature') ?? header(headers, 'x-linq-signature');
  if (!legacySignature) return false;
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  return safeEqual(
    expected,
    legacySignature.replace(/^sha256=/i, '').trim(),
    'hex',
  );
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function stringAt(value: unknown, ...paths: string[]): string | null {
  for (const path of paths) {
    let current: unknown = value;
    for (const segment of path.split('.')) {
      const object = record(current);
      current = object?.[segment];
    }
    if (typeof current === 'string' && current) return current;
  }
  return null;
}

function booleanAt(value: unknown, ...paths: string[]): boolean | null {
  for (const path of paths) {
    let current: unknown = value;
    for (const segment of path.split('.')) {
      const object = record(current);
      current = object?.[segment];
    }
    if (typeof current === 'boolean') return current;
  }
  return null;
}

function textFromParts(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return value
    .flatMap((part) => {
      const object = record(part);
      return object?.type === 'text' && typeof object.value === 'string'
        ? [object.value]
        : [];
    })
    .join('\n')
    .trim();
}

export function parseLinqInbound(payload: unknown): LinqInboundEvent | null {
  const envelope = record(payload);
  if (!envelope) return null;
  const eventType =
    typeof envelope.event_type === 'string'
      ? envelope.event_type
      : typeof envelope.type === 'string'
        ? envelope.type
        : '';
  const data = record(envelope.data) ?? envelope;
  const eventId =
    stringAt(envelope, 'event_id') ??
    stringAt(data, 'event_id') ??
    `legacy-${crypto.randomUUID()}`;
  const createdAt =
    stringAt(envelope, 'created_at') ??
    stringAt(data, 'receivedAt', 'received_at', 'reacted_at') ??
    new Date().toISOString();

  if (eventType === 'location.sharing.started' || eventType === 'location.sharing.stopped') {
    const sharedBy = stringAt(data, 'shared_by');
    const sharedWith = stringAt(data, 'shared_with');
    if (!sharedBy || !sharedWith) return null;
    return {
      kind:
        eventType === 'location.sharing.started'
          ? 'location_started'
          : 'location_stopped',
      eventId,
      sharedBy,
      sharedWith,
      receivedAt: stringAt(data, 'began_at') ?? createdAt,
      endsAt: stringAt(data, 'ends_at'),
    };
  }

  if (eventType === 'reaction.added' || eventType === 'reaction') {
    const from = stringAt(data, 'from', 'from_handle.handle');
    const chatId = stringAt(data, 'chat_id', 'threadId');
    const messageId = stringAt(data, 'message_id', 'messageId');
    if (!from || !chatId || !messageId) return null;
    const reactionType = stringAt(data, 'reaction_type', 'reaction') ?? '';
    return {
      kind: 'reaction',
      eventId,
      messageId,
      from,
      chatId,
      reaction:
        reactionType === 'custom'
          ? stringAt(data, 'custom_emoji') ?? reactionType
          : reactionType,
      receivedAt: stringAt(data, 'reacted_at') ?? createdAt,
      service: stringAt(data, 'service', 'from_handle.service') ?? 'unknown',
    };
  }

  if (eventType === 'message.received' || eventType === 'message' || !eventType) {
    const from = stringAt(data, 'sender_handle.handle', 'from', 'from_handle.handle');
    const chatId = stringAt(data, 'chat.id', 'chat_id', 'threadId') ?? from;
    const messageId = stringAt(data, 'id', 'message.id', 'messageId') ?? eventId;
    const parts =
      Array.isArray(data.parts)
        ? data.parts
        : record(data.message)?.parts;
    const text = textFromParts(parts) || stringAt(data, 'text') || '';
    if (!from || !chatId || !text) return null;
    return {
      kind: 'message',
      eventId,
      messageId,
      from,
      chatId,
      text,
      receivedAt: stringAt(data, 'sent_at', 'received_at', 'message.sent_at') ?? createdAt,
      service:
        stringAt(data, 'service', 'sender_handle.service', 'from_handle.service') ??
        'unknown',
      isGroup: booleanAt(data, 'chat.is_group', 'is_group') ?? false,
    };
  }

  return null;
}

async function linqFetch(
  path: string,
  init: RequestInit = {},
): Promise<{ ok: boolean; status: number; body: unknown; error?: string }> {
  const apiKey = process.env.LINQ_API_KEY;
  if (!apiKey) {
    return { ok: false, status: 0, body: null, error: 'LINQ_API_KEY is not configured.' };
  }
  try {
    const response = await fetch(`${LINQ_BASE_URL}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        ...init.headers,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: 'no-store',
    });
    const body: unknown = await response.json().catch(() => null);
    return {
      ok: response.ok,
      status: response.status,
      body,
      error: response.ok
        ? undefined
        : stringAt(body, 'error.message', 'message') ?? `Linq returned HTTP ${response.status}.`,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      body: null,
      error: error instanceof Error ? error.message : 'Linq request failed.',
    };
  }
}

function responseData(body: unknown): Record<string, unknown> | null {
  return record(record(body)?.data) ?? record(body);
}

async function resolveLinqSender(): Promise<
  { ok: true; phoneNumber: string } | { ok: false; error: string; status: number }
> {
  const configured = process.env.LINQ_PHONE_NUMBER;
  if (configured) return { ok: true, phoneNumber: configured };

  const result = await linqFetch('/phone_numbers');
  if (!result.ok) {
    return {
      ok: false,
      error: result.error ?? 'Could not discover a Linq sender number.',
      status: result.status,
    };
  }
  const phoneNumbers = responseData(result.body)?.phone_numbers;
  if (!Array.isArray(phoneNumbers)) {
    return { ok: false, error: 'Linq returned no assigned phone numbers.', status: result.status };
  }
  const available = phoneNumbers
    .map((item) => record(item))
    .filter((item): item is Record<string, unknown> => item != null);
  const healthy =
    available.find((item) => stringAt(item, 'reputation.status') === 'HEALTHY') ??
    available[0];
  const phoneNumber = stringAt(healthy, 'phone_number');
  return phoneNumber
    ? { ok: true, phoneNumber }
    : { ok: false, error: 'Linq returned no assigned phone numbers.', status: result.status };
}

export async function sendLinqMessage(input: {
  chatId: string;
  text: string;
  linkUrl?: string | null;
  replyToMessageId?: string | null;
  idempotencyKey?: string;
}): Promise<LinqSendResult> {
  const text = input.linkUrl ? `${input.text}\n${input.linkUrl}` : input.text;
  const message: Record<string, unknown> = {
    parts: [{ type: 'text', value: text }],
    idempotency_key: input.idempotencyKey ?? crypto.randomUUID(),
  };
  if (input.replyToMessageId) {
    message.reply_to = { message_id: input.replyToMessageId, part_index: 0 };
  }
  const result = await linqFetch(`/chats/${encodeURIComponent(input.chatId)}/messages`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  });
  const data = responseData(result.body);
  return {
    ok: result.ok,
    id: stringAt(data, 'id', 'message.id'),
    chatId: input.chatId,
    service: stringAt(data, 'service', 'message.service'),
    error: result.error,
    status: result.status,
  };
}

export async function createLinqChat(input: {
  to: string;
  text: string;
  linkUrl?: string | null;
  idempotencyKey?: string;
}): Promise<LinqSendResult> {
  const sender = await resolveLinqSender();
  if (!sender.ok) {
    return {
      ok: false,
      id: null,
      chatId: null,
      error: sender.error,
      status: sender.status,
    };
  }
  const text = input.linkUrl ? `${input.text}\n${input.linkUrl}` : input.text;
  const result = await linqFetch('/chats', {
    method: 'POST',
    body: JSON.stringify({
      from: sender.phoneNumber,
      to: [input.to],
      message: {
        parts: [{ type: 'text', value: text }],
        idempotency_key: input.idempotencyKey ?? crypto.randomUUID(),
      },
    }),
  });
  const data = responseData(result.body);
  return {
    ok: result.ok,
    id: stringAt(data, 'chat.message.id', 'message.id', 'id'),
    chatId: stringAt(data, 'chat.id', 'id'),
    service: stringAt(data, 'chat.message.service', 'chat.service', 'message.service', 'service'),
    error: result.error,
    status: result.status,
  };
}

export async function requestLinqLocation(chatId: string): Promise<LinqSendResult> {
  const result = await linqFetch(`/chats/${encodeURIComponent(chatId)}/location/request`, {
    method: 'POST',
  });
  return {
    ok: result.ok,
    id: null,
    chatId,
    error: result.error,
    status: result.status,
  };
}

export async function getLinqLocation(chatId: string): Promise<LinqLocationResult> {
  const result = await linqFetch(`/chats/${encodeURIComponent(chatId)}/location`);
  if (!result.ok) {
    return { ok: false, locations: [], error: result.error, status: result.status };
  }
  const data = responseData(result.body);
  const features = Array.isArray(data?.features) ? data.features : [];
  const locations = features.flatMap((feature): LinqLocation[] => {
    const object = record(feature);
    const geometry = record(object?.geometry);
    const properties = record(object?.properties);
    const coordinates = Array.isArray(geometry?.coordinates) ? geometry.coordinates : [];
    const lng = coordinates[0];
    const lat = coordinates[1];
    if (typeof lat !== 'number' || typeof lng !== 'number') return [];
    return [{
      handle: typeof properties?.handle === 'string' ? properties.handle : '',
      lat,
      lng,
      altitude: typeof coordinates[2] === 'number' ? coordinates[2] : null,
      address: typeof properties?.address === 'string' ? properties.address : null,
      locality: typeof properties?.locality === 'string' ? properties.locality : null,
      updatedAt:
        typeof properties?.updated_at === 'string' ? properties.updated_at : null,
    }];
  });
  return { ok: true, locations };
}

export const linq = {
  verifySignature: verifyLinqWebhook,
  parseInbound: parseLinqInbound,
  sendMessage: sendLinqMessage,
  createChat: createLinqChat,
  requestLocation: requestLinqLocation,
  getLocation: getLinqLocation,
};
