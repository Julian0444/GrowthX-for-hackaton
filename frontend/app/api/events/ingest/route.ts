// POST /api/events/ingest { url } → EventIngestResponse (§10, la demo técnica
// estrella). Fetch server-side de la página del evento; el parseo vive en
// lib/api/luma.ts. Ante cualquier falla devuelve extraction.status "failed"
// con warnings honestos — nunca datos inventados.

import { NextResponse } from "next/server"
import { parseLumaEvent } from "@/lib/api/luma"
import type { EventIngestResponse } from "@/lib/api/types"

// Solo Luma en esta demo — evita usar el endpoint como fetcher arbitrario.
const ALLOWED_HOSTS = new Set(["luma.com", "www.luma.com", "lu.ma", "www.lu.ma"])

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"

// HTTP 200 siempre: el resultado (incluida la falla) viaja en extraction.status
// — el cliente decide por el body y la consola de la demo queda limpia (el
// navegador loguea como error cualquier respuesta 4xx/5xx).
function failed(warnings: string[]): NextResponse {
  const body: EventIngestResponse = {
    event: null,
    extraction: { status: "failed", warnings, fieldsExtracted: [] },
  }
  return NextResponse.json(body)
}

export async function POST(request: Request) {
  let url = ""
  try {
    const body: unknown = await request.json()
    if (typeof body === "object" && body !== null && "url" in body && typeof body.url === "string") {
      url = body.url.trim()
    }
  } catch {
    // body inválido → url queda vacía
  }
  if (!url) return failed(["missing url in request body"])

  let target: URL
  try {
    target = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`)
  } catch {
    return failed(["invalid URL"])
  }
  if (!ALLOWED_HOSTS.has(target.hostname.toLowerCase())) {
    return failed(["only luma.com event URLs are supported in this demo"])
  }
  target.protocol = "https:"

  try {
    const page = await fetch(target.toString(), {
      headers: { "user-agent": BROWSER_UA, accept: "text/html" },
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(9000),
    })
    if (!page.ok) return failed([`event page responded ${page.status}`])
    const html = await page.text()
    return NextResponse.json(parseLumaEvent(html, target.toString(), new Date().toISOString()))
  } catch {
    return failed(["could not reach the event page (network error or timeout)"])
  }
}
