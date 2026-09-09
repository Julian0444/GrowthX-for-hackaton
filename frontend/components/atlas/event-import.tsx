"use client"

import type { FormEvent } from "react"
import type { RequestState } from "@/lib/api/types"
import { eventIngestResult, type EvaluationRunView } from "@/lib/api/atlas-client"

// Import de una URL de Luma (ticket 11): pegar la URL llama a la operación
// DURABLE (POST /api/events/ingest → 202 con runId). Este panel muestra el
// runId y el progreso real persistido; el dossier resultante se reabre desde
// PostgreSQL (panel del dossier del ticket 09), no desde el estado de esta
// pantalla — cerrar la pestaña durante la obtención no pierde nada.

export type IngestUiState = {
  url: string
  request: RequestState
  // runId aceptado por la última importación disparada desde este panel.
  runId: string | null
}

export const INGEST_IDLE: IngestUiState = {
  url: "",
  request: { status: "idle" },
  runId: null,
}

const RUN_STATES: Record<string, string> = {
  queued: "En cola",
  running: "En ejecución",
  completed: "Completada",
  failed: "Fallida",
  pending: "Pendiente",
}

const STEP_LABELS: Record<string, string> = {
  validate_profile: "Validar perfil",
  fetch_event_page: "Obtener página del evento",
  persist_dossier: "Persistir dossier",
  publish_result: "Publicar resultado",
}

export function EventImport({
  ingest,
  run,
  onUrlChange,
  onImport,
  onOpenDossier,
}: {
  ingest: IngestUiState
  // Run de importación en curso o recuperado (null si el run abierto no es
  // una importación): estado y pasos vienen del servidor, no de esta pantalla.
  run: EvaluationRunView | null
  onUrlChange: (url: string) => void
  onImport: () => void
  onOpenDossier: (editionId: string) => void
}) {
  const { url, request } = ingest
  const loading = request.status === "loading"
  const result = eventIngestResult(run)

  const submit = (formEvent: FormEvent) => {
    formEvent.preventDefault()
    if (!loading && url.trim()) onImport()
  }

  return (
    <div className="d-section ingest">
      <span className="eyebrow">Importar un evento · Luma</span>
      <form className="ingest-row" onSubmit={submit} aria-busy={loading}>
        <input
          className="ingest-input"
          type="text"
          value={url}
          onChange={(changeEvent) => onUrlChange(changeEvent.target.value)}
          placeholder="luma.com/…"
          autoComplete="off"
          spellCheck={false}
          aria-label="Luma event URL"
        />
        <button className="ingest-btn" type="submit" disabled={loading}>
          {loading ? "Importando…" : "Importar"}
        </button>
      </form>

      {request.status === "error" && (
        <div className="ingest-error" role="alert">
          <p className="msg">
            <b>La importación no se aceptó</b> — {request.message}
          </p>
          <div className="actions">
            <button className="req-btn" type="button" onClick={onImport}>
              Reintentar
            </button>
          </div>
        </div>
      )}

      {run && (
        <div className="ingest-result" data-testid="ingest-run">
          <p className="ingest-note">
            Importación <b>{run.runId}</b> · {RUN_STATES[run.state] ?? run.state}
            {run.requestedUrl && <> · {run.requestedUrl}</>}
          </p>
          <ul className="ingest-note">
            {run.steps.map((step) => (
              <li key={step.name}>
                {STEP_LABELS[step.name] ?? step.name}: {RUN_STATES[step.state] ?? step.state} · intentos{" "}
                {step.attempts}
                {step.error && <> · {step.error}</>}
              </li>
            ))}
          </ul>
          {run.error && (
            // Un fallo conserva la URL solicitada, el intento y la causa —
            // visibles acá tal como quedaron persistidos.
            <p className="ingest-error" role="alert">
              Falló la importación de {run.requestedUrl ?? "la URL solicitada"}: {run.error}
            </p>
          )}
          {result && (
            <>
              <p className="ingest-note">
                {result.linkedToExistingEdition
                  ? "URL canónica relacionada con la identidad existente del evento: se agregó una revisión de evidencia, no una segunda identidad."
                  : "Nueva edición registrada en el catálogo del tenant como material importado."}
              </p>
              {result.extraction.warnings.length > 0 && (
                <p className="ingest-warns">
                  Dossier parcial — sin datos estructurados: {summarizeWarnings(result.extraction.warnings)}
                </p>
              )}
              <button className="req-btn" type="button" onClick={() => onOpenDossier(result.editionId)}>
                Abrir dossier persistido
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// Los warnings del parser son oraciones ("sponsors not present in structured
// data") — acá se compactan a una sola línea honesta.
function summarizeWarnings(warnings: string[]): string {
  return warnings
    .map((warning) =>
      warning
        .replace(" not present in structured data", "")
        .replace(" not published on the event page", " (not published)"),
    )
    .join(" · ")
}
