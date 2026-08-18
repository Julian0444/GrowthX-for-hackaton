// GET /api/og/opportunity?id={opportunityId} → imagen social (1200×630).
// Usa next/og (ImageResponse) — NADA de headless browser (trampa de 2 horas).
// Resuelve la oportunidad desde el fixture; si no la encuentra, tarjeta genérica.

import { ImageResponse } from 'next/og';

import type { Opportunity } from '@/lib/contracts/growxth';
import { getFixtureSearchResponse } from '@/lib/server/demo/fixtures';

export const runtime = 'nodejs';

const SIZE = { width: 1200, height: 630 };

function findOpportunity(id: string | null): Opportunity | null {
  if (!id) return null;
  const res = getFixtureSearchResponse();
  return res.opportunities.find((o) => o.id === id) ?? null;
}

function roiLine(opp: Opportunity | null): string {
  if (!opp) return 'Worldwide developer growth opportunities';
  const { band } = opp.roi;
  return band ? `est. $${band[0]}–${band[1]} por dev calificado` : 'ROI: No disponible';
}

export async function GET(request: Request): Promise<ImageResponse> {
  const { searchParams } = new URL(request.url);
  const opp = findOpportunity(searchParams.get('id'));

  const headline = opp?.play.headline ?? opp?.title ?? 'GrowXth — worldwide developer growth';
  const score = opp ? `${opp.score}` : '—';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '64px',
          background: 'linear-gradient(135deg, #0b1020 0%, #131a33 100%)',
          color: '#e8ecf7',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', fontSize: 30, letterSpacing: 2, color: '#8ea2d6' }}>
          GROWXTH · WORLDWIDE
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 58, fontWeight: 700, lineHeight: 1.1 }}>{headline}</div>
          <div style={{ display: 'flex', marginTop: 28, fontSize: 34, color: '#b8c4e6' }}>{roiLine(opp)}</div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', fontSize: 28, color: '#8ea2d6' }}>
            {opp?.humanValidated ? 'Validado por humanos (Terac)' : 'Evidencia web + eventos'}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 120,
              height: 120,
              borderRadius: 60,
              background: '#1d3a5f',
              color: '#7fd1ff',
              fontSize: 48,
              fontWeight: 700,
            }}
          >
            {score}
          </div>
        </div>
      </div>
    ),
    SIZE,
  );
}
