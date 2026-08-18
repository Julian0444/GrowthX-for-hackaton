// GET /api/decisions/:id → Decision (§L5, contrato growxth.ts).
// La Launch Room hace polling cada 2s a este endpoint (sin websockets).
// El estado (consensus, confidenceDelta, state) lo mantiene el store en memoria,
// alimentado por las reacciones que llegan al webhook de Linq.

import { NextResponse } from 'next/server';

import type { Decision } from '@/lib/contracts/growxth';
import { getConfirmedTierPriceUsd, getDecision } from '@/lib/server/decisions/store';

interface DecisionResponse {
  decision: Decision;
  // Precio de tier confirmado por un organizer (llena roi.tierPriceUsd). null si
  // nadie confirmó todavía.
  confirmedTierPriceUsd: number | null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<DecisionResponse | { error: string }>> {
  const { id } = await params;
  const decision = getDecision(id);
  if (!decision) {
    return NextResponse.json({ error: 'decision not found' }, { status: 404 });
  }
  return NextResponse.json({
    decision,
    confirmedTierPriceUsd: getConfirmedTierPriceUsd(decision),
  });
}
