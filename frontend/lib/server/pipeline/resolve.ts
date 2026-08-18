// Resolución live-first del lado servidor (T2 + cierre T7): corre el pipeline
// y, si el grafo semilla no tiene datos (0 oportunidades) o el pipeline falla,
// cae al fixture preparado marcando degraded. Aplica cache en memoria (TTL 6h) y
// auditoría de labels, y chequea las env vars una vez. Lo usan la ruta de
// búsqueda y el webhook de Linq.

import type { SearchRequest, SearchResponse } from '@/lib/contracts/growxth';
import { getFixtureSearchResponse } from '@/lib/server/demo/fixtures';
import { auditResponse } from '@/lib/server/audit/labels';
import { SIX_HOURS_MS, TtlCache } from '@/lib/server/cache';
import { checkEnvOnce } from '@/lib/server/env';
import { searchGlobalMarkets } from '@/lib/server/pipeline/global-market-search';
import { searchOpportunities, type PipelineOptions } from '@/lib/server/pipeline/search-opportunities';

const cache = new TtlCache<SearchResponse>(SIX_HOURS_MS);
const pending = new Map<string, Promise<SearchResponse>>();

function cacheKey(request: SearchRequest): string {
  return JSON.stringify({
    product: request.product,
    icpStack: request.icpStack,
    goal: request.goal,
    location: request.location ?? null,
  });
}

function fixtureFallback(request: SearchRequest): SearchResponse {
  const fixture = getFixtureSearchResponse();
  return {
    ...fixture,
    query: request,
    degraded: true,
    warnings: [...fixture.warnings, 'Grafo semilla vacío o pipeline caído; sirviendo fixture preparado.'],
  };
}

export async function searchOrFixture(
  request: SearchRequest,
  options?: PipelineOptions,
): Promise<SearchResponse> {
  checkEnvOnce();

  const key = cacheKey(request);
  const cached = cache.get(key);
  if (cached) return cached;
  const inFlight = pending.get(key);
  if (inFlight) return inFlight;

  const work = (async (): Promise<SearchResponse> => {
    let response: SearchResponse;
    try {
      response = await searchGlobalMarkets(request);
      if (response.opportunities.length === 0) {
        const local = searchOpportunities(request, options);
        response = local.opportunities.length > 0 ? local : fixtureFallback(request);
      }
    } catch {
      try {
        const local = searchOpportunities(request, options);
        response = local.opportunities.length > 0 ? local : fixtureFallback(request);
      } catch {
        response = fixtureFallback(request);
      }
    }

    const audited = auditResponse(response);
    // Partial responses are intentionally short-lived: the worldwide pipeline
    // may still be filling its per-source caches in the background. Keeping a
    // degraded response for six hours prevented the automatic refresh from ever
    // seeing the completed Trends/X results.
    if (!audited.degraded) cache.set(key, audited);
    return audited;
  })();
  pending.set(key, work);
  try {
    return await work;
  } finally {
    pending.delete(key);
  }
}
