"use client"

import { researchQuestions } from "@/lib/research/brief-plan"
import { useState, type FormEvent, type ReactNode } from "react"
import type { SearchRequest } from "@/lib/api/types"
import type { ComparableCompanyRef, CompanyRecord, EvaluationProfile } from "@/lib/contracts/evaluation"

export type IntakePayload = {
  description: string
  audience: string
  stack: string[]
  budgetAmount: number | null
  currency: string
  audienceProfiles: string[]
  confirmation: EvaluationProfile["objective"]["confirmation"]
  successDefinition: EvaluationProfile["objective"]["successDefinition"]
  restrictions: string[]
  formats: string[]
  windowFrom: string | null
  windowTo: string | null
  objective: SearchRequest["objective"]
  comparableCompanies: ComparableCompanyRef[]
}
const OBJECTIVES: { id: SearchRequest["objective"]; label: string }[] = [
  { id: "adoption", label: "Adoption" }, { id: "feedback", label: "Technical feedback" },
  { id: "talent", label: "Hiring" }, { id: "awareness", label: "Awareness" },
]

export function OnboardingIntake({ onLaunch, banner, initialProfile, companies = [], busy = false }: {
  onLaunch: (payload: IntakePayload) => void
  banner?: ReactNode
  initialProfile?: EvaluationProfile
  companies?: CompanyRecord[]
  busy?: boolean
}) {
  const [description, setDescription] = useState(initialProfile?.product ?? "")
  const [audience, setAudience] = useState(initialProfile?.audience.description ?? "")
  const [stackText, setStackText] = useState(initialProfile?.stack.join(", ") ?? "")
  const [budgetText, setBudgetText] = useState(initialProfile?.budget.status === "declared" ? String(initialProfile.budget.amount) : "")
  const [currency, setCurrency] = useState(initialProfile?.budget.status === "declared" ? initialProfile.budget.currency : "USD")
  const [audienceProfilesText, setAudienceProfilesText] = useState(initialProfile?.audience.profiles.join(", ") ?? "")
  const [confirmation, setConfirmation] = useState<EvaluationProfile["objective"]["confirmation"]>(initialProfile?.objective.confirmation ?? "provisional")
  const [success, setSuccess] = useState(initialProfile?.objective.successDefinition.status === "defined" ? initialProfile.objective.successDefinition.text : "")
  const [restrictionsText, setRestrictionsText] = useState(initialProfile?.restrictions.join("\n") ?? "")
  const [formatsText, setFormatsText] = useState(initialProfile?.formats?.join(", ") ?? "")
  const [from, setFrom] = useState(initialProfile?.window.from ?? "")
  const [to, setTo] = useState(initialProfile?.window.to ?? "")
  const [objective, setObjective] = useState<SearchRequest["objective"] | null>(initialProfile ? initialProfile.objective.kind === "hiring" ? "talent" : initialProfile.objective.kind : null)
  const [comparables, setComparables] = useState<ComparableCompanyRef[]>(initialProfile?.comparableCompanies ?? [])
  const [companyName, setCompanyName] = useState("")
  const [review, setReview] = useState(false)
  const budget = budgetText.trim() === "" ? null : Number(budgetText)
  const valid = /^[A-Z]{3}$/.test(currency) && description.trim() && audience.trim() && objective && (budget === null || (Number.isFinite(budget) && budget >= 0)) && !(from && to && from > to)
  const payload = (): IntakePayload => ({ description: description.trim(), audience: audience.trim(), stack: stackText.split(",").map(s => s.trim()).filter(Boolean), budgetAmount: budget, currency, audienceProfiles: audienceProfilesText.split(",").map(s => s.trim()).filter(Boolean), confirmation, successDefinition: success.trim() ? { status: "defined", text: success.trim() } : { status: "pending" }, restrictions: restrictionsText.split("\n").map(s => s.trim()).filter(Boolean), formats: formatsText.split(",").map(s => s.trim()).filter(Boolean), windowFrom: from || null, windowTo: to || null, objective: objective!, comparableCompanies: comparables })
  const current = payload()
  const questions = objective ? researchQuestions({ product: current.description, audience: { description: current.audience, profiles: current.audienceProfiles }, stack: current.stack, budget: budget === null ? { status: 'unknown', note: null } : { status: 'declared', amount: budget, currency }, window: { from: from || null, to: to || null }, objective: { kind: objective === 'talent' ? 'hiring' : objective, confirmation, successDefinition: current.successDefinition }, restrictions: current.restrictions, formats: current.formats, comparableCompanies: comparables }) : []
  function submit(event: FormEvent) {
    event.preventDefault()
    if (!valid || busy) return
    if (!review) setReview(true)
    else onLaunch(payload())
  }
  function indicateCompany() {
    if (!companyName.trim()) return
    setComparables([...comparables, { companyId: null, name: companyName.trim(), relation: "comparable", confirmation: "indicated" }])
    setCompanyName("")
  }
  return <section className="research-profile" aria-labelledby="profile-title">
    <span className="eyebrow">Company brief · San Francisco</span>
    <h2 id="profile-title">{review ? "Review your brief" : "What do you build, and who is it for?"}</h2>
    <p>Your brief guides the research. A declared goal captures your intent; feasibility still needs evidence.</p>
    <form onSubmit={submit}>
      {review ? <div className="research-review" data-testid="profile-review">
        <dl>
          <dt>Product</dt><dd>{description}</dd><dt>Audience</dt><dd>{audience}</dd>
          <dt>Stack</dt><dd>{stackText || "Not declared"}</dd>
          <dt>Goal {confirmation === "confirmed" ? "declared" : "provisional"}</dt><dd>{OBJECTIVES.find(o => o.id === objective)?.label}</dd>
          <dt>Budget</dt><dd>{budget === null ? "Unknown" : `${budget} ${currency}`}</dd>
          <dt>Expected success</dt><dd>{success || "Pending"}</dd><dt>Formats</dt><dd>{formatsText || "Not declared"}</dd><dt>Constraints</dt><dd>{restrictionsText || "Not declared"}</dd><dt>City</dt><dd>San Francisco · America/Los_Angeles</dd>
          <dt>Dates</dt><dd>{from || "Start pending"} → {to || "End pending"}</dd>
          <dt>Reference companies</dt><dd>{comparables.length ? comparables.map(c => `${c.name} · ${c.relation} · ${c.confirmation}${c.companyId ? ` · ${c.companyId}` : " · Identity not linked"}`).join("; ") : "None indicated"}</dd>
        </dl>
        <p>Research looks for documented fit with your topics, audience and confirmed company identities. Company participation does not establish commercial success.</p>
        <button className="research-button" type="button" onClick={() => setReview(false)} disabled={busy}>Edit interpretation</button>
      </div> : <>
        <label htmlFor="intake-description">Product</label>
        <textarea id="intake-description" rows={3} value={description} onChange={e => setDescription(e.target.value)} required />
        <label htmlFor="intake-audience">Audience</label>
        <input id="intake-audience" value={audience} onChange={e => setAudience(e.target.value)} required />
        <label htmlFor="intake-segments">Audience segments (comma-separated)</label><input id="intake-segments" value={audienceProfilesText} onChange={e => setAudienceProfilesText(e.target.value)} />
        <label htmlFor="intake-stack">Stack and topics (comma-separated)</label>
        <input id="intake-stack" value={stackText} onChange={e => setStackText(e.target.value)} placeholder="python, agents, typescript" />
        <div className="research-fields">
          <div><label htmlFor="intake-budget">Participation budget</label><input id="intake-budget" type="number" min="0" step="any" placeholder="Leave blank if unknown" value={budgetText} onChange={e => setBudgetText(e.target.value)} /></div>
          <div><label htmlFor="intake-currency">Currency</label><input id="intake-currency" maxLength={3} pattern="[A-Z]{3}" value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())} required /></div>
          <div><label htmlFor="intake-window-from">From</label><input id="intake-window-from" type="date" max={to || undefined} value={from} onChange={e => setFrom(e.target.value)} /></div>
          <div><label htmlFor="intake-window-to">To</label><input id="intake-window-to" type="date" min={from || undefined} value={to} onChange={e => setTo(e.target.value)} /></div>
        </div>
        <fieldset><legend>What is your goal?</legend><div className="research-actions">
          {OBJECTIVES.map(o => <button className="research-button" key={o.id} type="button" aria-pressed={objective === o.id} onClick={() => setObjective(o.id)}>{o.label}</button>)}
        </div></fieldset>
        <label htmlFor="intake-confirmation">Goal status</label>
        <select id="intake-confirmation" value={confirmation} onChange={e => setConfirmation(e.target.value as typeof confirmation)}><option value="provisional">Provisional · to be defined</option><option value="confirmed">Declared by me</option></select>
        <label htmlFor="intake-success">Definition of success (optional)</label><textarea id="intake-success" rows={2} value={success} onChange={e => setSuccess(e.target.value)} />
        <label htmlFor="intake-city">City</label><select id="intake-city" defaultValue="San Francisco"><option>San Francisco</option></select><p>Dates use America/Los_Angeles.</p>
        <label htmlFor="intake-formats">Formats (comma-separated)</label><input id="intake-formats" value={formatsText} onChange={e => setFormatsText(e.target.value)} placeholder="hackathon, technical workshop, office hours" />
        <label htmlFor="intake-restrictions">Constraints (one per line)</label><textarea id="intake-restrictions" rows={3} value={restrictionsText} onChange={e => setRestrictionsText(e.target.value)} />
        <fieldset><legend>Companies you have in mind</legend>
          <p>Add a company and confirm its identity if it is in the catalog. Similar names are not automatically linked.</p>
          <label htmlFor="comparable-name">Comparable company name</label>
          <div className="research-actions"><input id="comparable-name" value={companyName} onChange={e => setCompanyName(e.target.value)} /><button className="research-button" type="button" onClick={indicateCompany} disabled={!companyName.trim()}>Add company</button></div>
          {comparables.map((company, index) => <div className="research-comparable" key={index}>
            <strong>{company.name}</strong><span>{company.confirmation === "confirmed" ? "Identity confirmed" : "Identity not linked"}</span>
            <label>Relationship<select aria-label={`Relationship for ${company.name}`} value={company.relation} onChange={e => setComparables(comparables.map((c,i) => i === index ? { ...c, relation: e.target.value as ComparableCompanyRef['relation'] } : c))}><option value="comparable">Comparable</option><option value="competitor">Competitor indicated by me</option></select></label>
            <label>Confirm catalog identity<select aria-label={`Identity of ${company.name}`} value={company.companyId ?? ""} onChange={e => {
              const selected = companies.find(c => c.id === e.target.value)
              setComparables(comparables.map((c,i) => i === index ? { ...c, companyId: selected?.id ?? null, name: selected?.name ?? c.name, confirmation: selected ? "confirmed" : "indicated" } : c))
            }}><option value="">Not linked (not used for matching)</option>{companies.map(c => <option key={c.id} value={c.id}>{c.name} · {c.id} · {c.websiteUrl ?? "Website unknown"}</option>)}</select></label>
            <button className="research-button" type="button" onClick={() => setComparables(comparables.filter((_,i) => i !== index))}>Remove company</button>
          </div>)}
        </fieldset>
      </>}
      {questions.length > 0 && <section aria-label="Research questions" data-testid="brief-questions"><h3>Questions guiding the research</h3><ol>{questions.map(q => <li key={q.id}>{q.text}</li>)}</ol><p>These questions guide source discovery. Event details are shown after their sources have been read.</p><p>Your participation budget is separate from the research provider limits. Availability and actual consumption appear in the research details.</p></section>}
      <button className="research-button research-primary" type="submit" disabled={!valid || busy}>{busy ? "Saving brief…" : review ? "Confirm and research SF" : "Review brief"}</button>
    </form>{banner}
  </section>
}
