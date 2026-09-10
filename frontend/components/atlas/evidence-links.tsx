// Componente NUEVO (aditivo, T3). Resuelve reason.evidenceIds contra el mapa de
// evidencia del SearchResponse y muestra, por cada evidencia: link (si hay URL),
// fecha y badge (Observed / Estimated / Prepared). No reescribe nada existente.

import type { ReactElement } from "react"
import type { SourceRecord } from "@/lib/contracts/evaluation"
import type { Evidence } from "@/lib/contracts/growxth"
import { evidenceLink, sourceLink } from "../../lib/evidence/source-link"

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
    <div className="source-records">
      {sources.map((source) => {
        const link = sourceLink(source)
        return (
        <span
          key={source.id}
          className="source-record"
        >
          {link.href ? (
            <a href={link.href} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>
              {source.provider}
            </a>
          ) : (
            <span>{source.provider}</span>
          )}
          {link.kind === "synthetic" && <span className="source-date">Fuente de prueba · no abre una página real.</span>}
          {link.kind === "invalid" && <span className="source-date">Enlace no disponible.</span>}
          {source.locator ? <span className="source-locator">({source.locator})</span> : null}
          <span className="source-date">{`obtained ${source.fetchedAt.slice(0, 10)}`}</span>
          <span className="source-date">
            {source.publishedAt ? `published ${source.publishedAt.slice(0, 10)}` : "publication date unknown"}
          </span>
          <span className="source-method">{source.method}</span>
          <span
            className={`badge scope-${source.geoScope}`}
          >
            {`scope: ${source.geoScope}`}
          </span>
        </span>
        )
      })}
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
      {items.map((e) => {
        const link = evidenceLink(e.url, e.status === "prepared")
        return (
        <span
          key={e.id}
          className="evidence-link"
          style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}
        >
          {link.href ? (
            <a href={link.href} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>
              {e.title}
            </a>
          ) : (
            <span>{e.title}</span>
          )}
          {link.kind === "synthetic" && <span>Fuente de prueba · no abre una página real.</span>}
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
        )
      })}
    </div>
  )
}
