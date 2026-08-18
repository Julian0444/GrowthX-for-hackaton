// POST /api/opportunities/search → SearchResponse (contrato growxth.ts).
// Corre el pipeline sobre el grafo semilla vía searchOrFixture (que aplica
// fallback al fixture, cache 6h, auditoría de labels y guard de env vars).
// HTTP 200 siempre: el estado viaja en el body (degraded + warnings).

import { NextResponse } from 'next/server';

import type { SearchRequest, SearchResponse } from '@/lib/contracts/growxth';
import { searchOrFixture } from '@/lib/server/pipeline/resolve';

const GOALS = new Set(['adoption', 'feedback', 'hiring', 'awareness']);

function parseRequest(body: unknown): SearchRequest {
  const b = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  const goal = typeof b.goal === 'string' && GOALS.has(b.goal) ? (b.goal as SearchRequest['goal']) : 'adoption';
  const rawLocation =
    typeof b.location === 'object' && b.location !== null
      ? (b.location as Record<string, unknown>)
      : null;
  const location =
    rawLocation &&
    typeof rawLocation.lat === 'number' &&
    Number.isFinite(rawLocation.lat) &&
    typeof rawLocation.lng === 'number' &&
    Number.isFinite(rawLocation.lng) &&
    (rawLocation.source === 'linq' || rawLocation.source === 'browser')
      ? {
          lat: rawLocation.lat,
          lng: rawLocation.lng,
          source: rawLocation.source as 'linq' | 'browser',
          locality: typeof rawLocation.locality === 'string' ? rawLocation.locality : null,
          updatedAt: typeof rawLocation.updatedAt === 'string' ? rawLocation.updatedAt : null,
        }
      : undefined;
  return {
    product: typeof b.product === 'string' ? b.product : '',
    icpStack: Array.isArray(b.icpStack) ? b.icpStack.filter((s): s is string => typeof s === 'string') : [],
    budgetUsd: typeof b.budgetUsd === 'number' && b.budgetUsd > 0 ? b.budgetUsd : 0,
    goal,
    location,
  };
}

export async function POST(request: Request): Promise<NextResponse<SearchResponse>> {
  let parsed: SearchRequest;
  try {
    parsed = parseRequest(await request.json());
  } catch {
    parsed = { product: '', icpStack: [], budgetUsd: 0, goal: 'adoption' };
  }

  const response = await searchOrFixture(parsed);
  return NextResponse.json(response);
}
