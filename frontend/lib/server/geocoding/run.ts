import type {BackgroundResult} from '../relationships/durable.ts';
import type {SourceReadContext} from '../sources/cache.ts';
import {withTenantTransaction} from '../db/pool.ts';
import {configuredGeocoder,type Geocoder} from './census.ts';
import {resolveEditionLocation} from './resolve.ts';

// DP-06 persists identities/claims first. DP-08 then resolves those exact
// editions before the worker publishes, without rereading external pages.
export async function resolveRunLocations(ctx:SourceReadContext,result:BackgroundResult,provider?:Geocoder|null):Promise<BackgroundResult> {
  const selected=provider===undefined?(result.material==='synthetic'?null:configuredGeocoder()):provider;
  const editionRevisionIds:string[]=[];
  for(const id of result.editionRevisionIds){
    const input=await withTenantTransaction(ctx.pool,ctx.tenantId,async client=>{
      const row=(await client.query('select payload,load_id from growthx.edition_revisions where id=$1',[id])).rows[0];
      if(!row)throw Error('Research revision unavailable for this tenant.');
      return {editionId:row.payload.editionId as string,editionRevisionId:id,sourceId:row.payload.publicLocation?.sourceIds[0]??'',loadId:row.load_id as string,linkedToExistingEdition:Boolean(row.payload.previousRevisionId),claimRevisionIds:row.payload.claimRevisionIds as string[]};
    });
    editionRevisionIds.push((await resolveEditionLocation(ctx.pool,ctx.tenantId,ctx.runId,input,selected)).editionRevisionId);
  }
  return {...result,editionRevisionIds};
}
