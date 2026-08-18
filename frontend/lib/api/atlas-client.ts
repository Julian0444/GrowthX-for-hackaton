// Cliente HTTP compartido. Único punto por donde el frontend habla con el
// backend. Vive en lib/api/ (canónico); NO existe lib/client/.

import type { CampaignRecommendation, EventIngestResponse } from "./types"
import type {
  CampaignDraft,
  Decision,
  SearchRequest,
  SearchResponse,
} from "@/lib/contracts/growxth"
import { getFixtureSearchResponse } from "@/lib/server/demo/fixtures"

// Búsqueda de oportunidades (contrato growxth.ts). Live-first: intenta el
// backend real y, ante cualquier falla, cae al fixture preparado marcando
// degraded: true. Nunca lanza — el frontend siempre recibe un SearchResponse.
export async function searchOpportunities(req: SearchRequest): Promise<SearchResponse> {
  try {
    const response = await fetch("/api/opportunities/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
      cache: "no-store",
      // The route returns the fast live sources first; slower Apify enrichment
      // continues server-side and the shell refreshes it without blocking.
      signal: AbortSignal.timeout(12000),
    })
    if (response.ok) {
      const data: unknown = await response.json()
      if (
        typeof data === "object" &&
        data !== null &&
        "opportunities" in data &&
        Array.isArray((data as { opportunities: unknown }).opportunities)
      ) {
        return data as SearchResponse
      }
    }
  } catch {
    // red caída / timeout / body inválido → fallback
  }
  const fixture = getFixtureSearchResponse()
  return {
    ...fixture,
    query: req,
    degraded: true,
    warnings: [...fixture.warnings, "Backend no disponible; sirviendo fixture preparado."],
  }
}

export interface SharedLinqSearch {
  response: SearchResponse
  focusOpportunityId: string | null
  expiresAt: string
}

export async function fetchSharedLinqSearch(id: string): Promise<SharedLinqSearch> {
  const response = await fetch(`/api/linq/share/${encodeURIComponent(id)}`, {
    cache: "no-store",
  })
  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok || typeof payload !== "object" || payload === null || !("response" in payload)) {
    throw new Error(
      typeof payload === "object" &&
        payload !== null &&
        "error" in payload &&
        typeof payload.error === "string"
        ? payload.error
        : "The Linq result link is unavailable.",
    )
  }
  return payload as SharedLinqSearch
}

export async function ingestEvent(url: string): Promise<EventIngestResponse> {
  const response = await fetch("/api/events/ingest", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url }),
  })
  // 4xx/5xx también traen EventIngestResponse (extraction "failed" + warnings).
  const payload: unknown = await response.json().catch(() => null)
  if (
    typeof payload === "object" &&
    payload !== null &&
    "extraction" in payload &&
    typeof payload.extraction === "object"
  ) {
    return payload as EventIngestResponse
  }
  throw new Error("Ingest endpoint unavailable")
}

// ---- Launch Room (§L5) ----

export interface DecisionSnapshot {
  decision: Decision
  confirmedTierPriceUsd: number | null
}

// Lee una decisión. Devuelve null si no existe (404) o ante error de red.
export async function fetchDecision(id: string): Promise<DecisionSnapshot | null> {
  try {
    const response = await fetch(`/api/decisions/${encodeURIComponent(id)}`, { cache: "no-store" })
    if (!response.ok) return null
    const data: unknown = await response.json()
    if (typeof data === "object" && data !== null && "decision" in data) {
      return data as DecisionSnapshot
    }
  } catch {
    // red caída → null
  }
  return null
}

// Polling cada 2s (sin websockets). Devuelve una función para frenarlo.
// `onUpdate` recibe cada snapshot; solo notifica cuando algo cambió.
export function pollDecision(
  id: string,
  onUpdate: (snapshot: DecisionSnapshot) => void,
  intervalMs = 2000,
): () => void {
  let stopped = false
  let lastSerialized = ""

  const tick = async (): Promise<void> => {
    if (stopped) return
    const snapshot = await fetchDecision(id)
    if (snapshot && !stopped) {
      const serialized = JSON.stringify(snapshot)
      if (serialized !== lastSerialized) {
        lastSerialized = serialized
        onUpdate(snapshot)
      }
    }
  }

  void tick()
  const handle = setInterval(() => void tick(), intervalMs)
  return () => {
    stopped = true
    clearInterval(handle)
  }
}

// ---- Human copy validation + launch tracks ----

export type CampaignResults = {
  campaignId: string
  nTotal: number
  nValid: number
  votesA: number
  votesB: number
  winner: "A" | "B" | null
  winningCopy: string | null
  winRate: number | null
  significant: boolean
  reasons: string[]
  terac: {
    projectId: string
    opportunityId: string
    status: string
    participantTarget: number
    pricing: {
      costPerParticipantCents: number | null
      totalCostCents: number | null
      currency: string
    } | null
    submissionStats: {
      total: number
      inProgress: number
      awaitingReview: number
      approved: number
      rejected: number
    } | null
    updatedAt: string
  } | null
  launch: {
    state: "draft" | "sent" | "approved" | "rejected" | "needs_evidence"
    chatId: string | null
    messageId: string | null
    updatedAt: string
  }
}

function campaignDraft(campaign: CampaignRecommendation): CampaignDraft {
  return {
    id: campaign.campaignId,
    opportunityId: campaign.opportunityId,
    title: campaign.title,
    variantA: campaign.variantA,
    variantB: campaign.variantB,
  }
}

async function jsonRequest<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(
      typeof payload === "object" &&
        payload !== null &&
        "error" in payload &&
        typeof payload.error === "string"
        ? payload.error
        : `Request failed (${response.status}).`,
    )
  }
  return payload as T
}

export async function ensureResearchCampaign(
  campaign: CampaignRecommendation,
): Promise<CampaignResults> {
  const payload = await jsonRequest<{ results: CampaignResults }>("/api/research/campaign", {
    campaign: campaignDraft(campaign),
  })
  return payload.results
}

export async function fetchCampaignResults(campaignId: string): Promise<CampaignResults> {
  const response = await fetch(
    `/api/research/campaign?campaignId=${encodeURIComponent(campaignId)}`,
    { cache: "no-store" },
  )
  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok || typeof payload !== "object" || payload === null || !("results" in payload)) {
    throw new Error("Campaign results are unavailable.")
  }
  return (payload as { results: CampaignResults }).results
}

export async function runTeracAction(
  campaign: CampaignRecommendation,
  action: "draft" | "refresh" | "launch",
): Promise<CampaignResults> {
  const payload = await jsonRequest<{ results: CampaignResults }>("/api/research/terac", {
    action,
    campaign: campaignDraft(campaign),
    campaignId: campaign.campaignId,
    participants: 12,
  })
  return payload.results
}

export async function launchCampaignWithLinq(input: {
  campaign: CampaignRecommendation
  to?: string
  variant?: "A" | "B"
}): Promise<CampaignResults> {
  const payload = await jsonRequest<{ results: CampaignResults }>("/api/linq/launch", {
    campaign: campaignDraft(input.campaign),
    to: input.to,
    variant: input.variant,
  })
  return payload.results
}
