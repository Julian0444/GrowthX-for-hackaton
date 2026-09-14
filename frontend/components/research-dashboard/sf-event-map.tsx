"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import type { Map as StreetMap, Marker, Popup } from "maplibre-gl"
import type { ResearchPresentationState } from "../../lib/contracts/evaluation"
import type { EditionDossierRead } from "../../lib/api/atlas-client"
import { groupMapPoints, located, mapOpportunity, type LocatedOpportunity } from "../../lib/research/map-opportunities"
import { dateLabel, latestEdition } from "./research-model"

type Engine = { map: StreetMap; api: typeof import('maplibre-gl') }
type Group = ReturnType<typeof groupMapPoints>[number]
const DEFAULT_STYLE = 'https://tiles.openfreemap.org/styles/liberty'
const SF_CENTER: [number, number] = [-122.425, 37.775]

function LocationPin({ engine, group, selectedId, onSelect }: { engine: Engine; group: Group; selectedId?: string | null; onSelect: (id: string) => void }) {
  const [element] = useState(() => document.createElement('div'))
  const marker = useRef<Marker | null>(null)
  const [lng, lat] = group.coordinates
  useEffect(() => {
    marker.current = new engine.api.Marker({ element, anchor: 'center' }).setLngLat([lng, lat]).addTo(engine.map)
    return () => { marker.current?.remove(); marker.current = null }
  }, [engine, element, lng, lat])
  const selected = group.entries.some(e => e.view.editionId === selectedId)
  const approximate = group.entries.every(e => e.point.approximate)
  const one = group.entries[0]
  return createPortal(<button type="button" className={`sf-location-pin${approximate ? ' approximate' : ''}`} aria-pressed={selected}
    aria-label={group.entries.length > 1 ? `${group.entries.length} events in this area: ${group.entries.map(e => e.view.name).join(', ')}` : `Select on map: ${one.view.name}`}
    data-latitude={lat} data-longitude={lng}
    data-point-edition-id={group.entries.length === 1 ? one.view.editionId : undefined}
    data-group-edition-ids={group.entries.map(e => e.view.editionId).join(',')}
    data-edition-revision-id={group.entries.length === 1 ? one.view.editionRevisionId : undefined}
    onClick={() => onSelect(selected ? selectedId! : one.view.editionId)}>{group.entries.length > 1 ? group.entries.length : approximate ? '≈' : '•'}</button>, element)
}

function EventPopup({ engine, entry, group, onSelect, onEdition, onClose }: { engine: Engine; entry: LocatedOpportunity; group: Group; onSelect: (id: string) => void; onEdition: (id: string) => void; onClose: () => void }) {
  const [element] = useState(() => document.createElement('div'))
  const popup = useRef<Popup | null>(null)
  const { point, view } = entry
  useEffect(() => {
    popup.current = new engine.api.Popup({ closeButton: false, closeOnClick: false, focusAfterOpen: false, maxWidth: '310px', offset: 22 })
      .setLngLat([point.lng, point.lat]).setDOMContent(element).addTo(engine.map)
    return () => { popup.current?.remove(); popup.current = null }
  }, [engine, element, point.lng, point.lat]) // primitives keep pan/poll updates from rebuilding the popup
  return createPortal(<section className="sf-event-popup" aria-label={`Map event: ${view.name}`} data-testid="map-event-popup" data-edition-id={view.editionId} data-edition-revision-id={view.editionRevisionId}>
    <button type="button" className="sf-popup-close" aria-label="Close map popup" onClick={onClose}>×</button>
    {group.entries.length > 1 && <div className="sf-shared-venue"><p>{group.entries.length} events in this area · separate editions</p>{group.entries.map(other => <button className="research-link" type="button" key={other.view.editionId} aria-pressed={view.editionId === other.view.editionId} onClick={() => onSelect(other.view.editionId)}>{other.view.name}</button>)}</div>}
    <h3>{view.name}</h3>
    <p>{dateLabel(latestEdition(entry.read).startDate)}</p>
    <p>{[view.publicLocation.venue, view.publicLocation.originalAddress ?? view.publicLocation.city].filter(Boolean).join(' · ')}</p>
    <p className="sf-location-status">Location {point.status} · {point.precision}{point.approximate ? ' · approximate' : ''}{point.accuracy === 'interpolated' ? ' (interpolated)' : ''}</p>
    <p>{entry.relevance}</p>
    <p className="research-meta">A marker does not confirm access or recommend spending.</p>
    {view.materialNote && <p className="research-meta">{view.materialNote}</p>}
    <div className="research-actions"><button type="button" className="research-button" onClick={() => onEdition(view.editionId)}>Open dossier</button>
      {view.listingLink.href ? <a className="research-link" href={view.listingLink.href} target="_blank" rel="noreferrer">Open event ↗</a> : <span>Event link {view.listingLink.kind === 'synthetic' ? 'test material' : 'unavailable'}</span>}
    </div>
  </section>, element)
}

export function SfEventMap({ editions, selectedEditionId, selection, onSelectEdition, onEdition, relevanceByEdition = {}, onUnavailable, active = true, styleUrl = process.env.NEXT_PUBLIC_SF_MAP_STYLE_URL || DEFAULT_STYLE }: {
  editions: EditionDossierRead[]; selectedEditionId?: string | null; selection?: ResearchPresentationState; onSelectEdition?: (id: string) => void; onEdition: (id: string) => void;
  relevanceByEdition?: Record<string, string>; onUnavailable?: (unavailable: boolean) => void; active?: boolean; styleUrl?: string;
}) {
  const container = useRef<HTMLDivElement>(null)
  const [engine, setEngine] = useState<Engine | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [cameraVersion, setCameraVersion] = useState(0)
  const [dismissed, setDismissed] = useState<string | null>(null)
  const entries = useMemo(() => editions.map(read => mapOpportunity(read, relevanceByEdition[read.editionId])), [editions, relevanceByEdition])
  const points = useMemo(() => entries.filter(located), [entries])
  const pointsRef = useRef(points)
  useEffect(() => { pointsRef.current = points }, [points])
  useEffect(() => { onUnavailable?.(status === 'error') }, [onUnavailable, status])

  useEffect(() => {
    let cancelled = false
    let instance: StreetMap | null = null
    let resize: ResizeObserver | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    const fail = (message: string) => { if (!cancelled) { setStatus('error'); setError(message) } }
    void import('maplibre-gl').then(api => {
      if (cancelled || !container.current) return
      // Pinning the public path to the installed version also avoids stale
      // worker/shared assets after a subsequent release.
      api.setWorkerUrl(`/maplibre/${api.getVersion()}/maplibre-gl-worker.mjs`)
      try {
        const map = new api.Map({ container: container.current, style: styleUrl, center: SF_CENTER, zoom: 11.6,
          attributionControl: false, renderWorldCopies: false, minZoom: 9, maxZoom: 19,
          locale: { 'NavigationControl.ZoomIn': 'Zoom in', 'NavigationControl.ZoomOut': 'Zoom out', 'NavigationControl.ResetBearing': 'Reset bearing to north' } })
        instance = map
        map.addControl(new api.NavigationControl(), 'top-right')
        map.addControl(new api.ScaleControl({ unit: 'metric' }), 'bottom-left')
        map.addControl(new api.AttributionControl({ compact: false }), 'bottom-right')
        map.getCanvas().setAttribute('aria-label', 'San Francisco street map; arrow keys to pan, plus and minus to zoom')
        map.on('load', () => { if (!cancelled) { clearTimeout(timer); setStatus(current => current === 'error' ? current : 'ready') } })
        map.on('error', () => fail('Street map unavailable (style, tiles or labels). The event list and evidence remain available.'))
        map.on('webglcontextlost', () => fail('WebGL connection lost. Use the list or retry the map.'))
        map.on('moveend', () => { if (!cancelled) setCameraVersion(v => v + 1) })
        resize = new ResizeObserver(() => { if (!cancelled) map.resize() })
        resize.observe(container.current)
        timer = setTimeout(() => fail('The map could not finish loading. Check the connection; saved events remain in the list.'), 20000)
        setEngine({ map, api })
      } catch { fail('Could not start the map/WebGL in this browser. The list and evidence remain available.') }
    }).catch(() => fail('Could not load the map viewer. The list and evidence remain available.'))
    return () => { cancelled = true; clearTimeout(timer); resize?.disconnect(); instance?.remove() }
  }, [styleUrl, attempt])

  // Only an explicit selection moves the camera. Receiving another revision,
  // filtering, polling, or adding a result must not interrupt exploration.
  useEffect(() => {
    const point = pointsRef.current.find(e => e.view.editionId === selectedEditionId)?.point
    if (engine && point) engine.map.easeTo({ center: point.geojson.coordinates, zoom: Math.max(engine.map.getZoom(), 14), offset: [0, 100], duration: 350 })
  }, [engine, selectedEditionId, selection])
  useEffect(() => { if (active) engine?.map.resize() }, [active, engine])
  const groups = useMemo(() => { void cameraVersion; return engine ? groupMapPoints(points, coordinates => engine.map.project(coordinates)) : [] }, [engine, points, cameraVersion])
  const selected = points.find(e => e.view.editionId === selectedEditionId)
  const selectedGroup = groups.find(g => g.entries.some(e => e.view.editionId === selectedEditionId))
  function select(id: string) { setDismissed(null); (onSelectEdition ?? onEdition)(id) }
  function fit() {
    if (!engine || !points.length) return
    setDismissed(selectedEditionId ?? null)
    const bounds = new engine.api.LngLatBounds()
    points.forEach(e => bounds.extend(e.point.geojson.coordinates))
    engine.map.fitBounds(bounds, { padding: 65, maxZoom: 15, duration: 350 })
  }
  function retry() { setEngine(null); setError(null); setStatus('loading'); setAttempt(v => v + 1) }
  return <section className="research-map sf-street-map" data-testid="sf-map" data-map-state={status} data-map-point-count={points.length}>
    <div className="sf-map-heading"><h3>SF street map</h3><button type="button" className="research-button" disabled={!engine || !points.length} onClick={fit}>Fit results</button></div>
    <p>● Documented location · ≈ Approximate · Location does not imply a recommendation.</p>
    {status === 'loading' && <p role="status">Loading San Francisco streets…</p>}
    {error && <div className="sf-map-error" role="alert"><p>{error}</p><button type="button" className="research-button" onClick={retry}>Retry map</button></div>}
    <div ref={container} className="sf-map-canvas" data-testid="sf-map-canvas" />
    {engine && groups.map(group => <LocationPin key={group.id} engine={engine} group={group} selectedId={selectedEditionId} onSelect={select} />)}
    {engine && selected && selectedGroup && dismissed !== selectedEditionId && <EventPopup key={selectedEditionId} engine={engine} entry={selected} group={selectedGroup} onSelect={select} onEdition={onEdition} onClose={() => setDismissed(selectedEditionId ?? null)} />}
    <p className="sf-map-count" role="status">{points.length} of {editions.length} events mapped in SF · {editions.length - points.length} without a point in this view.</p>
    {selectedEditionId && !selected && <p>The selected event remains in the list: {entries.find(e => e.view.editionId === selectedEditionId)?.withoutPointReason ?? 'outside the current filters'}.</p>}
  </section>
}
