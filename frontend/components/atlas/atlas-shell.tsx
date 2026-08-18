"use client"

import { useCallback, useEffect, useReducer, useRef, useState } from "react"
import { Minus, Plus, RotateCcw } from "lucide-react"
import { AtlasHeader } from "@/components/atlas-header"
import { useAtlasCamera, type ZoomBand } from "@/hooks/use-atlas-camera"
import { useReducedMotion } from "@/hooks/use-reduced-motion"
import {
  fetchSharedLinqSearch,
  ingestEvent,
  searchOpportunities,
} from "@/lib/api/atlas-client"
import { toLegacyShape } from "@/lib/api/opportunity-adapter"
import type {
  DataCoverage,
  Opportunity,
  RequestState,
  SearchRequest,
  SearchResponse,
} from "@/lib/api/types"
import type { SearchRequest as WireSearchRequest } from "@/lib/contracts/growxth"
import type { AtlasLayer, TimeRange } from "@/lib/atlas-data"
import { cityFrame, FRAME_IDLE, resultsFrame, ZOOM_STEP } from "@/lib/atlas/camera"
import { projectCity } from "@/lib/atlas/signal-layout"
import { AnalysisOverlay, SEARCH_STAGES } from "./analysis-overlay"
import { EventImport, INGEST_IDLE, type IngestUiState } from "./event-import"
import { LAYER_ORDER, LayerControls } from "./layer-controls"
import { OnboardingIntake, type IntakePayload } from "./onboarding-intake"
import { OpportunityDrawer } from "./opportunity-drawer"
import { RequestBanner } from "./request-banner"
import { ResultRail } from "./result-rail"
import { SearchCommand } from "./search-command"
import { WorldMap } from "./world-map"

// "idle" = intake inicial (onboarding-intake.tsx) sobre el mapa.
export type AtlasViewState = "idle" | "analyzing" | "results" | "selected" | "campaign"

// Máquina de estados central (§7) — nada de useState sueltos para view state.
// El request vive acá como RequestState real (§10). La selección es un id
// string genérico: cualquier mercado que devuelva el backend.
type AtlasState = {
  view: AtlasViewState
  searchText: string
  activeQuery: string
  searchRequest: SearchRequest | null
  request: RequestState
  response: SearchResponse | null
  results: Opportunity[]
  selectedId: string | null
  // Retiene el último mercado para que el contenido del panel no "pope" al cerrar.
  lastId: string | null
  hoveredId: string | null
  layers: AtlasLayer[]
  timeRange: TimeRange
}

type AtlasAction =
  | { type: "QUERY_CHANGED"; text: string }
  | { type: "SEARCH_STARTED"; query: string; request: SearchRequest }
  | { type: "SEARCH_PROGRESSED"; stage: string }
  | { type: "SEARCH_SUCCEEDED"; response: SearchResponse; degradedNote?: string }
  | { type: "SEARCH_REFRESHED"; response: SearchResponse; degradedNote?: string }
  | { type: "SEARCH_FAILED"; message: string }
  | { type: "OPPORTUNITY_HOVERED"; id: string | null }
  | { type: "OPPORTUNITY_SELECTED"; id: string }
  | { type: "SELECTION_CLOSED" }
  | { type: "CAMPAIGN_OPENED" }
  | { type: "CAMPAIGN_CLOSED" }
  | { type: "LAYER_TOGGLED"; layer: AtlasLayer }
  | { type: "TIME_RANGE_CHANGED"; range: TimeRange }
  | { type: "DEMO_RESET" }

const INITIAL_STATE: AtlasState = {
  view: "idle",
  searchText: "",
  activeQuery: "",
  searchRequest: null,
  request: { status: "idle" },
  response: null,
  results: [],
  selectedId: null,
  lastId: null,
  hoveredId: null,
  layers: ["demand", "events", "communities"],
  timeRange: "30d",
}

// Aviso honesto del estado partial (§10): qué falta y con qué se rankeó.
function partialMessage(coverage: DataCoverage): string {
  return `Partial results — sources unavailable: ${coverage.unavailableSources.join(", ")}. Ranking uses ${coverage.sourcesAvailable.length} of ${coverage.sourcesRequested.length} signal sources; live event listings are hidden.`
}

function atlasReducer(state: AtlasState, action: AtlasAction): AtlasState {
  switch (action.type) {
    case "QUERY_CHANGED":
      return { ...state, searchText: action.text }
    case "SEARCH_STARTED":
      if (state.view === "analyzing") return state
      return {
        ...state,
        view: "analyzing",
        searchText: action.query,
        activeQuery: action.query,
        searchRequest: action.request,
        request: { status: "loading", stage: SEARCH_STAGES[0].id },
        response: null,
        results: [],
        selectedId: null,
        hoveredId: null,
      }
    case "SEARCH_PROGRESSED":
      if (state.request.status !== "loading") return state
      return { ...state, request: { status: "loading", stage: action.stage } }
    case "SEARCH_SUCCEEDED": {
      if (state.view !== "analyzing") return state
      const coverage = action.response.dataCoverage
      return {
        ...state,
        view: "results",
        response: action.response,
        results: action.response.opportunities,
        request: action.degradedNote
          ? { status: "partial", message: action.degradedNote }
          : coverage.unavailableSources.length > 0
            ? { status: "partial", message: partialMessage(coverage) }
            : { status: "success" },
      }
    }
    case "SEARCH_REFRESHED": {
      if (state.view !== "results") return state
      const coverage = action.response.dataCoverage
      return {
        ...state,
        response: action.response,
        results: action.response.opportunities,
        request: action.degradedNote
          ? { status: "partial", message: action.degradedNote }
          : coverage.unavailableSources.length > 0
            ? { status: "partial", message: partialMessage(coverage) }
            : { status: "success" },
      }
    }
    case "SEARCH_FAILED":
      // Un error devuelve al intake — el banner (con Retry) vive ahí.
      return { ...state, view: "idle", request: { status: "error", message: action.message, retryable: true } }
    case "OPPORTUNITY_HOVERED":
      return state.hoveredId === action.id ? state : { ...state, hoveredId: action.id }
    case "OPPORTUNITY_SELECTED":
      return { ...state, view: "selected", selectedId: action.id, lastId: action.id }
    case "SELECTION_CLOSED":
      return { ...state, view: "results", selectedId: null }
    case "CAMPAIGN_OPENED":
      return state.view === "selected" ? { ...state, view: "campaign" } : state
    case "CAMPAIGN_CLOSED":
      return state.view === "campaign" ? { ...state, view: "selected" } : state
    case "LAYER_TOGGLED":
      return {
        ...state,
        layers: state.layers.includes(action.layer)
          ? state.layers.filter((layer) => layer !== action.layer)
          : [...state.layers, action.layer],
      }
    case "TIME_RANGE_CHANGED":
      return { ...state, timeRange: action.range }
    case "DEMO_RESET":
      return {
        ...INITIAL_STATE,
        layers: state.layers,
        timeRange: state.timeRange,
      }
  }
}

function detectObjective(query: string): SearchRequest["objective"] {
  const text = query.toLowerCase()
  if (/talent|hiring|recruit/.test(text)) return "talent"
  if (/awareness|brand/.test(text)) return "awareness"
  if (/feedback/.test(text) && !/adoption/.test(text)) return "feedback"
  return "adoption"
}

function projectResults(opportunities: readonly Opportunity[]): Array<[number, number]> {
  return opportunities.map((item) => projectCity(item.coordinates[0], item.coordinates[1]))
}

// Traducción al contrato del backend (growxth.ts). El objetivo "talent" de la
// UI se llama "hiring" en el contrato.
function toWireRequest(request: SearchRequest): WireSearchRequest {
  return {
    product: request.query,
    icpStack: request.technologies ?? request.audience ?? [],
    // Se conserva el campo requerido por el backend, pero no se interpreta ni
    // presenta como evidencia porque no contamos con precios verificables.
    budgetUsd: 0,
    goal: request.objective === "talent" ? "hiring" : request.objective,
    location: request.location,
  }
}

// Overrides del intake (objetivo elegido explícitamente) o retry con el request
// original; sin overrides, la barra de refinamiento interpreta la query.
type SearchOverrides = {
  focusOpportunityId?: string | null
  request?: SearchRequest
  objective?: SearchRequest["objective"]
}

export function AtlasShell() {
  const [state, dispatch] = useReducer(atlasReducer, INITIAL_STATE)
  const {
    view,
    searchText,
    activeQuery,
    searchRequest,
    request,
    response,
    results,
    selectedId,
    lastId,
    hoveredId,
    layers,
    timeRange,
  } = state

  const [layersOpen, setLayersOpen] = useState(false)
  // Bottom sheet mobile (§12): medium 46svh ↔ tall 88svh vía el grabber.
  const [sheetTall, setSheetTall] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [zoomBand, setZoomBand] = useState<ZoomBand>({ zoomed: false, zoomed2: false })
  const [toast, setToast] = useState<{ message: string; visible: boolean }>({ message: "", visible: false })
  const [ingest, setIngest] = useState<IngestUiState>(INGEST_IDLE)
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null)

  const searchInputRef = useRef<HTMLInputElement>(null)
  const toastTimer = useRef<number | null>(null)
  const scanTimer = useRef<number | null>(null)
  const stageTimer = useRef<number | null>(null)
  const enrichmentTimer = useRef<number | null>(null)
  // Descartan resoluciones viejas (retry rápido, reset durante el análisis).
  const searchSeq = useRef(0)
  const ingestSeq = useRef(0)

  const reducedMotion = useReducedMotion()
  const camera = useAtlasCamera({ reducedMotion, onZoomBandChange: setZoomBand })

  const showToast = useCallback((message: string) => {
    setToast({ message, visible: true })
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast((current) => ({ ...current, visible: false })), 1800)
  }, [])

  const clearStageTimer = useCallback(() => {
    if (stageTimer.current !== null) {
      window.clearInterval(stageTimer.current)
      stageTimer.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current)
      if (scanTimer.current !== null) window.clearTimeout(scanTimer.current)
      if (stageTimer.current !== null) window.clearInterval(stageTimer.current)
      if (enrichmentTimer.current !== null) window.clearTimeout(enrichmentTimer.current)
    }
  }, [])

  const viewRef = useRef(view)
  const layersRef = useRef(layers)
  const timeRangeRef = useRef(timeRange)
  const resultsRef = useRef(results)
  const selectedIdRef = useRef(selectedId)
  const searchRequestRef = useRef(searchRequest)
  const ingestUrlRef = useRef(ingest.url)
  // Disparador de la selección (§12): al cerrar el panel, el foco vuelve acá.
  const triggerRef = useRef<HTMLElement | SVGElement | null>(null)
  useEffect(() => {
    viewRef.current = view
    layersRef.current = layers
    timeRangeRef.current = timeRange
    resultsRef.current = results
    selectedIdRef.current = selectedId
    searchRequestRef.current = searchRequest
    ingestUrlRef.current = ingest.url
  }, [view, layers, timeRange, results, selectedId, searchRequest, ingest.url])

  const runSearch = useCallback(
    (query: string, overrides: SearchOverrides = {}) => {
      if (viewRef.current === "analyzing") return
      if (enrichmentTimer.current !== null) {
        window.clearTimeout(enrichmentTimer.current)
        enrichmentTimer.current = null
      }
      const seq = ++searchSeq.current
      const builtRequest: SearchRequest = overrides.request ?? {
        query,
        objective: overrides.objective ?? detectObjective(query),
        timeRange: timeRangeRef.current,
        layers: layersRef.current,
      }
      dispatch({ type: "SEARCH_STARTED", query, request: builtRequest })
      setLayersOpen(false)
      // Banda de escaneo §5: 1.05s × 2 (se retira sola a los 2200ms).
      if (!reducedMotion) {
        setScanning(true)
        if (scanTimer.current !== null) window.clearTimeout(scanTimer.current)
        scanTimer.current = window.setTimeout(() => setScanning(false), 2200)
      }
      // Ticker cosmético de etapas mientras la request real está en vuelo:
      // avanza hasta la última y queda ahí hasta que el backend responde.
      clearStageTimer()
      let stageIndex = 0
      stageTimer.current = window.setInterval(
        () => {
          if (searchSeq.current !== seq) {
            clearStageTimer()
            return
          }
          if (stageIndex < SEARCH_STAGES.length - 1) {
            stageIndex += 1
            dispatch({ type: "SEARCH_PROGRESSED", stage: SEARCH_STAGES[stageIndex].id })
          }
        },
        reducedMotion ? 80 : 550,
      )
      searchOpportunities(toWireRequest(builtRequest))
        .then((wireResponse) => {
          if (searchSeq.current !== seq) return
          clearStageTimer()
          const legacyResponse = toLegacyShape(wireResponse)
          setUserLocation(
            wireResponse.locationContext
              ? [wireResponse.locationContext.lng, wireResponse.locationContext.lat]
              : null,
          )
          dispatch({
            type: "SEARCH_SUCCEEDED",
            response: legacyResponse,
            degradedNote: wireResponse.degraded
              ? wireResponse.warnings.join(" · ") || "Serving prepared fallback data."
              : undefined,
          })
          resultsRef.current = legacyResponse.opportunities
          const focus = legacyResponse.opportunities.find(
            (item) => item.id === overrides.focusOpportunityId,
          )
          if (focus) {
            dispatch({ type: "OPPORTUNITY_SELECTED", id: focus.id })
            const [x, y] = projectCity(focus.coordinates[0], focus.coordinates[1])
            camera.flyTo(cityFrame(x, y, window.innerWidth, window.innerHeight), 820)
          } else {
            // Encuadre dinámico: bounding box de los mercados que llegaron.
            camera.flyTo(resultsFrame(projectResults(legacyResponse.opportunities)), 900)
          }

          // Cold Apify Actors can take tens of seconds to start. The server
          // returns GitHub-backed results immediately and keeps those Actors
          // alive; this silent refresh folds their cached results into the map.
          const refreshDelays = [12_000, 18_000, 22_000]
          const scheduleRefresh = (
            latest: typeof wireResponse,
            attempt: number,
          ): void => {
            const warming = latest.warnings.some((warning) =>
              warning.includes("still loading and will refresh automatically"),
            )
            if (!warming || attempt >= refreshDelays.length) return
            enrichmentTimer.current = window.setTimeout(() => {
              enrichmentTimer.current = null
              if (searchSeq.current !== seq || viewRef.current !== "results") return
              searchOpportunities(toWireRequest(builtRequest))
                .then((refreshed) => {
                  if (searchSeq.current !== seq || viewRef.current !== "results") return
                  const refreshedLegacy = toLegacyShape(refreshed)
                  resultsRef.current = refreshedLegacy.opportunities
                  dispatch({
                    type: "SEARCH_REFRESHED",
                    response: refreshedLegacy,
                    degradedNote: refreshed.degraded
                      ? refreshed.warnings.join(" · ") || "Some live signals are still unavailable."
                      : undefined,
                  })
                  scheduleRefresh(refreshed, attempt + 1)
                })
                .catch(() => {
                  // Keep the visible ranking. A background enrichment miss is
                  // non-fatal and the next explicit search can retry it.
                })
            }, refreshDelays[attempt])
          }
          scheduleRefresh(wireResponse, 0)
        })
        .catch((error: unknown) => {
          // atlas-client no lanza en condiciones normales; esto es red de seguridad.
          if (searchSeq.current !== seq) return
          clearStageTimer()
          setScanning(false)
          if (scanTimer.current !== null) window.clearTimeout(scanTimer.current)
          dispatch({
            type: "SEARCH_FAILED",
            message: error instanceof Error ? error.message : "Unexpected error.",
          })
        })
    },
    [reducedMotion, camera, clearStageTimer],
  )

  const launchFromIntake = useCallback(
    (payload: IntakePayload) => {
      runSearch(payload.description, { objective: payload.objective })
    },
    [runSearch],
  )

  const retrySearch = useCallback(() => {
    if (!activeQuery && !searchRequestRef.current) return
    runSearch(activeQuery, { request: searchRequestRef.current ?? undefined })
  }, [runSearch, activeQuery])

  const selectCity = useCallback(
    (id: string) => {
      const opportunity = resultsRef.current.find((item) => item.id === id)
      if (!opportunity) return
      // Se captura el disparador solo al ABRIR el panel: los cambios ciudad→ciudad
      // (rail, swipe) no lo pisan — cerrar vuelve siempre al primer disparador.
      if (viewRef.current !== "selected" && viewRef.current !== "campaign") {
        const active = document.activeElement
        triggerRef.current =
          active instanceof HTMLElement || active instanceof SVGElement ? active : null
      }
      dispatch({ type: "OPPORTUNITY_SELECTED", id })
      const [x, y] = projectCity(opportunity.coordinates[0], opportunity.coordinates[1])
      camera.flyTo(cityFrame(x, y, window.innerWidth, window.innerHeight), 820)
    },
    [camera],
  )

  const closeSelection = useCallback(() => {
    const closedId = selectedIdRef.current
    dispatch({ type: "SELECTION_CLOSED" })
    // Cerrar vuelve al encuadre de resultados, no al mundo completo (§6).
    camera.flyTo(resultsFrame(projectResults(resultsRef.current)), 780)
    // Retorno de foco (§12): al disparador si sigue en el DOM; si no, al item
    // del rail de ese mercado (la alternativa navegable al SVG).
    const trigger = triggerRef.current
    triggerRef.current = null
    requestAnimationFrame(() => {
      if (trigger && trigger.isConnected) {
        ;(trigger as HTMLElement).focus()
      } else if (closedId) {
        document
          .querySelector<HTMLButtonElement>(`.rail-item[data-id="${closedId}"]`)
          ?.focus()
      }
    })
  }, [camera])

  // Campaña §9: mismo drawer, sin mover la cámara — solo cambia la vista interna.
  const openCampaign = useCallback(() => dispatch({ type: "CAMPAIGN_OPENED" }), [])
  const closeCampaign = useCallback(() => dispatch({ type: "CAMPAIGN_CLOSED" }), [])

  const resetDemo = useCallback(() => {
    searchSeq.current++
    ingestSeq.current++
    if (enrichmentTimer.current !== null) {
      window.clearTimeout(enrichmentTimer.current)
      enrichmentTimer.current = null
    }
    clearStageTimer()
    dispatch({ type: "DEMO_RESET" })
    setLayersOpen(false)
    setSheetTall(false)
    setScanning(false)
    setIngest(INGEST_IDLE)
    setUserLocation(null)
    camera.flyTo(FRAME_IDLE, 900)
  }, [camera, clearStageTimer])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const shareId = params.get("linq")
    const queryFromLink = params.get("q")?.trim() ?? ""
    const goalFromLink = params.get("goal") ?? params.get("g")
    const stackFromLink = (params.get("stack") ?? params.get("s") ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
    const focusOpportunityId = params.get("opp") ?? params.get("o")
    const requestFromDurableLink: SearchRequest | null = queryFromLink
      ? {
          query: queryFromLink,
          objective:
            goalFromLink === "hiring"
              ? "talent"
              : goalFromLink === "feedback" ||
                  goalFromLink === "awareness" ||
                  goalFromLink === "adoption"
                ? goalFromLink
                : detectObjective(queryFromLink),
          technologies: stackFromLink,
          timeRange: "30d",
          layers: ["demand", "events", "communities"],
        }
      : null
    if (!shareId) {
      if (requestFromDurableLink) {
        const handle = window.setTimeout(
          () =>
            runSearch(requestFromDurableLink.query, {
              focusOpportunityId,
              request: requestFromDurableLink,
            }),
          0,
        )
        return () => window.clearTimeout(handle)
      }
      return
    }
    const seq = ++searchSeq.current
    fetchSharedLinqSearch(shareId)
      .then((shared) => {
        if (searchSeq.current !== seq) return
        const wire = shared.response
        const requestFromLink: SearchRequest = {
          query: wire.query.product,
          objective: wire.query.goal === "hiring" ? "talent" : wire.query.goal,
          technologies: wire.query.icpStack,
          timeRange: "30d",
          layers: ["demand", "events", "communities"],
          location: wire.query.location,
        }
        const legacy = toLegacyShape(wire)
        dispatch({
          type: "SEARCH_STARTED",
          query: requestFromLink.query,
          request: requestFromLink,
        })
        dispatch({
          type: "SEARCH_SUCCEEDED",
          response: legacy,
          degradedNote: wire.degraded ? wire.warnings.join(" · ") : undefined,
        })
        resultsRef.current = legacy.opportunities
        setUserLocation(
          wire.locationContext
            ? [wire.locationContext.lng, wire.locationContext.lat]
            : null,
        )
        const focusId = params.get("opp") ?? params.get("o") ?? shared.focusOpportunityId
        const focus = legacy.opportunities.find((item) => item.id === focusId)
        if (focus) {
          dispatch({ type: "OPPORTUNITY_SELECTED", id: focus.id })
          const [x, y] = projectCity(focus.coordinates[0], focus.coordinates[1])
          camera.flyTo(cityFrame(x, y, window.innerWidth, window.innerHeight), 820)
        } else {
          camera.flyTo(resultsFrame(projectResults(legacy.opportunities)), 900)
        }
      })
      .catch((error: unknown) => {
        if (searchSeq.current !== seq) return
        if (requestFromDurableLink) {
          // A Vercel instance or local server may restart between sending and
          // opening the SMS. Re-run the encoded query instead of showing a
          // dead link when the ephemeral share no longer exists.
          runSearch(requestFromDurableLink.query, {
            focusOpportunityId,
            request: requestFromDurableLink,
          })
          return
        }
        dispatch({
          type: "SEARCH_FAILED",
          message:
            error instanceof Error ? error.message : "The Linq result link is unavailable.",
        })
      })
  }, [camera, runSearch])

  const toggleSheet = useCallback(() => setSheetTall((tall) => !tall), [])

  const runImport = useCallback(() => {
    const url = ingestUrlRef.current.trim()
    if (!url) return
    const seq = ++ingestSeq.current
    setIngest({ url, request: { status: "loading", stage: "fetching" }, result: null })
    ingestEvent(url)
      .then((result) => {
        if (ingestSeq.current !== seq) return
        if (result.extraction.status === "failed" || !result.event) {
          setIngest({
            url,
            request: {
              status: "error",
              message: result.extraction.warnings[0] ?? "could not read the event page",
              retryable: true,
            },
            result: null,
          })
          return
        }
        setIngest({
          url,
          request:
            result.extraction.status === "partial"
              ? { status: "partial", message: result.extraction.warnings.join(" · ") }
              : { status: "success" },
          result,
        })
      })
      .catch(() => {
        if (ingestSeq.current !== seq) return
        setIngest({
          url,
          request: { status: "error", message: "the ingest endpoint didn't respond", retryable: true },
          result: null,
        })
      })
  }, [])

  const changeIngestUrl = useCallback((url: string) => {
    setIngest((current) => ({ ...current, url }))
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setLayersOpen(false)
        if (viewRef.current === "campaign") dispatch({ type: "CAMPAIGN_CLOSED" })
        else if (viewRef.current === "selected") closeSelection()
      }
      // El atajo "/" no puede robar el foco mientras se tipea en OTRO campo
      // (p. ej. la URL de Luma contiene "/" — sin este guard, importaba a medias).
      const active = document.activeElement
      const typing =
        active instanceof HTMLElement &&
        (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable)
      if (event.key === "/" && !typing && viewRef.current !== "idle") {
        event.preventDefault()
        searchInputRef.current?.focus()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [closeSelection])

  const setSearchText = useCallback((text: string) => dispatch({ type: "QUERY_CHANGED", text }), [])
  const hoverCity = useCallback((id: string | null) => dispatch({ type: "OPPORTUNITY_HOVERED", id }), [])
  const toggleLayer = useCallback((layer: AtlasLayer) => dispatch({ type: "LAYER_TOGGLED", layer }), [])

  const changeTimeRange = useCallback(
    (range: TimeRange) => {
      dispatch({ type: "TIME_RANGE_CHANGED", range })
      showToast(`Window: ${range.toUpperCase()}`)
    },
    [showToast],
  )

  const resetZoom = useCallback(() => {
    // Con el panel abierto, "Reset view" recupera el encuadre del mercado — no
    // FRAME_IDLE (quirk del prototipo que dejaba el mundo entero detrás del panel).
    const currentView = viewRef.current
    if (currentView === "selected" || currentView === "campaign") {
      const id = selectedIdRef.current
      const opportunity = id ? resultsRef.current.find((item) => item.id === id) : undefined
      if (opportunity) {
        const [x, y] = projectCity(opportunity.coordinates[0], opportunity.coordinates[1])
        camera.flyTo(cityFrame(x, y, window.innerWidth, window.innerHeight), 700)
        return
      }
    }
    camera.flyTo(
      currentView === "results" ? resultsFrame(projectResults(resultsRef.current)) : FRAME_IDLE,
      700,
    )
  }, [camera])

  const displayId = selectedId ?? lastId
  const displayOpportunity = displayId
    ? results.find((item) => item.id === displayId) ?? null
    : null

  // El overlay refleja el stage del request (§5/§10).
  const stageIndex =
    request.status === "loading"
      ? Math.max(0, SEARCH_STAGES.findIndex((stage) => stage.id === request.stage))
      : request.status === "error"
        ? -1
        : SEARCH_STAGES.length

  const chips = response
    ? {
        product: response.interpretation.category,
        objective: response.interpretation.objective,
      }
    : null

  const searchMeta = response ? { searchId: response.searchId, generatedAt: response.generatedAt } : null
  const eventFeedDown =
    response !== null && response.dataCoverage.unavailableSources.includes("luma")

  const layerOffClasses = LAYER_ORDER.filter((layer) => !layers.includes(layer))
    .map((layer) => ` layer-off-${layer}`)
    .join("")
  const zoomClasses = `${zoomBand.zoomed ? " zoomed" : ""}${zoomBand.zoomed2 ? " zoomed2" : ""}`
  const compact = view !== "idle"
  const shellClassName = `atlas state-${view}${compact ? " search-compact" : ""}${sheetTall ? " sheet-tall" : ""}${scanning ? " scanning" : ""}${zoomClasses}${layerOffClasses}`

  const requestBanner = <RequestBanner request={request} onRetry={retrySearch} />

  return (
    <div className={shellClassName}>
      {/* Orden del DOM = orden de tab (§12): intake → search → layers → rail →
          marcadores (dentro del mapa) → panel → CTA. El mapa va al fondo por
          z-index, no por orden (todos los overlays tienen z-index explícito). */}
      <AtlasHeader view={view} onReset={resetDemo} />

      <OnboardingIntake onLaunch={launchFromIntake} banner={view === "idle" ? requestBanner : null} />

      <SearchCommand
        value={searchText}
        onValueChange={setSearchText}
        onSearch={runSearch}
        chips={chips}
        inputRef={searchInputRef}
      >
        {view !== "idle" ? requestBanner : null}
      </SearchCommand>

      <LayerControls
        layers={layers}
        onToggleLayer={toggleLayer}
        timeRange={timeRange}
        onTimeRangeChange={changeTimeRange}
        open={layersOpen}
        onOpenChange={setLayersOpen}
      />

      <ResultRail results={results} selectedCityId={selectedId} onSelect={selectCity} onHover={hoverCity} />

      <WorldMap
        camera={camera}
        view={view}
        results={results}
        selectedId={selectedId}
        hoveredId={hoveredId}
        timeRange={timeRange}
        userLocation={userLocation}
        onSelect={selectCity}
        onHover={hoverCity}
      />

      <div className="scan" aria-hidden="true">
        <div className="band" />
        <div className="edge" />
      </div>

      <AnalysisOverlay active={view === "analyzing"} stageIndex={stageIndex} />

      <OpportunityDrawer
        opportunity={displayOpportunity}
        open={view === "selected" || view === "campaign"}
        campaign={view === "campaign"}
        sheetTall={sheetTall}
        onToggleSheet={toggleSheet}
        searchMeta={searchMeta}
        eventFeedDown={eventFeedDown}
        importSlot={
          <EventImport ingest={ingest} onUrlChange={changeIngestUrl} onImport={runImport} />
        }
        onClose={closeSelection}
        onGenerateCampaign={openCampaign}
        onBackToOpportunity={closeCampaign}
        onToast={showToast}
      />

      <div className="zoom-ctl">
        <button className="zoom-btn" type="button" aria-label="Zoom in" onClick={() => camera.zoomBy(ZOOM_STEP)}>
          <Plus size={14} strokeWidth={1.8} />
        </button>
        <button className="zoom-btn" type="button" aria-label="Zoom out" onClick={() => camera.zoomBy(1 / ZOOM_STEP)}>
          <Minus size={14} strokeWidth={1.8} />
        </button>
        <button className="zoom-btn" type="button" aria-label="Reset view" onClick={resetZoom}>
          <RotateCcw size={13} strokeWidth={1.8} />
        </button>
      </div>

      <div className={`toast${toast.visible ? " show" : ""}`} role="status">
        {toast.message}
      </div>
    </div>
  )
}
