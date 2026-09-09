"use client"

import type { EvaluationRunView } from "@/lib/api/atlas-client"
import { CatalogDossierPanel } from "./catalog-dossier-panel"

// Etapas mostradas durante la búsqueda — copy de UI (§5). El avance es un
// ticker cosmético del shell mientras la request real está en vuelo: la última
// etapa queda "en curso" hasta que el backend responde (nunca porcentajes
// inventados ni completado ficticio).
export const SEARCH_STAGES = [
  { id: "understanding", label: "Understanding your product" },
  { id: "matching", label: "Reading Google Trends and GitHub" },
  { id: "events", label: "Collecting X signals through Apify" },
  { id: "ranking", label: "Ranking worldwide growth markets" },
] as const

export type SearchStageId = (typeof SEARCH_STAGES)[number]["id"]

// Estado de UI del run durable (ticket 08). A diferencia del ticker, los pasos
// de acá son estado REAL persistido que devuelve GET /api/evaluations/:id.
export type EvaluationUiState = {
  runId: string
  run: EvaluationRunView | null
  // true cuando el run se recuperó desde ?run= tras una recarga (no hay
  // búsqueda en vuelo: el overlay se muestra solo por el run).
  recovered: boolean
  note: string | null
}

const STEP_LABELS: Record<string, string> = {
  validate_profile: "Validating saved profile",
  // Ticket 09: con catálogo curado bajo el tenant se investiga el material
  // persistido; sin catálogo cae al fixture etiquetado. El resultado declara
  // cuál fue (catalogNote/material).
  research_catalog: "Researching catalog (curated, or labeled fixture)",
  publish_result: "Publishing persisted result",
}

function stepClass(state: string): string {
  if (state === "completed") return " done"
  if (state === "running") return " now"
  return ""
}

function candidateLines(run: EvaluationRunView): string[] {
  const result = run.result
  if (
    typeof result !== "object" ||
    result === null ||
    (result as { kind?: unknown }).kind !== "catalog_research"
  )
    return []
  const candidates = (result as { candidates?: unknown }).candidates
  if (!Array.isArray(candidates)) return []
  return candidates.map((candidate) => {
    const c = candidate as { displayName?: string; pending?: string[] }
    const pending = Array.isArray(c.pending) && c.pending.length > 0 ? ` — pending: ${c.pending[0]}` : ""
    return `${c.displayName ?? "?"}${pending}`
  })
}

// stageIndex: índice del paso en curso; SEARCH_STAGES.length = todos completos
// (fade-out tras éxito); -1 = ninguno resaltado (fade-out tras error).
// evaluation: run durable en curso/recuperado; sus pasos vienen del servidor.
export function AnalysisOverlay({
  active,
  stageIndex,
  evaluation,
  onDismissEvaluation,
}: {
  active: boolean
  stageIndex: number
  evaluation?: EvaluationUiState | null
  onDismissEvaluation?: () => void
}) {
  const run = evaluation?.run ?? null
  const candidates = run && run.state === "completed" ? candidateLines(run) : []
  // Run recuperado en vista idle: el intake (z 56) taparía el overlay (z 50);
  // se eleva y se le da fondo de panel SOLO en ese caso (sin tocar globals.css).
  const recovered = evaluation?.recovered === true
  return (
    <div className="analysis" aria-live="polite" style={recovered ? { zIndex: 57 } : undefined}>
      <div
        className="analysis-box"
        style={
          recovered
            ? {
                pointerEvents: "auto",
                background: "rgba(245,245,242,0.97)",
                borderRadius: 16,
                padding: "28px 40px",
                boxShadow: "0 18px 60px rgba(17,17,17,0.14)",
              }
            : undefined
        }
      >
        {active ? (
          <>
            <span className="eyebrow">Analyzing</span>
            {SEARCH_STAGES.map((stage, index) => (
              <div
                key={stage.id}
                className={`a-step${active && index === stageIndex ? " now" : ""}${index < stageIndex ? " done" : ""}`}
              >
                <span className="tick" />
                {stage.label}
              </div>
            ))}
          </>
        ) : null}
        {evaluation ? (
          <div style={{ marginTop: active ? "22px" : 0 }}>
            <span className="eyebrow">
              {evaluation.recovered ? "Saved evaluation (recovered)" : "Saved evaluation"}
            </span>
            <div className="a-step done" style={{ opacity: 0.8 }}>
              <span className="tick" />
              Run {evaluation.runId.slice(0, 8)} · {run ? run.state : "contacting server…"}
            </div>
            {run
              ? run.steps.map((step) => (
                  <div key={step.name} className={`a-step${stepClass(step.state)}`}>
                    <span className="tick" />
                    {STEP_LABELS[step.name] ?? step.name}
                    {step.state === "failed" ? ` — failed (${step.attempts} attempts)` : ""}
                  </div>
                ))
              : null}
            {run?.state === "failed" && run.error ? (
              <div className="a-step" style={{ opacity: 0.8 }}>
                <span className="tick" />
                {`Run failed: ${run.error}`}
              </div>
            ) : null}
            {candidates.map((line) => (
              <div key={line} className="a-step done" style={{ opacity: 0.8 }}>
                <span className="tick" />
                {line}
              </div>
            ))}
            {evaluation.note ? (
              <div className="a-step" style={{ opacity: 0.7 }}>
                <span className="tick" />
                {evaluation.note}
              </div>
            ) : null}
            {/* Ticket 09: control mínimo del catálogo curado y dossier leído
                desde PostgreSQL, en el panel del run recuperado (?run=). El
                dashboard de descubrimiento pleno es del ticket 10. */}
            {recovered ? <CatalogDossierPanel /> : null}
            {evaluation.recovered && onDismissEvaluation ? (
              <button
                type="button"
                className="intake-go"
                style={{ marginTop: "16px" }}
                onClick={onDismissEvaluation}
              >
                Back to intake
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
