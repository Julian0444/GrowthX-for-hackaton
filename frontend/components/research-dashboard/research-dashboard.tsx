"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { LayoutDashboard, Users, CalendarDays, Bookmark, SlidersHorizontal } from "lucide-react"
import { OnboardingIntake, type IntakePayload } from "../atlas/onboarding-intake"
import { EventImport, INGEST_IDLE, type IngestUiState } from "../atlas/event-import"
import { comparisonResult, eventIngestResult, fetchCatalogEditions, fetchEditionDossier, fetchOrganizerDossier, fetchResearchHome, pollEvaluation, saveResearchOrganizer, startComparison, startEvaluation, startEventIngest, type EditionDossierRead, type EvaluationRunView, type OrganizerDossierRead, type EvaluationStartInput } from "../../lib/api/atlas-client"
import type { ResearchHome, SfResearchResult } from "./research-types"
import { EditionDossier, OrganizerDossier, ReasonSources } from "./research-dossier"
import { ComparisonPanel } from "./comparison-panel"
import { EvaluationList, evaluationHref, NO_FOCUS, parseEvaluationFocus, type EvaluationFocus } from "./evaluation-list"
import { SfEventMap } from "./sf-event-map"
import { dateLabel, isSanFrancisco, latestEdition } from "./research-model"
import { projectComparisonResult, projectEditionDossierView } from "../../lib/api/opportunity-adapter"

type Section = 'Resumen' | 'Organizadores' | 'Eventos' | 'Decisiones' | 'Perfil'
const NAV = [{ label: 'Resumen', icon: LayoutDashboard }, { label: 'Organizadores', icon: Users }, { label: 'Eventos', icon: CalendarDays }, { label: 'Decisiones', icon: Bookmark }, { label: 'Perfil', icon: SlidersHorizontal }] as const
const STATES: Record<string, string> = { queued: 'En cola', running: 'En ejecución', completed: 'Completado', failed: 'Fallido', pending: 'Pendiente' }
const STEPS: Record<string, string> = { validate_profile: 'Validar perfil', research_catalog: 'Investigar catálogo SF', fetch_event_page: 'Obtener página del evento', persist_dossier: 'Persistir dossier', evaluate_candidates: 'Evaluar candidatos y confirmar snapshot', compose_narrative: 'Redacción opcional del modelo', publish_result: 'Publicar resultado' }
// Workflow del run de importación Luma (ticket 11; ver lib/server/evaluations/luma-step.ts).
const LUMA_WORKFLOW = 'luma-ingest/1'
const failure = (status: string) => status === 'unauthorized' ? 'Se requiere una sesión para acceder a esta investigación.' : status === 'missing' ? 'La investigación no está disponible para esta sesión.' : 'No se pudo leer el servidor. Reintentá para recuperar los datos persistidos.'

export function ResearchDashboard() {
  const [section, setSection] = useState<Section>('Resumen')
  const [home, setHome] = useState<ResearchHome | null>(null)
  const [catalog, setCatalog] = useState<EditionDossierRead[] | null>(null)
  const [run, setRun] = useState<EvaluationRunView | null>(null)
  const [runId, setRunId] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [mapOpen, setMapOpen] = useState(false)
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
  const reevaluateSubmission = useRef<{ previousRunId: string; idempotencyKey: string } | null>(null)
  const stop = useRef<(() => void) | null>(null)
  const content = useRef<HTMLDivElement>(null)
  const scrollToStart = () => content.current?.scrollTo({ top: 0, behavior: 'instant' })
  const readSequence = useRef(0)
  const detailSequence = useRef(0)
  const submission = useRef<EvaluationStartInput | null>(null)
  const ingestSubmission = useRef<{ url: string; profileRunId: string; idempotencyKey: string } | null>(null)
  // Solo se publica la investigación cuando el worker confirmó el run completo.
  const result = run?.state === 'completed' && run.result && typeof run.result === 'object' && 'kind' in run.result && run.result.kind === 'sf_organizer_research' ? run.result as SfResearchResult : null
  const editions = result?.editions ?? catalog ?? []
  const sfEditions = editions.filter(e => isSanFrancisco(latestEdition(e).location))

  const refreshHome = useCallback(async () => {
    const outcome = await fetchResearchHome({ profileId: evaluationFilterRef.current })
    if (outcome.status === 'ok') { setHome(outcome.data); return true }
    setNote(failure(outcome.status)); return false
  }, [])
  const refreshCatalog = useCallback(async () => {
    const list = await fetchCatalogEditions()
    if (list.status !== 'ok') { setNote(failure(list.status)); return }
    const reads = await Promise.all(list.data.editions.map(e => fetchEditionDossier(e.editionId)))
    if (reads.some(r => r.status !== 'ok')) { setNote('No se pudo leer el catálogo completo. Reintentá.'); return }
    setCatalog(reads.flatMap(r => r.status === 'ok' ? [r.data] : []))
  }, [])
  const openRun = useCallback((id: string, nextFocus: EvaluationFocus = NO_FOCUS) => {
    const seq = ++readSequence.current
    stop.current?.(); setRunId(id); setRun(null); setDetail(null); setNote(null); setMapOpen(false); setFocus(nextFocus)
    window.history.replaceState(null, '', evaluationHref(id, nextFocus))
    stop.current = pollEvaluation(id, outcome => {
      if (readSequence.current !== seq) return
      if (outcome.status === 'ok') {
        setRun(current => {
          // Guardar es append-only: una lectura iniciada antes del POST no
          // puede retirar un guardado que el servidor ya confirmó.
          if (!current || current.runId !== outcome.run.runId) return outcome.run
          const saved = new Map(outcome.run.savedOrganizers.map(s => [s.organizerId, s]))
          for (const entry of current.savedOrganizers) if (!saved.has(entry.organizerId)) saved.set(entry.organizerId, entry)
          return { ...outcome.run, savedOrganizers: [...saved.values()] }
        }); setNote(null)
        if (outcome.run.state === 'completed' || outcome.run.state === 'failed') void refreshHome()
        // Importación completada: el dossier ya vive en el catálogo persistido
        // del tenant; la lista de ediciones se relee desde PostgreSQL.
        if (outcome.run.state === 'completed' && eventIngestResult(outcome.run)) void refreshCatalog()
      } else setNote(failure(outcome.status))
    })
  }, [refreshHome, refreshCatalog])
  useEffect(() => {
    let alive = true
    const reads = readSequence
    const details = detailSequence
    void (async () => {
      const outcome = await fetchResearchHome()
      if (!alive) return
      if (outcome.status === 'ok') setHome(outcome.data)
      else setNote(failure(outcome.status))
      const id = new URLSearchParams(window.location.search).get('run')
      if (id) openRun(id, parseEvaluationFocus(window.location.search))
      const list = await fetchCatalogEditions()
      if (!alive) return
      if (list.status !== 'ok') { setNote(failure(list.status)); return }
      const reads = await Promise.all(list.data.editions.map(e => fetchEditionDossier(e.editionId)))
      if (!alive) return
      if (reads.some(r => r.status !== 'ok')) { setNote('No se pudo leer el catálogo completo. Reintentá.'); return }
      setCatalog(reads.flatMap(r => r.status === 'ok' ? [r.data] : []))
    })()
    return () => { alive = false; stop.current?.(); reads.current++; details.current++ }
  }, [openRun])
  // Entrar a Decisiones relee la lista de evaluaciones guardadas (lectura por
  // identidad desde PostgreSQL; ninguna fuente externa ni recálculo).
  function navigate(next: Section) { detailSequence.current++; setDetail(null); setDetailBusy(false); setSection(next); scrollToStart(); if (next === 'Decisiones') void refreshHome() }
  async function launch(payload: IntakePayload) {
    if (busy) return
    const body: EvaluationStartInput = { idempotencyKey: '', mode: 'catalog_research', researchScope: 'sf_organizers', ...(run?.workflowVersion === 'sf-organizers/1' ? { previousRunId: run.runId } : {}), profile: {
      product: payload.description, audienceDescription: payload.audience, audienceProfiles: [], stack: payload.stack,
      budget: payload.budgetUsd === null ? { status: 'unknown' } : { status: 'declared', amount: payload.budgetUsd, currency: 'USD' },
      window: { from: payload.windowFrom, to: payload.windowTo }, objective: { kind: payload.objective === 'talent' ? 'hiring' : payload.objective }, comparableCompanies: payload.comparableCompanies,
    } }
    // Reintentar una aceptación incierta conserva la clave; editar crea otra.
    const previous = submission.current
    body.idempotencyKey = previous && JSON.stringify({ ...previous, idempotencyKey: '' }) === JSON.stringify(body) ? previous.idempotencyKey : crypto.randomUUID()
    submission.current = body; setBusy(true); setNote(null)
    const outcome = await startEvaluation(body)
    setBusy(false)
    if (outcome.status === 'accepted') { submission.current = null; openRun(outcome.runId); navigate('Organizadores'); void refreshHome() }
    else setNote(outcome.message)
  }
  async function openEdition(id: string) {
    scrollToStart()
    const seq = ++detailSequence.current
    const cached = editions.find(e => e.editionId === id)
    if (cached) { setDetailBusy(false); setDetail({ kind: 'edition', data: cached }); return }
    setDetailBusy(true)
    const outcome = await fetchEditionDossier(id)
    if (seq !== detailSequence.current) return
    setDetailBusy(false)
    if (outcome.status === 'ok') setDetail({ kind: 'edition', data: outcome.data })
    else setNote(failure(outcome.status))
  }
  async function openOrganizer(id: string) {
    scrollToStart()
    const seq = ++detailSequence.current
    const cached = result?.candidates.find(c => c.organizerId === id)?.dossier
    if (cached) { setDetailBusy(false); setDetail({ kind: 'organizer', data: cached }); return }
    setDetailBusy(true)
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
    else setNote('No se pudo guardar el organizador. ' + failure(outcome.status))
  }
  async function importUrl() {
    const url = ingest.url.trim()
    if (!url || ingest.request.status === 'loading') return
    // La importación pertenece a una investigación existente: reutiliza el
    // perfil del run abierto (o del más reciente); no se fabrica un perfil.
    const profileRunId = run?.runId ?? home?.runs[0]?.runId ?? null
    if (!profileRunId) {
      setIngest(current => ({ ...current, request: { status: 'error', message: 'Completá y confirmá el perfil antes de importar: la importación durable reutiliza el perfil de una investigación de esta sesión.', retryable: false } }))
      return
    }
    // Reintentar una aceptación incierta conserva la clave idempotente; otra
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
    const profileRunId = (run?.workflowVersion === 'sf-organizers/1' ? run.runId : null) ?? home?.runs[0]?.runId ?? null
    if (!profileRunId) {
      setNote('Completá y confirmá el perfil antes de comparar: la comparación evalúa contra el perfil de una investigación de esta sesión.')
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
  // de este run no se tocan. Reintentar una aceptación incierta conserva la
  // clave idempotente; una nueva reevaluación explícita usa otra.
  async function reevaluate() {
    const current = comparisonResult(run)
    if (!run || !current || reevaluating) return
    const previous = reevaluateSubmission.current
    const idempotencyKey = previous && previous.previousRunId === run.runId ? previous.idempotencyKey : crypto.randomUUID()
    reevaluateSubmission.current = { previousRunId: run.runId, idempotencyKey }
    setReevaluating(true); setNote(null)
    const outcome = await startComparison({ idempotencyKey, mode: 'investment_comparison', profileRunId: run.runId, editionIds: [...current.availableCatalog.comparedEditionIds].sort(), previousRunId: run.runId })
    setReevaluating(false)
    if (outcome.status === 'accepted') { reevaluateSubmission.current = null; openRun(outcome.runId); void refreshHome() }
    else setNote(outcome.message)
  }
  const comparison = comparisonResult(run)
  // El instante de lectura alimenta solo el aviso de vigencia actual; el
  // resultado proyectado es el snapshot persistido tal cual.
  const comparisonView = useMemo(() => comparison ? projectComparisonResult(comparison, { readAt: new Date().toISOString() }) : null, [comparison])
  const ingestRun = run && run.workflowVersion === LUMA_WORKFLOW ? run : null
  const importPanel = <div className="research-import"><EventImport ingest={ingest} run={ingestRun} onUrlChange={url => setIngest(current => ({ ...current, url }))} onImport={() => void importUrl()} onOpenDossier={id => void openEdition(id)} /><p>La importación es durable: crea un run con pasos persistidos y el dossier queda guardado en el catálogo del tenant como material importado (sin curación humana). Podés cerrar la pestaña durante la obtención y volver al run con su enlace.</p></div>
  const coverage = result?.coverage ?? home?.coverage
  return <div className="atlas research-dashboard">
    <aside className="research-sidebar"><button className="research-brand" onClick={() => navigate('Resumen')}>Growth Atlas<span>Investigación · SF</span></button>
      <nav aria-label="Navegación principal">{NAV.map(({ label, icon: Icon }) => <button key={label} onClick={() => navigate(label)} aria-current={section === label ? 'page' : undefined}><Icon size={18} strokeWidth={1.5}/>{label}</button>)}</nav>
      <p>Catálogo acotado.<br/>Fuentes antes de decidir.</p>
    </aside>
    <div className="research-main" ref={content}>
      <header className="research-header"><div><span className="eyebrow">San Francisco</span><h1>{section}</h1></div><button className="research-button" onClick={() => navigate('Perfil')}>{run ? `Editar perfil · v${run.profile.profileVersion}` : 'Completar perfil'}</button></header>
      {note && <div className="research-notice" role="alert">{note}<button className="research-button" onClick={() => { setNote(null); if (runId) openRun(runId); void refreshHome(); void refreshCatalog() }}>Reintentar lectura</button></div>}
      {coverage ? <div className="research-coverage" data-testid="research-coverage"><span>{coverage.organizers} organizadores · {coverage.editions} ediciones en el catálogo</span><span>Verificación: {coverage.verifiedAt.join(' · ') || 'sin cargas verificadas'}</span><span>{coverage.material.includes('synthetic') ? 'Material sintético: prueba el mecanismo; no acredita cobertura real de SF.' : coverage.material.includes('imported') ? 'Incluye material importado de URLs aportadas, sin curación humana.' : coverage.material.length ? 'Material curado' : 'Sin catálogo cargado'}</span>{result && <span>Investigación guardada al {result.evaluatedAt}</span>}</div> : !note && <p role="status">Leyendo cobertura…</p>}
      {runId && <section className="research-progress" aria-label="Estado persistido" data-testid="run-progress"><p>{run?.workflowVersion === 'investment-comparison/1' ? 'Evaluación' : 'Investigación'} <span className="research-meta">{runId}</span> · {run ? STATES[run.state] : 'Consultando estado…'}</p>
        {run && <><ol>{run.steps.map(step => <li key={step.name}>{STEPS[step.name] ?? step.name}: <b>{STATES[step.state]}</b> · intentos {step.attempts}{step.error && <p>{step.error}</p>}</li>)}</ol>{run.error && <p role="alert">{run.error}</p>}{run.previousRunId && <button className="research-link" onClick={() => openRun(run.previousRunId!)}>{run.workflowVersion === 'investment-comparison/1' ? 'Abrir evaluación anterior (esta es una reevaluación)' : 'Abrir investigación anterior'}</button>}</>}
      </section>}
      {comparisonView && !detail && run && <ComparisonPanel view={comparisonView} runId={run.runId} previousRunId={run.previousRunId} focus={focus} onFocusChange={changeFocus} onReevaluate={() => void reevaluate()} reevaluating={reevaluating} onOpenRun={(id, nextFocus) => openRun(id, nextFocus)} onOpenEdition={id => void openEdition(id)} onOpenOrganizer={id => void openOrganizer(id)} onDecisionsChanged={() => void refreshHome()} />}
      {detailBusy && <p role="status">Leyendo expediente…</p>}
      {detail ? <div className="research-detail"><button className="research-button" onClick={() => { detailSequence.current++; setDetail(null) }}>Volver a {section.toLowerCase()}</button>
        <p className="research-meta">{result ? 'Fuentes y revisiones conservadas en la investigación' : 'Lectura actual del catálogo persistido'}</p>
        {detail.kind === 'organizer' ? <OrganizerDossier read={detail.data} editions={editions} onEdition={id => void openEdition(id)} /> : <EditionDossier read={detail.data} onEdition={id => void openEdition(id)} onOrganizer={id => void openOrganizer(id)} />}
      </div> : <>
        {section === 'Resumen' && <section><h2>De un perfil a sus antecedentes</h2><p>Encontrá organizadores pertinentes dentro de la cobertura del catálogo. Abrí empresas, ediciones, roles y fuentes antes de evaluar una inversión.</p>
          <h3>Investigaciones guardadas</h3>{home ? home.runs.length ? home.runs.map(r => <article className="research-history" key={r.runId}><button className="research-link" onClick={() => { openRun(r.runId); navigate('Organizadores') }}>{r.product}</button><span>Perfil v{r.profileVersion} · {STATES[r.state]} · {r.createdAt}</span></article>) : <p>No hay investigaciones guardadas para esta sesión. Completá el perfil para empezar.</p> : <p>Esperando lectura del historial.</p>}
          {home && home.saved.length > 0 && <><h3>Organizadores guardados para investigar</h3>{home.saved.map(s => <p key={`${s.runId}:${s.organizerId}`}><button className="research-link" onClick={() => { openRun(s.runId); navigate('Organizadores') }}>{s.organizerId}</button> · Investigación pendiente · {s.savedAt}</p>)}</>}
        </section>}
        {section === 'Perfil' && <OnboardingIntake key={run?.profileId ?? 'new'} initialProfile={run?.profile} companies={home?.companies} busy={busy} onLaunch={payload => void launch(payload)} />}
        {section === 'Organizadores' && <section><h2>Coincidencias con antecedentes</h2>
          {result ? <><p>{result.catalogNote}</p><p>Factores: {result.criteria.stack.join(', ') || 'sin stack'} · audiencia: {result.criteria.audience}. Orden de presentación por ID; sin score de reputación o inversión.</p>
            {result.candidates.map(candidate => <article className="research-organizer" key={candidate.organizerId} data-organizer-id={candidate.organizerId}>
              <div className="research-organizer-title"><div><h3>{candidate.displayName}</h3><span className="research-meta">{candidate.organizerId}</span></div><button className="research-button" onClick={() => void openOrganizer(candidate.organizerId)}>Abrir expediente</button></div>
              {candidate.reasons.map((reason,i) => <div className="research-reason" key={i}><b>{reason.attribute}</b><p>{reason.text}</p><small>Revisiones: {reason.revisionIds.join(', ')}</small><ReasonSources sourceIds={reason.sourceIds} sources={[...candidate.dossier.sources, ...result.editions.flatMap(e => e.sources)].filter((s,i,all) => all.findIndex(a => a.id === s.id) === i)} /></div>)}
              <p>{candidate.dossier.coverage.antecedentsDocumented} antecedente(s) documentados. {candidate.pending.join(' ')}</p>
              <div className="research-actions"><button className="research-button" disabled={!!saving || run!.savedOrganizers.some(s => s.organizerId === candidate.organizerId)} onClick={() => void save(candidate.organizerId)}>{run!.savedOrganizers.some(s => s.organizerId === candidate.organizerId) ? 'Guardado · investigación pendiente' : saving === candidate.organizerId ? 'Guardando…' : 'Guardar para investigar'}</button>
                {candidate.futureSfEditionIds.map(id => <button className="research-link" key={id} onClick={() => void openEdition(id)}>Ver edición futura de SF: {latestEdition(result.editions.find(e => e.editionId === id)!).name}</button>)}
              </div>
            </article>)}
            {!result.candidates.length && <><p>No se encontraron coincidencias respaldadas. Podés corregir el perfil o incorporar una URL de Luma.</p>{importPanel}</>}
          </> : run && run.state !== 'completed' && run.state !== 'failed' ? <p>La investigación se está procesando; los pasos de arriba reflejan el estado guardado.</p> : <p>Completá y confirmá el perfil para investigar el catálogo de SF.</p>}
        </section>}
        {section === 'Eventos' && <section><div className="research-actions"><h2>Ediciones de San Francisco</h2><div role="group" aria-label="Vista de eventos"><button className="research-button" aria-pressed={!mapOpen} onClick={() => setMapOpen(false)}>Lista</button><button className="research-button" aria-pressed={mapOpen} onClick={() => setMapOpen(true)}>Mapa</button></div></div>
          <p>Las dos vistas muestran las mismas ediciones y fuentes. Fechas vencidas son antecedentes; los pendientes no son recomendaciones.</p>
          {mapOpen && <SfEventMap editions={sfEditions} onEdition={id => void openEdition(id)} />}
          {sfEditions.length === 0 && <p>{catalog === null && !result ? 'Leyendo ediciones…' : 'Sin ediciones de SF en esta cobertura.'}</p>}
          {sfEditions.length > 0 && <div className="research-actions" data-testid="compare-toolbar">
            <button className="research-button" disabled={compareBusy || compareSelection.length === 0} onClick={() => void compare()}>{compareBusy ? 'Aceptando comparación…' : `Comparar seleccionadas (${compareSelection.length}/3)`}</button>
            <span className="research-meta">Hasta 3 candidatos del catálogo; la comparación evalúa elegibilidad antes de puntuar y guarda un snapshot inmutable. No se inventan candidatos para completar un top 3.</span>
          </div>}
          <div data-testid="sf-edition-list">{sfEditions.map(read => { const e = latestEdition(read); const view = projectEditionDossierView(read); return <article className="research-event" key={read.editionId} data-edition-id={read.editionId} data-source-ids={read.sources.map(s => s.id).sort().join(',')}>
            <h3><button className="research-link" onClick={() => void openEdition(read.editionId)}>{e.name}</button></h3><p>{dateLabel(e.startDate)} · {e.location.name} · {read.validity.validity === 'past' ? 'Antecedente histórico' : 'Revisar condiciones'}</p><small>{e.editionId}</small>
            <label className="research-meta"><input type="checkbox" checked={compareSelection.includes(read.editionId)} disabled={!compareSelection.includes(read.editionId) && compareSelection.length >= 3} onChange={() => toggleCompare(read.editionId)} /> Seleccionar para comparar</label>
            <ReasonSources sources={read.sources} sourceIds={view.date.sources.concat(view.location.sources).map(s => s.id)} />
          </article> })}</div>{importPanel}
        </section>}
        {section === 'Decisiones' && <section><h2>Decisiones de inversión</h2><p>Las decisiones se registran sobre el panel de una comparación (snapshot oficial): abrí un run de comparación y usá «Registrar decisión» para elegir, descartar o dejar pendiente con motivos y condiciones. Una elección con acceso, audiencia o costo pendientes se guarda como condicional y abre el borrador de campaña persistido. Los organizadores guardados conservan una investigación pendiente; guardarlos no crea una inversión ni una campaña.</p>
          <h3>Evaluaciones guardadas</h3><p className="research-meta">Lectura por identidad desde PostgreSQL: abrir una evaluación recupera su run, su snapshot, la revisión de cada decisión y su campaña sin recalcular ni consultar fuentes. Reevaluar es una acción explícita del panel.</p>
          {home ? <EvaluationList evaluations={home.evaluations} profiles={home.evaluationProfiles} filterProfileId={evaluationFilter} onFilter={id => void filterEvaluations(id)} onOpen={(id, nextFocus) => { openRun(id, nextFocus); scrollToStart() }} /> : <p>Esperando lectura del historial.</p>}
        </section>}
      </>}
    </div>
  </div>
}
