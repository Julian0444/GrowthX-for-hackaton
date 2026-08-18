import type {
  CampaignDraft,
  Coverage,
  Evidence,
  EvidenceSource,
  Opportunity,
  Reason,
  SearchRequest,
  SearchResponse,
  Status,
} from '@/lib/contracts/growxth';
import {
  loadCommunityEvidence,
  loadEvidence,
  loadGraph,
  type SeedGraph,
} from '@/lib/server/graph/load-graph';
import {
  deriveRuntimeGraph,
  distanceMiles,
} from '@/lib/server/graph/derive-signals';
import { scoreCommunity } from '@/lib/server/scoring/community-score';
import { scoreTheme } from '@/lib/server/scoring/theme-score';
import { computeRoi } from '@/lib/server/scoring/roi';
import { clamp01 } from '@/lib/server/scoring/score-utils';

export interface PipelineDeps {
  graph: SeedGraph;
  evidence: Evidence[];
  communityEvidence: Record<string, Evidence[]>;
}

export interface PipelineOptions {
  budgetMs?: number;
  deps?: Partial<PipelineDeps>;
}

const STATUS_RANK: Record<Status, number> = { observed: 3, estimated: 2, prepared: 1 };

function bestStatus(evidence: Evidence[]): Status {
  let best: Status = 'prepared';
  for (const item of evidence) {
    if (STATUS_RANK[item.status] > STATUS_RANK[best]) best = item.status;
  }
  return best;
}

function loadDeps(deps?: Partial<PipelineDeps>): PipelineDeps {
  return {
    graph: deps?.graph ?? loadGraph(),
    evidence: deps?.evidence ?? loadEvidence(),
    communityEvidence: deps?.communityEvidence ?? loadCommunityEvidence(),
  };
}

function collectCitedIds(reasons: Reason[]): string[] {
  return [...new Set(reasons.flatMap((reason) => reason.evidenceIds))];
}

function compactCopy(value: string, max = 320): string {
  const oneLine = value.replace(/\s+/g, ' ').trim();
  return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max - 1).trimEnd()}…`;
}

function buildCampaign(
  request: SearchRequest,
  opportunityId: string,
  communityName: string,
  eventName: string,
): CampaignDraft {
  const product = request.product.trim() || 'your product';
  const audience = request.icpStack.slice(0, 2).join(' + ') || 'builders';
  return {
    id: `camp-${opportunityId}`,
    opportunityId,
    title: `${eventName} × ${product}`,
    variantA: compactCopy(
      `Join ${communityName} at ${eventName} to see how ${product} helps ${audience} ship faster. Leave with a practical workflow you can try the same day.`,
    ),
    variantB: compactCopy(
      `Building with ${audience}? Come to ${eventName} and leave with one working ${product} playbook—not another product pitch.`,
    ),
  };
}

export function searchOpportunities(
  request: SearchRequest,
  options: PipelineOptions = {},
): SearchResponse {
  const budgetMs = options.budgetMs ?? 8000;
  const startedAt = Date.now();
  const deadlineHit = (): boolean => Date.now() - startedAt > budgetMs;
  const warnings: string[] = [];
  const sourcesUsed = new Set<EvidenceSource>();
  const sourcesFailed = new Set<EvidenceSource>();

  const deps = loadDeps(options.deps);
  const runtime = deriveRuntimeGraph(deps.graph, request);
  const scoringRequest: SearchRequest = {
    ...request,
    icpStack: runtime.requestCapabilities,
  };
  const evidence = [...deps.evidence, ...runtime.evidence];
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));
  for (const item of evidence) sourcesUsed.add(item.source);

  const hasExaEvidence = Object.values(deps.communityEvidence).some((items) => items.length > 0);
  if (!hasExaEvidence) {
    sourcesFailed.add('exa');
    warnings.push('Exa enrichment is unavailable; ranking uses verified Luma signals only.');
  }

  const candidates: Opportunity[] = [];
  for (const candidate of runtime.candidates) {
    if (deadlineHit()) {
      warnings.push('Search reached its 8 second budget; returning a partial ranking.');
      break;
    }

    const { community, event, theme } = candidate;
    const exaEvidence = deps.communityEvidence[community.id] ?? [];
    for (const item of exaEvidence) {
      if (!evidenceById.has(item.id)) {
        evidence.push(item);
        evidenceById.set(item.id, item);
      }
      sourcesUsed.add(item.source);
    }

    const scoringCommunity = exaEvidence.length
      ? {
          ...community,
          evidenceIds: [...new Set([...community.evidenceIds, ...exaEvidence.map((item) => item.id)])],
        }
      : community;

    const communityResult = scoreCommunity({
      community: scoringCommunity,
      evidence,
      request: scoringRequest,
    });
    const themeResult = scoreTheme({
      theme,
      community: scoringCommunity,
      evidence,
      request: scoringRequest,
    });

    const lumaEvidenceId = `ev-luma-${event.id}`;
    const reasons: Reason[] = [
      ...communityResult.reasons,
      ...themeResult.reasons,
      {
        text: `Luma lists “${event.name}” as an upcoming San Francisco event for this community.`,
        evidenceIds: [lumaEvidenceId],
      },
    ];
    if (exaEvidence.length > 0) {
      reasons.push({
        text: `Exa found ${exaEvidence.length} additional public source${exaEvidence.length === 1 ? '' : 's'} for ${community.name}.`,
        evidenceIds: exaEvidence.map((item) => item.id),
      });
    }

    const citedEvidence = collectCitedIds(reasons)
      .map((id) => evidenceById.get(id))
      .filter((item): item is Evidence => item != null);

    const icpFitRate = communityResult.breakdown.stackOverlap;
    const expectedAttendance =
      event.expectedAttendance != null && event.expectedAttendance > 0
        ? event.expectedAttendance
        : null;
    const roi = computeRoi({
      // Los listings no ofrecen un costo completo y comparable de organizar la
      // activación; no convertimos tiers aislados en un presupuesto estimado.
      tierPriceUsd: null,
      expectedAttendance,
      icpFitRate,
      icpFitBasis: icpFitRate == null ? null : 'luma',
    });
    const targetSize =
      expectedAttendance != null && icpFitRate != null
        ? Math.round(expectedAttendance * icpFitRate)
        : null;
    const score = Math.round((communityResult.score + themeResult.score) / 2);
    const confidence =
      citedEvidence.length > 0
        ? Math.round(
            (citedEvidence.reduce((sum, item) => sum + clamp01(item.confidence), 0) /
              citedEvidence.length) *
              100,
          )
        : 0;
    const id = `opp-${community.id}-${event.id}`;
    const distance =
      request.location != null
        ? distanceMiles(
            { lat: request.location.lat, lng: request.location.lng },
            { lat: event.lat, lng: event.lng },
          )
        : null;

    const headline = `Activate ${community.name} through ${event.name} with a hands-on developer play`;

    candidates.push({
      id,
      title: event.name,
      subtitle: `${community.name} · ${event.venueArea ?? 'San Francisco'}`,
      lat: event.lat,
      lng: event.lng,
      play: {
        headline,
        communityId: community.id,
        themeId: theme.id,
        eventId: event.id,
        audienceSpec: {
          targetSize,
          profile: runtime.requestCapabilities.slice(0, 3),
          qualifier: null,
          teracNote: null,
        },
      },
      score,
      breakdown: {
        community: communityResult.breakdown,
        theme: themeResult.breakdown,
      },
      reasons,
      roi,
      confidence,
      status: bestStatus(citedEvidence),
      humanValidated: false,
      distanceMiles: distance == null ? null : Math.round(distance * 10) / 10,
      event: {
        id: event.id,
        name: event.name,
        url: event.url,
        startsAt: event.startsAt,
        venueArea: event.venueArea,
      },
      campaign: buildCampaign(request, id, community.name, event.name),
    });
  }

  candidates.sort((a, b) => {
    if (
      request.location &&
      a.distanceMiles != null &&
      b.distanceMiles != null &&
      Math.abs(a.score - b.score) <= 5
    ) {
      return a.distanceMiles - b.distanceMiles;
    }
    return b.score - a.score;
  });
  const opportunities = candidates.slice(0, 3);

  const resolvedEvidence: Record<string, Evidence> = {};
  for (const opportunity of opportunities) {
    for (const id of collectCitedIds(opportunity.reasons)) {
      const item = evidenceById.get(id);
      if (item) resolvedEvidence[id] = item;
    }
  }

  const coverage: Coverage = {
    eventsEvaluated: deps.graph.events.length,
    communitiesEvaluated: deps.graph.communities.length,
    organizersEvaluated: deps.graph.organizers.length,
    themesEvaluated: runtime.candidates.length,
    sourcesUsed: [...sourcesUsed],
    sourcesFailed: [...sourcesFailed],
  };

  if (request.location) {
    warnings.push('Shared location is used only as a tie-breaker; it never changes the market score.');
  }

  return {
    requestId: `req-${crypto.randomUUID().slice(0, 8)}`,
    query: request,
    opportunities,
    evidence: resolvedEvidence,
    coverage,
    warnings,
    generatedAt: new Date().toISOString(),
    degraded: sourcesFailed.size > 0 || warnings.some((warning) => warning.includes('partial')),
    locationContext: request.location
      ? {
          source: request.location.source,
          lat: request.location.lat,
          lng: request.location.lng,
          locality: request.location.locality ?? null,
          updatedAt: request.location.updatedAt ?? null,
          scorePolicy: 'tie_break_only',
        }
      : null,
  };
}
