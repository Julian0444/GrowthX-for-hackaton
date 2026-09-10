// GET /api/catalog/editions → catálogo curado del tenant con vigencia (ticket 09).
//
// Lectura pura de PostgreSQL bajo el tenant de la sesión (RLS): no consulta
// fuentes nuevas ni cae a seeds. La vigencia se evalúa al instante de la
// petición; un catálogo sin opciones vigentes llega DECLARADO en `note`, nunca
// rellenado con material histórico.

import { NextResponse } from 'next/server';
import { resolveHttpSession } from '../../../../lib/server/auth/http-session.ts';
import { getAppPool, isEvaluationDbConfigured } from '../../../../lib/server/db/pool.ts';
import { listCatalogEditions } from '../../../../lib/server/catalog/read.ts';

export async function GET(request: Request): Promise<NextResponse> {
  if (!isEvaluationDbConfigured()) {
    return NextResponse.json(
      { error: 'catalog_unavailable', message: 'Base de evaluaciones no configurada.' },
      { status: 503 },
    );
  }
  const auth = await resolveHttpSession(request);
  if (!auth.ok) return auth.response;
  const session = auth.session;
  try {
    const list = await listCatalogEditions(getAppPool(), session.tenantId, new Date().toISOString());
    return NextResponse.json(list);
  } catch (error) {
    console.error(`[catalog] lectura del catálogo falló: ${(error as Error).message}`);
    return NextResponse.json(
      { error: 'read_failed', message: 'No se pudo leer el catálogo.' },
      { status: 503 },
    );
  }
}
