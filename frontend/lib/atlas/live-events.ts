import sfEvents from "@/data/seed/sf-events.json"
import nycEvents from "@/data/seed/nyc-events.json"
import { hashSeed, projectCity } from "./signal-layout"

// Capa "mundo vivo" (plan M2 / ticket 03): los 136 eventos reales de SF + NYC
// ingeridos de Luma. TODO se calcula en scope de módulo y es determinista
// (hash del id, sin Math.random/Date.now) → server y cliente renderizan
// exactamente el mismo SVG, sin hydration mismatch.

type SeedEvent = {
  id: string
  name: string
  venueArea?: string
  lat: number
  lng: number
  expectedAttendance: number
}

export type LiveEventTier = "hero" | "base"

export type LiveEvent = {
  id: string
  name: string
  // Nombre acotado para el label a zoom profundo (≤34 chars, menos colisiones).
  label: string
  area: string
  x: number
  y: number
  r: number
  ringDelay: number
  ringDur: number
  tier: LiveEventTier
  // Alterna el lado del label (arriba/abajo) para reducir colisiones a zoom profundo.
  labelBelow: boolean
}

// Geometría honesta vs. legible: una ciudad entera mide ~0.25 unidades del canvas
// 980×560 (SF: 0.24×0.28, NYC: 0.25×0.52). Con MAX_ZOOM = 9 eso son ~4px en
// pantalla — los 64 eventos de SF caerían literalmente en el mismo pixel.
// Solución: cada evento se dibuja en el centroide REAL de su ciudad más su offset
// real amplificado ×SPREAD. La geografía relativa se preserva (SoMa sigue al
// sureste de Marina, Brooklyn al sureste de Midtown); a zoom mundo el cluster
// mide ~27 unidades (como un hub ambiente grande) y a zoom profundo se despliega.
const SPREAD = 110

const round1 = (value: number) => Math.round(value * 10) / 10
const round2 = (value: number) => Math.round(value * 100) / 100

// Escala log de asistencia → radio: 36 → 0.5, 500 → 1.6 (plan 2a, recalibrado:
// la capa escala con el zoom y a k=9 los radios del plan eran manchas de 40px).
function radiusFor(attendance: number): number {
  const a = Math.max(20, attendance)
  const t = Math.log(a / 36) / Math.log(500 / 36)
  return round2(Math.min(2, Math.max(0.45, 0.5 + t * 1.1)))
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]
}

function layoutCity(events: SeedEvent[]): LiveEvent[] {
  if (events.length === 0) return []
  const cx = events.reduce((sum, e) => sum + e.lng, 0) / events.length
  const cy = events.reduce((sum, e) => sum + e.lat, 0) / events.length
  const [centerX, centerY] = projectCity(cx, cy)
  return events.map((event) => {
    const [px, py] = projectCity(event.lng, event.lat)
    const seed = hashSeed(event.id)
    return {
      id: event.id,
      name: event.name,
      label: event.name.length > 34 ? `${event.name.slice(0, 33).trimEnd()}…` : event.name,
      area: event.venueArea ?? "",
      x: round1(centerX + (px - centerX) * SPREAD),
      y: round1(centerY + (py - centerY) * SPREAD),
      r: radiusFor(event.expectedAttendance),
      ringDelay: round2((seed % 8000) / 1000),
      ringDur: round2(3.4 + (hashSeed(`${event.id}d`) % 1800) / 1000),
      tier: "base",
      labelBelow: (seed >>> 3) % 2 === 0,
    }
  })
}

const SEED: SeedEvent[] = [...(sfEvents as SeedEvent[]), ...(nycEvents as SeedEvent[])]
const HERO_THRESHOLD = percentile(
  SEED.map((event) => event.expectedAttendance),
  0.75,
)

const byAttendance = new Map(SEED.map((event) => [event.id, event.expectedAttendance]))

export const LIVE_EVENTS: readonly LiveEvent[] = [
  ...layoutCity(sfEvents as SeedEvent[]),
  ...layoutCity(nycEvents as SeedEvent[]),
].map((event) => ({
  ...event,
  tier: (byAttendance.get(event.id) ?? 0) >= HERO_THRESHOLD ? "hero" : "base",
}))

export const LIVE_EVENT_COUNT = LIVE_EVENTS.length
export const LIVE_EVENT_HERO_COUNT = LIVE_EVENTS.filter((event) => event.tier === "hero").length
// Copy honesto (spec, decisión 3): 103 de los 136 ya ocurrieron — "ingested", nunca "live".
export const LIVE_EVENT_CHIP = `${LIVE_EVENT_COUNT} events ingested from Luma · SF + NYC`
