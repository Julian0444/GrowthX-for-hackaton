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
): Promise<LumaFetchOutput> {
  return fetchLumaEvent(url, options);
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
    throw new Error('salida persistida de fetch_event_page con forma desconocida; no se interpreta');
  }
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
  };
}
