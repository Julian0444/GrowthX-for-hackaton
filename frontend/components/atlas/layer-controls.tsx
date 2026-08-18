"use client"

import { useEffect, useRef } from "react"
import { Layers } from "lucide-react"
import { LAYER_LABELS, type AtlasLayer, type TimeRange } from "@/lib/atlas-data"

export const LAYER_ORDER: AtlasLayer[] = ["demand", "events", "communities", "companies"]

const LAYER_GLYPHS: Record<AtlasLayer, string> = {
  demand: "·",
  events: "◆",
  communities: "◦",
  companies: "▪",
}

const WINDOWS: TimeRange[] = ["7d", "30d", "90d"]

export function LayerControls({
  layers,
  onToggleLayer,
  timeRange,
  onTimeRangeChange,
  open,
  onOpenChange,
}: {
  layers: AtlasLayer[]
  onToggleLayer: (layer: AtlasLayer) => void
  timeRange: TimeRange
  onTimeRangeChange: (range: TimeRange) => void
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDocumentClick = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) onOpenChange(false)
    }
    document.addEventListener("click", onDocumentClick)
    return () => document.removeEventListener("click", onDocumentClick)
  }, [open, onOpenChange])

  return (
    <div ref={wrapRef} className={`layers-wrap${open ? " open" : ""}`}>
      <button
        className="layers-btn"
        type="button"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
      >
        <Layers size={14} strokeWidth={1.7} aria-hidden="true" />
        Layers
      </button>
      {/* inert: cerrado es invisible (opacity 0) pero sin esto seguía en el tab order */}
      <div className="layers-pop" inert={!open}>
        {LAYER_ORDER.map((layer) => {
          const on = layers.includes(layer)
          return (
            <button
              key={layer}
              type="button"
              className={`layer-row${on ? " on" : ""}`}
              aria-pressed={on}
              onClick={() => onToggleLayer(layer)}
            >
              <span className="glyph" aria-hidden="true">
                {LAYER_GLYPHS[layer]}
              </span>
              {LAYER_LABELS[layer]}
              <span className="sw" aria-hidden="true" />
            </button>
          )
        })}
        <div className="pop-divider" />
        <div className="window-row">
          <span className="lbl">Window</span>
          <div className="opts">
            {WINDOWS.map((range) => (
              <button
                key={range}
                type="button"
                className={timeRange === range ? "on" : undefined}
                onClick={() => onTimeRangeChange(range)}
              >
                {range.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
