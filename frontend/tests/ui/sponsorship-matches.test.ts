import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { registerHooks } from "node:module"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import ts from "typescript"

import type { SponsorshipFitBand, SponsorshipMarketplaceItem } from "../../lib/contracts/sponsorship.ts"

// El test importa el componente real para comprobar sus ayudantes puros. Node
// elimina tipos, pero necesita transformar JSX y resolver imports sin extension.
const root = new URL("../../", import.meta.url).href
registerHooks({
  resolve(specifier, context, next) {
    const target = specifier.startsWith("@/") ? new URL(specifier.slice(2), root)
      : specifier.startsWith(".") && context.parentURL?.startsWith(root)
        ? new URL(specifier, context.parentURL) : null
    if (target && !/\.[a-z]+$/i.test(target.pathname)) {
      for (const extension of [".ts", ".tsx"]) {
        if (existsSync(fileURLToPath(`${target.href}${extension}`))) return next(`${target.href}${extension}`, context)
      }
    }
    return next(specifier, context)
  },
  load(url, context, next) {
    if (url.startsWith(root) && url.endsWith(".tsx")) {
      return {
        format: "module",
        shortCircuit: true,
        source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
          compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
        }).outputText,
      }
    }
    return next(url, context)
  },
})

function item(id: string, fit: SponsorshipFitBand | null): SponsorshipMarketplaceItem {
  return {
    opportunity: {
      contractVersion: "1",
      id,
      status: "open",
      organizerName: "Organizer",
      communityName: "Community",
      eventName: id,
      eventUrl: null,
      city: "San Francisco",
      timezone: "America/Los_Angeles",
      startsAt: null,
      audience: { description: "Developers", estimatedSize: null, evidenceStatus: "organizer_declared", sourceUrl: null },
      themes: ["agents"],
      formats: ["workshop"],
      packages: [],
      sponsorGoals: ["feedback"],
      notes: null,
      createdAt: "2026-09-15T00:00:00.000Z",
    },
    match: fit ? {
      contractVersion: "1",
      opportunityId: id,
      sponsorRunId: "run",
      fit,
      evidenceConfidence: "declared",
      reasons: [],
      gaps: [],
      recommendedActivation: { format: "workshop", packageId: null, trackTheme: null, rationale: "Review together." },
      measurementPlan: { objective: "feedback", primaryOutcome: "Useful feedback", metrics: [], attributionWindow: "30 days", privacyNote: "Ask consent.", caveat: "No causal ROI claim." },
    } : null,
    interest: null,
  }
}

test("matching normaliza listas sin repetir valores vacios", async () => {
  const { splitSponsorshipList } = await import("../../components/research-dashboard/sponsorship-matches.tsx")
  assert.deepEqual(splitSponsorshipList(" agents, infra, agents, ,tooling "), ["agents", "infra", "tooling"])
})

test("matching ordena por banda y conserva el orden de empates", async () => {
  const { sortSponsorshipItems } = await import("../../components/research-dashboard/sponsorship-matches.tsx")
  const sorted = sortSponsorshipItems([
    item("unmatched", null),
    item("potential-a", "potential"),
    item("strong", "strong"),
    item("limited", "limited"),
    item("potential-b", "potential"),
  ])
  assert.deepEqual(sorted.map(entry => entry.opportunity.id), ["strong", "potential-a", "potential-b", "limited", "unmatched"])
})

test("retry de publicacion conserva identidad aunque el id temporal del paquete cambie", async () => {
  const { sponsorshipPublicationSignature } = await import("../../components/research-dashboard/sponsorship-matches.tsx")
  const base = {
    idempotencyKey: "request-a",
    organizerName: "Organizer",
    communityName: "Community",
    eventName: "Agent Workshop",
    eventUrl: null,
    city: "San Francisco" as const,
    startsAt: null,
    audience: { description: "Developers", estimatedSize: 80, evidenceStatus: "organizer_declared" as const, sourceUrl: null },
    themes: ["agents"],
    formats: ["workshop" as const],
    packages: [{ id: "pkg-a", label: "Workshop", formats: ["workshop" as const], contribution: { kind: "cash" as const, amount: 3000, currency: "USD" }, includes: ["Mentor session"], trackAvailable: false }],
    sponsorGoals: ["feedback" as const],
    notes: null,
  }
  assert.equal(
    sponsorshipPublicationSignature(base),
    sponsorshipPublicationSignature({ ...base, idempotencyKey: "request-b", packages: [{ ...base.packages[0], id: "pkg-b" }] }),
  )
  assert.notEqual(sponsorshipPublicationSignature(base), sponsorshipPublicationSignature({ ...base, eventName: "Different event" }))
})

test("la interfaz conserva las advertencias de confianza y no-ROI", () => {
  const source = readFileSync(fileURLToPath(new URL("../../components/research-dashboard/sponsorship-matches.tsx", import.meta.url)), "utf8")
  const styles = readFileSync(fileURLToPath(new URL("../../components/research-dashboard/research-experience.css", import.meta.url)), "utf8")
  assert.match(source, /Organizer-declared/)
  assert.match(source, /does not guarantee ROI/i)
  assert.match(source, /do not predict ROI or authorize spend/i)
  assert.match(source, /trackAvailable && !formats\.includes\("hackathon_track"\)/)
  assert.match(styles, /grid-template-columns:\s*repeat\(3,minmax\(0,1fr\)\)/, "six mobile tabs use two rows instead of overflowing")
})
