// GET /api/catalog/editions/:id → dossier persistido de un evento curado
// (ticket 09). Lectura pura desde PostgreSQL bajo el tenant de la sesión:
// revisiones completas de la edición, organizadores, claims con su cadena,
// participaciones y fuentes. Un evento de otro tenant no existe para esta ruta
// (404, sin confirmar existencia ajena). No consulta fuentes nuevas al abrir.

import { NextResponse } from 'next/server';
import { resolveSessionContext } from '../../../../../lib/server/auth/session.ts';
import { getAppPool, isEvaluationDbConfigured } from '../../../../../lib/server/db/pool.ts';
import { readEditionDossier } from '../../../../../lib/server/catalog/read.ts';

// Mismo alfabeto que exige el manifiesto para los ids del catálogo.
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
  const session = await resolveSessionContext(request).catch(() => null);
  if (!session) {
    return NextResponse.json({ error: 'unauthorized', message: 'Sesión requerida.' }, { status: 401 });
  }
  const { id } = await params;
  if (!CATALOG_ID.test(id)) {
    return NextResponse.json({ error: 'invalid_id', message: 'editionId inválido.' }, { status: 400 });
  }
  try {
    const dossier = await readEditionDossier(getAppPool(), session.tenantId, id, new Date().toISOString());
    if (!dossier) {
      return NextResponse.json({ error: 'not_found', message: 'Edición inexistente.' }, { status: 404 });
    }
    return NextResponse.json(dossier);
  } catch (error) {
    console.error(`[catalog] lectura del dossier falló: ${(error as Error).message}`);
    return NextResponse.json(
      { error: 'read_failed', message: 'No se pudo leer el dossier.' },
      { status: 503 },
    );
  }
}
