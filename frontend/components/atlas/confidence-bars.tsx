// Componente NUEVO (aditivo, T3). DOS barras SEPARADAS con labels distintos:
//   - confidence: qué tan seguros estamos sobre el MUNDO (la mueve la evidencia).
//   - consensus:  qué tan alineado está el EQUIPO (lo mueven los tapbacks).
// NUNCA se fusionan. La barra de consensus solo aparece si hay Decision activa
// (consensus != null). No reescribe nada existente.

import type { ReactElement } from "react"

function Bar({ label, value, color }: { label: string; value: number; color: string }): ReactElement {
  const clamped = Math.max(0, Math.min(100, Math.round(value)))
  return (
    <div className="conf-bar" style={{ display: "flex", alignItems: "center", gap: 8, margin: "4px 0" }}>
      <span className="lbl" style={{ minWidth: 132, fontSize: 12 }}>
        {label}
      </span>
      <span
        className="meter"
        style={{ flex: 1, height: 6, borderRadius: 3, background: "rgba(127,127,127,0.2)", overflow: "hidden" }}
      >
        <i style={{ display: "block", height: "100%", width: `${clamped}%`, background: color }} />
      </span>
      <span className="val" style={{ minWidth: 34, textAlign: "right", fontSize: 12 }}>
        {clamped}%
      </span>
    </div>
  )
}

export function ConfidenceBars({
  confidence,
  consensus,
}: {
  confidence: number // 0-100, evidencia sobre el mundo
  consensus: number | null // 0-1, alineación del equipo; null = sin Decision activa
}): ReactElement {
  return (
    <div className="confidence-bars">
      <Bar label="Confidence · evidence" value={confidence} color="#2f6fed" />
      {consensus != null && <Bar label="Consensus · team" value={consensus * 100} color="#7a3fed" />}
    </div>
  )
}
