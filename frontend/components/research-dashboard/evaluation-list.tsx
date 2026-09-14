"use client"

// Lista mínima de evaluaciones guardadas del tenant (ticket 14). No es un
// producto de historial aparte: vive en la sección Decisions del dashboard y
// proyecta lo que GET /api/evaluations devolvió (runs de comparación con su
// snapshot oficial y la ÚLTIMA revisión de cada decisión registrada). Abrir
// una fila es una lectura por identidad (runId / decisionId) desde PostgreSQL;
// el filtro es por identidad de perfil, nunca por texto: dos perfiles con el
// mismo producto y distinto presupuesto u objetivo no se mezclan.

import {copyText} from "../../lib/research/decision-brief"
import { useState } from "react"
import type { SavedEvaluation, SavedEvaluationProfile } from "./research-types"

// Qué recupera un enlace interno además del run: la decisión enfocada y si se
// abre directamente su borrador de campaña. Vive en la URL (?run=&decision=&
// view=campaign) para que cerrar la pestaña y volver restaure la selección.
export type EvaluationFocus = { decisionId: string | null; view: "comparison" | "campaign"; revision?: number }

export const NO_FOCUS: EvaluationFocus = { decisionId: null, view: "comparison" }

// Internal link autenticado por la sesión (no expone ni acepta tenant).
export function evaluationHref(runId: string, focus: EvaluationFocus = NO_FOCUS): string {
  const params = new URLSearchParams({ run: runId })
  if (focus.decisionId) params.set("decision", focus.decisionId)
  if (focus.revision) params.set("revision", String(focus.revision))
  if (focus.view === "campaign") params.set("view", "campaign")
  return `/?${params.toString()}`
}

export function parseEvaluationFocus(search: string): EvaluationFocus {
  const params = new URLSearchParams(search)
  const decisionId = params.get("decision")
  return {
    decisionId: decisionId && decisionId.trim().length > 0 ? decisionId.trim() : null,
    ...(/^[1-9]\d*$/.test(params.get("revision") ?? "") ? {revision: Number(params.get("revision"))} : {}),
    view: params.get("view") === "campaign" ? "campaign" : "comparison",
  }
}

const STATE_LABEL: Record<string, string> = {
  queued: "Queued",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
}
const VERDICT_LABEL = { chosen: "Chosen", discarded: "Discarded", pending: "Pending" } as const

export function profileLabel(profile: SavedEvaluationProfile): string {
  const budget =
    profile.budget.status === "declared" ? `${profile.budget.currency} ${profile.budget.amount}` : "Not declared"
  return `${profile.product} · brief v${profile.version} · budget ${budget} · goal ${profile.objective}`
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
  const copy = async (href: string) => {
    const result = await copyText(`${window.location.origin}${href}`)
    setCopied(result === "Copied to clipboard" ? href : result)
  }
  return (
    <div data-testid="evaluation-list">
      {copied && !copied.startsWith("/?") && <p role="status">{copied}</p>}
      <label className="research-meta">
        Filter by saved brief:{" "}
        <select
          aria-label="Filter evaluations by brief"
          value={filterProfileId ?? ""}
          onChange={(event) => onFilter(event.target.value === "" ? null : event.target.value)}
        >
          <option value="">All briefs</option>
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
            ? "No saved evaluations for this brief."
            : "No saved evaluations yet. Select events to compare."}
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
              Evaluation {shortId(evaluation.runId)}
            </button>
            <span>
              {STATE_LABEL[evaluation.state] ?? evaluation.state} · created {evaluation.createdAt}
              {evaluation.evaluatedAt ? ` · evaluated ${evaluation.evaluatedAt}` : ""}
            </span>
          </div>
          <span data-testid="saved-evaluation-profile">{profileLabel(evaluation.profile)}</span>
          <span>
            Events: {evaluation.editions.map((edition) => edition.name ?? edition.editionId).join(" · ") || "No editions"}
          </span>
          <span>
            Snapshot: {evaluation.snapshotId ?? "Pending saved result"} · run {evaluation.runId}
          </span>
          {evaluation.previousRunId && (
            <span data-testid="saved-evaluation-previous">
              Re-evaluation of{" "}
              <button className="research-link" type="button" onClick={() => onOpen(evaluation.previousRunId!, NO_FOCUS)}>
                {shortId(evaluation.previousRunId)}
              </button>{" "}
              (previous evidence and decisions are preserved).
            </span>
          )}
          {evaluation.error && <span role="alert">{evaluation.error}</span>}
          {evaluation.decisions.length > 0 ? (
            <ul>
              {evaluation.decisions.map((decision) => {
                const href = evaluationHref(evaluation.runId, { decisionId: decision.decisionId, view: "comparison", revision: decision.revision })
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
                      {decision.intent === "explore_first" ? "Explore first" : VERDICT_LABEL[decision.verdict]}
                      {decision.verdict === "chosen" && decision.openConditions > 0 ? " · conditional choice" : ""}
                    </b>{" "}
                    · revision {decision.revision} · recorded on {decision.decidedAt}{" "}
                    <button
                      className="research-link"
                      type="button"
                      onClick={() => onOpen(evaluation.runId, { decisionId: decision.decisionId, view: "comparison", revision: decision.revision })}
                    >
                      Open decision
                    </button>
                    {decision.campaignId && (
                      <>
                        {" · "}
                        <button
                          className="research-link"
                          type="button"
                          onClick={() => onOpen(evaluation.runId, { decisionId: decision.decisionId, view: "campaign", revision: decision.revision })}
                        >
                          Open campaign {decision.campaignId}
                        </button>
                      </>
                    )}
                    {" · "}
                    <a className="research-link" href={href} data-testid="decision-link">
                      Internal link
                    </a>{" "}
                    <button className="research-link" type="button" onClick={() => copy(href)}>
                      {copied === href ? "Link copied" : "Copy link"}
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            evaluation.snapshotId && <span>No decisions saved for this evaluation.</span>
          )}
        </article>
      ))}
    </div>
  )
}
