import { englishSystemText } from "../../lib/research/english"
import { locationLabel, readableDate } from '../../lib/research/presentation'
import type {PublicEventLocation, SourceRecord} from '../../lib/contracts/evaluation'
import {SourceRecordLinks} from '../atlas/evidence-links'

export function LocationEvidence({location,withoutPointReason,sources}:{location:PublicEventLocation;withoutPointReason:string|null;sources:SourceRecord[]}) {
  const resolution=location.resolution
  return <section aria-label="Location and precision" data-testid="location-evidence">
    <h3>Public location</h3>
    <p>{location.originalAddress ?? location.venue ?? location.city ?? 'Pending'} · {location.status}</p>
    <p>{location.precision}{resolution?.accuracy==='interpolated'?' · approximate (interpolated)':''}</p>
    <p>{locationLabel(location, withoutPointReason)}</p>
    <details><summary>Location provenance</summary><p>{location.method} · {englishSystemText(withoutPointReason ?? location.limitation ?? '')}</p>
      <p>{location.provider ?? 'Provider pending'} · {readableDate(location.resolvedAt ?? resolution?.checkedAt)}</p>
      {resolution?.query && <p>Query: {resolution.query}</p>}
      {resolution?.matchedAddress && <p>Match: {resolution.matchedAddress}</p>}
      {resolution && <p>Cache: {resolution.cache} · {resolution.providerVersion} · {resolution.countyGeoid ? `County ${resolution.countyGeoid}` : 'Locality declared by source'}</p>}
      <SourceRecordLinks compact sources={sources.filter(s=>location.sourceIds.includes(s.id))} />
    </details>
  </section>
}
