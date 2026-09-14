import { createHash, randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { EventEditionRevision, OrganizerRevision } from '../../contracts/evaluation.ts';
import { parseClaimRevision, parseCompanyRecord, parseEventEditionRevision, parseOrganizerRevision, parseSourceRecord, type ValidationResult } from '../../contracts/evaluation-validation.ts';
import { withTenantTransaction } from '../db/pool.ts';
import { upsertCompanies, upsertEditionRevisions, upsertOrganizerRevisions } from '../catalog/store.ts';
import { orderRevisionChain, upsertClaimRevisions, upsertSources, CatalogIntegrityError } from '../evidence/store.ts';
import { cachedSourceRead, type SourceReadContext } from '../sources/cache.ts';
import { canonicalKnownSourceUrl, parseKnownSourceRead, readKnownSource, SourceReadError, type KnownSourceRead, type SourceReadOptions } from '../sources/reader.ts';
import { readProposedSource } from '../sources/proposed-source.ts';
import { referenceSourceHints } from './reference-sources.ts';
import { editionYear, resolveBackground, stableId, type ResolvedBackground } from './resolve.ts';
import { transactionalEvaluationQueue, type EvaluationQueue } from '../evaluations/queue.ts';
import { readDiscovery } from '../discovery/durable.ts';
import type { AcceptOutcome } from '../evaluations/service.ts';

import { BACKGROUND_WORKFLOW, type BackgroundResult } from '../../contracts/background.ts';
export { BACKGROUND_WORKFLOW, type BackgroundResult } from '../../contracts/background.ts';
export const BACKGROUND_STEPS=['validate_profile','read_relationship_sources','persist_relationships','publish_result'] as const;
export interface BackgroundRequest {profileRunId:string;idempotencyKey:string;url?:string;proposedSourceId?:string}
export interface BackgroundInput {url:string;profileRunId:string;proposedSourceId:string|null}
export interface BackgroundRead {primaryUrl:string;pages:KnownSourceRead[];limitations:string[];attemptedUrls:string[]}

export function parseBackgroundRequest(value:unknown):BackgroundRequest|null {
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const p=value as Record<string,unknown>;
  if(Object.keys(p).some(k=>!['profileRunId','idempotencyKey','url','proposedSourceId'].includes(k)))return null;
  if(typeof p.profileRunId!=='string'||!/^[a-f0-9-]{36}$/i.test(p.profileRunId)||typeof p.idempotencyKey!=='string'||p.idempotencyKey.length<8||p.idempotencyKey.length>200)return null;
  if((typeof p.url==='string')===(typeof p.proposedSourceId==='string'))return null;
  if(typeof p.proposedSourceId==='string'&&!/^[a-zA-Z0-9._-]{1,120}$/.test(p.proposedSourceId))return null;
  try {if(typeof p.url==='string')return {profileRunId:p.profileRunId,idempotencyKey:p.idempotencyKey,url:canonicalKnownSourceUrl(p.url)};}catch{return null;}
  return {profileRunId:p.profileRunId,idempotencyKey:p.idempotencyKey,proposedSourceId:p.proposedSourceId as string};
}
export async function acceptBackground(pool:pg.Pool,tenantId:string,userId:string,body:BackgroundRequest,queue:EvaluationQueue=transactionalEvaluationQueue):Promise<AcceptOutcome>{
  const validated=parseBackgroundRequest(body);
  if(!validated)return {status:'invalid_profile',issues:['Invalid background research request.']};
  body=validated;
  const hash=createHash('sha256').update(JSON.stringify([body.profileRunId,body.url??null,body.proposedSourceId??null])).digest('hex');
  return withTenantTransaction(pool,tenantId,async client=>{
    await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[`background-accept:${tenantId}:${body.idempotencyKey}`]);
    const old=(await client.query('select id,payload_hash from growthx.runs where idempotency_key=$1',[body.idempotencyKey])).rows[0];
    if(old)return old.payload_hash===hash?{status:'duplicate',runId:old.id}:{status:'conflict'};
    const parent=(await client.query('select profile_id,workflow_version from growthx.runs where id=$1',[body.profileRunId])).rows[0];
    if(!parent)return {status:'invalid_profile',issues:['Research profile not available in this session.']};
    let url=body.url;
    if(body.proposedSourceId){
      // The source MUST originate from this discovery run, not any tenant URL.
      const source=(await readDiscovery(client,body.profileRunId))?.sources.find(s=>s.id===body.proposedSourceId);
      if(!source||!['exa_search','test_fixture+exa_search'].includes(source.method))return {status:'invalid_profile',issues:['Proposed source not available in this discovery run.']};
      try{url=canonicalKnownSourceUrl(source.canonicalUrl??source.url??'');}catch{return {status:'invalid_profile',issues:['This source host is not supported by the bounded reader yet.']};}
    }
    if(!url)return {status:'invalid_profile',issues:['A source URL is required.']};
    const runId=randomUUID();
    const input:BackgroundInput={url,profileRunId:body.profileRunId,proposedSourceId:body.proposedSourceId??null};
    await client.query(`insert into growthx.runs(id,tenant_id,profile_id,requested_by,mode,input,state,workflow_version,contract_version,idempotency_key,payload_hash) values($1,$2,$3,$4,'event_evaluation',$5,'queued',$6,'1',$7,$8)`,[runId,tenantId,parent.profile_id,userId,JSON.stringify(input),BACKGROUND_WORKFLOW,body.idempotencyKey,hash]);
    for(const [i,name]of BACKGROUND_STEPS.entries())await client.query('insert into growthx.run_steps(tenant_id,run_id,seq,name) values($1,$2,$3,$4)',[tenantId,runId,i+1,name]);
    await queue.sendRunJob(client,{tenantId,runId});return {status:'accepted',runId};
  });
}
export async function readBackground(ctx:SourceReadContext,options:SourceReadOptions={}):Promise<BackgroundRead>{
  const {input,startedAt}=await withTenantTransaction(ctx.pool,ctx.tenantId,async c=>{
    const row=(await c.query(`select r.input,s.started_at from growthx.runs r join growthx.run_steps s on s.run_id=r.id where r.id=$1 and s.name='read_relationship_sources'`,[ctx.runId])).rows[0];
    if(!row)throw new SourceReadError('Background research unavailable in this tenant.');
    return {input:row.input as BackgroundInput,startedAt:new Date(row.started_at??Date.now()).getTime()};
  });
  const result:BackgroundRead={primaryUrl:input.url,pages:[],limitations:[],attemptedUrls:[]};
  // Six pages total, shared DP-05 cache and at most 90 persisted wall seconds.
  // No additional paid calls: DP-04's background queries are reused as hints.
  const queue=[input.url,...referenceSourceHints(input.url)].map(canonicalKnownSourceUrl);
  const discovery=await withTenantTransaction(ctx.pool,ctx.tenantId,client=>readDiscovery(client,input.profileRunId));
  if(discovery){
    const backgroundIds=new Set(discovery.plan.queries.filter(q=>q.purpose==='background').map(q=>q.id));
    for(const candidate of discovery.candidates.filter(c=>c.queryIds.some(id=>backgroundIds.has(id)))){
      try{const url=canonicalKnownSourceUrl(candidate.canonicalUrl);if(!queue.includes(url)&&queue.length<12)queue.push(url);}catch{/* Unsupported proposal remains in discovery with reading pending. */}
    }
  }
  for(let index=0;index<queue.length&&result.attemptedUrls.length<6;index++){
    const url=queue[index];if(result.attemptedUrls.includes(url))continue;
    const sourceRunId=index===0&&input.proposedSourceId?input.profileRunId:ctx.runId;
    const persisted=await withTenantTransaction(ctx.pool,ctx.tenantId,async c=>(await c.query('select state,error,output from growthx.source_reads where run_id=$1 and canonical_url=$2',[sourceRunId,url])).rows[0]);
    const remaining=90_000-(Date.now()-startedAt);
    // The deadline prevents fresh requests, not recovery of already committed
    // evidence after a worker interruption. Proposal reads belong to DP-04's
    // run, so their failed attempts must be checked there as well.
    if(remaining<=0&&!persisted?.output&&persisted?.state!=='failed'){
      const limitation='Research deadline reached; remaining pages were not read.';
      if(!result.limitations.includes(limitation))result.limitations.push(limitation);
      if(persisted)result.attemptedUrls.push(url);
      continue;
    }
    result.attemptedUrls.push(url);
    const readOptions={...options,timeoutMs:Math.max(1,Math.min(options.timeoutMs??10_000,remaining))};
    try{
      // Failed attempts are terminal within this run, including after restart.
      if(persisted?.state==='failed')throw new SourceReadError(persisted.error??'Previous reading attempt failed.');
      const page=index===0&&input.proposedSourceId
        ? (await readProposedSource({...ctx,runId:input.profileRunId},input.proposedSourceId,readOptions)).reading
        : await cachedSourceRead(ctx,url,()=>readKnownSource(url,readOptions),parseKnownSourceRead,readOptions);
      result.pages.push(page);
      if(page.reading.cache==='stale_fallback')result.limitations.push(`Stale evidence retained: ${url}. ${page.reading.limitation}`);
      // Follow only explicit relevant links under the reader's allowlist.
      for(const link of page.relationshipContent?.links??[]){
        if(!/Winners|Projects|Showcase|Results|organizers|initiative/i.test(link.text))continue;
        try{const next=canonicalKnownSourceUrl(link.url);if(!queue.includes(next)&&queue.length<12)queue.push(next);}catch{/* unsupported hosts stay links, not network requests */}
      }
    }catch(error){result.limitations.push(`${url}: ${error instanceof SourceReadError?error.message:'Reading unavailable; provider details omitted.'}`);}
  }
  if(result.attemptedUrls.length>=6&&queue.some(url=>!result.attemptedUrls.includes(url)))result.limitations.push('Six-page limit; additional linked sources were not reviewed.');
  return result;
}
export function parseBackgroundRead(value:unknown):BackgroundRead {
  if(!value||typeof value!=='object')throw new Error('Invalid persisted background reading');
  const v=value as BackgroundRead;
  if(typeof v.primaryUrl!=='string'||!Array.isArray(v.pages)||v.pages.length>6||!Array.isArray(v.limitations)||!v.limitations.every(x=>typeof x==='string')||!Array.isArray(v.attemptedUrls)||v.attemptedUrls.length>6||!v.attemptedUrls.every(x=>typeof x==='string'))throw new Error('Invalid persisted background reading');
  canonicalKnownSourceUrl(v.primaryUrl);v.pages.forEach(parseKnownSourceRead);return v;
}
function valid<T>(r:ValidationResult<T>):T {if(!r.ok)throw new CatalogIntegrityError(r.issues.map(i=>`${i.path}: ${i.message}`));return r.value;}
function head<T extends {id:string;previousRevisionId:string|null;revisedAt:string}>(rows:T[]):T|undefined {return rows.length?orderRevisionChain(rows,r=>r.revisedAt).at(-1):undefined;}

export async function persistBackground(ctx:SourceReadContext,resolved:ResolvedBackground,read:BackgroundRead):Promise<BackgroundResult>{
  return withTenantTransaction(ctx.pool,ctx.tenantId,async client=>{
    await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[`background-catalog:${ctx.tenantId}`]);
    const hash=stableId('background-load',ctx.runId);
    const prior=(await client.query('select summary from growthx.catalog_loads where manifest_hash=$1',[hash])).rows[0];
    if(prior)return prior.summary as BackgroundResult;
    if(!(await client.query('select 1 from growthx.runs where id=$1',[ctx.runId])).rows.length)throw new CatalogIntegrityError(['Run unavailable under tenant.']);
    const m=structuredClone(resolved.manifest);
    // Same lock as the Luma importer. Re-read latest revisions AFTER locking;
    // preserve DP-08 location changes and any earlier supported claims.
    for(const url of m.editions.map(e=>e.canonicalUrl).filter((u):u is string=>Boolean(u)).sort())await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[`luma-edition:${ctx.tenantId}:${url}`]);
    const rows=(await client.query('select payload from growthx.edition_revisions')).rows;
    const grouped=new Map<string,EventEditionRevision[]>();
    for(const row of rows){const e=valid(parseEventEditionRevision(row.payload));grouped.set(e.editionId,[...grouped.get(e.editionId)??[],e]);}
    const latest=[...grouped.values()].map(es=>head(es)!);
    const mapping=new Map<string,string>();
    for(const e of m.editions){const existing=latest.find(old=>old.canonicalUrl===e.canonicalUrl&&editionYear(old.startDate)===editionYear(e.startDate));if(existing)mapping.set(e.editionId,existing.editionId);}
    const claimMapping=new Map<string,string>();
    for(const c of m.claims){if(c.subject.type==='edition')c.subject.editionId=mapping.get(c.subject.editionId)??c.subject.editionId;
      const subjectId=c.subject.type==='edition'?c.subject.editionId:c.subject.type==='organizer'?c.subject.organizerId:'';
      c.claimId=stableId('background-claim',`${subjectId}:${c.attribute}`);const oldId=c.id;c.id=stableId('background-claim-rev',`${ctx.runId}:${c.claimId}`);claimMapping.set(oldId,c.id);
    }
    for(const e of m.editions){e.editionId=mapping.get(e.editionId)??e.editionId;e.id=stableId('edition-rev',`${ctx.runId}:${e.editionId}`);e.claimRevisionIds=e.claimRevisionIds.map(id=>claimMapping.get(id)??id);for(const r of e.relationships??[]){r.editionId=e.editionId;r.claimRevisionIds=r.claimRevisionIds.map(id=>claimMapping.get(id)??id);}}
    for(const o of m.organizers)o.claimRevisionIds=o.claimRevisionIds.map(id=>claimMapping.get(id)??id);
    const oldClaims=(await client.query('select payload from growthx.claim_revisions')).rows.map(r=>valid(parseClaimRevision(r.payload)));
    for(const c of m.claims){
      const subject=c.subject;
      const pinned=subject.type==='edition'?latest.find(e=>e.editionId===subject.editionId)?.claimRevisionIds:undefined;
      const predecessor=pinned?oldClaims.find(old=>pinned.includes(old.id)&&old.attribute===c.attribute):undefined;
      // Reuse an existing importer's claim identity for this attribute. A
      // second chain would leave two competing "latest" dates/audiences in
      // readers and comparisons even though the edition identity was reused.
      if(predecessor){c.claimId=predecessor.claimId;c.previousRevisionId=predecessor.id;}
      else {const chain=oldClaims.filter(old=>old.claimId===c.claimId);if(chain.length)c.previousRevisionId=orderRevisionChain(chain,r=>r.reviewedAt).at(-1)!.id;}
    }
    for(const e of m.editions){const old=latest.find(old=>old.editionId===e.editionId);if(!old)continue;e.previousRevisionId=old.id;
      const newAttrs=new Set(m.claims.filter(c=>c.subject.type==='edition'&&c.subject.editionId===e.editionId).map(c=>c.attribute));
      // Missing fields don't erase earlier evidence, and pending defaults don't
      // bury a previously supported value. Fresh contradictions stay visible.
      for(const id of old.claimRevisionIds){const c=oldClaims.find(c=>c.id===id);if(!c)continue;const fresh=m.claims.find(n=>n.subject.type==='edition'&&n.subject.editionId===e.editionId&&n.attribute===c.attribute);if(fresh?.status==='pending'&&c.status!=='pending'){m.claims=m.claims.filter(n=>n.id!==fresh.id);e.claimRevisionIds=e.claimRevisionIds.filter(n=>n!==fresh.id);e.claimRevisionIds.push(id);}else if(!newAttrs.has(c.attribute))e.claimRevisionIds.push(id);}
      const freshKeys=new Set(e.relationships!.map(r=>JSON.stringify([r.entity,r.role,r.scope])));e.relationships=[...e.relationships!,...(old.relationships??[]).filter(r=>!freshKeys.has(JSON.stringify([r.entity,r.role,r.scope])))];
      e.claimRevisionIds=[...new Set([...e.claimRevisionIds,...e.relationships.flatMap(r=>r.claimRevisionIds)])];
      e.organizerIds=[...new Set([...old.organizerIds,...e.organizerIds])];
      if(!e.publicLocation||e.publicLocation.method==='unknown'&&old.publicLocation?.method==='geocoded'&&e.publicLocation.status!=='contradicted'&&e.publicLocation.originalAddress===old.publicLocation.originalAddress){e.publicLocation=old.publicLocation;e.coordinates=old.coordinates;e.location=old.location;}
      if(e.location.scope==='unknown')e.location=old.location;
    }
    for(const o of m.organizers){const oldRows=(await client.query('select payload from growthx.organizer_revisions where organizer_id=$1',[o.organizerId])).rows.map(r=>valid(parseOrganizerRevision(r.payload)));const old=head<OrganizerRevision>(oldRows);if(old){o.previousRevisionId=old.id;const attrs=new Set(m.claims.filter(c=>c.subject.type==='organizer'&&c.subject.organizerId===o.organizerId).map(c=>c.attribute));o.claimRevisionIds=[...o.claimRevisionIds,...old.claimRevisionIds.filter(id=>!attrs.has(oldClaims.find(c=>c.id===id)?.attribute??''))];}}
    const load=(await client.query(`insert into growthx.catalog_loads(tenant_id,manifest_name,manifest_hash,material,authorized_by,verified_at,note,summary) values($1,$2,$3,$4,$5,$6,$7,'{}') returning id`,[ctx.tenantId,m.name,hash,m.material,m.authorizedBy,m.verifiedAt,m.note])).rows[0].id;
    await upsertSources(client,ctx.tenantId,m.sources.map(s=>valid(parseSourceRecord(s))),load);
    await upsertCompanies(client,ctx.tenantId,m.companies.map(c=>valid(parseCompanyRecord(c))),load);
    await upsertOrganizerRevisions(client,ctx.tenantId,m.organizers.map(o=>valid(parseOrganizerRevision(o))),load);
    await upsertEditionRevisions(client,ctx.tenantId,m.editions.map(e=>valid(parseEventEditionRevision(e))),load);
    await upsertClaimRevisions(client,ctx.tenantId,m.claims,load);
    // Deferred reference validation: all relationship claims belong to the
    // specified edition and all refs exist under RLS, including old revisions.
    for(const e of m.editions)for(const r of e.relationships??[]){const claims=(await client.query('select subject_type,subject_id from growthx.claim_revisions where id=any($1)',[r.claimRevisionIds])).rows;if(claims.length!==new Set(r.claimRevisionIds).size||claims.some(c=>c.subject_type!=='edition'||c.subject_id!==e.editionId))throw new CatalogIntegrityError(['Relationship claims must belong to the linked edition.']);}
    const editionId=resolved.primaryEditionId?(mapping.get(resolved.primaryEditionId)??resolved.primaryEditionId):null;
    const result:BackgroundResult={kind:'background_research',version:1,editionId,editionRevisionIds:m.editions.map(e=>e.id),organizerIds:m.organizers.map(o=>o.organizerId),status:!editionId?'insufficient':resolved.limitations.length?'partial':'completed',limitations:resolved.limitations,sourceCount:m.sources.length,attemptedUrls:read.attemptedUrls,material:m.material==='synthetic'?'synthetic':'imported'};
    await client.query('update growthx.catalog_loads set summary=$2 where id=$1',[load,JSON.stringify(result)]);return result;
  });
}
export { resolveBackground };
