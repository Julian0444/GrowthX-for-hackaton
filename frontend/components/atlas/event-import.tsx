"use client"

import type { FormEvent } from "react"
import type { EventIngestResponse, RequestState } from "@/lib/api/types"

export type IngestUiState = {
  url: string
  request: RequestState
  result: EventIngestResponse | null
}

export const INGEST_IDLE: IngestUiState = {
  url: "",
  request: { status: "idle" },
  result: null,
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

// Fecha calendario LITERAL del ISO (sin convertir zona horaria: un evento
// publicado el 24/7 a las 18:00-07:00 debe mostrar 24, no el día en UTC).
function literalDate(iso: string): { month: string; day: string } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!match) return null
  return { month: MONTHS[Number(match[2]) - 1] ?? "—", day: String(Number(match[3])) }
}

function formatObserved(iso: string): string {
  const date = literalDate(iso)
  const time = /T(\d{2}:\d{2})/.exec(iso)
  if (!date) return "observed date unknown"
  const day = `${date.month} ${date.day}, ${iso.slice(0, 4)}`
  return iso.endsWith("Z") && time ? `observed ${day} · ${time[1]} UTC` : `observed ${day}`
}

function formatRegistration(status: string | undefined): string | null {
  if (!status) return null
  if (status === "open") return "Registration open"
  if (status === "sold_out") return "Sold out"
  return status.replaceAll("_", " ")
}

// Import de una URL de Luma (§10) — el evento entra al panel con su fuente
// real y su confidence (cobertura de campos), nunca inventados.
export function EventImport({
  ingest,
  onUrlChange,
  onImport,
}: {
  ingest: IngestUiState
  onUrlChange: (url: string) => void
  onImport: () => void
}) {
  const { url, request, result } = ingest
  const loading = request.status === "loading"
  const event = result?.event ?? null

  const submit = (formEvent: FormEvent) => {
    formEvent.preventDefault()
    if (!loading && url.trim()) onImport()
  }

  const date = event ? literalDate(event.startsAt) : null
  const registration = formatRegistration(event?.registrationStatus)

  return (
    <div className="d-section ingest">
      <span className="eyebrow">Import an event · Luma</span>
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
          {loading ? "Importing…" : "Import"}
        </button>
      </form>

      {request.status === "error" && (
        <div className="ingest-error" role="alert">
          <p className="msg">
            <b>Import failed</b> — {request.message}
          </p>
          <div className="actions">
            <button className="req-btn" type="button" onClick={onImport}>
              Retry
            </button>
          </div>
        </div>
      )}

      {event && result && (
        <div className="ingest-result">
          <div className="event-card">
            <div className="cal">
              <div className="m">{date?.month ?? "—"}</div>
              <div className="d">{date?.day ?? "—"}</div>
            </div>
            <div>
              <div className="ttl">{event.name}</div>
              <div className="meta">
                {[event.venue, event.city || "Location not published"].filter(Boolean).join(" · ")}
              </div>
              {registration && <div className="open">{registration}</div>}
            </div>
          </div>

          <div className="conf-row">
            <span className="lbl">Confidence</span>
            <span className="meter">
              <i style={{ width: `${event.confidence}%` }} />
            </span>
            <span className="val">{event.confidence}%</span>
          </div>
          <p className="ingest-note">
            {result.extraction.fieldsExtracted.length} of 10 fields extracted from structured data
          </p>

          <div className="evi">
            <span className="prov">{event.source.provider}</span>
            <div className="body">
              <div className="ttl">
                <a href={event.source.url} target="_blank" rel="noreferrer">
                  {event.source.url?.replace(/^https:\/\//, "")}
                </a>
              </div>
              <div className="when">{formatObserved(event.source.observedAt)}</div>
            </div>
            <span className={`badge${event.source.isEstimated ? " est" : ""}`}>
              {event.source.isEstimated ? "Estimated" : "Observed"}
            </span>
          </div>

          {result.extraction.warnings.length > 0 && (
            <p className="ingest-warns">Not in structured data: {summarizeWarnings(result.extraction.warnings)}</p>
          )}
        </div>
      )}
    </div>
  )
}

// Los warnings del endpoint son oraciones ("sponsors not present in structured
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
