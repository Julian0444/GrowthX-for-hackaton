import { NextResponse } from 'next/server';

import {
  createTeracDraft,
  getTeracOpportunity,
  launchTeracOpportunity,
} from '@/lib/server/connectors/terac';
import {
  ensureCampaign,
  getCampaign,
  getCampaignResults,
  setTeracRun,
} from '@/lib/server/research/store';
import type { CampaignDraft } from '@/lib/contracts/growxth';

function validCampaign(value: unknown): value is CampaignDraft {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Partial<CampaignDraft>;
  return Boolean(item.id && item.opportunityId && item.title && item.variantA && item.variantB);
}

function publicAppUrl(request: Request): string {
  const configured = (process.env.APP_URL ?? '').replace(/\/+$/, '');
  return configured || new URL(request.url).origin;
}

export async function POST(request: Request): Promise<NextResponse> {
  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const input = body as {
    action?: unknown;
    campaign?: unknown;
    campaignId?: unknown;
    participants?: unknown;
  };
  const action = input.action === 'launch' || input.action === 'refresh' ? input.action : 'draft';
  let campaign =
    typeof input.campaignId === 'string' ? getCampaign(input.campaignId) : null;
  if (validCampaign(input.campaign)) campaign = ensureCampaign(input.campaign);
  if (!campaign) {
    return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });
  }

  if (action !== 'draft' && !campaign.terac) {
    return NextResponse.json({ error: 'Create a Terac draft first.' }, { status: 409 });
  }

  const result =
    action === 'draft'
      ? await createTeracDraft({
          campaign: campaign.draft,
          appUrl: publicAppUrl(request),
          participants:
            typeof input.participants === 'number' ? input.participants : undefined,
        })
      : action === 'launch'
        ? await launchTeracOpportunity(campaign.terac!)
        : await getTeracOpportunity(campaign.terac!);

  if (!result.ok || !result.run) {
    return NextResponse.json(
      { error: result.error ?? 'Terac request failed.' },
      { status: result.status && result.status >= 400 ? result.status : 502 },
    );
  }
  setTeracRun(campaign.draft.id, result.run);
  return NextResponse.json({
    run: result.run,
    results: getCampaignResults(campaign.draft.id),
    requiresExplicitLaunch: action === 'draft',
  });
}
