// GET /api/evaluations/:id → estado y pasos persistidos del run (ticket 08).
//
// La sesión se valida en el servidor y la lectura corre bajo el tenant de esa
// sesión (RLS): un run de otro tenant no existe para esta ruta (404, no 403 —
// no se confirma la existencia de recursos ajenos). El dashboard hace polling
// acá y una recarga recupera el run en vez de disparar otra búsqueda.

import { NextResponse } from 'next/server';
import { resolveSessionContext } from '../../../../lib/server/auth/session.ts';
import { isEvaluationDbConfigured } from '../../../../lib/server/db/pool.ts';
import { evaluationService } from '../../../../lib/server/evaluations/service.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (!isEvaluationDbConfigured()) {
    return NextResponse.json(
      { error: 'evaluations_unavailable', message: 'Base de evaluaciones no configurada.' },
      { status: 503 },
    );
  }
  const session = await resolveSessionContext(request).catch(() => null);
  if (!session) {
    return NextResponse.json(
      { error: 'unauthorized', message: 'Sesión requerida.' },
      { status: 401 },
    );
  }
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'invalid_id', message: 'runId inválido.' }, { status: 400 });
  }
  try {
    const run = await evaluationService.getRun({ tenantId: session.tenantId, runId: id });
    if (!run) {
      return NextResponse.json({ error: 'not_found', message: 'Run inexistente.' }, { status: 404 });
    }
    return NextResponse.json(run);
  } catch (error) {
    console.error(`[evaluations] lectura falló: ${(error as Error).message}`);
    return NextResponse.json(
      { error: 'read_failed', message: 'No se pudo leer el run.' },
      { status: 503 },
    );
  }
}
