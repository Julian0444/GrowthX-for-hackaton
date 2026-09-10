// GET /api/organizers/:id → expediente persistido del organizador (ticket 09).
//
// Lee revisiones, afirmaciones documentadas, ediciones propias (un coorganizador
// no hereda eventos ajenos), participaciones de empresa recorribles hasta su
// fuente y la cobertura de antecedentes, todo bajo el tenant de la sesión. NO
// consulta fuentes nuevas al abrir y NO calcula ningún puntaje de reputación:
// devuelve afirmaciones con su soporte, no una generalización automática.

import { NextResponse } from 'next/server';
import { resolveHttpSession } from '../../../../lib/server/auth/http-session.ts';
import { getAppPool, isEvaluationDbConfigured } from '../../../../lib/server/db/pool.ts';
import { readOrganizerDossier } from '../../../../lib/server/catalog/read.ts';

const CATALOG_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (!isEvaluationDbConfigured()) {
    return NextResponse.json(
      { error: 'catalog_unavailable', message: 'Base de evaluaciones no configurada.' },
      { status: 503 },
    );
  }
  const auth = await resolveHttpSession(request);
  if (!auth.ok) return auth.response;
  const session = auth.session;
  const { id } = await params;
  if (!CATALOG_ID.test(id)) {
    return NextResponse.json({ error: 'invalid_id', message: 'organizerId inválido.' }, { status: 400 });
  }
  try {
    const dossier = await readOrganizerDossier(getAppPool(), session.tenantId, id, new Date().toISOString());
    if (!dossier) {
      return NextResponse.json({ error: 'not_found', message: 'Organizador inexistente.' }, { status: 404 });
    }
    return NextResponse.json(dossier);
  } catch (error) {
    console.error(`[organizers] lectura del expediente falló: ${(error as Error).message}`);
    return NextResponse.json(
      { error: 'read_failed', message: 'No se pudo leer el expediente.' },
      { status: 503 },
    );
  }
}
