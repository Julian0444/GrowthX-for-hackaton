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
        { error: 'unauthorized', message: 'Session required (growthx_session cookie or Bearer token).' },
        { status: 401 },
      ),
    };
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'session_unavailable', message: 'The session could not be verified. Retry when the server is available.' },
        { status: 503 },
      ),
    };
  }
}
