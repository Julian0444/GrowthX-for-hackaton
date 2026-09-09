// Harness de la referencia congelada v0 (ticket 01, evaluación persistida).
//
// Qué abre:
// - Alias `@/` para que `node --test` pueda cargar módulos del servidor que
//   importan con el alias de tsconfig (resolve, search-opportunities, …). Se
//   registra en el hilo con `module.registerHooks`; por eso los módulos v0 se
//   cargan con `loadV0()` (import dinámico), nunca con import estático.
// - Reloj congelado (`freezeClock`): reemplaza `Date` global mientras dura la
//   repetición; `new Date()` y `Date.now()` devuelven el instante de evaluación.
// - Transporte de repetición (`createReplayFetch`): sirve respuestas grabadas
//   en `providers/` y falla ante cualquier URL no grabada. Sin red ni claves
//   reales: las claves que ve el código son valores falsos fijados acá.
// - Manifiesto: hashes de fuentes, seeds y fixtures, y clasificación de los
//   136 eventos seed en el instante congelado sin alterar sus fechas.
//
// Nada de esto cambia el comportamiento de producción; solo lo repite.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import type { SearchRequest, SearchResponse } from '../../../lib/contracts/growxth.ts';

export const BASELINE_DIR = dirname(fileURLToPath(import.meta.url));
export const FRONTEND_ROOT = resolvePath(BASELINE_DIR, '..', '..', '..');
export const PROVIDERS_DIR = join(BASELINE_DIR, 'providers');

// Instante de congelación de la v0. Documentado al implementar (2026-09-07,
// hora UTC de la sesión); no es el día de la demo ni el del plan.
export const EVALUATION_CLOCK = '2026-09-07T22:28:00.000Z';

// Perfil de caracterización. El presupuesto es material para O1: la segunda
// petición de la demostración usa 20.000 con el resto idéntico.
export const BASELINE_REQUEST: SearchRequest = {
  product: 'AI observability for production agents',
  icpStack: ['Python', 'Kubernetes'],
  budgetUsd: 2000,
  goal: 'adoption',
};

export const FAKE_KEYS = {
  APIFY_TOKEN: 'baseline-v0-fake-apify-token',
  EXA_API_KEY: 'baseline-v0-fake-exa-key',
  GEMINI_API_KEY: 'baseline-v0-fake-gemini-key',
} as const;

// ---------------------------------------------------------------- alias @/

let aliasRegistered = false;

export function registerAliasHook(): void {
  if (aliasRegistered) return;
  aliasRegistered = true;
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (!specifier.startsWith('@/')) return nextResolve(specifier, context);
      const base = join(FRONTEND_ROOT, specifier.slice(2));
      const candidate = [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), base].find(
        (path) => existsSync(path) && statSync(path).isFile(),
      );
      if (!candidate) {
        throw new Error(`baseline-v0: no se pudo resolver el alias ${specifier}`);
      }
      return { url: pathToFileURL(candidate).href, shortCircuit: true };
    },
  });
}

registerAliasHook();

export interface V0Modules {
  resolve: typeof import('../../../lib/server/pipeline/resolve.ts');
  searchOpportunities: typeof import('../../../lib/server/pipeline/search-opportunities.ts');
  loadGraph: typeof import('../../../lib/server/graph/load-graph.ts');
  adapter: typeof import('../../../lib/api/opportunity-adapter.ts');
  fixtures: typeof import('../../../lib/server/demo/fixtures.ts');
  cache: typeof import('../../../lib/server/cache.ts');
}

let modulesPromise: Promise<V0Modules> | null = null;

// Carga perezosa: los módulos con alias `@/` solo pueden resolverse después de
// registrar el gancho, es decir, con import dinámico.
export function loadV0(): Promise<V0Modules> {
  modulesPromise ??= (async () => ({
    resolve: await import('../../../lib/server/pipeline/resolve.ts'),
    searchOpportunities: await import('../../../lib/server/pipeline/search-opportunities.ts'),
    loadGraph: await import('../../../lib/server/graph/load-graph.ts'),
    adapter: await import('../../../lib/api/opportunity-adapter.ts'),
    fixtures: await import('../../../lib/server/demo/fixtures.ts'),
    cache: await import('../../../lib/server/cache.ts'),
  }))();
  return modulesPromise;
}

// ---------------------------------------------------------------- reloj

export function freezeClock(iso: string = EVALUATION_CLOCK): () => void {
  const RealDate = Date;
  const fixed = new RealDate(iso).getTime();
  class FrozenDate extends RealDate {
    constructor(value?: number | string | Date) {
      if (value === undefined) super(fixed);
      else super(value);
    }
    static override now(): number {
      return fixed;
    }
  }
  globalThis.Date = FrozenDate as DateConstructor;
  return () => {
    globalThis.Date = RealDate;
  };
}

// ---------------------------------------------------------------- transporte

export interface ReplayCall {
  method: string;
  url: string;
  recording: string;
}

export interface ReplayFetch {
  fetch: typeof fetch;
  calls: ReplayCall[];
}

export interface ReplayOptions {
  // Devuelve una respuesta HTTP fallida para el proveedor indicado, para
  // caracterizar la degradación sin tocar las grabaciones.
  failProviders?: Array<'apify' | 'github' | 'exa' | 'gemini'>;
}

function readRecording<T>(name: string): T {
  return JSON.parse(readFileSync(join(PROVIDERS_DIR, `${name}.json`), 'utf8')) as T;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

interface ApifyRecording {
  runId: string;
  items: unknown[];
}

interface GithubRecording {
  search: unknown;
  users: Record<string, unknown>;
}

interface ExaRecording {
  byCity: Record<string, { results: unknown[] }>;
}

async function bodyOf(init?: RequestInit): Promise<Record<string, unknown>> {
  if (!init?.body || typeof init.body !== 'string') return {};
  try {
    const parsed: unknown = JSON.parse(init.body);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function createReplayFetch(options: ReplayOptions = {}): ReplayFetch {
  const failing = new Set(options.failProviders ?? []);
  const calls: ReplayCall[] = [];
  const apify: Record<string, ApifyRecording> = {
    'agenscrape~google-trends-scraper': readRecording('apify-google-trends'),
    'automation-lab~twitter-scraper': readRecording('apify-x-profiles'),
  };
  const github = readRecording<GithubRecording>('github');
  const exa = readRecording<ExaRecording>('exa-events');
  const gemini = readRecording<unknown>('gemini');

  const replay = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? 'GET').toUpperCase();
    const parsed = new URL(url);
    const record = (recording: string): void => {
      calls.push({ method, url, recording });
    };

    if (parsed.hostname === 'api.apify.com') {
      if (failing.has('apify')) {
        record('apify:failed');
        return jsonResponse({ error: { message: 'baseline-v0: apify forzado a fallar' } }, 503);
      }
      const start = parsed.pathname.match(/^\/v2\/actors\/([^/]+)\/runs$/);
      if (start && method === 'POST') {
        const actor = apify[start[1]];
        if (!actor) throw new Error(`baseline-v0: actor no grabado ${start[1]}`);
        record(`apify:start:${start[1]}`);
        return jsonResponse({ data: { id: actor.runId, status: 'RUNNING' } });
      }
      const run = parsed.pathname.match(/^\/v2\/actor-runs\/([^/]+)(\/dataset\/items)?$/);
      if (run) {
        const entry = Object.entries(apify).find(([, value]) => value.runId === run[1]);
        if (!entry) throw new Error(`baseline-v0: run no grabado ${run[1]}`);
        if (run[2]) {
          record(`apify:items:${entry[0]}`);
          return jsonResponse(entry[1].items);
        }
        record(`apify:wait:${entry[0]}`);
        return jsonResponse({ data: { id: entry[1].runId, status: 'SUCCEEDED' } });
      }
    }

    if (parsed.hostname === 'api.github.com') {
      if (failing.has('github')) {
        record('github:failed');
        return jsonResponse({ message: 'baseline-v0: github forzado a fallar' }, 503);
      }
      if (parsed.pathname === '/search/repositories') {
        record('github:search');
        return jsonResponse(github.search);
      }
      const user = parsed.pathname.match(/^\/users\/([^/]+)$/);
      if (user) {
        const profile = github.users[decodeURIComponent(user[1])];
        if (!profile) throw new Error(`baseline-v0: perfil de GitHub no grabado ${user[1]}`);
        record(`github:user:${user[1]}`);
        return jsonResponse(profile);
      }
    }

    if (parsed.hostname === 'api.exa.ai' && parsed.pathname === '/search') {
      if (failing.has('exa')) {
        record('exa:failed');
        return jsonResponse({ error: 'baseline-v0: exa forzado a fallar' }, 503);
      }
      const body = await bodyOf(init);
      const query = typeof body.query === 'string' ? body.query : '';
      const city = query.match(/ in (.+)$/)?.[1];
      const recording = city ? exa.byCity[city] : undefined;
      if (!recording) throw new Error(`baseline-v0: consulta Exa no grabada "${query}"`);
      record(`exa:${city}`);
      return jsonResponse(recording);
    }

    if (parsed.hostname === 'generativelanguage.googleapis.com') {
      if (failing.has('gemini')) {
        record('gemini:failed');
        return jsonResponse({ error: { message: 'baseline-v0: gemini forzado a fallar' } }, 503);
      }
      record('gemini');
      return jsonResponse(gemini);
    }

    throw new Error(`baseline-v0: petición no grabada ${method} ${url} (sin red en la repetición)`);
  };

  return { fetch: replay as typeof fetch, calls };
}

// ---------------------------------------------------------------- repetición

export interface ReplayScope {
  calls: ReplayCall[];
  restore: () => void;
}

// Instala reloj, transporte y claves falsas. Devuelve cómo restaurar todo.
export function enterReplay(
  options: ReplayOptions & { clock?: string; withGemini?: boolean } = {},
): ReplayScope {
  const restoreClock = freezeClock(options.clock ?? EVALUATION_CLOCK);
  const transport = createReplayFetch(options);
  const realFetch = globalThis.fetch;
  globalThis.fetch = transport.fetch;
  const previousEnv = new Map<string, string | undefined>();
  for (const [name, value] of Object.entries(FAKE_KEYS)) {
    previousEnv.set(name, process.env[name]);
    if (name === 'GEMINI_API_KEY' && options.withGemini === false) delete process.env[name];
    else process.env[name] = value;
  }
  previousEnv.set('GITHUB_TOKEN', process.env.GITHUB_TOKEN);
  delete process.env.GITHUB_TOKEN;
  return {
    calls: transport.calls,
    restore: () => {
      globalThis.fetch = realFetch;
      for (const [name, value] of previousEnv) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
      restoreClock();
    },
  };
}

export async function withReplay<T>(
  options: Parameters<typeof enterReplay>[0],
  run: (scope: ReplayScope) => Promise<T>,
): Promise<T> {
  const scope = enterReplay(options);
  try {
    return await run(scope);
  } finally {
    scope.restore();
  }
}

// `requestId` es la única parte no determinística de la salida de v0
// (crypto.randomUUID). Se enmascara para comparar repeticiones.
export function normalizeResponse(response: SearchResponse): SearchResponse {
  return { ...response, requestId: '<requestId enmascarado>' };
}

// ---------------------------------------------------------------- manifiesto

export function sha256File(relativePath: string): string {
  return createHash('sha256').update(readFileSync(join(FRONTEND_ROOT, relativePath))).digest('hex');
}

export function hashFiles(relativePaths: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const path of relativePaths) out[path] = sha256File(path);
  return out;
}

export interface SeedEventsSummary {
  sha256: string;
  events: number;
  withDate: number;
  withoutDate: number;
  expiredAtClock: number;
  futureAtClock: number;
  earliest: string | null;
  latest: string | null;
}

// Clasifica los eventos de un seed en el instante congelado. Lee el JSONC
// igual que el loader (solo quita líneas de comentario completas) y no muta
// ni reescribe nada.
export function summarizeSeedEvents(relativePath: string, clock: string = EVALUATION_CLOCK): SeedEventsSummary {
  const raw = readFileSync(join(FRONTEND_ROOT, relativePath), 'utf8');
  const stripped = raw.split(/\r?\n/).filter((line) => !/^\s*\/\//.test(line)).join('\n');
  const events = JSON.parse(stripped) as Array<{ startsAt: string | null }>;
  const instant = new Date(clock).getTime();
  const dates = events
    .map((event) => event.startsAt)
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .sort();
  const expired = dates.filter((value) => new Date(value).getTime() < instant).length;
  return {
    sha256: sha256File(relativePath),
    events: events.length,
    withDate: dates.length,
    withoutDate: events.length - dates.length,
    expiredAtClock: expired,
    futureAtClock: dates.length - expired,
    earliest: dates[0] ?? null,
    latest: dates[dates.length - 1] ?? null,
  };
}

export const SEED_EVENT_FILES = ['data/seed/sf-events.json', 'data/seed/nyc-events.json'] as const;

export const SEED_SUPPORT_FILES = [
  'data/seed/sf-communities.json',
  'data/seed/sf-organizers.json',
  'data/seed/sf-source-meta.json',
  'data/seed/nyc-communities.json',
  'data/seed/nyc-organizers.json',
  'data/seed/nyc-source-meta.json',
  'data/seed/community-evidence.json',
] as const;

export const V0_SOURCE_FILES = [
  'lib/contracts/growxth.ts',
  'lib/server/pipeline/resolve.ts',
  'lib/server/pipeline/global-market-search.ts',
  'lib/server/pipeline/search-opportunities.ts',
  'lib/server/reasoning/gemini.ts',
  'lib/server/discovery/exa-events.ts',
  'lib/server/connectors/apify.ts',
  'lib/server/graph/load-graph.ts',
  'lib/server/graph/derive-signals.ts',
  'lib/server/markets/city-catalog.ts',
  'lib/server/scoring/community-score.ts',
  'lib/server/scoring/theme-score.ts',
  'lib/server/scoring/roi.ts',
  'lib/server/scoring/score-utils.ts',
  'lib/server/audit/labels.ts',
  'lib/server/cache.ts',
  'lib/server/env.ts',
  'lib/api/opportunity-adapter.ts',
  'lib/api/types.ts',
  'app/api/opportunities/search/route.ts',
] as const;

export const V0_FIXTURE_FILES = [
  'lib/server/demo/fixtures.ts',
  'tests/fixtures/baseline-v0/providers/apify-google-trends.json',
  'tests/fixtures/baseline-v0/providers/apify-x-profiles.json',
  'tests/fixtures/baseline-v0/providers/github.json',
  'tests/fixtures/baseline-v0/providers/exa-events.json',
  'tests/fixtures/baseline-v0/providers/gemini.json',
] as const;

export interface Manifest {
  name: string;
  frozenAt: string;
  evaluationClock: string;
  commit: { head: string; branch: string; workingTreeDirty: boolean; note: string };
  versions: Record<string, string>;
  policy: {
    version: string;
    scoreSemantics: string[];
    scorers: Record<string, unknown>;
  };
  request: SearchRequest;
  sources: Record<string, string>;
  seeds: Record<string, SeedEventsSummary | string>;
  fixtures: Record<string, string>;
  suiteBaseline: Record<string, unknown>;
  secrets: string;
  notes: string[];
}

export function readManifest(): Manifest {
  return JSON.parse(readFileSync(join(BASELINE_DIR, 'manifest.json'), 'utf8')) as Manifest;
}

export interface Characterization {
  evaluationClock: string;
  request: SearchRequest;
  replay: SearchResponse;
  deterministic: SearchResponse;
  local: SearchResponse;
  oracles: Record<string, unknown>;
}

export function readCharacterization(): Characterization {
  return JSON.parse(readFileSync(join(BASELINE_DIR, 'characterization.json'), 'utf8')) as Characterization;
}

// Diferencia entre el manifiesto y el árbol actual, por sección.
export function driftAgainst(recorded: Record<string, string>): string[] {
  return Object.entries(recorded)
    .filter(([path, hash]) => !existsSync(join(FRONTEND_ROOT, path)) || sha256File(path) !== hash)
    .map(([path]) => path);
}

// ---------------------------------------------------------------- corridas v0

export const SEED_DIR = join(FRONTEND_ROOT, 'data', 'seed');

export interface ReplayResult {
  response: SearchResponse;
  calls: ReplayCall[];
}

// Frontera de búsqueda de v0 (searchOrFixture) con cache aislada, reloj
// congelado y proveedores grabados. `withGemini: false` deja la redacción
// fuera y devuelve el orden determinístico con su warning.
export async function runReplay(
  request: SearchRequest = BASELINE_REQUEST,
  options: Parameters<typeof enterReplay>[0] = {},
): Promise<ReplayResult> {
  const v0 = await loadV0();
  return withReplay(options, async (scope) => {
    const resolver = v0.resolve.createSearchResolver({
      cache: new v0.cache.TtlCache<SearchResponse>(v0.cache.SIX_HOURS_MS),
    });
    const response = await resolver(request);
    return { response: normalizeResponse(response), calls: [...scope.calls] };
  });
}

// Pipeline local sobre los seeds históricos, con reloj congelado. En v0 la
// ruta HTTP no llega acá salvo excepción (el ranking mundial nunca devuelve 0
// oportunidades); se corre directo para caracterizar la vigencia.
export async function runLocalPipeline(
  request: SearchRequest = BASELINE_REQUEST,
  clock: string = EVALUATION_CLOCK,
): Promise<SearchResponse> {
  const v0 = await loadV0();
  const restore = freezeClock(clock);
  try {
    const response = v0.searchOpportunities.searchOpportunities(request, {
      deps: {
        graph: v0.loadGraph.loadGraph(SEED_DIR),
        evidence: v0.loadGraph.loadEvidence(SEED_DIR),
        communityEvidence: v0.loadGraph.loadCommunityEvidence(SEED_DIR),
      },
    });
    return normalizeResponse(response);
  } finally {
    restore();
  }
}

// ---------------------------------------------------------------- oráculos

export type OracleId = 'O1' | 'O2' | 'O3' | 'O4' | 'O5';

export interface OracleCase {
  oracle: OracleId;
  ticket: '02' | '03' | '04' | '05' | '06';
  predicate: string;
  // Valor que produce la v0 congelada (defecto) y valor deseado (corrección).
  v0: unknown;
  desired: unknown;
  observed: unknown;
}

const INVENTED_NARRATIVE_PREFIX = '80% of attendees at Berlin AI meetups';
const EXA_NO_LOCATION_URL = 'https://example.org/baseline-v0/llm-monitoring-online';
const EXA_PAST_RECAP_URL = 'https://example.org/baseline-v0/observability-day-india-recap';

function reasonEvidence(response: SearchResponse, id: string): string[] {
  const opportunity = response.opportunities.find((item) => item.id === id);
  return opportunity ? opportunity.reasons.flatMap((reason) => reason.evidenceIds) : [];
}

// O4.1 — observable CONDUCTUAL del defecto «narrativa con cita inexistente»:
// v0 la publica igual, sustituyendo sus citas por citas propias de la
// oportunidad. El observable es el comportamiento (publicada + citas tomadas
// del conjunto propio, no la cita inexistente original), NO la cantidad ni la
// lista exacta de ids: ese conjunto cambia legítimamente cuando otros tickets
// corrigen qué se cita (p. ej. 04 dejó de citar el recap vencido) sin que el
// defecto de 05 cambie. `publishedEvidenceIds` es null cuando la narrativa no
// se publicó como razón.
export function narrativeSubstitutionObservable(
  publishedEvidenceIds: readonly string[] | null,
  ownEvidenceIds: readonly string[],
): { published: boolean; substitutedWithOwnCitations: boolean } {
  if (publishedEvidenceIds == null) {
    return { published: false, substitutedWithOwnCitations: false };
  }
  const own = new Set(ownEvidenceIds);
  return {
    published: true,
    substitutedWithOwnCitations:
      publishedEvidenceIds.length > 0 && publishedEvidenceIds.every((id) => own.has(id)),
  };
}

// Ejecuta la reproducción de cada oráculo sobre el código actual y devuelve,
// por predicado, lo observado junto con lo que da v0 y lo deseado. No decide
// cuál es correcto: eso lo hacen las pruebas de 02–06.
export async function observeOracles(): Promise<OracleCase[]> {
  const v0 = await loadV0();
  const cases: OracleCase[] = [];

  // O1 — presupuesto. Dos peticiones idénticas salvo budgetUsd, sobre la misma
  // frontera y cache; luego el mismo par concurrente sobre una cache nueva.
  const sequential = await withReplay({}, async () => {
    const resolver = v0.resolve.createSearchResolver({
      cache: new v0.cache.TtlCache<SearchResponse>(v0.cache.SIX_HOURS_MS),
    });
    const first = await resolver({ ...BASELINE_REQUEST, budgetUsd: 2000 });
    const second = await resolver({ ...BASELINE_REQUEST, budgetUsd: 20000 });
    const same = await resolver({ ...BASELINE_REQUEST, budgetUsd: 2000 });
    return { first, second, same };
  });
  const concurrent = await withReplay({}, async () => {
    const resolver = v0.resolve.createSearchResolver({
      cache: new v0.cache.TtlCache<SearchResponse>(v0.cache.SIX_HOURS_MS),
    });
    const [first, second] = await Promise.all([
      resolver({ ...BASELINE_REQUEST, budgetUsd: 2000 }),
      resolver({ ...BASELINE_REQUEST, budgetUsd: 20000 }),
    ]);
    return { first, second };
  });
  cases.push(
    {
      oracle: 'O1',
      ticket: '02',
      predicate: 'query.budgetUsd devuelto a la segunda petición secuencial (USD 20.000)',
      v0: 2000,
      desired: 20000,
      observed: sequential.second.query.budgetUsd,
    },
    {
      oracle: 'O1',
      ticket: '02',
      predicate: 'query.budgetUsd devuelto a la segunda petición concurrente (USD 20.000)',
      v0: 2000,
      desired: 20000,
      observed: concurrent.second.query.budgetUsd,
    },
    {
      oracle: 'O1',
      ticket: '02',
      predicate: 'una petición equivalente (mismo presupuesto) sí reutiliza la respuesta',
      v0: true,
      desired: true,
      observed: sequential.same.requestId === sequential.first.requestId,
    },
  );

  // O2 — geografía. Señal nacional (India) presentada como mercado urbano, y
  // ciudad de la consulta copiada a un resultado de Exa sin lugar.
  const replay = (await runReplay()).response;
  const bengaluru = replay.opportunities.find((item) => item.id === 'opp-global-bengaluru');
  const bengaluruTrend = bengaluru?.momentumSignals?.find((signal) => signal.source === 'google_trends');
  const trendEvidence = (bengaluruTrend?.evidenceIds ?? []).map((id) => replay.evidence[id]?.location ?? null);
  const exaNoLocation = Object.values(replay.evidence).find((item) => item.url === EXA_NO_LOCATION_URL);
  cases.push(
    {
      oracle: 'O2',
      ticket: '03',
      predicate:
        'mercado con señal de Trends exclusivamente nacional (India) presentado con market.city como ubicación (basis country)',
      v0: { presentedAsCity: 'Bengaluru', trendBasis: 'country', trendEvidenceLocations: ['India'] },
      desired: { presentedAsCity: null, trendBasis: 'country', trendEvidenceLocations: ['India'] },
      observed: {
        presentedAsCity: bengaluru?.market?.city ?? null,
        trendBasis: bengaluruTrend?.basis ?? null,
        trendEvidenceLocations: trendEvidence,
      },
    },
    {
      oracle: 'O2',
      ticket: '03',
      predicate: 'resultado de Exa sin lugar en el texto recibe como location la ciudad de la consulta',
      v0: 'Bengaluru',
      desired: null,
      observed: exaNoLocation?.location ?? null,
    },
  );

  // O3 — vigencia. Seeds vencidos presentados como «upcoming», fecha ausente
  // reemplazada por el reloj en el adaptador, recap de evento pasado contado
  // como listing vivo por su fecha de publicación reciente.
  const local = await runLocalPipeline();
  const clock = new Date(EVALUATION_CLOCK).getTime();
  const expiredListedAsUpcoming = local.opportunities
    .filter(
      (item) =>
        item.event?.startsAt != null &&
        new Date(item.event.startsAt).getTime() < clock &&
        item.reasons.some((reason) => /upcoming/i.test(reason.text)),
    )
    .map((item) => ({ id: item.id, startsAt: item.event?.startsAt ?? null }));
  const restoreClock = freezeClock();
  let adapterStartsAt: string | null;
  try {
    const fixture = v0.fixtures.getFixtureSearchResponse();
    const withoutDate: SearchResponse = {
      ...fixture,
      opportunities: fixture.opportunities
        .filter((item) => item.event != null)
        .slice(0, 1)
        .map((item) => ({ ...item, event: item.event ? { ...item.event, startsAt: null } : null })),
    };
    adapterStartsAt = v0.adapter.toLegacyShape(withoutDate).opportunities[0]?.events[0]?.startsAt ?? null;
  } finally {
    restoreClock();
  }
  const pastRecap = Object.values(replay.evidence).find((item) => item.url === EXA_PAST_RECAP_URL);
  cases.push(
    {
      oracle: 'O3',
      ticket: '04',
      predicate: 'oportunidades locales cuyo evento ya venció en el reloj congelado y aun así se citan como «upcoming»',
      v0: { count: 3 },
      desired: { count: 0 },
      observed: { count: expiredListedAsUpcoming.length },
    },
    {
      oracle: 'O3',
      ticket: '04',
      predicate: 'evento sin fecha: startsAt que el adaptador entrega a la UI',
      v0: EVALUATION_CLOCK,
      desired: null,
      observed: adapterStartsAt,
    },
    {
      oracle: 'O3',
      ticket: '04',
      predicate: 'recap de un evento del 12 Ago 2026 publicado el 5 Sep se cita como listing vivo (observed) en la razón de Exa',
      v0: { citedAsLive: true, status: 'observed', observedAt: '2026-09-05T00:00:00.000Z' },
      desired: { citedAsLive: false, status: 'observed', observedAt: '2026-09-05T00:00:00.000Z' },
      observed: {
        citedAsLive: pastRecap != null && reasonEvidence(replay, 'opp-global-bengaluru').includes(pastRecap.id),
        status: pastRecap?.status ?? null,
        observedAt: pastRecap?.observedAt ?? null,
      },
    },
  );

  // O4 — soporte de citas. Narrativa con cita inexistente conservada con las
  // citas propias; cita ajena y cita real irrelevante aceptadas como soporte.
  const berlin = replay.opportunities.find((item) => item.id === 'opp-global-berlin');
  const inventedReason = berlin?.reasons.find((reason) => reason.text.startsWith(INVENTED_NARRATIVE_PREFIX));
  const deterministicBerlin = (await runReplay(BASELINE_REQUEST, { withGemini: false })).response.opportunities.find(
    (item) => item.id === 'opp-global-berlin',
  );
  const berlinOwnIds = [...new Set(deterministicBerlin?.reasons.flatMap((reason) => reason.evidenceIds) ?? [])];
  const sanFrancisco = replay.opportunities.find((item) => item.id === 'opp-global-san-francisco');
  const foreignReason = sanFrancisco?.reasons.find((reason) => reason.text.startsWith('Search interest for AI observability is at 96/100'));
  const irrelevantReason = bengaluru?.reasons.find((reason) => reason.text.startsWith('Bengaluru hosts 40+ observability meetups'));
  cases.push(
    {
      oracle: 'O4',
      ticket: '05',
      predicate: 'narrativa que solo cita un id inexistente: se publica como razón y con qué citas',
      // Valor v0 documentado desde la captura congelada (characterization.json:
      // la narrativa se publicó con las citas propias de Berlín sustituidas).
      // Es una constante conductual, nunca se recalcula con el pipeline actual.
      v0: { published: true, substitutedWithOwnCitations: true },
      desired: { published: false, substitutedWithOwnCitations: false },
      observed: narrativeSubstitutionObservable(
        inventedReason ? inventedReason.evidenceIds : null,
        berlinOwnIds,
      ),
    },
    {
      oracle: 'O4',
      ticket: '05',
      predicate: 'narrativa de San Francisco que cita evidencia de Bengaluru (ajena): publicada como razón factual',
      v0: { published: true, citesForeign: true },
      desired: { published: false, citesForeign: false },
      observed: {
        published: foreignReason != null,
        citesForeign: (foreignReason?.evidenceIds ?? []).some((id) => replay.evidence[id]?.location === 'India'),
      },
    },
    {
      oracle: 'O4',
      ticket: '05',
      predicate: 'cifra («40+ meetups por trimestre») respaldada solo por un listing de un evento: publicada como razón factual',
      v0: true,
      desired: false,
      observed: irrelevantReason != null,
    },
  );

  // O5 — orden. Con el modelo devolviendo rank invertido, el orden visible y
  // el rank del adaptador deben seguir al scorer; sin modelo, orden idéntico.
  const deterministic = (await runReplay(BASELINE_REQUEST, { withGemini: false })).response;
  const deterministicOrder = deterministic.opportunities.map((item) => item.id);
  const replayOrder = replay.opportunities.map((item) => item.id);
  const restoreForAdapter = freezeClock();
  let adapterRanks: Array<{ id: string; rank: number }>;
  try {
    adapterRanks = v0.adapter.toLegacyShape(replay).opportunities.map((item) => ({ id: item.id, rank: item.rank }));
  } finally {
    restoreForAdapter();
  }
  const scoresById = (response: SearchResponse): Array<[string, number]> =>
    response.opportunities
      .map((item): [string, number] => [item.id, item.score])
      .sort(([a], [b]) => a.localeCompare(b));
  cases.push(
    {
      oracle: 'O5',
      ticket: '06',
      predicate: 'orden de opportunities con modelo (rank invertido) frente al orden determinístico',
      v0: { order: [...deterministicOrder].reverse(), deterministicOrder },
      desired: { order: deterministicOrder, deterministicOrder },
      observed: { order: replayOrder, deterministicOrder },
    },
    {
      oracle: 'O5',
      ticket: '06',
      predicate: 'rank que el adaptador entrega a la UI sigue al orden del array recibido',
      v0: [...deterministicOrder].reverse().map((id, index) => ({ id, rank: index + 1 })),
      desired: deterministicOrder.map((id, index) => ({ id, rank: index + 1 })),
      observed: adapterRanks,
    },
    {
      oracle: 'O5',
      ticket: '06',
      predicate: 'scores por oportunidad con y sin modelo',
      v0: { unchanged: true },
      desired: { unchanged: true },
      observed: {
        unchanged: JSON.stringify(scoresById(replay)) === JSON.stringify(scoresById(deterministic)),
      },
    },
  );

  return cases;
}

export function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
