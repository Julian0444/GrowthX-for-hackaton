import type { MarketMomentumSignal } from "@/lib/contracts/growxth"

// Contrato con el backend (§10 del plan) — el frontend consume UN solo tipo para
// backend real, fixtures y fallback. Reglas: nunca números sin marcar real vs.
// estimado; IDs de señales estables; fechas ISO 8601; coordenadas [lng, lat];
// score y confidence en escala 0–100 (como los fixtures §11).

export type SearchRequest = {
  query: string
  objective: "adoption" | "feedback" | "talent" | "awareness"
  audience?: string[]
  technologies?: string[]
  timeRange: "7d" | "30d" | "90d"
  layers: Array<"demand" | "events" | "communities" | "companies">
  location?: {
    lat: number
    lng: number
    source: "linq" | "browser"
    locality?: string | null
    updatedAt?: string | null
  }
}

export type SearchResponse = {
  searchId: string
  generatedAt: string // ISO 8601, siempre
  interpretation: ProductInterpretation
  opportunities: Opportunity[]
  dataCoverage: DataCoverage
  warnings?: string[]
  locationContext?: {
    source: "linq" | "browser"
    lat: number
    lng: number
    locality: string | null
    updatedAt: string | null
    scorePolicy: "tie_break_only"
  } | null
}

export type ProductInterpretation = {
  category: string
  problem: string
  targetAudience: string[]
  technologies: string[]
  objective: string
  summary: string
}

export type Opportunity = {
  id: string
  rank: number
  city: string
  country: string
  coordinates: [number, number] // SIEMPRE [longitude, latitude]
  score: number
  confidence: number
  activationCostBand: "low" | "medium" | "high" | "unknown"
  recommendation: string // la oración del panel
  reasons: OpportunityReason[]
  metrics: OpportunityMetrics
  evidence: SourceReference[]
  signals: SignalPoint[]
  events: EventOpportunity[]
  comparison?: MarketComparison
  campaign?: CampaignRecommendation
  distanceMiles?: number | null
  momentumSignals?: MarketMomentumSignal[]
}

export type OpportunityReason = {
  id: string
  label: string
  explanation: string
  impact: "positive" | "neutral" | "negative"
  weight?: number
  sourceLabel?: string // etiqueta corta de origen mostrada junto a la razón
  evidenceIds: string[]
}

export type OpportunityMetrics = {
  demand: number | null
  developerFit: number | null
  eventMomentum: number | null
  costEfficiency: number | null
  competitionGap: number | null
}

export type SignalPoint = {
  id: string // ESTABLE entre requests (permite motion)
  type: "demand" | "event" | "community" | "company"
  coordinates: [number, number]
  intensity: number
  confidence: number
  observedAt: string
  sourceId?: string
}

export type EventOpportunity = {
  id: string
  name: string
  url: string
  startsAt: string
  endsAt?: string
  venue?: string
  city: string
  coordinates?: [number, number]
  organizer?: string
  sponsors: string[]
  prizePool?: { amount: number; currency: string }
  registrationStatus?: string
  relevance: number
  confidence: number
  source: SourceReference
}

export type SourceReference = {
  id: string
  provider: string
  url?: string
  title: string
  observedAt: string
  isEstimated: boolean
}

// Alimenta §8.8:
export type MarketComparison = {
  baselineCity: string // "San Francisco"
  baselineScore: number
  costPerActivatedDev: {
    market: { amount: number; currency: "USD" } | null
    baseline: { amount: number; currency: "USD" } | null
    isEstimated: boolean // true hasta tener datos de partners
  }
  sponsorSaturation: {
    market: "very_low" | "low" | "medium" | "high"
    baseline: "very_low" | "low" | "medium" | "high"
  }
  note: string // una línea honesta: qué gana cada mercado
}

export type DataCoverage = {
  sourcesRequested: string[]
  sourcesAvailable: string[]
  unavailableSources: string[]
  geographicCoverage: number
  confidence: number
}

export type CampaignRequest = { searchId: string; opportunityId: string; eventId?: string }

export type CampaignRecommendation = {
  campaignId: string
  opportunityId: string
  title: string
  subtitle: string
  track: string
  prize: string
  workshop: string
  organizerMessage: string
  funnel: Array<{ label: string; value: number }>
  attributionCode: string // ej. "GROWX-BLR-0823"
  variantA: string
  variantB: string
}

export type RequestState =
  | { status: "idle" }
  | { status: "loading"; stage?: string }
  | { status: "success" }
  | { status: "partial"; message: string }
  | { status: "error"; message: string; retryable: boolean }

// POST /api/events/ingest { url } (§10, "la demo técnica estrella").
// `event` es null solo cuando extraction.status === "failed".
export type EventIngestResponse = {
  event: EventOpportunity | null
  extraction: {
    status: "complete" | "partial" | "failed"
    warnings: string[]
    fieldsExtracted: string[]
  }
}
