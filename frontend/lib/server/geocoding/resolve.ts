import {createHash} from 'node:crypto';
import type pg from 'pg';
import type {ClaimRevision, EventEditionRevision, LocationResolution, PublicEventLocation, SourceRecord} from '../../contracts/evaluation.ts';
import {parseEventEditionRevision} from '../../contracts/evaluation-validation.ts';
import {hasAffirmativeSupport} from '../../evidence/claim-support.ts';
import {hasSfLocality, locationConflict, validCoordinates} from '../../research/location-policy.ts';
import {withTenantTransaction} from '../db/pool.ts';
import {upsertSources} from '../evidence/store.ts';
import {upsertEditionRevisions} from '../catalog/store.ts';
import type {LumaPersistOutcome} from '../catalog/luma-adapter.ts';
import {cachedGeocode} from './cache.ts';
import {configuredGeocoder, normalizeAddress, type Geocoder} from './census.ts';

export interface ResolutionInput {edition:EventEditionRevision; claims:ClaimRevision[]; sources:SourceRecord[]}
export function resolutionPlan({edition,claims,sources}:ResolutionInput) {
  const location=edition.publicLocation;
  if(!location)return {reason:'Historical record has no location provenance.',query:null,published:false};
  const conflict=locationConflict(edition,claims);
  if(conflict)return {reason:conflict,query:null,published:false};
  if(!hasAffirmativeSupport(location) || !location.sourceIds.length || location.sourceIds.some(id=>!sources.some(s=>s.id===id && s.retrieval?.status!=='error'))) return {reason:'Location lacks sufficient public evidence.',query:null,published:false};
  if(edition.coordinates && validCoordinates(edition.coordinates) && ['venue','address','street'].includes(location.precision) && location.method!=='unknown') return {reason:null,query:null,published:true};
  if(!location.address?.streetAddress)return {reason:location.city?'City or venue name only, without a public address; no venue marker.':'Public address pending.',query:null,published:false};
  if(!hasSfLocality(location))return {reason:'The address does not declare San Francisco, California; SF is not assumed.',query:null,published:false};
  const supportedAddress=claims.some(c=>c.subject.type==='edition' && c.subject.editionId===edition.editionId && c.attribute==='address' && hasAffirmativeSupport(c) && c.sourceIds.some(id=>location.sourceIds.includes(id)));
  if(!supportedAddress)return {reason:'Address has no supported original claim; resolution pending.',query:null,published:false};
  const query=[location.address.streetAddress,location.city??location.address.locality,location.address.region,location.address.postalCode,location.address.country].filter(Boolean).join(', ');
  return {reason:null,query,published:false};
}

// Shared by any producer of an edition; Luma's existing worker invokes it.
// All evidence is append-only. Original source/claims and old snapshots remain.
export async function resolveEditionLocation(pool:pg.Pool,tenantId:string,runId:string,input:LumaPersistOutcome,provider:Geocoder|null=configuredGeocoder()):Promise<LumaPersistOutcome> {
  return withTenantTransaction(pool,tenantId,async client=>{
    const raw=(await client.query('select payload from growthx.edition_revisions where id=$1',[input.editionRevisionId])).rows[0]?.payload;
    if(!raw)throw Error('Geographic edition unavailable for this tenant.');
    const parsed=parseEventEditionRevision(raw);if(!parsed.ok)throw Error('Invalid geographic revision.');
    const edition=parsed.value;
    if(!edition.publicLocation)return input; // Legacy revisions gain no precision.
    await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[`luma-edition:${tenantId}:${edition.canonicalUrl}`]);
    const revisionId=`${edition.id}-geo`;
    const existing=(await client.query('select payload from growthx.edition_revisions where id=$1',[revisionId])).rows[0];
    if(existing)return {...input,editionRevisionId:revisionId};
    // A concurrent newer source must not be overwritten by a late resolution.
    if((await client.query('select 1 from growthx.edition_revisions where payload->>\'previousRevisionId\'=$1',[edition.id])).rowCount)return input;
    const claims:ClaimRevision[]=(await client.query('select payload from growthx.claim_revisions where id=any($1::text[])',[edition.claimRevisionIds])).rows.map(r=>r.payload);
    const sources:SourceRecord[]=(await client.query('select payload from growthx.sources where id=any($1::text[])',[edition.publicLocation.sourceIds])).rows.map(r=>r.payload);
    const sourceVersion=createHash('sha256').update(JSON.stringify([sources.some(s=>s.method.includes('test_fixture'))?'synthetic':'real',sources.map(s=>[s.canonicalUrl??s.url,s.content]).sort()])).digest('hex');
    const originalClaims=claims.filter(c=>['address','venue','location','coordinates'].includes(c.attribute) && c.subject.type==='edition' && c.subject.editionId===edition.editionId).map(c=>c.id);
    const plan=resolutionPlan({edition,claims,sources});
    // The source revision already carries published precision/provenance (or
    // a retained geocode). Reuse it without another lookup or redundant revision.
    if(plan.published)return input;
    const location:PublicEventLocation=structuredClone(edition.publicLocation);
    const resolution:LocationResolution={outcome:'pending',query:plan.query,normalizedQuery:plan.query?normalizeAddress(plan.query):null,sourceVersion,claimRevisionIds:originalClaims,checkedAt:new Date().toISOString(),cache:'not_applicable',accuracy:'unknown',providerVersion:null,matchedAddress:null,countyGeoid:null,failureCode:null};
    let coordinates:EventEditionRevision['coordinates']=null;
    let reason=plan.reason;
    if(plan.query) {
      if(!provider){reason='Geocoding is disabled on the server; the public address is preserved.';resolution.failureCode='disabled';}
      else if(!/^\d+[A-Z]?(?:-\d+)?\s/i.test(location.address!.streetAddress!) && !provider.supportsStreet){reason='Street has no number: the provider requires one; no unambiguous match means no marker.';resolution.failureCode='street_unresolved';}
      else {
        const result=await cachedGeocode({pool,tenantId,runId},provider,plan.query,sourceVersion,location);
        Object.assign(resolution,{cache:result.cache,checkedAt:result.checkedAt,providerVersion:provider.version,failureCode:result.failureCode});
        location.provider=provider.id;
        const match=result.matches.length===1?result.matches[0]:null;
        if(result.error){reason=result.error;resolution.outcome='failed';}
        else if(!match){reason=result.matches.length?'Multiple matches; location pending.':'No address match; location pending.';resolution.failureCode=result.matches.length?'ambiguous':'no_match';}
        else if(!validCoordinates(match.coordinates) || match.countyGeoid!=='06075' || (match.precision==='address' && !/^\d+/.test(location.address!.streetAddress!))){reason='The match lacks sufficient precision or administrative location evidence.';resolution.failureCode='invalid_match';}
        else {
          coordinates=match.coordinates;
          Object.assign(resolution,{outcome:'resolved',accuracy:match.accuracy,matchedAddress:match.matchedAddress,countyGeoid:match.countyGeoid});
          Object.assign(location,{method:'geocoded',precision:match.precision,resolvedAt:result.checkedAt});
          reason=match.accuracy==='interpolated'?'Address interpolated along a street range; entrance and metric accuracy are unverified. Geocoding does not confirm the event or access.':'Approximate street location; does not identify an exact venue.';
        }
        const id=`${edition.id}-geo-source`;
        const excerpt=JSON.stringify({provider:provider.id,...resolution,coordinates,limitation:reason});
        const source:SourceRecord={contractVersion:'1',id,url:provider.id==='us-census'?'https://geocoding.geo.census.gov/geocoder/':null,locator:'Public address query for this edition',provider:provider.id,collector:'growthx-worker',fetchedAt:result.checkedAt,publishedAt:null,method:'address_geocoding',geoScope:'city',content:{kind:'excerpt',excerpt},usageRestrictions:[provider.id==='us-census'?'US Census public-domain data; cite U.S. Census Bureau. Address-range interpolation, not rooftop.':'Controlled adapter in this build; storage terms must be reviewed before enabling another real provider.'],retrieval:{status:'obtained',freshness:'unknown',limitation:reason}};
        await upsertSources(client,tenantId,[source],input.loadId);
        location.sourceIds=[...new Set([...location.sourceIds,id])];
      }
    }
    if(!coordinates){location.precision=location.city?'city':'unknown';location.method='unknown';location.resolvedAt=null;}
    if (resolution.claimRevisionIds.length) {
      const refs=(await client.query('select payload from growthx.claim_revisions where id=any($1::text[])',[resolution.claimRevisionIds])).rows;
      if(refs.length!==new Set(resolution.claimRevisionIds).size || refs.some(r=>r.payload.subject.type!=='edition'||r.payload.subject.editionId!==edition.editionId)) throw Error('Location claims unavailable for this edition or tenant.');
    }
    location.resolution=resolution;
    location.limitation=reason??location.limitation;
    const revised={...edition,id:revisionId,coordinates,publicLocation:location,previousRevisionId:edition.id,revisedAt:new Date().toISOString()};
    await upsertEditionRevisions(client,tenantId,[revised],input.loadId);
    return {...input,editionRevisionId:revisionId};
  });
}
