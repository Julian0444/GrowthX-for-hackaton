import { geoMercator } from "d3-geo"
import type { Opportunity } from "@/lib/api/types"

export const MAP_WIDTH = 980
export const MAP_HEIGHT = 560
export const PROJECTION_SCALE = 152
export const PROJECTION_CENTER: [number, number] = [12, 20]

// Textura ambiente de "señales en vivo" (§3): hubs developer globales. Es SOLO
// estética de fondo — los mercados rankeados llegan del backend con sus propias
// coordenadas y generan sus clusters en buildResultClusters().
const AMBIENT_HUBS: { lng: number; lat: number; weight: number; big?: boolean }[] = [
  { lng: -122.42, lat: 37.77, weight: 1, big: true },
  { lng: -99.13, lat: 19.43, weight: 0.7, big: true },
  { lng: -58.38, lat: -34.6, weight: 0.8, big: true },
  { lng: -46.63, lat: -23.55, weight: 0.85, big: true },
  { lng: 13.4, lat: 52.52, weight: 0.75, big: true },
  { lng: 77.59, lat: 12.97, weight: 1, big: true },
  { lng: -74.0, lat: 40.71, weight: 0.5 },
  { lng: -0.12, lat: 51.5, weight: 0.45 },
  { lng: 139.69, lat: 35.68, weight: 0.4 },
  { lng: 103.82, lat: 1.35, weight: 0.35 },
  { lng: 2.35, lat: 48.85, weight: 0.3 },
  { lng: 151.21, lat: -33.87, weight: 0.3 },
  { lng: 3.37, lat: 6.52, weight: 0.25 },
  { lng: 121.47, lat: 31.23, weight: 0.35 },
  { lng: 55.27, lat: 25.2, weight: 0.25 },
  { lng: -79.38, lat: 43.65, weight: 0.3 },
  { lng: -122.33, lat: 47.6, weight: 0.3 },
  { lng: -97.74, lat: 30.27, weight: 0.25 },
  { lng: -74.07, lat: 4.71, weight: 0.2 },
  { lng: 18.07, lat: 59.33, weight: 0.2 },
  { lng: 126.98, lat: 37.57, weight: 0.3 },
  { lng: 72.88, lat: 19.08, weight: 0.3 },
  { lng: 28.05, lat: -26.2, weight: 0.2 },
]

export type SignalDot = {
  id: string
  x: number
  y: number
  r: number
  opacity: number
  breathe: { duration: number; delay: number } | null
}

export type SignalGlyph =
  | { id: string; kind: "event"; x: number; y: number }
  | { id: string; kind: "community"; x: number; y: number; r: number }
  | { id: string; kind: "company"; x: number; y: number }

export type SignalCluster = {
  id: string
  x: number
  y: number
  big: boolean
  // 3 shells por distancia al centro, para animar la entrada con stagger por shell.
  shells: [SignalDot[], SignalDot[], SignalDot[]]
  glyphs: SignalGlyph[]
}

function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Semilla estable a partir del id del mercado (FNV-1a): el mismo resultado del
// backend produce siempre la misma nube — sin hydration mismatch ni "saltos".
function hashSeed(input: string): number {
  let hash = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function gaussian(rand: () => number) {
  let u = 0
  let v = 0
  while (u === 0) u = rand()
  while (v === 0) v = rand()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

const round1 = (value: number) => Math.round(value * 10) / 10
const round2 = (value: number) => Math.round(value * 100) / 100
const round6 = (value: number) => Math.round(value * 1_000_000) / 1_000_000

function buildCluster(id: string, x: number, y: number, strength: number, big: boolean, seed: number): SignalCluster {
  const rand = mulberry32(seed)
  const shells: [SignalDot[], SignalDot[], SignalDot[]] = [[], [], []]
  const count = big ? Math.round(130 * strength) : Math.round(26 * strength)
  const spread = big ? 13 : 8

  for (let i = 0; i < count; i += 1) {
    const tight = rand() < 0.62
    const dx = gaussian(rand) * (tight ? spread * 0.4 : spread)
    const dy = gaussian(rand) * (tight ? spread * 0.34 : spread * 0.8)
    const dist = Math.sqrt(dx * dx + dy * dy) / spread
    const falloff = Math.max(0.1, 1 - dist * 0.6)
    const opacity = Math.min(0.72, (0.12 + rand() * 0.5) * falloff * (big ? 1 : 0.55))
    const breathes = rand() < 0.09
    const dot: SignalDot = {
      id: `${id}-demand-${i}`,
      x: round1(x + dx),
      y: round1(y + dy),
      r: round2(0.5 + rand() * 0.9 * falloff),
      opacity: round2(opacity),
      breathe: breathes ? { duration: round1(5 + rand() * 6), delay: round1(rand() * 8) } : null,
    }
    shells[dist < 0.45 ? 0 : dist < 1 ? 1 : 2].push(dot)
  }

  const glyphs: SignalGlyph[] = []
  if (big) {
    for (let i = 0; i < 7; i += 1) {
      glyphs.push({ id: `${id}-event-${i}`, kind: "event", x: round1(x + gaussian(rand) * 6), y: round1(y + gaussian(rand) * 4.5) })
    }
    for (let i = 0; i < 5; i += 1) {
      glyphs.push({
        id: `${id}-community-${i}`,
        kind: "community",
        x: round1(x + gaussian(rand) * 7),
        y: round1(y + gaussian(rand) * 5),
        r: round1(0.9 + rand() * 0.7),
      })
    }
    for (let i = 0; i < 5; i += 1) {
      glyphs.push({ id: `${id}-company-${i}`, kind: "company", x: round1(x + gaussian(rand) * 6.5), y: round1(y + gaussian(rand) * 5) })
    }
  }

  return { id, x, y, big, shells, glyphs }
}

const projection = geoMercator()
  .scale(PROJECTION_SCALE)
  .center(PROJECTION_CENTER)
  .translate([MAP_WIDTH / 2, MAP_HEIGHT / 2])

export function projectCity(lng: number, lat: number): [number, number] {
  const point = projection([lng, lat])
  if (!point) return [0, 0]
  // V8 can serialize the last bit of d3's trigonometric projection slightly
  // differently between server and browser. Six decimals is far below a
  // visible SVG pixel and guarantees identical hydration attributes.
  return [round6(point[0]), round6(point[1])]
}

// Determinístico (RNG sembrado): idéntico en server y cliente, sin riesgo de hydration mismatch.
export function buildAmbientClusters(): SignalCluster[] {
  return AMBIENT_HUBS.map((hub, index) => {
    const [x, y] = projectCity(hub.lng, hub.lat)
    return buildCluster(`hub-${index}`, x, y, hub.big ? hub.weight : 0.55 + (index % 4) * 0.12, hub.big ?? false, 20260722 + Math.round(x * 7 + y * 13))
  })
}

// Cluster real de señales alrededor de la coordenada exacta del signal.
function clusterFromSignals(opportunity: Opportunity, x: number, y: number): SignalCluster {
  const shells: [SignalDot[], SignalDot[], SignalDot[]] = [[], [], []]
  const glyphs: SignalGlyph[] = []
  for (const signal of opportunity.signals) {
    const [sx, sy] = projectCity(signal.coordinates[0], signal.coordinates[1])
    if (signal.type === "demand") {
      const dist = Math.hypot(sx - x, sy - y) / 13
      shells[dist < 0.45 ? 0 : dist < 1 ? 1 : 2].push({
        id: signal.id,
        x: round1(sx),
        y: round1(sy),
        r: round2(0.5 + signal.intensity * 0.9),
        opacity: round2(Math.min(0.72, 0.15 + signal.intensity * 0.55)),
        breathe: null,
      })
    } else if (signal.type === "event") {
      glyphs.push({ id: signal.id, kind: "event", x: round1(sx), y: round1(sy) })
    } else if (signal.type === "community") {
      glyphs.push({ id: signal.id, kind: "community", x: round1(sx), y: round1(sy), r: round1(0.9 + signal.intensity * 0.7) })
    } else {
      glyphs.push({ id: signal.id, kind: "company", x: round1(sx), y: round1(sy) })
    }
  }
  return { id: opportunity.id, x, y, big: true, shells, glyphs }
}

// Clusters de los mercados devueltos por el backend — cualquier ciudad del
// mundo. Si el backend manda SignalPoints se usan sus coordenadas reales; si
// no, se sintetiza una nube proporcional al score (placeholder visual).
export function buildResultClusters(opportunities: readonly Opportunity[]): SignalCluster[] {
  return opportunities.map((opportunity) => {
    const [x, y] = projectCity(opportunity.coordinates[0], opportunity.coordinates[1])
    if (opportunity.signals.length > 0) return clusterFromSignals(opportunity, x, y)
    return buildCluster(opportunity.id, x, y, 0.6 + opportunity.score / 250, true, hashSeed(opportunity.id))
  })
}
