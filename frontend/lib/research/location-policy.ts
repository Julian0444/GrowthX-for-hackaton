import type { ClaimRevision, EventEditionRevision, PublicEventLocation } from '../contracts/evaluation.ts';

export const validCoordinates = (p: {lat:number;lng:number}) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat)<=90 && Math.abs(p.lng)<=180;
export const isSfCity = (name: string | null) => /^(san francisco|sf)$/i.test(name?.trim() ?? '');
export function locationConflict(edition: EventEditionRevision, claims: ClaimRevision[]): string | null {
  const l=edition.publicLocation;
  if (!l) return null;
  if (l.status==='contradicted' || claims.some(c=>c.subject.type==='edition' && c.subject.editionId===edition.editionId && ['location','address','venue','coordinates'].includes(c.attribute) && c.status==='contradicted')) return 'Conflicting location; review sources.';
  if (/withheld|hidden|oculta|after acceptance/i.test(l.limitation??'') || claims.some(c=>c.attribute==='location:restriction' && c.value.kind==='text' && /withheld|hidden|after.*(?:acceptance|registration)|shared.*(?:acceptance|registration)/i.test(c.value.text))) return 'Address withheld; venue is not reconstructed.';
  if (/invalid.*coordinates|coordenadas.*inválid/i.test(l.limitation??'')) return 'Invalid published coordinates; review latitude/longitude.';
  const city=l.city ?? l.address?.locality;
  if (city && l.address?.locality && isSfCity(city)!==isSfCity(l.address.locality)) return 'City and address conflict.';
  if (isSfCity(city??null)) {
    if ((l.address?.region && !/^(CA|California)$/i.test(l.address.region)) || (l.address?.country && !/^(US|USA|United States(?: of America)?)$/i.test(l.address.country))) return 'Another San Francisco outside California/US; review the city.';
    const p=edition.coordinates;
    // This is a consistency check against the declared locality, not proof of
    // administrative membership. Geocoded matches additionally require county.
    if (p && (p.lat<37.70 || p.lat>37.84 || p.lng< -122.53 || p.lng> -122.35)) return 'Coordinates conflict with the declared SF location; review latitude/longitude.';
  }
  if (edition.coordinates && !validCoordinates(edition.coordinates)) return 'Coordinates out of range; review latitude/longitude.';
  return null;
}
export function hasSfLocality(l: PublicEventLocation) {
  return isSfCity(l.city ?? l.address?.locality ?? null) && (!l.address?.region || /^(CA|California)$/i.test(l.address.region)) && (!l.address?.country || /^(US|USA|United States(?: of America)?)$/i.test(l.address.country));
}
