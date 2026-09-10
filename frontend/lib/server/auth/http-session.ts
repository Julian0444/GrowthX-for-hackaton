import { NextResponse } from 'next/server';
import { resolveSessionContext, type SessionContext } from './session.ts';

type HttpSession =
  | { ok: true; session: SessionContext }
  | { ok: false; response: NextResponse };

// Una dependencia caída no demuestra que la credencial sea inválida. El 503
// permite reintentar lecturas; un 401 detiene el polling del run.
export async function resolveHttpSession(request: Request): Promise<HttpSession> {
  try {
    const session = await resolveSessionContext(request);
    if (session) return { ok: true, session };
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'unauthorized', message: 'Sesión requerida (cookie growthx_session o Bearer).' },
        { status: 401 },
      ),
    };
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'session_unavailable', message: 'No se pudo verificar la sesión. Reintentá cuando el servidor esté disponible.' },
        { status: 503 },
      ),
    };
  }
}
