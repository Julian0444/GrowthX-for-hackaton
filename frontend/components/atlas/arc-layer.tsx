"use client"

import { memo, useLayoutEffect, useMemo, useRef, type AnimationEvent, type CSSProperties } from "react"
import { useReducedMotion } from "@/hooks/use-reduced-motion"
import type { Opportunity } from "@/lib/api/types"
import { ARC_DELAY_MS, buildArcs, COMET_DUR_S, type Arc } from "@/lib/atlas/arcs"

// Largo de la cola del cometa en unidades del canvas (se normaliza por arco).
const TAIL_UNITS = 22

// Al terminar de dibujarse, el arco suelta los dashes y pasa a
// non-scaling-stroke (ver CSS): mutación directa del DOM, sin estado de React.
function markDrawn(event: AnimationEvent<SVGPathElement>) {
  event.currentTarget.classList.add("drawn")
}

// Capa de arcos results→ciudad (ticket 04 / plan M3). Monta solo en
// results/selected/campaign (gate en world-map.tsx). Vive DENTRO del grupo de
// cámara: las coordenadas son del canvas y escalan con el zoom.
//
// Cero JS por frame: el draw-in es una animación CSS con delay por rank y los
// cometas son SMIL (animateMotion + animate de stroke-dashoffset). El único JS
// corre una vez por set de resultados en el useLayoutEffect: mide el largo real
// de cada arco (cola del cometa), arranca los cometas con beginElementAt —
// `begin="Ns"` estático sería relativo al inicio del documento, no al montaje —
// y captura la escala pantalla/canvas al terminar el vuelo para que el trazo
// mida 1px mientras se dibuja.
export const ArcLayer = memo(function ArcLayer({
  results,
  selectedId,
  userLocation,
}: {
  results: readonly Opportunity[]
  selectedId: string | null
  userLocation: [number, number] | null
}) {
  const arcs = useMemo(() => buildArcs(userLocation, results), [userLocation, results])
  const groupRef = useRef<SVGGElement | null>(null)
  // id → d ya coreografiado: un refresh silencioso (SEARCH_REFRESHED) con los
  // mismos arcos no reinicia nada; solo los arcos nuevos o movidos arrancan.
  const startedRef = useRef(new Map<string, string>())
  const reducedMotion = useReducedMotion()

  useLayoutEffect(() => {
    const group = groupRef.current
    if (!group) return
    const byId = new Map<string, Arc>(arcs.map((arc) => [arc.id, arc]))
    for (const set of group.querySelectorAll<SVGGElement>(".arc-set")) {
      const id = set.dataset.id ?? ""
      const arc = byId.get(id)
      if (!arc || startedRef.current.get(id) === arc.d) continue
      startedRef.current.set(id, arc.d)
      const path = set.querySelector<SVGPathElement>(".arc")
      const trail = set.querySelector<SVGPathElement>(".arc-trail")
      const trailAnim = trail?.querySelector<SVGAnimationElement>("animate")
      if (!path || !trail || !trailAnim) continue
      // Medición única por arco. pathLength=1 normaliza los dashes, así que la
      // cola se expresa como fracción del arco.
      const length = path.getTotalLength()
      const tail = Math.min(0.5, TAIL_UNITS / Math.max(length, 1))
      trail.setAttribute("stroke-dasharray", `${tail} 1`)
      trail.setAttribute("stroke-dashoffset", String(tail))
      trailAnim.setAttribute("from", String(tail))
      trailAnim.setAttribute("to", "-1")
      if (reducedMotion) continue
      for (const anim of set.querySelectorAll<SVGAnimationElement>("animate, animateMotion, set")) {
        anim.beginElementAt(arc.cometBeginS)
      }
    }

    // Escala pantalla/canvas (S × k): el trazo escala con la cámara mientras se
    // dibuja, así que su ancho se fija en calc(1px / --arc-a). Se toma al montar
    // (aproximada, la cámara está en vuelo) y de nuevo al terminar el vuelo.
    const captureScale = () => {
      const scale = group.getScreenCTM()?.a
      group.style.setProperty("--arc-a", String(scale && scale > 0 ? scale : 1))
    }
    captureScale()
    const timer = window.setTimeout(captureScale, ARC_DELAY_MS - 30)
    return () => window.clearTimeout(timer)
  }, [arcs, reducedMotion])

  return (
    <g ref={groupRef} className="arcs" aria-hidden="true">
      {arcs.map((arc) => (
        <g key={arc.id} className={`arc-set${arc.id === selectedId ? " to-selected" : ""}`} data-id={arc.id}>
          <path
            className="arc"
            d={arc.d}
            pathLength={1}
            style={{ "--delay": `${arc.delayMs}ms` } as CSSProperties}
            onAnimationEnd={markDrawn}
          />
          <path className="arc-trail" d={arc.d} pathLength={1}>
            <animate attributeName="stroke-dashoffset" dur={`${COMET_DUR_S}s`} repeatCount="indefinite" begin="indefinite" />
          </path>
          {/* visibility como ATRIBUTO (no CSS): el <set> SMIL solo puede pisar el
              atributo, y un CSS `visibility` le ganaría al valor animado. */}
          <g className="arc-comet" visibility="hidden">
            <set attributeName="visibility" to="visible" begin="indefinite" />
            <animateMotion dur={`${COMET_DUR_S}s`} repeatCount="indefinite" begin="indefinite" path={arc.d} />
            <circle className="glow" r={4.5} />
            <circle className="head" r={1.8} />
          </g>
        </g>
      ))}
    </g>
  )
})
