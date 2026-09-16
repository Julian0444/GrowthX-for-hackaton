"use client"

import { englishSystemText } from "../../lib/research/english"
import { alternativeReason } from "../../lib/research/presentation"

import type { ResearchBriefInput } from "../../lib/contracts/evaluation"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { LayoutDashboard, Users, CalendarDays, Handshake, Bookmark, SlidersHorizontal } from "lucide-react"
import { OnboardingIntake, type IntakePayload } from "../atlas/onboarding-intake"
import { EventImport, INGEST_IDLE, type IngestUiState } from "../atlas/event-import"
import { comparisonResult, eventIngestResult, fetchCatalogEditions, fetchEditionDossier, fetchOrganizerDossier, fetchResearchHome, pollEvaluation, saveResearchOrganizer, startComparison, startEvaluation, startEventIngest, type EditionDossierRead, type EvaluationRunView, type OrganizerDossierRead, type EvaluationStartInput } from "../../lib/api/atlas-client"
import type { ResearchHome, SfResearchResult } from "./research-types"
import { EditionDossier, OrganizerDossier, ReasonSources } from "./research-dossier"
import { ComparisonPanel } from "./comparison-panel"
import { EvaluationList, evaluationHref, NO_FOCUS, parseEvaluationFocus, type EvaluationFocus } from "./evaluation-list"
import { ResearchEvents } from "./research-events"
import { runEditionDossiers } from "../../lib/research/run-editions"
import { latestEdition } from "./research-model"
import { projectComparisonResult, snapshotEditionDossiers, snapshotOrganizerDossier } from "../../lib/api/opportunity-adapter"

import type { ResearchPresentationState } from "../../lib/contracts/evaluation"
import { DISCOVERY_WORKFLOW } from "../../lib/contracts/discovery"
import { DiscoveryPanel } from "./discovery-panel"
import { BackgroundPanel } from "./background-panel"
import { SponsorshipMatches } from "./sponsorship-matches"
import { BACKGROUND_WORKFLOW, backgroundResult } from "../../lib/contracts/background"

import { ResearchBrief } from './research-brief'
import { ResearchProgress } from './research-progress'
import { EvidencePanel } from './evidence-panel'
import { RUN_LABELS as STATES, readableDate } from '../../lib/research/presentation'

type Section = 'Research' | 'Organizers' | 'Events' | 'Matches' | 'Decisions' | 'Brief'
const NAV = [{ label: 'Research', icon: LayoutDashboard }, { label: 'Organizers', icon: Users }, { label: 'Events', icon: CalendarDays }, { label: 'Matches', icon: Handshake }, { label: 'Decisions', icon: Bookmark }, { label: 'Brief', icon: SlidersHorizontal }] as const
// Workflow del run de importación Luma (ticket 11; ver lib/server/evaluations/luma-step.ts).
const LUMA_WORKFLOW = 'luma-ingest/1'
const failure = (status: string) => status === 'unauthorized' ? 'Sign in to access this research.' : status === 'missing' ? 'This research is not available to this session.' : 'The server could not be reached. Retry to recover the saved research.'

export function ResearchDashboard() {
  const [section, setSection] = useState<Section>('Research')
  const [home, setHome] = useState<ResearchHome | null>(null)
  const [catalog, setCatalog] = useState<EditionDossierRead[] | null>(null)
  const [run, setRun] = useState<EvaluationRunView | null>(null)
  const [runId, setRunId] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [presentation, setPresentation] = useState<ResearchPresentationState>({ runId: null, selectedEditionId: null, selectedEditionRevisionId: null })
  const [detail, setDetail] = useState<{ kind: 'edition'; data: EditionDossierRead } | { kind: 'organizer'; data: OrganizerDossierRead } | null>(null)
  const [detailBusy, setDetailBusy] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [ingest, setIngest] = useState<IngestUiState>(INGEST_IDLE)
  // Ticket 12: selección de candidatos para comparar (hasta 3, del catálogo).
  const [compareSelection, setCompareSelection] = useState<string[]>([])
  const [compareBusy, setCompareBusy] = useState(false)
  const compareSubmission = useRef<{ profileRunId: string; editionIds: string; idempotencyKey: string } | null>(null)
  // Ticket 14: la selección (decisión enfocada y vista de campaña) vive en la
  // URL junto al run (?run=&decision=&view=): cerrar la pestaña y volver por
  // el enlace interno o la lista recupera exactamente lo mismo desde
  // PostgreSQL. El filtro de la lista de evaluaciones es por identidad de
  // perfil y se conserva entre refrescos del historial.
  const [focus, setFocus] = useState<EvaluationFocus>(NO_FOCUS)
  const [evaluationFilter, setEvaluationFilter] = useState<string | null>(null)
  const evaluationFilterRef = useRef<string | null>(null)
  const [reevaluating, setReevaluating] = useState(false)
  const reevaluateSubmission = useRef<{ previousRunId: string; profile: string; idempotencyKey: string } | null>(null)
  const stop = useRef<(() => void) | null>(null)
  const content = useRef<HTMLElement>(null)
  const scrollToStart = () => content.current?.scrollTo({ top: 0, behavior: 'instant' })
  const readSequence = useRef(0)
  const detailSequence = useRef(0)
  const submission = useRef<EvaluationStartInput | null>(null)
  const ingestSubmission = useRef<{ url: string; profileRunId: string; idempotencyKey: string } | null>(null)
  // Solo se publica la investigación cuando el worker confirmó el run completo.
  const result = run?.state === 'completed' && run.result && typeof run.result === 'object' && 'kind' in run.result && run.result.kind === 'sf_organizer_research' ? run.result as SfResearchResult : null
  const savedComparison = comparisonResult(run)
  const isDiscovery = run?.workflowVersion === DISCOVERY_WORKFLOW
  const editions = useMemo(() => runId && !run ? [] : runEditionDossiers(run, catalog ?? []), [runId, run, catalog])


  const refreshHome = useCallback(async () => {
    const outcome = await fetchResearchHome({ profileId: evaluationFilterRef.current })
    if (outcome.status === 'ok') { setHome(outcome.data); return true }
    setNote(failure(outcome.status)); return false
  }, [])
  const refreshCatalog = useCallback(async () => {
    const list = await fetchCatalogEditions()
    if (list.status !== 'ok') { setNote(failure(list.status)); return }
    const reads = await Promise.all(list.data.editions.map(e => fetchEditionDossier(e.editionId)))
    if (reads.some(r => r.status !== 'ok')) { setNote('The full catalog could not be read. Retry the connection.'); return }
    setCatalog(reads.flatMap(r => r.status === 'ok' ? [r.data] : []))
  }, [])
  const openRun = useCallback((id: string, nextFocus: EvaluationFocus = NO_FOCUS) => {
    const seq = ++readSequence.current
    const detailSeq = ++detailSequence.current
    let restoreSection = true
    setPresentation({ runId: id, selectedEditionId: null, selectedEditionRevisionId: null }); setCompareSelection([])
    stop.current?.(); setRunId(id); setRun(null); setDetail(null); setDetailBusy(false); setNote(null); setFocus(nextFocus)
    window.history.replaceState(null, '', evaluationHref(id, nextFocus))
    stop.current = pollEvaluation(id, outcome => {
      if (readSequence.current !== seq) return
      if (outcome.status === 'ok') {
        // Abrir un enlace o una evaluación muestra su sección. Una lectura
        // demorada no puede devolver al usuario a ella después de navegar.
        if (restoreSection) {
          restoreSection = false
          if (detailSequence.current === detailSeq) setSection(outcome.run.workflowVersion === 'investment-comparison/1' ? 'Decisions' : [LUMA_WORKFLOW, BACKGROUND_WORKFLOW].includes(outcome.run.workflowVersion) ? 'Events' : 'Organizers')
        }
        setRun(current => {
          // Guardar es append-only: una lectura iniciada antes del POST no
          // puede retirar un guardado que el servidor ya confirmó.
          if (!current || current.runId !== outcome.run.runId) return outcome.run
          const saved = new Map(outcome.run.savedOrganizers.map(s => [s.organizerId, s]))
          for (const entry of current.savedOrganizers) if (!saved.has(entry.organizerId)) saved.set(entry.organizerId, entry)
          return { ...outcome.run, savedOrganizers: [...saved.values()] }
        }); setNote(null)
        if (outcome.run.state === 'completed' || outcome.run.state === 'failed') void refreshHome()
        // Import completada: el dossier ya vive en el catálogo persistido
        // del tenant; la lista de ediciones se relee desde PostgreSQL.
        if (outcome.run.state === 'completed' && (eventIngestResult(outcome.run) || backgroundResult(outcome.run.result))) void refreshCatalog()
      } else setNote(failure(outcome.status))
    })
  }, [refreshHome, refreshCatalog])
  useEffect(() => {
    let alive = true
    const reads = readSequence
    const details = detailSequence
    void (async () => {
      // Capturar la apertura del enlace antes de esperar el historial: una
      // navegación durante esa lectura también tiene prioridad sobre ella.
      const id = new URLSearchParams(window.location.search).get('run')
      if (id) openRun(id, parseEvaluationFocus(window.location.search))
      const outcome = await fetchResearchHome()
      if (!alive) return
      if (outcome.status === 'ok') setHome(outcome.data)
      else setNote(failure(outcome.status))
      const list = await fetchCatalogEditions()
      if (!alive) return
      if (list.status !== 'ok') { setNote(failure(list.status)); return }
      const reads = await Promise.all(list.data.editions.map(e => fetchEditionDossier(e.editionId)))
      if (!alive) return
      if (reads.some(r => r.status !== 'ok')) { setNote('The full catalog could not be read. Retry the connection.'); return }
      setCatalog(reads.flatMap(r => r.status === 'ok' ? [r.data] : []))
    })()
    return () => { alive = false; stop.current?.(); reads.current++; details.current++ }
  }, [openRun])
  // Entrar a Decisions relee la lista de evaluaciones guardadas (lectura por
  // identidad desde PostgreSQL; ninguna fuente externa ni recálculo).
  function navigate(next: Section) { detailSequence.current++; setDetail(null); setDetailBusy(false); setSection(next); scrollToStart(); if (next === 'Decisions') void refreshHome() }
  async function launch(payload: IntakePayload) {
    if (busy) return
    const body: EvaluationStartInput = { idempotencyKey: '', mode: 'catalog_research', researchScope: 'sf_discovery', ...(run && ['sf-organizers/1', DISCOVERY_WORKFLOW].includes(run.workflowVersion) ? { previousRunId: run.runId } : {}), profile: {
      product: payload.description, audienceDescription: payload.audience, audienceProfiles: payload.audienceProfiles, stack: payload.stack,
      budget: payload.budgetAmount === null ? { status: 'unknown' } : { status: 'declared', amount: payload.budgetAmount, currency: payload.currency },
      window: { from: payload.windowFrom, to: payload.windowTo }, objective: { kind: payload.objective === 'talent' ? 'hiring' : payload.objective, confirmation: payload.confirmation, successDefinition: payload.successDefinition }, restrictions: payload.restrictions, formats: payload.formats, geography: { city: 'San Francisco', timezone: 'America/Los_Angeles' }, comparableCompanies: payload.comparableCompanies,
    } }
    // Retry una aceptación incierta conserva la clave; editar crea otra.
    const previous = submission.current
    body.idempotencyKey = previous && JSON.stringify({ ...previous, idempotencyKey: '' }) === JSON.stringify(body) ? previous.idempotencyKey : crypto.randomUUID()
    submission.current = body; setBusy(true); setNote(null)
    const outcome = await startEvaluation(body)
    setBusy(false)
    if (outcome.status === 'accepted') { submission.current = null; openRun(outcome.runId); navigate('Organizers'); void refreshHome() }
    else setNote(outcome.message)
  }
  async function openEdition(id: string) {
    const seq = ++detailSequence.current
    const cached = (savedComparison ? snapshotEditionDossiers(savedComparison.bundle, {includeAntecedents:true}) : editions).find(e => e.editionId === id)
    if (cached) { setPresentation({ runId, selectedEditionId: id, selectedEditionRevisionId: latestEdition(cached).id }); setDetailBusy(false); setDetail({ kind: 'edition', data: cached }); return }
    if (savedComparison) { setNote('This edition is not included in the saved comparison.'); return }
    setDetailBusy(true)
    const outcome = await fetchEditionDossier(id)
    if (seq !== detailSequence.current) return
    setDetailBusy(false)
    if (outcome.status === 'ok') { setPresentation({ runId, selectedEditionId: id, selectedEditionRevisionId: latestEdition(outcome.data).id }); setDetail({ kind: 'edition', data: outcome.data }) }
    else setNote(failure(outcome.status))
  }
  async function openOrganizer(id: string) {
    const seq = ++detailSequence.current
    const cached = savedComparison ? snapshotOrganizerDossier(savedComparison.bundle, id) : result?.candidates.find(c => c.organizerId === id)?.dossier
    if (cached) { setDetailBusy(false); setDetail({ kind: 'organizer', data: cached }); return }
    setDetailBusy(true)
    if (savedComparison) { setDetailBusy(false); setNote('This organizer is not part of the saved comparison.'); return }
    const outcome = await fetchOrganizerDossier(id)
    if (seq !== detailSequence.current) return
    setDetailBusy(false)
    if (outcome.status === 'ok') setDetail({ kind: 'organizer', data: outcome.data })
    else setNote(failure(outcome.status))
  }
  async function save(id: string) {
    if (!run || run.state !== 'completed' || saving) return
    setSaving(id)
    const outcome = await saveResearchOrganizer(run.runId, id)
    setSaving(null)
    if (outcome.status === 'ok') { setRun(current => current && current.runId === outcome.data.runId ? { ...current, savedOrganizers: [...current.savedOrganizers.filter(s => s.organizerId !== id), outcome.data] } : current); void refreshHome() }
    else setNote('Could not save the organizer. ' + failure(outcome.status))
  }
  async function importUrl() {
    const url = ingest.url.trim()
    if (!url || ingest.request.status === 'loading') return
    // La importación pertenece a una investigación existente: reutiliza el
    // perfil del run abierto (o del más reciente); no se fabrica un perfil.
    const profileRunId = run?.runId ?? home?.runs[0]?.runId ?? null
    if (!profileRunId) {
      setIngest(current => ({ ...current, request: { status: 'error', message: 'Save your brief before importing an event. The import uses that saved brief.', retryable: false } }))
      return
    }
    // Retry una aceptación incierta conserva la clave idempotente; otra
    // URL u otra investigación crean otra (misma regla que launch).
    const previous = ingestSubmission.current
    const idempotencyKey = previous && previous.url === url && previous.profileRunId === profileRunId ? previous.idempotencyKey : crypto.randomUUID()
    ingestSubmission.current = { url, profileRunId, idempotencyKey }
    setIngest({ url, request: { status: 'loading', stage: 'accepting' }, runId: null })
    const outcome = await startEventIngest({ url, idempotencyKey, profileRunId })
    if (outcome.status === 'accepted') {
      ingestSubmission.current = null
      setIngest({ url, request: { status: 'success' }, runId: outcome.runId })
      // El progreso real (pasos persistidos) se sigue por el run; una recarga
      // con ?run= lo recupera aunque la pestaña se haya cerrado.
      openRun(outcome.runId)
    } else {
      setIngest({ url, request: { status: 'error', message: outcome.message, retryable: outcome.status !== 'invalid' }, runId: null })
    }
  }
  // Comparar candidatos seleccionados: run durable con snapshot oficial.
  // Reutiliza el perfil de la investigación abierta (o la más reciente); una
  // aceptación incierta conserva la clave idempotente, cambiar la selección
  // crea otra.
  async function compare() {
    if (compareBusy || compareSelection.length === 0) return
    const profileRunId = run?.runId ?? home?.runs[0]?.runId ?? null
    if (!profileRunId) {
      setNote('Save your brief before comparing events.')
      return
    }
    const editionIds = [...compareSelection].sort()
    const previous = compareSubmission.current
    const idempotencyKey = previous && previous.profileRunId === profileRunId && previous.editionIds === editionIds.join(',') ? previous.idempotencyKey : crypto.randomUUID()
    compareSubmission.current = { profileRunId, editionIds: editionIds.join(','), idempotencyKey }
    setCompareBusy(true); setNote(null)
    const outcome = await startComparison({ idempotencyKey, mode: 'investment_comparison', profileRunId, editionIds })
    setCompareBusy(false)
    if (outcome.status === 'accepted') { compareSubmission.current = null; openRun(outcome.runId) }
    else setNote(outcome.message)
  }
  function toggleCompare(editionId: string) {
    setCompareSelection(current => current.includes(editionId)
      ? current.filter(id => id !== editionId)
      : current.length >= 3 ? current : [...current, editionId])
  }
  // Cambio de selección dentro del run abierto (decisión enfocada / campaña):
  // se refleja en la URL para que el enlace interno la recupere.
  function changeFocus(next: EvaluationFocus) {
    setFocus(next)
    if (runId) window.history.replaceState(null, '', evaluationHref(runId, next))
    scrollToStart()
  }
  // Filtro explícito por identidad de perfil: relee la lista del servidor con
  // ?profileId= (no es una búsqueda por texto).
  async function filterEvaluations(profileId: string | null) {
    evaluationFilterRef.current = profileId
    setEvaluationFilter(profileId)
    const outcome = await fetchResearchHome({ profileId })
    if (outcome.status === 'ok') setHome(outcome.data)
    else setNote(failure(outcome.status))
  }
  // «Reevaluar» (ticket 14): acción explícita que crea OTRO run de
  // comparación vinculado a este (mismo perfil y mismo conjunto de ediciones;
  // el worker evalúa con las revisiones vigentes). El snapshot y la decisión
  // de este run no se tocan. Retry una aceptación incierta conserva la
  // clave idempotente; una nueva reevaluación explícita usa otra.
  async function reevaluate(profile?: ResearchBriefInput) {
    const current = comparisonResult(run)
    if (!run || !current || reevaluating) return
    const previous = reevaluateSubmission.current
    const idempotencyKey = previous && previous.previousRunId === run.runId && previous.profile === JSON.stringify(profile ?? null) ? previous.idempotencyKey : crypto.randomUUID()
    reevaluateSubmission.current = { previousRunId: run.runId, profile: JSON.stringify(profile ?? null), idempotencyKey }
    setReevaluating(true); setNote(null)
    const outcome = await startComparison({ idempotencyKey, mode: 'investment_comparison', profileRunId: run.runId, editionIds: [...current.availableCatalog.comparedEditionIds].sort(), previousRunId: run.runId, ...(profile ? {profile} : {}) })
    setReevaluating(false)
    if (outcome.status === 'accepted') { reevaluateSubmission.current = null; openRun(outcome.runId); void refreshHome() }
    else setNote(outcome.message)
  }
  const comparison = comparisonResult(run)
  // El instante de lectura alimenta solo el aviso de vigencia actual; el
  // resultado proyectado es el snapshot persistido tal cual.
  const comparisonView = useMemo(() => comparison ? projectComparisonResult(comparison, { readAt: new Date().toISOString() }) : null, [comparison])
  const ingestRun = run && run.workflowVersion === LUMA_WORKFLOW ? run : null
  const importPanel = <div className="research-import"><EventImport ingest={ingest} run={ingestRun} onUrlChange={url => setIngest(current => ({ ...current, url }))} onImport={() => void importUrl()} onOpenDossier={id => void openEdition(id)} /><p>The event and its sources are saved. You can close this tab and return while research continues. Automatic extraction is not human verification.</p></div>
  const coverage = result?.coverage ?? home?.coverage
  return <div className="atlas research-dashboard">
    <a className="skip-link" href="#research-main">Skip to research</a><aside className="research-sidebar"><button className="research-brand" onClick={() => navigate('Research')}><span className="brand-mark" aria-hidden="true">G</span><span className="brand-copy"><span className="brand-title">GrowthX</span><span>Sponsorship intelligence</span></span></button>
      <span className="research-nav-label">Workspace</span>
      <nav aria-label="Main navigation">{NAV.map(({ label, icon: Icon }) => <button key={label} onClick={() => navigate(label)} aria-current={section === label ? 'page' : undefined}><Icon size={19} strokeWidth={1.35}/><span>{label}</span></button>)}</nav>
      <p><span className="sidebar-status-dot" aria-hidden="true"/>San Francisco pilot</p>
    </aside>
    <main className="research-main" id="research-main" tabIndex={-1} ref={content}>
      <div className="research-topbar"><span className="topbar-location">GrowthX <span aria-hidden="true">/</span> {section}</span><span className="topbar-market"><span className="sidebar-status-dot" aria-hidden="true"/>San Francisco</span></div>
      <div className="research-content">
      <header className="research-header"><div><span className="eyebrow">Developer growth · San Francisco</span><h1>{section}</h1><p className="section-caption">{{ Research: "Find your next opportunity.", Organizers: "People, communities and their previous work.", Events: "Published events, evidence and open questions.", Matches: "Connect a sponsor brief with an organizer-declared opportunity.", Decisions: "Compare the evidence and choose your next step.", Brief: "Tell us what you build and who you want to reach." }[section]}</p></div><button className="research-button" onClick={() => { if (comparisonView) { navigate('Decisions'); requestAnimationFrame(() => { const editor = document.querySelector<HTMLDetailsElement>('[data-testid="comparison-brief-editor"]'); if (editor) { editor.open = true; editor.scrollIntoView({block:'start'}); editor.querySelector<HTMLTextAreaElement>('textarea')?.focus() } }) } else navigate('Brief') }}>{run ? `Edit brief · v${run.profile.profileVersion}` : 'Create brief'}</button></header>
      {note && <div className="research-notice" role="alert">{englishSystemText(note)}<button className="research-button" onClick={() => { setNote(null); if (runId) openRun(runId); void refreshHome(); void refreshCatalog() }}>Retry reading</button></div>}
      {run && section !== 'Brief' && <ResearchBrief profile={run.profile} onEdit={() => { if (comparisonView) { navigate('Decisions'); requestAnimationFrame(() => { const editor = document.querySelector<HTMLDetailsElement>('[data-testid="comparison-brief-editor"]'); if (editor) { editor.open = true; editor.scrollIntoView({block:'start'}); editor.querySelector<HTMLTextAreaElement>('textarea')?.focus() } }) } else navigate('Brief') }} />}
      {runId && (run || !note) && section !== 'Brief' && <ResearchProgress run={run} runId={runId} editionCount={editions.length} onOpenRun={openRun} />}
      {!runId && coverage && section === 'Research' && <details data-testid="research-coverage"><summary>Catalog coverage · {coverage.editions} editions</summary><p>{coverage.organizers} organizers. {coverage.material.includes('synthetic') ? 'Includes explicitly labelled test material; this does not establish real SF coverage.' : 'Automatically obtained or curated source material.'}</p><p>Obtained: {coverage.verifiedAt.map(readableDate).join(' · ') || 'No sources saved'}</p></details>}
      {section === 'Decisions' && comparisonView && run && <ComparisonPanel onShowMap={() => navigate('Events')} view={comparisonView} runId={run.runId} previousRunId={run.previousRunId} focus={focus} onFocusChange={changeFocus} onReevaluate={profile => void reevaluate(profile)} reevaluating={reevaluating} onOpenRun={(id, nextFocus) => openRun(id, nextFocus)} onOpenEdition={id => void openEdition(id)} onOpenOrganizer={id => void openOrganizer(id)} onDecisionsChanged={() => void refreshHome()} />}
      {detailBusy && <p role="status">Loading evidence…</p>}
      {detail && <EvidencePanel identity={detail.kind === 'edition' ? latestEdition(detail.data).id : detail.data.organizerId} onClose={() => { detailSequence.current++; setDetail(null) }}>
        {detail.kind === 'organizer' ? <OrganizerDossier read={detail.data} editions={editions} onEdition={id => void openEdition(id)} /> : <EditionDossier briefContext={savedComparison ? {reason: (() => { const reading = savedComparison.bundle.snapshot.decisionReading?.alternatives.find(a=>a.editionId===detail.data.editionId); return reading ? alternativeReason(reading, savedComparison.bundle.editions) : null })()} : undefined} read={detail.data} onEdition={id => void openEdition(id)} onOrganizer={id => void openOrganizer(id)} />}
      </EvidencePanel>}
      <>
        {section === 'Research' && <section className="research-overview"><div className="overview-intro"><div><span className="eyebrow">Make the next event count</span><h2>Find the right room for your next developer launch.</h2><p>Explore communities and events, understand the evidence, and choose a sponsorship format that fits your audience and goals.</p><div className="research-actions"><button className="research-button research-primary" onClick={() => navigate('Brief')}>Create sponsor brief</button><button className="research-button" onClick={() => navigate('Matches')}>Explore matches</button></div></div><div className="overview-orbit" aria-hidden="true"><span>SF</span><small>People · Events · Evidence</small></div></div>
          <div className="overview-steps" aria-label="How GrowthX works"><div><span className="eyebrow">01 · Discover</span><strong>Find your communities</strong><p>See events and organizers that reach your audience.</p></div><div><span className="eyebrow">02 · Evaluate</span><strong>Understand the fit</strong><p>Compare formats, budget and evidence before deciding.</p></div><div><span className="eyebrow">03 · Connect</span><strong>Make the introduction</strong><p>Request a conversation with a relevant organizer.</p></div></div>
          <h3>Saved research</h3>{home ? home.runs.length ? home.runs.map(r => <article className="research-history" key={r.runId}><button className="research-link" onClick={() => { openRun(r.runId); navigate('Organizers') }}>{r.product}</button><span>Brief v{r.profileVersion} · {STATES[r.state]} · {readableDate(r.createdAt)}</span></article>) : <p>No saved research yet. Create your brief to get started.</p> : <p>Loading saved research…</p>}
          {home && home.saved.length > 0 && <><h3>Saved organizers</h3>{home.saved.map(s => <p key={`${s.runId}:${s.organizerId}`}><button className="research-link" onClick={() => { openRun(s.runId); navigate('Organizers') }}>{s.organizerId}</button> · Research pending · {readableDate(s.savedAt)}</p>)}</>}
        </section>}
        {section === 'Brief' && <OnboardingIntake key={run ? `${run.profileId}:${run.profile.profileVersion}` : 'new'} initialProfile={run?.profile} companies={home?.companies} busy={busy} onLaunch={payload => void launch(payload)} />}
        {section === 'Organizers' && isDiscovery && run?.discovery && <DiscoveryPanel discovery={run.discovery} onResearch={id => openRun(id)} />}
        {section === 'Organizers' && !isDiscovery && <section className="organizers-section"><h2>Organizers and background</h2>
          {result ? <><p>{result.catalogNote}</p><p>Criteria: {result.criteria.stack.join(', ') || 'No stack declared'} · audience: {result.criteria.audience}. Stable presentation order; no investment score.</p>
            <div className="organizer-grid">{result.candidates.map(candidate => <article className="research-organizer" key={candidate.organizerId} data-organizer-id={candidate.organizerId}>
              <div className="research-organizer-title"><div><h3>{candidate.displayName}</h3></div><button className="research-button" onClick={() => void openOrganizer(candidate.organizerId)}>Open organizer evidence</button></div>
              {candidate.reasons.map((reason,i) => <div className="research-reason" key={i}><b>{reason.attribute}</b><p>{englishSystemText(reason.text)}</p><details><summary>Technical references</summary><small>{reason.revisionIds.join(', ')}</small></details><ReasonSources sourceIds={reason.sourceIds} sources={[...candidate.dossier.sources, ...result.editions.flatMap(e => e.sources)].filter((s,i,all) => all.findIndex(a => a.id === s.id) === i)} /></div>)}
              <p>{candidate.dossier.coverage.antecedentsDocumented} documented previous editions. {candidate.pending.join(' ')}</p>
              <div className="research-actions"><button className="research-button" disabled={!!saving || run!.savedOrganizers.some(s => s.organizerId === candidate.organizerId)} onClick={() => void save(candidate.organizerId)}>{run!.savedOrganizers.some(s => s.organizerId === candidate.organizerId) ? 'Saved for research' : saving === candidate.organizerId ? 'Saving…' : 'Save for research'}</button>
                {candidate.futureSfEditionIds.map(id => <button className="research-link" key={id} onClick={() => void openEdition(id)}>Explore future SF edition: {latestEdition(result.editions.find(e => e.editionId === id)!).name}</button>)}
              </div>
            </article>)}</div>
            {!result.candidates.length && <><p>No supported matches found. Adjust the brief or add a public event URL.</p>{importPanel}</>}
          </> : run && run.state !== 'completed' && run.state !== 'failed' ? <p>Research is in progress. Stages above reflect saved work.</p> : <p>Create your brief to research SF opportunities.</p>}
        </section>}
        {section === 'Events' && <section className="events-section"><ResearchEvents key={runId ?? 'catalog'} editions={editions} readings={savedComparison?.bundle.snapshot.decisionReading?.alternatives} pending={run?.state === 'running' || run?.state === 'queued'} presentation={presentation} relevanceByEdition={Object.fromEntries((savedComparison?.bundle.snapshot.decisionReading?.alternatives ?? []).map(a => [a.editionId, alternativeReason(a, savedComparison!.bundle.editions)]))}
          onSelect={id => { const edition = editions.find(e => e.editionId === id); if (edition) setPresentation({ runId, selectedEditionId: id, selectedEditionRevisionId: latestEdition(edition).id }) }}
          onEdition={id => void openEdition(id)} compareSelection={compareSelection} compareBusy={compareBusy} onToggleCompare={toggleCompare} onCompare={() => void compare()}
          contextLabel={savedComparison ? 'Saved comparison: original locations and evidence.' : runId ? 'Events and revisions from this research only.' : 'Current catalog: separate from saved research.'}
          onCurrentCatalog={runId ? () => { readSequence.current++; detailSequence.current++; stop.current?.(); setRunId(null); setRun(null); setDetail(null); setPresentation({ runId: null, selectedEditionId: null, selectedEditionRevisionId: null }); setCompareSelection([]); setFocus(NO_FOCUS); window.history.replaceState(null, '', '/'); void refreshCatalog() } : undefined}>
          <BackgroundPanel run={run} profileRunId={run?.runId ?? home?.runs[0]?.runId ?? null} onAccepted={id => openRun(id)} onEdition={id => void openEdition(id)} />
          {importPanel}
        </ResearchEvents></section>}
        {section === 'Matches' && <SponsorshipMatches key={run?.runId ?? home?.runs[0]?.runId ?? 'no-brief'} sponsorRunId={run?.runId ?? home?.runs[0]?.runId ?? null} onCreateBrief={() => navigate('Brief')} />}
        {section === 'Decisions' && <details open={!comparisonView || undefined} className="saved-decisions"><summary>Saved decisions and evaluations</summary><section className="decisions-section"><h2>Investment decisions</h2><p>Open a comparison to record a choice, rejection or pending decision with reasons and conditions. Open questions remain conditions when you save. Saving an organizer only bookmarks it for research.</p>
          <h3>Saved evaluations</h3><p className="research-meta">Opening saved research preserves its original evidence. Re-evaluation is an explicit action that creates a separate comparison.</p>
          {home ? <EvaluationList evaluations={home.evaluations} profiles={home.evaluationProfiles} filterProfileId={evaluationFilter} onFilter={id => void filterEvaluations(id)} onOpen={(id, nextFocus) => { openRun(id, nextFocus); scrollToStart() }} /> : <p>Loading saved research…</p>}
        </section></details>}
      </>
    </div></main>
  </div>
}
