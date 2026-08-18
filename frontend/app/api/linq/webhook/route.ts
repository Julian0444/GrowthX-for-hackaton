import { NextResponse } from 'next/server';

import type { CampaignDraft, SearchRequest, SearchResponse } from '@/lib/contracts/growxth';
import { linq, type LinqInboundMessage, type LinqLocation } from '@/lib/server/connectors/linq';
import {
  createSharedSearch,
  getChat,
  getChatByHandle,
  getLaunchByMessage,
  getLatestLaunchForChat,
  markWebhookEvent,
  registerChat,
  setChatSearch,
  updateLaunch,
} from '@/lib/server/connectors/linq-session-store';
import { resolvePublicAppUrl } from '@/lib/server/env';
import { formatSmsReply } from '@/lib/server/format/sms-reply';
import { searchOrFixture } from '@/lib/server/pipeline/resolve';
import {
  ensureCampaign,
  setCampaignLaunch,
} from '@/lib/server/research/store';

const STACK_VOCAB: Array<[string, string]> = [
  ['python', 'Python'],
  ['fastapi', 'FastAPI'],
  ['postgres', 'Postgres'],
  ['rust', 'Rust'],
  ['wasm', 'WebAssembly'],
  ['security', 'Security'],
  ['auth0', 'Security'],
  ['typescript', 'TypeScript'],
  ['javascript', 'JavaScript'],
  ['react', 'React'],
  ['kubernetes', 'Kubernetes'],
  ['data', 'Data'],
  ['observability', 'Observability'],
  ['ai', 'AI'],
  ['llm', 'LLM'],
  ['agent', 'AI agents'],
  ['mcp', 'MCP'],
];

function parseSearchRequest(text: string): SearchRequest {
  const lower = text.toLowerCase();
  const icpStack = [
    ...new Set(
      STACK_VOCAB.filter(([needle]) => lower.includes(needle)).map(([, label]) => label),
    ),
  ];
  const goal: SearchRequest['goal'] = /hiring|recruit|talent/.test(lower)
    ? 'hiring'
    : /awareness|brand/.test(lower)
      ? 'awareness'
      : /feedback/.test(lower)
        ? 'feedback'
        : 'adoption';
  return { product: text.trim(), icpStack, budgetUsd: 0, goal };
}

function locationIntent(text: string): boolean {
  return /\b(near me|nearby|closest|cerca|cercano|ubicaci[oó]n|location)\b/i.test(text);
}

// ---- Ubicación por POLLING ----
// La documentación de Linq incluye location.sharing.*, pero la cuenta actual
// no tiene habilitada esa capacidad. Como respaldo, tras pedir la ubicación
// sondeamos GET /chats/{id}/location hasta ~2 min; al aparecer coordenadas se
// dispara el mismo re-ranking que haría el evento.
const activeLocationPolls = new Set<string>();
const LOCATION_POLL_INTERVAL_MS = 5000;
const LOCATION_POLL_MAX_TRIES = 24;

function pickLocation(locations: LinqLocation[], handle: string): LinqLocation | null {
  return locations.find((item) => item.handle === handle) ?? locations[0] ?? null;
}

async function rankWithLocation(
  chatId: string,
  handle: string,
  location: LinqLocation,
  eventId: string,
): Promise<boolean> {
  const session = getChat(chatId);
  if (!session?.lastRequest) return false;
  const locationRequest: SearchRequest = {
    ...session.lastRequest,
    location: {
      lat: location.lat,
      lng: location.lng,
      source: 'linq',
      locality: location.locality,
      updatedAt: location.updatedAt,
    },
  };
  const syntheticMessage: LinqInboundMessage = {
    kind: 'message',
    eventId,
    messageId: eventId,
    from: handle,
    chatId,
    text: session.lastRequest.product,
    receivedAt: new Date().toISOString(),
    service: session.service,
    isGroup: session.isGroup,
  };
  await deliverSearch(syntheticMessage, locationRequest);
  return true;
}

function startLocationPoll(chatId: string, handle: string, eventId: string): void {
  if (activeLocationPolls.has(chatId)) return;
  activeLocationPolls.add(chatId);
  let tries = 0;
  const tick = async (): Promise<void> => {
    tries += 1;
    try {
      const result = await linq.getLocation(chatId);
      const location = result.ok ? pickLocation(result.locations, handle) : null;
      if (location) {
        activeLocationPolls.delete(chatId);
        await rankWithLocation(chatId, handle, location, `${eventId}-poll-${tries}`);
        return;
      }
    } catch {
      // Falla transitoria del GET: se reintenta hasta agotar los tries.
    }
    if (tries < LOCATION_POLL_MAX_TRIES) {
      setTimeout(() => void tick(), LOCATION_POLL_INTERVAL_MS);
    } else {
      activeLocationPolls.delete(chatId);
    }
  };
  setTimeout(() => void tick(), LOCATION_POLL_INTERVAL_MS);
}

function approvalIntent(text: string): 'approved' | 'rejected' | 'needs_evidence' | null {
  if (/^(approve|approved|yes|si|sí|go|launch|send|✅|👍)\b/i.test(text.trim())) return 'approved';
  if (/^(reject|rejected|no|stop|👎)\b/i.test(text.trim())) return 'rejected';
  if (/\b(evidence|proof|source|fuente|prueba|\?)\b/i.test(text)) return 'needs_evidence';
  return null;
}

function reactionState(
  reaction: string,
): 'approved' | 'rejected' | 'needs_evidence' | null {
  if (/dislike|👎/i.test(reaction)) return 'rejected';
  if (/question|\?|❓/i.test(reaction)) return 'needs_evidence';
  if (/^(like|love|👍|❤️|✅)$/i.test(reaction.trim())) return 'approved';
  return null;
}

function registerTopCampaign(response: SearchResponse): CampaignDraft | null {
  const campaign = response.opportunities[0]?.campaign ?? null;
  if (campaign) ensureCampaign(campaign);
  return campaign;
}

async function deliverSearch(
  event: LinqInboundMessage,
  request: SearchRequest,
): Promise<{
  response: SearchResponse;
  sent: Awaited<ReturnType<typeof linq.sendMessage>>;
  shareId: string;
}> {
  const response = await searchOrFixture(request);
  setChatSearch(event.chatId, request, response);
  registerTopCampaign(response);
  const shared = createSharedSearch(response, response.opportunities[0]?.id ?? null);
  const reply = formatSmsReply(response, {
    baseUrl: resolvePublicAppUrl(),
    request,
    shareId: shared.id,
  });
  const sent = await linq.sendMessage({
    chatId: event.chatId,
    text: reply,
    replyToMessageId: event.messageId,
    idempotencyKey: `search-${event.eventId}`,
  });
  return { response, sent, shareId: shared.id };
}

async function handleMessage(event: LinqInboundMessage): Promise<NextResponse> {
  const session = registerChat({
    chatId: event.chatId,
    handle: event.from,
    service: event.service,
    isGroup: event.isGroup,
  });

  const requestedState = approvalIntent(event.text);
  const latestLaunch = getLatestLaunchForChat(event.chatId);
  if (requestedState && latestLaunch) {
    updateLaunch(latestLaunch.messageId, requestedState);
    setCampaignLaunch(latestLaunch.campaignId, { state: requestedState });
    const sent = await linq.sendMessage({
      chatId: event.chatId,
      text:
        requestedState === 'approved'
          ? 'Campaign approved. The market score stays unchanged; this confirms the launch decision.'
          : requestedState === 'rejected'
            ? 'Campaign rejected. Nothing was sent.'
            : 'Evidence requested. I’ll keep the campaign pending.',
      replyToMessageId: event.messageId,
      idempotencyKey: `decision-${event.eventId}`,
    });
    return NextResponse.json({ ok: true, handled: 'campaign_decision', state: requestedState, sent });
  }

  if (locationIntent(event.text)) {
    const request =
      session.lastRequest ??
      parseSearchRequest(
        event.text.replace(
          /\b(near me|nearby|closest|cerca|cercano|ubicaci[oó]n|location)\b/gi,
          '',
        ),
      );
    if (!request.product.trim()) {
      const sent = await linq.sendMessage({
        chatId: event.chatId,
        text: 'Tell me what you are growing first, then say “near me”.',
        replyToMessageId: event.messageId,
        idempotencyKey: `location-missing-query-${event.eventId}`,
      });
      return NextResponse.json({ ok: true, handled: 'location_needs_query', sent });
    }
    setChatSearch(event.chatId, request, null);
    // Si ya está compartiendo (Find My), respondemos al instante sin re-pedir.
    const current = await linq.getLocation(event.chatId);
    const already = current.ok ? pickLocation(current.locations, event.from) : null;
    if (already) {
      const ranked = await rankWithLocation(event.chatId, event.from, already, event.eventId);
      if (ranked) {
        return NextResponse.json({
          ok: true,
          handled: 'location_ranked',
          locality: already.locality,
        });
      }
    }
    const requested = await linq.requestLocation(event.chatId);
    const text = requested.ok
      ? 'Share your location in the iMessage prompt. I only use it to break close ranking ties and show distance; it never changes the market score.'
      : requested.status === 409
        ? 'Linq location sharing works only in a 1:1 iMessage chat. Send a neighborhood instead and I’ll use that as context.'
        : `I could not request location yet: ${requested.error ?? 'Linq is unavailable.'}`;
    const sent = await linq.sendMessage({
      chatId: event.chatId,
      text,
      replyToMessageId: event.messageId,
      idempotencyKey: `location-request-${event.eventId}`,
    });
    // Si el webhook de location no está habilitado, el poll detecta el share.
    if (requested.ok) startLocationPoll(event.chatId, event.from, event.eventId);
    return NextResponse.json({
      ok: requested.ok,
      handled: 'location_requested',
      polling: requested.ok,
      requested,
      sent,
    });
  }

  const request = parseSearchRequest(event.text);
  const delivered = await deliverSearch(event, request);
  return NextResponse.json({
    ok: true,
    handled: 'message',
    plays: delivered.response.opportunities.length,
    degraded: delivered.response.degraded,
    shareId: delivered.shareId,
    sent: delivered.sent,
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  const rawBody = await request.text();
  if (!linq.verifySignature(rawBody, request.headers, process.env.LINQ_WEBHOOK_SECRET ?? null)) {
    return NextResponse.json({ ok: false, error: 'invalid signature' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 });
  }

  const event = linq.parseInbound(payload);
  if (!event) {
    return NextResponse.json({ ok: false, error: 'unrecognized event' }, { status: 400 });
  }
  if (!markWebhookEvent(event.eventId)) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  if (event.kind === 'message') return handleMessage(event);

  if (event.kind === 'reaction') {
    const launch = getLaunchByMessage(event.messageId);
    if (!launch) {
      return NextResponse.json({ ok: true, handled: 'reaction_unmatched' });
    }
    const nextState = reactionState(event.reaction);
    if (!nextState) {
      return NextResponse.json({
        ok: true,
        handled: 'reaction_ignored',
        reaction: event.reaction,
      });
    }
    updateLaunch(event.messageId, nextState);
    setCampaignLaunch(launch.campaignId, { state: nextState });
    const sent = await linq.sendMessage({
      chatId: event.chatId,
      text:
        nextState === 'approved'
          ? 'Campaign approved via Linq. Market confidence did not change.'
          : nextState === 'rejected'
            ? 'Campaign rejected via Linq.'
            : 'Campaign paused until the requested evidence is available.',
      idempotencyKey: `reaction-${event.eventId}`,
    });
    return NextResponse.json({
      ok: true,
      handled: 'reaction',
      campaignId: launch.campaignId,
      state: nextState,
      sent,
    });
  }

  if (event.kind === 'location_stopped') {
    return NextResponse.json({ ok: true, handled: 'location_stopped' });
  }

  const session = getChatByHandle(event.sharedBy);
  if (!session?.lastRequest) {
    return NextResponse.json({ ok: true, handled: 'location_without_search' });
  }
  const locationResult = await linq.getLocation(session.chatId);
  const location =
    locationResult.locations.find((item) => item.handle === event.sharedBy) ??
    locationResult.locations[0];
  if (!location) {
    const sent = await linq.sendMessage({
      chatId: session.chatId,
      text: 'Location sharing started, but Linq has not returned coordinates yet. I’ll keep the last ranking unchanged.',
      idempotencyKey: `location-empty-${event.eventId}`,
    });
    return NextResponse.json({ ok: true, handled: 'location_empty', sent });
  }

  const locationRequest: SearchRequest = {
    ...session.lastRequest,
    location: {
      lat: location.lat,
      lng: location.lng,
      source: 'linq',
      locality: location.locality,
      updatedAt: location.updatedAt,
    },
  };
  const syntheticMessage: LinqInboundMessage = {
    kind: 'message',
    eventId: event.eventId,
    messageId: event.eventId,
    from: event.sharedBy,
    chatId: session.chatId,
    text: session.lastRequest.product,
    receivedAt: event.receivedAt,
    service: session.service,
    isGroup: session.isGroup,
  };
  const delivered = await deliverSearch(syntheticMessage, locationRequest);
  return NextResponse.json({
    ok: true,
    handled: 'location_ranked',
    locality: location.locality,
    shareId: delivered.shareId,
    sent: delivered.sent,
  });
}
