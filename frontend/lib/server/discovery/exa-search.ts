import { createHash } from 'node:crypto';
import type { DiscoveryResponse } from '../../contracts/discovery.ts';
import { canonicalizeLumaUrl } from '../catalog/luma-adapter.ts';

export const EXA_SEARCH_URL = 'https://api.exa.ai/search';
const MAX_RESPONSE_BYTES = 256_000;
export const discoveryId = (prefix: string, value: string) => `${prefix}-${createHash('sha256').update(value).digest('hex')}`;

// Only proven Luma host aliases and URL syntax equivalence. Preserve other
// paths, query parameters and editions; matching titles never merge pages.
export function canonicalDiscoveryUrl(raw: string): string | null {
  if (raw.length > 2048) return null;
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) return null;
  const host = url.hostname;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || !host.includes('.') || /^[\d.]+$/.test(host) || host.includes(':')) return null;
  const luma = canonicalizeLumaUrl(raw);
  if (luma.ok) return luma.canonical;
  url.hash = '';
  return url.toString();
}

export class ExaSearchFailure extends Error {
  constructor(code: 'rate_limit' | 'quota' | 'authentication' | 'timeout' | 'network' | 'invalid_response' | 'http') {
    super({ rate_limit: 'Exa rate-limited the request (429). No automatic retry.', quota: 'Exa reported an exhausted allowance (402).', authentication: 'Exa rejected the credential (401/403).', timeout: 'Exa timed out; usage unknown.', network: 'Connection to Exa failed; usage unknown.', invalid_response: 'Exa returned an invalid or oversized response; usage unknown.', http: 'Exa returned an HTTP error; usage unknown.' }[code]);
  }
}
const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const string = (v: unknown, max: number): string | null => typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;

export function parseExaResponse(raw: unknown, operationId: string, maxResults: number): DiscoveryResponse {
  if (!record(raw) || !Array.isArray(raw.results)) throw new ExaSearchFailure('invalid_response');
  const response: DiscoveryResponse = { requestId: string(raw.requestId, 200), pages: [], costUsd: record(raw.costDollars) && typeof raw.costDollars.total === 'number' && Number.isFinite(raw.costDollars.total) && raw.costDollars.total >= 0 ? raw.costDollars.total : null, discardedResults: Math.max(0, raw.results.length - maxResults) };
  for (const item of raw.results.slice(0, maxResults)) {
    const url = record(item) && typeof item.url === 'string' ? item.url : '';
    const canonicalUrl = canonicalDiscoveryUrl(url);
    if (!record(item) || !canonicalUrl) { response.discardedResults++; continue; }
    const date = string(item.publishedDate, 40);
    response.pages.push({ url, canonicalUrl, title: string(item.title, 250) ?? canonicalUrl, publishedAt: date && !Number.isNaN(Date.parse(date)) ? new Date(date).toISOString() : null, author: string(item.author, 160), excerpt: string(item.text, 700), sourceId: discoveryId('exa-source', `${operationId}:${response.pages.length}:${url}`) });
  }
  return response;
}

export async function searchExa(input: { apiKey: string; query: string; operationId: string; numResults: number; timeoutMs: number; fetchImpl?: typeof fetch }): Promise<DiscoveryResponse> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new ExaSearchFailure('timeout')); }, input.timeoutMs); });
  try {
    return await Promise.race([timedOut, (async () => {
      const response = await (input.fetchImpl ?? fetch)(EXA_SEARCH_URL, {
        method: 'POST', redirect: 'error', signal: controller.signal,
        headers: { 'x-api-key': input.apiKey, 'content-type': 'application/json' },
        body: JSON.stringify({ query: input.query, type: 'auto', numResults: input.numResults, contents: { text: { maxCharacters: 700 } } }),
      });
      if (!response.ok) {
        void response.body?.cancel();
        throw new ExaSearchFailure(response.status === 429 ? 'rate_limit' : response.status === 402 ? 'quota' : [401,403].includes(response.status) ? 'authentication' : 'http');
      }
      const reader = response.body?.getReader();
      if (!reader) throw new ExaSearchFailure('invalid_response');
      const chunks: Uint8Array[] = []; let length = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          length += value.byteLength;
          if (length > MAX_RESPONSE_BYTES) throw new ExaSearchFailure('invalid_response');
          chunks.push(value);
        }
      } finally { void reader.cancel(); }
      let raw: unknown;
      try { raw = JSON.parse(Buffer.concat(chunks).toString('utf8').replaceAll(input.apiKey, '[redacted]')); }
      catch { throw new ExaSearchFailure('invalid_response'); }
      return parseExaResponse(raw, input.operationId, input.numResults);
    })()]);
  } catch (error) {
    if (error instanceof ExaSearchFailure) throw error;
    throw new ExaSearchFailure(controller.signal.aborted ? 'timeout' : 'network');
  } finally { clearTimeout(timer); controller.abort(); }
}
