// Resolución live-first del lado servidor (T2 + cierre T7): corre el pipeline
// y, si el grafo semilla no tiene datos (0 oportunidades) o el pipeline falla,
// cae al fixture preparado marcando degraded. Aplica cache en memoria (TTL 6h) y
// auditoría de labels, y chequea las env vars una vez. La usa la ruta de
// búsqueda.
//
// Costura de prueba (ticket 01, evaluación persistida): `createSearchResolver`
// permite inyectar pipelines, fixture, auditoría y una cache aislada para
// repetir la evaluación sin red ni claves. El comportamiento de `searchOrFixture`
// (instancia por defecto, cache compartida del proceso) no cambia.

import type { SearchRequest, SearchResponse } from '@/lib/contracts/growxth';
import { getFixtureSearchResponse } from '@/lib/server/demo/fixtures';
import { auditResponse } from '@/lib/server/audit/labels';
import { SIX_HOURS_MS, TtlCache } from '@/lib/server/cache';
import { checkEnvOnce } from '@/lib/server/env';
import { searchGlobalMarkets } from '@/lib/server/pipeline/global-market-search';
import { searchOpportunities, type PipelineOptions } from '@/lib/server/pipeline/search-opportunities';

export interface SearchResolverDeps {
  searchGlobalMarkets: (request: SearchRequest) => Promise<SearchResponse>;
  searchOpportunities: (request: SearchRequest, options?: PipelineOptions) => SearchResponse;
  fixture: () => SearchResponse;
  audit: (response: SearchResponse) => SearchResponse;
  cache: TtlCache<SearchResponse>;
  checkEnv: () => void;
}

export type SearchResolver = (
  request: SearchRequest,
  options?: PipelineOptions,
) => Promise<SearchResponse>;

// Normalización única de presupuesto (ticket 02): la comparten el parser HTTP
// de la ruta de búsqueda y la clave de cache. 0 es el sentinel v0 de
// presupuesto desconocido y ningún valor no positivo o no finito cuenta como
// presupuesto; la representación nueva de desconocido se define en el ticket 07.
export function normalizeBudgetUsd(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

// Clave de cache y de promesas en curso. Corrige el oráculo O1 (ticket 02):
// incluye el presupuesto normalizado para que dos búsquedas con presupuestos
// distintos no compartan respuesta ni trabajo pendiente.
function cacheKey(request: SearchRequest): string {
  return JSON.stringify({
    product: request.product,
    icpStack: request.icpStack,
    budgetUsd: normalizeBudgetUsd(request.budgetUsd),
    goal: request.goal,
    location: request.location ?? null,
  });
}

function fixtureFallback(request: SearchRequest, fixture: () => SearchResponse): SearchResponse {
  const base = fixture();
  return {
    ...base,
    query: request,
    degraded: true,
    warnings: [...base.warnings, 'Grafo semilla vacío o pipeline caído; sirviendo fixture preparado.'],
  };
}

export function createSearchResolver(overrides: Partial<SearchResolverDeps> = {}): SearchResolver {
  const deps: SearchResolverDeps = {
    searchGlobalMarkets,
    searchOpportunities,
    fixture: getFixtureSearchResponse,
    audit: auditResponse,
    cache: new TtlCache<SearchResponse>(SIX_HOURS_MS),
    checkEnv: checkEnvOnce,
    ...overrides,
  };
  const pending = new Map<string, Promise<SearchResponse>>();

  return async function searchOrFixture(
    request: SearchRequest,
    options?: PipelineOptions,
  ): Promise<SearchResponse> {
    deps.checkEnv();

    const key = cacheKey(request);
    const cached = deps.cache.get(key);
    if (cached) return cached;
    const inFlight = pending.get(key);
    if (inFlight) return inFlight;

    const work = (async (): Promise<SearchResponse> => {
      let response: SearchResponse;
      try {
        response = await deps.searchGlobalMarkets(request);
        if (response.opportunities.length === 0) {
          const local = deps.searchOpportunities(request, options);
          response = local.opportunities.length > 0 ? local : fixtureFallback(request, deps.fixture);
        }
      } catch {
        try {
          const local = deps.searchOpportunities(request, options);
          response = local.opportunities.length > 0 ? local : fixtureFallback(request, deps.fixture);
        } catch {
          response = fixtureFallback(request, deps.fixture);
        }
      }

      const audited = deps.audit(response);
      // Partial responses are intentionally short-lived: the worldwide pipeline
      // may still be filling its per-source caches in the background. Keeping a
      // degraded response for six hours prevented the automatic refresh from ever
      // seeing the completed Trends/X results.
      if (!audited.degraded) deps.cache.set(key, audited);
      return audited;
    })();
    pending.set(key, work);
    try {
      return await work;
    } finally {
      pending.delete(key);
    }
  };
}

// Instancia por defecto: cache y promesas en curso compartidas por proceso,
// exactamente como antes de abrir la costura.
export const searchOrFixture: SearchResolver = createSearchResolver();
