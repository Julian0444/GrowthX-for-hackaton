// Componente NUEVO (aditivo, T3). Resuelve reason.evidenceIds contra el mapa de
// evidencia del SearchResponse y muestra, por cada evidencia: link (si hay URL),
// fecha y badge (Observed / Estimated / Prepared). No reescribe nada existente.

import type { ReactElement } from "react"
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
