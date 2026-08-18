"use client"

import { memo, useMemo, type CSSProperties } from "react"
import type { Opportunity } from "@/lib/api/types"
import { buildAmbientClusters, buildResultClusters, type SignalCluster } from "@/lib/atlas/signal-layout"

const ClusterGroup = memo(function ClusterGroup({
  cluster,
  selected,
  dim,
  hint,
}: {
  cluster: SignalCluster
  selected: boolean
  dim: boolean
  hint: boolean
}) {
  const events = cluster.glyphs.filter((glyph) => glyph.kind === "event")
  const communities = cluster.glyphs.filter((glyph) => glyph.kind === "community")
  const companies = cluster.glyphs.filter((glyph) => glyph.kind === "company")

  return (
    <g className={`cluster${selected ? " selected" : ""}${dim ? " dim" : ""}${hint ? " hint" : ""}`}>
      {cluster.big && <circle className="halo" cx={cluster.x} cy={cluster.y} r={30} />}
      {cluster.shells.map((shell, shellIndex) => (
        <g key={shellIndex} className="shell dots">
          {shell.map((dot) =>
            dot.breathe ? (
              <circle
                key={dot.id}
                className="br"
                cx={dot.x}
                cy={dot.y}
                r={dot.r}
                fill="#111"
                opacity={dot.opacity}
                style={
                  {
                    "--o": dot.opacity,
                    "--dur": `${dot.breathe.duration}s`,
                    animationDelay: `${dot.breathe.delay}s`,
                  } as CSSProperties
                }
              />
            ) : (
              <circle key={dot.id} cx={dot.x} cy={dot.y} r={dot.r} fill="#111" opacity={dot.opacity} />
            ),
          )}
        </g>
      ))}
      {cluster.big && (
        <>
          <g className="glyph-events">
            {events.map((glyph) => (
              <path
                key={glyph.id}
                d={`M${glyph.x} ${Math.round((glyph.y - 1.1) * 10) / 10}l1.1 1.1-1.1 1.1-1.1-1.1Z`}
                fill="none"
                stroke="#111"
                strokeWidth={0.4}
                opacity={0.6}
              />
            ))}
          </g>
          <g className="glyph-comms">
            {communities.map((glyph) => (
              <circle
                key={glyph.id}
                cx={glyph.x}
                cy={glyph.y}
                r={glyph.kind === "community" ? glyph.r : 1}
                fill="none"
                stroke="#111"
                strokeWidth={0.35}
                opacity={0.5}
              />
            ))}
          </g>
          <g className="glyph-cos">
            {companies.map((glyph) => (
              <rect
                key={glyph.id}
                x={Math.round((glyph.x - 0.6) * 10) / 10}
                y={Math.round((glyph.y - 0.6) * 10) / 10}
                width={1.2}
                height={1.2}
                fill="none"
                stroke="#111"
                strokeWidth={0.4}
                opacity={0.55}
              />
            ))}
          </g>
        </>
      )}
    </g>
  )
})

export const SignalCloudLayer = memo(function SignalCloudLayer({
  view,
  results,
  selectedId,
  hintId,
  timeRange,
}: {
  view: "idle" | "analyzing" | "results" | "selected" | "campaign"
  // Los clusters de resultados nacen de la respuesta del backend — cualquier
  // ciudad del mundo. La textura ambiente es fija (estética del idle).
  results: readonly Opportunity[]
  selectedId: string | null
  hintId: string | null
  timeRange: string
}) {
  const ambient = useMemo(() => buildAmbientClusters(), [])
  const resultClusters = useMemo(() => buildResultClusters(results), [results])
  // Un hub ambiente pegado a un resultado se oculta: el cluster del resultado
  // es la versión "real" de esa zona (evita doble densidad).
  const visibleAmbient = useMemo(
    () =>
      ambient.filter((cluster) =>
        resultClusters.every(
          (result) => (result.x - cluster.x) ** 2 + (result.y - cluster.y) ** 2 > 400,
        ),
      ),
    [ambient, resultClusters],
  )
  const ranked = view !== "idle" && view !== "analyzing"
  // Durante el análisis las señales bajan a 0.42 (§5); la ventana 7D las deja en 0.7.
  const opacity = view === "analyzing" ? 0.42 : timeRange === "7d" ? 0.7 : 1

  return (
    <g className="signals" aria-hidden="true" pointerEvents="none" style={{ opacity }}>
      {visibleAmbient.map((cluster) => (
        <ClusterGroup
          key={cluster.id}
          cluster={cluster}
          selected={false}
          dim={ranked && cluster.big}
          hint={false}
        />
      ))}
      {resultClusters.map((cluster) => (
        <ClusterGroup
          key={cluster.id}
          cluster={cluster}
          selected={cluster.id === selectedId}
          dim={false}
          hint={cluster.id === hintId}
        />
      ))}
    </g>
  )
})
