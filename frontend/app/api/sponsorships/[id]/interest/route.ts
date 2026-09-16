// POST registra el interes humano y congela el match/plan de medicion. No
// envia correo ni compromete presupuesto: la introduccion sigue siendo un
// follow-up manual en este MVP.

import { NextResponse } from 'next/server';
import { resolveHttpSession } from '../../../../../lib/server/auth/http-session.ts';
import { getAppPool, isEvaluationDbConfigured } from '../../../../../lib/server/db/pool.ts';
import { checkEnvOnce } from '../../../../../lib/server/env.ts';
import { requestSponsorshipIntroduction } from '../../../../../lib/server/sponsorships/store.ts';
import { parseSponsorshipInterestCreateBody } from '../../../../../lib/server/sponsorships/wire.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function unavailable(): NextResponse {
  return NextResponse.json(
    { error: 'sponsorships_unavailable', message: 'The evaluations database is not configured; sponsorship matching is unavailable.' },
    { status: 503 },
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  checkEnvOnce();
  if (!isEvaluationDbConfigured()) return unavailable();
  const auth = await resolveHttpSession(request);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!UUID_RE.test(id))
    return NextResponse.json({ error: 'invalid_id', message: 'Opportunity id must be a UUID.' }, { status: 400 });
  let payload: unknown;
  try { payload = await request.json(); }
  catch { return NextResponse.json({ error: 'invalid_body', message: 'The request body must be JSON.' }, { status: 400 }); }
  const parsed = parseSponsorshipInterestCreateBody(payload);
  if (!parsed.ok) return NextResponse.json({ error: 'invalid_body', message: parsed.issues.join('; '), issues: parsed.issues }, { status: 400 });
  try {
    const outcome = await requestSponsorshipIntroduction(getAppPool(), auth.session, id, parsed.value);
    switch (outcome.status) {
      case 'requested':
        return NextResponse.json(
          { interest: outcome.interest, deduplicated: outcome.deduplicated, delivery: 'manual_follow_up_required' },
          { status: outcome.deduplicated ? 200 : 201 },
        );
      case 'already_requested':
        return NextResponse.json(
          { interest: outcome.interest, deduplicated: true, alreadyRequested: true, delivery: 'manual_follow_up_required' },
          { status: 200 },
        );
      case 'not_found':
        return NextResponse.json({ error: 'not_found', message: 'Opportunity not found for this session.' }, { status: 404 });
      case 'run_not_found':
        return NextResponse.json({ error: 'not_found', message: 'Sponsor run not found for this session.' }, { status: 404 });
      case 'invalid':
        return NextResponse.json({ error: 'invalid_body', message: outcome.message }, { status: 400 });
      case 'idempotency_conflict':
        return NextResponse.json({ error: 'conflict', message: outcome.message }, { status: 409 });
    }
  } catch (error) {
    console.error('[sponsorships] introduction request failed', error);
    return NextResponse.json({ error: 'internal', message: 'Could not record the introduction request.' }, { status: 500 });
  }
}
