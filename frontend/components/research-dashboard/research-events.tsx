"use client"

import { useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { EditionDossierRead } from '../../lib/api/atlas-client'
import type { ResearchPresentationState } from '../../lib/contracts/evaluation'
import type { AlternativeReading } from '../../lib/contracts/comparison'
import { mapOpportunity, located } from '../../lib/research/map-opportunities'
import { opportunitySummary, stableIds, locationLabel } from '../../lib/research/presentation'
import { SfEventMap } from './sf-event-map'
import { dateLabel, latestEdition } from './research-model'

const wideQuery = '(min-width: 1051px)'
function subscribeViewport(notify: () => void) { const media = window.matchMedia(wideQuery); media.addEventListener('change', notify); return () => media.removeEventListener('change', notify) }
const wideViewport = () => window.matchMedia(wideQuery).matches
const narrowServer = () => false

export function ResearchEvents({ editions, presentation, onSelect, onEdition, compareSelection, compareBusy, onToggleCompare, onCompare, children, contextLabel, onCurrentCatalog, relevanceByEdition = {}, readings = [], pending = false }: {
  editions: EditionDossierRead[]; presentation: ResearchPresentationState; onSelect: (id: string) => void; onEdition: (id: string) => void;
  compareSelection: string[]; compareBusy: boolean; onToggleCompare: (id: string) => void; onCompare: () => void;
  children?: ReactNode; relevanceByEdition?: Record<string, string>; contextLabel: string; onCurrentCatalog?: () => void; readings?: AlternativeReading[]; pending?: boolean;
}) {
  const wide = useSyncExternalStore(subscribeViewport, wideViewport, narrowServer)
  const [mapChoice, setMapOpen] = useState<boolean | null>(null)
  const mapOpen = mapChoice ?? wide
  const [mapVisited, setMapVisited] = useState(false)
  const [mapUnavailable, setMapUnavailable] = useState(false)
  const [query, setQuery] = useState('')
  const [position, setPosition] = useState('all')
  const [order, setOrder] = useState(() => editions.map(e => e.editionId))
  const ids = editions.map(e => e.editionId)
  const nextOrder = stableIds(order, ids)
  if (nextOrder.join('|') !== order.join('|')) setOrder(nextOrder)
  const opportunities = useMemo(() => editions.map(read => mapOpportunity(read, relevanceByEdition[read.editionId])), [editions, relevanceByEdition])
  const filtered = opportunities.filter(e => `${e.view.name} ${e.view.publicLocation.originalAddress ?? ''} ${e.view.publicLocation.venue ?? ''}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) && (position === 'all' || (position === 'located' ? e.point !== null : e.point === null))).sort((a, b) => nextOrder.indexOf(a.read.editionId) - nextOrder.indexOf(b.read.editionId))
  const reads = filtered.map(e => e.read)
  const count = filtered.filter(located).length
  function showMap(id?: string) { setMapVisited(true); setMapOpen(true); if (id) onSelect(id) }
  return <>
    <div className="research-actions sf-results-heading"><h2>Opportunities</h2><div role="group" aria-label="Event view"><button type="button" className="research-button" aria-pressed={!mapOpen} onClick={() => setMapOpen(false)}>List</button><button type="button" className="research-button" aria-pressed={mapOpen} onClick={() => showMap()}>Map</button></div></div>
    <div className="sf-results-filters"><label>Find an event or address<input aria-label="Find an event or address" value={query} onChange={e => setQuery(e.target.value)} type="search" /></label><label>Location<select aria-label="Location" value={position} onChange={e => setPosition(e.target.value)}><option value="all">All events</option><option value="located">With a point in SF</option><option value="unlocated">Without a point in SF</option></select></label></div>
    <div className="results-toolbar"><p role="status" data-testid="event-location-count">{filtered.length} of {editions.length} events · {count} mapped · {filtered.length - count} without a point</p>
      {editions.length > 0 && <div className="research-actions" data-testid="compare-toolbar"><button type="button" className="research-button" disabled={compareBusy || compareSelection.length === 0} onClick={onCompare}>{compareBusy ? 'Starting comparison…' : `Compare selected (${compareSelection.length}/3)`}</button></div>}
    </div>
    <div className="sf-results-layout" data-map-open={mapOpen} data-map-unavailable={mapUnavailable}>
      <div className="sf-results-list"><div className="edition-grid" data-testid="sf-edition-list">{filtered.map(entry => {
        const { read, view } = entry; const e = latestEdition(read); const summary = opportunitySummary(read, readings.find(r => r.editionId === e.editionId))
        return <article className="research-event" key={read.editionId} data-edition-id={read.editionId} data-edition-revision-id={e.id} data-selected={presentation.selectedEditionId === e.editionId} data-source-ids={read.sources.map(s => s.id).sort().join(',')}>
          <div className="event-kicker"><span>{read.validity.validity === 'past' ? 'Past edition · background' : 'Opportunity · confirm conditions'}</span><span>{summary.sourceCount} sources</span></div>
          <h3><button type="button" className="research-link" onClick={() => { onSelect(e.editionId); onEdition(e.editionId) }}>{e.name}</button></h3>
          <p className="event-date">{dateLabel(e.startDate)} · {e.location.name ?? 'City pending'}</p>
          <p className="event-relevance"><b>Why explore:</b> {relevanceByEdition[e.editionId] ?? summary.reason}</p>
          <p className={`event-pending${summary.conflict ? ' research-conflict' : ''}`} data-testid="event-pending"><b>{summary.conflict ? 'Contradiction' : 'To confirm'}:</b> {summary.pending}</p>
          <div className="research-actions event-primary-actions"><button type="button" className="research-button" onClick={() => { onSelect(e.editionId); onEdition(e.editionId) }}>{summary.nextAction}</button>{view.listingLink.href ? <a className="research-link" href={view.listingLink.href} target="_blank" rel="noreferrer">Open event ↗</a> : <span className="research-meta">{view.listingLink.kind === 'synthetic' ? 'Test event · no public page' : 'Event link unavailable'}</span>}</div>
          <div className="event-secondary-actions"><button type="button" className="research-link" aria-pressed={presentation.selectedEditionId === e.editionId} onClick={() => showMap(e.editionId)}>{entry.point ? 'Show on map' : 'Select event without a point'}</button><label className="edition-select"><input type="checkbox" aria-label={`Compare ${e.name}`} checked={compareSelection.includes(read.editionId)} disabled={!compareSelection.includes(read.editionId) && compareSelection.length >= 3} onChange={() => onToggleCompare(read.editionId)} /> Compare</label></div>
          <p className="research-meta" data-testid="event-location-summary">{locationLabel(view.publicLocation, entry.withoutPointReason)}</p>
          {view.listingLink.kind === 'synthetic' && <p className="research-meta">Controlled test material; not live research.</p>}
        </article>
      })}</div>{filtered.length === 0 && <div className="research-empty"><h3>{pending ? 'Research is in progress' : editions.length ? 'No events match these filters' : 'No event evidence yet'}</h3><p>{pending ? 'Event cards appear only after evidence is saved. You can return to this research later.' : editions.length ? 'Clear the search and location filter to see the saved opportunities.' : 'Add a public event URL below, or open a saved investigation. Source pages still awaiting reading are not event recommendations.'}</p>{editions.length > 0 && <button className="research-button" onClick={() => { setQuery(''); setPosition('all') }}>Clear filters</button>}</div>}</div>
      <div className="sf-results-map" hidden={!mapOpen}>{(mapVisited || wide) && <SfEventMap selection={presentation} relevanceByEdition={relevanceByEdition} editions={reads} selectedEditionId={presentation.selectedEditionId} onSelectEdition={onSelect} onEdition={onEdition} active={mapOpen} onUnavailable={setMapUnavailable} />}</div>
    </div>
    <details className="results-context"><summary>Research scope and saved revisions</summary><p data-testid="event-revision-context">{contextLabel}</p>{onCurrentCatalog && <button type="button" className="research-link" onClick={onCurrentCatalog}>View current catalog (separate view)</button>}</details>
    {children}
  </>
}
