"use client"

// Lista mínima de evaluaciones guardadas del tenant (ticket 14). No es un
// producto de historial aparte: vive en la sección Decisiones del dashboard y
// proyecta lo que GET /api/evaluations devolvió (runs de comparación con su
// snapshot oficial y la ÚLTIMA revisión de cada decisión registrada). Abrir
// una fila es una lectura por identidad (runId / decisionId) desde PostgreSQL;
// el filtro es por identidad de perfil, nunca por texto: dos perfiles con el
// mismo producto y distinto presupuesto u objetivo no se mezclan.

import { useState } from "react"
import type { SavedEvaluation, SavedEvaluationProfile } from "./research-types"

// Qué recupera un enlace interno además del run: la decisión enfocada y si se
// abre directamente su borrador de campaña. Vive en la URL (?run=&decision=&
// view=campaign) para que cerrar la pestaña y volver restaure la selección.
export type EvaluationFocus = { decisionId: string | null; view: "comparison" | "campaign" }

export const NO_FOCUS: EvaluationFocus = { decisionId: null, view: "comparison" }

// Enlace interno autenticado por la sesión (no expone ni acepta tenant).
export function evaluationHref(runId: string, focus: EvaluationFocus = NO_FOCUS): string {
  const params = new URLSearchParams({ run: runId })
  if (focus.decisionId) params.set("decision", focus.decisionId)
  if (focus.view === "campaign") params.set("view", "campaign")
  return `/?${params.toString()}`
}

export function parseEvaluationFocus(search: string): EvaluationFocus {
  const params = new URLSearchParams(search)
  const decisionId = params.get("decision")
  return {
    decisionId: decisionId && decisionId.trim().length > 0 ? decisionId.trim() : null,
    view: params.get("view") === "campaign" ? "campaign" : "comparison",
  }
}

const STATE_LABEL: Record<string, string> = {
  queued: "En cola",
  running: "En ejecución",
  completed: "Completado",
  failed: "Fallido",
}
const VERDICT_LABEL = { chosen: "Elegida", discarded: "Descartada", pending: "Pendiente" } as const

export function profileLabel(profile: SavedEvaluationProfile): string {
  const budget =
    profile.budget.status === "declared" ? `${profile.budget.currency} ${profile.budget.amount}` : "no declarado"
  return `${profile.product} · perfil v${profile.version} · presupuesto ${budget} · objetivo ${profile.objective}`
}

const shortId = (id: string) => id.slice(0, 8)

export function EvaluationList({
  evaluations,
  profiles,
  filterProfileId,
  onFilter,
  onOpen,
}: {
  evaluations: SavedEvaluation[]
  profiles: SavedEvaluationProfile[]
  filterProfileId: string | null
  onFilter: (profileId: string | null) => void
  onOpen: (runId: string, focus: EvaluationFocus) => void
}) {
  const [copied, setCopied] = useState<string | null>(null)
  const copy = (href: string) => {
    navigator.clipboard?.writeText(`${window.location.origin}${href}`)
    setCopied(href)
  }
  return (
    <div data-testid="evaluation-list">
      <label className="research-meta">
        Filtrar por perfil (identidad, no texto):{" "}
        <select
          aria-label="Filtrar evaluaciones por perfil"
          value={filterProfileId ?? ""}
          onChange={(event) => onFilter(event.target.value === "" ? null : event.target.value)}
        >
          <option value="">Todos los perfiles</option>
          {profiles.map((profile) => (
            <option key={profile.profileId} value={profile.profileId}>
              {profileLabel(profile)}
            </option>
          ))}
        </select>
      </label>
      {evaluations.length === 0 && (
        <p data-testid="evaluation-list-empty">
          {filterProfileId
            ? "No hay evaluaciones guardadas para ese perfil."
            : "No hay evaluaciones guardadas para esta sesión. Compará ediciones desde Eventos para crear una."}
        </p>
      )}
      {evaluations.map((evaluation) => (
        <article
          className="research-history"
          key={evaluation.runId}
          data-testid="saved-evaluation"
          data-run-id={evaluation.runId}
          data-snapshot-id={evaluation.snapshotId ?? ""}
          data-profile-id={evaluation.profile.profileId}
        >
          <div className="research-actions">
            <button className="research-link" type="button" onClick={() => onOpen(evaluation.runId, NO_FOCUS)}>
              Evaluación {shortId(evaluation.runId)}
            </button>
            <span>
              {STATE_LABEL[evaluation.state] ?? evaluation.state} · creada {evaluation.createdAt}
              {evaluation.evaluatedAt ? ` · evaluada al ${evaluation.evaluatedAt}` : ""}
            </span>
          </div>
          <span data-testid="saved-evaluation-profile">{profileLabel(evaluation.profile)}</span>
          <span>
            Eventos: {evaluation.editions.map((edition) => edition.name ?? edition.editionId).join(" · ") || "sin ediciones"}
          </span>
          <span>
            Snapshot: {evaluation.snapshotId ?? "pendiente (el worker todavía no confirmó el snapshot)"} · run {evaluation.runId}
          </span>
          {evaluation.previousRunId && (
            <span data-testid="saved-evaluation-previous">
              Reevaluación de la evaluación{" "}
              <button className="research-link" type="button" onClick={() => onOpen(evaluation.previousRunId!, NO_FOCUS)}>
                {shortId(evaluation.previousRunId)}
              </button>{" "}
              (la anterior y su decisión siguen disponibles; nada se reescribió).
            </span>
          )}
          {evaluation.error && <span role="alert">{evaluation.error}</span>}
          {evaluation.decisions.length > 0 ? (
            <ul>
              {evaluation.decisions.map((decision) => {
                const href = evaluationHref(evaluation.runId, { decisionId: decision.decisionId, view: "comparison" })
                const edition = evaluation.editions.find((item) => item.editionId === decision.editionId)
                return (
                  <li
                    key={decision.decisionId}
                    className="research-meta"
                    data-testid="saved-decision"
                    data-decision-id={decision.decisionId}
                    data-revision={decision.revision}
                    data-campaign-id={decision.campaignId ?? ""}
                  >
                    {edition?.name ?? decision.editionId}:{" "}
                    <b>
                      {VERDICT_LABEL[decision.verdict]}
                      {decision.verdict === "chosen" && decision.openConditions > 0 ? " · elección condicional" : ""}
                    </b>{" "}
                    · revisión {decision.revision} · registrada el {decision.decidedAt}{" "}
                    <button
                      className="research-link"
                      type="button"
                      onClick={() => onOpen(evaluation.runId, { decisionId: decision.decisionId, view: "comparison" })}
                    >
                      Abrir decisión
                    </button>
                    {decision.campaignId && (
                      <>
                        {" · "}
                        <button
                          className="research-link"
                          type="button"
                          onClick={() => onOpen(evaluation.runId, { decisionId: decision.decisionId, view: "campaign" })}
                        >
                          Abrir campaña {decision.campaignId}
                        </button>
                      </>
                    )}
                    {" · "}
                    <a className="research-link" href={href} data-testid="decision-link">
                      Enlace interno
                    </a>{" "}
                    <button className="research-link" type="button" onClick={() => copy(href)}>
                      {copied === href ? "Enlace copiado" : "Copiar enlace"}
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            evaluation.snapshotId && <span>Sin decisiones registradas sobre este snapshot.</span>
          )}
        </article>
      ))}
    </div>
  )
}
