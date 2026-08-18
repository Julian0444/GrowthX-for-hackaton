// Exa live discovery: por cada mercado top, busca eventos/hackathons reales
// próximos en esa ciudad y los adjunta como Evidence citable (URL + fecha, así
// pasa la auditoría de labels como Observed). Degradación: sin EXA_API_KEY o
// ante fallo de red, la respuesta original queda intacta y 'exa' se reporta en
// sourcesFailed. Nunca lanza.

import type {
  Evidence,
  EvidenceSource,
  Opportunity,
  SearchRequest,
  SearchResponse,
} from '@/lib/contracts/growxth';

const EXA_SEARCH_URL = 'https://api.exa.ai/search';
const REQUEST_TIMEOUT_MS = 7000;
const RESULTS_PER_CITY = 3;

function stableId(prefix: string, value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(i)) | 0;
  }
  return `${prefix}-${(hash >>> 0).toString(36)}`;
}

function compact(value: string, max = 190): string {
  const oneLine = value.replace(/\s+/g, ' ').trim();
  return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max - 1).trimEnd()}…`;
}

function eventQuery(request: SearchRequest, city: string): string {
  const stack = request.icpStack.slice(0, 2).join(' ');
  const topic = [compact(request.product, 60), stack].filter(Boolean).join(' ') || 'developer tools';
  return `upcoming ${topic} hackathon or developer meetup in ${city}`;
}

interface ExaResult {
  title: string | null;
  url: string;
  publishedDate?: string | null;
  text?: string | null;
}

async function searchCity(
  apiKey: string,
  request: SearchRequest,
  city: string,
): Promise<ExaResult[]> {
  const response = await fetch(EXA_SEARCH_URL, {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: eventQuery(request, city),
      numResults: RESULTS_PER_CITY,
      type: 'auto',
      contents: { text: { maxCharacters: 320 } },
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Exa search ${response.status}`);
  const body = (await response.json()) as { results?: unknown[] };
  const results: ExaResult[] = [];
  for (const raw of body.results ?? []) {
    if (typeof raw !== 'object' || raw === null) continue;
    const item = raw as Record<string, unknown>;
    if (typeof item.url !== 'string' || item.url.length === 0) continue;
    results.push({
      title: typeof item.title === 'string' ? item.title : null,
      url: item.url,
      publishedDate: typeof item.publishedDate === 'string' ? item.publishedDate : null,
      text: typeof item.text === 'string' ? item.text : null,
    });
  }
  return results;
}

function toEvidence(result: ExaResult, city: string, collectedAt: string): Evidence {
  return {
    id: stableId('ev-exa', result.url),
    source: 'exa',
    kind: 'event_listing',
    url: result.url,
    title: compact(result.title ?? `Developer event listing · ${city}`, 110),
    observedAt: result.publishedDate ?? collectedAt,
    location: city,
    confidence: 0.74,
    rightsBasis: 'public_web',
    status: 'observed',
    collector: 'direct',
    excerpt: result.text ? compact(result.text, 190) : undefined,
  };
}

export async function enrichWithExaEvents(
  request: SearchRequest,
  response: SearchResponse,
): Promise<SearchResponse> {
  const apiKey = process.env.EXA_API_KEY;
  const targets = response.opportunities.filter((item) => item.market?.city);
  if (!apiKey || targets.length === 0) {
    if (!apiKey) {
      return withSourceFailure(
        response,
        'Exa live event discovery unavailable (EXA_API_KEY missing); ranking shows market signals only.',
      );
    }
    return response;
  }

  const collectedAt = new Date().toISOString();
  const settled = await Promise.allSettled(
    targets.map((item) => searchCity(apiKey, request, item.market!.city)),
  );

  const evidence: Record<string, Evidence> = { ...response.evidence };
  let anySuccess = false;
  const opportunities: Opportunity[] = response.opportunities.map((opportunity) => {
    const index = targets.findIndex((item) => item.id === opportunity.id);
    if (index === -1) return opportunity;
    const outcome = settled[index];
    if (outcome.status !== 'fulfilled' || outcome.value.length === 0) return opportunity;
    anySuccess = true;
    const city = opportunity.market!.city;
    const items = outcome.value.map((result) => toEvidence(result, city, collectedAt));
    for (const item of items) evidence[item.id] = item;
    const sample = items[0].title;
    return {
      ...opportunity,
      reasons: [
        ...opportunity.reasons,
        {
          text: `Exa found ${items.length} live developer event listing${items.length === 1 ? '' : 's'} for ${city}, e.g. “${sample}”.`,
          evidenceIds: items.map((item) => item.id),
        },
      ],
    };
  });

  if (!anySuccess) {
    return withSourceFailure(
      response,
      'Exa returned no live event listings for these markets; ranking shows market signals only.',
    );
  }

  const sourcesUsed: EvidenceSource[] = response.coverage.sourcesUsed.includes('exa')
    ? response.coverage.sourcesUsed
    : [...response.coverage.sourcesUsed, 'exa'];
  return {
    ...response,
    opportunities,
    evidence,
    coverage: { ...response.coverage, sourcesUsed },
  };
}

function withSourceFailure(response: SearchResponse, warning: string): SearchResponse {
  const sourcesFailed: EvidenceSource[] = response.coverage.sourcesFailed.includes('exa')
    ? response.coverage.sourcesFailed
    : [...response.coverage.sourcesFailed, 'exa'];
  return {
    ...response,
    warnings: [...response.warnings, warning],
    coverage: { ...response.coverage, sourcesFailed },
  };
}
