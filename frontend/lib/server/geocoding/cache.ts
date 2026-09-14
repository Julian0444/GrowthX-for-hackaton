import {createHash} from 'node:crypto';
import type {PublicEventLocation} from '../../contracts/evaluation.ts';
import {withTenantTransaction} from '../db/pool.ts';
import type {SourceReadContext} from '../sources/cache.ts';
import {GeocodingError, normalizeAddress, type Geocoder, type GeocodeMatch} from './census.ts';

export interface LookupResult {matches:GeocodeMatch[]; checkedAt:string; error:string|null; failureCode:string|null; cache:'hit'|'miss'|'not_applicable'}
export async function cachedGeocode(ctx:SourceReadContext, provider:Geocoder, query:string, sourceVersion:string, location:PublicEventLocation):Promise<LookupResult> {
  const key=createHash('sha256').update(JSON.stringify([provider.id,provider.version,normalizeAddress(query),sourceVersion])).digest('hex');
  const pending=(code:string,error:string):LookupResult=>({matches:[],checkedAt:new Date().toISOString(),error,failureCode:code,cache:'not_applicable'});
  const before=await withTenantTransaction(ctx.pool,ctx.tenantId,async client=>{
    if (!(await client.query('select 1 from growthx.runs where id=$1',[ctx.runId])).rowCount) throw Error('Geocoding run unavailable for this tenant.');
    if (!(await client.query("select to_regclass('growthx.location_lookups') as name")).rows[0].name) return pending('migration_required','Geocoding pending: migration 010 is missing from this database.');
    await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[`geo:${ctx.tenantId}:${key}`]);
    const old=(await client.query('select state,output from growthx.location_lookups where cache_key=$1',[key])).rows[0];
    if(old) return old.output ? {...old.output,cache:'hit'} as LookupResult : pending('uncertain','Geocoding query started without a confirmed result; it is not repeated automatically.');
    if(!(await client.query('select growthx.reserve_location_lookup($1) as allowed',[ctx.runId])).rows[0].allowed) return pending('provider_limit','Geocoder limit reached (3/run, 30/day, 1 request/s); address preserved.');
    await client.query("insert into growthx.location_lookups(tenant_id,cache_key,run_id,state) values($1,$2,$3,'started')",[ctx.tenantId,key,ctx.runId]);
    return null;
  });
  if(before)return before;
  let output:LookupResult;
  try {output={matches:await provider.lookup(query,location),checkedAt:new Date().toISOString(),error:null,failureCode:null,cache:'miss'};}
  catch(e){output=pending(e instanceof GeocodingError?e.code:'provider_error',e instanceof GeocodingError?e.message:'The address could not be resolved; details omitted.');output.cache='miss';}
  await withTenantTransaction(ctx.pool,ctx.tenantId,client=>client.query("update growthx.location_lookups set state='completed',output=$2 where cache_key=$1",[key,JSON.stringify(output)]));
  return output;
}
