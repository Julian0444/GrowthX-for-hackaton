// Ticket 15 — matriz de aislamiento entre el tenant real y el señuelo, contra
// PostgreSQL y pg-boss REALES. Sin base disponible la suite se salta con aviso.
//
// Con IDs CONOCIDOS del otro tenant (no adivinados): API, listados, lectura de
// fuentes, modificaciones, claims referenciados, sesiones, pool de conexiones
// e idempotencia rechazan el cruce; un job con tenant/payload discordante es
// rechazado por el worker REAL (proceso separado); los roles no tienen bypass
// y el contexto de una conexión reutilizada no se filtra al siguiente tenant.
// Ningún error revela el contenido del otro tenant: cada catálogo lleva un
// texto centinela y TODAS las respuestas de cruce se auditan contra él.
//
// Igual que worker-recovery.test.ts, esta suite usa su PROPIA base
// (growthx_t15_isolation) recreada al inicio: `node --test` corre archivos en
// paralelo y la cola pg-boss es por base — así el worker de esta suite no
// levanta jobs ajenos ni al revés.

import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { PgBoss } from 'pg-boss';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'next/server') return nextResolve('next/server.js', context);
    return nextResolve(specifier, context);
  },
});

const DB_NAME = 'growthx_t15_isolation';
const DEFAULTS: Record<string, string> = {
  GROWTHX_ADMIN_DATABASE_URL: 'postgres://growthx:growthx@127.0.0.1:54329/growthx',
  GROWTHX_DATABASE_URL: 'postgres://growthx_app:growthx_app_dev@127.0.0.1:54329/growthx',
  GROWTHX_WORKER_DATABASE_URL: 'postgres://growthx_worker:growthx_worker_dev@127.0.0.1:54329/growthx',
  GROWTHX_QUEUE_DATABASE_URL: 'postgres://growthx_queue:growthx_queue_dev@127.0.0.1:54329/growthx',
};
for (const [name, value] of Object.entries(DEFAULTS)) {
  if (!process.env[name]) process.env[name] = value;
}
const MAINTENANCE_URL = process.env.GROWTHX_ADMIN_DATABASE_URL!;
for (const name of Object.keys(DEFAULTS)) {
  const url = new URL(process.env[name]!);
  url.pathname = `/${DB_NAME}`;
  process.env[name] = url.toString();
}
for (const key of ['GEMINI_API_KEY', 'EXA_API_KEY', 'APIFY_TOKEN']) delete process.env[key];

const FRONTEND_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

import { hashSessionToken, SESSION_COOKIE } from '../../lib/server/auth/session.ts';
import { closePools, getAppPool, getWorkerPool, withTenantTransaction } from '../../lib/server/db/pool.ts';
import { runMigrations } from '../../lib/server/db/migrate.ts';
import { loadCuratedCatalog } from '../../lib/server/catalog/store.ts';
import { FIXTURE_CURATION_MANIFEST } from '../../lib/server/catalog/fixture-manifest.ts';
import type { CurationManifest } from '../../lib/server/catalog/manifest.ts';
import { createEvaluationService } from '../../lib/server/evaluations/service.ts';
import { stopEvaluationQueue } from '../../lib/server/evaluations/queue.ts';
import { processEvaluationRun } from '../../lib/server/evaluations/run-worker.ts';
import type { ComparisonRunResult } from '../../lib/server/evaluations/compare.ts';

const routesPromise = (async () => {
  const [evaluations, evaluationItem, ingest, decisions, decisionItem, editions, editionItem, organizerItem] =
    await Promise.all([
      import('../../app/api/evaluations/route.ts'),
      import('../../app/api/evaluations/[id]/route.ts'),
      import('../../app/api/events/ingest/route.ts'),
      import('../../app/api/decisions/route.ts'),
      import('../../app/api/decisions/[id]/route.ts'),
      import('../../app/api/catalog/editions/route.ts'),
      import('../../app/api/catalog/editions/[id]/route.ts'),
      import('../../app/api/organizers/[id]/route.ts'),
    ]);
  return {
    postEvaluations: evaluations.POST,
    listEvaluations: evaluations.GET,
    getEvaluation: evaluationItem.GET,
    postIngest: ingest.POST,
    postDecisions: decisions.POST,
    listDecisions: decisions.GET,
    getDecision: decisionItem.GET,
    patchDecision: decisionItem.PATCH,
    listEditions: editions.GET,
    getEdition: editionItem.GET,
    getOrganizer: organizerItem.GET,
  };
})();

// ============ Utilidades ============

const SUMMIT = 'ed-sf-dev-summit-2027';
const REAL_SENTINEL = 'SECRETO-CATALOGO-REAL-15';
const DECOY_SENTINEL = 'SECRETO-CATALOGO-SENUELO-15';

interface Seeded {
  tenantId: string;
  userId: string;
  token: string;
}

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
  const slug = `iso-${label}-${randomUUID().slice(0, 8)}`;
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

// Ambos tenants curan el MISMO material público (mismos IDs de edición: la
// colisión de ids entre tenants no puede filtrar nada) MÁS una edición, un
// organizador y una fuente propios con texto centinela: el contenido que el
// otro tenant jamás debe ver, ni siquiera dentro de un mensaje de error.
function catalogFor(side: 'real' | 'decoy', futureYear: number): CurationManifest {
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

  const sentinel = side === 'real' ? REAL_SENTINEL : DECOY_SENTINEL;
  const organizerId = `org-iso-${side}-only`;
  const editionId = `ed-iso-${side}-only`;
  fixture.sources.push({
    ...fixture.sources[0],
    id: `src-iso-${side}`,
    url: `https://${side}.example/only`,
    locator: 'página del evento',
    content: { kind: 'excerpt', excerpt: `${sentinel} — listado privado del tenant ${side}.` },
  });
  const baseClaim = fixture.claims.find((claim) => claim.id === 'clm-summit-access-r1')!;
  fixture.claims.push(
    {
      ...baseClaim,
      id: `clm-iso-${side}-focus-r1`,
      claimId: `clm-iso-${side}-focus`,
      subject: { type: 'organizer' as const, organizerId },
      attribute: 'focus',
      value: { kind: 'text' as const, text: `python, agents (${sentinel})` },
      status: 'observed' as const,
      sourceIds: [`src-iso-${side}`],
    },
    {
      ...baseClaim,
      id: `clm-iso-${side}-loc-r1`,
      claimId: `clm-iso-${side}-loc`,
      subject: { type: 'edition' as const, editionId },
      attribute: 'location',
      value: { kind: 'location' as const, scope: 'city' as const, name: 'San Francisco' },
      status: 'observed' as const,
      sourceIds: [`src-iso-${side}`],
    },
  );
  fixture.organizers.push({
    ...fixture.organizers[0],
    id: `${organizerId}-r1`,
    organizerId,
    displayName: `Organizador privado ${sentinel}`,
    aliases: [],
    claimRevisionIds: [`clm-iso-${side}-focus-r1`],
  });
  fixture.editions.push({
    ...fixture.editions[0],
    id: `${editionId}-r1`,
    editionId,
    organizerIds: [organizerId],
    name: `Edición privada ${sentinel}`,
    canonicalUrl: `https://${side}.example/only`,
    startDate: { precision: 'instant', iso: `${futureYear}-05-20T18:00:00-07:00`, timezone: 'America/Los_Angeles' },
    location: { scope: 'city', name: 'San Francisco' },
    coordinates: null,
    claimRevisionIds: [`clm-iso-${side}-loc-r1`],
  });
  return fixture;
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

function getRequest(url: string, token?: string): Request {
  return new Request(url, { headers: token ? { cookie: `${SESSION_COOKIE}=${token}` } : {} });
}

const researchBody = (idempotencyKey: string) => ({
  idempotencyKey,
  mode: 'catalog_research' as const,
  researchScope: 'sf_organizers' as const,
  profile: {
    product: 'SDK de agentes para backend',
    audienceDescription: 'Equipos backend adoptando tooling de AI',
    audienceProfiles: ['backend'],
    stack: ['python'],
    budget: { status: 'unknown' as const },
    window: { from: null, to: null },
    objective: { kind: 'feedback' as const },
  },
});

test('tenant-isolation: cruces rechazados entre tenant real y señuelo (ticket 15)', { timeout: 300_000 }, async (t) => {
  const maintenance = await probeMaintenance();
  if (!maintenance) {
    t.skip('PostgreSQL no disponible; arrancá la base con `pnpm db:up && pnpm db:migrate` (frontend/db/README.md)');
    return;
  }
  await maintenance.query(`drop database if exists ${DB_NAME} with (force)`);
  await maintenance.query(`create database ${DB_NAME}`);
  await maintenance.end();
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
  const workers: ChildProcess[] = [];
  t.after(async () => {
    for (const child of workers) if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await stopEvaluationQueue();
    await closePools();
    await admin.end();
  });

  const routes = await routesPromise;
  const real = await seedTenant(admin, 'real');
  const decoy = await seedTenant(admin, 'decoy');
  const futureYear = new Date().getUTCFullYear() + 1;
  await loadCuratedCatalog(getAppPool(), real.tenantId, catalogFor('real', futureYear));
  await loadCuratedCatalog(getAppPool(), decoy.tenantId, catalogFor('decoy', futureYear));

  // Todo cuerpo de respuesta de un intento de cruce se audita al final: jamás
  // puede contener el centinela del otro tenant.
  const crossingBodies: string[] = [];
  const audited = async (response: Response): Promise<{ status: number; text: string }> => {
    const text = await response.text();
    crossingBodies.push(text);
    return { status: response.status, text };
  };

  const cancelJob = async (runId: string) => {
    await admin.query(
      `update pgboss.job set state = 'cancelled'
        where name = 'evaluation-run' and singleton_key = $1 and state in ('created', 'retry', 'active')`,
      [runId],
    );
  };

  // Material persistido de AMBOS tenants, procesado in-process (los jobs
  // durables de estas aceptaciones se cancelan: acá no se prueba la cola).
  const service = createEvaluationService();
  const workerPool = getWorkerPool();
  const seedRuns = async (tenant: Seeded, idempotencyKey: string) => {
    const accepted = await service.accept({ tenantId: tenant.tenantId, userId: tenant.userId, body: researchBody(idempotencyKey) });
    assert.equal(accepted.status, 'accepted');
    const runId = (accepted as { runId: string }).runId;
    await cancelJob(runId);
    await processEvaluationRun({ runId, tenantId: tenant.tenantId }, { pool: workerPool });
    return runId;
  };
  const realKey = `iso-research-${randomUUID()}`;
  const realResearchId = await seedRuns(real, realKey);
  const decoyResearchId = await seedRuns(decoy, `iso-research-${randomUUID()}`);

  const realComparisonAccept = await service.accept({
    tenantId: real.tenantId,
    userId: real.userId,
    body: {
      idempotencyKey: `iso-cmp-${randomUUID()}`,
      mode: 'investment_comparison',
      profileRunId: realResearchId,
      editionIds: [SUMMIT, 'ed-iso-real-only'],
    },
  });
  assert.equal(realComparisonAccept.status, 'accepted');
  const realComparisonId = (realComparisonAccept as { runId: string }).runId;
  await cancelJob(realComparisonId);
  await processEvaluationRun(
    { runId: realComparisonId, tenantId: real.tenantId },
    { pool: workerPool, comparison: { narrative: { apiKey: null } } },
  );
  const realComparisonView = await service.getRun({ tenantId: real.tenantId, runId: realComparisonId });
  assert.equal(realComparisonView?.state, 'completed');
  const realComparison = realComparisonView!.result as ComparisonRunResult;
  const realSnapshotId = realComparison.snapshotId;

  const decisionResponse = await routes.postDecisions(
    jsonRequest('http://localhost/api/decisions', 'POST', {
      idempotencyKey: `iso-dec-${randomUUID()}`,
      snapshotId: realSnapshotId,
      editionId: SUMMIT,
      verdict: 'pending',
      reasons: ['decisión del tenant real para la matriz de aislamiento'],
      conditions: [],
      campaignDraft: null,
    }, real.token),
  );
  assert.equal(decisionResponse.status, 201, await decisionResponse.clone().text());
  const realDecisionId = ((await decisionResponse.json()) as { decisionId: string }).decisionId;

  await t.test('API y listados: los IDs conocidos del otro tenant no existen para el señuelo', async () => {
    // Runs (lectura directa + listado).
    const crossRun = await audited(
      await routes.getEvaluation(getRequest(`http://localhost/api/evaluations/${realComparisonId}`, decoy.token), {
        params: Promise.resolve({ id: realComparisonId }),
      }),
    );
    assert.equal(crossRun.status, 404);
    // La respuesta ante un ID ajeno es INDISTINGUIBLE de un ID inexistente:
    // no confirma existencia.
    const missingRun = await audited(
      await routes.getEvaluation(getRequest(`http://localhost/api/evaluations/${randomUUID()}`, decoy.token), {
        params: Promise.resolve({ id: randomUUID() }),
      }),
    );
    assert.equal(missingRun.status, 404);
    assert.equal(crossRun.text, missingRun.text, 'mismo cuerpo para ajeno e inexistente');

    const decoyHome = await routes.listEvaluations(getRequest('http://localhost/api/evaluations', decoy.token));
    const home = (await decoyHome.json()) as { runs: { runId: string }[]; evaluations: { runId: string }[] };
    const listedIds = [...home.runs.map((run) => run.runId), ...home.evaluations.map((run) => run.runId)];
    assert.ok(!listedIds.includes(realResearchId) && !listedIds.includes(realComparisonId), 'el listado no mezcla tenants');
    assert.ok(listedIds.includes(decoyResearchId), 'el señuelo sigue viendo lo suyo');

    // Catálogo: listado propio sin las ediciones del otro; dossier ajeno 404.
    const decoyEditions = await routes.listEditions(getRequest('http://localhost/api/catalog/editions', decoy.token));
    const editionsBody = await decoyEditions.text();
    assert.equal(decoyEditions.status, 200);
    assert.ok(editionsBody.includes('ed-iso-decoy-only'));
    assert.ok(!editionsBody.includes('ed-iso-real-only'), 'la edición privada del tenant real no aparece en el listado del señuelo');
    const crossEdition = await audited(
      await routes.getEdition(getRequest('http://localhost/api/catalog/editions/ed-iso-real-only', decoy.token), {
        params: Promise.resolve({ id: 'ed-iso-real-only' }),
      }),
    );
    assert.equal(crossEdition.status, 404);
    const crossOrganizer = await audited(
      await routes.getOrganizer(getRequest('http://localhost/api/organizers/org-iso-real-only', decoy.token), {
        params: Promise.resolve({ id: 'org-iso-real-only' }),
      }),
    );
    assert.equal(crossOrganizer.status, 404);

    // Decisiones: lectura, listado por snapshot y modificación.
    const crossDecision = await audited(
      await routes.getDecision(getRequest(`http://localhost/api/decisions/${realDecisionId}`, decoy.token), {
        params: Promise.resolve({ id: realDecisionId }),
      }),
    );
    assert.equal(crossDecision.status, 404);
    const crossDecisionList = await routes.listDecisions(
      getRequest(`http://localhost/api/decisions?snapshotId=${realSnapshotId}`, decoy.token),
    );
    assert.equal(crossDecisionList.status, 200);
    assert.deepEqual(((await crossDecisionList.json()) as { decisions: unknown[] }).decisions, []);
    const crossPatch = await audited(
      await routes.patchDecision(
        jsonRequest(`http://localhost/api/decisions/${realDecisionId}`, 'PATCH', {
          idempotencyKey: null,
          expectedRevision: 1,
          verdict: 'discarded',
          reasons: ['cruce'],
          addConditions: [],
          resolveConditions: [],
          campaignDraft: null,
        }, decoy.token),
        { params: Promise.resolve({ id: realDecisionId }) },
      ),
    );
    assert.equal(crossPatch.status, 404, 'modificar una decisión ajena no existe');
    // Nada cambió en la decisión real.
    const intact = await routes.getDecision(getRequest(`http://localhost/api/decisions/${realDecisionId}`, real.token), {
      params: Promise.resolve({ id: realDecisionId }),
    });
    const intactBody = (await intact.json()) as { decision: { verdict: string; revision: number } };
    assert.equal(intactBody.decision.verdict, 'pending');
    assert.equal(intactBody.decision.revision, 1);
  });

  await t.test('claims referenciados: comparación, importación y decisión con IDs ajenos se rechazan', async () => {
    // Ediciones del tenant real como candidatas de una comparación del señuelo.
    const crossComparison = await audited(
      await routes.postEvaluations(
        jsonRequest('http://localhost/api/evaluations', 'POST', {
          idempotencyKey: `iso-cross-${randomUUID()}`,
          mode: 'investment_comparison',
          profileRunId: decoyResearchId,
          editionIds: ['ed-iso-real-only'],
        }, decoy.token),
      ),
    );
    assert.equal(crossComparison.status, 400);
    assert.match(crossComparison.text, /fuera del catálogo/);

    // profileRunId del tenant real en una importación del señuelo.
    const crossIngest = await audited(
      await routes.postIngest(
        jsonRequest('http://localhost/api/events/ingest', 'POST', {
          idempotencyKey: `iso-cross-${randomUUID()}`,
          url: 'https://lu.ma/growthx-iso-cross',
          profileRunId: realResearchId,
        }, decoy.token),
      ),
    );
    assert.equal(crossIngest.status, 400);

    // snapshot del tenant real en una decisión del señuelo.
    const crossDecision = await audited(
      await routes.postDecisions(
        jsonRequest('http://localhost/api/decisions', 'POST', {
          idempotencyKey: `iso-cross-${randomUUID()}`,
          snapshotId: realSnapshotId,
          editionId: SUMMIT,
          verdict: 'pending',
          reasons: ['cruce'],
          conditions: [],
          campaignDraft: null,
        }, decoy.token),
      ),
    );
    assert.equal(crossDecision.status, 404);
    const { rows: decisionsOfDecoy } = await admin.query(
      'select count(*)::int as n from growthx.decisions where tenant_id = $1',
      [decoy.tenantId],
    );
    assert.equal(decisionsOfDecoy[0].n, 0, 'nada quedó persistido del cruce');
  });

  await t.test('idempotencia: la clave del otro tenant no deduplica hacia su run', async () => {
    // El señuelo usa la MISMA clave y el MISMO payload que la investigación
    // del tenant real: obtiene su PROPIO run nuevo, nunca el runId ajeno.
    const sameKey = await routes.postEvaluations(
      jsonRequest('http://localhost/api/evaluations', 'POST', researchBody(realKey), decoy.token),
    );
    const sameKeyBody = (await sameKey.json()) as { runId: string; deduplicated?: boolean };
    crossingBodies.push(JSON.stringify(sameKeyBody));
    assert.equal(sameKey.status, 202);
    assert.notEqual(sameKeyBody.runId, realResearchId, 'la clave ajena no devuelve el run del otro tenant');
    assert.ok(!sameKeyBody.deduplicated, 'no es un duplicado: es un run propio');
    await cancelJob(sameKeyBody.runId);
    // Repetir la misma clave AHORA sí deduplica, pero hacia el run propio.
    const repeat = await routes.postEvaluations(
      jsonRequest('http://localhost/api/evaluations', 'POST', researchBody(realKey), decoy.token),
    );
    const repeatBody = (await repeat.json()) as { runId: string; deduplicated?: boolean };
    assert.equal(repeatBody.runId, sameKeyBody.runId);
    assert.equal(repeatBody.deduplicated, true);
  });

  await t.test('sesiones: expirada o sin pertenencia → 401; nunca un tenant por defecto', async () => {
    const expiredToken = randomBytes(24).toString('hex');
    await admin.query(
      `insert into growthx.sessions (token_hash, user_id, tenant_id, expires_at)
       values ($1, $2, $3, now() - interval '1 minute')`,
      [hashSessionToken(expiredToken), decoy.userId, decoy.tenantId],
    );
    const expired = await routes.listEvaluations(getRequest('http://localhost/api/evaluations', expiredToken));
    assert.equal(expired.status, 401);

    // Una sesión sin pertenencia NI SIQUIERA puede existir: la FK compuesta
    // (tenant, usuario) → memberships la rechaza en el propio esquema.
    const { rows: userRows } = await admin.query(
      'insert into growthx.app_users (email, display_name) values ($1, $2) returning id',
      [`iso-revoked-${randomUUID().slice(0, 8)}@test.local`, 'Usuario sin pertenencia'],
    );
    await assert.rejects(
      admin.query(
        `insert into growthx.sessions (token_hash, user_id, tenant_id, expires_at)
         values ($1, $2, $3, now() + interval '1 hour')`,
        [hashSessionToken(randomBytes(24).toString('hex')), userRows[0].id, decoy.tenantId],
      ),
      /violates foreign key/,
    );
    const anonymous = await routes.listEvaluations(getRequest('http://localhost/api/evaluations'));
    assert.equal(anonymous.status, 401);
  });

  await t.test('pool de conexiones: el contexto de una conexión reutilizada no se filtra al siguiente tenant', async () => {
    const pool = new pg.Pool({ connectionString: process.env.GROWTHX_DATABASE_URL, max: 1 });
    try {
      const pids: number[] = [];
      const pid = async (client: pg.ClientBase) =>
        Number((await client.query('select pg_backend_pid() as pid')).rows[0].pid);

      // 1) Transacción bajo el tenant real: ve lo suyo.
      const own = await withTenantTransaction(pool, real.tenantId, async (client) => {
        pids.push(await pid(client));
        const { rows } = await client.query('select count(*)::int as n from growthx.runs');
        return Number(rows[0].n);
      });
      assert.ok(own >= 2, 'el tenant real ve sus propios runs');

      // 2) La MISMA conexión, sin contexto: cero filas (no hereda el tenant).
      const bare = await pool.connect();
      try {
        pids.push(await pid(bare));
        const { rows } = await bare.query('select count(*)::int as n from growthx.runs');
        assert.equal(Number(rows[0].n), 0, 'sin contexto la RLS no muestra ninguna fila');
      } finally {
        bare.release();
      }

      // 3) Una transacción del tenant real que FALLA a mitad de camino…
      await assert.rejects(
        withTenantTransaction(pool, real.tenantId, async (client) => {
          pids.push(await pid(client));
          await client.query('select 1');
          throw new Error('fallo inyectado a mitad de transacción');
        }),
        /fallo inyectado/,
      );

      // 4) …y la MISMA conexión pasa al señuelo sin arrastrar nada.
      await withTenantTransaction(pool, decoy.tenantId, async (client) => {
        pids.push(await pid(client));
        const { rows: foreign } = await client.query('select count(*)::int as n from growthx.runs where id = $1', [realComparisonId]);
        assert.equal(Number(foreign[0].n), 0, 'el run del tenant real no existe para el señuelo');
        const { rows: snapshots } = await client.query('select count(*)::int as n from growthx.snapshots');
        assert.equal(Number(snapshots[0].n), 0, 'los snapshots del tenant real tampoco');
        const { rows: ownRun } = await client.query('select count(*)::int as n from growthx.runs where id = $1', [decoyResearchId]);
        assert.equal(Number(ownRun[0].n), 1);
      });

      assert.equal(new Set(pids).size, 1, 'todas las consultas usaron la MISMA conexión física (max: 1)');
    } finally {
      await pool.end();
    }
  });

  await t.test('acceso directo de aplicación a una fila ajena queda bloqueado por RLS (roles sin bypass)', async () => {
    const { rows: roles } = await admin.query(
      `select rolname, rolsuper, rolbypassrls from pg_roles where rolname in ('growthx_app', 'growthx_worker', 'growthx_queue') order by rolname`,
    );
    assert.equal(roles.length, 3);
    for (const role of roles) {
      assert.equal(role.rolsuper, false, `${role.rolname} sin superusuario`);
      assert.equal(role.rolbypassrls, false, `${role.rolname} sin bypass de RLS`);
    }

    // App bajo el contexto del tenant real: leer/modificar filas del señuelo
    // no encuentra nada; insertar una fila ajena viola la política.
    await withTenantTransaction(getAppPool(), real.tenantId, async (client) => {
      const { rows: foreign } = await client.query('select count(*)::int as n from growthx.runs where id = $1', [decoyResearchId]);
      assert.equal(Number(foreign[0].n), 0);
      const updated = await client.query("update growthx.runs set state = 'failed' where id = $1", [decoyResearchId]);
      assert.equal(updated.rowCount, 0, 'una modificación ajena no alcanza ninguna fila');
    });
    await assert.rejects(
      withTenantTransaction(getAppPool(), real.tenantId, async (client) => {
        await client.query(
          `insert into growthx.run_logs (tenant_id, run_id, level, message) values ($1, $2, 'info', 'cruce')`,
          [decoy.tenantId, decoyResearchId],
        );
      }),
      /row-level security|violates/i,
      'insertar bajo otro tenant viola la política',
    );
    const { rows: noCross } = await admin.query(
      "select count(*)::int as n from growthx.run_logs where tenant_id = $1 and message = 'cruce'",
      [decoy.tenantId],
    );
    assert.equal(noCross[0].n, 0);

    // Worker bajo el contexto del señuelo: no ve el material del tenant real.
    await withTenantTransaction(getWorkerPool(), decoy.tenantId, async (client) => {
      const { rows } = await client.query('select count(*)::int as n from growthx.snapshots');
      assert.equal(Number(rows[0].n), 0);
    });

    // El rol de cola sigue sin ningún acceso de negocio.
    const queueClient = new pg.Client({ connectionString: process.env.GROWTHX_QUEUE_DATABASE_URL });
    await queueClient.connect();
    try {
      await assert.rejects(queueClient.query('select count(*) from growthx.runs'), /permission denied/);
      await assert.rejects(queueClient.query('select count(*) from growthx.snapshots'), /permission denied/);
    } finally {
      await queueClient.end();
    }
  });

  await t.test('el worker real rechaza jobs con tenant/payload discordante sin tocar el run', async () => {
    const before = await service.getRun({ tenantId: real.tenantId, runId: realComparisonId });
    assert.equal(before?.state, 'completed');

    // Jobs forjados: el runId del tenant real con el tenant del señuelo, y un
    // payload con forma desconocida. retryLimit 0: un intento y a failed.
    const boss = new PgBoss({
      connectionString: process.env.GROWTHX_DATABASE_URL!,
      schema: 'pgboss',
      max: 1,
      migrate: false,
      supervise: false,
      schedule: false,
    });
    await boss.start();
    const mismatchedId = await boss.send('evaluation-run', { runId: realComparisonId, tenantId: decoy.tenantId }, { retryLimit: 0 });
    const invalidId = await boss.send('evaluation-run', { runId: realComparisonId, tenantId: decoy.tenantId, extra: 'x' }, { retryLimit: 0 });
    assert.ok(mismatchedId && invalidId);
    await boss.stop({ graceful: false });

    const child = spawn(process.execPath, ['worker/index.ts'], {
      cwd: FRONTEND_DIR,
      env: { ...process.env, GROWTHX_WORKER_POLL_SECONDS: '0.5' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    workers.push(child);
    let output = '';
    child.stdout?.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.stderr?.on('data', (chunk: Buffer) => (output += chunk.toString()));

    const jobState = async (id: string) =>
      String((await admin.query('select state from pgboss.job where id = $1', [id])).rows[0].state);
    const deadline = Date.now() + 60_000;
    while ((await jobState(mismatchedId)) !== 'failed' || (await jobState(invalidId)) !== 'failed') {
      if (Date.now() > deadline) throw new Error(`timeout esperando el rechazo de los jobs forjados. Worker:\n${output}`);
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    child.kill('SIGTERM');

    const { rows: outputs } = await admin.query('select id, output from pgboss.job where id = any($1)', [[mismatchedId, invalidId]]);
    const messages = Object.fromEntries(outputs.map((row) => [row.id, JSON.stringify(row.output ?? '')]));
    assert.match(messages[mismatchedId], /inexistente bajo el tenant del job/);
    assert.match(messages[invalidId], /payload de job inválido/);
    crossingBodies.push(messages[mismatchedId], messages[invalidId], output.slice(-8000));

    // El run real quedó EXACTAMENTE igual: ni estado, ni resultado, ni pasos.
    const after = await service.getRun({ tenantId: real.tenantId, runId: realComparisonId });
    assert.deepEqual(after, before, 'el job discordante no tocó el run del tenant real');
  });

  await t.test('ningún error de cruce revela el contenido del otro tenant', async () => {
    assert.ok(crossingBodies.length >= 8, 'se auditaron todas las respuestas de cruce');
    for (const body of crossingBodies) {
      assert.ok(!body.includes(REAL_SENTINEL), 'el contenido del tenant real no aparece en ninguna respuesta de cruce');
      assert.ok(!body.includes(DECOY_SENTINEL), 'el contenido del señuelo tampoco');
    }
    // Y el material del tenant real jamás cruzó a las tablas del señuelo.
    const { rows: leaked } = await admin.query(
      `select count(*)::int as n from growthx.claim_revisions where tenant_id = $1 and payload::text like '%' || $2 || '%'`,
      [decoy.tenantId, REAL_SENTINEL],
    );
    assert.equal(leaked[0].n, 0);
  });
});
