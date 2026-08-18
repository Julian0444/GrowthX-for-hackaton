import type { CampaignDraft } from '@/lib/contracts/growxth';

export interface ResearchVote {
  submissionId: string;
  variant: 'A' | 'B';
  reason: string;
  calibrationPassed: boolean;
  createdAt: string;
}

export interface TeracRun {
  projectId: string;
  opportunityId: string;
  status: string;
  participantTarget: number;
  pricing: {
    costPerParticipantCents: number | null;
    totalCostCents: number | null;
    currency: string;
  } | null;
  submissionStats: {
    total: number;
    inProgress: number;
    awaitingReview: number;
    approved: number;
    rejected: number;
  } | null;
  updatedAt: string;
}

export interface CampaignRecord {
  draft: CampaignDraft;
  votes: ResearchVote[];
  terac: TeracRun | null;
  launch: {
    state: 'draft' | 'sent' | 'approved' | 'rejected' | 'needs_evidence';
    chatId: string | null;
    messageId: string | null;
    updatedAt: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface CampaignResults {
  campaignId: string;
  nTotal: number;
  nValid: number;
  votesA: number;
  votesB: number;
  winner: 'A' | 'B' | null;
  winningCopy: string | null;
  winRate: number | null;
  significant: boolean;
  reasons: string[];
  terac: TeracRun | null;
  launch: CampaignRecord['launch'];
}

interface ResearchGlobal {
  campaigns: Map<string, CampaignRecord>;
}

const globalResearch = globalThis as typeof globalThis & {
  __growxthResearch?: ResearchGlobal;
};

function state(): ResearchGlobal {
  globalResearch.__growxthResearch ??= { campaigns: new Map() };
  return globalResearch.__growxthResearch;
}

function configuredTeracRun(campaignId: string): TeracRun | null {
  const configuredCampaignId = process.env.TERAC_CAMPAIGN_ID;
  const projectId = process.env.TERAC_PROJECT_ID;
  const opportunityId = process.env.TERAC_OPPORTUNITY_ID;
  if (
    !configuredCampaignId ||
    configuredCampaignId !== campaignId ||
    !projectId ||
    !opportunityId
  ) {
    return null;
  }
  return {
    projectId,
    opportunityId,
    status: 'active',
    participantTarget: 12,
    pricing: null,
    submissionStats: null,
    updatedAt: new Date().toISOString(),
  };
}

export function ensureCampaign(draft: CampaignDraft): CampaignRecord {
  const existing = state().campaigns.get(draft.id);
  if (existing) {
    existing.draft = draft;
    existing.terac ??= configuredTeracRun(draft.id);
    existing.updatedAt = new Date().toISOString();
    return existing;
  }
  const now = new Date().toISOString();
  const created: CampaignRecord = {
    draft,
    votes: [],
    terac: configuredTeracRun(draft.id),
    launch: {
      state: 'draft',
      chatId: null,
      messageId: null,
      updatedAt: now,
    },
    createdAt: now,
    updatedAt: now,
  };
  state().campaigns.set(draft.id, created);
  return created;
}

export function getCampaign(id: string): CampaignRecord | null {
  return state().campaigns.get(id) ?? null;
}

export function addResearchVote(campaignId: string, vote: ResearchVote): CampaignResults | null {
  const campaign = getCampaign(campaignId);
  if (!campaign) return null;
  const index = campaign.votes.findIndex((item) => item.submissionId === vote.submissionId);
  if (index >= 0) campaign.votes[index] = vote;
  else campaign.votes.push(vote);
  campaign.updatedAt = new Date().toISOString();
  return getCampaignResults(campaignId);
}

export function setTeracRun(campaignId: string, run: TeracRun): CampaignRecord | null {
  const campaign = getCampaign(campaignId);
  if (!campaign) return null;
  campaign.terac = run;
  campaign.updatedAt = new Date().toISOString();
  return campaign;
}

export function setCampaignLaunch(
  campaignId: string,
  launch: Partial<CampaignRecord['launch']>,
): CampaignRecord | null {
  const campaign = getCampaign(campaignId);
  if (!campaign) return null;
  campaign.launch = {
    ...campaign.launch,
    ...launch,
    updatedAt: new Date().toISOString(),
  };
  campaign.updatedAt = campaign.launch.updatedAt;
  return campaign;
}

export function getCampaignResults(campaignId: string): CampaignResults | null {
  const campaign = getCampaign(campaignId);
  if (!campaign) return null;
  const valid = campaign.votes.filter((vote) => vote.calibrationPassed);
  const votesA = valid.filter((vote) => vote.variant === 'A').length;
  const votesB = valid.filter((vote) => vote.variant === 'B').length;
  const winner = votesA === votesB ? null : votesA > votesB ? 'A' : 'B';
  const winningVotes = Math.max(votesA, votesB);
  const winRate = valid.length > 0 ? winningVotes / valid.length : null;
  // Hackathon-safe honesty: no claim of significance below n=12 or below 60/40.
  const significant = valid.length >= 12 && winRate != null && winRate >= 0.6;
  return {
    campaignId,
    nTotal: campaign.votes.length,
    nValid: valid.length,
    votesA,
    votesB,
    winner,
    winningCopy:
      winner === 'A'
        ? campaign.draft.variantA
        : winner === 'B'
          ? campaign.draft.variantB
          : null,
    winRate,
    significant,
    reasons: valid.map((vote) => vote.reason).filter(Boolean).slice(-6),
    terac: campaign.terac,
    launch: campaign.launch,
  };
}
