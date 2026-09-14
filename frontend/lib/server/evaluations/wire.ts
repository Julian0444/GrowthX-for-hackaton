// Frontera HTTP de /api/evaluations (ticket 08): parseo ESTRICTO del cuerpo y
// forma de las vistas que devuelve la lectura. Server-only.
//
// Claves desconocidas se rechazan (mismo criterio que los contratos de 07): en
// particular, un `tenantId` en el cuerpo es un error 400 — el tenant lo
// resuelve el servidor desde la sesión, nunca el navegador.

import { randomUUID, createHash } from 'node:crypto';
import type { EvaluationProfile, ObjectiveKind, ComparableCompanyRef, ResearchBriefInput, ResearchPlan } from '../../contracts/evaluation.ts';

export interface EvaluationStartBody {
  idempotencyKey: string;
  mode: 'catalog_research';
  researchScope?: 'sf_organizers' | 'sf_discovery';
  previousRunId?: string;
  profile: ResearchBriefInput;
}

// Cuerpo de la comparación de inversión (ticket 12): hasta 3 ediciones del
// catálogo, evaluadas contra el perfil de una investigación EXISTENTE del
// tenant (misma revisión del perfil para todos los candidatos).
export interface ComparisonStartBody {
  idempotencyKey: string;
  mode: 'investment_comparison';
  profileRunId: string;
  profile?: ResearchBriefInput; // nueva revisión, nunca modifica el perfil usado
  // Normalizadas al parsear: sin duplicados y en orden estable (la comparación
  // es sobre un conjunto; el orden de selección no cambia la evaluación).
  editionIds: string[];
  // Ticket 14: «Reevaluar» es una acción explícita que crea OTRO run (con otro
  // snapshot) vinculado al run de comparación anterior. Nunca edita el
  // snapshot ni la decisión previos; ambos siguen disponibles por identidad.
  previousRunId?: string;
}

export interface BodyParseFailure {
  ok: false;
  error: string;
}

export type BodyParseResult =
  | { ok: true; body: EvaluationStartBody | ComparisonStartBody }
  | BodyParseFailure;

const OBJECTIVE_KINDS: ObjectiveKind[] = ['adoption', 'feedback', 'hiring', 'awareness'];
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(error: string): BodyParseFailure {
  return { ok: false, error };
}

function unknownKeys(record: Record<string, unknown>, allowed: string[]): string[] {
  return Object.keys(record).filter((key) => !allowed.includes(key));
}

function parseStringArray(value: unknown, label: string): string[] | BodyParseFailure {
  if (!Array.isArray(value)) return fail(`${label} must be a list of strings`);
  const items: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || item.trim().length === 0)
      return fail(`${label} contains an empty or non-string value`);
    items.push(item.trim());
  }
  return items;
}

function parseDayOrNull(value: unknown, label: string): string | null | BodyParseFailure {
  if (value === null) return null;
  if (typeof value !== 'string' || !ISO_DAY.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value)
    return fail(`${label} must be null or an ISO day (YYYY-MM-DD)`);
  return value;
}

export function parseEvaluationStartBody(input: unknown): BodyParseResult {
  if (!isRecord(input)) return fail('invalid body: expected a JSON object');
  // Ticket 12: la MISMA frontera acepta la comparación de inversión; el resto
  // de esta función conserva intacto el parseo de catalog_research.
  if (input.mode === 'investment_comparison') return parseComparisonStartBody(input);
  const extra = unknownKeys(input, ['idempotencyKey', 'mode', 'profile', 'researchScope', 'previousRunId']);
  if (extra.length > 0)
    return fail(`unsupported body keys: ${extra.join(', ')} (el tenant lo resuelve el servidor)`);

  const { idempotencyKey, mode, profile } = input;
  if (input.researchScope !== undefined && !['sf_organizers', 'sf_discovery'].includes(String(input.researchScope)))
    return fail('researchScope no admitido');
  if (input.previousRunId !== undefined && (!['sf_organizers', 'sf_discovery'].includes(String(input.researchScope)) ||
      typeof input.previousRunId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.previousRunId)))
    return fail('previousRunId must identify an SF research run');
  if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 8 || idempotencyKey.length > 128)
    return fail('idempotencyKey must be a string of 8 to 128 characters');
  if (mode !== 'catalog_research') return fail('mode must be "catalog_research"');
  if (!isRecord(profile)) return fail('profile must be an object');

  const profileExtra = unknownKeys(profile, [
    'product',
    'audienceDescription',
    'audienceProfiles',
    'stack',
    'budget',
    'window',
    'objective',
    'comparableCompanies', 'restrictions', 'formats', 'geography',
  ]);
  if (profileExtra.length > 0) return fail(`claves no admitidas en profile: ${profileExtra.join(', ')}`);

  const comparableCompanies: ComparableCompanyRef[] = [];
  if (profile.comparableCompanies !== undefined) {
    if (!Array.isArray(profile.comparableCompanies) || profile.comparableCompanies.length > 30)
      return fail('comparableCompanies must be a list of up to 30 companies');
    for (const item of profile.comparableCompanies) {
      if (!isRecord(item) || unknownKeys(item, ['companyId', 'name', 'relation', 'confirmation']).length ||
          typeof item.name !== 'string' || !item.name.trim() ||
          (item.companyId !== null && (typeof item.companyId !== 'string' || !item.companyId.trim())) ||
          !['comparable', 'competitor'].includes(String(item.relation)) ||
          !['indicated', 'confirmed'].includes(String(item.confirmation)) ||
          (item.companyId !== null && item.confirmation !== 'confirmed'))
        return fail('Invalid comparable company: a catalog link requires confirmed identity');
      comparableCompanies.push({ companyId: item.companyId as string | null, name: item.name.trim(),
        relation: item.relation as ComparableCompanyRef['relation'], confirmation: item.confirmation as ComparableCompanyRef['confirmation'] });
    }
  }
  const { product, audienceDescription } = profile;
  if (typeof product !== 'string' || product.trim().length === 0)
    return fail('profile.product es obligatorio');
  if (typeof audienceDescription !== 'string' || audienceDescription.trim().length === 0)
    return fail('profile.audienceDescription es obligatorio');

  const audienceProfiles = parseStringArray(profile.audienceProfiles, 'profile.audienceProfiles');
  if (!Array.isArray(audienceProfiles)) return audienceProfiles;
  const stack = parseStringArray(profile.stack, 'profile.stack');
  if (!Array.isArray(stack)) return stack;

  if (!isRecord(profile.budget)) return fail('profile.budget must be an object');
  const budgetRecord = profile.budget;
  let budget: EvaluationStartBody['profile']['budget'];
  if (budgetRecord.status === 'declared') {
    const budgetExtra = unknownKeys(budgetRecord, ['status', 'amount', 'currency']);
    if (budgetExtra.length > 0) return fail(`claves no admitidas en budget: ${budgetExtra.join(', ')}`);
    const { amount, currency } = budgetRecord;
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0)
      return fail('budget.amount must be a finite number ≥ 0');
    if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency))
      return fail('budget.currency must be an ISO 4217 code (for example, "USD")');
    budget = { status: 'declared', amount, currency };
  } else if (budgetRecord.status === 'unknown') {
    const budgetExtra = unknownKeys(budgetRecord, ['status']);
    if (budgetExtra.length > 0) return fail(`claves no admitidas en budget: ${budgetExtra.join(', ')}`);
    budget = { status: 'unknown' };
  } else {
    return fail('budget.status must be "declared" or "unknown" (unknown is never assumed to be zero)');
  }

  if (!isRecord(profile.window)) return fail('profile.window must be an object');
  const windowExtra = unknownKeys(profile.window, ['from', 'to']);
  if (windowExtra.length > 0) return fail(`claves no admitidas en window: ${windowExtra.join(', ')}`);
  const from = parseDayOrNull(profile.window.from, 'window.from');
  if (typeof from === 'object' && from !== null) return from;
  const to = parseDayOrNull(profile.window.to, 'window.to');
  if (typeof to === 'object' && to !== null) return to;
  if (from !== null && to !== null && Date.parse(from) > Date.parse(to))
    return fail('window invertida: from es posterior a to');

  if (!isRecord(profile.objective)) return fail('profile.objective must be an object');
  const objectiveExtra = unknownKeys(profile.objective, ['kind', 'confirmation', 'successDefinition']);
  if (objectiveExtra.length > 0)
    return fail(`claves no admitidas en objective: ${objectiveExtra.join(', ')}`);
  const kind = profile.objective.kind;
  if (typeof kind !== 'string' || !OBJECTIVE_KINDS.includes(kind as ObjectiveKind))
    return fail(`objective.kind must be one of ${OBJECTIVE_KINDS.join(', ')}`);

  const confirmation = profile.objective.confirmation === undefined ? 'provisional' : profile.objective.confirmation;
  if (!['provisional', 'confirmed'].includes(String(confirmation))) return fail('invalid objective.confirmation');
  const successDefinition = profile.objective.successDefinition === undefined ? { status: 'pending' } : profile.objective.successDefinition;
  if (!isRecord(successDefinition) ||
      (successDefinition.status === 'pending' ? unknownKeys(successDefinition, ['status']).length > 0 :
       successDefinition.status !== 'defined' || unknownKeys(successDefinition, ['status', 'text']).length > 0 || typeof successDefinition.text !== 'string' || !successDefinition.text.trim()))
    return fail('objective.successDefinition must be pending or defined with text');
  const restrictions = parseStringArray(profile.restrictions === undefined ? [] : profile.restrictions, 'profile.restrictions');
  if (!Array.isArray(restrictions)) return restrictions;
  const formats = parseStringArray(profile.formats === undefined ? [] : profile.formats, 'profile.formats');
  if (!Array.isArray(formats)) return formats;
  if (profile.geography !== undefined && (!isRecord(profile.geography) || unknownKeys(profile.geography, ['city', 'timezone']).length || profile.geography.city !== 'San Francisco' || profile.geography.timezone !== 'America/Los_Angeles')) return fail('geography must be San Francisco, America/Los_Angeles');

  return {
    ok: true,
    body: {
      idempotencyKey,
      mode,
      ...(input.researchScope === 'sf_organizers' || input.researchScope === 'sf_discovery' ? { researchScope: input.researchScope } : {}),
      ...(typeof input.previousRunId === 'string' ? { previousRunId: input.previousRunId } : {}),
      profile: {
        product: product.trim(),
        ...(profile.comparableCompanies !== undefined ? { comparableCompanies } : {}),
        audienceDescription: audienceDescription.trim(),
        audienceProfiles,
        stack,
        budget,
        window: { from, to },
        objective: { kind: kind as ObjectiveKind, confirmation: confirmation as 'provisional' | 'confirmed', successDefinition: successDefinition.status === 'defined' ? { status: 'defined', text: (successDefinition.text as string).trim() } : { status: 'pending' } },
        restrictions, formats, geography: { city: 'San Francisco', timezone: 'America/Los_Angeles' },
      },
    },
  };
}

// ============ Comparación de inversión (ticket 12) ============

// Hasta 3 ediciones por comparación (compare.ts es la fuente del límite; acá
// solo se referencia para no importar el orquestador desde la frontera).
const MAX_COMPARED_EDITIONS = 3;

function parseComparisonStartBody(input: Record<string, unknown>): BodyParseResult {
  const extra = unknownKeys(input, ['idempotencyKey', 'mode', 'profileRunId', 'editionIds', 'previousRunId', 'profile']);
  if (extra.length > 0)
    return fail(`unsupported body keys: ${extra.join(', ')} (el tenant lo resuelve el servidor)`);
  const { idempotencyKey, profileRunId, editionIds, previousRunId } = input;
  let revisedProfile: ResearchBriefInput | undefined;
  if (input.profile !== undefined) {
    const parsed = parseEvaluationStartBody({idempotencyKey,mode:'catalog_research',profile:input.profile});
    if (!parsed.ok) return parsed;
    if (parsed.body.mode === 'catalog_research') revisedProfile = parsed.body.profile;
  }
  if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 8 || idempotencyKey.length > 128)
    return fail('idempotencyKey must be a string of 8 to 128 characters');
  if (typeof profileRunId !== 'string' || !UUID_RE.test(profileRunId))
    return fail('profileRunId must identify an existing research run for this session');
  if (previousRunId !== undefined && (typeof previousRunId !== 'string' || !UUID_RE.test(previousRunId)))
    return fail('previousRunId must identify a previous evaluation (comparison) for this session');
  if (!Array.isArray(editionIds) || editionIds.length === 0)
    return fail('editionIds must be a list of 1 to 3 catalog editions');
  const ids: string[] = [];
  for (const id of editionIds) {
    if (typeof id !== 'string' || id.trim().length === 0)
      return fail('editionIds contains an empty or non-string ID');
    ids.push(id.trim());
  }
  // Conjunto normalizado (sin duplicados, orden estable): dos selecciones del
  // mismo conjunto son la MISMA comparación para la idempotencia.
  const unique = [...new Set(ids)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  if (unique.length > MAX_COMPARED_EDITIONS)
    return fail(
      `the comparison supports up to ${MAX_COMPARED_EDITIONS} editions; fewer eligible options do not fill a top three`,
    );
  return {
    ok: true,
    body: {
      idempotencyKey,
      mode: 'investment_comparison',
      profileRunId,
      editionIds: unique,
      ...(revisedProfile ? { profile: revisedProfile } : {}),
      ...(typeof previousRunId === 'string' ? { previousRunId } : {}),
    },
  };
}

// Hash canónico del payload de comparación (sin la clave idempotente). El
// vínculo al run anterior forma parte del payload: la misma clave con otro
// vínculo es otro contenido (409), no una deduplicación.
export function comparisonPayloadHash(body: ComparisonStartBody): string {
  const canonical = JSON.stringify(
    sortKeysDeep({
      mode: body.mode,
      profileRunId: body.profileRunId,
      editionIds: body.editionIds,
      ...(body.profile ? { profile: body.profile } : {}),
      ...(body.previousRunId ? { previousRunId: body.previousRunId } : {}),
    }),
  );
  return createHash('sha256').update(canonical).digest('hex');
}

// ============ Importación durable de un evento Luma (ticket 11) ============

// Cuerpo de POST /api/events/ingest. La URL viaja YA canonicalizada (la
// validación de esquema/host/credenciales/puerto ocurre acá, antes de aceptar
// nada); el perfil del run se toma de una investigación EXISTENTE del tenant
// (profileRunId) — la importación no fabrica producto/audiencia/objetivo.
export interface EventIngestStartBody {
  idempotencyKey: string;
  url: string; // forma canónica https://lu.ma/<ruta>
  profileRunId: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type EventIngestParseResult =
  | { ok: true; body: EventIngestStartBody }
  | BodyParseFailure;

export function parseEventIngestStartBody(
  input: unknown,
  canonicalize: (raw: string) => { ok: true; canonical: string } | { ok: false; reason: string },
): EventIngestParseResult {
  if (!isRecord(input)) return fail('invalid body: expected a JSON object');
  const extra = unknownKeys(input, ['idempotencyKey', 'url', 'profileRunId']);
  if (extra.length > 0)
    return fail(`unsupported body keys: ${extra.join(', ')} (el tenant lo resuelve el servidor)`);
  const { idempotencyKey, url, profileRunId } = input;
  if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 8 || idempotencyKey.length > 128)
    return fail('idempotencyKey must be a string of 8 to 128 characters');
  if (typeof url !== 'string') return fail('url es obligatoria');
  const canonical = canonicalize(url);
  if (!canonical.ok) return fail(`URL rejected: ${canonical.reason}`);
  if (typeof profileRunId !== 'string' || !UUID_RE.test(profileRunId))
    return fail('profileRunId must identify an existing research run for this session');
  return { ok: true, body: { idempotencyKey, url: canonical.canonical, profileRunId } };
}

// Hash canónico del payload de importación (sin la clave idempotente): como la
// URL ya está canonicalizada, dos aliases del mismo evento con la misma clave
// son la MISMA solicitud (duplicado), no un conflicto.
export function eventIngestPayloadHash(body: EventIngestStartBody): string {
  const canonical = JSON.stringify(
    sortKeysDeep({ mode: 'event_evaluation', url: body.url, profileRunId: body.profileRunId }),
  );
  return createHash('sha256').update(canonical).digest('hex');
}

// Perfil completo del contrato 07 a partir del intake. El objetivo queda
// declarado se conserva; solo los datos omitidos usan defaults históricos.
export function buildEvaluationProfile(
  body: EvaluationStartBody,
  ids: { profileId: string; createdAt: string },
): EvaluationProfile {
  const { profile } = body;
  return {
    contractVersion: '1',
    id: ids.profileId,
    profileVersion: 1,
    createdAt: ids.createdAt,
    product: profile.product,
    audience: {
      description: profile.audienceDescription,
      profiles: profile.audienceProfiles,
    },
    stack: profile.stack,
    budget:
      profile.budget.status === 'declared'
        ? { status: 'declared', amount: profile.budget.amount, currency: profile.budget.currency }
        : { status: 'unknown', note: null },
    window: { from: profile.window.from, to: profile.window.to },
    restrictions: profile.restrictions ?? [],
    formats: profile.formats ?? [],
    geography: profile.geography ?? { city: 'San Francisco', timezone: 'America/Los_Angeles' },
    objective: {
      kind: profile.objective.kind,
      confirmation: profile.objective.confirmation ?? 'provisional',
      successDefinition: profile.objective.successDefinition ?? { status: 'pending' },
    },
    comparableCompanies: profile.comparableCompanies ?? [],
  };
}

// Hash canónico del payload (sin la clave idempotente): decide «mismo payload»
// para la idempotencia. JSON con claves ordenadas para que el orden de
// serialización del cliente no fabrique conflictos.
export function evaluationPayloadHash(body: EvaluationStartBody): string {
  const canonical = JSON.stringify(sortKeysDeep({ mode: body.mode, profile: body.profile, ...(body.researchScope ? { researchScope: body.researchScope } : {}), ...(body.previousRunId ? { previousRunId: body.previousRunId } : {}) }));
  return createHash('sha256').update(canonical).digest('hex');
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (isRecord(value)) {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) sorted[key] = sortKeysDeep(value[key]);
    return sorted;
  }
  return value;
}

export function newRunIds(): { runId: string; profileId: string } {
  return { runId: randomUUID(), profileId: randomUUID() };
}

// ============ Vistas de lectura (GET /api/evaluations/:id) ============

export interface EvaluationStepView {
  name: string;
  seq: number;
  state: 'pending' | 'running' | 'completed' | 'failed';
  attempts: number;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
}

export interface EvaluationRunView {
  runId: string;
  state: 'queued' | 'running' | 'completed' | 'failed';
  mode: string;
  workflowVersion: string;
  profileId: string;
  profile: EvaluationProfile;
  researchPlan?: ResearchPlan | null;
  discovery?: import('../../contracts/discovery.ts').DiscoveryView | null;
  previousRunId: string | null;
  // URL solicitada de un run de importación (null en investigaciones): un
  // fallo debe conservarla visible junto al intento y la causa.
  requestedUrl: string | null;
  savedOrganizers: import('../../../components/research-dashboard/research-types.ts').SavedOrganizerResearch[];
  createdAt: string;
  updatedAt: string;
  steps: EvaluationStepView[];
  result: unknown;
  error: string | null;
}
