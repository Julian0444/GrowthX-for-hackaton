// Parser de páginas de evento de Luma (§10, POST /api/events/ingest).
// Estrategia: JSON-LD (application/ld+json, @type Event) primero — Luma lo
// publica completo —, OG meta como respaldo. Nada se inventa: cada campo
// ausente queda como warning y baja la confidence (cobertura de campos).

import type { EventIngestResponse, EventOpportunity } from "./types"

const TRACKED_FIELDS = [
  "name",
  "startsAt",
  "endsAt",
  "venue",
  "city",
  "coordinates",
  "organizer",
  "registrationStatus",
  "sponsors",
  "prizePool",
] as const

type JsonRecord = Record<string, unknown>

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as JsonRecord) : null
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function first(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value
}

function findJsonLdEvent(html: string): JsonRecord | null {
  const blocks = html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)
  for (const match of blocks) {
    let data: unknown
    try {
      data = JSON.parse(match[1])
    } catch {
      continue
    }
    const candidates: unknown[] = Array.isArray(data) ? data : [data]
    const root = asRecord(data)
    if (root && Array.isArray(root["@graph"])) candidates.push(...(root["@graph"] as unknown[]))
    for (const candidate of candidates) {
      const record = asRecord(candidate)
      const type = record?.["@type"]
      if (record && (type === "Event" || (Array.isArray(type) && type.includes("Event")))) return record
    }
  }
  return null
}

function ogContent(html: string, property: string): string | undefined {
  const match = new RegExp(`<meta[^>]*property="og:${property}"[^>]*content="([^"]*)"`, "i").exec(html)
  return match ? match[1] : undefined
}

function mapAvailability(availability: string | undefined): string | undefined {
  if (!availability) return undefined
  const value = availability.replace(/^https?:\/\/schema\.org\//i, "")
  if (value === "InStock") return "open"
  if (value === "SoldOut") return "sold_out"
  return value.toLowerCase()
}

export function parseLumaEvent(html: string, url: string, observedAt: string): EventIngestResponse {
  const warnings: string[] = []
  const ld = findJsonLdEvent(html)

  const name = asString(ld?.name) ?? ogContent(html, "title")
  if (!ld) warnings.push("no structured data (JSON-LD) on the page — fell back to OG meta")
  if (!name) {
    return {
      event: null,
      extraction: {
        status: "failed",
        warnings: [...warnings, "could not extract an event name"],
        fieldsExtracted: [],
      },
    }
  }

  const location = asRecord(first(ld?.location))
  const address = asRecord(location?.address)
  const geo = asRecord(location?.geo)
  const organizer = asRecord(first(ld?.organizer))
  const offer = asRecord(first(ld?.offers))

  const startsAt = asString(ld?.startDate)
  const endsAt = asString(ld?.endDate)
  const venue = asString(location?.name)
  const city = asString(address?.addressLocality)
  const latitude = asNumber(geo?.latitude)
  const longitude = asNumber(geo?.longitude)
  const coordinates: [number, number] | undefined =
    latitude !== undefined && longitude !== undefined ? [longitude, latitude] : undefined
  const organizerName = asString(organizer?.name)
  const registrationStatus = mapAvailability(asString(offer?.availability))

  if (!startsAt) warnings.push("start date not present in structured data")
  if (!city) warnings.push("location not published on the event page")
  // Luma no lista sponsors ni premios en su JSON-LD; extraerlos del texto libre
  // sería adivinar — se declara en lugar de inventar.
  warnings.push("sponsors not present in structured data")
  warnings.push("prize pool not present in structured data")

  const extractedByField: Record<(typeof TRACKED_FIELDS)[number], boolean> = {
    name: true,
    startsAt: startsAt !== undefined,
    endsAt: endsAt !== undefined,
    venue: venue !== undefined,
    city: city !== undefined,
    coordinates: coordinates !== undefined,
    organizer: organizerName !== undefined,
    registrationStatus: registrationStatus !== undefined,
    sponsors: false,
    prizePool: false,
  }
  const fieldsExtracted = TRACKED_FIELDS.filter((field) => extractedByField[field])
  // Confidence transparente: cobertura de campos extraídos, no un score inventado.
  const confidence = Math.round((100 * fieldsExtracted.length) / TRACKED_FIELDS.length)

  const slug = new URL(url).pathname.split("/").filter(Boolean).pop() ?? "event"
  const event: EventOpportunity = {
    id: `luma-${slug}`,
    name,
    url: asString(ld?.url) ?? url,
    startsAt: startsAt ?? "",
    endsAt,
    venue,
    city: city ?? "",
    coordinates,
    organizer: organizerName,
    sponsors: [],
    registrationStatus,
    // El scoring de relevancia contra la búsqueda es del backend real; 0 = sin
    // scorear (la UI no lo muestra).
    relevance: 0,
    confidence,
    source: {
      id: `luma-${slug}-src`,
      provider: "luma",
      url,
      title: name,
      observedAt,
      isEstimated: false,
    },
  }

  const coreComplete = startsAt !== undefined && city !== undefined
  return {
    event,
    extraction: {
      status: coreComplete ? "complete" : "partial",
      warnings,
      fieldsExtracted,
    },
  }
}
