"use client"

// Panel de la comparación persistida (ticket 12). Renderiza el snapshot
// oficial INMUTABLE proyectado (lib/api/opportunity-adapter.ts): por candidato
// muestra «Descartado por restricción», «Condicionado» o «Elegible», sus
// fuentes y qué respuesta resolvería cada pendiente. El score solo aparece con
// política aplicada; la cobertura Q se muestra con CoverageBar (nunca como
// confidence ni probabilidad de éxito). La redacción del modelo llega como
// registro aparte: puede faltar o estar rechazada sin que cambie nada de esto.
//
// Ticket 13: sobre este mismo panel se registra la decisión humana —
// elegir/descartar/pendiente con motivos obligatorios y condiciones (pregunta
// al organizador, respuesta esperada, efecto, responsable y plazo si se
// conocen). Elegir con pendientes se guarda como elección CONDICIONAL y abre
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

import { useEffect, useRef, useState } from "react"
import type { ProjectedField, ProjectedScore } from "../../lib/contracts/evaluation"
import type { ComparisonCandidateView, ComparisonViewModel } from "../../lib/api/opportunity-adapter"
import { projectCampaignDraft } from "../../lib/api/opportunity-adapter"
import {
  comparisonResult,
  fetchEvaluation,
  fetchSnapshotDecisions,
  reviseConditionalDecision,
  saveConditionalDecision,
  type DecisionConditionDraft,
  type DecisionRead,
} from "../../lib/api/atlas-client"
import { CampaignDraftPanel } from "../atlas/campaign-panel"
import { CoverageBar } from "../atlas/confidence-bars"
import { evaluationHref, NO_FOCUS, type EvaluationFocus } from "./evaluation-list"
import { ReasonSources } from "./research-dossier"

const STATE_CLASS: Record<ComparisonCandidateView["stateLabel"], string> = {
  "Descartado por restricción": "excluded",
  Condicionado: "conditional",
  Elegible: "eligible",
}

const VERDICT_LABEL = { chosen: "Elegida", discarded: "Descartada", pending: "Pendiente" } as const

// Estado de la lectura de decisiones: «leyendo» y «no disponible» se
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
    <p className="research-meta">
      <b>{label}:</b>{" "}
      {field.state === "known"
        ? `${field.display}${field.pendingNote ? ` · ${field.pendingNote}` : ""}${field.obtainedAt ? ` · obtenido ${field.obtainedAt}` : ""}`
        : field.state === "ambiguous"
          ? `${field.display} · ${field.note}`
          : `Pendiente${field.note ? ` · ${field.note}` : ""}`}
    </p>
  )
}

function Score({ score }: { score: ProjectedScore }) {
  if (score.state === "scored") {
    return (
      <div data-testid="candidate-score">
        <p>
          <b>S_known {score.sKnown}</b> · política {score.policyId} · {score.policyVersion}
        </p>
        <CoverageBar coverage={score.coverage} />
        {score.sensitivityNote && <p className="research-meta">Sensibilidad a faltantes: {score.sensitivityNote}</p>}
      </div>
    )
  }
  if (score.state === "no_policy") {
    return (
      <p data-testid="candidate-score">
        <b>Sin score — política pendiente.</b> {score.note}
      </p>
    )
  }
  return (
    <p data-testid="candidate-score">
      <b>Sin score.</b> {score.reason}
    </p>
  )
}

// ---- Decisión condicional sobre un candidato (ticket 13) ----

const EMPTY_CONDITION: DecisionConditionDraft = {
  snapshotConditionId: null,
  pendingItem: "",
  question: "",
  expectedAnswer: "",
  effect: null,
  owner: "",
  dueBy: "",
}

function normalizeCondition(draft: DecisionConditionDraft): DecisionConditionDraft {
  const clean = (value: string | null): string | null => {
    const trimmed = (value ?? "").trim()
    return trimmed.length > 0 ? trimmed : null
  }
  return {
    snapshotConditionId: clean(draft.snapshotConditionId),
    pendingItem: (draft.pendingItem ?? "").trim(),
    question: clean(draft.question),
    expectedAnswer: clean(draft.expectedAnswer),
    effect: draft.effect,
    owner: clean(draft.owner),
    dueBy: clean(draft.dueBy),
  }
}

function DecisionControls({
  runId,
  snapshotId,
  candidate,
  saved,
  loading,
  previous,
  previousRunId,
  onSaved,
  onOpenCampaign,
  onOpenRun,
  onCopy,
}: {
  runId: string
  snapshotId: string
  candidate: ComparisonCandidateView
  saved: DecisionRead | null
  loading: boolean
  previous: DecisionRead | null
  previousRunId: string | null
  onSaved: (read: DecisionRead) => void
  onOpenCampaign: (read: DecisionRead) => void
  onOpenRun: (runId: string, focus: EvaluationFocus) => void
  onCopy: (href: string) => void
}) {
  const excluded = candidate.dossier.eligibility.status === "excluded"
  const [open, setOpen] = useState(false)
  const [verdict, setVerdict] = useState<"chosen" | "discarded" | "pending">(excluded ? "discarded" : "chosen")
  const [reasonsText, setReasonsText] = useState("")
  const [conditions, setConditions] = useState<DecisionConditionDraft[]>([])
  const [conditionDraft, setConditionDraft] = useState<DecisionConditionDraft>(EMPTY_CONDITION)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [resolving, setResolving] = useState<string | null>(null)
  const [resolvedNote, setResolvedNote] = useState("")
  // Reintentar una aceptación incierta conserva la clave idempotente; editar
  // el contenido crea otra (misma regla que launch/compare del dashboard).
  const submission = useRef<{ body: string; key: string } | null>(null)

  async function save() {
    if (busy) return
    const reasons = reasonsText.split("\n").map((line) => line.trim()).filter((line) => line.length > 0)
    if (reasons.length === 0) {
      setNote("Los motivos son obligatorios: escribí al menos uno (uno por línea).")
      return
    }
    const base = {
      snapshotId,
      editionId: candidate.editionId,
      verdict,
      reasons,
      conditions: conditions.map(normalizeCondition),
      campaignDraft: null,
    }
    const serialized = JSON.stringify(base)
    const idempotencyKey =
      submission.current && submission.current.body === serialized ? submission.current.key : crypto.randomUUID()
    submission.current = { body: serialized, key: idempotencyKey }
    setBusy(true)
    setNote(null)
    const outcome = await saveConditionalDecision({ idempotencyKey, ...base })
    setBusy(false)
    if (outcome.status === "saved") {
      submission.current = null
      setOpen(false)
      onSaved(outcome.read)
      // Elegir abre la vista de campaña con el borrador persistido.
      if (outcome.read.decision.verdict === "chosen") onOpenCampaign(outcome.read)
    } else {
      setNote(outcome.message)
    }
  }

  async function resolveCondition(conditionId: string) {
    if (!saved || busy) return
    const noteText = resolvedNote.trim()
    if (noteText.length === 0) {
      setNote("Registrá qué respuesta llegó: la resolución exige su nota.")
      return
    }
    setBusy(true)
    setNote(null)
    // Revisión esperada: si otra pestaña revisó primero, esto devuelve
    // conflicto y se relee — nunca se sobrescriben motivos en silencio.
    const outcome = await reviseConditionalDecision(saved.decisionId, {
      expectedRevision: saved.decision.revision,
      resolveConditions: [{ conditionId, resolvedNote: noteText }],
    })
    setBusy(false)
    if (outcome.status === "saved") {
      setResolving(null)
      setResolvedNote("")
      onSaved(outcome.read)
    } else {
      setNote(outcome.message)
    }
  }

  if (saved) {
    const openConditions = saved.decision.conditions.filter((condition) => condition.status === "open")
    const conditional = saved.decision.verdict === "chosen" && openConditions.length > 0
    const href = evaluationHref(runId, { decisionId: saved.decisionId, view: "comparison" })
    return (
      <div className="research-decision" data-testid="candidate-decision" data-decision-id={saved.decisionId}>
        <p>
          <b data-testid="decision-state">
            {VERDICT_LABEL[saved.decision.verdict]}
            {conditional ? " · elección condicional" : ""}
          </b>{" "}
          · revisión <span data-testid="decision-revision">{saved.decision.revision}</span> · registrada el{" "}
          <span data-testid="decision-decided-at">{saved.decision.decidedAt}</span>
        </p>
        <p className="research-meta">
          Decisión <span data-testid="decision-id">{saved.decisionId}</span> · snapshot {saved.snapshotId} · leída desde
          PostgreSQL con su revisión original.{" "}
          <a className="research-link" href={href} data-testid="decision-link">
            Enlace interno
          </a>{" "}
          <button className="research-link" type="button" onClick={() => onCopy(href)}>
            Copiar enlace
          </button>
        </p>
        <p className="research-meta">
          Motivos registrados de la decisión{saved.decision.verdict === "discarded" ? " (no son un resultado observado del evento)" : ""}:
        </p>
        <ul>
          {saved.decision.reasons.map((reason, index) => (
            <li key={index}>{reason}</li>
          ))}
        </ul>
        {saved.decision.conditions.length > 0 && (
          <div data-testid="decision-conditions">
            <p className="research-meta">Condiciones (registrarlas no envía ningún mensaje):</p>
            <ul>
              {saved.decision.conditions.map((condition) => (
                <li key={condition.id}>
                  {condition.status === "resolved" ? "✔ " : "○ "}
                  {condition.description}
                  {condition.answerWouldChangeTo && ` · Efecto: pasaría a ${VERDICT_LABEL[condition.answerWouldChangeTo].toLowerCase()}`}
                  {condition.owner && ` · Responsable: ${condition.owner}`}
                  {condition.dueBy && ` · Plazo: ${condition.dueBy}`}
                  {condition.resolvedNote && ` · Resuelta: ${condition.resolvedNote}`}
                  {condition.status === "open" &&
                    (resolving === condition.id ? (
                      <span>
                        {" "}
                        <input
                          value={resolvedNote}
                          onChange={(event) => setResolvedNote(event.target.value)}
                          placeholder="Qué respuesta llegó"
                          aria-label="Respuesta que resuelve la condición"
                        />
                        <button className="research-link" type="button" disabled={busy} onClick={() => void resolveCondition(condition.id)}>
                          Confirmar resolución
                        </button>
                      </span>
                    ) : (
                      <button className="research-link" type="button" onClick={() => { setResolving(condition.id); setResolvedNote("") }}>
                        Marcar resuelta
                      </button>
                    ))}
                </li>
              ))}
            </ul>
          </div>
        )}
        {saved.revisions.length > 1 && (
          <details data-testid="decision-history">
            <summary className="research-meta">Revisiones conservadas ({saved.revisions.length})</summary>
            <ul>
              {saved.revisions.map((revision) => (
                <li key={revision.id} className="research-meta">
                  revisión {revision.revision} · {VERDICT_LABEL[revision.verdict]} · {revision.decidedAt} · motivos:{" "}
                  {revision.reasons.join(" / ")}
                </li>
              ))}
            </ul>
          </details>
        )}
        {saved.campaign && (
          <button className="research-button" type="button" onClick={() => onOpenCampaign(saved)} data-testid="open-campaign">
            Abrir borrador de campaña persistido
          </button>
        )}
        {note && <p role="alert" className="research-meta">⚠ {note}</p>}
      </div>
    )
  }

  if (loading) {
    return (
      <p role="status" className="research-meta" data-testid="decision-loading">
        Leyendo decisiones guardadas de este snapshot…
      </p>
    )
  }

  const previousNote =
    previous && previousRunId ? (
      <p className="research-meta" data-testid="previous-decision" data-decision-id={previous.decisionId}>
        Decisión previa en la evaluación anterior:{" "}
        <b>
          {VERDICT_LABEL[previous.decision.verdict]}
          {previous.decision.verdict === "chosen" && previous.decision.conditions.some((condition) => condition.status === "open")
            ? " · elección condicional"
            : ""}
        </b>{" "}
        · revisión {previous.decision.revision} · registrada el {previous.decision.decidedAt}.{" "}
        <button
          className="research-link"
          type="button"
          onClick={() => onOpenRun(previousRunId, { decisionId: previous.decisionId, view: "comparison" })}
        >
          Abrir la decisión previa
        </button>{" "}
        Esta reevaluación no la edita: registrar acá es otra decisión sobre otro snapshot.
      </p>
    ) : null

  if (!open) {
    return (
      <>
        {previousNote}
        <button className="research-button" type="button" onClick={() => setOpen(true)} data-testid="decision-open">
          Registrar decisión
        </button>
      </>
    )
  }

  return (
    <div className="research-decision" data-testid="decision-form">
      {previousNote}
      <p>
        <b>Registrar decisión</b> — los motivos son obligatorios; guardar no envía mensajes ni contrata nada.
      </p>
      <div role="radiogroup" aria-label="Veredicto">
        {(["chosen", "discarded", "pending"] as const).map((option) => (
          <label key={option} className="research-meta">
            <input
              type="radio"
              name={`verdict-${candidate.editionId}`}
              checked={verdict === option}
              disabled={option === "chosen" && excluded}
              onChange={() => setVerdict(option)}
            />{" "}
            {option === "chosen" ? "Elegir" : option === "discarded" ? "Descartar" : "Dejar pendiente"}
          </label>
        ))}
      </div>
      {excluded && (
        <p className="research-meta" data-testid="decision-excluded-note">
          Excluido por restricción confirmada: no se puede elegir con un click — corregir el dato requiere nueva
          evidencia y una reevaluación. Sí se puede registrar su descarte o dejarlo pendiente.
        </p>
      )}
      {verdict === "chosen" && candidate.dossier.conditions.length > 0 && (
        <p className="research-meta">
          Elegir con {candidate.dossier.conditions.length} pendiente(s) del snapshot se guarda como elección
          CONDICIONAL: esas condiciones quedan abiertas en la decisión.
        </p>
      )}
      <label className="research-meta">
        Motivos (obligatorios, uno por línea):
        <textarea
          value={reasonsText}
          onChange={(event) => setReasonsText(event.target.value)}
          rows={3}
          aria-label="Motivos de la decisión"
        />
      </label>
      {conditions.length > 0 && (
        <ul>
          {conditions.map((condition, index) => (
            <li key={index} className="research-meta">
              {condition.pendingItem}
              {condition.question ? ` — Pregunta: ${condition.question}` : ""}
              {condition.owner ? ` — Responsable: ${condition.owner}` : ""}{" "}
              <button className="research-link" type="button" onClick={() => setConditions(conditions.filter((_, i) => i !== index))}>
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}
      <details>
        <summary className="research-meta">Agregar condición (pregunta al organizador, respuesta esperada, efecto, responsable, plazo)</summary>
        <div className="research-decision-condition">
          <input value={conditionDraft.pendingItem} onChange={(e) => setConditionDraft({ ...conditionDraft, pendingItem: e.target.value })} placeholder="Dato o claim pendiente" aria-label="Dato pendiente" />
          <input value={conditionDraft.question ?? ""} onChange={(e) => setConditionDraft({ ...conditionDraft, question: e.target.value })} placeholder="Pregunta al organizador (no se envía)" aria-label="Pregunta al organizador" />
          <input value={conditionDraft.expectedAnswer ?? ""} onChange={(e) => setConditionDraft({ ...conditionDraft, expectedAnswer: e.target.value })} placeholder="Respuesta esperada" aria-label="Respuesta esperada" />
          <select value={conditionDraft.effect ?? ""} onChange={(e) => setConditionDraft({ ...conditionDraft, effect: e.target.value === "" ? null : (e.target.value as "chosen" | "discarded") })} aria-label="Efecto sobre la decisión">
            <option value="">Efecto: por definir</option>
            <option value="chosen">Si se confirma → elegir</option>
            <option value="discarded">Si se confirma → descartar</option>
          </select>
          <input value={conditionDraft.owner ?? ""} onChange={(e) => setConditionDraft({ ...conditionDraft, owner: e.target.value })} placeholder="Responsable (si se conoce)" aria-label="Responsable" />
          <input value={conditionDraft.dueBy ?? ""} onChange={(e) => setConditionDraft({ ...conditionDraft, dueBy: e.target.value })} placeholder="Plazo YYYY-MM-DD (si se conoce)" aria-label="Plazo" />
          <button
            className="research-button"
            type="button"
            onClick={() => {
              if (conditionDraft.pendingItem.trim().length === 0) return
              setConditions([...conditions, conditionDraft])
              setConditionDraft(EMPTY_CONDITION)
            }}
          >
            Agregar condición
          </button>
        </div>
      </details>
      <div className="research-actions">
        <button className="research-button" type="button" disabled={busy} onClick={() => void save()} data-testid="decision-save">
          {busy ? "Guardando…" : "Guardar decisión"}
        </button>
        <button className="research-link" type="button" onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
      {note && (
        <p role="alert" className="research-meta" data-testid="decision-note">
          ⚠ {note}
        </p>
      )}
    </div>
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
}: {
  view: ComparisonViewModel
  runId: string
  // Vínculo al run de comparación anterior cuando este run es una reevaluación.
  previousRunId: string | null
  focus: EvaluationFocus
  onFocusChange: (focus: EvaluationFocus) => void
  onReevaluate: () => void
  reevaluating: boolean
  onOpenRun: (runId: string, focus: EvaluationFocus) => void
  onOpenEdition: (editionId: string) => void
  onOpenOrganizer: (organizerId: string) => void
  onDecisionsChanged: () => void
}) {
  // Decisiones persistidas contra este snapshot (una por alternativa): se
  // recuperan al montar, así reabrir el run conserva el estado de decisión.
  const [decisions, setDecisions] = useState<Record<string, DecisionRead>>({})
  const [reloadTick, setReloadTick] = useState(0)
  // La lectura se identifica por snapshot + reintento: mientras la lectura
  // vigente no confirmó, el estado es «leyendo» (derivado, sin setState
  // sincrónico en el efecto).
  const readKey = `${view.snapshotId}:${reloadTick}`
  const [decisionsRead, setDecisionsRead] = useState<{ key: string; status: Exclude<DecisionsState, "loading"> } | null>(null)
  const decisionsState: DecisionsState = decisionsRead?.key === readKey ? decisionsRead.status : "loading"
  const [previousRead, setPreviousRead] = useState<PreviousEvaluation | null>(null)
  const previous = previousRunId && previousRead?.runId === previousRunId ? previousRead : null
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      const outcome = await fetchSnapshotDecisions(view.snapshotId)
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
  }, [view.snapshotId, readKey])

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
              ? "La evaluación anterior no tiene snapshot publicado."
              : run.status === "missing"
                ? "La evaluación anterior no existe para esta sesión."
                : "No se pudo leer la evaluación anterior; reintentá.",
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
        note: reads.status === "ok" ? null : "No se pudieron leer las decisiones de la evaluación anterior.",
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
    onDecisionsChanged()
  }
  const copyLink = (href: string) => {
    navigator.clipboard?.writeText(`${window.location.origin}${href}`)
    setToast("Enlace interno copiado")
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
        <section className="research-comparison" aria-label="Borrador de campaña" data-testid="comparison-panel">
          <p role="status">Leyendo la decisión enlazada desde PostgreSQL…</p>
        </section>
      )
    }
    const campaignCandidate = focusedRead ? view.candidates.find((candidate) => candidate.editionId === focusedRead.editionId) : null
    if (focusedRead?.campaign && campaignCandidate) {
      return (
        <section className="research-comparison" aria-label="Borrador de campaña" data-testid="comparison-panel">
          <CampaignDraftPanel
            view={projectCampaignDraft(focusedRead.campaign, campaignCandidate.sources)}
            meta={{
              runId,
              snapshotId: focusedRead.snapshotId,
              decisionRevision: focusedRead.decision.revision,
              decidedAt: focusedRead.decision.decidedAt,
              href: evaluationHref(runId, { decisionId: focusedRead.decisionId, view: "campaign" }),
            }}
            onBack={() => onFocusChange({ decisionId: focusedRead.decisionId, view: "comparison" })}
            onToast={(message) => setToast(message)}
          />
          {toast && <p role="status">{toast}</p>}
        </section>
      )
    }
  }

  return (
    <section className="research-comparison" aria-label="Comparación persistida" data-testid="comparison-panel">
      <div className="research-actions">
        <h2>Comparación de candidatos</h2>
        <button className="research-button" type="button" disabled={reevaluating} onClick={onReevaluate} data-testid="reevaluate">
          {reevaluating ? "Aceptando reevaluación…" : "Reevaluar (nuevo run vinculado)"}
        </button>
      </div>
      <p className="research-meta">
        Snapshot oficial <span data-testid="comparison-snapshot-id">{view.snapshotId}</span> · evaluado al{" "}
        {view.evaluatedAt} · leído al <span data-testid="comparison-read-at">{view.readAt}</span>. Inmutable: reevaluar crea
        otro run con otro snapshot; esta evaluación y sus decisiones siguen disponibles por su enlace interno.
      </p>
      {previousRunId && (
        <p data-testid="reevaluation-note">
          Reevaluación de la evaluación anterior{" "}
          <button className="research-link" type="button" onClick={() => onOpenRun(previousRunId, NO_FOCUS)}>
            {previousRunId}
          </button>
          {previous?.snapshotId ? ` (snapshot ${previous.snapshotId}, evaluado al ${previous.evaluatedAt})` : ""}. La
          decisión previa no se edita: se lee con su revisión original.
          {previous?.note ? ` ${previous.note}` : ""}
        </p>
      )}
      <p>{view.orderingLabel}</p>
      <p>{view.availableCatalog.note}</p>
      <p className="research-meta">{view.eligibleIsNotRecommended}</p>
      {view.warnings.map((warning, index) => (
        <p key={index} role="alert" className="research-meta" data-testid="comparison-warning">
          ⚠ {warning}
        </p>
      ))}
      {decisionsState === "unauthorized" && (
        <p role="alert" className="research-meta" data-testid="decisions-note">
          ⚠ Se requiere una sesión para leer y registrar decisiones (no significa que no haya decisión).
        </p>
      )}
      {decisionsState === "unavailable" && (
        <p role="alert" className="research-meta" data-testid="decisions-note">
          ⚠ No se pudieron leer las decisiones guardadas de este snapshot (servidor no disponible); esto NO equivale a «sin
          decisión».{" "}
          <button className="research-link" type="button" onClick={() => setReloadTick((tick) => tick + 1)}>
            Reintentar lectura
          </button>
        </p>
      )}
      {focusMissing && (
        <p role="alert" className="research-meta" data-testid="focus-missing">
          ⚠ La decisión enlazada ({focus.decisionId}) no existe en este snapshot para esta sesión. No es un error de
          lectura: la lista de decisiones se leyó correctamente.
        </p>
      )}
      {focus.view === "campaign" && focusedRead && !focusedRead.campaign && (
        <p role="alert" className="research-meta" data-testid="focus-missing">
          ⚠ La decisión enlazada no tiene borrador de campaña: solo una elección lo crea.
        </p>
      )}
      {toast && <p role="status">{toast}</p>}
      {view.candidates.map((candidate, index) => (
        <article
          className="research-event research-comparison-candidate"
          key={candidate.editionId}
          data-edition-id={candidate.editionId}
          data-eligibility={STATE_CLASS[candidate.stateLabel]}
        >
          <h3>
            {view.isRanked && <span className="research-meta">{String(index + 1).padStart(2, "0")} · </span>}
            {candidate.name}
          </h3>
          <p data-testid="candidate-state">
            <b>{candidate.stateLabel}</b>
          </p>
          {candidate.currentValidity && (
            <p role="alert" className="research-meta research-pending" data-testid="current-validity-notice">
              ⚠ {candidate.currentValidity.notice}
            </p>
          )}
          {candidate.dossier.eligibility.status === "excluded" && (
            <ul>
              {candidate.dossier.eligibility.reasons.map((reason, i) => (
                <li key={i}>{reason}</li>
              ))}
            </ul>
          )}
          <Field label="Fecha" field={candidate.dossier.date} />
          <Field label="Lugar" field={candidate.dossier.location} />
          <Field label="Acceso" field={candidate.dossier.access} />
          <Field label="Audiencia" field={candidate.dossier.audience} />
          {candidate.dossier.costs.map((cost) => (
            <Field key={cost.label} label={`Costo · ${cost.label}`} field={cost.value} />
          ))}
          <p className="research-meta" data-testid="candidate-fixed-revisions">
            Revisiones fijadas por el snapshot: edición {candidate.fixedRevisions.editionRevisionId ?? "sin revisión"}
            {candidate.fixedRevisions.editionRevisedAt ? ` (${candidate.fixedRevisions.editionRevisedAt})` : ""}
            {candidate.fixedRevisions.organizerRevisionId
              ? ` · organizador ${candidate.fixedRevisions.organizerRevisionId} (${candidate.fixedRevisions.organizerRevisedAt})`
              : ""}{" "}
            · {candidate.fixedRevisions.claimRevisionIds.length} claim(s): {candidate.fixedRevisions.claimRevisionIds.join(", ") || "ninguno"}
          </p>
          <div className="research-actions">
            <button className="research-link" type="button" onClick={() => onOpenEdition(candidate.editionId)}>
              Abrir dossier de la edición
            </button>
            {candidate.organizerId && (
              <button className="research-link" type="button" onClick={() => onOpenOrganizer(candidate.organizerId!)}>
                Abrir expediente del organizador
              </button>
            )}
          </div>
          {candidate.dossier.conditions.length > 0 && (
            <div data-testid="candidate-conditions">
              <p>
                <b>Condiciones pendientes</b> (ninguna se resuelve por puntaje):
              </p>
              <ul>
                {candidate.dossier.conditions.map((condition) => (
                  <li key={condition.id}>
                    {condition.description}
                    {condition.resolution && (
                      <>
                        {" "}
                        <i>Qué respuesta la resolvería: {condition.resolution}</i>
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
              <summary>Features usadas por el scorer</summary>
              <ul>
                {candidate.features.map((feature) => (
                  <li key={feature.key} className="research-meta">
                    {feature.key}:{" "}
                    {feature.value === null ? `sin dato — ${feature.missingReason ?? "razón registrada"}` : feature.value}
                    {feature.note ? ` · ${feature.note}` : ""}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {candidate.narrativeProposal &&
            (candidate.narrativeProposal.withheldNote ? (
              <p className="research-meta">Redacción del modelo {candidate.narrativeProposal.withheldNote}</p>
            ) : (
              <p data-testid="candidate-narrative">
                <b>Lectura del modelo (no altera el resultado):</b> {candidate.narrativeProposal.summary}
              </p>
            ))}
          {candidate.v0Shadow && (
            <p className="research-meta" data-testid="candidate-v0-shadow">
              Sombra v0: {candidate.v0Shadow.reason}
              {candidate.v0Shadow.status === "reference_found_not_comparable" &&
                ` (score v0 ${candidate.v0Shadow.v0Score}, solo registro)`}
            </p>
          )}
          <ReasonSources sourceIds={candidate.sources.map((source) => source.id)} sources={candidate.sources} />
          <DecisionControls
            runId={runId}
            snapshotId={view.snapshotId}
            candidate={candidate}
            saved={decisions[candidate.editionId] ?? null}
            loading={decisionsState === "loading"}
            previous={previous?.decisions[candidate.editionId] ?? null}
            previousRunId={previousRunId}
            onSaved={applySaved}
            onOpenCampaign={(read) => onFocusChange({ decisionId: read.decisionId, view: "campaign" })}
            onOpenRun={onOpenRun}
            onCopy={copyLink}
          />
        </article>
      ))}
      <p className="research-meta" data-testid="comparison-narrative-status">
        Redacción:{" "}
        {view.narrative
          ? `${view.narrative.status} · ${view.narrative.model} · ${view.narrative.promptVersion} · ${view.narrative.durationMs} ms${view.narrative.motive ? ` · ${view.narrative.motive}` : ""}`
          : "sin registro de redacción"}
      </p>
      <p className="research-meta">{view.v0ShadowNote}</p>
    </section>
  )
}
