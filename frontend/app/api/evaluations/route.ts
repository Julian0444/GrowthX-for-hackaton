// POST /api/evaluations → acepta un run durable (ticket 08).
//
// Valida sesión y pertenencia EN EL SERVIDOR (nunca un tenantId del cuerpo:
// el parseo estricto lo rechaza como clave desconocida), registra perfil
// versionado + run + steps y encola el trabajo durable EN LA MISMA
// TRANSACCIÓN, y recién entonces responde 202 con runId y URL de consulta.
//
// Sin base configurada responde 503 tipado (modo degradado, regla de env.ts):
// el cliente conserva el recorrido v0 y avisa que no hay persistencia.
//
// Imports relativos .ts (no alias @/): la prueba de integración ejercita este
// handler bajo `node --test` sin resolver de tsconfig.

import { NextResponse } from 'next/server';
import { resolveSessionContext } from '../../../lib/server/auth/session.ts';
import { isEvaluationDbConfigured } from '../../../lib/server/db/pool.ts';
import { evaluationService } from '../../../lib/server/evaluations/service.ts';
import { parseEvaluationStartBody } from '../../../lib/server/evaluations/wire.ts';
import { checkEnvOnce } from '../../../lib/server/env.ts';

export async function POST(request: Request): Promise<NextResponse> {
  checkEnvOnce();
  if (!isEvaluationDbConfigured()) {
    return NextResponse.json(
      {
        error: 'evaluations_unavailable',
        message:
          'La base de evaluaciones no está configurada; el run durable no está disponible (modo degradado).',
      },
      { status: 503 },
    );
  }

  const session = await resolveSessionContext(request).catch((error: unknown) => {
    console.warn(`[evaluations] resolución de sesión falló: ${(error as Error).message}`);
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
  const parsed = parseEvaluationStartBody(payload);
  if (!parsed.ok) {
    return NextResponse.json({ error: 'invalid_body', message: parsed.error }, { status: 400 });
  }

  try {
    const outcome = await evaluationService.accept({
      tenantId: session.tenantId,
      userId: session.userId,
      body: parsed.body,
    });
    switch (outcome.status) {
      case 'accepted':
      case 'duplicate':
        // Idempotencia: repetir clave+payload devuelve el MISMO run.
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
    console.error(`[evaluations] aceptación falló: ${(error as Error).message}`);
    return NextResponse.json(
      { error: 'accept_failed', message: 'No se pudo registrar el run; no quedó trabajo pendiente.' },
      { status: 503 },
    );
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Dashboard: historial y cobertura reales del tenant autenticado. Ticket 14:
// incluye la lista de evaluaciones guardadas (comparaciones con snapshot y
// decisiones), filtrable por identidad de perfil con ?profileId= — una lectura
// explícita, no una búsqueda por texto. Un filtro malformado es 400
// (distinguible de «sin evaluaciones» y de «sin base»).
export async function GET(request: Request): Promise<NextResponse> {
  if (!isEvaluationDbConfigured()) return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  const profileId = new URL(request.url).searchParams.get('profileId');
  if (profileId !== null && !UUID_RE.test(profileId)) {
    return NextResponse.json({ error: 'invalid_query', message: 'profileId debe ser el id (uuid) de un perfil de esta sesión.' }, { status: 400 });
  }
  try {
    const session = await resolveSessionContext(request);
    if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const { readResearchHome } = await import('../../../lib/server/evaluations/dashboard-store.ts');
    return NextResponse.json(await readResearchHome(session.tenantId, { profileId }));
  } catch {
    return NextResponse.json({ error: 'read_failed', message: 'No se pudo leer el dashboard.' }, { status: 503 });
  }
}
