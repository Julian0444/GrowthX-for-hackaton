// Parser de páginas de evento de Luma (§10, POST /api/events/ingest).
// JSON-LD (application/ld+json, @type Event) identifica una página de evento;
// OG solo puede completar su nombre. Un título genérico (portada, calendario
// o página vacía) no prueba que exista un evento. Cada campo ausente queda
// como warning y baja la confidence (cobertura de campos).

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

function htmlAttributes(tag: string): Map<string, string> {
  const attributes = new Map<string, string>()
  for (const match of tag.matchAll(/([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g)) {
    attributes.set(match[1].toLowerCase(), match[2] ?? match[3] ?? match[4])
  }
  return attributes
}

function findJsonLdEvent(html: string): JsonRecord | null {
  const blocks = html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)
  for (const match of blocks) {
    if (htmlAttributes(match[1]).get("type")?.toLowerCase() !== "application/ld+json") continue
    let data: unknown
    try {
      data = JSON.parse(match[2])
    } catch {
      continue
    }
    const candidates: unknown[] = Array.isArray(data) ? data : [data]
    const root = asRecord(data)
    if (root && Array.isArray(root["@graph"])) candidates.push(...(root["@graph"] as unknown[]))
    for (const candidate of candidates) {
      const record = asRecord(candidate)
      const type = record?.["@type"]
      const types = Array.isArray(type) ? type : [type]
      if (record && types.some((value) => value === "Event" || value === "https://schema.org/Event" || value === "http://schema.org/Event")) return record
    }
  }
  return null
}

function ogContent(html: string, property: string): string | undefined {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attributes = htmlAttributes(match[0])
    if (attributes.get("property")?.toLowerCase() === `og:${property}`)
      return asString(attributes.get("content"))
  }
  return undefined
}

function mapAvailability(availability: string | undefined): string | undefined {
  if (!availability) return undefined
  const value = availability.replace(/^https?:\/\/schema\.org\//i, "")
  // Una oferta disponible también puede exigir aprobación del anfitrión.
  // InStock no documenta las condiciones de acceso de una persona/equipo.
  if (value === "SoldOut") return "sold_out"
  return undefined
}

export function parseLumaEvent(html: string, url: string, observedAt: string): EventIngestResponse {
  const warnings: string[] = []
  const ld = findJsonLdEvent(html)

  if (!ld) {
    return {
      event: null,
      extraction: {
        status: "failed",
        warnings: ["la página no publica datos estructurados de un evento; no se importa una página genérica como evento"],
        fieldsExtracted: [],
      },
    }
  }
  const name = asString(ld.name) ?? ogContent(html, "title")
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
  if (offer?.availability && !registrationStatus)
    warnings.push("La disponibilidad de entradas no confirma acceso abierto; aprobación, invitación y condiciones de inscripción quedan pendientes.")
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
