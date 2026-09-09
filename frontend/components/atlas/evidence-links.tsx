// Componente NUEVO (aditivo, T3). Resuelve reason.evidenceIds contra el mapa de
// evidencia del SearchResponse y muestra, por cada evidencia: link (si hay URL),
// fecha y badge (Observed / Estimated / Prepared). No reescribe nada existente.

import type { ReactElement } from "react"
import type { SourceRecord } from "@/lib/contracts/evaluation"
import type { Evidence } from "@/lib/contracts/growxth"

const BADGE_LABEL: Record<Evidence["status"], string> = {
  observed: "Observed",
  estimated: "Estimated",
  prepared: "Prepared",
}

const BADGE_COLOR: Record<Evidence["status"], string> = {
  observed: "#1f7a4d",
  estimated: "#8a6d1f",
  prepared: "#6b6b6b",
}

// Fuente persistida del dossier curado (ticket 09, contrato SourceRecord de
// 07): cada valor material del panel permite abrir su fuente y ver localizador,
// obtención (distinta de publicación), método y alcance geográfico. Una fuente
// citada pero no incluida en la lectura queda declarada como irresoluble.
export function SourceRecordLinks({
  sources,
  unresolvedIds = [],
}: {
  sources: SourceRecord[]
  unresolvedIds?: string[]
}): ReactElement | null {
  if (sources.length === 0 && unresolvedIds.length === 0) return null
  return (
    <div className="source-records" style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
      {sources.map((source) => (
        <span
          key={source.id}
          className="source-record"
          style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 12, flexWrap: "wrap" }}
        >
          {source.url ? (
            <a href={source.url} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>
              {source.provider}
            </a>
          ) : (
            <span>{source.provider}</span>
          )}
          {source.locator ? <span style={{ opacity: 0.7 }}>({source.locator})</span> : null}
          <span style={{ opacity: 0.7 }}>{`obtained ${source.fetchedAt.slice(0, 10)}`}</span>
          <span style={{ opacity: 0.7 }}>
            {source.publishedAt ? `published ${source.publishedAt.slice(0, 10)}` : "publication date unknown"}
          </span>
          <span style={{ opacity: 0.7 }}>{source.method}</span>
          <span
            className={`badge scope-${source.geoScope}`}
            style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, border: "1px solid currentColor", opacity: 0.75 }}
          >
            {`scope: ${source.geoScope}`}
          </span>
        </span>
      ))}
      {unresolvedIds.map((id) => (
        <span key={id} style={{ fontSize: 12, fontStyle: "italic", opacity: 0.7 }}>
          {`source “${id}” not included in this read — reference unresolved, not invented`}
        </span>
      ))}
    </div>
  )
}

export function EvidenceLinks({
  evidenceIds,
  evidence,
}: {
  evidenceIds: string[]
  evidence: Record<string, Evidence>
}): ReactElement | null {
  const items = evidenceIds
    .map((id) => evidence[id])
    .filter((e): e is Evidence => e != null)

  if (items.length === 0) return null

  return (
    <div className="evidence-links" style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
      {items.map((e) => (
        <span
          key={e.id}
          className="evidence-link"
          style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}
        >
          {e.url ? (
            <a href={e.url} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>
              {e.title}
            </a>
          ) : (
            <span>{e.title}</span>
          )}
          <time dateTime={e.observedAt} style={{ opacity: 0.7 }}>
            {e.observedAt.slice(0, 10)}
          </time>
          {/* Alcance geográfico de la evidencia: lo que la fuente nombró; un
              listado sin lugar propio queda visiblemente pendiente. */}
          {e.location ? (
            <span className="evidence-location" style={{ opacity: 0.7 }}>
              {e.location}
            </span>
          ) : e.kind === "event_listing" ? (
            <span className="evidence-location pending" style={{ opacity: 0.7, fontStyle: "italic" }}>
              Location pending
            </span>
          ) : null}
          <span
            className={`badge status-${e.status}`}
            style={{
              fontSize: 10,
              padding: "1px 6px",
              borderRadius: 4,
              color: "#fff",
              background: BADGE_COLOR[e.status],
            }}
          >
            {BADGE_LABEL[e.status]}
          </span>
        </span>
      ))}
    </div>
  )
}
