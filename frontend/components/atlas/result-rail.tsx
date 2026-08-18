"use client"

import { useEffect, useRef, type KeyboardEvent } from "react"
import type { Opportunity } from "@/lib/api/types"

const MOBILE_QUERY = "(max-width: 760px)"

// Rail inferior §5: hover resalta marcador y cluster SIN mover la cámara;
// las flechas ← → navegan entre items cuando el rail tiene foco.
// En mobile (§12) es un carrusel con scroll-snap: soltar el swipe sobre una
// card distinta cambia la selección, y la card activa se centra sola.
// Consume Opportunity (§10) — mismo tipo para backend real, fixtures y fallback.
export function ResultRail({
  results,
  selectedCityId,
  onSelect,
  onHover,
}: {
  results: readonly Opportunity[]
  selectedCityId: string | null
  onSelect: (id: string) => void
  onHover: (id: string | null) => void
}) {
  const railRef = useRef<HTMLDivElement>(null)
  // El scroll programático (centrar la card activa) también dispara onScroll:
  // solo los scrolls iniciados por un dedo pueden cambiar la selección.
  const swipingRef = useRef(false)
  const settleTimer = useRef<number | null>(null)
  const selectedRef = useRef(selectedCityId)
  const onSelectRef = useRef(onSelect)

  useEffect(() => {
    selectedRef.current = selectedCityId
    onSelectRef.current = onSelect
  }, [selectedCityId, onSelect])

  useEffect(() => {
    return () => {
      if (settleTimer.current !== null) window.clearTimeout(settleTimer.current)
    }
  }, [])

  // Mantiene la card activa centrada en el carrusel (no-op en desktop: sin overflow).
  useEffect(() => {
    const rail = railRef.current
    if (!rail || !selectedCityId || !window.matchMedia(MOBILE_QUERY).matches) return
    const item = rail.querySelector<HTMLButtonElement>(`[data-id="${CSS.escape(selectedCityId)}"]`)
    if (!item) return
    const left = item.offsetLeft - (rail.clientWidth - item.offsetWidth) / 2
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    rail.scrollTo({ left, behavior: reduced ? "auto" : "smooth" })
  }, [selectedCityId])

  const handleTouchStart = () => {
    swipingRef.current = true
  }

  const handleScroll = () => {
    if (!swipingRef.current || !window.matchMedia(MOBILE_QUERY).matches) return
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current)
    // El snap terminó cuando dejan de llegar eventos de scroll (~160ms de calma).
    settleTimer.current = window.setTimeout(() => {
      swipingRef.current = false
      const rail = railRef.current
      if (!rail) return
      // La posición de snap de cada card (align center) queda clampeada al rango
      // scrolleable — comparar contra eso, no contra el centro del viewport, o las
      // cards de los bordes nunca ganan.
      const maxScroll = rail.scrollWidth - rail.clientWidth
      let bestId: string | null = null
      let bestDistance = Infinity
      for (const item of rail.querySelectorAll<HTMLButtonElement>(".rail-item")) {
        const snapLeft = Math.min(
          maxScroll,
          Math.max(0, item.offsetLeft + item.offsetWidth / 2 - rail.clientWidth / 2),
        )
        const distance = Math.abs(snapLeft - rail.scrollLeft)
        if (distance < bestDistance) {
          bestDistance = distance
          bestId = item.dataset.id ?? null
        }
      }
      if (bestId && bestId !== selectedRef.current) onSelectRef.current(bestId)
    }, 160)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return
    const items = Array.from(railRef.current?.querySelectorAll<HTMLButtonElement>(".rail-item") ?? [])
    const index = items.indexOf(document.activeElement as HTMLButtonElement)
    if (index < 0) return
    event.preventDefault()
    const next = (index + (event.key === "ArrowRight" ? 1 : items.length - 1)) % items.length
    items[next]?.focus()
  }

  return (
    <div
      className="rail"
      ref={railRef}
      aria-label="Ranked markets"
      onKeyDown={handleKeyDown}
      onTouchStart={handleTouchStart}
      onScroll={handleScroll}
    >
      {results.map((opportunity) => (
        <button
          key={opportunity.id}
          type="button"
          data-id={opportunity.id}
          className={`rail-item${selectedCityId === opportunity.id ? " active" : ""}`}
          aria-label={`${opportunity.city}, ranked ${opportunity.rank}, opportunity score ${opportunity.score}`}
          onMouseEnter={() => onHover(opportunity.id)}
          onMouseLeave={() => onHover(null)}
          onClick={() => onSelect(opportunity.id)}
        >
          <span className="rk mono">{String(opportunity.rank).padStart(2, "0")}</span>
          <span className="nm">{opportunity.city}</span>
          {opportunity.distanceMiles != null && (
            <span className="dist mono">{`${opportunity.distanceMiles} mi`}</span>
          )}
          <span className="sc mono">{opportunity.score}</span>
        </button>
      ))}
    </div>
  )
}
