"use client"

import { memo, useCallback } from "react"
import { Marker } from "react-simple-maps"

export const OpportunityMarker = memo(function OpportunityMarker({
  id,
  name,
  rank,
  score,
  confidence,
  coordinates,
  selected,
  hovered,
  onSelect,
  onHover,
  registerNode,
}: {
  id: string
  name: string
  rank: number
  score: number
  confidence: number
  coordinates: [number, number]
  selected: boolean
  hovered: boolean
  onSelect: (id: string) => void
  onHover: (id: string | null) => void
  // La cámara aplica el counter-scale (scale 1/k) imperativamente en cada frame del vuelo;
  // por eso el transform NO se declara en JSX (React lo pisaría al re-renderizar).
  registerNode: (id: string, node: SVGGElement | null) => void
}) {
  const refCallback = useCallback(
    (node: SVGGElement) => {
      registerNode(id, node)
      return () => registerNode(id, null)
    },
    [registerNode, id],
  )
  const tagWidth = name.length * 6 + 46

  return (
    <Marker coordinates={coordinates}>
      <g
        ref={refCallback}
        className={`marker${selected ? " selected" : ""}${hovered ? " hover" : ""}`}
        role="button"
        tabIndex={0}
        aria-label={`${name}, ranked ${rank}, opportunity score ${score}, confidence ${confidence} percent`}
        onPointerEnter={() => onHover(id)}
        onPointerLeave={() => onHover(null)}
        onClick={(event) => {
          event.stopPropagation()
          onSelect(id)
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault()
            onSelect(id)
          }
        }}
      >
        <g className="inner">
          <circle className="hit" r={15} fill="transparent" />
          <circle className="halo-dot" r={9} />
          <circle className="ring" r={10.5} />
          <line className="lead" x1={7.4} y1={-7.4} x2={14} y2={-14} />
          <circle className="core" r={3} />
          <g className="rank-chip" transform="translate(6 -16)">
            <rect width={17} height={13} rx={6.5} />
            <text x={8.5} y={9.4} textAnchor="middle">
              {String(rank).padStart(2, "0")}
            </text>
          </g>
          <g className="tag" transform="translate(13 -25)">
            <rect width={tagWidth} height={22} rx={11} />
            <text className="t-name" x={10} y={14.5}>
              {name}
            </text>
            <text className="t-score" x={tagWidth - 10} y={14.5} textAnchor="end">
              {score}
            </text>
          </g>
        </g>
      </g>
    </Marker>
  )
})
