// POST /api/decisions → guarda la primera decisión contra un snapshot oficial
// existente y, si es una elección, su borrador de campaña EN LA MISMA
// TRANSACCIÓN (ticket 13). GET /api/decisions?snapshotId= lee las decisiones
// registradas contra un snapshot (para recuperar el estado del panel).
//
// Autor y tenant salen de la sesión resuelta en el servidor: un tenantId o un
// autor en el cuerpo es un 400 (parseo estricto en lib/server/decisions/wire).
// Sin base configurada responde 503 tipado (modo degradado, regla de env.ts).
//
// Imports relativos .ts (no alias @/): la prueba de integración ejercita estos
// handlers bajo `node --test` sin resolver de tsconfig.

import { NextResponse } from 'next/server';
import { resolveHttpSession } from '../../../lib/server/auth/http-session.ts';
import { getAppPool, isEvaluationDbConfigured } from '../../../lib/server/db/pool.ts';
import { readDecisionsBySnapshot, saveDecision } from '../../../lib/server/decisions/store.ts';
import { parseDecisionSaveBody } from '../../../lib/server/decisions/wire.ts';
import { checkEnvOnce } from '../../../lib/server/env.ts';

function unavailable(): NextResponse {
  return NextResponse.json(
    {
      error: 'decisions_unavailable',
      message: 'La base de evaluaciones no está configurada; la decisión persistida no está disponible (modo degradado).',
    },
    { status: 503 },
  );
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request): Promise<NextResponse> {
  checkEnvOnce();
  if (!isEvaluationDbConfigured()) return unavailable();
  const auth = await resolveHttpSession(request);
  if (!auth.ok) return auth.response;
  const session = auth.session;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body', message: 'El cuerpo debe ser JSON.' }, { status: 400 });
  }
  const parsed = parseDecisionSaveBody(payload);
  if (!parsed.ok) return NextResponse.json({ error: 'invalid_body', message: parsed.error }, { status: 400 });

  try {
    const outcome = await saveDecision(getAppPool(), { tenantId: session.tenantId, userId: session.userId }, parsed.body);
    switch (outcome.status) {
      case 'saved':
        // Idempotencia: repetir clave+payload devuelve la MISMA decisión.
        return NextResponse.json({ ...outcome.read, deduplicated: outcome.deduplicated }, { status: outcome.deduplicated ? 200 : 201 });
      case 'snapshot_not_found':
        // 404 sin confirmar existencia ajena: bajo RLS, un snapshot de otro
        // tenant y uno inexistente son indistinguibles.
        return NextResponse.json({ error: 'not_found', message: 'Snapshot inexistente para esta sesión.' }, { status: 404 });
      case 'invalid':
        return NextResponse.json({ error: 'invalid_body', message: outcome.message }, { status: 400 });
      case 'excluded_conflict':
        return NextResponse.json({ error: 'excluded_conflict', message: outcome.message }, { status: 409 });
      case 'already_decided':
        return NextResponse.json(
          {
            error: 'already_decided',
            message: outcome.message,
            decisionId: outcome.decisionId,
            currentRevision: outcome.currentRevision,
          },
          { status: 409 },
        );
      case 'idempotency_conflict':
        return NextResponse.json({ error: 'conflict', message: outcome.message }, { status: 409 });
    }
  } catch (error) {
    console.error('[decisions] fallo guardando la decisión', error);
    return NextResponse.json(
      { error: 'internal', message: 'No se pudo guardar la decisión; nada quedó a medias (transacción única).' },
      { status: 500 },
    );
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  checkEnvOnce();
  if (!isEvaluationDbConfigured()) return unavailable();
  const auth = await resolveHttpSession(request);
  if (!auth.ok) return auth.response;
  const session = auth.session;
  const snapshotId = new URL(request.url).searchParams.get('snapshotId');
  if (!snapshotId || snapshotId.trim().length === 0) {
    return NextResponse.json(
      { error: 'invalid_query', message: 'Falta snapshotId: la lectura de decisiones es por snapshot.' },
      { status: 400 },
    );
  }
  // Ticket 14: id malformado → 400 (distinguible de «sin decisiones» = lista
  // vacía y de «base no disponible» = 503), no un 500 por el cast de uuid.
  if (!UUID_RE.test(snapshotId.trim())) {
    return NextResponse.json(
      { error: 'invalid_query', message: 'snapshotId inválido: se espera el id (uuid) del snapshot oficial.' },
      { status: 400 },
    );
  }
  try {
    const decisions = await readDecisionsBySnapshot(getAppPool(), session.tenantId, snapshotId.trim());
    return NextResponse.json({ snapshotId: snapshotId.trim(), decisions });
  } catch (error) {
    console.error('[decisions] fallo leyendo decisiones del snapshot', error);
    return NextResponse.json({ error: 'internal', message: 'No se pudieron leer las decisiones.' }, { status: 500 });
  }
}
