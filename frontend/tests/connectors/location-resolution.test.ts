import assert from 'node:assert/strict';
import {test} from 'node:test';
import {censusGeocoder,normalizeAddress,parseCensusMatches} from '../../lib/server/geocoding/census.ts';
import {resolutionPlan} from '../../lib/server/geocoding/resolve.ts';
import {projectEditionPosition} from '../../lib/research/edition-location.ts';
import {parseEventEditionRevision} from '../../lib/contracts/evaluation-validation.ts';
import {extractSource} from '../../lib/server/sources/extract.ts';
import {geoInput,censusResponse,locationHtml} from '../fixtures/location-resolution.ts';

test('DP-08 source coordinates keep explicit lat/lng and GeoJSON lng/lat; announced and confirmed',()=>{
  for(const status of ['announced','confirmed'] as const){const input=geoInput();input.edition.publicLocation!.status=status;input.edition.coordinates={lat:37.7872,lng:-122.3944};input.edition.publicLocation!.method='published_coordinates';input.edition.publicLocation!.precision='address';
    assert.equal(resolutionPlan(input).published,true);
    const p=projectEditionPosition(input.edition,input.sources,input.claims);assert.deepEqual(p.mapPoint?.geojson.coordinates,[-122.3944,37.7872]);assert.equal(p.mapPoint.status,status);
  }
});
test('DP-08 city-only, hidden, address conflict and unsupported legacy location have no point',()=>{
  const city=geoInput();city.edition.publicLocation!.address=null;city.edition.publicLocation!.originalAddress=null;assert.match(resolutionPlan(city).reason!,/City or venue name only/);
  const hidden=geoInput();hidden.edition.publicLocation!.limitation='Address withheld until acceptance';assert.match(resolutionPlan(hidden).reason!,/withheld/);
  const conflict=geoInput();conflict.claims[0].status='contradicted';assert.match(resolutionPlan(conflict).reason!,/Conflicting location/);assert.equal(projectEditionPosition(conflict.edition,conflict.sources,conflict.claims).mapPoint,null);
  const old=geoInput();delete old.edition.publicLocation;old.edition.coordinates={lat:37.78,lng:-122.4};assert.equal(projectEditionPosition(old.edition,old.sources,old.claims).mapPoint,null);
});
test('DP-08 homonym, detectable swapped axes and out-of-range coordinates are never corrected silently',()=>{
  for(const p of [{lat:-122.4,lng:37.78},{lat:91,lng:190},{lat:0,lng:0}]){const input=geoInput();input.edition.coordinates=p;assert.match(resolutionPlan(input).reason!,/Coordinates/);assert.equal(projectEditionPosition(input.edition,input.sources,input.claims).mapPoint,null);}
  const input=geoInput();input.edition.publicLocation!.address!.country='Argentina';assert.match(resolutionPlan(input).reason!,/Another San Francisco/);
  const other=geoInput();other.edition.publicLocation!.city='Oakland';other.edition.publicLocation!.address!.locality='Oakland';assert.equal(resolutionPlan(other).query,null);
});
test('DP-08 Census uses address interpolation and county 06075, not bbox or first match',()=>{
  const l=geoInput().edition.publicLocation!;
  const matches=parseCensusMatches(censusResponse(),l);assert.deepEqual(matches[0].coordinates,{lat:37.7872,lng:-122.3944});assert.equal(matches[0].accuracy,'interpolated');
  const ambiguous=censusResponse();ambiguous.result.addressMatches.push(ambiguous.result.addressMatches[0]);assert.throws(()=>parseCensusMatches(ambiguous,l),/Multiple/);
  const outside=censusResponse();outside.result.addressMatches[0].geographies.Counties[0].GEOID='06001';assert.throws(()=>parseCensusMatches(outside,l),/06075/);
  const wrong=censusResponse();wrong.result.addressMatches[0].matchedAddress='599 FOLSOM ST, SAN FRANCISCO, CA, 94105';assert.throws(()=>parseCensusMatches(wrong,l),/different address/);
  const swap=censusResponse();swap.result.addressMatches[0].coordinates={x:37.78,y:-122.4};assert.throws(()=>parseCensusMatches(swap,l),/Invalid/);
  assert.equal(normalizeAddress(' 501 Folsom Street,  San Francisco, California '),normalizeAddress('501 FOLSOM ST San Francisco CA'));
});
test('DP-08 provider HTTP, redirect, malformed body, oversized body and timeout are bounded and sanitized',async()=>{
  const l=geoInput().edition.publicLocation!;
  for(const [transport,pattern] of [
    [async()=>new Response('bad',{status:503}),/HTTP 503/],
    [async()=>new Response('not json'),/could not be reached/],
    [async()=>new Response('x'.repeat(262145)),/exceeds/],
    [async()=>{throw Error('secret=do-not-leak');},/could not be reached/],
  ] as const)await assert.rejects(censusGeocoder(transport).lookup('501 Folsom St',l),pattern);
  let redirect='';const transport:typeof fetch=async(_url,init)=>{redirect=String(init?.redirect);return Response.json(censusResponse());};await censusGeocoder(transport).lookup('501 Folsom St',l);assert.equal(redirect,'error');
  await assert.rejects(censusGeocoder(async(_url,init)=>new Promise((_resolve,reject)=>init?.signal?.addEventListener('abort',()=>reject(Error('aborted')))),5).lookup('501 Folsom St',l),/timed out/);
});
test('DP-08 resolution metadata validates original claims and legacy contract still decodes',()=>{
  const e=geoInput().edition;assert.equal(parseEventEditionRevision(e).ok,true);
  e.publicLocation!.resolution={outcome:'resolved',query:'501 Folsom St',normalizedQuery:'501 FOLSOM ST',sourceVersion:'hash',claimRevisionIds:['foreign-claim'],checkedAt:'2026-09-10T00:00:00Z',cache:'miss',accuracy:'interpolated',providerVersion:'v1',matchedAddress:'501 Folsom St',countyGeoid:'06075',failureCode:null};
  assert.equal(parseEventEditionRevision(e).ok,false);
});

test('DP-08 reader excludes organizer offices and unrelated maps; hidden and invalid published positions remain pending',()=>{
  const html=locationHtml({street:null}).replace('</body>', '<h2>Organizer office</h2><p>600 California St, San Francisco</p><a href="https://www.google.com/maps/search/?query=37.78,-122.4">Office map</a></body>');
  const office=extractSource(html);assert.equal(office.location?.address?.streetAddress,null);assert.equal(office.coordinates,null);
  const hidden=extractSource(locationHtml({hidden:true,coordinates:{latitude:37.78,longitude:-122.4}}));assert.equal(hidden.location?.originalAddress,null);assert.equal(hidden.coordinates,null);
  const invalid=extractSource(locationHtml({coordinates:{latitude:-122.4,longitude:37.78}}));assert.equal(invalid.coordinates,null);assert.match(invalid.location!.limitation!,/Invalid published/);
});

test('DP-08 same street/number in a different visible city contradicts the source point',()=>{
  const html=locationHtml({coordinates:{latitude:37.7872,longitude:-122.3944}}).replace('</body>', '<h2>Location</h2><p>501 Folsom St, Oakland, CA 94105</p></body>');
  const read=extractSource(html);assert.equal(read.coordinates,null);assert.equal(read.location?.status,'contradicted');assert.ok(read.attributes.some(a=>a.attribute==='address'&&a.status==='contradicted'));
});
