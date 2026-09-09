"use client"

import { useState, type FormEvent, type ReactNode } from "react"
import type { SearchRequest } from "@/lib/api/types"
import type { ComparableCompanyRef, CompanyRecord, EvaluationProfile } from "@/lib/contracts/evaluation"

export type IntakePayload = {
  description: string
  audience: string
  stack: string[]
  budgetUsd: number | null
  windowFrom: string | null
  windowTo: string | null
  objective: SearchRequest["objective"]
  comparableCompanies: ComparableCompanyRef[]
}
const OBJECTIVES: { id: SearchRequest["objective"]; label: string }[] = [
  { id: "adoption", label: "Adopción" }, { id: "feedback", label: "Feedback técnico" },
  { id: "talent", label: "Contratación" }, { id: "awareness", label: "Visibilidad" },
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
  const [from, setFrom] = useState(initialProfile?.window.from ?? "")
  const [to, setTo] = useState(initialProfile?.window.to ?? "")
  const [objective, setObjective] = useState<SearchRequest["objective"] | null>(initialProfile ? initialProfile.objective.kind === "hiring" ? "talent" : initialProfile.objective.kind : null)
  const [comparables, setComparables] = useState<ComparableCompanyRef[]>(initialProfile?.comparableCompanies ?? [])
  const [companyName, setCompanyName] = useState("")
  const [review, setReview] = useState(false)
  const budget = budgetText.trim() === "" ? null : Number(budgetText)
  const valid = description.trim() && audience.trim() && objective && (budget === null || (Number.isFinite(budget) && budget >= 0)) && !(from && to && from > to)
  const payload = (): IntakePayload => ({ description: description.trim(), audience: audience.trim(), stack: stackText.split(",").map(s => s.trim()).filter(Boolean), budgetUsd: budget, windowFrom: from || null, windowTo: to || null, objective: objective!, comparableCompanies: comparables })
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
    <span className="eyebrow">Perfil de empresa · San Francisco</span>
    <h2 id="profile-title">{review ? "Revisá la interpretación" : "Qué construyen y a quién quieren llegar"}</h2>
    <p>La investigación usa tus factores explícitos. El objetivo comercial y su definición de éxito siguen pendientes de validación; no hay una política de inversión aprobada.</p>
    <form onSubmit={submit}>
      {review ? <div className="research-review" data-testid="profile-review">
        <dl>
          <dt>Producto</dt><dd>{description}</dd><dt>Audiencia</dt><dd>{audience}</dd>
          <dt>Stack</dt><dd>{stackText || "Sin declarar"}</dd>
          <dt>Objetivo propuesto</dt><dd>{OBJECTIVES.find(o => o.id === objective)?.label}</dd>
          <dt>Presupuesto</dt><dd>{budget === null ? "Desconocido" : `${budget} USD`}</dd>
          <dt>Fechas</dt><dd>{from || "Inicio pendiente"} → {to || "Fin pendiente"}</dd>
          <dt>Empresas de referencia</dt><dd>{comparables.length ? comparables.map(c => `${c.name} · ${c.relation} · ${c.confirmation}${c.companyId ? ` · ${c.companyId}` : " · identidad sin vincular"}`).join("; ") : "Ninguna indicada"}</dd>
        </dl>
        <p>Se buscarán coincidencias documentadas de tema/stack, audiencia o empresas cuya identidad confirmaste. La presencia de una empresa no demuestra éxito comercial.</p>
        <button className="research-button" type="button" onClick={() => setReview(false)} disabled={busy}>Corregir interpretación</button>
      </div> : <>
        <label htmlFor="intake-description">Producto</label>
        <textarea id="intake-description" rows={3} value={description} onChange={e => setDescription(e.target.value)} required />
        <label htmlFor="intake-audience">Audiencia</label>
        <input id="intake-audience" value={audience} onChange={e => setAudience(e.target.value)} required />
        <label htmlFor="intake-stack">Stack y temas (separados por comas)</label>
        <input id="intake-stack" value={stackText} onChange={e => setStackText(e.target.value)} placeholder="python, agents, typescript" />
        <div className="research-fields">
          <div><label htmlFor="intake-budget">Presupuesto (USD)</label><input id="intake-budget" type="number" min="0" step="any" placeholder="Vacío = desconocido" value={budgetText} onChange={e => setBudgetText(e.target.value)} /></div>
          <div><label htmlFor="intake-window-from">Desde</label><input id="intake-window-from" type="date" max={to || undefined} value={from} onChange={e => setFrom(e.target.value)} /></div>
          <div><label htmlFor="intake-window-to">Hasta</label><input id="intake-window-to" type="date" min={from || undefined} value={to} onChange={e => setTo(e.target.value)} /></div>
        </div>
        <fieldset><legend>Objetivo que estás evaluando</legend><div className="research-actions">
          {OBJECTIVES.map(o => <button className="research-button" key={o.id} type="button" aria-pressed={objective === o.id} onClick={() => setObjective(o.id)}>{o.label}</button>)}
        </div></fieldset>
        <fieldset><legend>Empresas indicadas por vos</legend>
          <p>Indicá una empresa y confirmá su identidad si está en el catálogo. Los nombres parecidos no se vinculan automáticamente.</p>
          <label htmlFor="comparable-name">Nombre de empresa comparable</label>
          <div className="research-actions"><input id="comparable-name" value={companyName} onChange={e => setCompanyName(e.target.value)} /><button className="research-button" type="button" onClick={indicateCompany} disabled={!companyName.trim()}>Agregar empresa</button></div>
          {comparables.map((company, index) => <div className="research-comparable" key={index}>
            <strong>{company.name}</strong><span>{company.confirmation === "confirmed" ? "Identidad confirmada" : "Identidad sin vincular"}</span>
            <label>Relación<select aria-label={`Relación de ${company.name}`} value={company.relation} onChange={e => setComparables(comparables.map((c,i) => i === index ? { ...c, relation: e.target.value as ComparableCompanyRef['relation'] } : c))}><option value="comparable">Comparable</option><option value="competitor">Competidora indicada por mí</option></select></label>
            <label>Confirmar identidad del catálogo<select aria-label={`Identidad de ${company.name}`} value={company.companyId ?? ""} onChange={e => {
              const selected = companies.find(c => c.id === e.target.value)
              setComparables(comparables.map((c,i) => i === index ? { ...c, companyId: selected?.id ?? null, name: selected?.name ?? c.name, confirmation: selected ? "confirmed" : "indicated" } : c))
            }}><option value="">Sin vincular (no usar para matching)</option>{companies.map(c => <option key={c.id} value={c.id}>{c.name} · {c.id} · {c.websiteUrl ?? "sitio desconocido"}</option>)}</select></label>
            <button className="research-button" type="button" onClick={() => setComparables(comparables.filter((_,i) => i !== index))}>Quitar empresa</button>
          </div>)}
        </fieldset>
      </>}
      <button className="research-button research-primary" type="submit" disabled={!valid || busy}>{busy ? "Enviando perfil…" : review ? "Confirmar e investigar SF" : "Revisar interpretación"}</button>
    </form>{banner}
  </section>
}
