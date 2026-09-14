import { createHash } from 'node:crypto';
import { extractSource, type SourceExtraction } from './extract.ts';
import { extractRelationshipContent, validRelationshipContent, type RelationshipContent } from './relationship-content.ts';
import { parseSourceRecord, parseClaimRevision, parseEventEditionRevision } from '../../contracts/evaluation-validation.ts';

// Known sources from the reviewed DP-01 sample. Expanding this allowlist is a
// server decision, never an instruction supplied by a fetched page.
const HOSTS = new Set(['lu.ma','www.lu.ma','luma.com','www.luma.com','sf.aitinkerers.org','aitinkerers.org','www.hackathons.team','hackathons.team','cerebralvalley.ai','blogs.vultr.com']);
export class SourceReadError extends Error {
  constructor(message: string) { super(message); this.name = 'SourceReadError'; }
}
export interface SourceReadOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  now?: () => Date;
  isFixture?: true;
  forceRefresh?: boolean;
  cacheTtlMs?: number;
}
export interface ReadingMetadata {
  version: 1;
  strategy: 'http_get' | 'apify_website_content_crawler';
  status: 'obtained' | 'partial' | 'error' | 'insufficient';
  limitation: string | null;
  freshness: 'current' | 'stale' | 'unknown';
  checkedAt: string;
  cache: 'miss' | 'hit' | 'stale_fallback' | 'unavailable';
  failures: string[];
}
export interface KnownSourceRead {
  requestedUrl: string;
  finalUrl: string;
  canonicalUrl: string;
  fetchedAt: string;
  htmlSha256: string;
  htmlBytes: number;
  reading: ReadingMetadata;
  fullContent: SourceExtraction;
  relationshipContent?: RelationshipContent;
  isFixture?: true;
}
export function validateKnownSourceUrl(raw: string): URL {
  let url: URL;
  try { url = new URL(raw); } catch { throw new SourceReadError('Invalid URL'); }
  if (url.username || url.password) throw new SourceReadError('URL with embedded credentials rejected');
  if (url.protocol !== 'https:') throw new SourceReadError('HTTPS required; redirect to another scheme rejected');
  if (url.port && url.port !== '443') throw new SourceReadError('Nonstandard port rejected');
  if (!HOSTS.has(url.hostname)) throw new SourceReadError(`host «${url.hostname}» fuera de la allowlist de fuentes conocidas`);
  // Query strings are unnecessary for this sample and may contain secrets.
  url.search = ''; url.hash = '';
  return url;
}
export function canonicalKnownSourceUrl(raw: string): string {
  const url = validateKnownSourceUrl(raw);
  if (['lu.ma','www.lu.ma','luma.com','www.luma.com'].includes(url.hostname)) url.hostname='lu.ma';
  if (url.hostname === 'hackathons.team') url.hostname='www.hackathons.team';
  url.pathname=url.pathname.replace(/\/+$/,'') || '/';
  return url.toString();
}
export async function readBodyCapped(response: Response, maxBytes: number): Promise<string> {
  if (Number(response.headers.get('content-length')) > maxBytes) { await response.body?.cancel(); throw new SourceReadError(`The page exceeds the limit of ${maxBytes} bytes`); }
  if (!response.body) return '';
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let received = 0;
  try {
    for (;;) {
      const {done,value} = await reader.read(); if (done) break;
      received += value.byteLength;
      if (received > maxBytes) { await reader.cancel(); throw new SourceReadError(`The page exceeds the limit of ${maxBytes} bytes`); }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally { reader.releaseLock(); }
}
export async function fetchKnownHtml(raw: string, options: SourceReadOptions = {}): Promise<{html:string;finalUrl:string;requestedUrl:string;fetchedAt:string}> {
  const requestedUrl = canonicalKnownSourceUrl(raw);
  const timeout = Math.min(20_000, Math.max(1,options.timeoutMs ?? 10_000));
  const maxBytes = Math.min(2_000_000,Math.max(1,options.maxBytes ?? 2_000_000));
  const maxRedirects = Math.min(3,Math.max(0,options.maxRedirects ?? 3));
  // One deadline includes response bodies and all redirects. Race also bounds
  // controlled transports that do not implement AbortSignal correctly.
  const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new SourceReadError(`timeout after ${timeout} ms while fetching the page`)); },timeout); });
  const fetcher = options.fetchImpl ?? fetch;
  const work = async () => {
    let current = new URL(requestedUrl);
    for (let hop=0;hop<=maxRedirects;hop++) {
      const response = await fetcher(current, {headers:{accept:'text/html','user-agent':'GrowthAtlas/1.0 (bounded public-source research)'},redirect:'manual',cache:'no-store',signal:controller.signal});
      if ([301,302,303,307,308].includes(response.status)) {
        await response.body?.cancel();
        const location = response.headers.get('location');
        if (!location) throw new SourceReadError('Redirect has no destination');
        let next: URL; try { next = new URL(location,current); } catch { throw new SourceReadError('Invalid redirect destination'); }
        const validated = validateKnownSourceUrl(next.toString());
        // Different known domains still cannot silently reassign this source.
        if (new URL(canonicalKnownSourceUrl(validated.toString())).hostname !== new URL(requestedUrl).hostname) throw new SourceReadError('Redirect outside the source domain rejected');
        current=validated; continue;
      }
      if (!response.ok) { await response.body?.cancel(); throw new SourceReadError(`The page returned ${response.status}`); }
      const type = response.headers.get('content-type') ?? '';
      if (type && !/text\/html|application\/xhtml\+xml|text\/plain/i.test(type)) { await response.body?.cancel(); throw new SourceReadError('Content type not supported for HTML reading'); }
      return {html:await readBodyCapped(response,maxBytes),finalUrl:current.toString(),requestedUrl,fetchedAt:(options.now?.() ?? new Date()).toISOString()};
    }
    throw new SourceReadError(`More than ${maxRedirects} redirects; rejected`);
  };
  try { return await Promise.race([work(),deadline]); }
  catch (error) { if (error instanceof SourceReadError) throw error; throw new SourceReadError(controller.signal.aborted ? `timeout after ${timeout} ms while fetching the page` : 'The source could not be read (network error or incomplete response)'); }
  finally { clearTimeout(timer!); }
}
export function readingFromHtml(page: {html:string;finalUrl:string;requestedUrl:string;fetchedAt:string}, options: SourceReadOptions = {}): KnownSourceRead {
  const fullContent=extractSource(page.html);
  const hasText=fullContent.visibleCharacters > 100;
  const limitation=fullContent.warnings.join(' ') || (!hasText ? 'No material visible text obtained; structured fields alone do not establish full coverage.' : null);
  return {requestedUrl:page.requestedUrl,finalUrl:page.finalUrl,canonicalUrl:canonicalKnownSourceUrl(page.finalUrl),fetchedAt:page.fetchedAt,
    htmlSha256:createHash('sha256').update(page.html).digest('hex'),htmlBytes:Buffer.byteLength(page.html),fullContent,
    relationshipContent: extractRelationshipContent(page.html, page.finalUrl),
    reading:{version:1,strategy:'http_get',status:limitation?'partial':'obtained',limitation,freshness:'current',checkedAt:page.fetchedAt,cache:'miss',failures:[]},
    ...(options.isFixture?{isFixture:true as const}:{}),
  };
}
export async function readKnownSource(raw: string, options: SourceReadOptions = {}): Promise<KnownSourceRead> {
  return readingFromHtml(await fetchKnownHtml(raw,options),options);
}

// Validate persisted transport output using DP-03's runtime contracts. The
// source/claim IDs here only validate shape; DB writers resolve tenant refs.
export function parseKnownSourceRead(value: unknown): KnownSourceRead {
  const fail=():never=>{throw new SourceReadError('Persisted source reading has an unsupported or invalid shape.');};
  if(!value||typeof value!=='object')return fail();
  const r=value as KnownSourceRead;
  if (r.relationshipContent !== undefined && !validRelationshipContent(r.relationshipContent)) return fail();
  if(!r.fullContent||r.fullContent.version!==1||!r.reading||r.reading.version!==1||
    !['http_get','apify_website_content_crawler'].includes(r.reading.strategy)||!['miss','hit','stale_fallback','unavailable'].includes(r.reading.cache)||
    !Array.isArray(r.reading.failures)||!r.reading.failures.every(x=>typeof x==='string')||!Number.isFinite(Date.parse(r.reading.checkedAt))||
    !Array.isArray(r.fullContent.attributes)||!Array.isArray(r.fullContent.warnings)||!r.fullContent.warnings.every(x=>typeof x==='string')||typeof r.fullContent.eventIdentified!=='boolean'||typeof r.fullContent.visibleCharacters!=='number'||
    !Number.isFinite(r.htmlBytes)||r.htmlBytes<0||r.htmlBytes>2_000_000||!(/^[a-f0-9]{64}$/.test(r.htmlSha256))||(r.isFixture!==undefined&&r.isFixture!==true))return fail();
  try{if(canonicalKnownSourceUrl(r.finalUrl)!==r.canonicalUrl||canonicalKnownSourceUrl(r.requestedUrl)!==r.requestedUrl)return fail();}catch{return fail();}
  const source=parseSourceRecord({contractVersion:'1',id:'source-validation',url:r.finalUrl,requestedUrl:r.requestedUrl,canonicalUrl:r.canonicalUrl,title:r.fullContent.title,locator:null,provider:'web',collector:'worker',fetchedAt:r.fetchedAt,publishedAt:null,method:r.reading.strategy,geoScope:'unknown',content:{kind:'hash',sha256:r.htmlSha256},usageRestrictions:[],fragments:r.fullContent.fragments,retrieval:{status:r.reading.status,limitation:r.reading.limitation,freshness:r.reading.freshness}});
  if(!source.ok)return fail();
  for(const a of r.fullContent.attributes){
    if(!a||!Array.isArray(a.fragmentIds)||!a.fragmentIds.length||a.fragmentIds.some(id=>!r.fullContent.fragments.some(f=>f.id===id)))return fail();
    const claim=parseClaimRevision({contractVersion:'1',id:'claim-validation',claimId:'claim',subject:{type:'edition',editionId:'edition'},attribute:a.attribute,value:a.value,status:a.status,sourceIds:['source-validation'],evidence:a.fragmentIds.map(fragmentId=>({sourceId:'source-validation',fragmentId,locator:null})),method:'extraction',note:a.note,reviewer:null,reviewedAt:r.fetchedAt,previousRevisionId:null});
    if(!claim.ok||!['announced','reported','observed','contradicted'].includes(a.status))return fail();
  }
  const edition=parseEventEditionRevision({contractVersion:'1',id:'edition-validation',editionId:'edition',organizerIds:[],name:'validation',canonicalUrl:r.canonicalUrl,provider:'web',startDate:{precision:'unknown'},location:r.fullContent.location?.city?{scope:'city',name:r.fullContent.location.city}:r.fullContent.location?.venue?{scope:'venue',name:r.fullContent.location.venue}:{scope:'unknown',name:null},coordinates:r.fullContent.coordinates,...(r.fullContent.location?{publicLocation:{...r.fullContent.location,sourceIds:['source-validation'],resolvedAt:r.fullContent.coordinates?r.fetchedAt:null}}:{}),claimRevisionIds:[],revisedAt:r.fetchedAt,previousRevisionId:null});
  if(!edition.ok)return fail();
  return r;
}
