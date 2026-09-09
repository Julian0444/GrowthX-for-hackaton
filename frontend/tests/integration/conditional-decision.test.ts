// Ticket 13 — guardar una decisión condicional y su campaña en borrador,
// contra PostgreSQL REAL (contenedor local: pnpm db:up && pnpm db:migrate).
// Sin base disponible la suite se salta con aviso.
//
// Cubre: los tres estados (elegir condicional / descartar / pendiente) con
// motivos obligatorios y razones distintas por alternativa; condición
// conservada (pregunta, respuesta esperada, efecto, responsable, plazo);
// excluido no elegible por click; acuerdo sin quién/cuándo/evidencia
// rechazado; conflicto entre pestañas por revisión esperada; idempotencia;
// rollback conjunto decisión/campaña; autor y tenant desde la sesión;
// guardar organizador ≠ inversión; tenant señuelo (RLS).

import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import pg from 'pg';

// `next/server` no resuelve bajo `node --test`; solo en este proceso se mapea
// al archivo real del paquete (mismo gancho que evaluation-snapshot.test.ts).
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
// La redacción del run de comparación debe degradar sin red: sin clave, el
// adaptador declara deterministic_only sin tocar nada.
delete process.env.GEMINI_API_KEY;

import type { ClaimRevision, EventEditionRevision, OrganizerRevision, SourceRecord } from '../../lib/contracts/evaluation.ts';
import { hashSessionToken, SESSION_COOKIE } from '../../lib/server/auth/session.ts';
import { closePools, getAppPool } from '../../lib/server/db/pool.ts';
import { runMigrations } from '../../lib/server/db/migrate.ts';
import { parseCurationManifest, type CurationManifest } from '../../lib/server/catalog/manifest.ts';
import { loadCuratedCatalog } from '../../lib/server/catalog/store.ts';
import { createEvaluationService } from '../../lib/server/evaluations/service.ts';
import { stopEvaluationQueue } from '../../lib/server/evaluations/queue.ts';
import { processEvaluationRun } from '../../lib/server/evaluations/run-worker.ts';
import type { ComparisonRunResult, ComparisonStepOptions } from '../../lib/server/evaluations/compare.ts';
import { saveOrganizerResearch } from '../../lib/server/evaluations/dashboard-store.ts';
import { saveDecision } from '../../lib/server/decisions/store.ts';
import type { DecisionRead } from '../../lib/api/atlas-client.ts';

const routesPromise = (async () => {
  const collection = await import('../../app/api/decisions/route.ts');
  const item = await import('../../app/api/decisions/[id]/route.ts');
  return {
    postDecisions: collection.POST,
    getDecisions: collection.GET,
    getDecision: item.GET,
    patchDecision: item.PATCH,
  };
})();

// ============ Reloj controlado y catálogo sintético ============

const T = '2026-09-20T12:00:00.000Z';
const REVIEWER = 'test-dcn';
const AT = '2026-09-10T00:00:00Z';

function source(id: string, url: string): SourceRecord {
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
    geoScope: 'city',
    content: { kind: 'none' },
    usageRestrictions: [],
  };
}

function edition(
  id: string,
  name: string,
  iso: string,
  coordinates: EventEditionRevision['coordinates'] = null,
): EventEditionRevision {
  return {
    contractVersion: '1',
    id: `${id}-r1`,
    editionId: id,
    organizerIds: ['org-dcn-activo'],
    name,
    canonicalUrl: `https://lu.ma/${id}`,
    provider: 'luma',
    startDate: { precision: 'instant', iso, timezone: 'America/Los_Angeles' },
    location: { scope: 'city', name: 'San Francisco' },
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
    note: null,
    reviewer: REVIEWER,
    reviewedAt: AT,
    previousRevisionId: null,
  };
}

const organizer: OrganizerRevision = {
  contractVersion: '1',
  id: 'org-dcn-activo-r1',
  organizerId: 'org-dcn-activo',
  displayName: 'DCN Colectivo SF (synthetic)',
  aliases: [],
  claimRevisionIds: [],
  revisedAt: AT,
  previousRevisionId: null,
};

// Tres alternativas: elegible / condicionada (acceso y costo pendientes) /
// excluida (partida con soporte que excede el presupuesto declarado de 2000).
function buildManifest(): CurationManifest {
  return {
    manifestVersion: '1',
    name: 'dcn-catalogo-test',
    material: 'synthetic',
    authorizedBy: REVIEWER,
    verifiedAt: AT,
    note: 'Catálogo sintético del test de decisión condicional (ticket 13).',
    sources: [source('src-dcn-luma', 'https://lu.ma/dcn'), source('src-dcn-tarifa', 'https://org.example/dcn-tarifa')],
    companies: [],
    organizers: [organizer],
    editions: [
      edition('ed-dcn-aaa-elegible', 'DCN Agentes Nocturnos SF', '2026-11-10T18:00:00-08:00', { lat: 37.7793, lng: -122.4193 }),
      edition('ed-dcn-bbb-condicionada', 'DCN Summit Condicionado SF', '2027-01-20T18:00:00-08:00'),
      edition('ed-dcn-ccc-sobre-presupuesto', 'DCN Gala Sobre Presupuesto SF', '2026-12-05T18:00:00-08:00'),
    ],
    participations: [],
    claims: [
      claim('clm-dcn-aaa-loc-r1', 'ed-dcn-aaa-elegible', 'location', { kind: 'location', scope: 'city', name: 'San Francisco' }, 'observed', ['src-dcn-luma']),
      claim('clm-dcn-aaa-acc-r1', 'ed-dcn-aaa-elegible', 'access', { kind: 'text', text: 'Registro abierto según el listado' }, 'observed', ['src-dcn-luma']),
      claim('clm-dcn-aaa-cost-r1', 'ed-dcn-aaa-elegible', 'cost:sponsorship', { kind: 'money', amount: 1500, currency: 'USD' }, 'observed', ['src-dcn-tarifa']),
      claim('clm-dcn-aaa-aud-r1', 'ed-dcn-aaa-elegible', 'audience', { kind: 'text', text: 'python agents backend teams' }, 'announced', ['src-dcn-luma']),
      claim('clm-dcn-bbb-loc-r1', 'ed-dcn-bbb-condicionada', 'location', { kind: 'location', scope: 'city', name: 'San Francisco' }, 'observed', ['src-dcn-luma']),
      claim('clm-dcn-bbb-acc-r1', 'ed-dcn-bbb-condicionada', 'access', { kind: 'pending', note: 'el listado no declara la modalidad de registro' }, 'pending', []),
      claim('clm-dcn-bbb-cost-r1', 'ed-dcn-bbb-condicionada', 'cost:sponsorship', { kind: 'pending', note: 'tarifas no publicadas' }, 'pending', []),
      claim('clm-dcn-bbb-aud-r1', 'ed-dcn-bbb-condicionada', 'audience', { kind: 'text', text: 'python community meetup' }, 'announced', ['src-dcn-luma']),
      claim('clm-dcn-ccc-loc-r1', 'ed-dcn-ccc-sobre-presupuesto', 'location', { kind: 'location', scope: 'city', name: 'San Francisco' }, 'observed', ['src-dcn-luma']),
      claim('clm-dcn-ccc-acc-r1', 'ed-dcn-ccc-sobre-presupuesto', 'access', { kind: 'text', text: 'Registro abierto' }, 'observed', ['src-dcn-luma']),
      claim('clm-dcn-ccc-cost-r1', 'ed-dcn-ccc-sobre-presupuesto', 'cost:sponsorship', { kind: 'money', amount: 9000, currency: 'USD' }, 'observed', ['src-dcn-tarifa']),
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
  const slug = `it-dcn-${label}-${randomUUID().slice(0, 8)}`;
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

const idParams = (id: string) => ({ params: Promise.resolve({ id }) });

async function cancelJob(admin: pg.Client, runId: string): Promise<void> {
  await admin.query("update pgboss.job set state = 'cancelled' where singleton_key = $1 and state in ('created', 'retry')", [runId]);
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

test('conditional-decision: decisión condicional persistida y campaña en borrador (PostgreSQL real)', async (t) => {
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
  await admin.query(
    `update pgboss.job set state = 'cancelled'
      where state in ('created', 'retry')
        and data->>'tenantId' in (select id::text from growthx.tenants where slug like 'it-dcn-%')`,
  );

  const { postDecisions, getDecisions, getDecision, patchDecision } = await routesPromise;
  const real = await seedTenant(admin, 'real');
  const decoy = await seedTenant(admin, 'decoy');
  const appPool = getAppPool();
  const service = createEvaluationService();

  const manifestParse = parseCurationManifest(JSON.parse(JSON.stringify(buildManifest())));
  assert.ok(manifestParse.ok, `manifiesto de test inválido: ${JSON.stringify(!manifestParse.ok && manifestParse.issues)}`);
  if (!manifestParse.ok) return;
  const load = await loadCuratedCatalog(appPool, real.tenantId, manifestParse.manifest);
  assert.equal(load.status, 'loaded');

  // Investigación previa cuyo perfil reutiliza la comparación (presupuesto
  // declarado 2000 USD: la gala de 9000 queda excluida antes del score).
  const profileAccept = await service.accept({
    tenantId: real.tenantId,
    userId: real.userId,
    body: {
      idempotencyKey: `it-dcn-profile-${randomUUID()}`,
      mode: 'catalog_research' as const,
      researchScope: 'sf_organizers' as const,
      profile: {
        product: 'AI observability for production agents',
        audienceDescription: 'Equipos backend adoptando tooling de AI',
        audienceProfiles: ['backend'],
        stack: ['python', 'agents'],
        budget: { status: 'declared' as const, amount: 2000, currency: 'USD' },
        window: { from: null, to: null },
        objective: { kind: 'hiring' as const },
      },
    },
  });
  assert.equal(profileAccept.status, 'accepted');
  const profileRunId = (profileAccept as { runId: string }).runId;
  await cancelJob(admin, profileRunId);

  const comparisonOptions: ComparisonStepOptions = {
    evaluationInstant: T,
    // D2 abierta: sin política aprobada la comparación sale factual («política
    // pendiente») — la decisión condicional no necesita ningún score.
    policyProvider: () => null,
    v0Reference: async () => null,
  };

  const runComparison = async (editionIds: string[]): Promise<ComparisonRunResult> => {
    const accepted = await service.accept({
      tenantId: real.tenantId,
      userId: real.userId,
      body: { idempotencyKey: `it-dcn-cmp-${randomUUID()}`, mode: 'investment_comparison', profileRunId, editionIds },
    });
    assert.equal(accepted.status, 'accepted');
    const runId = (accepted as { runId: string }).runId;
    await cancelJob(admin, runId);
    await processEvaluationRun({ runId, tenantId: real.tenantId }, { pool: workerPool, comparison: comparisonOptions });
    const view = await service.getRun({ tenantId: real.tenantId, runId });
    assert.ok(view && view.state === 'completed', 'la comparación completa');
    return view!.result as ComparisonRunResult;
  };

  const comparison = await runComparison(['ed-dcn-aaa-elegible', 'ed-dcn-bbb-condicionada', 'ed-dcn-ccc-sobre-presupuesto']);
  const snapshotId = comparison.snapshotId;
  const byEdition = new Map(comparison.bundle.snapshot.alternatives.map((a) => [a.editionId, a]));
  assert.equal(byEdition.get('ed-dcn-aaa-elegible')!.eligibility.status, 'eligible');
  assert.equal(byEdition.get('ed-dcn-bbb-condicionada')!.eligibility.status, 'conditional');
  assert.equal(byEdition.get('ed-dcn-ccc-sobre-presupuesto')!.eligibility.status, 'excluded');

  const claimCountBefore = Number(
    (await admin.query('select count(*) from growthx.claim_revisions where tenant_id = $1', [real.tenantId])).rows[0].count,
  );

  const decisionsUrl = 'http://localhost/api/decisions';
  let chosenRead: DecisionRead;

  await t.test('frontera: 401 sin sesión; autor/tenant/consenso en el cuerpo → 400; snapshot ajeno → 404', async () => {
    const body = {
      idempotencyKey: `it-dcn-front-${randomUUID()}`,
      snapshotId,
      editionId: 'ed-dcn-aaa-elegible',
      verdict: 'pending',
      reasons: ['falta confirmar la modalidad'],
      conditions: [],
      campaignDraft: null,
    };
    assert.equal((await postDecisions(jsonRequest(decisionsUrl, 'POST', body))).status, 401);

    const conTenant = await postDecisions(jsonRequest(decisionsUrl, 'POST', { ...body, tenantId: decoy.tenantId }, real.token));
    assert.equal(conTenant.status, 400);
    assert.match(String((await conTenant.json()).message), /resuelve el servidor/i);

    const conConsenso = await postDecisions(
      jsonRequest(decisionsUrl, 'POST', { ...body, consensus: 0.9, confidenceDelta: 8 }, real.token),
    );
    assert.equal(conConsenso.status, 400);
    assert.match(String((await conConsenso.json()).message), /consenso y confianza no existen/i);

    // El snapshot del tenant real no existe para el señuelo: 404 sin confirmar
    // existencia ajena (RLS).
    assert.equal((await postDecisions(jsonRequest(decisionsUrl, 'POST', body, decoy.token))).status, 404);
    const decoyList = await getDecisions(getRequest(`${decisionsUrl}?snapshotId=${snapshotId}`, decoy.token));
    assert.equal(decoyList.status, 200);
    assert.deepEqual((await decoyList.json()).decisions, []);
  });

  await t.test('motivos obligatorios; la alternativa debe pertenecer al snapshot', async () => {
    const base = {
      idempotencyKey: `it-dcn-mot-${randomUUID()}`,
      snapshotId,
      editionId: 'ed-dcn-aaa-elegible',
      verdict: 'discarded',
      conditions: [],
      campaignDraft: null,
    };
    const sinMotivos = await postDecisions(jsonRequest(decisionsUrl, 'POST', { ...base, reasons: [] }, real.token));
    assert.equal(sinMotivos.status, 400);
    assert.match(String((await sinMotivos.json()).message), /motivos/i);

    const fueraDelSnapshot = await postDecisions(
      jsonRequest(decisionsUrl, 'POST', { ...base, reasons: ['motivo'], editionId: 'ed-dcn-inexistente' }, real.token),
    );
    assert.equal(fueraDelSnapshot.status, 400);
    assert.match(String((await fueraDelSnapshot.json()).message), /no es una alternativa/i);
  });

  await t.test('elegir con costo pendiente → elección condicional guardada con su campaña (una transacción)', async () => {
    const body = {
      idempotencyKey: `it-dcn-chosen-${randomUUID()}`,
      snapshotId,
      editionId: 'ed-dcn-bbb-condicionada',
      verdict: 'chosen',
      reasons: ['audiencia afín declarada y fecha dentro de la ventana'],
      conditions: [
        {
          snapshotConditionId: null,
          pendingItem: 'Costo del tier community',
          question: '¿Cuál es la tarifa del tier community y qué incluye?',
          expectedAnswer: 'Una tarifa total ≤ USD 2000',
          effect: 'discarded',
          owner: 'growth',
          dueBy: '2026-10-01',
        },
      ],
      campaignDraft: null,
    };
    const response = await postDecisions(jsonRequest(decisionsUrl, 'POST', body, real.token));
    assert.equal(response.status, 201);
    const read = (await response.json()) as DecisionRead & { deduplicated: boolean };
    chosenRead = read;

    // La respuesta contiene decisión, snapshot, autor, condiciones y campaña
    // con sus IDs (demostración del ticket).
    assert.equal(read.snapshotId, snapshotId);
    assert.equal(read.editionId, 'ed-dcn-bbb-condicionada');
    assert.equal(read.decision.verdict, 'chosen');
    assert.deepEqual(read.decision.decidedBy, { userId: real.userId, resolvedBy: 'server_session' });
    assert.ok(read.decisionId.length > 0 && read.decision.id.length > 0);
    assert.ok(read.campaign && read.campaign.id.length > 0 && read.campaign.decisionId === read.decisionId);

    // Condición registrada: pregunta, respuesta esperada, efecto, responsable
    // y plazo quedan guardados (y no se envía ningún mensaje).
    const propia = read.decision.conditions.find((c) => c.owner === 'growth');
    assert.ok(propia);
    assert.match(propia!.description, /Costo del tier community — Pregunta al organizador: ¿Cuál es la tarifa del tier community y qué incluye\? — Respuesta esperada: Una tarifa total ≤ USD 2000/);
    assert.equal(propia!.answerWouldChangeTo, 'discarded');
    assert.equal(propia!.dueBy, '2026-10-01');
    assert.equal(propia!.status, 'open');

    // Elección con acceso y costo pendientes = CONDICIONAL: las condiciones
    // del snapshot se conservan abiertas en la decisión.
    const snapshotConditions = byEdition.get('ed-dcn-bbb-condicionada')!.conditions;
    assert.ok(snapshotConditions.length >= 2, 'la alternativa condicionada tiene pendientes en el snapshot');
    for (const condition of snapshotConditions) {
      const kept = read.decision.conditions.find((c) => c.id === condition.id);
      assert.ok(kept, `la condición del snapshot «${condition.id}» se conserva en la decisión`);
      assert.equal(kept!.status, 'open');
    }
    const openCount = read.decision.conditions.filter((c) => c.status === 'open').length;
    assert.ok(openCount >= 3, 'elegida con condiciones abiertas → sigue siendo condicional');

    // El borrador compuesto conserva la incertidumbre: la partida pendiente
    // queda unknown (jamás 0), el objetivo provisional queda «por confirmar»
    // (D1) y no existe costo total ni ROI.
    const partida = read.campaign!.costItems.find((item) => item.label === 'sponsorship');
    assert.ok(partida);
    assert.equal(partida!.amount.status, 'unknown');
    assert.match(read.campaign!.objective, /por confirmar/);
    assert.equal(read.campaign!.successDefinition, null);
    assert.deepEqual(read.campaign!.modality, { status: 'pending' });
    assert.ok(!('totalCostUsd' in read.campaign!) && !('roi' in read.campaign!));

    // Consenso/confianza del store en memoria: no existen en el registro.
    assert.ok(!JSON.stringify(read).includes('consensus') && !JSON.stringify(read).includes('confidenceDelta'));

    // Autor persistido desde la sesión (columna, no payload del cliente).
    const { rows } = await admin.query('select decided_by, verdict from growthx.decisions where id = $1', [read.decision.id]);
    assert.equal(rows[0].decided_by, real.userId);

    // GET /api/decisions/:id: lectura persistida idéntica.
    const reread = await getDecision(getRequest(`${decisionsUrl}/${read.decisionId}`, real.token), idParams(read.decisionId));
    assert.equal(reread.status, 200);
    const stored: Partial<typeof read> = { ...read };
    delete stored.deduplicated;
    assert.deepEqual(await reread.json(), stored, 'la lectura devuelve lo guardado');
  });

  await t.test('idempotencia: misma clave+payload → misma decisión; otra clave/payload → conflicto', async () => {
    const body = {
      idempotencyKey: `it-dcn-idem-${randomUUID()}`,
      snapshotId,
      editionId: 'ed-dcn-bbb-condicionada',
      verdict: 'chosen',
      reasons: ['audiencia afín declarada y fecha dentro de la ventana'],
      conditions: [],
      campaignDraft: null,
    };
    // La alternativa ya está decidida: otra clave sobre la misma alternativa
    // devuelve conflicto apuntando a la decisión existente (se revisa, no se
    // duplica).
    const otraClave = await postDecisions(jsonRequest(decisionsUrl, 'POST', body, real.token));
    assert.equal(otraClave.status, 409);
    const conflictPayload = await otraClave.json();
    assert.equal(conflictPayload.decisionId, chosenRead.decisionId);

    // Repetir EXACTAMENTE la aceptación original (misma clave + payload) es
    // idempotente: misma decisión, sin duplicar.
    const originalKey = `it-dcn-original-${randomUUID()}`;
    const pendingBody = {
      idempotencyKey: originalKey,
      snapshotId,
      editionId: 'ed-dcn-aaa-elegible',
      verdict: 'pending',
      reasons: ['esperamos la respuesta del organizador antes de decidir'],
      conditions: [],
      campaignDraft: null,
    };
    const first = await postDecisions(jsonRequest(decisionsUrl, 'POST', pendingBody, real.token));
    assert.equal(first.status, 201);
    const firstRead = (await first.json()) as DecisionRead;
    const retry = await postDecisions(jsonRequest(decisionsUrl, 'POST', pendingBody, real.token));
    assert.equal(retry.status, 200);
    const retryRead = (await retry.json()) as DecisionRead & { deduplicated: boolean };
    assert.equal(retryRead.deduplicated, true);
    assert.equal(retryRead.decisionId, firstRead.decisionId);
    const { rows } = await admin.query('select count(*) from growthx.decisions where snapshot_id = $1 and edition_id = $2', [snapshotId, 'ed-dcn-aaa-elegible']);
    assert.equal(Number(rows[0].count), 1);

    // Misma clave con OTRO payload → conflicto, no una decisión distinta.
    const conflicting = await postDecisions(
      jsonRequest(decisionsUrl, 'POST', { ...pendingBody, reasons: ['otro motivo'] }, real.token),
    );
    assert.equal(conflicting.status, 409);
  });

  await t.test('excluido por restricción confirmada: no se elige con un click; sí se registra descarte o pendiente', async () => {
    const chosenBody = {
      idempotencyKey: `it-dcn-exc-${randomUUID()}`,
      snapshotId,
      editionId: 'ed-dcn-ccc-sobre-presupuesto',
      verdict: 'chosen',
      reasons: ['nos gusta igual'],
      conditions: [],
      campaignDraft: null,
    };
    const rejected = await postDecisions(jsonRequest(decisionsUrl, 'POST', chosenBody, real.token));
    assert.equal(rejected.status, 409);
    assert.match(String((await rejected.json()).message), /nueva evidencia y una reevaluación/i);
    const { rows: none } = await admin.query('select count(*) from growthx.decisions where snapshot_id = $1 and edition_id = $2', [snapshotId, 'ed-dcn-ccc-sobre-presupuesto']);
    assert.equal(Number(none[0].count), 0, 'el rechazo no persiste nada');

    // Descartarlo con su motivo propio SÍ se registra — motivo de la
    // decisión, no un resultado observado del evento.
    const discarded = await postDecisions(
      jsonRequest(
        decisionsUrl,
        'POST',
        {
          idempotencyKey: `it-dcn-exc-desc-${randomUUID()}`,
          snapshotId,
          editionId: 'ed-dcn-ccc-sobre-presupuesto',
          verdict: 'discarded',
          reasons: ['la partida publicada excede el presupuesto declarado del perfil'],
          conditions: [],
          campaignDraft: null,
        },
        real.token,
      ),
    );
    assert.equal(discarded.status, 201);
    const discardedRead = (await discarded.json()) as DecisionRead;
    assert.equal(discardedRead.campaign, null);

    // Descartar o pendiente NO crea campaña; el borrador solo acompaña a una
    // elección (y colarlo en un descarte es 400).
    const conCampania = await postDecisions(
      jsonRequest(
        decisionsUrl,
        'POST',
        {
          idempotencyKey: `it-dcn-exc-camp-${randomUUID()}`,
          snapshotId,
          editionId: 'ed-dcn-aaa-elegible',
          verdict: 'discarded',
          reasons: ['motivo'],
          conditions: [],
          campaignDraft: { objective: 'x', successDefinition: null, modality: null, costItems: null, openQuestions: null, commitments: [] },
        },
        real.token,
      ),
    );
    assert.equal(conCampania.status, 400);
    const { rows: campaigns } = await admin.query('select count(*) from growthx.campaign_drafts where tenant_id = $1', [real.tenantId]);
    assert.equal(Number(campaigns[0].count), 1, 'solo la elección tiene borrador');
  });

  await t.test('dos pestañas no se sobrescriben: la revisión esperada obsoleta devuelve conflicto y las revisiones se conservan', async () => {
    const target = chosenRead.decision.conditions.find((c) => c.owner === 'growth')!;
    // Pestaña A resuelve la condición sobre la revisión 1.
    const revised = await patchDecision(
      jsonRequest(
        `${decisionsUrl}/${chosenRead.decisionId}`,
        'PATCH',
        { expectedRevision: 1, resolveConditions: [{ conditionId: target.id, resolvedNote: 'el organizador publicó tier community de USD 1200' }] },
        real.token,
      ),
      idParams(chosenRead.decisionId),
    );
    assert.equal(revised.status, 200);
    const revisedRead = (await revised.json()) as DecisionRead;
    assert.equal(revisedRead.decision.revision, 2);
    assert.equal(revisedRead.decision.previousRevisionId, chosenRead.decision.id);
    const resolved = revisedRead.decision.conditions.find((c) => c.id === target.id)!;
    assert.equal(resolved.status, 'resolved');
    assert.match(resolved.resolvedNote ?? '', /USD 1200/);

    // Pestaña B llega tarde con la MISMA revisión esperada: conflicto — los
    // motivos guardados no se sobrescriben en silencio.
    const stale = await patchDecision(
      jsonRequest(
        `${decisionsUrl}/${chosenRead.decisionId}`,
        'PATCH',
        { expectedRevision: 1, reasons: ['motivos de la pestaña B'] },
        real.token,
      ),
      idParams(chosenRead.decisionId),
    );
    assert.equal(stale.status, 409);
    const stalePayload = await stale.json();
    assert.equal(stalePayload.currentRevision, 2);

    // Las revisiones anteriores se conservan (append-only): la revisión 1
    // sigue con su condición abierta y sus motivos originales.
    const reread = await getDecision(getRequest(`${decisionsUrl}/${chosenRead.decisionId}`, real.token), idParams(chosenRead.decisionId));
    const rereadPayload = (await reread.json()) as DecisionRead;
    assert.equal(rereadPayload.revisions.length, 2);
    assert.equal(rereadPayload.revisions[0].conditions.find((c) => c.id === target.id)!.status, 'open');
    assert.deepEqual(rereadPayload.revisions[0].reasons, chosenRead.decision.reasons);
    assert.deepEqual(rereadPayload.decision.reasons, chosenRead.decision.reasons, 'la pestaña B no tocó los motivos');

    // Resolver la MISMA condición otra vez no suma nada: se rechaza.
    const again = await patchDecision(
      jsonRequest(
        `${decisionsUrl}/${chosenRead.decisionId}`,
        'PATCH',
        { expectedRevision: 2, resolveConditions: [{ conditionId: target.id, resolvedNote: 'confirmado de nuevo' }] },
        real.token,
      ),
      idParams(chosenRead.decisionId),
    );
    assert.equal(again.status, 400);
    assert.match(String((await again.json()).message), /ya está resuelta/i);

    // La campaña de la elección sigue viva tras la revisión, con la MISMA
    // identidad (no se re-crea una campaña por revisión de motivos).
    assert.ok(revisedRead.campaign);
    assert.equal(revisedRead.campaign!.id, chosenRead.campaign!.id);

    // Elegir el excluido tampoco entra por la puerta de PATCH.
    const { rows } = await admin.query("select decision_id from growthx.decisions where snapshot_id = $1 and edition_id = 'ed-dcn-ccc-sobre-presupuesto' and revision = 1", [snapshotId]);
    const excludedDecisionId = rows[0].decision_id as string;
    const chooseExcluded = await patchDecision(
      jsonRequest(`${decisionsUrl}/${excludedDecisionId}`, 'PATCH', { expectedRevision: 1, verdict: 'chosen' }, real.token),
      idParams(excludedDecisionId),
    );
    assert.equal(chooseExcluded.status, 409);
  });

  await t.test('razones distintas por alternativa; decidir no fabrica claims ni evidencia', async () => {
    const list = await getDecisions(getRequest(`${decisionsUrl}?snapshotId=${snapshotId}`, real.token));
    assert.equal(list.status, 200);
    const { decisions } = (await list.json()) as { decisions: DecisionRead[] };
    assert.equal(decisions.length, 3, 'una decisión por alternativa decidida');
    const reasonsByEdition = new Map(decisions.map((d) => [d.editionId, d.decision.reasons]));
    assert.notDeepEqual(reasonsByEdition.get('ed-dcn-bbb-condicionada'), reasonsByEdition.get('ed-dcn-ccc-sobre-presupuesto'));
    // Los motivos viven SOLO en la decisión: ninguna operación de decisión
    // creó revisiones de claims (no son resultados observados del evento).
    const claimCountAfter = Number(
      (await admin.query('select count(*) from growthx.claim_revisions where tenant_id = $1', [real.tenantId])).rows[0].count,
    );
    assert.equal(claimCountAfter, claimCountBefore);
  });

  await t.test('guardar un organizador conserva una investigación: no crea inversión ni campaña', async () => {
    await processEvaluationRun({ runId: profileRunId, tenantId: real.tenantId }, { pool: workerPool });
    const decisionsBefore = Number((await admin.query('select count(*) from growthx.decisions where tenant_id = $1', [real.tenantId])).rows[0].count);
    const campaignsBefore = Number((await admin.query('select count(*) from growthx.campaign_drafts where tenant_id = $1', [real.tenantId])).rows[0].count);
    const saved = await saveOrganizerResearch(real.tenantId, real.userId, profileRunId, 'org-dcn-activo');
    assert.ok(saved, 'el organizador se guarda para investigar');
    assert.equal(saved!.state, 'pending_research');
    const decisionsAfter = Number((await admin.query('select count(*) from growthx.decisions where tenant_id = $1', [real.tenantId])).rows[0].count);
    const campaignsAfter = Number((await admin.query('select count(*) from growthx.campaign_drafts where tenant_id = $1', [real.tenantId])).rows[0].count);
    assert.equal(decisionsAfter, decisionsBefore);
    assert.equal(campaignsAfter, campaignsBefore);
  });

  await t.test('rollback conjunto: una caída al confirmar la campaña no deja decisión suelta', async () => {
    const second = await runComparison(['ed-dcn-aaa-elegible', 'ed-dcn-bbb-condicionada']);
    assert.notEqual(second.snapshotId, snapshotId, 'una reevaluación crea otro snapshot');

    // Pool envenenado: el INSERT del borrador de campaña falla DENTRO de la
    // transacción — la revisión de decisión ya insertada debe revertirse.
    const poisonedPool = {
      connect: async () => {
        const client = await appPool.connect();
        return new Proxy(client, {
          get(target, prop, receiver) {
            if (prop === 'query') {
              return (text: unknown, params?: unknown) => {
                if (typeof text === 'string' && text.includes('growthx.campaign_drafts'))
                  throw new Error('inyección de fallo: caída antes de confirmar la campaña');
                return (target as unknown as { query: (t: unknown, p?: unknown) => unknown }).query(text, params);
              };
            }
            return Reflect.get(target, prop, receiver);
          },
        });
      },
    } as unknown as pg.Pool;

    const body = {
      idempotencyKey: `it-dcn-roll-${randomUUID()}`,
      snapshotId: second.snapshotId,
      editionId: 'ed-dcn-aaa-elegible',
      verdict: 'chosen' as const,
      reasons: ['única elegible con costo publicado dentro del presupuesto'],
      conditions: [],
      campaignDraft: null,
    };
    await assert.rejects(
      saveDecision(poisonedPool, { tenantId: real.tenantId, userId: real.userId }, body),
      /caída antes de confirmar la campaña/,
    );
    const { rows: after } = await admin.query('select count(*) from growthx.decisions where snapshot_id = $1', [second.snapshotId]);
    assert.equal(Number(after[0].count), 0, 'ni decisión ni campaña: todo o nada');

    // El mismo cuerpo por la vía sana confirma decisión Y campaña juntas —
    // esta vez con la partida publicada como quoted con su fuente.
    const ok = await postDecisions(jsonRequest(decisionsUrl, 'POST', body, real.token));
    assert.equal(ok.status, 201);
    const okRead = (await ok.json()) as DecisionRead;
    assert.ok(okRead.campaign);
    const partida = okRead.campaign!.costItems.find((item) => item.label === 'sponsorship')!;
    assert.deepEqual(partida.amount, { status: 'quoted', amount: 1500, currency: 'USD', sourceIds: ['src-dcn-tarifa'] });

    // Acuerdo sin soporte completo rechazado: «acordado» exige método,
    // evidencia, quién confirmó y cuándo — juntos.
    const agreedBase = {
      description: 'Logo en el sitio del evento',
      kind: 'agreed' as const,
      owner: 'organizador',
      dueBy: '2026-10-20',
    };
    const sinConfirmacion = await patchDecision(
      jsonRequest(
        `${decisionsUrl}/${okRead.decisionId}`,
        'PATCH',
        { expectedRevision: 1, campaignDraft: { objective: null, successDefinition: null, modality: null, costItems: null, openQuestions: null, commitments: [{ ...agreedBase, confirmation: null }] } },
        real.token,
      ),
      idParams(okRead.decisionId),
    );
    assert.equal(sinConfirmacion.status, 400);
    assert.match(String((await sinConfirmacion.json()).message), /acordado/i);

    const sinQuien = await patchDecision(
      jsonRequest(
        `${decisionsUrl}/${okRead.decisionId}`,
        'PATCH',
        { expectedRevision: 1, campaignDraft: { objective: null, successDefinition: null, modality: null, costItems: null, openQuestions: null, commitments: [{ ...agreedBase, confirmation: { method: 'email', sourceIds: ['src-dcn-luma'] } }] } },
        real.token,
      ),
      idParams(okRead.decisionId),
    );
    assert.equal(sinQuien.status, 400);
    assert.match(String((await sinQuien.json()).message), /confirmedBy/);

    const completo = await patchDecision(
      jsonRequest(
        `${decisionsUrl}/${okRead.decisionId}`,
        'PATCH',
        {
          expectedRevision: 1,
          campaignDraft: {
            objective: null,
            successDefinition: null,
            modality: { kind: 'sponsorship', detail: 'tier community' },
            costItems: null,
            openQuestions: null,
            commitments: [
              { description: 'Esperamos ~40 conversaciones con candidatos', kind: 'estimate', owner: null, dueBy: null, confirmation: null },
              { ...agreedBase, confirmation: { method: 'email de confirmación del organizador', sourceIds: ['src-dcn-luma'], confirmedBy: 'organizadora (DCN)', confirmedAt: '2026-09-18T18:00:00Z' } },
            ],
          },
        },
        real.token,
      ),
      idParams(okRead.decisionId),
    );
    assert.equal(completo.status, 200);
    const completoRead = (await completo.json()) as DecisionRead;
    assert.equal(completoRead.campaign!.id, okRead.campaign!.id, 'la identidad de la campaña se conserva entre revisiones');
    const acordado = completoRead.campaign!.commitments.find((c) => c.kind === 'agreed')!;
    assert.equal(acordado.confirmation!.confirmedBy, 'organizadora (DCN)');
    // Los fallos de arriba no dejaron revisiones a medias: revisión 2 exacta.
    assert.equal(completoRead.decision.revision, 2);
  });

  await t.test('tenant señuelo: la decisión real no existe para él, ni por ruta ni por SQL de aplicación', async () => {
    const byDecoy = await getDecision(getRequest(`${decisionsUrl}/${chosenRead.decisionId}`, decoy.token), idParams(chosenRead.decisionId));
    assert.equal(byDecoy.status, 404);
    const patchByDecoy = await patchDecision(
      jsonRequest(`${decisionsUrl}/${chosenRead.decisionId}`, 'PATCH', { expectedRevision: 2, reasons: ['intruso'] }, decoy.token),
      idParams(chosenRead.decisionId),
    );
    assert.equal(patchByDecoy.status, 404);

    // SQL de aplicación bajo el contexto del señuelo: cero filas (RLS).
    const appClient = await appPool.connect();
    try {
      await appClient.query('begin');
      await appClient.query("select set_config('growthx.tenant_id', $1, true)", [decoy.tenantId]);
      const { rows } = await appClient.query('select count(*) from growthx.decisions');
      assert.equal(Number(rows[0].count), 0);
      await appClient.query('rollback');
    } finally {
      appClient.release();
    }
  });
});
