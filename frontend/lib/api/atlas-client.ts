// Cliente HTTP compartido. Único punto por donde el frontend habla con el
// backend. Vive en lib/api/ (canónico); NO existe lib/client/.

import type {
  EvaluationProfile,
  ComparableCompanyRef,
  ClaimRevision,
  CompanyRecord,
  DeclaredDate,
  EditionLocation,
  EventEditionRevision,
  OrganizerRevision,
  ParticipationRevision,
  SourceRecord,
} from "@/lib/contracts/evaluation"
import type {
  SearchRequest,
  SearchResponse,
} from "@/lib/contracts/growxth"
import { getFixtureSearchResponse } from "@/lib/server/demo/fixtures"
import { classifyEventValidity } from "@/lib/temporal/event-validity"

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
  // Regla temporal (ticket 04): el fixture es material preparado con fechas
  // históricas; el fallback lo identifica en vez de reintroducirlo como
  // vigente (la proyección del adaptador tampoco presenta vencidos como
  // próximos eventos).
  const evaluationInstant = new Date().toISOString()
  const expiredEvents = fixture.opportunities.filter(
    (opp) =>
      opp.event != null &&
      classifyEventValidity(opp.event.startsAt, evaluationInstant).validity === "past",
  ).length
  return {
    ...fixture,
    query: req,
    degraded: true,
    warnings: [
      ...fixture.warnings,
      "Backend no disponible; sirviendo fixture preparado.",
      ...(expiredEvents > 0
        ? [
            `${expiredEvents} evento${expiredEvents === 1 ? "" : "s"} del fixture ya ocurrieron; son antecedentes históricos, no oportunidades vigentes.`,
          ]
        : []),
    ],
  }
}

// ---- Importación durable de un evento Luma (ticket 11) ----
// POST /api/events/ingest delega en la operación durable: la respuesta es
// asíncrona (202 con runId); la obtención corre en el worker y el dossier se
// reabre desde PostgreSQL (fetchEditionDossier con el editionId del result).

export interface EventIngestStartInput {
  url: string
  idempotencyKey: string
  // La importación pertenece a una investigación existente: su perfil es el
  // del run referenciado (el servidor lo resuelve; nunca se fabrica uno).
  profileRunId: string
}

// Espejo de LumaIngestResult (lib/server/evaluations/luma-step.ts).
export interface EventIngestRunResult {
  kind: "luma_event_ingest"
  version: 1
  requestedUrl: string
  canonicalUrl: string
  editionId: string
  editionRevisionId: string
  sourceId: string
  linkedToExistingEdition: boolean
  extraction: { status: "complete" | "partial"; warnings: string[]; fieldsExtracted: string[] }
}

// Resultado tipado de un run de importación, o null si el run no es (o aún no
// publicó) una importación.
export function eventIngestResult(run: EvaluationRunView | null): EventIngestRunResult | null {
  const result = run?.result
  if (
    typeof result === "object" &&
    result !== null &&
    "kind" in result &&
    (result as { kind: unknown }).kind === "luma_event_ingest" &&
    typeof (result as { editionId?: unknown }).editionId === "string"
  ) {
    return result as EventIngestRunResult
  }
  return null
}

// Nunca lanza (mismo criterio que startEvaluation): cualquier falla llega como
// outcome tipado.
export async function startEventIngest(input: EventIngestStartInput): Promise<StartEvaluationOutcome> {
  try {
    const response = await fetch("/api/events/ingest", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      cache: "no-store",
    })
    const data: unknown = await response.json().catch(() => null)
    const record = typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {}
    const message = typeof record.message === "string" ? record.message : `HTTP ${response.status}`
    if (response.status === 202 && typeof record.runId === "string") {
      return { status: "accepted", runId: record.runId, deduplicated: record.deduplicated === true }
    }
    if (response.status === 401) return { status: "unauthorized", message }
    if (response.status === 409) return { status: "conflict", message }
    if (response.status === 400) return { status: "invalid", message }
    return { status: "unavailable", message }
  } catch {
    return { status: "unavailable", message: "No se pudo contactar /api/events/ingest." }
  }
}

// ---- Comparación de inversión y snapshot oficial (ticket 12) ----
// Tipos espejo del resultado publicado por el worker
// (lib/server/evaluations/compare.ts › ComparisonRunResult); este archivo no
// importa nada de lib/server. El bundle es el contrato 07 y se proyecta con
// projectEvaluationRead (lib/api/opportunity-adapter.ts).

export interface ComparisonStartInput {
  idempotencyKey: string
  mode: "investment_comparison"
  profileRunId: string
  editionIds: string[] // 1..3 ediciones del catálogo del tenant
  // Ticket 14: «Reevaluar» crea OTRO run vinculado al run de comparación
  // anterior; el snapshot y la decisión previos siguen disponibles tal cual.
  previousRunId?: string
}

export interface ComparisonFeatureValue {
  key: string
  value: number | null // null = dato ausente; NUNCA se lee como 0
  missingReason: string | null
  claimRevisionIds: string[]
  note: string | null
}

export type ComparisonV0ShadowEntry =
  | { editionId: string; status: "not_comparable"; reason: string }
  | {
      editionId: string
      status: "reference_found_not_comparable"
      reason: string
      v0Id: string
      v0Unit: string
      v0Objective: string
      v0Score: number
    }

export interface ComparisonV0Shadow {
  mode: "offline_shadow"
  referenceLabel: string | null
  entries: ComparisonV0ShadowEntry[]
  note: string
}

export interface ComparisonAvailableCatalog {
  evaluatedAt: string
  editionIds: string[]
  upcomingEditionIds: string[]
  comparedEditionIds: string[]
  note: string
}

export interface ComparisonNarrativeProposal {
  editionId: string
  summary: string
  selectedClaimRevisionIds: string[]
  withheldNote: string | null
}

export interface ComparisonNarrativeRecordView {
  version: 1
  snapshotId: string
  status: "validated" | "rejected" | "deterministic_only"
  motive: string | null
  model: string
  promptVersion: string
  durationMs: number
  usage: { promptTokens: number | null; responseTokens: number | null; totalTokens: number | null } | null
  proposals: ComparisonNarrativeProposal[]
  discarded: {
    attemptedOrdering: boolean
    attemptedScores: boolean
    attemptedEligibility: boolean
    unknownEditionIds: string[]
  } | null
  warnings: string[]
}

export interface ComparisonRunResult {
  kind: "investment_comparison"
  version: 1
  snapshotId: string
  evaluatedAt: string
  bundle: import("../contracts/evaluation").EvaluationReadBundle
  featureSetVersion: string
  featuresByEdition: Record<string, ComparisonFeatureValue[]>
  v0Shadow: ComparisonV0Shadow
  availableCatalog: ComparisonAvailableCatalog
  narrative: ComparisonNarrativeRecordView | null
  eligibleIsNotRecommended: string
  warnings: string[]
}

// Resultado tipado de un run de comparación, o null si el run no es (o aún no
// publicó) una comparación.
export function comparisonResult(run: EvaluationRunView | null): ComparisonRunResult | null {
  const result = run?.result
  if (
    typeof result === "object" &&
    result !== null &&
    "kind" in result &&
    (result as { kind: unknown }).kind === "investment_comparison" &&
    typeof (result as { snapshotId?: unknown }).snapshotId === "string" &&
    typeof (result as { bundle?: unknown }).bundle === "object"
  ) {
    return result as ComparisonRunResult
  }
  return null
}

// Misma frontera POST /api/evaluations que startEvaluation, con el cuerpo de
// comparación. Nunca lanza.
export function startComparison(input: ComparisonStartInput): Promise<StartEvaluationOutcome> {
  return postEvaluationBody(input)
}

// ---- Evaluación persistida (ticket 08) ----
// Tipos espejo de la frontera HTTP de /api/evaluations (el servidor valida en
// lib/server/evaluations/wire.ts; este archivo no importa nada de lib/server).

export interface EvaluationStartInput {
  idempotencyKey: string
  mode: "catalog_research"
  researchScope?: "sf_organizers"
  previousRunId?: string
  profile: {
    product: string
    comparableCompanies?: ComparableCompanyRef[]
    audienceDescription: string
    audienceProfiles: string[]
    stack: string[]
    // Presupuesto desconocido es un estado explícito, nunca 0.
    budget: { status: "declared"; amount: number; currency: string } | { status: "unknown" }
    window: { from: string | null; to: string | null }
    objective: { kind: "adoption" | "feedback" | "hiring" | "awareness" }
  }
}

export interface EvaluationStepView {
  name: string
  seq: number
  state: "pending" | "running" | "completed" | "failed"
  attempts: number
  startedAt: string | null
  finishedAt: string | null
  error: string | null
}

export interface EvaluationRunView {
  runId: string
  state: "queued" | "running" | "completed" | "failed"
  mode: string
  workflowVersion: string
  profileId: string
  profile: EvaluationProfile
  previousRunId: string | null
  // URL solicitada de un run de importación Luma (null en investigaciones).
  requestedUrl: string | null
  savedOrganizers: import("../../components/research-dashboard/research-types").SavedOrganizerResearch[]
  createdAt: string
  updatedAt: string
  steps: EvaluationStepView[]
  result: unknown
  error: string | null
}

export type StartEvaluationOutcome =
  | { status: "accepted"; runId: string; deduplicated: boolean }
  | { status: "conflict"; message: string }
  | { status: "unauthorized"; message: string }
  | { status: "invalid"; message: string }
  | { status: "unavailable"; message: string }

// Nunca lanza: cualquier falla llega como outcome tipado y el shell decide
// (sin base o sin sesión, el recorrido v0 sigue funcionando).
export async function startEvaluation(input: EvaluationStartInput): Promise<StartEvaluationOutcome> {
  return postEvaluationBody(input)
}

async function postEvaluationBody(input: unknown): Promise<StartEvaluationOutcome> {
  try {
    const response = await fetch("/api/evaluations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      cache: "no-store",
    })
    const data: unknown = await response.json().catch(() => null)
    const record = typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {}
    const message = typeof record.message === "string" ? record.message : `HTTP ${response.status}`
    if (response.status === 202 && typeof record.runId === "string") {
      return { status: "accepted", runId: record.runId, deduplicated: record.deduplicated === true }
    }
    if (response.status === 401) return { status: "unauthorized", message }
    if (response.status === 409) return { status: "conflict", message }
    if (response.status === 400) return { status: "invalid", message }
    return { status: "unavailable", message }
  } catch {
    return { status: "unavailable", message: "No se pudo contactar /api/evaluations." }
  }
}

export type FetchEvaluationOutcome =
  | { status: "ok"; run: EvaluationRunView }
  | { status: "unauthorized" }
  | { status: "missing" }
  | { status: "unreachable" }

export async function fetchEvaluation(runId: string): Promise<FetchEvaluationOutcome> {
  try {
    const response = await fetch(`/api/evaluations/${encodeURIComponent(runId)}`, {
      cache: "no-store",
    })
    if (response.status === 401) return { status: "unauthorized" }
    if (response.status === 404) return { status: "missing" }
    if (!response.ok) return { status: "unreachable" }
    const data: unknown = await response.json()
    if (typeof data === "object" && data !== null && "runId" in data && "steps" in data) {
      return { status: "ok", run: data as EvaluationRunView }
    }
    return { status: "unreachable" }
  } catch {
    return { status: "unreachable" }
  }
}

// Polling del run (sin websockets). Notifica cada cambio y se frena solo al
// llegar a completed/failed (o si la sesión deja de valer / el run no existe).
export function pollEvaluation(
  runId: string,
  onUpdate: (outcome: FetchEvaluationOutcome) => void,
  intervalMs = 1500,
): () => void {
  let stopped = false
  let lastSerialized = ""
  let handle: ReturnType<typeof setInterval> | null = null

  const finish = () => {
    stopped = true
    if (handle !== null) clearInterval(handle)
  }

  const tick = async (): Promise<void> => {
    if (stopped) return
    const outcome = await fetchEvaluation(runId)
    if (stopped) return
    if (outcome.status === "ok") {
      const serialized = JSON.stringify(outcome.run)
      if (serialized !== lastSerialized) {
        lastSerialized = serialized
        onUpdate(outcome)
      }
      if (outcome.run.state === "completed" || outcome.run.state === "failed") finish()
      return
    }
    onUpdate(outcome)
    if (outcome.status === "unauthorized" || outcome.status === "missing") finish()
  }

  void tick()
  handle = setInterval(() => void tick(), intervalMs)
  return finish
}

// ---- Catálogo curado y dossiers (ticket 09) ----
// Tipos espejo de la frontera HTTP de /api/catalog/* y /api/organizers/:id
// (el servidor los produce en lib/server/catalog/read.ts; este archivo no
// importa nada de lib/server para el recorrido persistido). Se componen de los
// contratos del ticket 07 (solo tipos, importados arriba).

export interface EditionValidityView {
  validity: "upcoming" | "past" | "date_pending" | "date_ambiguous"
  reason: string
}

export interface CurationInfo {
  // 'imported' = material extraído automáticamente por la importación durable
  // de Luma (ticket 11); no acredita curación ni revisión humana.
  material: "synthetic" | "curated" | "imported"
  authorizedBy: string
  verifiedAt: string
  manifestName: string
  note: string | null
}

export interface CatalogEditionSummary {
  editionId: string
  name: string
  canonicalUrl: string | null
  startDate: DeclaredDate
  location: EditionLocation
  organizers: { organizerId: string; displayName: string }[]
  validity: EditionValidityView
  pendingAttributes: string[]
  curation: CurationInfo | null
}

export interface CatalogListRead {
  contractVersion: "1"
  evaluatedAt: string
  editions: CatalogEditionSummary[]
  upcomingCount: number
  note: string | null
}

export interface RevisionedClaimRead {
  claimId: string
  revisions: ClaimRevision[]
}

export interface RevisionedOrganizerRead {
  organizerId: string
  revisions: OrganizerRevision[]
}

export interface RevisionedParticipationRead {
  participationId: string
  revisions: ParticipationRevision[]
}

export interface EditionDossierRead {
  contractVersion: "1"
  evaluatedAt: string
  editionId: string
  editionRevisions: EventEditionRevision[]
  validity: EditionValidityView
  organizers: RevisionedOrganizerRead[]
  claims: RevisionedClaimRead[]
  participations: RevisionedParticipationRead[]
  companies: CompanyRecord[]
  sources: SourceRecord[]
  curation: CurationInfo | null
}

export interface OrganizerDossierRead {
  contractVersion: "1"
  evaluatedAt: string
  organizerId: string
  organizerRevisions: OrganizerRevision[]
  claims: RevisionedClaimRead[]
  editions: { edition: EventEditionRevision; validity: EditionValidityView }[]
  participations: RevisionedParticipationRead[]
  companies: CompanyRecord[]
  sources: SourceRecord[]
  coverage: { antecedentsDocumented: number; note: string | null }
}

export type CatalogFetchOutcome<T> =
  | { status: "ok"; data: T }
  | { status: "unauthorized" }
  | { status: "missing" }
  | { status: "unavailable" }

// GET tipado que nunca lanza (mismo criterio que fetchEvaluation): cualquier
// falla llega como outcome y el panel decide qué mostrar.
async function fetchCatalogJson<T>(path: string, marker: string): Promise<CatalogFetchOutcome<T>> {
  try {
    const response = await fetch(path, { cache: "no-store" })
    if (response.status === 401) return { status: "unauthorized" }
    if (response.status === 404) return { status: "missing" }
    if (!response.ok) return { status: "unavailable" }
    const data: unknown = await response.json()
    if (typeof data === "object" && data !== null && marker in data) {
      return { status: "ok", data: data as T }
    }
    return { status: "unavailable" }
  } catch {
    return { status: "unavailable" }
  }
}

export function fetchCatalogEditions(): Promise<CatalogFetchOutcome<CatalogListRead>> {
  return fetchCatalogJson<CatalogListRead>("/api/catalog/editions", "editions")
}

export function fetchEditionDossier(editionId: string): Promise<CatalogFetchOutcome<EditionDossierRead>> {
  return fetchCatalogJson<EditionDossierRead>(
    `/api/catalog/editions/${encodeURIComponent(editionId)}`,
    "editionRevisions",
  )
}

export function fetchOrganizerDossier(
  organizerId: string,
): Promise<CatalogFetchOutcome<OrganizerDossierRead>> {
  return fetchCatalogJson<OrganizerDossierRead>(
    `/api/organizers/${encodeURIComponent(organizerId)}`,
    "organizerRevisions",
  )
}

// ---- Decisión condicional persistida (ticket 13) ----
// Tipos espejo de la frontera HTTP de /api/decisions (el servidor valida en
// lib/server/decisions/wire.ts y persiste en lib/server/decisions/store.ts;
// este archivo no importa nada de lib/server para este recorrido). Sustituye
// la lectura en memoria de la Launch Room: la decisión persistida no tiene
// consensus ni confidenceDelta.

export interface DecisionConditionDraft {
  snapshotConditionId: string | null
  pendingItem: string // claim o dato pendiente
  question: string | null // pregunta al organizador (guardarla no envía nada)
  expectedAnswer: string | null
  effect: "chosen" | "discarded" | null // efecto sobre la decisión
  owner: string | null // responsable, si se conoce
  dueBy: string | null // plazo, si se conoce
}

export interface CampaignDraftInput {
  objective: string | null
  successDefinition: string | null
  modality: { kind: "sponsorship" | "workshop" | "co_hosted" | "booth" | "other"; detail: string | null } | null
  costItems: { label: string; amount: unknown }[] | null
  openQuestions: string[] | null
  commitments: {
    description: string
    kind: "estimate" | "goal" | "agreed"
    owner: string | null
    dueBy: string | null
    confirmation: { method: string; sourceIds: string[]; confirmedBy: string; confirmedAt: string } | null
  }[]
}

export interface DecisionSaveInput {
  idempotencyKey: string
  snapshotId: string
  editionId: string
  verdict: "chosen" | "discarded" | "pending"
  reasons: string[]
  conditions: DecisionConditionDraft[]
  campaignDraft: CampaignDraftInput | null // solo con verdict 'chosen'
}

export interface DecisionReviseInput {
  idempotencyKey?: string
  expectedRevision: number // revisión leída; obsoleta → conflicto, no sobrescritura
  verdict?: "chosen" | "discarded" | "pending"
  reasons?: string[]
  addConditions?: DecisionConditionDraft[]
  resolveConditions?: { conditionId: string; resolvedNote: string }[]
  campaignDraft?: CampaignDraftInput | null
}

// Lectura completa: última revisión, cadena conservada, campaña de la última
// revisión y los ids del snapshot/alternativa (contrato 07).
export interface DecisionRead {
  decision: import("../contracts/evaluation").EvaluationDecision
  revisions: import("../contracts/evaluation").EvaluationDecision[]
  campaign: import("../contracts/evaluation").CampaignDraftRecord | null
  decisionId: string
  snapshotId: string
  editionId: string
}

export type DecisionWriteOutcome =
  | { status: "saved"; read: DecisionRead; deduplicated: boolean }
  | { status: "conflict"; message: string; decisionId?: string; currentRevision?: number }
  | { status: "invalid"; message: string }
  | { status: "unauthorized"; message: string }
  | { status: "missing"; message: string }
  | { status: "unavailable"; message: string }

function isDecisionRead(data: unknown): data is DecisionRead {
  return (
    typeof data === "object" &&
    data !== null &&
    "decision" in data &&
    "revisions" in data &&
    "campaign" in data &&
    typeof (data as { decisionId?: unknown }).decisionId === "string"
  )
}

async function decisionWriteOutcome(response: Response): Promise<DecisionWriteOutcome> {
  const data: unknown = await response.json().catch(() => null)
  const record = typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {}
  const message = typeof record.message === "string" ? record.message : `HTTP ${response.status}`
  if ((response.status === 200 || response.status === 201) && isDecisionRead(data)) {
    return { status: "saved", read: data, deduplicated: record.deduplicated === true }
  }
  if (response.status === 401) return { status: "unauthorized", message }
  if (response.status === 404) return { status: "missing", message }
  if (response.status === 409)
    return {
      status: "conflict",
      message,
      ...(typeof record.decisionId === "string" ? { decisionId: record.decisionId } : {}),
      ...(typeof record.currentRevision === "number" ? { currentRevision: record.currentRevision } : {}),
    }
  if (response.status === 400) return { status: "invalid", message }
  return { status: "unavailable", message }
}

// Guarda la primera decisión (y su borrador si es elección) en una transacción
// del servidor. Nunca lanza.
export async function saveConditionalDecision(input: DecisionSaveInput): Promise<DecisionWriteOutcome> {
  try {
    const response = await fetch("/api/decisions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      cache: "no-store",
    })
    return await decisionWriteOutcome(response)
  } catch {
    return { status: "unavailable", message: "No se pudo contactar /api/decisions." }
  }
}

// Agrega una revisión con revisión esperada. Nunca lanza.
export async function reviseConditionalDecision(
  decisionId: string,
  input: DecisionReviseInput,
): Promise<DecisionWriteOutcome> {
  try {
    const response = await fetch(`/api/decisions/${encodeURIComponent(decisionId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      cache: "no-store",
    })
    return await decisionWriteOutcome(response)
  } catch {
    return { status: "unavailable", message: "No se pudo contactar /api/decisions." }
  }
}

export type DecisionFetchOutcome =
  | { status: "ok"; read: DecisionRead }
  | { status: "unauthorized" }
  | { status: "missing" }
  | { status: "unavailable" }

// Lectura persistida de una decisión por su identidad. Nunca lanza.
export async function fetchDecisionRead(decisionId: string): Promise<DecisionFetchOutcome> {
  try {
    const response = await fetch(`/api/decisions/${encodeURIComponent(decisionId)}`, { cache: "no-store" })
    if (response.status === 401) return { status: "unauthorized" }
    if (response.status === 404) return { status: "missing" }
    if (!response.ok) return { status: "unavailable" }
    const data: unknown = await response.json()
    return isDecisionRead(data) ? { status: "ok", read: data } : { status: "unavailable" }
  } catch {
    return { status: "unavailable" }
  }
}

export type SnapshotDecisionsOutcome =
  | { status: "ok"; decisions: DecisionRead[] }
  | { status: "unauthorized" }
  | { status: "unavailable" }

// Decisiones registradas contra un snapshot (una por alternativa decidida):
// permite recuperar el estado del panel al reabrir el run. Nunca lanza.
export async function fetchSnapshotDecisions(snapshotId: string): Promise<SnapshotDecisionsOutcome> {
  try {
    const response = await fetch(`/api/decisions?snapshotId=${encodeURIComponent(snapshotId)}`, { cache: "no-store" })
    if (response.status === 401) return { status: "unauthorized" }
    if (!response.ok) return { status: "unavailable" }
    const data: unknown = await response.json()
    if (typeof data === "object" && data !== null && Array.isArray((data as { decisions?: unknown }).decisions)) {
      return { status: "ok", decisions: (data as { decisions: unknown[] }).decisions.filter(isDecisionRead) }
    }
    return { status: "unavailable" }
  } catch {
    return { status: "unavailable" }
  }
}

// Ticket 10: el dashboard no utiliza fallback ni el pipeline mundial.
// Ticket 14: la lista de evaluaciones guardadas viaja en la misma lectura y
// admite un filtro EXPLÍCITO por identidad de perfil (?profileId=); nunca una
// búsqueda por texto de producto.
export function fetchResearchHome(filter: { profileId?: string | null } = {}) {
  const query = filter.profileId ? `?profileId=${encodeURIComponent(filter.profileId)}` : ""
  return fetchCatalogJson<import("../../components/research-dashboard/research-types").ResearchHome>(`/api/evaluations${query}`, "runs")
}
export async function saveResearchOrganizer(runId: string, organizerId: string): Promise<CatalogFetchOutcome<import("../../components/research-dashboard/research-types").SavedOrganizerResearch>> {
  try {
    const response = await fetch(`/api/evaluations/${encodeURIComponent(runId)}/organizers/${encodeURIComponent(organizerId)}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: "{}",
    })
    if (response.status === 401) return { status: "unauthorized" }
    if (response.status === 404) return { status: "missing" }
    if (!response.ok) return { status: "unavailable" }
    return { status: "ok", data: await response.json() }
  } catch { return { status: "unavailable" } }
}
