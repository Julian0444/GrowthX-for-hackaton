// Steps del workflow de importación Luma (ticket 11). Server-only; los invoca
// run-worker.ts. La obtención y el parseo corren en el WORKER, nunca en la
// ruta HTTP: la aceptación solo valida la URL y encola el trabajo durable.
//
// Workflow: validate_profile → fetch_event_page → persist_dossier →
// publish_result. La salida del paso de obtención se confirma
// transaccionalmente ANTES de persistir el dossier (sin HTML completo, solo
// campos parseados + sha256), así una re-entrega del job reutiliza la misma
// observación y la persistencia queda determinística e idempotente.

import type pg from 'pg';
import { cachedSourceRead, type SourceReadContext } from '../sources/cache.ts';
import { parseKnownSourceRead, SourceReadError, type KnownSourceRead } from '../sources/reader.ts';
import {
  fetchLumaEvent,
  persistLumaDossier,
  type LumaFetchOptions,
  type LumaFetchOutput,
  type LumaPersistOutcome,
} from '../catalog/luma-adapter.ts';

export const LUMA_INGEST_WORKFLOW = 'luma-ingest/1';

export const LUMA_INGEST_STEPS = [
  'validate_profile',
  'fetch_event_page',
  'persist_dossier',
  'publish_result',
] as const;

// Opciones inyectables del step de obtención (transporte controlado y límites
// cortos en tests; defaults reales en producción).
export type LumaIngestStepOptions = LumaFetchOptions;

export async function runFetchEventPageStep(
  url: string,
  options: LumaIngestStepOptions = {},
  context?: SourceReadContext,
): Promise<LumaFetchOutput> {
  const obtain=()=>fetchLumaEvent(url,options);
  if(!context)return obtain();
  return cachedSourceRead(context,url,obtain,value=>{
    const reading=parseKnownSourceRead(value);
    if ('fields' in reading || 'extraction' in reading)
      return parseLumaFetchOutput(reading) as LumaFetchOutput & KnownSourceRead;
    // DP-04's proposal reader can fill the common cache first. Derive the
    // Luma projection from those validated observations without another fetch
    // or requiring the raw HTML to be retained.
    const text=(attribute:string)=>{const value=reading.fullContent.attributes.find(a=>a.attribute===attribute)?.value;return value?.kind==='text'?value.text:null;};
    const name=text('name');
    if(!reading.fullContent.eventIdentified || !name)throw new SourceReadError('La lectura guardada no identifica un evento; no se inventa un dossier.');
    const warnings=[...reading.fullContent.warnings];
    for(const attribute of ['date:structured','location','audience','access','organizer','cost:attendance'])
      if(!reading.fullContent.attributes.some(a=>a.attribute===attribute))warnings.push(`${attribute} not obtained`);
    return {...reading,extraction:{status:warnings.length?'partial':'complete',warnings,fieldsExtracted:reading.fullContent.attributes.map(a=>a.attribute)},
      fields:{name,startsAt:text('date:structured'),endsAt:text('end_date'),venue:reading.fullContent.location?.venue??null,city:reading.fullContent.location?.city??null,
        coordinates:reading.fullContent.coordinates,organizerName:text('organizer'),registrationStatus:null}} as LumaFetchOutput & KnownSourceRead;
  },options);
}

// La salida persistida del paso de obtención vuelve de PostgreSQL como JSON
// plano en una reanudación; se revalida su forma antes de usarla (mismo
// criterio que el perfil: lo persistido no se interpreta en silencio).
export function parseLumaFetchOutput(value: unknown): LumaFetchOutput {
  const record = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
  const fields =
    record && typeof record.fields === 'object' && record.fields !== null
      ? (record.fields as Record<string, unknown>)
      : null;
  const extraction =
    record && typeof record.extraction === 'object' && record.extraction !== null
      ? (record.extraction as Record<string, unknown>)
      : null;
  const stringOrNull = (input: unknown): input is string | null =>
    input === null || typeof input === 'string';
  if (
    !record ||
    !fields ||
    !extraction ||
    typeof record.requestedUrl !== 'string' ||
    typeof record.finalUrl !== 'string' ||
    typeof record.canonicalUrl !== 'string' ||
    typeof record.fetchedAt !== 'string' ||
    typeof record.htmlSha256 !== 'string' ||
    typeof record.htmlBytes !== 'number' ||
    (record.isFixture !== undefined && record.isFixture !== true) ||
    (extraction.status !== 'complete' && extraction.status !== 'partial') ||
    !Array.isArray(extraction.warnings) ||
    !Array.isArray(extraction.fieldsExtracted) ||
    typeof fields.name !== 'string' ||
    !stringOrNull(fields.startsAt) ||
    !stringOrNull(fields.endsAt) ||
    !stringOrNull(fields.venue) ||
    !stringOrNull(fields.city) ||
    !stringOrNull(fields.organizerName) ||
    !stringOrNull(fields.registrationStatus)
  ) {
    throw new Error('persisted fetch_event_page output has an unknown structure; it is not interpreted');
  }
  if(record.fullContent !== undefined || record.reading !== undefined) parseKnownSourceRead(value);
  if(!extraction.warnings.every(x=>typeof x==='string')||!extraction.fieldsExtracted.every(x=>typeof x==='string'))throw new Error('invalid persisted extraction output');
  const coords=fields.coordinates as {lat?:unknown;lng?:unknown}|null;
  if(coords!==null&&(!coords||typeof coords.lat!=='number'||typeof coords.lng!=='number'||!Number.isFinite(coords.lat)||!Number.isFinite(coords.lng)||Math.abs(coords.lat)>90||Math.abs(coords.lng)>180))throw new Error('invalid persisted coordinates');
  return value as LumaFetchOutput;
}

export async function runPersistDossierStep(
  pool: pg.Pool,
  tenantId: string,
  runId: string,
  fetchOutput: LumaFetchOutput,
): Promise<LumaPersistOutcome> {
  return persistLumaDossier(pool, tenantId, runId, fetchOutput);
}

// Resultado publicado del run (runs.result): lo que la UI necesita para
// reabrir el dossier persistido — el dossier mismo se lee SIEMPRE de
// PostgreSQL vía /api/catalog/editions/:id, no de este resumen.
export interface LumaIngestResult {
  kind: 'luma_event_ingest';
  version: 1;
  requestedUrl: string;
  canonicalUrl: string;
  editionId: string;
  editionRevisionId: string;
  sourceId: string;
  linkedToExistingEdition: boolean;
  extraction: LumaFetchOutput['extraction'];
  reading?: LumaFetchOutput['reading'];
}

export function buildLumaIngestResult(
  fetchOutput: LumaFetchOutput,
  persisted: LumaPersistOutcome,
): LumaIngestResult {
  return {
    kind: 'luma_event_ingest',
    version: 1,
    requestedUrl: fetchOutput.requestedUrl,
    canonicalUrl: fetchOutput.canonicalUrl,
    editionId: persisted.editionId,
    editionRevisionId: persisted.editionRevisionId,
    sourceId: persisted.sourceId,
    linkedToExistingEdition: persisted.linkedToExistingEdition,
    extraction: fetchOutput.extraction,
    ...(fetchOutput.reading?{reading:fetchOutput.reading}:{}),
  };
}
