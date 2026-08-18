import { NextResponse } from 'next/server';

import { addResearchVote, getCampaignResults } from '@/lib/server/research/store';

export async function POST(request: Request): Promise<NextResponse> {
  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const input = body as {
    campaignId?: unknown;
    submissionId?: unknown;
    variant?: unknown;
    reason?: unknown;
    calibrationPassed?: unknown;
    preview?: unknown;
  };
  if (
    typeof input.campaignId !== 'string' ||
    typeof input.submissionId !== 'string' ||
    (input.variant !== 'A' && input.variant !== 'B') ||
    typeof input.reason !== 'string' ||
    input.reason.trim().length < 3 ||
    typeof input.calibrationPassed !== 'boolean'
  ) {
    return NextResponse.json(
      { error: 'campaignId, submissionId, variant, reason and calibrationPassed are required.' },
      { status: 400 },
    );
  }
  const results =
    input.preview === true
      ? getCampaignResults(input.campaignId)
      : addResearchVote(input.campaignId, {
          submissionId: input.submissionId,
          variant: input.variant,
          reason: input.reason.trim().slice(0, 500),
          calibrationPassed: input.calibrationPassed,
          createdAt: new Date().toISOString(),
        });
  if (!results) {
    return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });
  }
  return NextResponse.json({
    results,
    callbackUrl: `https://terac.com/api/external/callback?teracSubmissionId=${encodeURIComponent(input.submissionId)}&result=completed`,
  });
}
