import type { ClaimRevision, EventEditionRevision, PublicEventLocation, SourceRecord } from '../contracts/evaluation.ts';
import { locationConflict } from './location-policy.ts';
import { hasAffirmativeSupport } from '../evidence/claim-support.ts';

// Una sola decodificación para lista, dossier, mapa y snapshot. Los registros
// anteriores conservan sus coordenadas, pero no ganan precisión ni procedencia.
export function decodePublicLocation(edition: EventEditionRevision): PublicEventLocation {
  return edition.publicLocation ?? {
    originalAddress: null, address: null, venue: null,
    city: edition.location.scope === 'city' ? edition.location.name : null,
    precision: 'unknown', method: 'unknown', provider: null, resolvedAt: null,
    sourceIds: [], status: 'pending', limitation: 'Registro anterior sin precisión ni procedencia documentada de coordenadas.',
  };
}

export function projectEditionPosition(edition: EventEditionRevision, sources: SourceRecord[], claims: ClaimRevision[]) {
  const location = decodePublicLocation(edition);
  const identity = { editionId: edition.editionId, editionRevisionId: edition.id };
  const conflicted = locationConflict(edition, claims);
  const usable = edition.coordinates && ['venue', 'address', 'street'].includes(location.precision) &&
    location.method !== 'unknown' && hasAffirmativeSupport({ status: location.status, sourceIds: location.sourceIds }) &&
    location.sourceIds.every(id => sources.some(s => s.id === id && s.retrieval?.status !== 'error')) && !conflicted;
  return {
    ...identity, location,
    mapPoint: usable ? { ...identity, ...edition.coordinates!, locationName: location.venue ?? location.originalAddress ?? edition.location.name ?? 'Ubicación publicada', precision: location.precision, status: location.status, method: location.method, accuracy: location.resolution?.accuracy ?? (location.method === 'published_coordinates' ? 'published' : 'unknown'), approximate: location.precision === 'street' || location.resolution?.accuracy === 'interpolated', geojson: { type: 'Point' as const, coordinates: [edition.coordinates!.lng, edition.coordinates!.lat] as [number, number] } } : null,
    withoutPointReason: usable ? null : conflicted ? conflicted : location.status === 'contradicted' ? 'Conflicting location; review sources.' : location.limitation ?? (location.precision === 'city' ? 'City only; venue pending.' : 'No coordinates with sufficient precision and support.'),
  };
}
