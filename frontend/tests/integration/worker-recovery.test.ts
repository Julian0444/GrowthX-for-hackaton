// Ticket 15 — matriz de caídas del recorrido persistido, contra PostgreSQL y
// pg-boss REALES con el worker como PROCESO SEPARADO. Sin base disponible la
// suite se salta con aviso (la durabilidad no se simula con Maps).
//
// Aislamiento de la suite: usa su PROPIA base (growthx_t15_recovery) en el
// mismo contenedor, recreada al inicio. Motivo: `node --test` corre los
// archivos en paralelo y la cola pg-boss es por base — un worker ajeno (el de
// evaluation-run.test.ts) levantaría los jobs de esta matriz sin el transporte
// controlado y saldría a la red real, y los workers de esta suite (con
// barreras de kill) matarían jobs ajenos. Los roles son de clúster y ya
// existen; las migraciones corren igual sobre la base dedicada.
//
// Barreras explícitas (nada de sleeps arbitrarios): el worker se mata a sí
// mismo con SIGKILL en puntos exactos alrededor de los commits
// (GROWTHX_WORKER_KILL_AT), o el test lo mata cuando el transporte de fixture
// registra que la obtención está EN VUELO (archivo marker). La re-entrega tras
// un SIGKILL se acelera reponiendo el job 'active' a 'retry' — exactamente lo
// que el mantenimiento de la cola hace al expirar (expireInSeconds); el estado
// de negocio bajo prueba no se toca.

import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

// `next/server` no resuelve bajo `node --test`; solo en este proceso se mapea
// al archivo real del paquete (mismo criterio que evaluation-run.test.ts).
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'next/server') return nextResolve('next/server.js', context);
    return nextResolve(specifier, context);
  },
});

const DB_NAME = 'growthx_t15_recovery';
const DEFAULTS: Record<string, string> = {
  GROWTHX_ADMIN_DATABASE_URL: 'postgres://growthx:growthx@127.0.0.1:54329/growthx',
  GROWTHX_DATABASE_URL: 'postgres://growthx_app:growthx_app_dev@127.0.0.1:54329/growthx',
  GROWTHX_WORKER_DATABASE_URL: 'postgres://growthx_worker:growthx_worker_dev@127.0.0.1:54329/growthx',
  GROWTHX_QUEUE_DATABASE_URL: 'postgres://growthx_queue:growthx_queue_dev@127.0.0.1:54329/growthx',
};
for (const [name, value] of Object.entries(DEFAULTS)) {
  if (!process.env[name]) process.env[name] = value;
}
// URL de mantenimiento (base principal) para crear/recrear la base dedicada.
const MAINTENANCE_URL = process.env.GROWTHX_ADMIN_DATABASE_URL!;
for (const name of Object.keys(DEFAULTS)) {
  const url = new URL(process.env[name]!);
  url.pathname = `/${DB_NAME}`;
  process.env[name] = url.toString();
}
// Ningún proveedor pagado: la redacción degrada a deterministic_only y ninguna
// obtención puede salir a Exa/Apify/Gemini desde los workers hijos.
for (const key of ['GEMINI_API_KEY', 'EXA_API_KEY', 'APIFY_TOKEN']) delete process.env[key];

const FRONTEND_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

import { hashSessionToken, SESSION_COOKIE } from '../../lib/server/auth/session.ts';
import { closePools, getAppPool, getWorkerPool, withTenantTransaction } from '../../lib/server/db/pool.ts';
import { runMigrations } from '../../lib/server/db/migrate.ts';
import { loadCuratedCatalog } from '../../lib/server/catalog/store.ts';
import { readEditionDossier } from '../../lib/server/catalog/read.ts';
import { FIXTURE_CURATION_MANIFEST } from '../../lib/server/catalog/fixture-manifest.ts';
import type { CurationManifest } from '../../lib/server/catalog/manifest.ts';
import { createEvaluationService } from '../../lib/server/evaluations/service.ts';
import { stopEvaluationQueue } from '../../lib/server/evaluations/queue.ts';
import { processEvaluationRun } from '../../lib/server/evaluations/run-worker.ts';
import type { ComparisonRunResult, ComparisonStepOptions } from '../../lib/server/evaluations/compare.ts';

const routesPromise = (async () => {
  const [collection, item, ingest, decisions] = await Promise.all([
    import('../../app/api/evaluations/route.ts'),
    import('../../app/api/evaluations/[id]/route.ts'),
    import('../../app/api/events/ingest/route.ts'),
    import('../../app/api/decisions/route.ts'),
  ]);
  return {
    postEvaluations: collection.POST,
    getEvaluation: item.GET,
    postIngest: ingest.POST,
    postDecisions: decisions.POST,
  };
})();

// ============ Utilidades ============

interface Seeded {
  tenantId: string;
  userId: string;
  token: string;
}

const SUMMIT = 'ed-sf-dev-summit-2027';
const ML_NIGHT = 'ed-ml-night-2026';
// Texto privado que la página incluye pero NADIE debe persistir ni loguear
// (viaja en un comentario HTML: no es un campo del evento).
const HTML_PRIVATE_SENTINEL = 'SECRETO-HTML-PRIVADO-15';

async function probeMaintenance(): Promise<pg.Client | null> {
  const client = new pg.Client({ connectionString: MAINTENANCE_URL, connectionTimeoutMillis: 3000 });
  try {
    await client.connect();
    return client;
  } catch {
    return null;
  }
}

async function seedTenant(admin: pg.Client, label: string): Promise<Seeded> {
  const slug = `rec-${label}-${randomUUID().slice(0, 8)}`;
  const { rows: tenantRows } = await admin.query(
    'insert into growthx.tenants (slug, display_name) values ($1, $2) returning id',
    [slug, `Tenant ${label}`],
  );
  const tenantId = tenantRows[0].id as string;
  const { rows: userRows } = await admin.query(
    'insert into growthx.app_users (email, display_name) values ($1, $2) returning id',
    [`${slug}@test.local`, `Usuario ${label}`],
  );
  const userId = userRows[0].id as string;
  await admin.query('insert into growthx.memberships (tenant_id, user_id) values ($1, $2)', [tenantId, userId]);
  const token = randomBytes(24).toString('hex');
  await admin.query(
    `insert into growthx.sessions (token_hash, user_id, tenant_id, expires_at)
     values ($1, $2, $3, now() + interval '2 hours')`,
    [hashSessionToken(token), userId, tenantId],
  );
  return { tenantId, userId, token };
}

// Catálogo sintético controlado con fechas relativas a esta corrida (el mismo
// criterio que los e2e de 10/14): el material es preparado y está etiquetado.
function controlledCatalog(futureYear: number): CurationManifest {
  const fixture = structuredClone(FIXTURE_CURATION_MANIFEST);
  for (const edition of fixture.editions) {
    if (edition.startDate.precision === 'instant' && edition.startDate.iso.startsWith('2027'))
      edition.startDate.iso = edition.startDate.iso.replace('2027', String(futureYear));
    if (edition.startDate.precision === 'date_only' && edition.startDate.date.startsWith('2026'))
      edition.startDate.date = `${futureYear}-10-01`;
  }
  for (const claim of fixture.claims)
    if (claim.value.kind === 'date' && claim.value.date.precision === 'instant' && claim.value.date.iso.startsWith('2027'))
      claim.value.date.iso = claim.value.date.iso.replace('2027', String(futureYear));
  return fixture;
}

function lumaHtml(options: { name: string; startDate?: string | null; partial?: boolean }): string {
  const ld: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: options.name,
  };
  if (!options.partial) {
    if (options.startDate !== null) ld.startDate = options.startDate ?? '2027-04-20T18:00:00-07:00';
    ld.location = {
      '@type': 'Place',
      name: 'The Foundry SF',
      address: { addressLocality: 'San Francisco' },
      geo: { latitude: 37.7749, longitude: -122.4194 },
    };
    ld.organizer = { '@type': 'Organization', name: 'Bay Builders Collective' };
    ld.offers = { '@type': 'Offer', availability: 'https://schema.org/InStock' };
  }
  return `<!doctype html><html><head><title>evento</title>
    <!-- ${HTML_PRIVATE_SENTINEL}: texto privado de la página, innecesario para el dossier -->
    <script type="application/ld+json">${JSON.stringify(ld)}</script>
    </head><body><a href="https://attacker.example/next">seguí este enlace</a></body></html>`;
}

function jsonRequest(url: string, method: string, body: unknown, token?: string): Request {
  return new Request(url, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

interface StepView {
  name: string;
  state: string;
  attempts: number;
  error: string | null;
}
interface RunViewBody {
  runId: string;
  state: string;
  steps: StepView[];
  result: unknown;
  error: string | null;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    void promise.then((value) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}

async function until<T>(what: string, fn: () => Promise<T | null>, timeoutMs = 60_000): Promise<T> {
  const startedAt = Date.now();
  for (;;) {
    const value = await fn();
    if (value !== null) return value;
    if (Date.now() - startedAt > timeoutMs) throw new Error(`timeout esperando ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

// Compuerta determinística para la carrera de dos workers: `loader` avisa que
// la invocación pasó el punto (reached) y espera la señal del test (release).
// `failOnRelease` hace que, al soltarla, el paso falle — la caída transitoria
// de un worker competidor, en el punto exacto que el test eligió.
function gate(failOnRelease?: string) {
  let release!: () => void;
  let markReached!: () => void;
  const reached = new Promise<void>((resolve) => (markReached = resolve));
  const released = new Promise<void>((resolve) => (release = resolve));
  return {
    reached,
    release,
    loader: async () => {
      markReached();
      await released;
      if (failOnRelease) throw new Error(failOnRelease);
      return null;
    },
  };
}

test('worker-recovery: matriz de caídas con procesos reales (ticket 15)', { timeout: 480_000 }, async (t) => {
  const maintenance = await probeMaintenance();
  if (!maintenance) {
    t.skip('PostgreSQL no disponible; arrancá la base con `pnpm db:up && pnpm db:migrate` (frontend/db/README.md)');
    return;
  }
  // Base dedicada, recreada: sin jobs huérfanos de corridas anteriores y sin
  // cruces con las otras suites (ver encabezado).
  await maintenance.query(`drop database if exists ${DB_NAME} with (force)`);
  await maintenance.query(`create database ${DB_NAME}`);
  await maintenance.end();

  // ensureRoles hace ALTER ROLE (de clúster): otra suite migrando la base
  // principal en paralelo puede chocar («tuple concurrently updated», el lock
  // advisory es por base). Se reintenta; no es un fallo del slice.
  for (let i = 0; ; i++) {
    try {
      await runMigrations();
      break;
    } catch (error) {
      if (i >= 4 || !/tuple concurrently updated/.test(String((error as Error).message))) throw error;
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }

  const admin = new pg.Client({ connectionString: process.env.GROWTHX_ADMIN_DATABASE_URL });
  await admin.connect();

  const temp = mkdtempSync(path.join(tmpdir(), 'growthx-recovery-'));
  const fixturePath = path.join(temp, 'luma-fixture.json');
  const callsFile = path.join(temp, 'luma-calls.log');
  const markerA = path.join(temp, 'fetch-a-en-vuelo');
  writeFileSync(fixturePath, '{}');
  writeFileSync(callsFile, '');

  const workers: ChildProcess[] = [];
  t.after(async () => {
    for (const child of workers) if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await stopEvaluationQueue();
    await closePools();
    await admin.end();
    rmSync(temp, { recursive: true, force: true });
  });

  const { postEvaluations, getEvaluation, postIngest, postDecisions } = await routesPromise;
  const real = await seedTenant(admin, 'real');
  const decoy = await seedTenant(admin, 'decoy');
  const futureYear = new Date().getUTCFullYear() + 1;
  await loadCuratedCatalog(getAppPool(), real.tenantId, controlledCatalog(futureYear));

  const view = async (runId: string, token = real.token): Promise<{ status: number; body: RunViewBody }> => {
    const response = await getEvaluation(
      new Request(`http://localhost/api/evaluations/${runId}`, { headers: { cookie: `${SESSION_COOKIE}=${token}` } }),
      { params: Promise.resolve({ id: runId }) },
    );
    return { status: response.status, body: (await response.json().catch(() => null)) as RunViewBody };
  };
  const stepsByName = (body: RunViewBody) => Object.fromEntries(body.steps.map((step) => [step.name, step]));

  const accept202 = async (response: Response): Promise<string> => {
    const text = await response.text();
    assert.equal(response.status, 202, text);
    return (JSON.parse(text) as { runId: string }).runId;
  };

  function spawnWorker(env: Record<string, string> = {}) {
    const child = spawn(process.execPath, ['worker/index.ts'], {
      cwd: FRONTEND_DIR,
      env: {
        ...process.env,
        GROWTHX_WORKER_POLL_SECONDS: '0.5',
        GROWTHX_WORKER_LUMA_FIXTURE: fixturePath,
        GROWTHX_WORKER_LUMA_CALLS_FILE: callsFile,
        ...env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    workers.push(child);
    let output = '';
    child.stdout?.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.stderr?.on('data', (chunk: Buffer) => (output += chunk.toString()));
    const exited = new Promise<{ code: number | null; signal: string | null }>((resolve) =>
      child.once('exit', (code, signal) => resolve({ code, signal })),
    );
    return {
      child,
      exited,
      output: () => output,
      sigkill: () => child.kill('SIGKILL'),
      stop: async () => {
        if (child.exitCode !== null || child.signalCode !== null) return;
        child.kill('SIGTERM');
        await withTimeout(exited, 12_000);
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      },
    };
  }

  // Re-entrega tras SIGKILL: lo que la cola haría sola al expirar el job
  // (active → retry), sin esperar los 120 s de expireInSeconds. Los reintentos
  // programados (retry con start_after futuro) también se adelantan.
  const expedite = async (runId: string) => {
    await admin.query(
      `update pgboss.job set state = 'retry', start_after = now()
        where name = 'evaluation-run' and singleton_key = $1 and state = 'active'`,
      [runId],
    );
    await admin.query(
      `update pgboss.job set start_after = now()
        where name = 'evaluation-run' and singleton_key = $1 and state in ('retry', 'created')`,
      [runId],
    );
  };

  const cancelJob = async (runId: string) => {
    await admin.query(
      `update pgboss.job set state = 'cancelled'
        where name = 'evaluation-run' and singleton_key = $1 and state in ('created', 'retry', 'active')`,
      [runId],
    );
  };

  const completed = (runId: string, timeoutMs = 60_000) =>
    until(
      `run ${runId} completado`,
      async () => {
        const { status, body } = await view(runId);
        assert.equal(status, 200);
        if (body.state === 'failed') throw new Error(`run ${runId} falló: ${body.error}`);
        return body.state === 'completed' ? body : null;
      },
      timeoutMs,
    );

  const importedCounts = async () => {
    const q = async (sql: string) =>
      Number((await admin.query(sql, [real.tenantId])).rows[0].n);
    return {
      loads: await q(`select count(*)::int as n from growthx.catalog_loads where tenant_id = $1 and material = 'imported'`),
      sources: await q('select count(*)::int as n from growthx.sources where tenant_id = $1'),
      editionRevisions: await q('select count(*)::int as n from growthx.edition_revisions where tenant_id = $1'),
      claimRevisions: await q('select count(*)::int as n from growthx.claim_revisions where tenant_id = $1'),
    };
  };

  // ---- Perfil base (investigación) procesado por un worker real ----
  const researchBody = {
    idempotencyKey: `rec-research-${randomUUID()}`,
    mode: 'catalog_research' as const,
    profile: {
      product: 'SDK de agentes para backend',
      audienceDescription: 'Equipos backend adoptando tooling de AI',
      audienceProfiles: ['backend'],
      stack: ['python'],
      budget: { status: 'unknown' as const },
      window: { from: null, to: null },
      objective: { kind: 'feedback' as const },
    },
  };
  const researchId = await accept202(
    await postEvaluations(jsonRequest('http://localhost/api/evaluations', 'POST', researchBody, real.token)),
  );
  {
    const w = spawnWorker();
    await completed(researchId);
    await w.stop();
  }

  const ingestBody = (url: string) => ({
    idempotencyKey: `rec-ingest-${randomUUID()}`,
    url,
    profileRunId: researchId,
  });
  const comparisonBody = (editionIds: string[]) => ({
    idempotencyKey: `rec-cmp-${randomUUID()}`,
    mode: 'investment_comparison' as const,
    profileRunId: researchId,
    editionIds,
  });

  // ============ Criterio: interrupción abrupta DURANTE la obtención ============
  const URL_A = 'https://lu.ma/growthx-rec-a';
  let ingestAId = '';
  await t.test('SIGKILL con la obtención EN VUELO: nada confirmado se pierde; la llamada no confirmada se repite y queda trazada', async () => {
    writeFileSync(fixturePath, JSON.stringify({ [URL_A]: { hang: true, marker: markerA } }));
    ingestAId = await accept202(
      await postIngest(jsonRequest('http://localhost/api/events/ingest', 'POST', ingestBody(URL_A), real.token)),
    );
    const w = spawnWorker();
    // Barrera real: el transporte registra que la request llegó (archivo
    // marker) y la deja en vuelo; recién ahí se mata el proceso.
    await until('obtención en vuelo', async () => (existsSync(markerA) ? true : null));
    w.sigkill();
    const exit = await w.exited;
    assert.equal(exit.signal, 'SIGKILL');

    const midway = await view(ingestAId);
    assert.equal(midway.body.state, 'running');
    const steps = stepsByName(midway.body);
    assert.equal(steps.validate_profile.state, 'completed');
    assert.equal(steps.fetch_event_page.state, 'running', 'la obtención quedó sin confirmar');
    assert.equal(steps.persist_dossier.state, 'pending');
    const before = await importedCounts();
    assert.equal(before.loads, 0, 'sin dossier importado: la obtención no llegó a confirmarse');

    // Reinicio: la página ahora responde; el MISMO run llega a terminal.
    writeFileSync(fixturePath, JSON.stringify({ [URL_A]: { body: lumaHtml({ name: 'GrowthX Recovery Night', startDate: `${futureYear}-04-20T18:00:00-07:00` }) } }));
    await expedite(ingestAId);
    const w2 = spawnWorker();
    const done = await completed(ingestAId);
    await w2.stop();

    const doneSteps = stepsByName(done);
    assert.equal(doneSteps.fetch_event_page.attempts, 2, 'la obtención no confirmada se repitió');
    const after = await importedCounts();
    assert.equal(after.loads, 1, 'un solo dossier importado');
    const calls = readFileSync(callsFile, 'utf8').split('\n').filter((line) => line === URL_A);
    assert.equal(calls.length, 2, 'la request en vuelo + su repetición, ambas trazadas por el transporte');
    // Y trazada en la base: dos intentos del run en los logs persistidos.
    const { rows: attempts } = await admin.query(
      `select distinct attempt from growthx.run_logs where run_id = $1 and attempt is not null order by attempt`,
      [ingestAId],
    );
    assert.deepEqual(attempts.map((row) => Number(row.attempt)), [1, 2]);
  });

  // ============ Criterio: interrupción DESPUÉS de guardar claims ============
  const URL_B = 'https://lu.ma/growthx-rec-b';
  await t.test('SIGKILL tras guardar claims (paso sin confirmar): la reanudación no duplica efectos', async () => {
    writeFileSync(fixturePath, JSON.stringify({ [URL_B]: { body: lumaHtml({ name: 'GrowthX Claims Night', startDate: `${futureYear}-05-11T18:00:00-07:00` }) } }));
    const runId = await accept202(
      await postIngest(jsonRequest('http://localhost/api/events/ingest', 'POST', ingestBody(URL_B), real.token)),
    );
    const w = spawnWorker({ GROWTHX_WORKER_KILL_AT: 'before_step_commit:persist_dossier' });
    const exit = await w.exited;
    assert.equal(exit.signal, 'SIGKILL', `el worker se mató en la barrera. Salida:\n${w.output()}`);

    // Los claims YA están (la transacción del dossier commiteó) pero el paso no.
    const midway = await view(runId);
    const steps = stepsByName(midway.body);
    assert.equal(steps.persist_dossier.state, 'running', 'el paso quedó sin confirmar');
    assert.notEqual(midway.body.state, 'completed');
    const before = await importedCounts();
    assert.equal(before.loads, 2, 'el dossier de esta importación quedó guardado antes del kill');

    await expedite(runId);
    const w2 = spawnWorker();
    const done = await completed(runId);
    await w2.stop();

    // El paso se re-ejecutó (no estaba confirmado) pero es idempotente: ids
    // deterministas por run — ni claims, ni fuentes, ni revisiones duplicadas.
    const after = await importedCounts();
    assert.deepEqual(after, before, 'reanudar no duplicó ningún efecto ya confirmado');
    assert.equal(stepsByName(done).persist_dossier.attempts, 2);
    const result = done.result as { editionId?: string };
    assert.ok(result && typeof result.editionId === 'string', 'resultado publicado una vez');
  });

  // ==== Criterio: fallo entre el commit de un paso y el siguiente trabajo ====
  const URL_C = 'https://lu.ma/growthx-rec-c';
  await t.test('SIGKILL entre el commit de un paso y el siguiente: el avance confirmado no se re-ejecuta', async () => {
    writeFileSync(fixturePath, JSON.stringify({ [URL_C]: { body: lumaHtml({ name: 'GrowthX Commit Night', startDate: `${futureYear}-06-02T18:00:00-07:00` }) } }));
    const runId = await accept202(
      await postIngest(jsonRequest('http://localhost/api/events/ingest', 'POST', ingestBody(URL_C), real.token)),
    );
    const w = spawnWorker({ GROWTHX_WORKER_KILL_AT: 'after_step_commit:fetch_event_page' });
    const exit = await w.exited;
    assert.equal(exit.signal, 'SIGKILL', w.output());

    const midway = await view(runId);
    const steps = stepsByName(midway.body);
    assert.equal(steps.fetch_event_page.state, 'completed', 'la obtención quedó confirmada');
    assert.equal(steps.persist_dossier.state, 'pending');

    await expedite(runId);
    const w2 = spawnWorker();
    const done = await completed(runId);
    await w2.stop();

    assert.equal(stepsByName(done).fetch_event_page.attempts, 1, 'el paso confirmado no se repitió');
    const calls = readFileSync(callsFile, 'utf8').split('\n').filter((line) => line === URL_C);
    assert.equal(calls.length, 1, 'la página se obtuvo UNA sola vez: la observación confirmada se reutilizó');
    const editionId = (done.result as { editionId: string }).editionId;
    const dossier = await readEditionDossier(getAppPool(), real.tenantId, editionId, new Date().toISOString());
    assert.ok(dossier);
    assert.equal(dossier.sources.find((source) => source.id === `luma-${runId}-src`)?.method, 'test_fixture+jsonld_extraction', 'reanudar conserva que el transporte del worker era un fixture');
    assert.match(dossier.curation?.note ?? '', /sin consulta a Luma real/);
  });

  // ======== Criterio: interrupción DESPUÉS de guardar el snapshot ========
  let cmp1Id = '';
  let cmp1: ComparisonRunResult;
  await t.test('SIGKILL tras confirmar el snapshot (paso sin confirmar): un solo snapshot oficial', async () => {
    cmp1Id = await accept202(
      await postEvaluations(jsonRequest('http://localhost/api/evaluations', 'POST', comparisonBody([SUMMIT, ML_NIGHT]), real.token)),
    );
    const w = spawnWorker({ GROWTHX_WORKER_KILL_AT: 'before_step_commit:evaluate_candidates' });
    const exit = await w.exited;
    assert.equal(exit.signal, 'SIGKILL', w.output());

    const { rows: snapshotsMid } = await admin.query('select id from growthx.snapshots where run_id = $1', [cmp1Id]);
    assert.equal(snapshotsMid.length, 1, 'el snapshot quedó confirmado antes del kill');
    const midway = await view(cmp1Id);
    assert.equal(stepsByName(midway.body).evaluate_candidates.state, 'running', 'el paso quedó sin confirmar');

    await expedite(cmp1Id);
    const w2 = spawnWorker();
    const done = await completed(cmp1Id);
    await w2.stop();

    const { rows: snapshotsAfter } = await admin.query('select id from growthx.snapshots where run_id = $1', [cmp1Id]);
    assert.equal(snapshotsAfter.length, 1, 'la reanudación devolvió el snapshot confirmado, no publicó otro');
    assert.equal(snapshotsAfter[0].id, snapshotsMid[0].id);
    cmp1 = done.result as ComparisonRunResult;
    assert.equal(cmp1.snapshotId, snapshotsMid[0].id);
    // Degradación de la redacción declarada (sin clave): estado + motivo
    // persistidos, uso/costo explícitamente desconocido.
    assert.equal(cmp1.narrative?.status, 'deterministic_only');
    assert.match(cmp1.narrative?.motive ?? '', /GEMINI_API_KEY ausente/);
    assert.equal(cmp1.narrative?.usage, null, 'uso desconocido queda explícito, no se estima');
    const { rows: narratives } = await admin.query('select count(*)::int as n from growthx.snapshot_narratives where snapshot_id = $1', [cmp1.snapshotId]);
    assert.equal(narratives[0].n, 1);
  });

  // ============ Criterio: caída ANTES de confirmar el job ============
  await t.test('SIGKILL con el run terminal pero el job sin confirmar: la re-entrega no repite efectos', async () => {
    const runId = await accept202(
      await postEvaluations(jsonRequest('http://localhost/api/evaluations', 'POST', comparisonBody([SUMMIT]), real.token)),
    );
    const w = spawnWorker({ GROWTHX_WORKER_KILL_AT: 'before_job_ack' });
    const exit = await w.exited;
    assert.equal(exit.signal, 'SIGKILL', w.output());

    const terminal = await view(runId);
    assert.equal(terminal.body.state, 'completed', 'el run quedó terminal antes del kill');
    const resultBefore = JSON.stringify(terminal.body.result);
    const attemptsBefore = terminal.body.steps.map((step) => step.attempts);
    const { rows: jobMid } = await admin.query(
      `select state from pgboss.job where name = 'evaluation-run' and singleton_key = $1`,
      [runId],
    );
    assert.equal(jobMid[0].state, 'active', 'el job quedó sin confirmar en la cola');

    // Re-entrega + dos workers vivos compitiendo por la cola.
    await expedite(runId);
    const w2 = spawnWorker();
    const w3 = spawnWorker();
    await until('job confirmado', async () => {
      const { rows } = await admin.query(
        `select state from pgboss.job where name = 'evaluation-run' and singleton_key = $1`,
        [runId],
      );
      return rows[0].state === 'completed' ? true : null;
    });

    // Entrega duplicada explícita: un SEGUNDO job por el mismo run, con dos
    // workers escuchando. El run completado se ignora (claim idempotente).
    const { PgBoss } = await import('pg-boss');
    const dupBoss = new PgBoss({
      connectionString: process.env.GROWTHX_DATABASE_URL!,
      schema: 'pgboss',
      max: 1,
      migrate: false,
      supervise: false,
      schedule: false,
    });
    await dupBoss.start();
    const dupJobId = await dupBoss.send('evaluation-run', { runId, tenantId: real.tenantId }, { retryLimit: 0 });
    assert.ok(dupJobId, 'el job duplicado entró en la cola');
    await until('job duplicado consumido', async () => {
      const { rows } = await admin.query(`select state from pgboss.job where id = $1`, [dupJobId]);
      return rows[0].state === 'completed' ? true : null;
    });
    await dupBoss.stop({ graceful: false });
    await w2.stop();
    await w3.stop();

    const after = await view(runId);
    assert.equal(after.body.state, 'completed');
    assert.equal(JSON.stringify(after.body.result), resultBefore, 'el resultado publicado no cambió');
    assert.deepEqual(after.body.steps.map((step) => step.attempts), attemptsBefore, 'ningún paso se re-ejecutó');
    const { rows: snapshots } = await admin.query('select count(*)::int as n from growthx.snapshots where run_id = $1', [runId]);
    assert.equal(snapshots[0].n, 1, 'sigue habiendo UN snapshot final');
  });

  // ====== Criterio: dos workers compitiendo sobre el MISMO run (carrera) ======
  await t.test('carrera determinística: el perdedor no publica un segundo snapshot NI degrada el run completado', async () => {
    const accepted = await createEvaluationService().accept({
      tenantId: real.tenantId,
      userId: real.userId,
      body: comparisonBody([SUMMIT, ML_NIGHT]),
    });
    assert.equal(accepted.status, 'accepted');
    const runId = (accepted as { runId: string }).runId;
    // Este subtest entrega el job A MANO dos veces (la re-entrega que la cola
    // haría tras expirar): el job durable de la aceptación se cancela.
    await cancelJob(runId);

    const workerPool = getWorkerPool();
    const gateA = gate();
    const gateB = gate('caída transitoria del worker B (inyección de test)');
    const options = (loader: () => Promise<null>): ComparisonStepOptions => ({
      v0Reference: loader,
      narrative: { apiKey: null },
    });

    // A entra a evaluate_candidates (todavía sin snapshot) y queda en la
    // compuerta, dentro del paso.
    const runA = processEvaluationRun({ runId, tenantId: real.tenantId }, { pool: workerPool, comparison: options(gateA.loader) });
    await gateA.reached;
    // B (entrega duplicada del mismo job) reclama el MISMO run y entra al
    // MISMO paso mientras A sigue procesándolo.
    const runB = processEvaluationRun({ runId, tenantId: real.tenantId }, { pool: workerPool, comparison: options(gateB.loader) });
    await gateB.reached;

    // A gana: confirma el snapshot y completa el run entero.
    gateA.release();
    await runA;
    const won = await view(runId);
    assert.equal(won.body.state, 'completed');
    const resultWon = JSON.stringify(won.body.result);

    // B pierde: su intento cae (una falla transitoria cualquiera) DESPUÉS de
    // que A ya dejó el run terminal.
    gateB.release();
    await assert.rejects(runB, /caída transitoria/);

    // El fallo del perdedor NO degrada nada de lo confirmado por el ganador.
    const after = await view(runId);
    assert.equal(after.body.state, 'completed', 'el run completado no vuelve a queued/failed por el perdedor');
    assert.equal(after.body.error, null);
    assert.equal(stepsByName(after.body).evaluate_candidates.state, 'completed', 'el paso confirmado no se marca fallido');
    assert.equal(JSON.stringify(after.body.result), resultWon);
    const { rows: snapshots } = await admin.query('select count(*)::int as n from growthx.snapshots where run_id = $1', [runId]);
    assert.equal(snapshots[0].n, 1, 'un solo snapshot final');

    // La re-entrega posterior (cola real) es un no-op sobre el run terminal.
    await processEvaluationRun({ runId, tenantId: real.tenantId }, { pool: workerPool });
    assert.equal(JSON.stringify((await view(runId)).body.result), resultWon);
  });

  // ====== Criterio: fallo entre aceptación HTTP y despacho durable ======
  await t.test('cola caída en la aceptación: nada persistido; el reintento del cliente repite la llamada y queda trazado', async () => {
    const failing = createEvaluationService({
      queue: {
        sendRunJob: async () => {
          throw new Error('cola caída (inyección de test)');
        },
      },
    });
    const body = comparisonBody([SUMMIT]);
    await assert.rejects(
      failing.accept({ tenantId: real.tenantId, userId: real.userId, body }),
      /cola caída/,
    );
    const { rows: nothing } = await admin.query('select count(*)::int as n from growthx.runs where idempotency_key = $1', [body.idempotencyKey]);
    assert.equal(nothing[0].n, 0, 'sin job no hay run: jamás un 202 con trabajo perdido');

    // La llamada HTTP no confirmada se repite con la MISMA clave y esta vez
    // acepta; run + job + log de aceptación quedan juntos.
    const runId = await accept202(
      await postEvaluations(jsonRequest('http://localhost/api/evaluations', 'POST', body, real.token)),
    );
    const { rows: job } = await admin.query(
      `select count(*)::int as n from pgboss.job where name = 'evaluation-run' and singleton_key = $1`,
      [runId],
    );
    assert.equal(job[0].n, 1, 'el despacho durable existe junto con el 202');
    const { rows: trace } = await admin.query(
      `select count(*)::int as n from growthx.run_logs where run_id = $1 and message = 'comparación de inversión aceptada'`,
      [runId],
    );
    assert.equal(trace[0].n, 1, 'la aceptación repetida quedó trazada');
    await cancelJob(runId); // este run no se procesa: era la demostración de la frontera
  });

  // ====== Criterio: timeout / salida inválida del modelo ======
  await t.test('timeout y salida inválida del modelo: dossier completo con explicación determinística y degradación declarada', async () => {
    const service = createEvaluationService();
    const workerPool = getWorkerPool();
    const runWith = async (narrative: ComparisonStepOptions['narrative']): Promise<ComparisonRunResult> => {
      const accepted = await service.accept({ tenantId: real.tenantId, userId: real.userId, body: comparisonBody([SUMMIT, ML_NIGHT]) });
      assert.equal(accepted.status, 'accepted');
      const runId = (accepted as { runId: string }).runId;
      await cancelJob(runId);
      await processEvaluationRun({ runId, tenantId: real.tenantId }, { pool: workerPool, comparison: { narrative } });
      const done = await view(runId);
      assert.equal(done.body.state, 'completed');
      return done.body.result as ComparisonRunResult;
    };

    // Timeout: el transporte respeta la señal de aborto y nunca responde.
    const hangingModel = ((_input: unknown, init?: RequestInit) =>
      new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal!.reason as Error));
      })) as unknown as typeof fetch;
    const timedOut = await runWith({ apiKey: 'clave-de-prueba', transport: hangingModel, timeoutMs: 300 });
    assert.equal(timedOut.narrative?.status, 'deterministic_only');
    assert.ok(timedOut.narrative?.motive, 'motivo de degradación persistido');
    assert.equal(timedOut.narrative?.usage, null, 'uso/costo desconocido explícito');

    // Salida inválida (no-JSON): misma degradación, sin tocar el snapshot.
    const invalidModel = (async () =>
      new Response('<<no es json>>', { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;
    const invalid = await runWith({ apiKey: 'clave-de-prueba', transport: invalidModel });
    assert.equal(invalid.narrative?.status, 'deterministic_only');
    assert.ok(invalid.narrative?.motive);

    // En ambos casos el resultado oficial es determinístico y completo: mismas
    // alternativas, mismo orden de presentación (sin política — D2), sin
    // ninguna recomendación fabricada por la degradación.
    for (const result of [timedOut, invalid]) {
      assert.equal(result.bundle.snapshot.ordering.kind, 'presentation_only');
      assert.deepEqual(
        result.bundle.snapshot.alternatives.map((alternative) => alternative.editionId).sort(),
        [SUMMIT, ML_NIGHT].sort(),
      );
    }
    assert.deepEqual(
      timedOut.bundle.snapshot.alternatives.map((a) => ({ id: a.editionId, e: a.eligibility.status, s: a.scoring.status })),
      invalid.bundle.snapshot.alternatives.map((a) => ({ id: a.editionId, e: a.eligibility.status, s: a.scoring.status })),
      'la degradación del modelo no altera elegibilidad ni scoring',
    );
  });

  // ====== Criterio: error de fuente agotando reintentos ======
  const URL_F = 'https://lu.ma/growthx-rec-f';
  await t.test('fuente caída que agota reintentos: fallido y visible, sin recomendación preparada que lo oculte', async () => {
    writeFileSync(fixturePath, JSON.stringify({ [URL_F]: { error: 'conexión rechazada por la fuente (fixture)' } }));
    const runId = await accept202(
      await postIngest(jsonRequest('http://localhost/api/events/ingest', 'POST', ingestBody(URL_F), real.token)),
    );
    const w = spawnWorker();
    const failed = await until('fallo definitivo del run', async () => {
      // Los reintentos programados (retryDelay) se adelantan; el límite de
      // intentos es el de la política real de la cola.
      await expedite(runId);
      const { body } = await view(runId);
      return body.state === 'failed' ? body : null;
    }, 90_000);
    await w.stop();

    // La causa visible es la del adaptador (fuente inalcanzable), sin filtrar
    // detalles internos del transporte.
    assert.match(failed.error ?? '', /no se pudo alcanzar la página del evento/, 'la causa real queda visible');
    const steps = stepsByName(failed);
    assert.equal(steps.fetch_event_page.attempts, 4, '1 intento + 3 reintentos, el límite declarado');
    assert.equal(steps.fetch_event_page.state, 'failed');
    assert.equal(failed.result, null, 'ninguna recomendación preparada oculta el fallo');
    const { rows: finalLog } = await admin.query(
      `select count(*)::int as n from growthx.run_logs where run_id = $1 and message like 'fallo definitivo tras 4 intentos%'`,
      [runId],
    );
    assert.equal(finalLog[0].n, 1, 'el agotamiento de reintentos quedó trazado');
    const after = await importedCounts();
    assert.equal(after.loads, 3, 'las tres importaciones buenas; la fallida no dejó dossier');
  });

  // ====== Criterio: logs reconstruyen la cadena; sin secretos ======
  await t.test('los registros reconstruyen run→steps→claims→snapshot→decisión, sin secretos ni texto privado', async () => {
    // Decisión condicional sobre el snapshot recuperado del kill (cmp1).
    const conditional = cmp1.bundle.snapshot.alternatives.find((a) => a.eligibility.status !== 'excluded');
    assert.ok(conditional, 'hay una alternativa no excluida para decidir');
    const decisionResponse = await postDecisions(
      jsonRequest('http://localhost/api/decisions', 'POST', {
        idempotencyKey: `rec-dec-${randomUUID()}`,
        snapshotId: cmp1.snapshotId,
        editionId: conditional.editionId,
        verdict: 'chosen',
        reasons: ['decisión de la matriz de recuperación: audiencia declarada afín'],
        conditions: [{
          snapshotConditionId: null,
          pendingItem: 'Costo del tier principal',
          question: '¿Cuál es la tarifa vigente?',
          expectedAnswer: 'Tarifario con monto y moneda',
          effect: 'discarded',
          owner: 'growth',
          dueBy: null,
        }],
        campaignDraft: null,
      }, real.token),
    );
    assert.equal(decisionResponse.status, 201, await decisionResponse.clone().text());
    const decision = (await decisionResponse.json()) as { decisionId: string };

    // Cadena completa por SQL bajo el rol de aplicación y el tenant real:
    // run → steps → snapshot → claims fijados → decisión (con intentos/tiempos).
    await withTenantTransaction(getAppPool(), real.tenantId, async (client) => {
      // decisions guarda una fila POR REVISIÓN; la identidad es decision_id.
      const { rows: chain } = await client.query(
        `select r.id as run_id, r.state, s.id as snapshot_id, d.decision_id
           from growthx.runs r
           join growthx.snapshots s on s.run_id = r.id
           join growthx.decisions d on d.snapshot_id = s.id
          where r.id = $1`,
        [cmp1Id],
      );
      assert.equal(chain.length, 1);
      assert.equal(chain[0].decision_id, decision.decisionId);
      const { rows: steps } = await client.query(
        `select name, state, attempts, started_at, finished_at from growthx.run_steps where run_id = $1 order by seq`,
        [cmp1Id],
      );
      assert.equal(steps.length, 4);
      for (const step of steps) {
        assert.equal(step.state, 'completed');
        assert.ok(step.started_at && step.finished_at, 'tiempos por paso persistidos');
      }
      const claimIds = (JSON.parse(JSON.stringify(cmp1.bundle.snapshot)) as { claimRevisionIds: string[] }).claimRevisionIds;
      const { rows: claims } = await client.query(
        `select count(*)::int as n from growthx.claim_revisions where id = any($1)`,
        [claimIds],
      );
      assert.equal(claims[0].n, claimIds.length, 'todas las revisiones de claims fijadas por el snapshot existen');
    });

    // Sin secretos ni texto privado en los logs ni en el material persistido:
    // ni tokens de sesión, ni contraseñas de roles, ni el texto privado de la
    // página importada (que viajaba en el HTML pero no es un campo del evento).
    const { rows: logRows } = await admin.query(
      `select coalesce(string_agg(message || ' ' || coalesce(context::text, ''), ' '), '') as blob
         from growthx.run_logs where tenant_id = $1`,
      [real.tenantId],
    );
    const blob = String(logRows[0].blob);
    for (const secret of [real.token, decoy.token, 'growthx_app_dev', 'growthx_worker_dev', 'Bearer ']) {
      assert.ok(!blob.includes(secret), `los logs no contienen «${secret.slice(0, 12)}…»`);
    }
    assert.ok(!blob.includes(HTML_PRIVATE_SENTINEL), 'los logs no arrastran texto privado de la página');
    const { rows: claimBlob } = await admin.query(
      `select count(*)::int as n from growthx.claim_revisions where tenant_id = $1 and payload::text like '%' || $2 || '%'`,
      [real.tenantId, HTML_PRIVATE_SENTINEL],
    );
    assert.equal(claimBlob[0].n, 0, 'el texto privado del HTML tampoco se persistió como claim');

    // El señuelo no ve nada del material recuperado (ruta y SQL bajo RLS).
    assert.equal((await view(cmp1Id, decoy.token)).status, 404);
    const decoySees = await withTenantTransaction(getAppPool(), decoy.tenantId, async (client) => {
      const { rows } = await client.query('select count(*)::int as n from growthx.snapshots');
      return Number(rows[0].n);
    });
    assert.equal(decoySees, 0);
  });
});
