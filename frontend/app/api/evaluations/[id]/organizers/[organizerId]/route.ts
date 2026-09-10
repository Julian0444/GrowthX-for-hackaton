import { NextResponse } from 'next/server';
import { resolveHttpSession } from '../../../../../../lib/server/auth/http-session.ts';
import { isEvaluationDbConfigured } from '../../../../../../lib/server/db/pool.ts';
import { saveOrganizerResearch } from '../../../../../../lib/server/evaluations/dashboard-store.ts';

export async function POST(request: Request, { params }: { params: Promise<{ id: string; organizerId: string }> }) {
  if (!isEvaluationDbConfigured()) return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  try {
    const auth = await resolveHttpSession(request);
    if (!auth.ok) return auth.response;
    const session = auth.session;
    const { id, organizerId } = await params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || !organizerId || organizerId.length > 256)
      return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length)
      return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
    const saved = await saveOrganizerResearch(session.tenantId, session.userId, id, organizerId);
    return saved ? NextResponse.json(saved) : NextResponse.json({ error: 'not_found' }, { status: 404 });
  } catch {
    return NextResponse.json({ error: 'save_failed' }, { status: 503 });
  }
}
