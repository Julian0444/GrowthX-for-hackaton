"use client"

import { memo, type CSSProperties } from "react"
import { LIVE_EVENTS } from "@/lib/atlas/live-events"

// Capa de 136 eventos reales pulsando (ticket 03). Sin props: se monta una vez
// dentro del grupo de cámara y nunca re-renderiza; el zoom la escala como al
// resto del mapa. Pulsos = ondas de tinta/sonar (anillo que se expande y se
// desvanece) animadas solo con transform/opacity; el glow es un segundo círculo
// con opacidad, sin filtros SVG. Qué pulsa por banda de zoom y el toggle de la
// capa Events se resuelven en CSS (.zoomed / .zoomed3 / .layer-off-events).
export const LiveEventLayer = memo(function LiveEventLayer() {
  return (
    <g className="live-events" aria-hidden="true" pointerEvents="none">
      {LIVE_EVENTS.map((event) => (
        <g
          key={event.id}
          className={`lev tier-${event.tier}`}
          style={{ "--d": `${event.ringDelay}s`, "--dur": `${event.ringDur}s` } as CSSProperties}
        >
          <circle className="lev-ring" cx={event.x} cy={event.y} r={event.r * 2.2} />
          <circle className="lev-glow" cx={event.x} cy={event.y} r={event.r * 1.9} />
          <circle className="lev-core" cx={event.x} cy={event.y} r={event.r} />
          {event.tier === "hero" && (
            <text
              className="lev-label"
              x={event.x}
              y={event.labelBelow ? event.y + event.r + 1.6 : event.y - event.r - 0.6}
              textAnchor="middle"
            >
              {event.label}
            </text>
          )}
        </g>
      ))}
    </g>
  )
})
