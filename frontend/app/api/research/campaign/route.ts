import { NextResponse } from 'next/server';

import type { CampaignDraft } from '@/lib/contracts/growxth';
import {
  ensureCampaign,
  getCampaign,
  getCampaignResults,
} from '@/lib/server/research/store';

function campaignDraft(value: unknown): CampaignDraft | null {
  if (typeof value !== 'object' || value === null) return null;
  const item = value as Partial<CampaignDraft>;
  return typeof item.id === 'string' &&
    typeof item.opportunityId === 'string' &&
    typeof item.title === 'string' &&
    typeof item.variantA === 'string' &&
    typeof item.variantB === 'string' &&
    item.variantA.trim() &&
    item.variantB.trim()
    ? (item as CampaignDraft)
    : null;
}

export async function GET(request: Request): Promise<NextResponse> {
  const campaignId = new URL(request.url).searchParams.get('campaignId');
  if (!campaignId) {
    return NextResponse.json({ error: 'campaignId is required.' }, { status: 400 });
  }
  const campaign = getCampaign(campaignId);
  const results = getCampaignResults(campaignId);
  if (!campaign || !results) {
    return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });
  }
  return NextResponse.json({ campaign: campaign.draft, results });
}

export async function POST(request: Request): Promise<NextResponse> {
  const body: unknown = await request.json().catch(() => null);
  const draft = campaignDraft(
    typeof body === 'object' && body !== null ? (body as { campaign?: unknown }).campaign : null,
  );
  if (!draft) {
    return NextResponse.json({ error: 'A valid campaign is required.' }, { status: 400 });
  }
  const campaign = ensureCampaign(draft);
  return NextResponse.json({
    campaign: campaign.draft,
    results: getCampaignResults(draft.id),
  });
}
