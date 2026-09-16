// GET lista oportunidades y, con runId, deriva matches desde el perfil
// persistido. POST publica una oportunidad append-only del organizador.

import { NextResponse } from 'next/server';
import { resolveHttpSession } from '../../../lib/server/auth/http-session.ts';
import { getAppPool, isEvaluationDbConfigured } from '../../../lib/server/db/pool.ts';
import { checkEnvOnce } from '../../../lib/server/env.ts';
import { publishSponsorshipOpportunity, readSponsorshipMarketplace } from '../../../lib/server/sponsorships/store.ts';
import { parseSponsorshipOpportunityCreateBody } from '../../../lib/server/sponsorships/wire.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function unavailable(): NextResponse {
  return NextResponse.json(
    { error: 'sponsorships_unavailable', message: 'The evaluations database is not configured; sponsorship matching is unavailable.' },
    { status: 503 },
  );
}

export async function GET(request: Request): Promise<NextResponse> {
  checkEnvOnce();
  if (!isEvaluationDbConfigured()) return unavailable();
  const auth = await resolveHttpSession(request);
  if (!auth.ok) return auth.response;
  const sponsorRunId = new URL(request.url).searchParams.get('runId');
  if (sponsorRunId !== null && !UUID_RE.test(sponsorRunId))
    return NextResponse.json({ error: 'invalid_query', message: 'runId must be a UUID.' }, { status: 400 });
  try {
    const outcome = await readSponsorshipMarketplace(getAppPool(), auth.session.tenantId, sponsorRunId);
    if (outcome.status === 'run_not_found')
      return NextResponse.json({ error: 'not_found', message: 'Sponsor run not found for this session.' }, { status: 404 });
    return NextResponse.json(outcome.marketplace);
  } catch (error) {
    console.error('[sponsorships] marketplace read failed', error);
    return NextResponse.json({ error: 'internal', message: 'Could not read sponsorship opportunities.' }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  checkEnvOnce();
  if (!isEvaluationDbConfigured()) return unavailable();
  const auth = await resolveHttpSession(request);
  if (!auth.ok) return auth.response;
  let payload: unknown;
  try { payload = await request.json(); }
  catch { return NextResponse.json({ error: 'invalid_body', message: 'The request body must be JSON.' }, { status: 400 }); }
  const parsed = parseSponsorshipOpportunityCreateBody(payload);
  if (!parsed.ok) return NextResponse.json({ error: 'invalid_body', message: parsed.issues.join('; '), issues: parsed.issues }, { status: 400 });
  try {
    const outcome = await publishSponsorshipOpportunity(getAppPool(), auth.session, parsed.value);
    if (outcome.status === 'idempotency_conflict')
      return NextResponse.json({ error: 'conflict', message: outcome.message }, { status: 409 });
    return NextResponse.json(
      { opportunity: outcome.opportunity, deduplicated: outcome.deduplicated },
      { status: outcome.deduplicated ? 200 : 201 },
    );
  } catch (error) {
    console.error('[sponsorships] opportunity publish failed', error);
    return NextResponse.json({ error: 'internal', message: 'Could not publish the sponsorship opportunity.' }, { status: 500 });
  }
}
