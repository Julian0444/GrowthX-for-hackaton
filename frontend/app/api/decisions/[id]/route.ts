// GET /api/decisions/:id → lectura PERSISTIDA y autorizada de la decisión
// (ticket 13): sustituye la lectura en memoria de la Launch Room para este
// recorrido. PATCH /api/decisions/:id → agrega una revisión con revisión
// esperada; una actualización obsoleta devuelve conflicto, jamás sobrescribe.
//
// :id es la identidad estable de la decisión (decisionId); la respuesta
// contiene la última revisión, la cadena completa conservada, la campaña de la
// última revisión y los ids de snapshot/alternativa. 404 no confirma
// existencia ajena (RLS).

import { NextResponse } from 'next/server';
import { resolveSessionContext } from '../../../../lib/server/auth/session.ts';
import { getAppPool, isEvaluationDbConfigured } from '../../../../lib/server/db/pool.ts';
import { readDecision, reviseDecision } from '../../../../lib/server/decisions/store.ts';
import { parseDecisionReviseBody } from '../../../../lib/server/decisions/wire.ts';
import { checkEnvOnce } from '../../../../lib/server/env.ts';

function unavailable(): NextResponse {
  return NextResponse.json(
    {
      error: 'decisions_unavailable',
      message: 'La base de evaluaciones no está configurada; la decisión persistida no está disponible (modo degradado).',
    },
    { status: 503 },
  );
}

function unauthorized(): NextResponse {
  return NextResponse.json(
    { error: 'unauthorized', message: 'Sesión requerida (cookie growthx_session o Bearer).' },
    { status: 401 },
  );
}

function notFound(): NextResponse {
  return NextResponse.json({ error: 'not_found', message: 'Decisión inexistente para esta sesión.' }, { status: 404 });
}

// Ticket 14: un id malformado es 400, distinguible de «no hay decisión» (404)
// y de «base no disponible» (503); nunca un 500 por el cast de uuid.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function invalidId(): NextResponse {
  return NextResponse.json({ error: 'invalid_id', message: 'decisionId inválido: se espera la identidad (uuid) de la decisión.' }, { status: 400 });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  checkEnvOnce();
  if (!isEvaluationDbConfigured()) return unavailable();
  const session = await resolveSessionContext(request).catch(() => null);
  if (!session) return unauthorized();
  const { id } = await params;
  if (!UUID_RE.test(id)) return invalidId();
  try {
    const read = await readDecision(getAppPool(), session.tenantId, id);
    if (!read) return notFound();
    return NextResponse.json(read);
  } catch (error) {
    console.error('[decisions] fallo leyendo la decisión', error);
    return NextResponse.json({ error: 'internal', message: 'No se pudo leer la decisión.' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  checkEnvOnce();
  if (!isEvaluationDbConfigured()) return unavailable();
  const session = await resolveSessionContext(request).catch(() => null);
  if (!session) return unauthorized();
  const { id } = await params;
  if (!UUID_RE.test(id)) return invalidId();

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body', message: 'El cuerpo debe ser JSON.' }, { status: 400 });
  }
  const parsed = parseDecisionReviseBody(payload);
  if (!parsed.ok) return NextResponse.json({ error: 'invalid_body', message: parsed.error }, { status: 400 });

  try {
    const outcome = await reviseDecision(
      getAppPool(),
      { tenantId: session.tenantId, userId: session.userId },
      id,
      parsed.body,
    );
    switch (outcome.status) {
      case 'revised':
        return NextResponse.json({ ...outcome.read, deduplicated: outcome.deduplicated });
      case 'not_found':
        return notFound();
      case 'invalid':
        return NextResponse.json({ error: 'invalid_body', message: outcome.message }, { status: 400 });
      case 'excluded_conflict':
        return NextResponse.json({ error: 'excluded_conflict', message: outcome.message }, { status: 409 });
      case 'stale_revision':
        return NextResponse.json(
          { error: 'stale_revision', message: outcome.message, currentRevision: outcome.currentRevision },
          { status: 409 },
        );
      case 'idempotency_conflict':
        return NextResponse.json({ error: 'conflict', message: outcome.message }, { status: 409 });
    }
  } catch (error) {
    console.error('[decisions] fallo revisando la decisión', error);
    return NextResponse.json(
      { error: 'internal', message: 'No se pudo revisar la decisión; nada quedó a medias (transacción única).' },
      { status: 500 },
    );
  }
}
