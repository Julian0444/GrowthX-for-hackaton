// POST /api/events/ingest { url, idempotencyKey, profileRunId } → 202 con
// runId (ticket 11). La importación de Luma delega en la MISMA operación
// durable que /api/evaluations (startEvaluation): esta ruta valida sesión y
// URL, y acepta; la obtención y el parseo corren en el worker. No queda un
// segundo motor de importación síncrono.
//
// La URL se valida ANTES de aceptar nada: https, hostname en la allowlist de
// Luma, sin credenciales ni puertos no estándar (lib/server/catalog/
// luma-adapter.ts, las mismas reglas que aplica el worker a cada redirección).
// Un destino no admitido es un 400 sin run ni job.
//
// Imports relativos .ts (no alias @/): la prueba de integración ejercita este
// handler bajo `node --test` sin resolver de tsconfig.

import { NextResponse } from 'next/server';
import { resolveSessionContext } from '../../../../lib/server/auth/session.ts';
import { canonicalizeLumaUrl } from '../../../../lib/server/catalog/luma-adapter.ts';
import { isEvaluationDbConfigured } from '../../../../lib/server/db/pool.ts';
import { evaluationService } from '../../../../lib/server/evaluations/service.ts';
import { parseEventIngestStartBody } from '../../../../lib/server/evaluations/wire.ts';
import { checkEnvOnce } from '../../../../lib/server/env.ts';

export async function POST(request: Request): Promise<NextResponse> {
  checkEnvOnce();
  if (!isEvaluationDbConfigured()) {
    return NextResponse.json(
      {
        error: 'ingest_unavailable',
        message:
          'La base de evaluaciones no está configurada; la importación durable no está disponible (modo degradado).',
      },
      { status: 503 },
    );
  }

  const session = await resolveSessionContext(request).catch((error: unknown) => {
    console.warn(`[events/ingest] resolución de sesión falló: ${(error as Error).message}`);
    return null;
  });
  if (!session) {
    return NextResponse.json(
      { error: 'unauthorized', message: 'Sesión requerida (cookie growthx_session o Bearer).' },
      { status: 401 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'invalid_body', message: 'El cuerpo debe ser JSON.' },
      { status: 400 },
    );
  }
  const parsed = parseEventIngestStartBody(payload, canonicalizeLumaUrl);
  if (!parsed.ok) {
    return NextResponse.json({ error: 'invalid_body', message: parsed.error }, { status: 400 });
  }

  try {
    const outcome = await evaluationService.acceptEventIngest({
      tenantId: session.tenantId,
      userId: session.userId,
      body: parsed.body,
    });
    switch (outcome.status) {
      case 'accepted':
      case 'duplicate':
        // Idempotencia (demo del ticket): repetir clave+payload devuelve el
        // MISMO run; no aparece un segundo run.
        return NextResponse.json(
          {
            runId: outcome.runId,
            statusUrl: `/api/evaluations/${outcome.runId}`,
            deduplicated: outcome.status === 'duplicate',
          },
          { status: 202 },
        );
      case 'conflict':
        return NextResponse.json(
          {
            error: 'idempotency_conflict',
            message: 'La clave idempotente ya se usó con otro payload.',
          },
          { status: 409 },
        );
      case 'invalid_profile':
        return NextResponse.json(
          { error: 'invalid_profile', message: outcome.issues.join('; ') },
          { status: 400 },
        );
    }
  } catch (error) {
    // Sin job durable no hay 202: la transacción entera se revirtió.
    console.error(`[events/ingest] aceptación falló: ${(error as Error).message}`);
    return NextResponse.json(
      { error: 'accept_failed', message: 'No se pudo registrar la importación; no quedó trabajo pendiente.' },
      { status: 503 },
    );
  }
}
