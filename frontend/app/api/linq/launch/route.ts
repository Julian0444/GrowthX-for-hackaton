import { NextResponse } from 'next/server';

import type { CampaignDraft } from '@/lib/contracts/growxth';
import { linq } from '@/lib/server/connectors/linq';
import {
  getLatestChat,
  registerLaunch,
} from '@/lib/server/connectors/linq-session-store';
import {
  ensureCampaign,
  getCampaignResults,
  setCampaignLaunch,
} from '@/lib/server/research/store';

function campaignDraft(value: unknown): CampaignDraft | null {
  if (typeof value !== 'object' || value === null) return null;
  const item = value as Partial<CampaignDraft>;
  return item.id && item.opportunityId && item.title && item.variantA && item.variantB
    ? (item as CampaignDraft)
    : null;
}

export async function POST(request: Request): Promise<NextResponse> {
  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const input = body as {
    campaign?: unknown;
    to?: unknown;
    variant?: unknown;
  };
  const campaign = campaignDraft(input.campaign);
  if (!campaign) {
    return NextResponse.json({ error: 'A valid campaign is required.' }, { status: 400 });
  }
  ensureCampaign(campaign);
  const results = getCampaignResults(campaign.id);
  const selected =
    input.variant === 'B'
      ? campaign.variantB
      : input.variant === 'A'
        ? campaign.variantA
        : results?.winningCopy ?? campaign.variantA;
  const validationLabel =
    results?.winner != null
      ? `Terac result: variant ${results.winner} leads ${Math.round((results.winRate ?? 0) * 100)}% (${results.nValid} valid).`
      : 'Terac validation is still pending; this is the selected draft.';
  const message = [
    `Growth Atlas · ${campaign.title}`,
    selected,
    validationLabel,
    'Reply APPROVE or react 👍 to approve this campaign. This decision never changes the market score.',
  ].join('\n\n');

  const to = typeof input.to === 'string' ? input.to.trim() : '';
  const latest = getLatestChat();
  const sent = to
    ? await linq.createChat({
        to,
        text: message,
        idempotencyKey: `campaign-${campaign.id}-${Date.now()}`,
      })
    : latest
      ? await linq.sendMessage({
          chatId: latest.chatId,
          text: message,
          idempotencyKey: `campaign-${campaign.id}-${Date.now()}`,
        })
      : null;

  if (!sent) {
    return NextResponse.json(
      { error: 'No Linq chat is available. Enter a recipient or text GrowXth first.' },
      { status: 409 },
    );
  }
  if (!sent.ok || !sent.id || !sent.chatId) {
    return NextResponse.json(
      { error: sent.error ?? 'Linq did not send the campaign.' },
      { status: sent.status && sent.status >= 400 ? sent.status : 502 },
    );
  }
  const launch = registerLaunch({
    campaignId: campaign.id,
    opportunityId: campaign.opportunityId,
    chatId: sent.chatId,
    messageId: sent.id,
  });
  setCampaignLaunch(campaign.id, {
    state: 'sent',
    chatId: sent.chatId,
    messageId: sent.id,
  });
  return NextResponse.json({ launch, results: getCampaignResults(campaign.id) });
}
