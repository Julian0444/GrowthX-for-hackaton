// Ticket 08 — primer run durable con tenant, contra PostgreSQL y pg-boss
// REALES (contenedor local: pnpm db:up && pnpm db:migrate). Sin base
// disponible la suite se salta con aviso (no finge verde con mocks: la
// aceptación de durabilidad no se simula).
//
// Cubre: aceptación atómica (202 ⇔ job durable, fallo de encolado ⇒ nada
// persistido), duplicado, conflicto, tenantId del navegador rechazado,
// contexto de tenant y señuelo (ruta + SQL de aplicación con RLS), lectura
// tras cerrar la conexión, y reanudación básica con el worker como PROCESO
// SEPARADO (corte controlado tras un paso, reinicio, mismo run termina).
//
// El contexto de tenant inyectado directo al servicio se usa SOLO acá (regla
// de D3); las rutas HTTP se ejercitan con sesiones reales insertadas en la
// base.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

// `next/server` no resuelve bajo `node --test` (espera el resolver de Next);
// solo en este proceso de prueba se mapea al archivo real del paquete.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'next/server') return nextResolve('next/server.js', context);
    return nextResolve(specifier, context);
  },
});

// URLs del contenedor local salvo override externo. Se fijan ANTES de tocar
// los módulos del recorrido (leen env de forma lazy).
const DEFAULTS: Record<string, string> = {
  GROWTHX_ADMIN_DATABASE_URL: 'postgres://growthx:growthx@127.0.0.1:54329/growthx',
  GROWTHX_DATABASE_URL: 'postgres://growthx_app:growthx_app_dev@127.0.0.1:54329/growthx',
  GROWTHX_WORKER_DATABASE_URL: 'postgres://growthx_worker:growthx_worker_dev@127.0.0.1:54329/growthx',
  GROWTHX_QUEUE_DATABASE_URL: 'postgres://growthx_queue:growthx_queue_dev@127.0.0.1:54329/growthx',
};
for (const [name, value] of Object.entries(DEFAULTS)) {
  if (!process.env[name]) process.env[name] = value;
}

const FRONTEND_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

import { hashSessionToken, SESSION_COOKIE } from '../../lib/server/auth/session.ts';
import { closePools, getAppPool, withTenantTransaction } from '../../lib/server/db/pool.ts';
import { runMigrations } from '../../lib/server/db/migrate.ts';
import { createEvaluationService } from '../../lib/server/evaluations/service.ts';
import { stopEvaluationQueue } from '../../lib/server/evaluations/queue.ts';

// Handlers HTTP reales. Import DINÁMICO: los estáticos se resuelven antes de
// que registerHooks mapee next/server (mismo motivo que en cache-budget).
const routesPromise = (async () => {
  const [collection, item] = await Promise.all([
    import('../../app/api/evaluations/route.ts'),
    import('../../app/api/evaluations/[id]/route.ts'),
  ]);
  return { postEvaluations: collection.POST, getEvaluation: item.GET };
})();

interface Seeded {
  tenantId: string;
  userId: string;
  token: string;
}

function startBody(overrides: { product?: string; idempotencyKey?: string } = {}) {
  return {
    idempotencyKey: overrides.idempotencyKey ?? `it-${randomUUID()}`,
    mode: 'catalog_research' as const,
    profile: {
      product: overrides.product ?? 'SDK de agentes para backend',
      audienceDescription: 'Equipos backend adoptando tooling de AI',
      audienceProfiles: ['backend'],
      stack: ['python'],
      budget: { status: 'declared' as const, amount: 2000, currency: 'USD' },
      window: { from: null, to: null },
      objective: { kind: 'adoption' as const },
    },
  };
}

function postRequest(body: unknown, token?: string): Request {
  return new Request('http://localhost/api/evaluations', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

function getRequest(runId: string, token?: string): Request {
  return new Request(`http://localhost/api/evaluations/${runId}`, {
    headers: token ? { cookie: `${SESSION_COOKIE}=${token}` } : {},
  });
}

interface RunViewBody {
  runId: string;
  state: string;
  steps: { name: string; state: string; attempts: number }[];
  result: { kind?: string; candidates?: unknown[]; catalogNote?: string } | null;
}

async function getRunView(runId: string, token: string): Promise<{ status: number; body: RunViewBody }> {
  const { getEvaluation } = await routesPromise;
  const response = await getEvaluation(getRequest(runId, token), {
    params: Promise.resolve({ id: runId }),
  });
  return {
    status: response.status,
    body: (await response.json().catch(() => null)) as RunViewBody,
  };
}

async function seedTenant(admin: pg.Client, label: string): Promise<Seeded> {
  const slug = `it-${label}-${randomUUID().slice(0, 8)}`;
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
  await admin.query('insert into growthx.memberships (tenant_id, user_id) values ($1, $2)', [
    tenantId,
    userId,
  ]);
  const token = randomBytes(24).toString('hex');
  await admin.query(
    `insert into growthx.sessions (token_hash, user_id, tenant_id, expires_at)
     values ($1, $2, $3, now() + interval '1 hour')`,
    [hashSessionToken(token), userId, tenantId],
  );
  return { tenantId, userId, token };
}

function spawnWorker(env: Record<string, string> = {}): {
  exited: Promise<number | null>;
  kill: () => void;
  output: () => string;
} {
  const child = spawn(process.execPath, ['worker/index.ts'], {
    cwd: FRONTEND_DIR,
    env: {
      ...process.env,
      GROWTHX_WORKER_POLL_SECONDS: '0.5',
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
  child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));
  const exited = new Promise<number | null>((resolve) => child.once('exit', resolve));
  return { exited, kill: () => child.kill('SIGTERM'), output: () => output };
}

// Carrera con timeout SIN dejar el timer armado (mantendría vivo el proceso).
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    void promise.then((value) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}

async function until<T>(
  what: string,
  fn: () => Promise<T | null>,
  timeoutMs = 45_000,
): Promise<T> {
  const startedAt = Date.now();
  for (;;) {
    const value = await fn();
    if (value !== null) return value;
    if (Date.now() - startedAt > timeoutMs) throw new Error(`timeout esperando ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
}

// Conectividad: sin base, se salta la suite con instrucciones.
async function probeDatabase(): Promise<pg.Client | null> {
  const client = new pg.Client({
    connectionString: process.env.GROWTHX_ADMIN_DATABASE_URL,
    connectionTimeoutMillis: 3000,
  });
  try {
    await client.connect();
    return client;
  } catch {
    return null;
  }
}

test('evaluation-run: run durable con tenant (PostgreSQL + pg-boss reales)', async (t) => {
  const admin = await probeDatabase();
  if (!admin) {
    t.skip(
      'PostgreSQL no disponible; arrancá la base con `pnpm db:up && pnpm db:migrate` (frontend/db/README.md)',
    );
    return;
  }
  t.after(async () => {
    await stopEvaluationQueue();
    await closePools();
    await admin.end();
  });

  await runMigrations();
  const { postEvaluations, getEvaluation } = await routesPromise;
  const real = await seedTenant(admin, 'real');
  const decoy = await seedTenant(admin, 'decoy');

  await t.test('POST sin sesión → 401 (la sesión se valida en el servidor)', async () => {
    const response = await postEvaluations(postRequest(startBody()));
    assert.equal(response.status, 401);
  });

  await t.test('un tenantId en el cuerpo se rechaza (no se confía en el navegador)', async () => {
    const body = { ...startBody(), tenantId: decoy.tenantId };
    const response = await postEvaluations(postRequest(body, real.token));
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.match(String(payload.message), /tenant/i);
  });

  let runId = '';
  const acceptedBody = startBody();

  await t.test('aceptación: 202 con run y job durable en el MISMO commit', async () => {
    const response = await postEvaluations(postRequest(acceptedBody, real.token));
    assert.equal(response.status, 202);
    const payload = await response.json();
    runId = payload.runId;
    assert.match(runId, /^[0-9a-f-]{36}$/);
    assert.equal(payload.statusUrl, `/api/evaluations/${runId}`);
    // Run, steps y job de pg-boss existen juntos (commit único).
    const { rows: runRows } = await admin.query('select state, tenant_id from growthx.runs where id = $1', [runId]);
    assert.equal(runRows.length, 1);
    assert.equal(runRows[0].state, 'queued');
    assert.equal(runRows[0].tenant_id, real.tenantId, 'el tenant sale de la sesión, no del cuerpo');
    const { rows: stepRows } = await admin.query('select name from growthx.run_steps where run_id = $1 order by seq', [runId]);
    assert.deepEqual(
      stepRows.map((row) => row.name),
      ['validate_profile', 'research_catalog', 'publish_result'],
    );
    const { rows: jobRows } = await admin.query('select state from pgboss.job where singleton_key = $1', [runId]);
    assert.equal(jobRows.length, 1, 'el trabajo durable existe junto con el 202');
  });

  await t.test('atomicidad: si el encolado falla, NO queda run (ni 202 con trabajo perdido)', async () => {
    const failingService = createEvaluationService({
      queue: {
        sendRunJob: async () => {
          throw new Error('cola caída (inyección de test)');
        },
      },
    });
    const body = startBody({ idempotencyKey: `it-atomic-${randomUUID()}` });
    const { rows: beforeJobs } = await admin.query(
      "select count(*)::int as n from pgboss.job where data->>'tenantId' = $1",
      [real.tenantId],
    );
    await assert.rejects(
      failingService.accept({ tenantId: real.tenantId, userId: real.userId, body }),
      /cola caída/,
    );
    const { rows } = await admin.query(
      'select count(*)::int as n from growthx.runs where idempotency_key = $1',
      [body.idempotencyKey],
    );
    assert.equal(rows[0].n, 0, 'la transacción entera se revirtió: sin run');
    const { rows: afterJobs } = await admin.query(
      "select count(*)::int as n from pgboss.job where data->>'tenantId' = $1",
      [real.tenantId],
    );
    assert.equal(afterJobs[0].n, beforeJobs[0].n, 'tampoco quedó un job huérfano');
  });

  await t.test('idempotencia: misma clave y mismo payload → el MISMO run', async () => {
    const response = await postEvaluations(postRequest(acceptedBody, real.token));
    assert.equal(response.status, 202);
    const payload = await response.json();
    assert.equal(payload.runId, runId);
    assert.equal(payload.deduplicated, true);
    const { rows } = await admin.query(
      'select count(*)::int as n from growthx.runs where idempotency_key = $1',
      [acceptedBody.idempotencyKey],
    );
    assert.equal(rows[0].n, 1);
    const { rows: jobRows } = await admin.query('select count(*)::int as n from pgboss.job where singleton_key = $1', [runId]);
    assert.equal(jobRows[0].n, 1, 'sin job duplicado');
  });

  await t.test('idempotencia: misma clave con OTRO payload → 409', async () => {
    const conflicting = { ...startBody({ product: 'otro producto' }), idempotencyKey: acceptedBody.idempotencyKey };
    const response = await postEvaluations(postRequest(conflicting, real.token));
    assert.equal(response.status, 409);
  });

  await t.test('GET devuelve estado y pasos persistidos; el señuelo no ve el run', async () => {
    const mine = await getRunView(runId, real.token);
    assert.equal(mine.status, 200);
    assert.equal(mine.body.runId, runId);
    assert.equal(mine.body.steps.length, 3);
    assert.equal(mine.body.steps[0].state, 'pending');
    // Identidad real del tenant señuelo: 404, sin confirmar existencia.
    const cross = await getRunView(runId, decoy.token);
    assert.equal(cross.status, 404);
    // Y sin sesión: 401.
    const anonymous = await getEvaluation(getRequest(runId), { params: Promise.resolve({ id: runId }) });
    assert.equal(anonymous.status, 401);
  });

  await t.test('RLS en SQL de aplicación: contexto señuelo o sin contexto no obtiene la fila', async () => {
    const pool = getAppPool();
    const underDecoy = await withTenantTransaction(pool, decoy.tenantId, async (client) => {
      const { rows } = await client.query('select id from growthx.runs where id = $1', [runId]);
      return rows.length;
    });
    assert.equal(underDecoy, 0, 'una lectura con identidad del señuelo no ve el run real');
    const client = await pool.connect();
    try {
      const { rows } = await client.query('select id from growthx.runs where id = $1', [runId]);
      assert.equal(rows.length, 0, 'sin contexto de tenant, RLS no muestra ninguna fila');
    } finally {
      client.release();
    }
  });

  await t.test('el rol que administra la cola no accede a datos de negocio', async () => {
    const queueClient = new pg.Client({ connectionString: process.env.GROWTHX_QUEUE_DATABASE_URL });
    await queueClient.connect();
    try {
      await assert.rejects(queueClient.query('select count(*) from growthx.runs'), /permission denied/);
    } finally {
      await queueClient.end();
    }
  });

  await t.test('reanudación básica: corte del worker tras un paso, reinicio, el MISMO run termina', async () => {
    // Worker como PROCESO SEPARADO con corte controlado tras research_catalog:
    // el paso queda confirmado, el job vuelve a la cola y el proceso sale.
    const first = spawnWorker({ GROWTHX_WORKER_EXIT_AFTER_STEP: 'research_catalog' });
    const firstExit = await withTimeout(first.exited, 60_000);
    if (firstExit === null) {
      first.kill();
      assert.fail(`el worker no salió tras el corte controlado. Salida:\n${first.output()}`);
    }
    assert.equal(firstExit, 0, `el corte controlado sale con 0. Salida:\n${first.output()}`);

    // «Recarga del dashboard»: el run sigue visible con su avance persistido.
    const midway = await getRunView(runId, real.token);
    assert.equal(midway.status, 200);
    const midwaySteps = Object.fromEntries(
      midway.body.steps.map((step: { name: string; state: string }) => [step.name, step.state]),
    );
    assert.equal(midwaySteps.validate_profile, 'completed');
    assert.equal(midwaySteps.research_catalog, 'completed');
    assert.notEqual(midwaySteps.publish_result, 'completed');
    assert.notEqual(midway.body.state, 'completed');

    // Reinicio sin el corte: el mismo run retoma desde el paso pendiente y
    // termina, sin depender de nada en memoria del proceso anterior.
    const second = spawnWorker();
    try {
      const finished = await until('run completado', async () => {
        const view = await getRunView(runId, real.token);
        return view.status === 200 && view.body.state === 'completed' ? view.body : null;
      });
      assert.deepEqual(
        finished.steps.map((step: { state: string }) => step.state),
        ['completed', 'completed', 'completed'],
      );
      const result = finished.result;
      assert.ok(result, 'el resultado persistido está presente');
      assert.equal(result.kind, 'catalog_research');
      assert.ok(Array.isArray(result.candidates));
      assert.match(String(result.catalogNote), /material preparado/);
      // El paso completado en el primer proceso NO se repitió en el segundo.
      const { rows: attempts } = await admin.query(
        "select name, attempts from growthx.run_steps where run_id = $1 order by seq",
        [runId],
      );
      const byName = Object.fromEntries(attempts.map((row) => [row.name, Number(row.attempts)]));
      assert.equal(byName.research_catalog, 1, 'reanudación: el paso confirmado no se re-ejecuta');
      // Logs por run/step/intento persistidos.
      const { rows: logs } = await admin.query(
        'select count(*)::int as n from growthx.run_logs where run_id = $1 and attempt is not null',
        [runId],
      );
      assert.ok(logs[0].n >= 4, 'hay logs por intento y por paso');
    } finally {
      second.kill();
      await second.exited;
    }
  });

  await t.test('lectura tras cerrar la conexión: el run sobrevive al pool que lo escribió', async () => {
    await stopEvaluationQueue();
    await closePools();
    const freshPool = new pg.Pool({ connectionString: process.env.GROWTHX_DATABASE_URL, max: 2 });
    try {
      const service = createEvaluationService({ pool: freshPool });
      const view = await service.getRun({ tenantId: real.tenantId, runId });
      assert.ok(view, 'el run se recupera desde una conexión nueva');
      assert.equal(view.state, 'completed');
      assert.equal(view.steps.length, 3);
    } finally {
      await freshPool.end();
    }
  });

  await t.test('GET con id inválido → 400; run inexistente → 404', async () => {
    const invalid = await getEvaluation(getRequest('nope', real.token), {
      params: Promise.resolve({ id: 'nope' }),
    });
    assert.equal(invalid.status, 400);
    const missingId = randomUUID();
    const missing = await getRunView(missingId, real.token);
    assert.equal(missing.status, 404);
  });
});
