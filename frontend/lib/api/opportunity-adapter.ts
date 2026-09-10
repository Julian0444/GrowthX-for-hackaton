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
  CampaignView,
  ClaimRevision,
  ClaimStatus,
  CompanyRecord,
  DeclaredDate,
  DossierClaimView,
  DossierView,
  EvaluationReadBundle,
  EvaluationReadProjection,
  EventEditionRevision,
  GeoScope,
  LocalMapView,
  OrganizerListItem,
  ParticipationRole,
  ProjectedField,
  ProjectedScore,
  SourceRecord,
} from "@/lib/contracts/evaluation"
import type {
  ComparisonAvailableCatalog,
  ComparisonFeatureValue,
  ComparisonNarrativeProposal,
  ComparisonRunResult,
  ComparisonV0ShadowEntry,
  CurationInfo,
  EditionDossierRead,
  EditionValidityView,
  OrganizerDossierRead,
  RevisionedClaimRead,
  RevisionedParticipationRead,
} from "./atlas-client"
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
// Relativo (no alias `@/`) para que los tests de node --test lo resuelvan sin
// gancho de alias.
import { classifyEventValidity, type EventValidity } from "../temporal/event-validity.ts"
import { evidenceLink, isSyntheticSource, sameEvidenceUrl, type EvidenceLink } from "../evidence/source-link.ts"

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
  generatedAt: string,
): EventOpportunity[] {
  if (!opp.event) return []
  // Regla temporal (ticket 04): solo un evento con inicio verificable y futuro
  // en el instante de evaluación (ahora: el momento de proyectar; una
  // oportunidad puede caducar entre el snapshot y la vista) se presenta como
  // «próximo evento». Vencido, sin fecha o con zona ambigua: no se proyecta
  // como vigente y la fecha JAMÁS se reemplaza por new Date(); el contrato
  // crudo conserva startsAt tal cual (null = pendiente) como antecedente.
  const startsAt = opp.event.startsAt
  const validity = classifyEventValidity(startsAt, new Date().toISOString())
  if (startsAt == null || validity.validity !== "upcoming") return []
  const sourceEvidence =
    Object.values(evidence).find(
      (item) => item.source === "luma" && opp.reasons.some((reason) => reason.evidenceIds.includes(item.id)),
    ) ?? null
  return [
    {
      id: opp.event.id,
      name: opp.event.name,
      url: opp.event.url,
      startsAt,
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
            // Instante del snapshot, no un new Date() fabricado al proyectar;
            // sin evidencia observada que la respalde, la referencia es
            // estimada.
            observedAt: generatedAt,
            isEstimated: true,
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
    subtitle: "AI found the audience. This is the recommended play.",
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
  generatedAt: string,
): LegacyOpportunity {
  return {
    id: opp.id,
    // Proyección del orden oficial recibido (scorer + desempate determinístico,
    // ticket 06): el rank es la posición en el array y el adaptador no reordena
    // ni introduce una segunda decisión de ranking.
    rank: index + 1,
    // Ciudad pendiente (market.city null): la UI recibe la hipótesis de
    // exploración con etiqueta visible, nunca como ciudad factual a secas.
    city:
      opp.market?.city ??
      (opp.market?.explorationCity
        ? `${opp.market.explorationCity} (hypothesis)`
        : opp.subtitle.split(" · ")[0] || opp.event?.venueArea || opp.title),
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
    events: toEvents(opp, evidence, generatedAt),
    campaign: toCampaign(opp),
    distanceMiles: opp.distanceMiles,
    momentumSignals: opp.momentumSignals,
    // Estado de la redacción del modelo (ticket 05), sin transformar: el drawer
    // lo muestra junto a las razones.
    narrative: opp.narrative,
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
    opportunities: res.opportunities.map((opp, index) =>
      toLegacyOpportunity(opp, index, res.evidence, res.generatedAt),
    ),
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

// ============ Proyección del recorrido persistido (ticket 07) ============
//
// Proyecta un EvaluationReadBundle (contrato lib/contracts/evaluation.ts) a la
// lectura que consumen dashboard, lista de organizadores, dossier, campaña y
// mapa local secundario. A diferencia de la forma legacy de este archivo (city,
// startsAt y score obligatorios), acá «pendiente» y «ambiguo» llegan a la
// pantalla como estados: nunca se sustituyen por 0, la fecha actual o una
// ciudad. No comprueba integridad relacional (tickets 08/09): una referencia
// irresoluble se proyecta como pendiente honesto.

function knownField(
  display: string,
  opts: {
    claimStatus?: ClaimStatus | null
    scope?: GeoScope | null
    obtainedAt?: string | null
    sourceIds?: string[]
    pendingNote?: string | null
  } = {},
): ProjectedField {
  return {
    state: "known",
    display,
    claimStatus: opts.claimStatus ?? null,
    scope: opts.scope ?? null,
    obtainedAt: opts.obtainedAt ?? null,
    sourceIds: opts.sourceIds ?? [],
    pendingNote: opts.pendingNote ?? null,
  }
}

function pendingField(note: string | null): ProjectedField {
  return { state: "pending", note }
}

function ambiguousField(display: string, note: string, sourceIds: string[] = []): ProjectedField {
  return { state: "ambiguous", display, note, sourceIds }
}

// Primera fecha de obtención resoluble entre las fuentes citadas; null si
// ninguna resuelve (la existencia de la referencia no se exige acá).
function obtainedAtFrom(sourceIds: string[], sourcesById: Map<string, SourceRecord>): string | null {
  for (const id of sourceIds) {
    const source = sourcesById.get(id)
    if (source) return source.fetchedAt
  }
  return null
}

function projectDeclaredDate(date: DeclaredDate, sourceIds: string[], obtainedAt: string | null): ProjectedField {
  switch (date.precision) {
    case "instant":
      return knownField(`${date.iso} (${date.timezone})`, { sourceIds, obtainedAt })
    case "date_only":
      if (date.timezone === null) {
        return ambiguousField(
          date.date,
          "fecha sin zona horaria declarada: el día exacto depende del huso; no se inventa una zona",
          sourceIds,
        )
      }
      return knownField(`${date.date} (${date.timezone})`, { sourceIds, obtainedAt })
    case "ambiguous": {
      const range =
        date.earliest !== null && date.latest !== null ? ` (posible entre ${date.earliest} y ${date.latest})` : ""
      return ambiguousField(date.text, `fecha declarada de forma ambigua${range}`, sourceIds)
    }
    case "unknown":
      return pendingField("fecha pendiente de confirmación; no se sustituye por la fecha actual")
  }
}

function projectClaim(claim: ClaimRevision, sourcesById: Map<string, SourceRecord>): ProjectedField {
  const obtainedAt = obtainedAtFrom(claim.sourceIds, sourcesById)
  const base = {
    claimStatus: claim.status,
    obtainedAt,
    sourceIds: claim.sourceIds,
    // Qué falta confirmar viaja con el valor: una contradicción muestra su
    // motivo; un estado pendiente se declara.
    pendingNote:
      claim.status === "contradicted" ? claim.note
        : claim.status === "inferred" ? `inferencia (${claim.method ?? "método no documentado"})${claim.note ? ` · ${claim.note}` : ""}; pendiente de confirmar`
        : claim.status === "pending" ? "pendiente de confirmación" : null,
  }
  switch (claim.value.kind) {
    case "text":
      return knownField(claim.value.text, base)
    case "number":
      return knownField(`${claim.value.amount} ${claim.value.unit}`, base)
    case "money":
      return knownField(`${claim.value.currency} ${claim.value.amount}`, base)
    case "date": {
      const projected = projectDeclaredDate(claim.value.date, claim.sourceIds, obtainedAt)
      return projected.state === "known" ? { ...projected, claimStatus: claim.status, pendingNote: base.pendingNote } : projected
    }
    case "location":
      return knownField(claim.value.name ?? claim.value.scope, { ...base, scope: claim.value.scope })
    case "pending":
      return pendingField(claim.value.note ?? "valor pendiente; no se rellena con un default")
  }
}

function projectScore(
  scoring: EvaluationReadBundle["snapshot"]["alternatives"][number]["scoring"],
  policy: EvaluationReadBundle["snapshot"]["policy"],
): ProjectedScore {
  if (policy.status !== "applied") {
    // Sin política aprobada no hay score: es un estado visible, jamás un 0.
    return { state: "no_policy", note: policy.note }
  }
  if (scoring.status === "scored") {
    return {
      state: "scored",
      sKnown: scoring.sKnown,
      coverage: scoring.coverage,
      sensitivityNote: scoring.sensitivityNote,
      policyId: policy.policyId,
      policyVersion: policy.policyVersion,
    }
  }
  return { state: "not_scored", reason: scoring.note ?? scoring.reason }
}

function projectEditionLocation(edition: EventEditionRevision): ProjectedField {
  const { scope, name } = edition.location
  if (scope === "unknown" || name === null) {
    return pendingField("ubicación pendiente de confirmación; no se asume una ciudad")
  }
  return knownField(name, {
    scope,
    // Una localización nacional/regional no coloca el evento en una ciudad: el
    // valor conocido es el país/la región y la ciudad queda pendiente.
    pendingNote:
      scope === "country" || scope === "region" || scope === "global"
        ? `ciudad pendiente: el soporte tiene alcance «${scope}»`
        : null,
  })
}

// Proyección del borrador de campaña persistido (tickets 07/13): partidas
// conocidas con su fuente/obtención, estimaciones marcadas, desconocidas
// pendientes (jamás 0) y compromisos con su soporte. Con partidas desconocidas
// no existe un total: ni acá ni en el contrato hay costo total o ROI.
function projectCampaignWithSources(
  campaign: NonNullable<EvaluationReadBundle["campaign"]>,
  sourcesById: Map<string, SourceRecord>,
): CampaignView {
  return {
    campaignId: campaign.id,
    decisionId: campaign.decisionId,
    objective: campaign.objective,
    successDefinition:
      campaign.successDefinition !== null
        ? knownField(campaign.successDefinition)
        : pendingField("definición de éxito pendiente; es texto del comprador, no se asume una"),
    modality:
      campaign.modality.status === "defined"
        ? knownField(
            campaign.modality.detail ? `${campaign.modality.kind}: ${campaign.modality.detail}` : campaign.modality.kind,
          )
        : pendingField("modalidad pendiente de acordar"),
    costItems: campaign.costItems.map((item) => ({
      label: item.evidence?.costComposition?.kind === "alternative"
        ? `${item.label} · opción ${item.evidence.costComposition.optionId} (${item.evidence.costComposition.groupId})`
        : item.label,
      value:
        item.amount.status === "quoted"
          ? knownField(`${item.amount.currency} ${item.amount.amount}`, {
              claimStatus: item.evidence?.status ?? null,
              sourceIds: item.amount.sourceIds,
              obtainedAt: obtainedAtFrom(item.amount.sourceIds, sourcesById),
            })
          : item.amount.status === "inferred" || item.amount.status === "contradicted"
            ? knownField(`${item.amount.currency} ${item.amount.amount}`, {
                claimStatus: item.amount.status,
                sourceIds: item.amount.sourceIds,
                obtainedAt: obtainedAtFrom(item.amount.sourceIds, sourcesById),
                pendingNote: `${item.amount.status === "inferred" ? "Inferido" : "Contradicho"} · base: ${item.amount.basis}${item.amount.note ? ` · ${item.amount.note}` : ""}; pendiente de resolver, no es cotización`,
              })
          : item.amount.status === "estimated"
            ? knownField(`${item.amount.currency} ${item.amount.amount}`, {
                pendingNote: `estimación (${item.amount.basis}); no es un costo confirmado`,
              })
            : pendingField(item.amount.note ?? "partida sin costo conocido; no se suma como 0"),
    })),
    costCompleteness: campaign.costItems.length === 0 || campaign.costItems.some((item) => item.amount.status !== "quoted")
      ? "has_unknown_items"
      : "all_items_valued",
    openQuestions: campaign.openQuestions,
    commitments: campaign.commitments.map((c) => ({
      description: c.description,
      kind: c.kind,
      supported: c.kind === "agreed" && c.confirmation !== null && c.confirmation.sourceIds.length > 0,
    })),
  }
}

// Export para la lectura de /api/decisions (ticket 13): el panel proyecta el
// borrador persistido con las fuentes que tenga a mano (las del snapshot).
export function projectCampaignDraft(
  campaign: NonNullable<EvaluationReadBundle["campaign"]>,
  sources: SourceRecord[],
): CampaignView {
  return projectCampaignWithSources(campaign, new Map(sources.map((source) => [source.id, source])))
}

export function projectEvaluationRead(bundle: EvaluationReadBundle): EvaluationReadProjection {
  const { snapshot, profile } = bundle
  const sourcesById = new Map(bundle.sources.map((s) => [s.id, s]))
  // Solo el material fijado por el snapshot alimenta la lectura.
  const snapshotClaims = bundle.claims.filter((c) => snapshot.claimRevisionIds.includes(c.id))
  const editionFor = (editionId: string): EventEditionRevision | null =>
    bundle.editions.find((e) => snapshot.editionRevisionIds.includes(e.id) && e.editionId === editionId) ??
    bundle.editions.find((e) => e.editionId === editionId) ??
    null

  const dossiers: DossierView[] = snapshot.ordering.editionIds.map((editionId) => {
    const alternative = snapshot.alternatives.find((a) => a.editionId === editionId)
    const edition = editionFor(editionId)
    const editionClaims = snapshotClaims.filter(
      (c) => c.subject.type === "edition" && c.subject.editionId === editionId,
    )
    const fieldClaim = (attribute: string): ProjectedField => {
      const claim = editionClaims.find((c) => c.attribute === attribute)
      return claim ? projectClaim(claim, sourcesById) : pendingField(`sin dato de ${attribute}`)
    }
    const costs = editionClaims
      .filter((c) => c.attribute.startsWith("cost:"))
      .map((c) => ({ label: c.attribute.slice("cost:".length), value: projectClaim(c, sourcesById) }))
    const otherClaims: DossierClaimView[] = editionClaims
      .filter((c) => c.attribute !== "access" && c.attribute !== "audience" && !c.attribute.startsWith("cost:"))
      .map((c) => ({ attribute: c.attribute, value: projectClaim(c, sourcesById) }))
    const organizerRevision =
      alternative?.organizerId != null
        ? (bundle.organizers.find(
            (o) => snapshot.organizerRevisionIds.includes(o.id) && o.organizerId === alternative.organizerId,
          ) ??
          bundle.organizers.find((o) => o.organizerId === alternative.organizerId) ??
          null)
        : null
    return {
      editionId,
      name: edition?.name ?? editionId,
      organizer:
        alternative?.organizerId == null
          ? pendingField("organizador pendiente de identificar")
          : organizerRevision
            ? knownField(organizerRevision.displayName, { obtainedAt: organizerRevision.revisedAt })
            : pendingField("revisión de organizador no incluida en la lectura"),
      date: edition
        ? projectDeclaredDate(edition.startDate, [], null)
        : pendingField("revisión de edición no incluida en la lectura"),
      location: edition ? projectEditionLocation(edition) : pendingField("revisión de edición no incluida en la lectura"),
      access: fieldClaim("access"),
      audience: fieldClaim("audience"),
      costs,
      otherClaims,
      eligibility: alternative?.eligibility ?? { status: "conditional", note: "alternativa no incluida en el snapshot" },
      conditions: alternative?.conditions ?? [],
      score: alternative
        ? projectScore(alternative.scoring, snapshot.policy)
        : { state: "not_scored", reason: "alternativa no incluida en el snapshot" },
    }
  })

  const map: LocalMapView = { points: [], listedWithoutPoint: [] }
  for (const dossier of dossiers) {
    const edition = editionFor(dossier.editionId)
    if (!edition) {
      map.listedWithoutPoint.push({
        editionId: dossier.editionId,
        name: dossier.name,
        reason: "revisión de edición no incluida en la lectura",
      })
      continue
    }
    const urbanScope = edition.location.scope === "venue" || edition.location.scope === "city"
    if (edition.coordinates !== null && urbanScope && edition.location.name !== null) {
      map.points.push({
        editionId: dossier.editionId,
        name: dossier.name,
        lat: edition.coordinates.lat,
        lng: edition.coordinates.lng,
        locationName: edition.location.name,
      })
    } else {
      map.listedWithoutPoint.push({
        editionId: dossier.editionId,
        name: dossier.name,
        reason: urbanScope
          ? "sin coordenadas respaldadas"
          : `ubicación con alcance «${edition.location.scope}»: sin respaldo urbano no hay punto en el mapa`,
      })
    }
  }

  const organizerList: OrganizerListItem[] = bundle.organizers
    .filter((o) => snapshot.organizerRevisionIds.includes(o.id))
    .map((o) => ({
      organizerId: o.organizerId,
      displayName: o.displayName,
      confirmedAliases: o.aliases.filter((a) => a.confirmation === "confirmed").map((a) => a.alias),
      proposedAliases: o.aliases.filter((a) => a.confirmation === "proposed").map((a) => a.alias),
      editionIds: bundle.editions.filter((e) => e.organizerIds.includes(o.organizerId)).map((e) => e.editionId),
    }))

  const openConditions = bundle.decision?.conditions.filter((c) => c.status === "open").length ?? 0

  const campaign: CampaignView | null = bundle.campaign
    ? projectCampaignWithSources(bundle.campaign, sourcesById)
    : null

  return {
    contractVersion: "1",
    snapshotId: snapshot.id,
    kind: snapshot.kind,
    evaluatedAt: snapshot.evaluatedAt,
    ordering: snapshot.ordering,
    summary: {
      outcome: snapshot.outcome,
      policy: snapshot.policy,
      decision: bundle.decision
        ? {
            verdict: bundle.decision.verdict,
            // Una elección con condiciones abiertas sigue siendo condicional.
            conditional: bundle.decision.verdict === "chosen" && openConditions > 0,
            openConditions,
          }
        : null,
    },
    profile: {
      product: profile.product,
      audience: profile.audience.description,
      budget:
        profile.budget.status === "declared"
          ? knownField(`${profile.budget.currency} ${profile.budget.amount}`)
          : pendingField(profile.budget.note ?? "presupuesto no declarado; no se asume 0"),
      window:
        profile.window.from === null && profile.window.to === null
          ? pendingField("ventana de fechas no declarada")
          : knownField(`${profile.window.from ?? "…"} → ${profile.window.to ?? "…"}`, {
              pendingNote:
                profile.window.from === null || profile.window.to === null ? "un extremo de la ventana está pendiente" : null,
            }),
      objective: { kind: profile.objective.kind, confirmation: profile.objective.confirmation },
      successDefinition:
        profile.objective.successDefinition.status === "defined"
          ? knownField(profile.objective.successDefinition.text)
          : pendingField("definición de éxito pendiente del comprador; no se asume un objetivo por defecto"),
      comparableCompanies: profile.comparableCompanies.map((c) => ({
        name: c.name,
        relation: c.relation,
        confirmation: c.confirmation,
      })),
    },
    organizerList,
    dossiers,
    campaign,
    map,
  }
}

// ============ Proyección de la comparación persistida (ticket 12) ============
//
// Proyecta el resultado publicado de un run de comparación (snapshot oficial +
// companions + registro de redacción) al modelo de vista del panel. Todo sale
// del snapshot persistido: la redacción del modelo llega como registro aparte
// y no altera estado, orden ni scores. La cobertura Q y el consenso NUNCA se
// presentan como confidence ni como probabilidad de éxito.

export type ComparisonStateLabel = "Descartado por restricción" | "Condicionado" | "Elegible"

export interface ComparisonCandidateView {
  editionId: string
  name: string
  stateLabel: ComparisonStateLabel
  // DossierView del contrato 07: elegibilidad, condiciones (cada una con qué
  // respuesta la resolvería), campos con fuentes y score honesto.
  dossier: DossierView
  features: ComparisonFeatureValue[]
  narrativeProposal: ComparisonNarrativeProposal | null
  v0Shadow: ComparisonV0ShadowEntry | null
  // Fuentes citadas por los claims fijados de ESTE candidato.
  sources: SourceRecord[]
  // Ticket 14: identidad del organizador (para abrir su expediente desde el
  // panel) y las revisiones EXACTAS que el snapshot fijó para este candidato —
  // la evidencia y los motivos se leen con su fecha/revisión original.
  organizerId: string | null
  fixedRevisions: {
    editionRevisionId: string | null
    editionRevisedAt: string | null
    organizerRevisionId: string | null
    organizerRevisedAt: string | null
    claimRevisionIds: string[]
  }
  // Ticket 14: aviso de vigencia ACTUAL. Si el inicio declarado ya pasó
  // respecto del instante de lectura y no había vencido al evaluar, se avisa
  // sin alterar el resultado histórico (estado, condiciones y score quedan
  // como los confirmó el snapshot; corregirlo es OTRO run).
  currentValidity: { readAt: string; validity: EventValidity; notice: string } | null
}

export interface ComparisonViewModel {
  snapshotId: string
  evaluatedAt: string
  // Instante de lectura usado para el aviso de vigencia actual.
  readAt: string
  projection: EvaluationReadProjection
  isRanked: boolean
  orderingLabel: string
  candidates: ComparisonCandidateView[] // en el orden oficial del snapshot
  availableCatalog: ComparisonAvailableCatalog
  narrative: {
    status: "validated" | "rejected" | "deterministic_only"
    motive: string | null
    model: string
    promptVersion: string
    durationMs: number
  } | null
  v0ShadowNote: string
  warnings: string[]
  eligibleIsNotRecommended: string
}

const COMPARISON_STATE_LABEL: Record<string, ComparisonStateLabel> = {
  excluded: "Descartado por restricción",
  conditional: "Condicionado",
  eligible: "Elegible",
}

// Texto verificable del inicio declarado para la política temporal (ticket
// 04): instante o día; una fecha ambigua/pendiente no produce ningún aviso.
function declaredStartText(date: DeclaredDate): string | null {
  if (date.precision === "instant") return date.iso
  if (date.precision === "date_only") return date.date
  return null
}

function currentValidityFor(
  edition: EventEditionRevision | null,
  evaluatedAt: string,
  readAt: string,
): ComparisonCandidateView["currentValidity"] {
  if (!edition) return null
  const start = declaredStartText(edition.startDate)
  if (start === null) return null
  const now = classifyEventValidity(start, readAt)
  if (now.validity !== "past") return null
  const then = classifyEventValidity(start, evaluatedAt)
  if (then.validity === "past") return null // ya estaba vencida al evaluar: lo dice el snapshot
  return {
    readAt,
    validity: now.validity,
    notice: `Vigencia actual: el inicio declarado (${start}) ya pasó respecto de la lectura del ${readAt}. El resultado histórico (evaluado al ${evaluatedAt}) no se altera; una reevaluación crea otro run con otro snapshot.`,
  }
}

export function projectComparisonResult(
  result: ComparisonRunResult,
  options: { readAt?: string } = {},
): ComparisonViewModel {
  const { bundle } = result
  const readAt = options.readAt ?? new Date().toISOString()
  const projection = projectEvaluationRead(bundle)
  const sourcesById = new Map(bundle.sources.map((source) => [source.id, source]))
  const proposals = new Map(
    (result.narrative?.status === "validated" ? result.narrative.proposals : []).map((proposal) => [
      proposal.editionId,
      proposal,
    ]),
  )
  const shadowByEdition = new Map(result.v0Shadow.entries.map((entry) => [entry.editionId, entry]))

  const candidates: ComparisonCandidateView[] = projection.dossiers.map((dossier) => {
    const alternative = bundle.snapshot.alternatives.find((a) => a.editionId === dossier.editionId)
    const organizerId = alternative?.organizerId ?? null
    const ownClaims = bundle.claims.filter(
      (claim) =>
        (claim.subject.type === "edition" && claim.subject.editionId === dossier.editionId) ||
        (organizerId !== null && claim.subject.type === "organizer" && claim.subject.organizerId === organizerId),
    )
    const sources = [...new Set(ownClaims.flatMap((claim) => claim.sourceIds))]
      .map((id) => sourcesById.get(id))
      .filter((source): source is SourceRecord => source !== undefined)
    // Revisiones fijadas por el snapshot (no «la última»): son las que la
    // evaluación usó y las que se releen al reabrir.
    const fixedEdition =
      bundle.editions.find(
        (edition) => bundle.snapshot.editionRevisionIds.includes(edition.id) && edition.editionId === dossier.editionId,
      ) ?? null
    const fixedOrganizer =
      organizerId !== null
        ? (bundle.organizers.find(
            (organizer) =>
              bundle.snapshot.organizerRevisionIds.includes(organizer.id) && organizer.organizerId === organizerId,
          ) ?? null)
        : null
    return {
      editionId: dossier.editionId,
      name: dossier.name,
      stateLabel: COMPARISON_STATE_LABEL[dossier.eligibility.status] ?? "Condicionado",
      dossier,
      features: result.featuresByEdition[dossier.editionId] ?? [],
      narrativeProposal: proposals.get(dossier.editionId) ?? null,
      v0Shadow: shadowByEdition.get(dossier.editionId) ?? null,
      sources,
      organizerId,
      fixedRevisions: {
        editionRevisionId: fixedEdition?.id ?? null,
        editionRevisedAt: fixedEdition?.revisedAt ?? null,
        organizerRevisionId: fixedOrganizer?.id ?? null,
        organizerRevisedAt: fixedOrganizer?.revisedAt ?? null,
        claimRevisionIds: ownClaims
          .filter((claim) => bundle.snapshot.claimRevisionIds.includes(claim.id))
          .map((claim) => claim.id),
      },
      currentValidity: currentValidityFor(fixedEdition, result.evaluatedAt, readAt),
    }
  })

  const ordering = bundle.snapshot.ordering
  return {
    snapshotId: result.snapshotId,
    evaluatedAt: result.evaluatedAt,
    readAt,
    projection,
    isRanked: ordering.kind === "ranked",
    orderingLabel:
      ordering.kind === "ranked"
        ? `Ranking del scorer determinístico (política ${ordering.policyId} · ${ordering.policyVersion}); los excluidos no compiten.`
        : ordering.note,
    candidates,
    availableCatalog: result.availableCatalog,
    narrative: result.narrative
      ? {
          status: result.narrative.status,
          motive: result.narrative.motive,
          model: result.narrative.model,
          promptVersion: result.narrative.promptVersion,
          durationMs: result.narrative.durationMs,
        }
      : null,
    v0ShadowNote: result.v0Shadow.note,
    warnings: result.warnings,
    eligibleIsNotRecommended: result.eligibleIsNotRecommended,
  }
}

// ============ Proyección del dossier curado (ticket 09) ============
//
// Proyecta las lecturas persistidas de /api/catalog/editions/:id y
// /api/organizers/:id (formas espejo en ./atlas-client) a los modelos de vista
// del panel. Mismas reglas honestas que projectEvaluationRead: pendiente y
// ambiguo llegan como estados (jamás 0, hoy o una ciudad inventada), cada valor
// material conserva fuente/estado/método/alcance, y los faltantes producen
// preguntas concretas. No comprueba integridad relacional: una fuente citada
// que no llegó en la lectura queda listada como irresoluble, nunca inventada.

// Vista de un valor material del dossier: el valor proyectado más su soporte
// completo (fuentes abribles, método, revisor) y la cadena de revisiones — una
// contradicción muestra AMBAS revisiones con sus fuentes; nada se borra.
export interface DossierValueView {
  attribute: string
  label: string
  field: ProjectedField
  method: string | null
  reviewer: string | null
  reviewedAt: string | null
  sources: SourceRecord[]
  unresolvedSourceIds: string[]
  history: DossierRevisionView[]
  conflict: boolean
  pendingQuestion: string | null
}

export interface DossierRevisionView {
  revisionId: string
  status: ClaimStatus
  display: string
  note: string | null
  reviewedAt: string
  reviewer: string | null
  sourceIds: string[]
}

// Tres niveles NO intercambiables por participación: anuncio, ejecución
// reportada y resultado comercial (desconocido ≠ fracaso).
export interface DossierParticipationView {
  participationId: string
  company: { companyId: string; name: string | null; websiteUrl: string | null }
  editionId: string
  editionName: string | null
  role: ParticipationRole
  roleStatus: ClaimStatus
  sources: SourceRecord[]
  announced: string | null
  reportedExecution: string | null
  outcome:
    | { state: "reported"; summary: string; sources: SourceRecord[] }
    | { state: "unknown"; note: string }
  revisionCount: number
}

export interface EditionDossierViewModel {
  editionId: string
  name: string
  canonicalUrl: string | null
  listingLink: EvidenceLink
  validity: EditionValidityView
  curation: CurationInfo | null
  materialNote: string | null
  date: DossierValueView
  location: DossierValueView
  access: DossierValueView
  audience: DossierValueView
  costs: DossierValueView[]
  otherClaims: DossierValueView[]
  organizers: {
    organizerId: string
    displayName: string
    confirmedAliases: string[]
    proposedAliases: string[]
  }[]
  organizerPending: string | null
  participations: DossierParticipationView[]
  mapPoint: { lat: number; lng: number; locationName: string } | null
  withoutPointReason: string | null
  editionRevisionCount: number
  openQuestions: string[]
}

export interface OrganizerEditionView {
  editionId: string
  name: string
  validity: EditionValidityView
  date: ProjectedField
  location: ProjectedField
  isAntecedent: boolean
}

export interface OrganizerDossierViewModel {
  organizerId: string
  displayName: string
  confirmedAliases: { alias: string; sources: SourceRecord[] }[]
  proposedAliases: string[]
  claims: DossierValueView[]
  upcomingEditions: OrganizerEditionView[]
  antecedents: OrganizerEditionView[]
  undatedEditions: OrganizerEditionView[]
  participations: DossierParticipationView[]
  coverage: { antecedentsDocumented: number; note: string | null }
  revisionCount: number
}

const UNKNOWN_OUTCOME_NOTE =
  "Commercial result not published — absence of data is not evidence of failure."

function attributeLabel(attribute: string): string {
  if (attribute === "date") return "Date"
  if (attribute === "location") return "Location"
  if (attribute === "access") return "Access"
  if (attribute === "audience") return "Audience"
  if (attribute === "focus") return "Focus"
  if (attribute.startsWith("cost:")) return `Cost — ${attribute.slice("cost:".length)}`
  return attribute.charAt(0).toUpperCase() + attribute.slice(1)
}

// Los faltantes producen preguntas CONCRETAS, no un guion vacío.
function pendingQuestionFor(attribute: string): string {
  if (attribute === "access") return "Is registration open or invite-only? Ask the organizer to confirm access."
  if (attribute === "audience") return "What audience size and profile can the organizer evidence for this edition?"
  if (attribute === "cost" || attribute.startsWith("cost:"))
    return "Which sponsorship items does the organizer offer, and at what price?"
  if (attribute === "date") return "What is the confirmed start date (with timezone) for this edition?"
  if (attribute === "location" || attribute === "city")
    return "Which venue or city hosts this edition? Country-level support does not place it in a city."
  if (attribute === "organizer") return "Who organizes this edition? The organizer is still unidentified."
  return `What confirms “${attribute}” for this edition?`
}

const CONFLICT_QUESTION =
  "Which source is right? Ask the organizer to reconcile the conflicting figures before deciding."

function fieldDisplay(field: ProjectedField): string {
  if (field.state === "pending") return field.note ?? "pending"
  return field.display
}

function resolveSources(sourceIds: string[], sourcesById: Map<string, SourceRecord>): SourceRecord[] {
  return sourceIds.flatMap((id) => {
    const source = sourcesById.get(id)
    return source ? [source] : []
  })
}

function claimHistory(revisions: ClaimRevision[], sourcesById: Map<string, SourceRecord>): DossierRevisionView[] {
  return revisions.map((revision) => ({
    revisionId: revision.id,
    status: revision.status,
    display: fieldDisplay(projectClaim(revision, sourcesById)),
    note: revision.note,
    reviewedAt: revision.reviewedAt,
    reviewer: revision.reviewer,
    sourceIds: revision.sourceIds,
  }))
}

function claimValueView(
  claim: RevisionedClaimRead,
  sourcesById: Map<string, SourceRecord>,
): DossierValueView {
  const latest = claim.revisions[claim.revisions.length - 1]
  const field = projectClaim(latest, sourcesById)
  const isPending = latest.status === "pending" || latest.value.kind === "pending"
  const conflict = latest.status === "contradicted"
  return {
    attribute: latest.attribute,
    label: attributeLabel(latest.attribute),
    field,
    method: latest.method,
    reviewer: latest.reviewer,
    reviewedAt: latest.reviewedAt,
    sources: resolveSources(latest.sourceIds, sourcesById),
    unresolvedSourceIds: latest.sourceIds.filter((id) => !sourcesById.has(id)),
    history: claimHistory(claim.revisions, sourcesById),
    conflict,
    pendingQuestion: conflict ? CONFLICT_QUESTION : isPending ? pendingQuestionFor(latest.attribute) : null,
  }
}

function pendingValueView(attribute: string, note: string): DossierValueView {
  return {
    attribute,
    label: attributeLabel(attribute),
    field: pendingField(note),
    method: null,
    reviewer: null,
    reviewedAt: null,
    sources: [],
    unresolvedSourceIds: [],
    history: [],
    conflict: false,
    pendingQuestion: pendingQuestionFor(attribute),
  }
}

function participationView(
  participation: RevisionedParticipationRead,
  companies: CompanyRecord[],
  editionNames: Map<string, string>,
  sourcesById: Map<string, SourceRecord>,
): DossierParticipationView {
  const latest = participation.revisions[participation.revisions.length - 1]
  const company = companies.find((candidate) => candidate.id === latest.companyId) ?? null
  return {
    participationId: participation.participationId,
    company: {
      companyId: latest.companyId,
      name: company?.name ?? null,
      websiteUrl: company?.websiteUrl ?? null,
    },
    editionId: latest.editionId,
    editionName: editionNames.get(latest.editionId) ?? null,
    role: latest.role,
    roleStatus: latest.roleStatus,
    sources: resolveSources(latest.sourceIds, sourcesById),
    announced: latest.announcedDetail,
    reportedExecution: latest.reportedExecution,
    outcome:
      latest.commercialOutcome.status === "reported"
        ? {
            state: "reported",
            summary: latest.commercialOutcome.summary,
            sources: resolveSources(latest.commercialOutcome.sourceIds, sourcesById),
          }
        : { state: "unknown", note: UNKNOWN_OUTCOME_NOTE },
    revisionCount: participation.revisions.length,
  }
}

function latestClaimByAttribute(
  claims: RevisionedClaimRead[],
  attribute: string,
): RevisionedClaimRead | null {
  return (
    claims.find((claim) => claim.revisions[claim.revisions.length - 1].attribute === attribute) ?? null
  )
}

export function projectEditionDossierView(read: EditionDossierRead): EditionDossierViewModel {
  const sourcesById = new Map(read.sources.map((source) => [source.id, source]))
  const latestEdition = read.editionRevisions[read.editionRevisions.length - 1]
  const editionClaims = read.claims.filter((claim) => {
    const subject = claim.revisions[claim.revisions.length - 1].subject
    return subject.type === "edition" && subject.editionId === read.editionId
  })

  // Fecha y lugar: si hay un claim con fuente se muestra ese soporte; si no,
  // el valor de la revisión de edición con la curación como respaldo declarado.
  const dateClaim = latestClaimByAttribute(editionClaims, "date")
  const date: DossierValueView = dateClaim
    ? claimValueView(dateClaim, sourcesById)
    : {
        attribute: "date",
        label: "Date",
        field: projectDeclaredDate(latestEdition.startDate, [], null),
        method: "manual_curation",
        reviewer: read.curation?.authorizedBy ?? null,
        reviewedAt: read.curation?.verifiedAt ?? null,
        sources: [],
        unresolvedSourceIds: [],
        history: [],
        conflict: false,
        pendingQuestion:
          latestEdition.startDate.precision === "instant" || latestEdition.startDate.precision === "date_only"
            ? null
            : pendingQuestionFor("date"),
      }
  const locationClaim = latestClaimByAttribute(editionClaims, "location")
  const locationField = projectEditionLocation(latestEdition)
  const location: DossierValueView = locationClaim
    ? claimValueView(locationClaim, sourcesById)
    : {
        attribute: "location",
        label: "Location",
        field: locationField,
        method: "manual_curation",
        reviewer: read.curation?.authorizedBy ?? null,
        reviewedAt: read.curation?.verifiedAt ?? null,
        sources: [],
        unresolvedSourceIds: [],
        history: [],
        conflict: false,
        pendingQuestion:
          locationField.state === "known" && locationField.pendingNote === null
            ? null
            : pendingQuestionFor("location"),
      }

  const accessClaim = latestClaimByAttribute(editionClaims, "access")
  const access = accessClaim
    ? claimValueView(accessClaim, sourcesById)
    : pendingValueView("access", "sin dato de acceso; no se asume abierto ni cerrado")
  const audienceClaim = latestClaimByAttribute(editionClaims, "audience")
  const audience = audienceClaim
    ? claimValueView(audienceClaim, sourcesById)
    : pendingValueView("audience", "sin dato de audiencia; no se estima uno")

  const costClaims = editionClaims.filter((claim) =>
    claim.revisions[claim.revisions.length - 1].attribute.startsWith("cost:"),
  )
  const costs =
    costClaims.length > 0
      ? costClaims.map((claim) => claimValueView(claim, sourcesById))
      : [pendingValueView("cost", "sin partidas de costo conocidas; no se suman como 0")]

  const coveredAttributes = new Set(["date", "location", "access", "audience"])
  const otherClaims = editionClaims
    .filter((claim) => {
      const attribute = claim.revisions[claim.revisions.length - 1].attribute
      return !coveredAttributes.has(attribute) && !attribute.startsWith("cost:")
    })
    .map((claim) => claimValueView(claim, sourcesById))

  const organizers = read.organizers.map((organizer) => {
    const latest = organizer.revisions[organizer.revisions.length - 1]
    return {
      organizerId: organizer.organizerId,
      displayName: latest.displayName,
      confirmedAliases: latest.aliases
        .filter((alias) => alias.confirmation === "confirmed")
        .map((alias) => alias.alias),
      proposedAliases: latest.aliases
        .filter((alias) => alias.confirmation === "proposed")
        .map((alias) => alias.alias),
    }
  })

  const editionNames = new Map<string, string>([[read.editionId, latestEdition.name]])
  const participations = read.participations.map((participation) =>
    participationView(participation, read.companies, editionNames, sourcesById),
  )

  const urbanScope =
    latestEdition.location.scope === "venue" || latestEdition.location.scope === "city"
  const mapPoint =
    latestEdition.coordinates !== null && urbanScope && latestEdition.location.name !== null
      ? {
          lat: latestEdition.coordinates.lat,
          lng: latestEdition.coordinates.lng,
          locationName: latestEdition.location.name,
        }
      : null
  const withoutPointReason = mapPoint
    ? null
    : urbanScope
      ? "sin coordenadas respaldadas"
      : `ubicación con alcance «${latestEdition.location.scope}»: sin respaldo urbano no hay punto en el mapa`

  const openQuestions = [
    ...new Set(
      [date, location, access, audience, ...costs, ...otherClaims]
        .map((value) => value.pendingQuestion)
        .filter((question): question is string => question !== null),
    ),
  ]

  // Solo las fuentes de la revisión mostrada deciden si el listado es de
  // prueba: una importación real posterior no hereda la etiqueta del fixture.
  const listingSourceIds = new Set(read.claims.flatMap(chain => chain.revisions)
    .filter(claim => latestEdition.claimRevisionIds.includes(claim.id))
    .flatMap(claim => claim.sourceIds))
  return {
    editionId: read.editionId,
    name: latestEdition.name,
    canonicalUrl: latestEdition.canonicalUrl,
    listingLink: evidenceLink(latestEdition.canonicalUrl,
      read.curation?.material === "synthetic" || read.sources.some(source =>
        listingSourceIds.has(source.id) && sameEvidenceUrl(source.url, latestEdition.canonicalUrl) && isSyntheticSource(source))),
    validity: read.validity,
    curation: read.curation,
    materialNote:
      read.curation?.material === "synthetic"
        ? "Synthetic labeled material (open decision D4): it proves the mechanism, not real events."
        : read.curation?.material === "imported"
          ? "Automatically imported from a user-provided Luma URL: fields are the page's announcements, not curated review."
          : null,
    date,
    location,
    access,
    audience,
    costs,
    otherClaims,
    organizers,
    organizerPending: organizers.length === 0 ? pendingQuestionFor("organizer") : null,
    participations,
    mapPoint,
    withoutPointReason,
    editionRevisionCount: read.editionRevisions.length,
    openQuestions,
  }
}

export function projectOrganizerDossierView(read: OrganizerDossierRead): OrganizerDossierViewModel {
  const sourcesById = new Map(read.sources.map((source) => [source.id, source]))
  const latest = read.organizerRevisions[read.organizerRevisions.length - 1]

  const editionViews: OrganizerEditionView[] = read.editions.map(({ edition, validity }) => ({
    editionId: edition.editionId,
    name: edition.name,
    validity,
    date: projectDeclaredDate(edition.startDate, [], null),
    // La geografía se conserva tal cual su alcance: un antecedente de Berlín
    // sigue en Berlín y jamás se presenta como oportunidad local futura.
    location: projectEditionLocation(edition),
    isAntecedent: validity.validity === "past",
  }))

  const editionNames = new Map(read.editions.map(({ edition }) => [edition.editionId, edition.name]))
  return {
    organizerId: read.organizerId,
    displayName: latest.displayName,
    confirmedAliases: latest.aliases
      .filter((alias) => alias.confirmation === "confirmed")
      .map((alias) => ({ alias: alias.alias, sources: resolveSources(alias.sourceIds, sourcesById) })),
    proposedAliases: latest.aliases
      .filter((alias) => alias.confirmation === "proposed")
      .map((alias) => alias.alias),
    // Afirmaciones documentadas con su soporte — deliberadamente SIN puntaje
    // único ni generalización automática.
    claims: read.claims.map((claim) => claimValueView(claim, sourcesById)),
    upcomingEditions: editionViews.filter((edition) => edition.validity.validity === "upcoming"),
    antecedents: editionViews.filter((edition) => edition.isAntecedent),
    undatedEditions: editionViews.filter(
      (edition) => !edition.isAntecedent && edition.validity.validity !== "upcoming",
    ),
    participations: read.participations.map((participation) =>
      participationView(participation, read.companies, editionNames, sourcesById),
    ),
    coverage: read.coverage,
    revisionCount: read.organizerRevisions.length,
  }
}
