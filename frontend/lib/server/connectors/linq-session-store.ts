import type { SearchRequest, SearchResponse } from '@/lib/contracts/growxth';

export interface LinqChatSession {
  chatId: string;
  handle: string;
  service: string;
  isGroup: boolean;
  lastRequest: SearchRequest | null;
  lastResponse: SearchResponse | null;
  updatedAt: string;
}

export interface LinqLaunch {
  campaignId: string;
  opportunityId: string;
  chatId: string;
  messageId: string;
  state: 'sent' | 'approved' | 'rejected' | 'needs_evidence';
  updatedAt: string;
}

interface SharedSearch {
  response: SearchResponse;
  focusOpportunityId: string | null;
  expiresAt: number;
}

interface LinqGlobalState {
  chats: Map<string, LinqChatSession>;
  handles: Map<string, string>;
  launches: Map<string, LinqLaunch>;
  sharedSearches: Map<string, SharedSearch>;
  processedEvents: Map<string, number>;
  latestChatId: string | null;
}

const globalLinq = globalThis as typeof globalThis & {
  __growxthLinq?: LinqGlobalState;
};

function state(): LinqGlobalState {
  globalLinq.__growxthLinq ??= {
    chats: new Map(),
    handles: new Map(),
    launches: new Map(),
    sharedSearches: new Map(),
    processedEvents: new Map(),
    latestChatId: null,
  };
  return globalLinq.__growxthLinq;
}

export function registerChat(
  chat: Pick<LinqChatSession, 'chatId' | 'handle' | 'service' | 'isGroup'>,
): LinqChatSession {
  const current = state().chats.get(chat.chatId);
  const session: LinqChatSession = {
    ...chat,
    lastRequest: current?.lastRequest ?? null,
    lastResponse: current?.lastResponse ?? null,
    updatedAt: new Date().toISOString(),
  };
  state().chats.set(chat.chatId, session);
  state().handles.set(chat.handle, chat.chatId);
  state().latestChatId = chat.chatId;
  return session;
}

export function setChatSearch(
  chatId: string,
  request: SearchRequest,
  response: SearchResponse | null,
): LinqChatSession | null {
  const session = state().chats.get(chatId);
  if (!session) return null;
  session.lastRequest = request;
  session.lastResponse = response;
  session.updatedAt = new Date().toISOString();
  return session;
}

export function getChat(chatId: string): LinqChatSession | null {
  return state().chats.get(chatId) ?? null;
}

export function getChatByHandle(handle: string): LinqChatSession | null {
  const chatId = state().handles.get(handle);
  return chatId ? getChat(chatId) : null;
}

export function getLatestChat(): LinqChatSession | null {
  const latestChatId = state().latestChatId;
  return latestChatId ? getChat(latestChatId) : null;
}

export function registerLaunch(launch: Omit<LinqLaunch, 'state' | 'updatedAt'>): LinqLaunch {
  const item: LinqLaunch = {
    ...launch,
    state: 'sent',
    updatedAt: new Date().toISOString(),
  };
  state().launches.set(item.messageId, item);
  return item;
}

export function getLaunchByMessage(messageId: string): LinqLaunch | null {
  return state().launches.get(messageId) ?? null;
}

export function getLatestLaunchForChat(chatId: string): LinqLaunch | null {
  return (
    [...state().launches.values()]
      .filter((launch) => launch.chatId === chatId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null
  );
}

export function updateLaunch(
  messageId: string,
  nextState: LinqLaunch['state'],
): LinqLaunch | null {
  const launch = getLaunchByMessage(messageId);
  if (!launch) return null;
  launch.state = nextState;
  launch.updatedAt = new Date().toISOString();
  return launch;
}

export function createSharedSearch(
  response: SearchResponse,
  focusOpportunityId: string | null,
): { id: string; expiresAt: string } {
  const id = crypto.randomUUID();
  const expiresAt = Date.now() + 30 * 60 * 1000;
  state().sharedSearches.set(id, { response, focusOpportunityId, expiresAt });
  return { id, expiresAt: new Date(expiresAt).toISOString() };
}

export function getSharedSearch(id: string): SharedSearch | null {
  const item = state().sharedSearches.get(id);
  if (!item) return null;
  if (item.expiresAt <= Date.now()) {
    state().sharedSearches.delete(id);
    return null;
  }
  return item;
}

export function markWebhookEvent(eventId: string): boolean {
  const now = Date.now();
  for (const [id, timestamp] of state().processedEvents) {
    if (now - timestamp > 60 * 60 * 1000) state().processedEvents.delete(id);
  }
  if (state().processedEvents.has(eventId)) return false;
  state().processedEvents.set(eventId, now);
  return true;
}
