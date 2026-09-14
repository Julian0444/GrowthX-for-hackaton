import { validCoordinates } from '../../research/location-policy.ts';
import type { PublicEventLocation } from '../../contracts/evaluation.ts';

export interface GeocodeMatch {
  coordinates: { lat: number; lng: number };
  precision: 'address' | 'street';
  accuracy: 'interpolated' | 'unknown';
  matchedAddress: string;
  countyGeoid: string;
}
// Each adapter must validate the address and administrative match before
// returning candidates. Multiple candidates are never collapsed to the first.
export interface Geocoder {
  id: string;
  version: string;
  supportsStreet: boolean;
  lookup(query: string, location: PublicEventLocation): Promise<GeocodeMatch[]>;
}
export class GeocodingError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.code=code; }
}
export const normalizeAddress = (value: string) => value.normalize('NFKC').trim().toUpperCase().replace(/[.,]/g, ' ').replace(/\s+/g, ' ')
  .replace(/\bSTREET\b/g, 'ST').replace(/\bAVENUE\b/g, 'AVE').replace(/\bBOULEVARD\b/g, 'BLVD').replace(/\bCALIFORNIA\b/g, 'CA');

// Provider x/y means longitude/latitude. Never auto-swap an invalid pair.
export function parseCensusMatches(value: unknown, location: PublicEventLocation): GeocodeMatch[] {
  const root = value as {result?: {addressMatches?: unknown[]}};
  if (!root?.result || !Array.isArray(root.result.addressMatches)) throw new GeocodingError('invalid_response', 'Invalid geocoding response.');
  // Do not silently pick the first or filter ambiguity down to one candidate.
  if (root.result.addressMatches.length > 1) throw new GeocodingError('ambiguous', 'Multiple matches; address pending.');
  return root.result.addressMatches.map(raw => {
    const m = raw as { coordinates?: {x: number; y: number}; matchedAddress?: string; addressComponents?: {city?: string; state?: string; zip?: string}; geographies?: {Counties?: {GEOID?: string}[]} };
    const point = {lat:m.coordinates?.y as number, lng:m.coordinates?.x as number};
    if (!validCoordinates(point) || typeof m.matchedAddress !== 'string') throw new GeocodingError('invalid_coordinates', 'Invalid provider coordinates; latitude and longitude are not swapped.');
    if (m.addressComponents?.city !== 'SAN FRANCISCO' || m.addressComponents?.state !== 'CA' || m.geographies?.Counties?.length !== 1 || m.geographies.Counties[0].GEOID !== '06075') throw new GeocodingError('outside_sf', 'La coincidencia no acredita San Francisco, California (condado 06075).');
    const street = location.address?.streetAddress;
    if (!street || normalizeAddress(m.matchedAddress.split(',')[0]) !== normalizeAddress(street) || (location.address?.postalCode && m.addressComponents.zip !== location.address.postalCode.slice(0,5))) throw new GeocodingError('address_mismatch', 'The provider returned a different address; review required.');
    return {coordinates:point, precision:'address', accuracy:'interpolated', matchedAddress:m.matchedAddress, countyGeoid:'06075'};
  });
}
export function censusGeocoder(fetchImpl: typeof fetch = fetch, timeoutMs = 10000): Geocoder {
  return {
    id:'us-census', version:'Public_AR_Current/Current_Current;dp08-v1', supportsStreet:false,
    async lookup(query, location) {
      const url = new URL('https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress');
      url.search = new URLSearchParams({address:query, benchmark:'Public_AR_Current', vintage:'Current_Current', layers:'Counties', format:'json'}).toString();
      const controller = new AbortController();
      const timer = setTimeout(()=>controller.abort(), Math.min(10000, Math.max(1,timeoutMs)));
      try {
        const response = await fetchImpl(url, {signal:controller.signal, redirect:'error', headers:{Accept:'application/json','User-Agent':'DemoPuentes-DP08/1.0'}});
        if (!response.ok) throw new GeocodingError('provider_http', `Geocodificador no disponible (HTTP ${response.status}).`);
        const reader = response.body?.getReader();
        if (!reader) throw new GeocodingError('invalid_response','Empty geocoding response.');
        const chunks: Uint8Array[] = []; let size=0;
        for (;;) { const {done,value}=await reader.read(); if(done)break; size+=value.byteLength; if(size>262144){await reader.cancel();throw new GeocodingError('response_too_large','Geocoding response exceeds the limit.');}chunks.push(value); }
        return parseCensusMatches(JSON.parse(Buffer.concat(chunks).toString('utf8')), location);
      } catch (error) {
        if (error instanceof GeocodingError) throw error;
        throw new GeocodingError(controller.signal.aborted?'timeout':'provider_error', controller.signal.aborted?'Geocoder timed out.':'The geocoder could not be reached; the address is preserved.');
      } finally {clearTimeout(timer);}
    },
  };
}
export function configuredGeocoder(): Geocoder | null {
  // Explicit opt-in: no paid fallback, public Nominatim, keys or client config.
  return process.env.GROWTHX_GEOCODER === 'us-census' ? censusGeocoder() : null;
}
