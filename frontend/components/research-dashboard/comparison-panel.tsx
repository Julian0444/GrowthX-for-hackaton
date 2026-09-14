"use client"

// Panel de la comparación persistida (ticket 12). Renderiza el snapshot
// oficial INMUTABLE proyectado (lib/api/opportunity-adapter.ts): por candidato
// muestra «Descartado por restricción», «Condicionado» o «Elegible», sus
// fuentes y qué respuesta resolvería cada pendiente. El score solo aparece con
// policy aplicada; la cobertura Q se muestra con CoverageBar (nunca como
// confidence ni probabilidad de éxito). La redacción del modelo llega como
// registro aparte: puede faltar o estar rechazada sin que cambie nada de esto.
//
// Ticket 13: sobre este mismo panel se registra la decisión humana —
// elegir/descartar/pendiente con motivos obligatorios y condiciones (pregunta
// al organizador, respuesta esperada, efecto, responsable y plazo si se
// conocen). Choosing with pendientes se guarda como elección CONDICIONAL y abre
// la vista de campaña con el borrador persistido. Un candidato excluido por
// restricción confirmada no se puede elegir con un click; guardar no envía
// ningún mensaje.
//
// Ticket 14: reabrir es una LECTURA por identidad. El panel recupera las
// decisiones del snapshot desde PostgreSQL (jamás recalcula ni refresca
// fuentes), muestra evidencia y motivos con su fecha/revisión original, avisa
// la vigencia ACTUAL sin alterar el resultado histórico, y ofrece «Reevaluar»
// como acción explícita (otro run vinculado; la decisión previa sigue
// disponible). La selección (decisión enfocada, vista de campaña) viene de la
// URL vía `focus`, así cerrar y volver por el enlace interno restaura lo mismo.

import { englishSystemText } from "../../lib/research/english"
import { useEffect, useState } from "react"
import { readableDate, declaredDateLabel } from '../../lib/research/presentation'
import { sourceLink } from '../../lib/evidence/source-link'
import { AlternativeDecisionReading, AlternativeDecisionSummary } from "./comparison-reading"
import { ComparisonBriefEditor } from "./comparison-brief-editor"
import { BriefDifferences } from "./comparison-differences"
import type { ResearchBriefInput, ProjectedField, ProjectedScore } from "../../lib/contracts/evaluation"
import type { ComparisonCandidateView, ComparisonViewModel } from "../../lib/api/opportunity-adapter"
import { projectCampaignDraft } from "../../lib/api/opportunity-adapter"
import {
  comparisonResult,
  fetchDecisionRead,
  fetchEvaluation,
  fetchSnapshotDecisions,
  type DecisionRead,
} from "../../lib/api/atlas-client"
import { DecisionControls } from "./decision-controls"
import { CampaignDraftPanel } from "../atlas/campaign-panel"
import { CoverageBar } from "../atlas/confidence-bars"
import { evaluationHref, NO_FOCUS, type EvaluationFocus } from "./evaluation-list"
import { ReasonSources } from "./research-dossier"

const STATE_CLASS: Record<ComparisonCandidateView["stateLabel"], string> = {
  "Descartado por restricción": "excluded",
  Condicionado: "conditional",
  Elegible: "eligible",
}


// Estado de la lectura de decisiones: «leyendo» y «unavailable» se
// distinguen de «no hay decisión» (lista vacía con lectura ok).
type DecisionsState = "loading" | "ok" | "unauthorized" | "unavailable"

interface PreviousEvaluation {
  runId: string
  snapshotId: string | null
  evaluatedAt: string | null
  decisions: Record<string, DecisionRead>
  note: string | null
}

function Field({ label, field }: { label: string; field: ProjectedField }) {
  return (
    <p className={`comparison-field field-${field.state}`}>
      <b>{label}:</b>{" "}
      <span>
      {field.state === "known"
        ? `${field.display}${field.pendingNote ? ` · ${field.pendingNote}` : ""}${field.obtainedAt ? ` · obtained ${field.obtainedAt}` : ""}`
        : field.state === "ambiguous"
          ? `${field.display} · ${field.note}`
          : `Pending${field.note ? ` · ${field.note}` : ""}`}
      </span>
    </p>
  )
}

function Score({ score }: { score: ProjectedScore }) {
  if (score.state === "scored") {
    return (
      <div data-testid="candidate-score">
        <p>
          <b>S_known {score.sKnown}</b> · policy {score.policyId} · {score.policyVersion}
        </p>
        <CoverageBar coverage={score.coverage} />
        {score.sensitivityNote && <p className="research-meta">Sensitivity to missing data: {score.sensitivityNote}</p>}
      </div>
    )
  }
  if (score.state === "no_policy") {
    return (
      <p data-testid="candidate-score">
        <b>No score · policy pending.</b> {score.note}
      </p>
    )
  }
  return (
    <p data-testid="candidate-score">
      <b>No score.</b> {score.reason}
    </p>
  )
}

export function ComparisonPanel({
  view,
  runId,
  previousRunId,
  focus,
  onFocusChange,
  onReevaluate,
  reevaluating,
  onOpenRun,
  onOpenEdition,
  onOpenOrganizer,
  onDecisionsChanged,
  onShowMap,
}: {
  view: ComparisonViewModel
  runId: string
  // Vínculo al run de comparación anterior cuando este run es una reevaluación.
  previousRunId: string | null
  focus: EvaluationFocus
  onFocusChange: (focus: EvaluationFocus) => void
  onReevaluate: (profile?: ResearchBriefInput) => void
  reevaluating: boolean
  onOpenRun: (runId: string, focus: EvaluationFocus) => void
  onOpenEdition: (editionId: string) => void
  onOpenOrganizer: (organizerId: string) => void
  onShowMap: () => void
  onDecisionsChanged: () => void
}) {
  // Decisions persistidas contra este snapshot (una por alternativa): se
  // recuperan al montar, así reabrir el run conserva el estado de decisión.
  const [decisions, setDecisions] = useState<Record<string, DecisionRead>>({})
  const [reloadTick, setReloadTick] = useState(0)
  // La lectura se identifica por snapshot + reintento: mientras la lectura
  // vigente no confirmó, el estado es «leyendo» (derivado, sin setState
  // sincrónico en el efecto).
  const readKey = `${view.snapshotId}:${reloadTick}:${focus.decisionId ?? ""}:${focus.revision ?? "latest"}`
  const [decisionsRead, setDecisionsRead] = useState<{ key: string; status: Exclude<DecisionsState, "loading"> } | null>(null)
  const decisionsState: DecisionsState = decisionsRead?.key === readKey ? decisionsRead.status : "loading"
  const [previousRead, setPreviousRead] = useState<PreviousEvaluation | null>(null)
  const previous = previousRunId && previousRead?.runId === previousRunId ? previousRead : null
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      const outcome = await fetchSnapshotDecisions(view.snapshotId)
      if (outcome.status === 'ok' && focus.decisionId && focus.revision) {
        const historical = await fetchDecisionRead(focus.decisionId, focus.revision)
        if (historical.status === 'ok' && historical.read.snapshotId === view.snapshotId) {
          outcome.decisions = outcome.decisions.map(r => r.decisionId === focus.decisionId ? historical.read : r)
        } else if (historical.status === 'unavailable' || historical.status === 'unauthorized') {
          if (alive) setDecisionsRead({key: readKey, status: historical.status})
          return
        } else {
          outcome.decisions = outcome.decisions.filter(r => r.decisionId !== focus.decisionId)
        }
      }
      if (!alive) return
      if (outcome.status === "ok") {
        setDecisions(Object.fromEntries(outcome.decisions.map((read) => [read.editionId, read])))
        setDecisionsRead({ key: readKey, status: "ok" })
      } else {
        setDecisionsRead({ key: readKey, status: outcome.status })
      }
    })()
    return () => {
      alive = false
    }
  }, [view.snapshotId, readKey, focus.decisionId, focus.revision])

  // Reevaluación: la decisión previa se lee del run anterior por identidad
  // (run → snapshot → decisiones), nunca se copia ni se edita.
  useEffect(() => {
    if (!previousRunId) return
    let alive = true
    void (async () => {
      const run = await fetchEvaluation(previousRunId)
      if (!alive) return
      const result = run.status === "ok" ? comparisonResult(run.run) : null
      if (!result) {
        setPreviousRead({
          runId: previousRunId,
          snapshotId: null,
          evaluatedAt: null,
          decisions: {},
          note:
            run.status === "ok"
              ? "The previous evaluation has no saved snapshot."
              : run.status === "missing"
                ? "The previous evaluation is not available to this session."
                : "Could not read the previous evaluation; retry.",
        })
        return
      }
      const reads = await fetchSnapshotDecisions(result.snapshotId)
      if (!alive) return
      setPreviousRead({
        runId: previousRunId,
        snapshotId: result.snapshotId,
        evaluatedAt: result.evaluatedAt,
        decisions: reads.status === "ok" ? Object.fromEntries(reads.decisions.map((read) => [read.editionId, read])) : {},
        note: reads.status === "ok" ? null : "Could not read the previous decisions.",
      })
    })()
    return () => {
      alive = false
    }
  }, [previousRunId])

  // Selección recuperada del enlace interno: la decisión enfocada queda a la
  // vista una vez leída (sin scroll si no hay foco).
  useEffect(() => {
    if (decisionsState !== "ok" || !focus.decisionId || focus.view !== "comparison") return
    const target = document.querySelector<HTMLElement>(`[data-decision-id="${CSS.escape(focus.decisionId)}"]`)
    target?.scrollIntoView({ block: "start" })
  }, [decisionsState, focus.decisionId, focus.view])

  const applySaved = (read: DecisionRead) => {
    setDecisions((current) => ({ ...current, [read.editionId]: read }))
    if (focus.decisionId === read.decisionId && focus.revision !== undefined && focus.revision !== read.decision.revision) onFocusChange({...focus, revision:read.decision.revision})
    onDecisionsChanged()
  }
  const focusedRead = focus.decisionId
    ? (Object.values(decisions).find((read) => read.decisionId === focus.decisionId) ?? null)
    : null
  const focusMissing = decisionsState === "ok" && focus.decisionId !== null && focusedRead === null

  // Navegación panel → campaña: elegir (o reabrir por enlace) muestra el
  // borrador persistido de la campaña dentro del mismo panel.
  if (focus.view === "campaign") {
    if (decisionsState === "loading") {
      return (
        <section className="research-comparison" aria-label="Campaign draft" data-testid="comparison-panel">
          <p role="status">Loading the linked decision…</p>
        </section>
      )
    }
    const campaignCandidate = focusedRead ? view.candidates.find((candidate) => candidate.editionId === focusedRead.editionId) : null
    if (focusedRead?.campaign && campaignCandidate) {
      return (
        <section className="research-comparison" aria-label="Campaign draft" data-testid="comparison-panel">
          <CampaignDraftPanel
            brief={{read: focusedRead, bundle: view.bundle, runId}}
            view={projectCampaignDraft(focusedRead.campaign, campaignCandidate.sources)}
            meta={{
              runId,
              snapshotId: focusedRead.snapshotId,
              decisionRevision: focusedRead.decision.revision,
              decidedAt: focusedRead.decision.decidedAt,
              href: evaluationHref(runId, { decisionId: focusedRead.decisionId, view: "campaign", revision: focusedRead.decision.revision }),
            }}
            onBack={() => onFocusChange({ decisionId: focusedRead.decisionId, view: "comparison", revision: focusedRead.decision.revision })}
            onToast={(message) => setToast(message)}
          />
          {toast && <p role="status">{toast}</p>}
        </section>
      )
    }
  }

  return (
    <section className="research-comparison" aria-label="Saved comparison" data-testid="comparison-panel">
      <div className="research-actions">
        <h2>Compare opportunities</h2>
        <button className="research-button" type="button" disabled={reevaluating} onClick={() => onReevaluate()} data-testid="reevaluate">
          {reevaluating ? "Starting re-evaluation…" : "Re-evaluate with current evidence"}
        </button>
      </div>
      <button type="button" className="research-link" onClick={onShowMap}>Explore this comparison in list & map</button>

      {view.bundle.snapshot.decisionReading && <div data-testid="research-priority">
        <h3>What to investigate first</h3>
        <p>{view.bundle.snapshot.decisionReading.priority.kind === 'investigate_first' ? `Explore ${view.candidates.find(c => view.bundle.snapshot.decisionReading!.priority.editionIds.includes(c.editionId))?.name ?? 'the supported option'} first. Relevant documented background supports further research; confirm the commercial conditions before spending.` : view.bundle.snapshot.decisionReading.priority.kind === 'insufficient' ? 'No option has enough relevant evidence yet. Ask for an edition-specific program and audience before choosing.' : 'Compare the factual differences. The evidence does not establish an investment ranking.'}</p>
        <details><summary>Research criteria · {view.bundle.snapshot.decisionReading.version}</summary><p>{englishSystemText(view.bundle.snapshot.decisionReading.priority.explanation)}</p><ul>{view.bundle.snapshot.decisionReading.priority.criteria.map(c=><li key={c}>{englishSystemText(c)}</li>)}</ul></details>
      </div>}
      {decisionsState === "unauthorized" && (
        <p role="alert" className="research-meta" data-testid="decisions-note">
          ⚠ Sign in to read and record decisions. This does not mean there are no saved decisions.
        </p>
      )}
      {decisionsState === "unavailable" && (
        <p role="alert" className="research-meta" data-testid="decisions-note">
          ⚠ Saved decisions could not be read. The server is unavailable; this does not mean no decision exists.{" "}
          <button className="research-link" type="button" onClick={() => setReloadTick((tick) => tick + 1)}>
            Retry reading
          </button>
        </p>
      )}
      {focusMissing && (
        <p role="alert" className="research-meta" data-testid="focus-missing">
          ⚠ The linked decision is not part of this evaluation for your session.
        </p>
      )}
      {focus.view === "campaign" && focusedRead && !focusedRead.campaign && (
        <p role="alert" className="research-meta" data-testid="focus-missing">
          ⚠ The linked decision has no campaign draft; a chosen event creates one.
        </p>
      )}
      {toast && <p role="status">{toast}</p>}
      <div className="comparison-grid">
      {[...view.candidates].sort((a,b) => {
        const first = view.bundle.snapshot.decisionReading?.priority.editionIds ?? []
        return Number(first.includes(b.editionId)) - Number(first.includes(a.editionId))
      }).map((candidate, index) => (
        <article
          className="research-event research-comparison-candidate"
          key={candidate.editionId}
          data-edition-id={candidate.editionId}
          data-edition-revision-id={candidate.fixedRevisions.editionRevisionId}
          data-eligibility={STATE_CLASS[candidate.stateLabel]}
        >
          <h3>
            {view.isRanked && <span className="research-meta">{String(index + 1).padStart(2, "0")} · </span>}
            {candidate.name}
          </h3>
          <p data-testid="candidate-state">
            <b>{{'Descartado por restricción':'Excluded by constraint', Condicionado:'Conditional', Elegible:'Eligible'}[candidate.stateLabel]}</b>
          </p>
          {candidate.currentValidity && (
            <p role="alert" className="research-meta research-pending" data-testid="current-validity-notice">
              ⚠ {candidate.currentValidity.notice}
            </p>
          )}
          {candidate.dossier.eligibility.status === "excluded" && (
            <ul>
              {candidate.dossier.eligibility.reasons.map((reason, i) => (
                <li key={i}>{englishSystemText(reason)}</li>
              ))}
            </ul>
          )}
          <p className="event-date">{declaredDateLabel(view.bundle.editions.find(e => e.id === candidate.fixedRevisions.editionRevisionId)?.startDate ?? {precision:'unknown'})}</p>
          {view.bundle.snapshot.decisionReading?.alternatives.find(a=>a.editionId===candidate.editionId) && <AlternativeDecisionSummary reading={view.bundle.snapshot.decisionReading.alternatives.find(a=>a.editionId===candidate.editionId)!} bundle={view.bundle}/>}
          <div className="research-actions event-primary-actions">
            <button className="research-button" onClick={() => onOpenEdition(candidate.editionId)}>Inspect evidence</button>
            {(() => { const edition = view.bundle.editions.find(e => e.id === candidate.fixedRevisions.editionRevisionId); const source = candidate.sources.find(s => s.url === edition?.canonicalUrl || s.canonicalUrl === edition?.canonicalUrl); const href = source ? sourceLink(source).href : null; return href ? <a className="research-link" href={href} target="_blank" rel="noreferrer">Open event ↗</a> : null })()}
          </div>
          <DecisionControls runId={runId} snapshotId={view.snapshotId} candidate={candidate} saved={decisions[candidate.editionId] ?? null} loading={decisionsState === "loading"} previous={previous?.decisions[candidate.editionId] ?? null} previousRunId={previousRunId} onSaved={applySaved} onOpenCampaign={(read) => onFocusChange({ decisionId: read.decisionId, view: "campaign", revision: read.decision.revision })} onOpenRun={onOpenRun} bundle={view.bundle} onToast={setToast} />
          {view.bundle.snapshot.decisionReading?.alternatives.find(a=>a.editionId===candidate.editionId) && <AlternativeDecisionReading reading={view.bundle.snapshot.decisionReading.alternatives.find(a=>a.editionId===candidate.editionId)!} bundle={view.bundle} onOpenEdition={onOpenEdition}/>}
          <details className="candidate-full-reading"><summary>All conditions, sources and technical detail</summary>
          <Field label="Date" field={candidate.dossier.date} />
          <Field label="Location" field={candidate.dossier.location} />
          <Field label="Access" field={candidate.dossier.access} />
          <Field label="Audience" field={candidate.dossier.audience} />
          {candidate.dossier.costs.map((cost) => (
            <Field key={cost.label} label={`Cost · ${cost.label}`} field={cost.value} />
          ))}
          <p className="research-meta" data-testid="candidate-fixed-revisions">
            Saved edition revision: {candidate.fixedRevisions.editionRevisionId ?? "No revision"}
            {candidate.fixedRevisions.editionRevisedAt ? ` (${candidate.fixedRevisions.editionRevisedAt})` : ""}
            {candidate.fixedRevisions.organizerRevisionId
              ? ` · organizer ${candidate.fixedRevisions.organizerRevisionId} (${candidate.fixedRevisions.organizerRevisedAt})`
              : ""}{" "}
            · {candidate.fixedRevisions.claimRevisionIds.length} claim(s): {candidate.fixedRevisions.claimRevisionIds.join(", ") || "None"}
          </p>
          <div className="research-actions">
            <button className="research-link" type="button" onClick={() => onOpenEdition(candidate.editionId)}>
              Open edition dossier
            </button>
            {candidate.organizerId && (
              <button className="research-link" type="button" onClick={() => onOpenOrganizer(candidate.organizerId!)}>
                Open organizer dossier
              </button>
            )}
          </div>
          {candidate.dossier.conditions.length > 0 && (
            <div data-testid="candidate-conditions">
              <p>
                <b>Open conditions</b> (a score does not resolve them):
              </p>
              <ul>
                {candidate.dossier.conditions.map((condition) => (
                  <li key={condition.id}>
                    {englishSystemText(condition.description)}
                    {condition.resolution && (
                      <>
                        {" "}
                        <i>Answer needed: {englishSystemText(condition.resolution)}</i>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Score score={candidate.dossier.score} />
          {candidate.features.length > 0 && (
            <details>
              <summary>Scoring inputs</summary>
              <ul>
                {candidate.features.map((feature) => (
                  <li key={feature.key} className="research-meta">
                    {feature.key}:{" "}
                    {feature.value === null ? `No value — ${feature.missingReason ?? "Reason recorded"}` : feature.value}
                    {feature.note ? ` · ${feature.note}` : ""}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {candidate.narrativeProposal &&
            (candidate.narrativeProposal.withheldNote ? (
              <p className="research-meta">Model narrative {candidate.narrativeProposal.withheldNote}</p>
            ) : (
              <p data-testid="candidate-narrative">
                <b>Model reading (does not change the result):</b> {candidate.narrativeProposal.summary}
              </p>
            ))}
          {candidate.v0Shadow && (
            <p className="research-meta" data-testid="candidate-v0-shadow">
              v0 reference: {candidate.v0Shadow.reason}
              {candidate.v0Shadow.status === "reference_found_not_comparable" &&
                ` (score v0 ${candidate.v0Shadow.v0Score}, Reference only)`}
            </p>
          )}
          <ReasonSources sourceIds={candidate.sources.map((source) => source.id)} sources={candidate.sources} />
          </details>
        </article>
      ))}
      </div>
      <ComparisonBriefEditor key={view.snapshotId} profile={view.bundle.profile} busy={reevaluating} onSubmit={onReevaluate}/>
      {view.bundle.snapshot.decisionReading?.differences && <details data-testid="comparison-differences"><summary>Changes since the previous evaluation</summary>
        <h3>What changed</h3>
        <p>{englishSystemText(view.bundle.snapshot.decisionReading.differences.note)}</p>
        <BriefDifferences changes={view.bundle.snapshot.decisionReading.differences.briefChanges}/>
        {view.bundle.snapshot.decisionReading.differences.alternatives.map(a=><div key={a.editionId}><b>{view.candidates.find(c=>c.editionId===a.editionId)?.name??a.editionId}</b><ul>{a.changes.map((c,i)=><li key={i}>{englishSystemText(c)}</li>)}</ul></div>)}
      </details>}
      <details data-testid="comparison-technical"><summary>Comparison technical details</summary>
        <p>Snapshot <span data-testid="comparison-snapshot-id">{view.snapshotId}</span> · evaluated {readableDate(view.evaluatedAt)} · read <span data-testid="comparison-read-at">{readableDate(view.readAt)}</span></p>
        {previousRunId && <p data-testid="reevaluation-note">Linked to <button className="research-link" onClick={() => onOpenRun(previousRunId, NO_FOCUS)}>Open previous evaluation</button> · {previousRunId}. Previous evidence is unchanged.</p>}
        <p>{view.orderingLabel}</p><p>{view.availableCatalog.note}</p><p>{view.eligibleIsNotRecommended}</p>
        {view.warnings.map((warning,index) => <p key={index} data-testid="comparison-warning">{warning}</p>)}
      </details>

      <details><summary>Model and scoring audit</summary><p className="research-meta" data-testid="comparison-narrative-status">
        Narrative:{" "}
        {view.narrative
          ? `${view.narrative.status} · ${view.narrative.model} · ${view.narrative.promptVersion} · ${view.narrative.durationMs} ms${view.narrative.motive ? ` · ${view.narrative.motive}` : ""}`
          : "No narrative recorded"}
      </p>
      <p className="research-meta">{view.v0ShadowNote}</p></details>
    </section>
  )
}
