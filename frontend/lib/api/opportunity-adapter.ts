// Adaptador (T3, opción adapter — SIN rediseño). Traduce el SearchResponse del
// contrato nuevo (growxth.ts) a la forma LEGACY (lib/api/types.ts) que hoy
// consumen mapa, rail y markers, sin tocar esos componentes.
//
// También reexporta { opportunities, evidence } SIN transformar, para alimentar
// los tres componentes aditivos nuevos (PlayHeadline, EvidenceLinks,
// ConfidenceBars).
//
// Nota de contrato: el Opportunity nuevo trae lat/lng reales de SF pero NO
// venueArea (venueArea vive en SFEvent, que no viaja en el SearchResponse). Como
// las coordenadas ya son a nivel de barrio, el zoom de barrio sale de ellas:
// usá cityFrame(projectCity(lng, lat), …) con NEIGHBORHOOD_ZOOM en vez del
// encuadre de país.

import type {
  Evidence as NewEvidence,
  Opportunity as NewOpportunity,
  SearchResponse as NewSearchResponse,
} from "@/lib/contracts/growxth"
import type {
  DataCoverage,
  Opportunity as LegacyOpportunity,
  OpportunityMetrics,
  OpportunityReason,
  ProductInterpretation,
  SearchResponse as LegacySearchResponse,
  SourceReference,
  EventOpportunity,
  CampaignRecommendation,
} from "./types"

// Zoom más cerrado que el de país: para plays de SF encuadramos el barrio.
export const NEIGHBORHOOD_ZOOM = 6

function pct(n: number | null): number | null {
  return n == null ? null : Math.round(Math.max(0, Math.min(1, n)) * 100)
}

// Primeras palabras del texto como "label" corto de la razón legacy.
function shortLabel(text: string): string {
  const words = text.trim().split(/\s+/).slice(0, 5).join(" ")
  return words.length < text.trim().length ? `${words}…` : words
}

function toMetrics(opp: NewOpportunity): OpportunityMetrics {
  const c = opp.breakdown.community
  const t = opp.breakdown.theme
  return {
    demand: pct(t.momentum),
    developerFit: pct(c.stackOverlap),
    eventMomentum: opp.event ? pct(t.momentum) : null,
    costEfficiency: null,
    competitionGap: pct(t.saturationGap ?? c.exclusivityGap),
  }
}

function toReasons(opp: NewOpportunity): OpportunityReason[] {
  return opp.reasons.map((r, i) => ({
    id: `${opp.id}-r${i}`,
    label: shortLabel(r.text),
    explanation: r.text,
    impact: "positive",
    evidenceIds: r.evidenceIds,
  }))
}

// La Evidence nueva (growxth.ts) se traduce a SourceReference del contrato
// legacy: solo la evidencia que las razones de ESTA opportunity referencian.
function toEvidence(opp: NewOpportunity, evidence: Record<string, NewEvidence>): SourceReference[] {
  const ids = [...new Set(opp.reasons.flatMap((r) => r.evidenceIds))]
  return ids.flatMap((id) => {
    const item = evidence[id]
    if (!item) return []
    return [
      {
        id: item.id,
        provider: item.source,
        url: item.url ?? undefined,
        title: item.title,
        observedAt: item.observedAt,
        isEstimated: item.status !== "observed",
      },
    ]
  })
}

function toEvents(
  opp: NewOpportunity,
  evidence: Record<string, NewEvidence>,
): EventOpportunity[] {
  if (!opp.event) return []
  const sourceEvidence =
    Object.values(evidence).find(
      (item) => item.source === "luma" && opp.reasons.some((reason) => reason.evidenceIds.includes(item.id)),
    ) ?? null
  return [
    {
      id: opp.event.id,
      name: opp.event.name,
      url: opp.event.url,
      startsAt: opp.event.startsAt ?? new Date().toISOString(),
      venue: opp.event.venueArea ?? undefined,
      city: opp.event.venueArea ?? opp.market?.city ?? "Location unavailable",
      coordinates: [opp.lng, opp.lat],
      sponsors: [],
      relevance: opp.score,
      confidence: opp.confidence,
      source: sourceEvidence
        ? {
            id: sourceEvidence.id,
            provider: sourceEvidence.source,
            url: sourceEvidence.url ?? undefined,
            title: sourceEvidence.title,
            observedAt: sourceEvidence.observedAt,
            isEstimated: sourceEvidence.status !== "observed",
          }
        : {
            id: `source-${opp.event.id}`,
            provider: "luma",
            url: opp.event.url,
            title: opp.event.name,
            observedAt: new Date().toISOString(),
            isEstimated: false,
          },
    },
  ]
}

function toCampaign(opp: NewOpportunity): CampaignRecommendation {
  const target = opp.play.audienceSpec.targetSize
  const funnel =
    target == null
      ? []
      : [
          { label: "Event audience", value: target },
          { label: "Qualified builders", value: Math.max(1, Math.round(target * 0.55)) },
          { label: "Activated", value: Math.max(1, Math.round(target * 0.35)) },
          { label: "Retained", value: Math.max(1, Math.round(target * 0.25)) },
        ]
  return {
    campaignId: opp.campaign.id,
    opportunityId: opp.id,
    title: opp.campaign.title,
    subtitle: "AI found the audience. Humans choose the clearest message. Linq launches it.",
    track: opp.play.headline,
    prize: "Hands-on product credit for the winning build",
    workshop: `A practical session for ${opp.play.audienceSpec.profile.join(" + ") || "builders"}`,
    organizerMessage: opp.campaign.variantA,
    funnel,
    attributionCode: `GROWX-${opp.id.replace(/[^a-z0-9]/gi, "").slice(-8).toUpperCase()}`,
    variantA: opp.campaign.variantA,
    variantB: opp.campaign.variantB,
  }
}

function toLegacyOpportunity(
  opp: NewOpportunity,
  index: number,
  evidence: Record<string, NewEvidence>,
): LegacyOpportunity {
  return {
    id: opp.id,
    rank: index + 1,
    city:
      opp.market?.city ??
      (opp.subtitle.split(" · ")[0] || opp.event?.venueArea || opp.title),
    country: opp.market?.country ?? "United States",
    coordinates: [opp.lng, opp.lat], // SIEMPRE [lng, lat]
    score: opp.score,
    confidence: opp.confidence,
    activationCostBand: "unknown",
    recommendation: opp.play.headline,
    reasons: toReasons(opp),
    metrics: toMetrics(opp),
    evidence: toEvidence(opp, evidence),
    signals: [], // la nube se genera determinística en signal-layout
    events: toEvents(opp, evidence),
    campaign: toCampaign(opp),
    distanceMiles: opp.distanceMiles,
    momentumSignals: opp.momentumSignals,
  }
}

function toInterpretation(res: NewSearchResponse): ProductInterpretation {
  const q = res.query
  return {
    category: q.product.slice(0, 60),
    problem: "",
    targetAudience: q.icpStack,
    technologies: q.icpStack,
    objective: q.goal,
    summary: q.product,
  }
}

function toCoverage(res: NewSearchResponse): DataCoverage {
  const requested = [...res.coverage.sourcesUsed, ...res.coverage.sourcesFailed]
  const confidences = res.opportunities.map((o) => o.confidence)
  const avg = confidences.length
    ? Math.round(confidences.reduce((s, n) => s + n, 0) / confidences.length)
    : 0
  return {
    sourcesRequested: requested,
    sourcesAvailable: res.coverage.sourcesUsed,
    unavailableSources: res.coverage.sourcesFailed,
    geographicCoverage: 100,
    confidence: avg,
  }
}

export function toLegacyShape(res: NewSearchResponse): LegacySearchResponse {
  return {
    searchId: res.requestId,
    generatedAt: res.generatedAt,
    interpretation: toInterpretation(res),
    opportunities: res.opportunities.map((opp, index) => toLegacyOpportunity(opp, index, res.evidence)),
    dataCoverage: toCoverage(res),
    warnings: res.warnings,
    locationContext: res.locationContext,
  }
}

// Passthrough sin transformar, para los componentes aditivos nuevos.
export function rawOpportunities(res: NewSearchResponse): {
  opportunities: NewOpportunity[]
  evidence: Record<string, NewEvidence>
} {
  return { opportunities: res.opportunities, evidence: res.evidence }
}
