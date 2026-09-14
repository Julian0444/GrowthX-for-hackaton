// Optional directed fallback. The DP-01 native sample currently does not need
// this Actor. Callers must supply a material-gap reason; it is never launched
// merely because APIFY_TOKEN exists or a page says to launch it.
import { createHash } from 'node:crypto';
import type { ProviderConsumption } from '../../contracts/evaluation.ts';
import { parseProviderConsumption } from '../../contracts/evaluation-validation.ts';
import type { SourceReadContext } from './cache.ts';
import { canonicalKnownSourceUrl, readBodyCapped, readingFromHtml, parseKnownSourceRead, SourceReadError, type KnownSourceRead } from './reader.ts';

const BASE='https://api.apify.com/v2';
export const WEBSITE_CRAWLER='apify~website-content-crawler';
export const CRAWLER_LIMITS={maxPages:1,maxDepth:0,memoryMb:1024,timeoutSeconds:120,maxTotalChargeUsd:0.25,reservationUsd:1} as const;
export interface CrawlerOptions {
  materialGap: string;
  token?: string;
  fetchImpl?: typeof fetch;
  isFixture?: true;
  testBarrier?: (point:string)=>void;
}
export interface CrawlerResult {
  state:'running'|'succeeded'|'failed'|'uncertain'|'unavailable';
  actorRunId:string|null;
  actorStatus:string|null;
  reading:KnownSourceRead|null;
  consumption:ProviderConsumption|null;
  limitation:string|null;
}
const obj=(v:unknown):Record<string,unknown>|null=>typeof v==='object'&&v!==null&&!Array.isArray(v)?v as Record<string,unknown>:null;
const escapeHtml=(s:string)=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');

export async function runWebsiteCrawler(ctx:SourceReadContext,url:string,options:CrawlerOptions):Promise<CrawlerResult> {
  const canonical=canonicalKnownSourceUrl(url);
  const unavailable=(limitation:string):CrawlerResult=>({state:'unavailable',actorRunId:null,actorStatus:null,reading:null,consumption:null,limitation});
  if (!options.materialGap.trim()) return unavailable('A material content gap is required before running the Actor.');
  const token=options.token??process.env.APIFY_TOKEN;
  if (!token?.trim()) return unavailable('APIFY_TOKEN is not configured; native partial results are retained.');
  const client=await ctx.pool.connect(); let locked=false;
  const lock=`source-actor:${ctx.tenantId}:${ctx.runId}`;
  const tx=async<T>(work:()=>Promise<T>):Promise<T>=>{
    await client.query('begin');
    try { await client.query("select set_config('growthx.tenant_id',$1,true)",[ctx.tenantId]);const result=await work();await client.query('commit');return result; }
    catch(e){await client.query('rollback');throw e;}
  };
  try {
    if(!(await client.query("select to_regclass('growthx.source_actor_operations') as name")).rows[0].name)return unavailable('Durable Actor storage unavailable; apply migration 008 before using Apify.');
    locked=(await client.query('select pg_try_advisory_lock(hashtextextended($1,0)) as locked',[lock])).rows[0].locked;
    if(!locked)return unavailable('Actor operation already has an active worker; retry later.');
    const operationId=`source-actor-${createHash('sha256').update(`${ctx.runId}:${canonical}`).digest('hex').slice(0,24)}`;
    const existing=await tx(async()=>{
      const row=(await client.query('select * from growthx.source_actor_operations where run_id=$1 and canonical_url=$2',[ctx.runId,canonical])).rows[0];
      if(row)return {row,created:false};
      const remaining=(await client.query('select growthx.reserve_source_actor($1) as remaining',[ctx.runId])).rows[0].remaining;
      if(remaining===null)return null;
      const consumption:ProviderConsumption={provider:'apify',runId:ctx.runId,operationId,requests:{status:'unknown',reason:'Actor start reserved; dispatch may be interrupted.'},cost:{status:'unknown',reason:'Actor cost not reported yet; USD 1 reservation retained.'},recordedAt:new Date().toISOString()};
      const inserted=await client.query("insert into growthx.source_actor_operations(tenant_id,run_id,canonical_url,state,consumption) values($1,$2,$3,'reserved',$4) returning *",[ctx.tenantId,ctx.runId,canonical,JSON.stringify(consumption)]);
      return {row:inserted.rows[0],created:true};
    });
    if(!existing)return unavailable('Shared Apify allowance exhausted, suspended, or one-Actor-per-run limit reached.');
    const row=existing.row;
    const parsed=parseProviderConsumption(row.consumption);
    if(!parsed.ok)throw new Error('Invalid persisted Actor consumption');
    const result:CrawlerResult={state:row.state,actorRunId:row.actor_run_id,actorStatus:row.actor_status,reading:row.output?parseKnownSourceRead(row.output):null,consumption:parsed.value,limitation:row.limitation};
    const save=async()=>tx(async()=>{
      await client.query('update growthx.source_actor_operations set state=$3,actor_run_id=$4,actor_status=$5,output=$6,consumption=$7,limitation=$8,updated_at=now() where run_id=$1 and canonical_url=$2',[ctx.runId,canonical,result.state,result.actorRunId,result.actorStatus,result.reading?JSON.stringify(result.reading):null,JSON.stringify(result.consumption),result.limitation]);
    });
    if(!existing.created&&row.state==='reserved'){
      result.state='uncertain';result.limitation='Worker stopped before the Actor run ID was committed. Start was not repeated; charge remains unknown.';await save();return result;
    }
    if(['succeeded','failed','uncertain'].includes(result.state))return result;
    const request=async(path:string,init:RequestInit={})=>{
      const response=await (options.fetchImpl??fetch)(`${BASE}${path}`,{...init,headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},redirect:'error',signal:AbortSignal.timeout(25_000)});
      if(!response.ok){await response.body?.cancel();throw new SourceReadError(`Apify HTTP ${response.status}; provider body omitted.`);}
      return JSON.parse(await readBodyCapped(response,2_000_000)) as unknown;
    };
    if(existing.created){
      options.testBarrier?.('actor:reserved');
      try{
        const input={startUrls:[{url:canonical}],crawlerType:'playwright:firefox',maxCrawlPages:1,maxCrawlDepth:0,maxConcurrency:1,maxRequestRetries:0,requestTimeoutSecs:45,useSitemaps:false,useLlmsTxt:false,saveMarkdown:true,saveHtml:false,saveHtmlAsFile:false,saveFiles:false,saveContentTypes:[],summarize:false,proxyConfiguration:{useApifyProxy:false}};
        const payload=obj(await request(`/actors/${WEBSITE_CRAWLER}/runs?memory=1024&timeout=120&maxTotalChargeUsd=0.25`,{method:'POST',body:JSON.stringify(input)}));
        const run=obj(payload?.data);
        if(typeof run?.id!=='string'||!(/^[A-Za-z0-9]+$/.test(run.id)))throw new SourceReadError('Apify returned no valid run ID.');
        result.actorRunId=run.id;result.actorStatus=typeof run.status==='string'?run.status:'READY';result.state='running';
      }catch{result.state='uncertain';result.limitation='Actor start response unavailable; request not repeated and reservation retained.';await save();return result;}
      options.testBarrier?.('actor:before_run_id_commit');
      await save();
      options.testBarrier?.('actor:run_id_committed');
    }
    // Poll only the persisted ID. A temporary poll error does not abort or
    // relaunch the Actor; its server-side timeout remains in force.
    try{
      const payload=obj(await request(`/actor-runs/${result.actorRunId}?waitForFinish=20`));const run=obj(payload?.data);
      if(run?.id!==result.actorRunId||typeof run.status!=='string')throw new SourceReadError('Apify returned an invalid run status.');
      result.actorStatus=run.status;
      const terminal=['SUCCEEDED','FAILED','ABORTED','TIMED-OUT'].includes(run.status);
      if(!terminal){result.limitation='Actor still running; poll the same run ID.';await save();return result;}
      result.state=run.status==='SUCCEEDED'?'succeeded':'failed';
      const total=run.usageTotalUsd;
      result.consumption!.recordedAt=new Date().toISOString();
      result.consumption!.cost=typeof total==='number'&&Number.isFinite(total)&&total>=0?{status:'known',amount:total,currency:'USD'}:{status:'unknown',reason:'Apify did not report usageTotalUsd; reservation retained.'};
      result.consumption!.requests={status:'known',count:1}; // billable Actor starts, not polling GETs
      if(typeof total==='number'&&total>1)await tx(()=>client.query('select growthx.halt_source_actor()'));
      const items=await request(`/actor-runs/${result.actorRunId}/dataset/items?clean=true&limit=1`);
      const item=Array.isArray(items)?obj(items[0]):null;
      if(item){
        const itemUrl=typeof item.url==='string'?item.url:'';
        if(canonicalKnownSourceUrl(itemUrl)!==canonical)throw new SourceReadError('Actor returned another page; dataset rejected.');
        const text=typeof item.markdown==='string'?item.markdown:typeof item.text==='string'?item.text:'';
        if(text&&text.length<=200_000){
          const html=text.split('\n').map(line=>/^#{1,6} /.test(line)?`<h2>${escapeHtml(line.replace(/^#+ /,''))}</h2>`:`<p>${escapeHtml(line)}</p>`).join('\n');
          const now=new Date().toISOString();
          result.reading=readingFromHtml({html,requestedUrl:canonical,finalUrl:canonical,fetchedAt:now},options);
          result.reading.reading.strategy='apify_website_content_crawler';
          result.reading.reading.status='partial';
          result.reading.reading.freshness='unknown';
          result.reading.reading.limitation='Actor-rendered text; original JSON-LD is not supplied by this dataset. Retain native structured evidence separately.';
          // Dataset line locators must not pretend to refer to original HTML.
          for(const fragment of result.reading.fullContent.fragments)fragment.locator=`Actor ${result.actorRunId} dataset item 0; ${fragment.locator.replaceAll('HTML line','rendered text line')}`;
        }
      }
      result.limitation=result.state==='failed'?'Actor ended with a failure; any partial dataset is retained.':result.reading?'Actor text obtained; semantic extraction is separate.':'Actor returned no usable material.';
    }catch{result.state='running';result.limitation='Actor poll or dataset read unavailable; retain the run ID and retry the same operation.';}
    await save();return result;
  }finally{if(locked)await client.query('select pg_advisory_unlock(hashtextextended($1,0))',[lock]);client.release();}
}
