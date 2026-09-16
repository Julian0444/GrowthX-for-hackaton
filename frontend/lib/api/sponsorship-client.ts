import type {
  SponsorshipInterestCreateBody,
  SponsorshipInterestRequest,
  SponsorshipMarketplaceResponse,
  SponsorshipOpportunity,
  SponsorshipOpportunityCreateBody,
} from "../contracts/sponsorship"

export type SponsorshipApiOutcome<T> =
  | { status: "ok"; data: T }
  | { status: "unauthorized" | "invalid" | "conflict" | "unavailable"; message: string }

function messageFrom(value: unknown, fallback: string): string {
  if (typeof value !== "object" || value === null) return fallback
  const message = (value as { message?: unknown }).message
  return typeof message === "string" && message.trim() ? message : fallback
}

function failed<T>(status: number, data: unknown): SponsorshipApiOutcome<T> {
  const kind = status === 401
    ? "unauthorized"
    : status === 400
      ? "invalid"
      : status === 409
        ? "conflict"
        : "unavailable"
  return { status: kind, message: messageFrom(data, `The request failed (HTTP ${status}).`) }
}

export async function fetchSponsorshipMarketplace(
  sponsorRunId: string | null,
): Promise<SponsorshipApiOutcome<SponsorshipMarketplaceResponse>> {
  const query = sponsorRunId ? `?${new URLSearchParams({ runId: sponsorRunId })}` : ""
  try {
    const response = await fetch(`/api/sponsorships${query}`, { cache: "no-store" })
    const data: unknown = await response.json().catch(() => null)
    if (!response.ok) return failed(response.status, data)
    if (
      typeof data !== "object" ||
      data === null ||
      !Array.isArray((data as { opportunities?: unknown }).opportunities)
    ) {
      return { status: "unavailable", message: "The marketplace returned an unreadable response." }
    }
    return { status: "ok", data: data as SponsorshipMarketplaceResponse }
  } catch {
    return { status: "unavailable", message: "The sponsorship marketplace could not be reached." }
  }
}

export async function publishSponsorshipOpportunity(
  body: SponsorshipOpportunityCreateBody,
): Promise<SponsorshipApiOutcome<SponsorshipOpportunity>> {
  try {
    const response = await fetch("/api/sponsorships", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    })
    const data: unknown = await response.json().catch(() => null)
    if (!response.ok) return failed(response.status, data)
    const opportunity = typeof data === "object" && data !== null && "opportunity" in data
      ? (data as { opportunity: SponsorshipOpportunity }).opportunity
      : data as SponsorshipOpportunity
    if (!opportunity || typeof opportunity.id !== "string") {
      return { status: "unavailable", message: "The published opportunity could not be read." }
    }
    return { status: "ok", data: opportunity }
  } catch {
    return { status: "unavailable", message: "The opportunity could not be published." }
  }
}

export async function requestSponsorshipIntroduction(
  opportunityId: string,
  body: SponsorshipInterestCreateBody,
): Promise<SponsorshipApiOutcome<SponsorshipInterestRequest>> {
  try {
    const response = await fetch(`/api/sponsorships/${encodeURIComponent(opportunityId)}/interest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    })
    const data: unknown = await response.json().catch(() => null)
    if (!response.ok) return failed(response.status, data)
    const interest = typeof data === "object" && data !== null && "interest" in data
      ? (data as { interest: SponsorshipInterestRequest }).interest
      : data as SponsorshipInterestRequest
    if (!interest || typeof interest.id !== "string") {
      return { status: "unavailable", message: "The introduction request could not be read." }
    }
    return { status: "ok", data: interest }
  } catch {
    return { status: "unavailable", message: "The introduction request could not be sent." }
  }
}
