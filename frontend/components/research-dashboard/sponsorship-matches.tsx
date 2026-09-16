"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { ArrowRight, Check, ClipboardCheck, Plus, RefreshCw, ShieldCheck } from "lucide-react"

import type {
  SponsorshipAudience,
  SponsorshipEvidenceConfidence,
  SponsorshipFitBand,
  SponsorshipFormat,
  SponsorshipGoal,
  SponsorshipMarketplaceItem,
  SponsorshipMarketplaceResponse,
  SponsorshipOpportunityCreateBody,
} from "../../lib/contracts/sponsorship"
import {
  fetchSponsorshipMarketplace,
  publishSponsorshipOpportunity,
  requestSponsorshipIntroduction,
} from "../../lib/api/sponsorship-client"

const FORMAT_OPTIONS: { value: SponsorshipFormat; label: string }[] = [
  { value: "hackathon_track", label: "Hackathon track" },
  { value: "workshop", label: "Workshop" },
  { value: "demo", label: "Product demo" },
  { value: "dinner", label: "Dinner" },
  { value: "booth", label: "Booth" },
]

const GOAL_OPTIONS: { value: SponsorshipGoal; label: string }[] = [
  { value: "adoption", label: "Product adoption" },
  { value: "feedback", label: "Developer feedback" },
  { value: "hiring", label: "Hiring" },
  { value: "awareness", label: "Awareness" },
]

const FIT_LABEL: Record<SponsorshipFitBand, string> = {
  strong: "Strong fit",
  potential: "Potential fit",
  limited: "Limited fit",
}

const CONFIDENCE_LABEL: Record<SponsorshipEvidenceConfidence, string> = {
  verified: "Audience source-linked",
  declared: "Audience declared",
  limited: "Audience evidence limited",
}

const AUDIENCE_EVIDENCE_LABEL: Record<SponsorshipAudience["evidenceStatus"], string> = {
  source_verified: "Source-supported",
  organizer_declared: "Organizer-declared",
  estimated: "Estimated",
}

export function splitSponsorshipList(value: string): string[] {
  return [...new Set(value.split(",").map(item => item.trim()).filter(Boolean))]
}

export function sponsorshipPublicationSignature(body: SponsorshipOpportunityCreateBody): string {
  return JSON.stringify({
    ...body,
    idempotencyKey: "",
    packages: body.packages.map(item => ({ ...item, id: "" })),
  })
}

export function sortSponsorshipItems(items: SponsorshipMarketplaceItem[]): SponsorshipMarketplaceItem[] {
  const order: Record<SponsorshipFitBand, number> = { strong: 0, potential: 1, limited: 2 }
  return items.map((item, index) => ({ item, index })).sort((a, b) => {
    const left = a.item.match ? order[a.item.match.fit] : 3
    const right = b.item.match ? order[b.item.match.fit] : 3
    return left - right || a.index - b.index
  }).map(({ item }) => item)
}

function formatLabel(format: SponsorshipFormat): string {
  return FORMAT_OPTIONS.find(option => option.value === format)?.label ?? format
}

function goalLabel(goal: SponsorshipGoal): string {
  return GOAL_OPTIONS.find(option => option.value === goal)?.label ?? goal
}

function eventDate(value: string | null): string {
  if (!value) return "Date to confirm"
  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) return "Date to confirm"
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Los_Angeles",
  }).format(date)
}

function contributionLabel(item: SponsorshipMarketplaceItem["opportunity"]["packages"][number]): string {
  return item.contribution.kind === "cash"
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: item.contribution.currency, maximumFractionDigits: 0 }).format(item.contribution.amount)
    : item.contribution.description
}

interface SponsorshipMatchesProps {
  sponsorRunId: string | null
  onCreateBrief: () => void
}

type Screen = "sponsor" | "organizer"

export function SponsorshipMatches({ sponsorRunId, onCreateBrief }: SponsorshipMatchesProps) {
  const [screen, setScreen] = useState<Screen>("sponsor")
  const [marketplace, setMarketplace] = useState<SponsorshipMarketplaceResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [interestBusy, setInterestBusy] = useState<string | null>(null)
  const [interestError, setInterestError] = useState<Record<string, string>>({})
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [publishSuccess, setPublishSuccess] = useState<string | null>(null)
  const [evidenceStatus, setEvidenceStatus] = useState<SponsorshipAudience["evidenceStatus"]>("organizer_declared")
  const [contributionKind, setContributionKind] = useState<"cash" | "in_kind">("cash")
  const [formVersion, setFormVersion] = useState(0)
  const loadSequence = useRef(0)
  const interestKeys = useRef<Record<string, string>>({})
  const publishSubmission = useRef<{ signature: string; idempotencyKey: string; packageId: string } | null>(null)

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current
    setLoading(true)
    setLoadError(null)
    const outcome = await fetchSponsorshipMarketplace(sponsorRunId)
    if (sequence !== loadSequence.current) return
    setLoading(false)
    if (outcome.status === "ok") setMarketplace(outcome.data)
    else setLoadError(outcome.message)
  }, [sponsorRunId])

  useEffect(() => {
    let cancelled = false
    const sequence = ++loadSequence.current
    void fetchSponsorshipMarketplace(sponsorRunId).then(outcome => {
      if (cancelled || sequence !== loadSequence.current) return
      setLoading(false)
      if (outcome.status === "ok") { setMarketplace(outcome.data); setLoadError(null) }
      else setLoadError(outcome.message)
    })
    return () => { cancelled = true }
  }, [sponsorRunId])

  const items = useMemo(
    () => sortSponsorshipItems(marketplace?.opportunities ?? []),
    [marketplace],
  )

  async function requestIntroduction(item: SponsorshipMarketplaceItem) {
    if (!sponsorRunId || item.interest || interestBusy) return
    const submissionId = `${sponsorRunId}:${item.opportunity.id}`
    const idempotencyKey = interestKeys.current[submissionId] ?? crypto.randomUUID()
    interestKeys.current[submissionId] = idempotencyKey
    setInterestBusy(item.opportunity.id)
    setInterestError(current => ({ ...current, [item.opportunity.id]: "" }))
    const outcome = await requestSponsorshipIntroduction(item.opportunity.id, {
      idempotencyKey,
      sponsorRunId,
      message: null,
      activation: null,
    })
    setInterestBusy(null)
    if (outcome.status !== "ok") {
      setInterestError(current => ({ ...current, [item.opportunity.id]: outcome.message }))
      return
    }
    delete interestKeys.current[submissionId]
    setMarketplace(current => current ? {
      ...current,
      opportunities: current.opportunities.map(entry => entry.opportunity.id === item.opportunity.id
        ? { ...entry, interest: outcome.data }
        : entry),
    } : current)
  }

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (publishing) return
    const form = event.currentTarget
    const data = new FormData(form)
    const formats = data.getAll("formats").filter((value): value is SponsorshipFormat => typeof value === "string")
    const sponsorGoals = data.getAll("sponsorGoals").filter((value): value is SponsorshipGoal => typeof value === "string")
    if (!formats.length || !sponsorGoals.length) {
      setPublishError("Select at least one activation format and one sponsor goal.")
      return
    }
    const audienceSource = String(data.get("audienceSource") ?? "").trim()
    if (evidenceStatus === "source_verified" && !audienceSource) {
      setPublishError("Add a public source URL before marking the audience as source-supported.")
      return
    }
    const startsAtValue = String(data.get("startsAt") ?? "").trim()
    const audienceSizeValue = String(data.get("audienceSize") ?? "").trim()
    const packageId = `pkg-${crypto.randomUUID()}`
    const includes = splitSponsorshipList(String(data.get("includes") ?? ""))
    const trackAvailable = data.get("trackAvailable") === "on"
    if (trackAvailable && !formats.includes("hackathon_track")) {
      setPublishError("Select Hackathon track before publishing a package with a dedicated track.")
      return
    }
    const draft: SponsorshipOpportunityCreateBody = {
      idempotencyKey: "",
      organizerName: String(data.get("organizerName") ?? "").trim(),
      communityName: String(data.get("communityName") ?? "").trim(),
      eventName: String(data.get("eventName") ?? "").trim(),
      eventUrl: String(data.get("eventUrl") ?? "").trim() || null,
      city: "San Francisco",
      startsAt: startsAtValue ? new Date(startsAtValue).toISOString() : null,
      audience: {
        description: String(data.get("audienceDescription") ?? "").trim(),
        estimatedSize: audienceSizeValue ? Number(audienceSizeValue) : null,
        evidenceStatus,
        sourceUrl: audienceSource || null,
      },
      themes: splitSponsorshipList(String(data.get("themes") ?? "")),
      formats,
      packages: [{
        id: packageId,
        label: String(data.get("packageLabel") ?? "").trim(),
        formats,
        contribution: contributionKind === "cash"
          ? {
              kind: "cash",
              amount: Number(data.get("cashAmount")),
              currency: String(data.get("currency") ?? "USD").trim().toUpperCase(),
            }
          : {
              kind: "in_kind",
              description: String(data.get("inKindDescription") ?? "").trim(),
            },
        includes,
        trackAvailable,
      }],
      sponsorGoals,
      notes: String(data.get("notes") ?? "").trim() || null,
    }
    // El id del paquete también forma parte del payload idempotente. Se
    // excluye del fingerprint y se conserva junto con la clave para que un
    // retry real sea byte-a-byte equivalente al primer POST.
    const signature = sponsorshipPublicationSignature(draft)
    const previous = publishSubmission.current?.signature === signature
      ? publishSubmission.current
      : null
    const idempotencyKey = previous?.idempotencyKey ?? crypto.randomUUID()
    const stablePackageId = previous?.packageId ?? packageId
    publishSubmission.current = { signature, idempotencyKey, packageId: stablePackageId }
    const body = {
      ...draft,
      idempotencyKey,
      packages: draft.packages.map(item => ({ ...item, id: stablePackageId })),
    }
    setPublishing(true)
    setPublishError(null)
    setPublishSuccess(null)
    const outcome = await publishSponsorshipOpportunity(body)
    setPublishing(false)
    if (outcome.status !== "ok") {
      setPublishError(outcome.message)
      return
    }
    publishSubmission.current = null
    setPublishSuccess(`${outcome.data.eventName} is now visible as organizer-declared.`)
    setMarketplace(current => current ? {
      ...current,
      opportunities: [{ opportunity: outcome.data, match: null, interest: null }, ...current.opportunities],
    } : current)
    form.reset()
    setEvidenceStatus("organizer_declared")
    setContributionKind("cash")
    setFormVersion(value => value + 1)
    await load()
  }

  return <section className="sponsorship-matches" aria-labelledby="matches-title">
    <div className="matches-intro">
      <div>
        <span className="eyebrow">Concierge matching · MVP</span>
        <h2 id="matches-title">One brief, clearer sponsorship choices</h2>
        <p>Connect the audience and objective in your saved brief with open organizer opportunities. Every match keeps the supporting reasons, missing evidence and measurement plan visible.</p>
      </div>
      <div className="matches-principle"><ShieldCheck aria-hidden="true"/><p><strong>Decision support, not a promise.</strong> Fit bands do not predict ROI or authorize spend. A person still verifies the opportunity, terms and evidence.</p></div>
    </div>

    <div className="matches-switcher" role="tablist" aria-label="Sponsorship perspective">
      <button id="sponsor-matches-tab" type="button" role="tab" aria-controls="sponsor-matches-panel" aria-selected={screen === "sponsor"} onClick={() => setScreen("sponsor")}>I am a sponsor</button>
      <button id="organizer-matches-tab" type="button" role="tab" aria-controls="organizer-matches-panel" aria-selected={screen === "organizer"} onClick={() => setScreen("organizer")}>I am an organizer</button>
    </div>

    {screen === "sponsor" ? <div id="sponsor-matches-panel" role="tabpanel" aria-labelledby="sponsor-matches-tab" className="sponsor-panel">
      <div className="matches-heading-row">
        <div><h3>Open opportunities</h3><p>{sponsorRunId ? "Fit is derived from your most recent saved brief." : "Open opportunities are visible, but a saved brief is required to calculate fit and request an introduction."}</p></div>
        <button className="research-button" type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={14} aria-hidden="true"/> Refresh</button>
      </div>
      {!sponsorRunId && <div className="matches-callout"><div><strong>Create a sponsor brief to unlock matching</strong><p>Tell GrowthX who you want to reach, what outcome matters and which formats you can support.</p></div><button className="research-button research-primary" type="button" onClick={onCreateBrief}>Create brief <ArrowRight size={14} aria-hidden="true"/></button></div>}
      {loading && <p role="status">Reading open opportunities and their evidence…</p>}
      {loadError && <div className="research-notice" role="alert">{loadError}<button className="research-button" type="button" onClick={() => void load()}>Retry</button></div>}
      {!loading && !loadError && items.length === 0 && <div className="research-empty"><h3>No open opportunities yet</h3><p>Publish the first organizer opportunity or check again when the concierge team has added one.</p><button className="research-button" type="button" onClick={() => setScreen("organizer")}>Publish an opportunity</button></div>}
      {!loading && !loadError && items.length > 0 && <div className="match-grid">{items.map(item => <MatchCard key={item.opportunity.id} item={item} hasBrief={!!sponsorRunId} busy={interestBusy === item.opportunity.id} error={interestError[item.opportunity.id]} onRequest={() => void requestIntroduction(item)} />)}</div>}
    </div> : <div id="organizer-matches-panel" role="tabpanel" aria-labelledby="organizer-matches-tab" className="organizer-panel">
      <div className="matches-heading-row"><div><h3>Publish an opportunity</h3><p>This MVP uses assisted operations. Publishing records the organizer&apos;s declaration; it does not verify audience size, price, sponsorship history or availability.</p></div><span className="match-badge evidence-declared">Organizer-declared</span></div>
      <form key={formVersion} className="sponsorship-form" onSubmit={event => void publish(event)}>
        <fieldset><legend>Organizer and event</legend><div className="sponsorship-fields three-columns">
          <label>Organizer name<input name="organizerName" required autoComplete="organization" placeholder="Name or team"/></label>
          <label>Community<input name="communityName" required placeholder="e.g. AI Builders SF"/></label>
          <label>Event name<input name="eventName" required placeholder="e.g. Agent Systems Hackathon"/></label>
          <label>Public event URL <span>optional</span><input name="eventUrl" type="url" placeholder="https://…"/></label>
          <label>SF date and time <span>optional</span><input name="startsAt" type="datetime-local"/></label>
          <label>City<input value="San Francisco" readOnly aria-readonly="true"/></label>
        </div></fieldset>

        <fieldset><legend>Audience and evidence</legend><div className="sponsorship-fields">
          <label className="wide-field">Audience description<textarea name="audienceDescription" required rows={3} placeholder="Who usually participates? Include role, seniority and technical focus."/></label>
          <label>Estimated attendees <span>optional</span><input name="audienceSize" type="number" min="1" step="1" placeholder="120"/></label>
          <label>Evidence status<select name="evidenceStatus" value={evidenceStatus} onChange={event => setEvidenceStatus(event.target.value as SponsorshipAudience["evidenceStatus"])}><option value="organizer_declared">Organizer-declared</option><option value="estimated">Estimated</option><option value="source_verified">Supported by public source</option></select></label>
          <label className="wide-field">Audience source URL <span>{evidenceStatus === "source_verified" ? "required" : "optional"}</span><input name="audienceSource" type="url" required={evidenceStatus === "source_verified"} placeholder="Public page supporting the audience claim"/></label>
        </div></fieldset>

        <fieldset><legend>Fit and activation</legend><div className="sponsorship-fields">
          <label className="wide-field">Themes <span>comma-separated</span><input name="themes" required placeholder="AI agents, developer tools, infrastructure"/></label>
        </div><div className="choice-groups"><div><strong>Available formats</strong><div className="checkbox-grid">{FORMAT_OPTIONS.map(option => <label key={option.value}><input type="checkbox" name="formats" value={option.value}/>{option.label}</label>)}</div></div><div><strong>Sponsor goals this event can support</strong><div className="checkbox-grid">{GOAL_OPTIONS.map(option => <label key={option.value}><input type="checkbox" name="sponsorGoals" value={option.value}/>{option.label}</label>)}</div></div></div></fieldset>

        <fieldset><legend>First sponsorship package</legend><div className="sponsorship-fields three-columns">
          <label>Package label<input name="packageLabel" required placeholder="Developer track partner"/></label>
          <label>Contribution type<select value={contributionKind} onChange={event => setContributionKind(event.target.value as "cash" | "in_kind")}><option value="cash">Cash</option><option value="in_kind">In-kind</option></select></label>
          {contributionKind === "cash" ? <><label>Amount<input name="cashAmount" type="number" min="1" step="1" required placeholder="5000"/></label><label>Currency<input name="currency" defaultValue="USD" maxLength={3} required/></label></> : <label className="wide-field">In-kind contribution<input name="inKindDescription" required placeholder="API credits, mentors, prizes…"/></label>}
          <label className="wide-field">What it includes <span>comma-separated</span><input name="includes" required placeholder="Dedicated track, judge seat, opening remarks"/></label>
          <label className="checkbox-card"><input name="trackAvailable" type="checkbox"/><span><strong>Dedicated track available</strong><small>Sponsor product can have a distinct challenge and feedback loop.</small></span></label>
          <label className="wide-field">Notes <span>optional</span><textarea name="notes" rows={3} placeholder="Constraints, open questions or timing details"/></label>
        </div></fieldset>
        <div className="publish-footer"><p>By publishing, you confirm that these details are organizer-declared. GrowthX will keep unverified claims visibly labelled.</p><button className="research-button research-primary" type="submit" disabled={publishing}><Plus size={15} aria-hidden="true"/>{publishing ? "Publishing…" : "Publish opportunity"}</button></div>
        {publishError && <p className="form-message form-error" role="alert">{publishError}</p>}
        {publishSuccess && <p className="form-message form-success" role="status"><Check size={15} aria-hidden="true"/>{publishSuccess}</p>}
      </form>

      <div className="published-list"><div className="matches-heading-row"><div><h3>Published opportunities</h3><p>Current tenant-local inventory for concierge matching.</p></div></div>
        {loading && <p role="status">Reading published opportunities…</p>}
        {!loading && items.length === 0 && <p>No opportunities have been published.</p>}
        {!loading && items.length > 0 && items.map(({ opportunity }) => <article key={opportunity.id}><div><strong>{opportunity.eventName}</strong><span>{opportunity.communityName} · {eventDate(opportunity.startsAt)}</span></div><span className="match-badge evidence-declared">{AUDIENCE_EVIDENCE_LABEL[opportunity.audience.evidenceStatus]}</span></article>)}
      </div>
    </div>}
  </section>
}

function MatchCard({ item, hasBrief, busy, error, onRequest }: {
  item: SponsorshipMarketplaceItem
  hasBrief: boolean
  busy: boolean
  error?: string
  onRequest: () => void
}) {
  const { opportunity, match, interest } = item
  return <article className={`match-card${match ? ` fit-${match.fit}` : ""}`}>
    <header><div className="match-labels"><span className="match-badge evidence-declared">Organizer-declared</span>{match && <><span className={`match-badge fit-${match.fit}`}>{FIT_LABEL[match.fit]}</span><span className={`match-badge evidence-${match.evidenceConfidence}`}>{CONFIDENCE_LABEL[match.evidenceConfidence]}</span></>}</div><small>{eventDate(opportunity.startsAt)} · {opportunity.city}</small></header>
    <h3>{opportunity.eventName}</h3>
    <p className="match-community">{opportunity.communityName} · organized by {opportunity.organizerName}</p>
    {opportunity.eventUrl && <a className="research-link" href={opportunity.eventUrl} target="_blank" rel="noreferrer">Open public event page</a>}
    <div className="match-audience"><strong>Audience</strong><p>{opportunity.audience.description}{opportunity.audience.estimatedSize ? ` · about ${opportunity.audience.estimatedSize.toLocaleString("en-US")} attendees` : ""}</p><small>{AUDIENCE_EVIDENCE_LABEL[opportunity.audience.evidenceStatus]}{opportunity.audience.sourceUrl ? <> · <a href={opportunity.audience.sourceUrl} target="_blank" rel="noreferrer">open source</a></> : null}</small></div>
    <div className="match-tags" aria-label="Themes and formats">{opportunity.themes.map(theme => <span key={theme}>{theme}</span>)}{opportunity.formats.map(format => <span key={format}>{formatLabel(format)}</span>)}</div>

    {match ? <>
      <section className="match-reading"><h4>Why it may fit</h4><ul>{match.reasons.map((reason, index) => <li key={`${reason.kind}:${index}`}><strong>{reason.label}</strong><span>{reason.detail}</span></li>)}</ul></section>
      <section className="match-activation"><span className="eyebrow">Recommended activation</span><h4>{formatLabel(match.recommendedActivation.format)}{match.recommendedActivation.trackTheme ? ` · ${match.recommendedActivation.trackTheme}` : ""}</h4><p>{match.recommendedActivation.rationale}</p></section>
      {match.gaps.length > 0 && <details className="match-gaps"><summary>{match.gaps.length} item{match.gaps.length === 1 ? "" : "s"} to verify before committing</summary><ul>{match.gaps.map(gap => <li key={gap}>{gap}</li>)}</ul></details>}
      <details className="measurement-plan"><summary><ClipboardCheck size={15} aria-hidden="true"/> Measurement plan · {goalLabel(match.measurementPlan.objective)}</summary><p><strong>Primary outcome:</strong> {match.measurementPlan.primaryOutcome}</p><ul>{match.measurementPlan.metrics.map(metric => <li key={metric.id}><strong>{metric.label}</strong><span>{metric.definition}</span><small>{metric.collectionMethod} · {metric.timing}</small></li>)}</ul><p className="research-meta">Attribution: {match.measurementPlan.attributionWindow} {match.measurementPlan.privacyNote}</p><p className="measurement-caveat">{match.measurementPlan.caveat}</p></details>
    </> : <div className="match-no-reading"><p>Create a brief to see an explainable fit band, activation recommendation and measurement plan.</p></div>}

    <details className="match-packages"><summary>{opportunity.packages.length} sponsorship package{opportunity.packages.length === 1 ? "" : "s"}</summary>{opportunity.packages.map(pkg => <div key={pkg.id}><strong>{pkg.label}</strong><span>{contributionLabel(pkg)}</span><small>{pkg.includes.join(" · ") || "Inclusions to confirm"}{pkg.trackAvailable ? " · Dedicated track available" : ""}</small></div>)}</details>
    <footer><p>This fit does not guarantee ROI. Terms, availability and claims require human review.</p><button className="research-button research-primary" type="button" disabled={!hasBrief || !match || !!interest || busy} onClick={onRequest}>{interest ? <><Check size={15} aria-hidden="true"/> Introduction requested</> : busy ? "Sending request…" : <>Request introduction <ArrowRight size={14} aria-hidden="true"/></>}</button>{error && <p className="form-message form-error" role="alert">{error}</p>}</footer>
  </article>
}
