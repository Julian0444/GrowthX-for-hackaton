// Ticket 12 — comparación con elegibilidad previa al score y snapshot oficial
// inmutable, contra PostgreSQL REAL (contenedor local: pnpm db:up &&
// pnpm db:migrate). Sin base disponible la suite se salta con aviso.
//
// Política ficticia EXPLÍCITA de test (approval: test_only): sus pesos no son
// política comercial (decisión abierta D2) y no se despliegan. Cubre:
// exclusión antes del scorer, score con faltantes, abstención, ausencia de
// política, desempate, snapshot inmutable, modelo sin autoridad, guardar y
// releer (mismas entradas/versiones y resultado), sombra v0 y criterios SF.
// Las invariantes 03–06 se verifican también sobre la nueva proyección.

import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import pg from 'pg';

// `next/server` no resuelve bajo `node --test`; solo en este proceso se mapea
// al archivo real del paquete (mismo gancho que evaluation-run.test.ts).
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'next/server') return nextResolve('next/server.js', context);
    return nextResolve(specifier, context);
  },
});

const DEFAULTS: Record<string, string> = {
  GROWTHX_ADMIN_DATABASE_URL: 'postgres://growthx:growthx@127.0.0.1:54329/growthx',
  GROWTHX_DATABASE_URL: 'postgres://growthx_app:growthx_app_dev@127.0.0.1:54329/growthx',
  GROWTHX_WORKER_DATABASE_URL: 'postgres://growthx_worker:growthx_worker_dev@127.0.0.1:54329/growthx',
  GROWTHX_QUEUE_DATABASE_URL: 'postgres://growthx_queue:growthx_queue_dev@127.0.0.1:54329/growthx',
};
for (const [name, value] of Object.entries(DEFAULTS)) {
  if (!process.env[name]) process.env[name] = value;
}

import type {
  ClaimRevision,
  EvaluationProfile,
  EventEditionRevision,
  OrganizerRevision,
  SourceRecord,
} from '../../lib/contracts/evaluation.ts';
import { hashSessionToken, SESSION_COOKIE } from '../../lib/server/auth/session.ts';
import { closePools, getAppPool } from '../../lib/server/db/pool.ts';
import { runMigrations } from '../../lib/server/db/migrate.ts';
import { parseCurationManifest, type CurationManifest } from '../../lib/server/catalog/manifest.ts';
import { loadCuratedCatalog } from '../../lib/server/catalog/store.ts';
import { readEditionDossier } from '../../lib/server/catalog/read.ts';
import { createEvaluationService } from '../../lib/server/evaluations/service.ts';
import { stopEvaluationQueue } from '../../lib/server/evaluations/queue.ts';
import { processEvaluationRun } from '../../lib/server/evaluations/run-worker.ts';
import {
  buildComparisonResult,
  COMPARISON_STEPS,
  loadFrozenV0Reference,
  shadowCompareWithV0,
  type ComparisonStepOptions,
  type ComparisonRunResult,
  type V0Reference,
} from '../../lib/server/evaluations/compare.ts';
import { evaluateEligibility } from '../../lib/server/evaluations/eligibility.ts';
import { applyScoringPolicy, type FeatureValue, type ScoringPolicy } from '../../lib/server/evaluations/scoring-policy.ts';
import { composeSnapshotNarrative } from '../../lib/server/evaluations/model-adapter.ts';
import {
  persistNarrativeRecord,
  readNarrativeBySnapshot,
  readSnapshotByRun,
} from '../../lib/server/evaluations/snapshot-store.ts';
import { projectComparisonResult } from '../../lib/api/opportunity-adapter.ts';

const routesPromise = (async () => {
  const collection = await import('../../app/api/evaluations/route.ts');
  return { postEvaluations: collection.POST };
})();

// ============ Reloj controlado y política ficticia ============

const T = '2026-09-20T12:00:00.000Z';

// Política FICTICIA de test (D2 abierta): pesos explícitos, marcados test_only.
const TEST_POLICY: ScoringPolicy = {
  policyId: 'pol-cmp-ficticia',
  policyVersion: 'test-1',
  objective: 'adoption',
  approval: { status: 'test_only', note: 'pesos ficticios de test; no son una política comercial aprobada (D2)' },
  weights: { audience_fit: 0.5, access_documented: 0.2, cost_fit: 0.3 },
};

// ============ Manifiesto de catálogo del test (sintético, etiquetado) ============

const REVIEWER = 'test-cmp';
const AT = '2026-09-10T00:00:00Z';

function source(id: string, geoScope: SourceRecord['geoScope'], url: string): SourceRecord {
  return {
    contractVersion: '1',
    id,
    url,
    locator: null,
    provider: 'test-provider',
    collector: 'test-curator',
    fetchedAt: AT,
    publishedAt: null,
    method: 'manual_curation',
    geoScope,
    content: { kind: 'none' },
    usageRestrictions: [],
  };
}

function organizer(id: string, displayName: string): OrganizerRevision {
  return {
    contractVersion: '1',
    id: `${id}-r1`,
    organizerId: id,
    displayName,
    aliases: [],
    claimRevisionIds: [],
    revisedAt: AT,
    previousRevisionId: null,
  };
}

function edition(
  id: string,
  organizerId: string,
  name: string,
  startDate: EventEditionRevision['startDate'],
  location: EventEditionRevision['location'],
  coordinates: EventEditionRevision['coordinates'] = null,
): EventEditionRevision {
  return {
    contractVersion: '1',
    id: `${id}-r1`,
    editionId: id,
    organizerIds: [organizerId],
    name,
    canonicalUrl: `https://lu.ma/${id}`,
    provider: 'luma',
    startDate,
    location,
    coordinates,
    claimRevisionIds: [],
    revisedAt: AT,
    previousRevisionId: null,
  };
}

function claim(
  id: string,
  editionId: string,
  attribute: string,
  value: ClaimRevision['value'],
  status: ClaimRevision['status'],
  sourceIds: string[],
  extra: Partial<Pick<ClaimRevision, 'note' | 'previousRevisionId' | 'reviewedAt'>> = {},
): ClaimRevision {
  return {
    contractVersion: '1',
    id,
    claimId: id.replace(/-r\d+$/, ''),
    subject: { type: 'edition', editionId },
    attribute,
    value,
    status,
    sourceIds,
    method: sourceIds.length > 0 ? 'manual_curation' : null,
    note: extra.note ?? null,
    reviewer: REVIEWER,
    reviewedAt: extra.reviewedAt ?? AT,
    previousRevisionId: extra.previousRevisionId ?? null,
  };
}

const SF = { scope: 'city', name: 'San Francisco' } as const;
const instant = (iso: string, timezone: string) => ({ precision: 'instant', iso, timezone }) as const;

// Catálogo disponible: 6 ediciones (5 vigentes al reloj T) para distinguirlo
// del conjunto comparado (hasta 3).
function buildManifest(): CurationManifest {
  return {
    manifestVersion: '1',
    name: 'cmp-catalogo-test',
    material: 'synthetic',
    authorizedBy: REVIEWER,
    verifiedAt: AT,
    note: 'Catálogo sintético del test de comparación (ticket 12).',
    sources: [
      source('src-cmp-luma', 'city', 'https://lu.ma/cmp'),
      source('src-cmp-org', 'city', 'https://org.example/cmp'),
      source('src-cmp-tarifa', 'city', 'https://org.example/tarifa'),
      source('src-cmp-berlin', 'city', 'https://lu.ma/cmp-berlin'),
      source('src-cmp-report', 'city', 'https://report.example/cmp'),
    ],
    companies: [],
    organizers: [
      organizer('org-cmp-activo', 'CMP Colectivo Activo (synthetic)'),
      // Organizador PERTINENTE sin evento futuro (criterio SF): solo una
      // edición vencida; puede investigarse, no publica inversión elegible.
      organizer('org-cmp-sin-futuro', 'CMP Solo Antecedentes (synthetic)'),
    ],
    editions: [
      edition('ed-cmp-aaa-elegible', 'org-cmp-activo', 'CMP Agentes Nocturnos SF', instant('2026-11-10T18:00:00-08:00', 'America/Los_Angeles'), SF, { lat: 37.7793, lng: -122.4193 }),
      edition('ed-cmp-bbb-condicionada', 'org-cmp-activo', 'CMP Summit Condicionado SF', instant('2027-01-20T18:00:00-08:00', 'America/Los_Angeles'), SF),
      edition('ed-cmp-ccc-sobre-presupuesto', 'org-cmp-activo', 'CMP Gala Sobre Presupuesto SF', instant('2026-12-05T18:00:00-08:00', 'America/Los_Angeles'), SF),
      // Edición futura en OTRA ciudad: investigable, jamás elegible en SF.
      edition('ed-cmp-ddd-berlin', 'org-cmp-activo', 'CMP Nacht Berlin', instant('2027-02-11T18:00:00+01:00', 'Europe/Berlin'), { scope: 'city', name: 'Berlin' }),
      edition('ed-cmp-eee-vencida', 'org-cmp-sin-futuro', 'CMP Retro 2025 SF', instant('2025-05-10T18:00:00-07:00', 'America/Los_Angeles'), SF),
      // Alcance país: la ciudad queda pendiente; sin claims → abstención.
      edition('ed-cmp-fff-opaca', 'org-cmp-activo', 'CMP Roadshow Federal', instant('2026-10-30T18:00:00-07:00', 'America/Los_Angeles'), { scope: 'country', name: 'United States' }),
    ],
    participations: [],
    claims: [
      // Elegible: fecha, lugar urbano observado, acceso abierto, costo dentro
      // del presupuesto, audiencia afín con soporte.
      claim('clm-cmp-aaa-loc-r1', 'ed-cmp-aaa-elegible', 'location', { kind: 'location', scope: 'city', name: 'San Francisco' }, 'observed', ['src-cmp-luma']),
      claim('clm-cmp-aaa-acc-r1', 'ed-cmp-aaa-elegible', 'access', { kind: 'text', text: 'Registro abierto según el listado' }, 'observed', ['src-cmp-luma']),
      claim('clm-cmp-aaa-cost-r1', 'ed-cmp-aaa-elegible', 'cost:sponsorship', { kind: 'money', amount: 1500, currency: 'USD' }, 'observed', ['src-cmp-tarifa']),
      claim('clm-cmp-aaa-aud-r1', 'ed-cmp-aaa-elegible', 'audience', { kind: 'text', text: 'python agents backend teams' }, 'announced', ['src-cmp-org']),
      // Condicionada: lugar respaldado, pero acceso y costo pendientes y
      // audiencia con soporte parcial (score con faltantes + condiciones).
      claim('clm-cmp-bbb-loc-r1', 'ed-cmp-bbb-condicionada', 'location', { kind: 'location', scope: 'city', name: 'San Francisco' }, 'observed', ['src-cmp-luma']),
      claim('clm-cmp-bbb-acc-r1', 'ed-cmp-bbb-condicionada', 'access', { kind: 'pending', note: 'el listado no declara la modalidad de registro' }, 'pending', []),
      claim('clm-cmp-bbb-cost-r1', 'ed-cmp-bbb-condicionada', 'cost:sponsorship', { kind: 'pending', note: 'partidas no publicadas' }, 'pending', []),
      claim('clm-cmp-bbb-aud-r1', 'ed-cmp-bbb-condicionada', 'audience', { kind: 'text', text: 'python community meetup' }, 'announced', ['src-cmp-org']),
      // Sobre presupuesto: partida publicada que excede el presupuesto declarado.
      claim('clm-cmp-ccc-loc-r1', 'ed-cmp-ccc-sobre-presupuesto', 'location', { kind: 'location', scope: 'city', name: 'San Francisco' }, 'observed', ['src-cmp-luma']),
      claim('clm-cmp-ccc-acc-r1', 'ed-cmp-ccc-sobre-presupuesto', 'access', { kind: 'text', text: 'Registro abierto' }, 'observed', ['src-cmp-luma']),
      claim('clm-cmp-ccc-cost-r1', 'ed-cmp-ccc-sobre-presupuesto', 'cost:sponsorship', { kind: 'money', amount: 9000, currency: 'USD' }, 'observed', ['src-cmp-tarifa']),
      // Berlín: ciudad respaldada… en otra ciudad.
      claim('clm-cmp-ddd-loc-r1', 'ed-cmp-ddd-berlin', 'location', { kind: 'location', scope: 'city', name: 'Berlin' }, 'observed', ['src-cmp-berlin']),
      // Vencida: lugar SF respaldado; la excluye la fecha, no la ciudad.
      claim('clm-cmp-eee-loc-r1', 'ed-cmp-eee-vencida', 'location', { kind: 'location', scope: 'city', name: 'San Francisco' }, 'observed', ['src-cmp-luma']),
      // Opaca: audiencia contradicha (dos fuentes discrepan) y nada más.
      claim('clm-cmp-fff-aud-r1', 'ed-cmp-fff-opaca', 'audience', { kind: 'number', amount: 150, unit: 'asistentes anunciados' }, 'announced', ['src-cmp-org']),
      claim('clm-cmp-fff-aud-r2', 'ed-cmp-fff-opaca', 'audience', { kind: 'number', amount: 150, unit: 'asistentes anunciados' }, 'contradicted', ['src-cmp-org', 'src-cmp-report'], {
        note: 'El organizador anuncia 150; el reporte estima 60. Discrepancia sin resolver.',
        previousRevisionId: 'clm-cmp-fff-aud-r1',
        reviewedAt: '2026-09-11T00:00:00Z',
      }),
    ],
  };
}

// ============ Utilidades ============

interface Seeded {
  tenantId: string;
  userId: string;
  token: string;
}

async function seedTenant(admin: pg.Client, label: string): Promise<Seeded> {
  const slug = `it-cmp-${label}-${randomUUID().slice(0, 8)}`;
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
     values ($1, $2, $3, now() + interval '1 hour')`,
    [hashSessionToken(token), userId, tenantId],
  );
  return { tenantId, userId, token };
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

// Higiene de la cola compartida (lección del ticket 11): los jobs que esta
// suite acepta se cancelan de inmediato — el procesamiento corre in-process
// con deps inyectadas, y un worker real no debe levantarlos.
async function cancelJob(admin: pg.Client, runId: string): Promise<void> {
  await admin.query("update pgboss.job set state = 'cancelled' where singleton_key = $1 and state in ('created', 'retry')", [runId]);
}

function transportOf(payload: unknown, status = 200): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;
}

function geminiBody(proposals: unknown[], extraRoot: Record<string, unknown> = {}): unknown {
  return {
    candidates: [{ content: { parts: [{ text: JSON.stringify({ proposals, ...extraRoot }) }] } }],
    usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 40, totalTokenCount: 140 },
  };
}

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

// ============ Suite ============

test('evaluation-snapshot: comparación y snapshot oficial (PostgreSQL real)', async (t) => {
  const admin = await probeDatabase();
  if (!admin) {
    t.skip('PostgreSQL no disponible; arrancá la base con `pnpm db:up && pnpm db:migrate` (frontend/db/README.md)');
    return;
  }
  const workerPool = new pg.Pool({ connectionString: process.env.GROWTHX_WORKER_DATABASE_URL, max: 4 });
  t.after(async () => {
    await stopEvaluationQueue();
    await closePools();
    await workerPool.end();
    await admin.end();
  });

  await runMigrations();
  // Huérfanos de corridas previas de ESTA suite: cancelados antes de empezar.
  await admin.query(
    `update pgboss.job set state = 'cancelled'
      where state in ('created', 'retry')
        and data->>'tenantId' in (select id::text from growthx.tenants where slug like 'it-cmp-%')`,
  );

  const { postEvaluations } = await routesPromise;
  const real = await seedTenant(admin, 'real');
  const decoy = await seedTenant(admin, 'decoy');
  const appPool = getAppPool();
  const service = createEvaluationService();

  // Catálogo sintético etiquetado bajo el tenant real.
  const manifestParse = parseCurationManifest(JSON.parse(JSON.stringify(buildManifest())));
  assert.ok(manifestParse.ok, `manifiesto de test inválido: ${JSON.stringify(!manifestParse.ok && manifestParse.issues)}`);
  if (!manifestParse.ok) return;
  const load = await loadCuratedCatalog(appPool, real.tenantId, manifestParse.manifest);
  assert.equal(load.status, 'loaded');

  // Investigación previa cuyo perfil reutiliza la comparación.
  const profileBody = {
    idempotencyKey: `it-cmp-profile-${randomUUID()}`,
    mode: 'catalog_research' as const,
    profile: {
      product: 'AI observability for production agents',
      audienceDescription: 'Equipos backend adoptando tooling de AI',
      audienceProfiles: ['backend'],
      stack: ['python', 'agents'],
      budget: { status: 'declared' as const, amount: 2000, currency: 'USD' },
      window: { from: null, to: null },
      objective: { kind: 'adoption' as const },
    },
  };
  const profileAccept = await service.accept({ tenantId: real.tenantId, userId: real.userId, body: profileBody });
  assert.equal(profileAccept.status, 'accepted');
  const profileRunId = (profileAccept as { runId: string }).runId;
  await cancelJob(admin, profileRunId);

  const acceptComparison = async (
    editionIds: string[],
    overrides: { idempotencyKey?: string; tenant?: Seeded; profileRunId?: string } = {},
  ) => {
    const tenant = overrides.tenant ?? real;
    const outcome = await service.accept({
      tenantId: tenant.tenantId,
      userId: tenant.userId,
      body: {
        idempotencyKey: overrides.idempotencyKey ?? `it-cmp-${randomUUID()}`,
        mode: 'investment_comparison',
        profileRunId: overrides.profileRunId ?? profileRunId,
        editionIds,
      },
    });
    if (outcome.status === 'accepted' || outcome.status === 'duplicate') await cancelJob(admin, outcome.runId);
    return outcome;
  };

  const processComparison = async (runId: string, comparison: ComparisonStepOptions) => {
    await processEvaluationRun({ runId, tenantId: real.tenantId }, { pool: workerPool, comparison });
    const view = await service.getRun({ tenantId: real.tenantId, runId });
    assert.ok(view, 'el run procesado se recupera');
    assert.equal(view.state, 'completed');
    return view.result as ComparisonRunResult;
  };

  // Sombra v0 controlada: una entrada coincide con la edición elegible.
  const v0Reference: V0Reference = {
    label: 'referencia v0 de test (offline)',
    unit: 'community_market',
    objective: 'adoption',
    entries: [{ id: 'opp-com-test-1', eventName: 'CMP Agentes Nocturnos SF', score: 61 }],
  };
  const baseOptions: ComparisonStepOptions = {
    evaluationInstant: T,
    policyProvider: () => TEST_POLICY,
    v0Reference: async () => v0Reference,
    narrative: { apiKey: 'test-key', transport: transportOf(geminiBody([])) },
  };

  await t.test('frontera: 401 sin sesión; >3 o ediciones ajenas → 400; tenantId en el cuerpo → 400', async () => {
    const body = {
      idempotencyKey: `it-cmp-http-${randomUUID()}`,
      mode: 'investment_comparison',
      profileRunId,
      editionIds: ['ed-cmp-aaa-elegible'],
    };
    assert.equal((await postEvaluations(postRequest(body))).status, 401);
    const four = await postEvaluations(
      postRequest({ ...body, editionIds: ['a', 'b', 'c', 'd'] }, real.token),
    );
    assert.equal(four.status, 400);
    assert.match(String((await four.json()).message), /hasta 3|top 3/i);
    const foreign = await postEvaluations(
      postRequest({ ...body, editionIds: ['ed-cmp-aaa-elegible', 'ed-inexistente'] }, real.token),
    );
    assert.equal(foreign.status, 400);
    assert.match(String((await foreign.json()).message), /fuera del catálogo|no inventa/i);
    const withTenant = await postEvaluations(postRequest({ ...body, tenantId: decoy.tenantId }, real.token));
    assert.equal(withTenant.status, 400);
  });

  await t.test('aceptación HTTP: 202 con los 4 steps del workflow y job durable; idempotencia por conjunto', async () => {
    const body = {
      idempotencyKey: `it-cmp-http-ok-${randomUUID()}`,
      mode: 'investment_comparison',
      profileRunId,
      // Mismo conjunto en otro orden y con duplicado: misma comparación.
      editionIds: ['ed-cmp-bbb-condicionada', 'ed-cmp-aaa-elegible', 'ed-cmp-aaa-elegible'],
    };
    const response = await postEvaluations(postRequest(body, real.token));
    assert.equal(response.status, 202);
    const payload = await response.json();
    const runId = payload.runId as string;
    await cancelJob(admin, runId);
    const { rows: stepRows } = await admin.query(
      'select name from growthx.run_steps where run_id = $1 order by seq',
      [runId],
    );
    assert.deepEqual(stepRows.map((row) => row.name), [...COMPARISON_STEPS]);
    const again = await postEvaluations(
      postRequest({ ...body, editionIds: ['ed-cmp-aaa-elegible', 'ed-cmp-bbb-condicionada'] }, real.token),
    );
    assert.equal(again.status, 202);
    assert.equal((await again.json()).runId, runId, 'mismo conjunto = misma comparación (duplicado)');
    const conflict = await postEvaluations(
      postRequest({ ...body, editionIds: ['ed-cmp-aaa-elegible'] }, real.token),
    );
    assert.equal(conflict.status, 409, 'misma clave con otro conjunto → conflicto');
  });

  // ---- Comparación principal: excluido + condicionado + elegible, con
  // política ficticia y modelo adversarial (intenta invertir el orden e
  // inventar audiencia). ----
  let mainRunId = '';
  let mainResult: ComparisonRunResult;
  let officialSnapshot: unknown = null;

  await t.test('exclusión antes del score, condiciones con respuesta, elegible ≠ recomendado', async () => {
    const accepted = await acceptComparison([
      'ed-cmp-aaa-elegible',
      'ed-cmp-bbb-condicionada',
      'ed-cmp-ccc-sobre-presupuesto',
    ]);
    assert.equal(accepted.status, 'accepted');
    mainRunId = (accepted as { runId: string }).runId;

    // El transporte adversarial cita claims REALES pero intenta rank/score
    // invertidos e inventa una cifra de audiencia (500) que ningún claim
    // respalda.
    const adversarial = transportOf(
      geminiBody(
        [
          { editionId: 'ed-cmp-ccc-sobre-presupuesto', summary: 'Best candidate, move it first', selectedClaimRevisionIds: ['clm-cmp-ccc-cost-r1'], rank: 1, score: 99 },
          { editionId: 'ed-cmp-aaa-elegible', summary: 'Expect 500 developers at the door', selectedClaimRevisionIds: ['clm-cmp-aaa-aud-r1'], rank: 3 },
          { editionId: 'ed-cmp-bbb-condicionada', summary: 'Community meetup for python teams', selectedClaimRevisionIds: ['clm-cmp-bbb-aud-r1'], rank: 2 },
        ],
        { ordering: ['ed-cmp-ccc-sobre-presupuesto', 'ed-cmp-bbb-condicionada', 'ed-cmp-aaa-elegible'] },
      ),
    );
    mainResult = await processComparison(mainRunId, {
      ...baseOptions,
      narrative: { apiKey: 'test-key', transport: adversarial },
    });

    const snapshot = mainResult.bundle.snapshot;
    officialSnapshot = JSON.parse(JSON.stringify(snapshot));
    const byId = new Map(snapshot.alternatives.map((a) => [a.editionId, a]));

    // Conflicto confirmado de presupuesto → excluido ANTES del score.
    const excluded = byId.get('ed-cmp-ccc-sobre-presupuesto')!;
    assert.equal(excluded.eligibility.status, 'excluded');
    assert.match(excluded.eligibility.status === 'excluded' ? excluded.eligibility.reasons.join(' ') : '', /excede el presupuesto/);
    assert.deepEqual(excluded.scoring, {
      status: 'not_scored',
      reason: 'excluded_before_scoring',
      note: 'Excluido por conflicto confirmado antes del score: un puntaje alto no habilita un evento excluido.',
    });

    // Datos insuficientes → condiciones pendientes con la respuesta concreta.
    const conditional = byId.get('ed-cmp-bbb-condicionada')!;
    assert.equal(conditional.eligibility.status, 'conditional');
    assert.ok(conditional.conditions.length >= 2);
    assert.ok(conditional.conditions.every((c) => typeof c.resolution === 'string' && c.resolution.length > 0));
    // Costo desconocido: feature null con razón, jamás 0.
    const features = mainResult.featuresByEdition['ed-cmp-bbb-condicionada'];
    const cost = features.find((f: FeatureValue) => f.key === 'cost_fit')!;
    assert.equal(cost.value, null);
    assert.match(String(cost.missingReason), /no cuenta como cero/);

    const eligible = byId.get('ed-cmp-aaa-elegible')!;
    assert.equal(eligible.eligibility.status, 'eligible');
    assert.match(mainResult.eligibleIsNotRecommended, /no significa recomendado/i);
  });

  await t.test('scorer con política ficticia: orden oficial, S_known, Q y sensibilidad a faltantes', async () => {
    const snapshot = mainResult.bundle.snapshot;
    assert.deepEqual(snapshot.policy, { status: 'applied', policyId: 'pol-cmp-ficticia', policyVersion: 'test-1' });
    assert.equal(snapshot.ordering.kind, 'ranked');
    // Elegible (65) > condicionada con faltantes > excluida al final.
    assert.deepEqual(snapshot.ordering.editionIds, [
      'ed-cmp-aaa-elegible',
      'ed-cmp-bbb-condicionada',
      'ed-cmp-ccc-sobre-presupuesto',
    ]);
    const eligible = snapshot.alternatives.find((a) => a.editionId === 'ed-cmp-aaa-elegible')!;
    assert.equal(eligible.scoring.status, 'scored');
    if (eligible.scoring.status === 'scored') {
      assert.equal(eligible.scoring.sKnown, 65);
      assert.equal(eligible.scoring.coverage, 1);
      assert.equal(eligible.scoring.sensitivityNote, null);
    }
    // Score CON faltantes: renormalizado sobre lo activo, cobertura < 1 y nota
    // de sensibilidad que nombra las dimensiones ausentes.
    const conditional = snapshot.alternatives.find((a) => a.editionId === 'ed-cmp-bbb-condicionada')!;
    assert.equal(conditional.scoring.status, 'scored');
    if (conditional.scoring.status === 'scored') {
      assert.ok(conditional.scoring.coverage < 1);
      assert.match(String(conditional.scoring.sensitivityNote), /access_documented/);
      assert.match(String(conditional.scoring.sensitivityNote), /cost_fit/);
    }
  });

  await t.test('desempate determinístico: empate exacto se resuelve por id estable, no por orden de llegada', () => {
    const features: FeatureValue[] = [
      { key: 'audience_fit', value: 0.5, missingReason: null, claimRevisionIds: [], note: null },
      { key: 'access_documented', value: 1, missingReason: null, claimRevisionIds: [], note: null },
      { key: 'cost_fit', value: 0.5, missingReason: null, claimRevisionIds: [], note: null },
    ];
    const forward = applyScoringPolicy(TEST_POLICY, [
      { editionId: 'ed-zzz', features },
      { editionId: 'ed-aaa', features },
    ]);
    const backward = applyScoringPolicy(TEST_POLICY, [
      { editionId: 'ed-aaa', features },
      { editionId: 'ed-zzz', features },
    ]);
    assert.deepEqual(forward.ordering, ['ed-aaa', 'ed-zzz']);
    assert.deepEqual(backward.ordering, forward.ordering);
  });

  await t.test('modelo sin autoridad: el snapshot persistido conserva el resultado oficial y la advertencia', async () => {
    // La narrativa validada retuvo la cifra inventada y descartó rank/score.
    const narrative = mainResult.narrative!;
    assert.equal(narrative.status, 'validated');
    assert.ok(narrative.discarded?.attemptedOrdering, 'el intento de ordenar quedó registrado');
    assert.ok(narrative.discarded?.attemptedScores, 'el intento de puntuar quedó registrado');
    const withheld = narrative.proposals.find((p) => p.editionId === 'ed-cmp-aaa-elegible')!;
    assert.match(String(withheld.withheldNote), /500/);
    assert.ok(mainResult.warnings.some((w) => /500/.test(w)), 'la advertencia viaja en el resultado');
    // Registro del adaptador: modelo, versión de prompt, duración y uso.
    assert.equal(narrative.model, 'gemini-2.5-flash');
    assert.equal(narrative.promptVersion, 'comparison-narrative/1');
    assert.ok(narrative.durationMs >= 0);
    assert.equal(narrative.usage?.totalTokens, 140);

    // El snapshot RELEÍDO de PostgreSQL es idéntico al confirmado antes de la
    // redacción: orden, scores, eligibility y condiciones intactos.
    const persisted = await readSnapshotByRun(workerPool, real.tenantId, mainRunId);
    assert.ok(persisted);
    assert.deepEqual(JSON.parse(JSON.stringify(persisted.snapshot)), officialSnapshot);
    assert.equal(persisted.snapshot.narrative, null, 'la redacción no se inyecta en el snapshot');

    // Cita ajena (claim de otra alternativa del MISMO snapshot): la salida se
    // rechaza ENTERA, sin filtrar ni sustituir citas.
    const foreign = await composeSnapshotNarrative(
      { snapshot: persisted.snapshot, claims: mainResult.bundle.claims },
      {
        apiKey: 'test-key',
        transport: transportOf(
          geminiBody([
            { editionId: 'ed-cmp-aaa-elegible', summary: 'Uses another candidate evidence', selectedClaimRevisionIds: ['clm-cmp-bbb-aud-r1'] },
            { editionId: 'ed-cmp-bbb-condicionada', summary: 'Fine text', selectedClaimRevisionIds: ['clm-cmp-bbb-aud-r1'] },
          ]),
        ),
      },
    );
    assert.equal(foreign.status, 'rejected');
    assert.match(String(foreign.motive), /ajena/);
    // Defensa en profundidad del repositorio: un registro con citas fuera del
    // snapshot no se persiste.
    await assert.rejects(
      persistNarrativeRecord(workerPool, real.tenantId, {
        ...foreign,
        status: 'validated',
        proposals: [{ editionId: 'ed-cmp-aaa-elegible', summary: 'x', selectedClaimRevisionIds: ['clm-inexistente'], withheldNote: null }],
      }),
      /fuera del snapshot/,
    );
  });

  await t.test('snapshot inmutable: sin UPDATE/DELETE por grants y sin duplicados por reentrega', async () => {
    for (const url of [process.env.GROWTHX_WORKER_DATABASE_URL, process.env.GROWTHX_DATABASE_URL]) {
      const client = new pg.Client({ connectionString: url });
      await client.connect();
      try {
        await client.query('begin');
        await client.query("select set_config('growthx.tenant_id', $1, true)", [real.tenantId]);
        await assert.rejects(
          client.query("update growthx.snapshots set evaluated_at = now() where run_id = $1", [mainRunId]),
          /permission denied/,
        );
        await client.query('rollback');
        await client.query('begin');
        await client.query("select set_config('growthx.tenant_id', $1, true)", [real.tenantId]);
        await assert.rejects(client.query('delete from growthx.snapshots where run_id = $1', [mainRunId]), /permission denied/);
        await client.query('rollback');
      } finally {
        await client.end();
      }
    }
    // Reentrega del step con OTRO reloj: devuelve el snapshot confirmado, no
    // crea otro ni lo reescribe.
    const { runEvaluateCandidatesStep } = await import('../../lib/server/evaluations/compare.ts');
    const { rows: profileRows } = await admin.query(
      'select p.payload from growthx.profiles p join growthx.runs r on r.profile_id = p.id where r.id = $1',
      [mainRunId],
    );
    const profile = profileRows[0].payload as EvaluationProfile;
    const redelivery = await runEvaluateCandidatesStep(
      workerPool,
      real.tenantId,
      mainRunId,
      profile,
      ['ed-cmp-aaa-elegible', 'ed-cmp-bbb-condicionada', 'ed-cmp-ccc-sobre-presupuesto'],
      { ...baseOptions, evaluationInstant: '2027-01-01T00:00:00.000Z' },
    );
    assert.equal(redelivery.persisted, 'already_persisted');
    assert.equal(redelivery.snapshotId, mainResult.snapshotId);
    const { rows: countRows } = await admin.query('select count(*)::int as n from growthx.snapshots where run_id = $1', [mainRunId]);
    assert.equal(countRows[0].n, 1);
  });

  await t.test('catálogo disponible ≠ conjunto comparado; sombra v0 registrada sin reutilizar scores', async () => {
    const catalog = mainResult.availableCatalog;
    assert.equal(catalog.editionIds.length, 6);
    assert.equal(catalog.upcomingEditionIds.length, 5);
    assert.deepEqual(catalog.comparedEditionIds, [
      'ed-cmp-aaa-elegible',
      'ed-cmp-bbb-condicionada',
      'ed-cmp-ccc-sobre-presupuesto',
    ]);
    assert.match(catalog.note, /no se completa un top 3/);

    const shadow = mainResult.v0Shadow;
    const matched = shadow.entries.find((e) => e.editionId === 'ed-cmp-aaa-elegible')!;
    assert.equal(matched.status, 'reference_found_not_comparable');
    if (matched.status === 'reference_found_not_comparable') {
      assert.equal(matched.v0Score, 61);
      assert.match(matched.reason, /unidad y objetivo distintos/);
    }
    // El score v0 NO llenó el score v1 (65 vs 61, y viene de la política).
    const eligible = mainResult.bundle.snapshot.alternatives.find((a) => a.editionId === 'ed-cmp-aaa-elegible')!;
    assert.ok(eligible.scoring.status === 'scored' && eligible.scoring.sKnown !== 61);
    const missing = shadow.entries.find((e) => e.editionId === 'ed-cmp-bbb-condicionada')!;
    assert.equal(missing.status, 'not_comparable');
    assert.match(missing.reason, /v0 no evaluó este evento/);
    // La referencia congelada del repo también carga offline (loader real).
    const frozen = await loadFrozenV0Reference();
    assert.ok(frozen && frozen.entries.length === 3, 'characterization.json provee la referencia v0 offline');
    const frozenShadow = shadowCompareWithV0([{ editionId: 'x', name: 'Dynamo After Hours' }], frozen);
    assert.equal(frozenShadow.entries[0].status, 'reference_found_not_comparable');
  });

  await t.test('sin política: comparación factual persistida, sin ranking numérico y con «política pendiente»', async () => {
    const accepted = await acceptComparison(['ed-cmp-aaa-elegible', 'ed-cmp-ddd-berlin', 'ed-cmp-eee-vencida']);
    assert.equal(accepted.status, 'accepted');
    const runId = (accepted as { runId: string }).runId;
    const result = await processComparison(runId, {
      evaluationInstant: T,
      v0Reference: async () => null,
      narrative: { apiKey: null },
    });
    const snapshot = result.bundle.snapshot;
    assert.equal(snapshot.policy.status, 'none');
    assert.match(snapshot.policy.status === 'none' ? snapshot.policy.note : '', /pendiente/i);
    assert.equal(snapshot.ordering.kind, 'presentation_only');
    for (const alternative of snapshot.alternatives) {
      assert.notEqual(alternative.scoring.status, 'scored');
      if (alternative.eligibility.status !== 'excluded') {
        assert.deepEqual(alternative.scoring, {
          status: 'not_scored',
          reason: 'no_policy',
          note: 'Sin política aplicable (D2): sin score.',
        });
      }
    }
    // Criterios SF: la edición futura en otra ciudad y la vencida quedan
    // excluidas; el elegible no se vuelve «recomendado» por serlo.
    const berlin = snapshot.alternatives.find((a) => a.editionId === 'ed-cmp-ddd-berlin')!;
    assert.equal(berlin.eligibility.status, 'excluded');
    assert.match(berlin.eligibility.status === 'excluded' ? berlin.eligibility.reasons.join(' ') : '', /otra ciudad \(Berlin\)/);
    const expired = snapshot.alternatives.find((a) => a.editionId === 'ed-cmp-eee-vencida')!;
    assert.equal(expired.eligibility.status, 'excluded');
    assert.match(expired.eligibility.status === 'excluded' ? expired.eligibility.reasons.join(' ') : '', /Fecha vencida/);
    // Fallback determinístico del adaptador (sin clave): registrado, no un error.
    assert.equal(result.narrative?.status, 'deterministic_only');
    assert.match(String(result.narrative?.motive), /GEMINI_API_KEY/);
    // Sin referencia v0 disponible: se declara, no se finge comparación.
    assert.ok(result.v0Shadow.entries.every((e) => e.status === 'not_comparable'));

    // El organizador de la vencida (pertinente, sin evento futuro) sigue
    // investigable: su expediente existe; nada suyo quedó elegible en SF.
    const dossier = await readEditionDossier(appPool, real.tenantId, 'ed-cmp-eee-vencida', T);
    assert.ok(dossier && dossier.organizers.some((o) => o.organizerId === 'org-cmp-sin-futuro'));
    assert.ok(!snapshot.alternatives.some((a) => a.organizerId === 'org-cmp-sin-futuro' && a.eligibility.status === 'eligible'));
  });

  await t.test('abstención: todas las dimensiones ausentes → insufficient_data, jamás un 0; fallo del proveedor → degradación', async () => {
    const accepted = await acceptComparison(['ed-cmp-fff-opaca']);
    assert.equal(accepted.status, 'accepted');
    const runId = (accepted as { runId: string }).runId;
    const result = await processComparison(runId, {
      ...baseOptions,
      narrative: { apiKey: 'test-key', transport: transportOf({ error: 'boom' }, 503) },
    });
    const alternative = result.bundle.snapshot.alternatives[0];
    assert.equal(alternative.eligibility.status, 'conditional');
    assert.equal(alternative.scoring.status, 'not_scored');
    if (alternative.scoring.status === 'not_scored') {
      assert.equal(alternative.scoring.reason, 'insufficient_data');
      assert.match(String(alternative.scoring.note), /se abstiene/);
    }
    // Audiencia contradicha y ciudad de alcance país: condiciones visibles.
    assert.ok(alternative.conditions.some((c) => /contradicha/i.test(c.description)));
    assert.ok(alternative.conditions.some((c) => /urbana|ciudad/i.test(c.description)));
    // Todas las features null CON razón.
    const features = result.featuresByEdition['ed-cmp-fff-opaca'];
    assert.ok(features.every((f: FeatureValue) => f.value === null && f.missingReason !== null));
    // Fallo HTTP del adaptador: degradación explícita registrada.
    assert.equal(result.narrative?.status, 'deterministic_only');
    assert.match(String(result.narrative?.motive), /HTTP 503/);
  });

  await t.test('guardar y releer: mismas entradas, versiones y resultado desde una conexión nueva', async () => {
    const freshPool = new pg.Pool({ connectionString: process.env.GROWTHX_WORKER_DATABASE_URL, max: 2 });
    try {
      const persisted = await readSnapshotByRun(freshPool, real.tenantId, mainRunId);
      assert.ok(persisted);
      assert.deepEqual(JSON.parse(JSON.stringify(persisted.snapshot)), officialSnapshot);
      const rebuilt = await buildComparisonResult(freshPool, real.tenantId, mainRunId);
      // El resultado recompuesto coincide con el publicado en runs.result.
      assert.deepEqual(JSON.parse(JSON.stringify(rebuilt)), JSON.parse(JSON.stringify(mainResult)));
      // Las revisiones fijadas se recuperan exactamente (ids y versiones).
      assert.deepEqual(
        rebuilt.bundle.claims.map((c) => c.id).sort(),
        [...persisted.snapshot.claimRevisionIds].sort(),
      );
      assert.deepEqual(
        rebuilt.bundle.editions.map((e) => e.id).sort(),
        [...persisted.snapshot.editionRevisionIds].sort(),
      );
      assert.equal(rebuilt.bundle.profile.profileVersion, persisted.snapshot.profileVersion);
      const narrative = await readNarrativeBySnapshot(freshPool, real.tenantId, persisted.snapshot.id);
      assert.equal(narrative?.status, 'validated');
    } finally {
      await freshPool.end();
    }
  });

  await t.test('invariantes 03–06 sobre la nueva proyección', async () => {
    const view = projectComparisonResult(mainResult);
    // 06/05: el orden proyectado es EXACTAMENTE el del snapshot; la redacción
    // no movió posiciones ni scores.
    assert.deepEqual(
      view.candidates.map((c) => c.editionId),
      mainResult.bundle.snapshot.ordering.editionIds,
    );
    assert.equal(view.candidates[0].stateLabel, 'Elegible');
    assert.equal(view.candidates[2].stateLabel, 'Descartado por restricción');
    // 04: cada fecha proyectada es la DECLARADA por la edición, nunca «hoy».
    const eligibleDate = view.candidates[0].dossier.date;
    assert.equal(eligibleDate.state, 'known');
    if (eligibleDate.state === 'known') assert.match(eligibleDate.display, /^2026-11-10T18:00:00-08:00/);
    // 03: el alcance país no se vuelve ciudad ni punto en el mapa.
    const opaque = await service.getRun({
      tenantId: real.tenantId,
      runId: (await (async () => {
        const { rows } = await admin.query(
          `select id from growthx.runs where tenant_id = $1 and mode = 'investment_comparison'
             and input->'editionIds' @> '["ed-cmp-fff-opaca"]' order by created_at desc limit 1`,
          [real.tenantId],
        );
        return rows[0].id as string;
      })()),
    });
    const opaqueView = projectComparisonResult(opaque!.result as ComparisonRunResult);
    const location = opaqueView.candidates[0].dossier.location;
    assert.equal(location.state, 'known');
    if (location.state === 'known') {
      assert.equal(location.display, 'United States');
      assert.match(String(location.pendingNote), /ciudad pendiente/);
    }
    assert.ok(opaqueView.projection.map.listedWithoutPoint.some((p) => p.editionId === 'ed-cmp-fff-opaca'));
    assert.ok(!opaqueView.projection.map.points.some((p) => p.editionId === 'ed-cmp-fff-opaca'));
    // Cobertura/consenso no se proyectan como probabilidad: el score proyectado
    // conserva coverage como fracción y la política que lo produjo.
    const eligibleScore = view.candidates[0].dossier.score;
    assert.equal(eligibleScore.state, 'scored');
    if (eligibleScore.state === 'scored') assert.equal(eligibleScore.policyId, 'pol-cmp-ficticia');
    // Fuentes visibles por candidato.
    assert.ok(view.candidates[0].sources.some((s) => s.id === 'src-cmp-luma'));
  });

  await t.test('conflicto de acceso confirmado excluye antes del score (regla pura de eligibility)', async () => {
    const dossier = await readEditionDossier(appPool, real.tenantId, 'ed-cmp-aaa-elegible', T);
    assert.ok(dossier);
    const profile: EvaluationProfile = {
      contractVersion: '1',
      id: 'prof-restr',
      profileVersion: 1,
      createdAt: T,
      product: 'x',
      audience: { description: 'backend', profiles: [] },
      stack: ['python'],
      budget: { status: 'declared', amount: 2000, currency: 'USD' },
      window: { from: null, to: null },
      restrictions: ['registro abierto'],
      objective: { kind: 'adoption', confirmation: 'provisional', successDefinition: { status: 'pending' } },
      comparableCompanies: [],
    };
    const verdict = evaluateEligibility({ profile, dossier });
    assert.equal(verdict.eligibility.status, 'excluded');
    assert.match(
      verdict.eligibility.status === 'excluded' ? verdict.eligibility.reasons.join(' ') : '',
      /Acceso incompatible confirmado/,
    );
  });

  await t.test('tenant señuelo: ni el perfil ni el snapshot existen para otra sesión', async () => {
    const cross = await acceptComparison(['ed-cmp-aaa-elegible'], { tenant: decoy });
    assert.equal(cross.status, 'invalid_profile');
    const { rows } = await admin.query('select id from growthx.snapshots where run_id = $1', [mainRunId]);
    assert.equal(rows.length, 1);
    const decoyClient = new pg.Client({ connectionString: process.env.GROWTHX_DATABASE_URL });
    await decoyClient.connect();
    try {
      await decoyClient.query('begin');
      await decoyClient.query("select set_config('growthx.tenant_id', $1, true)", [decoy.tenantId]);
      const { rows: decoyRows } = await decoyClient.query('select id from growthx.snapshots where run_id = $1', [mainRunId]);
      assert.equal(decoyRows.length, 0, 'RLS: el snapshot real no existe bajo el señuelo');
      await decoyClient.query('rollback');
    } finally {
      await decoyClient.end();
    }
  });
});
