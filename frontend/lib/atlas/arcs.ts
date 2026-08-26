import type { Opportunity } from "@/lib/api/types"
import { projectCity } from "./signal-layout.ts"

// Arcos de tinta results→ciudad (ticket 04 / plan M3). Geometría pura y
// determinista: mismo input → mismo path, redondeado a 1 decimal. Nada de
// Math.random()/Date.now() (regla transversal del plan §0: hydration).

// Origen por defecto cuando el usuario no compartió ubicación: San Francisco.
export const ARC_ORIGIN_FALLBACK: [number, number] = [-122.42, 37.77] // [lng, lat]

// Timing de la coreografía (ms desde el montaje del set de resultados):
// la cámara vuela 900ms (resultsFrame) → el primer arco arranca a los 950ms,
// 240ms entre arcos (por rank), cada arco tarda 900ms en dibujarse y su
// cometa arranca justo al terminar.
export const ARC_DELAY_MS = 950
export const ARC_STAGGER_MS = 240
export const ARC_DRAW_MS = 900
export const COMET_DUR_S = 2.8

export type Arc = {
  id: string
  // Posición en el orden de rank (0 = rank 1): define el escalonado.
  order: number
  // "M x0 y0Q cx cy x1 y1" en espacio canvas (980×560).
  d: string
  // Inicio del dibujado (animation-delay del path).
  delayMs: number
  // Inicio del cometa = fin del dibujado, en segundos (SMIL beginElementAt).
  cometBeginS: number
}

const round1 = (value: number) => Math.round(value * 10) / 10
const round3 = (value: number) => Math.round(value * 1000) / 1000

// Bézier cuadrática: control = punto medio + normal × (0.18 × dist, clamp 12–60).
// A esta escala es indistinguible del gran círculo y 10× más simple. La normal
// se elige hacia el norte (y negativa en SVG) para que todos los arcos "vuelen"
// hacia arriba; los verticales, hacia el este. Devuelve null si origen y
// destino coinciden (el usuario está en la ciudad resultado): no hay arco.
export function arcPath(from: [number, number], to: [number, number]): string | null {
  const [x0, y0] = from
  const [x1, y1] = to
  const dx = x1 - x0
  const dy = y1 - y0
  const dist = Math.hypot(dx, dy)
  if (dist < 1) return null
  let nx = dy / dist
  let ny = -dx / dist
  if (ny > 0 || (ny === 0 && nx < 0)) {
    nx = -nx
    ny = -ny
  }
  const bulge = Math.min(60, Math.max(12, 0.18 * dist))
  const cx = (x0 + x1) / 2 + nx * bulge
  const cy = (y0 + y1) / 2 + ny * bulge
  return `M${round1(x0)} ${round1(y0)}Q${round1(cx)} ${round1(cy)} ${round1(x1)} ${round1(y1)}`
}

export function arcOrigin(userLocation: [number, number] | null): [number, number] {
  const [lng, lat] = userLocation ?? ARC_ORIGIN_FALLBACK
  return projectCity(lng, lat)
}

// userLocation en [lng, lat] (mismo shape que el estado del shell) o null → SF.
export function buildArcs(userLocation: [number, number] | null, results: readonly Opportunity[]): Arc[] {
  const origin = arcOrigin(userLocation)
  const ranked = [...results].sort((a, b) => a.rank - b.rank)
  const arcs: Arc[] = []
  for (const opportunity of ranked) {
    const d = arcPath(origin, projectCity(opportunity.coordinates[0], opportunity.coordinates[1]))
    if (!d) continue
    const order = arcs.length
    const delayMs = ARC_DELAY_MS + ARC_STAGGER_MS * order
    arcs.push({ id: opportunity.id, order, d, delayMs, cometBeginS: round3((delayMs + ARC_DRAW_MS) / 1000) })
  }
  return arcs
}
