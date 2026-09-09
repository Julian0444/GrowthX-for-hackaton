// Ticket 09 — catálogo curado y dossiers persistidos, contra PostgreSQL REAL
// (contenedor local: pnpm db:up && pnpm db:migrate). Sin base disponible la
// suite se salta con aviso (la durabilidad no se simula con mocks).
//
// Cubre: importación interna idempotente (manifiesto completo y entidad por
// entidad), inmutabilidad con conflicto declarado, corrección como revisión
// nueva que conserva la anterior, contradicción entre dos fuentes con ambas
// revisiones visibles, homónimos sin fusionar, coorganizador que no hereda
// eventos ajenos, rol ambiguo (logo_present), resultado comercial ausente,
// fuente replicada sin duplicar, integridad de tenant (rutas, RLS y
// restricciones compuestas) y cambio de vigencia con reloj controlado (el
// catálogo vencido se declara; no se rellena con seeds).
//
// Las fixtures son SINTÉTICAS y etiquetadas (fixture-manifest.ts): prueban el
// mecanismo y no acreditan la revisión de eventos reales (D4).

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

import {
  projectEditionDossierView,
  projectOrganizerDossierView,
} from '../../lib/api/opportunity-adapter.ts';
import type { EditionDossierRead, OrganizerDossierRead } from '../../lib/api/atlas-client.ts';
import { hashSessionToken, SESSION_COOKIE } from '../../lib/server/auth/session.ts';
import { FIXTURE_CURATION_MANIFEST } from '../../lib/server/catalog/fixture-manifest.ts';
import { parseCurationManifest, type CurationManifest } from '../../lib/server/catalog/manifest.ts';
import { listCatalogEditions, readOrganizerDossier } from '../../lib/server/catalog/read.ts';
import { researchPersistedCatalog } from '../../lib/server/catalog/research.ts';
import { loadCuratedCatalog } from '../../lib/server/catalog/store.ts';
import { closePools, getAppPool, getWorkerPool, withTenantTransaction } from '../../lib/server/db/pool.ts';
import { runMigrations } from '../../lib/server/db/migrate.ts';

// Handlers HTTP reales (import dinámico por el gancho de next/server).
const routesPromise = (async () => {
  const [catalogList, catalogItem, organizerItem] = await Promise.all([
    import('../../app/api/catalog/editions/route.ts'),
    import('../../app/api/catalog/editions/[id]/route.ts'),
    import('../../app/api/organizers/[id]/route.ts'),
  ]);
  return {
    getCatalog: catalogList.GET,
    getEdition: catalogItem.GET,
    getOrganizer: organizerItem.GET,
  };
})();

// Instantes controlados alrededor de ed-ml-night-2026 (2026-10-01, día sin
// zona): vigente en T1, vencido en T2; en T3 todo el catálogo está vencido.
const T1 = '2026-09-08T12:00:00Z';
const T2 = '2026-10-15T12:00:00Z';
const T3 = '2028-01-01T00:00:00Z';

function cloneFixtureManifest(): CurationManifest {
  const parsed = parseCurationManifest(JSON.parse(JSON.stringify(FIXTURE_CURATION_MANIFEST)));
  if (!parsed.ok) {
    throw new Error(
      `fixture inválido: ${parsed.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ')}`,
    );
  }
  return parsed.manifest;
}

function emptyManifest(name: string): CurationManifest {
  return {
    manifestVersion: '1',
    name,
    material: 'synthetic',
    authorizedBy: 'Curaduría sintética (test)',
    verifiedAt: '2026-09-08T01:00:00Z',
    note: 'manifiesto sintético de test',
    sources: [],
    companies: [],
    organizers: [],
    editions: [],
    participations: [],
    claims: [],
  };
}

function getRequest(path: string, token?: string): Request {
  return new Request(`http://localhost${path}`, {
    headers: token ? { cookie: `${SESSION_COOKIE}=${token}` } : {},
  });
}

interface Seeded {
  tenantId: string;
  userId: string;
  token: string;
}

async function seedTenant(admin: pg.Client, label: string): Promise<Seeded> {
  const slug = `cd-${label}-${randomUUID().slice(0, 8)}`;
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

// ============ Parseo estricto del manifiesto (sin base) ============

test('curated-manifest: parseo estricto del manifiesto de curación', async (t) => {
  await t.test('el manifiesto fixture valida completo', () => {
    const parsed = parseCurationManifest(JSON.parse(JSON.stringify(FIXTURE_CURATION_MANIFEST)));
    assert.equal(parsed.ok, true);
  });

  await t.test('clave desconocida y responsable ausente se rechazan', () => {
    const base = JSON.parse(JSON.stringify(FIXTURE_CURATION_MANIFEST)) as Record<string, unknown>;
    const withExtra = { ...base, scraper: 'no' };
    const extra = parseCurationManifest(withExtra);
    assert.equal(extra.ok, false);
    if (!extra.ok) assert.ok(extra.issues.some((issue) => issue.path === '$.scraper'));

    const withoutResponsible = { ...base } as Record<string, unknown>;
    delete withoutResponsible.authorizedBy;
    const missing = parseCurationManifest(withoutResponsible);
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.ok(missing.issues.some((issue) => issue.path === '$.authorizedBy'));
  });

  await t.test('extracto sobredimensionado y claim de perfil se rechazan', () => {
    const oversized = JSON.parse(JSON.stringify(FIXTURE_CURATION_MANIFEST)) as typeof FIXTURE_CURATION_MANIFEST;
    oversized.sources[0].content = { kind: 'excerpt', excerpt: 'x'.repeat(700) };
    const tooLong = parseCurationManifest(oversized);
    assert.equal(tooLong.ok, false);
    if (!tooLong.ok) assert.ok(tooLong.issues.some((issue) => /hash en vez de republicar/.test(issue.message)));

    const profileClaim = JSON.parse(JSON.stringify(FIXTURE_CURATION_MANIFEST)) as typeof FIXTURE_CURATION_MANIFEST;
    profileClaim.claims[0] = {
      ...profileClaim.claims[0],
      subject: { type: 'profile', profileId: 'p1' },
    };
    const rejected = parseCurationManifest(profileClaim);
    assert.equal(rejected.ok, false);
    if (!rejected.ok) assert.ok(rejected.issues.some((issue) => /no afirma sobre perfiles/.test(issue.message)));
  });

  await t.test('la versión desconocida no se interpreta como la actual', () => {
    const base = JSON.parse(JSON.stringify(FIXTURE_CURATION_MANIFEST)) as Record<string, unknown>;
    base.manifestVersion = '2';
    const parsed = parseCurationManifest(base);
    assert.equal(parsed.ok, false);
    if (!parsed.ok) {
      assert.equal(parsed.issues.length, 1);
      assert.equal(parsed.issues[0].path, '$.manifestVersion');
    }
  });
});

// ============ Recorrido completo contra PostgreSQL real ============

test('curated-dossier: catálogo curado y dossiers persistidos (PostgreSQL real)', async (t) => {
  const admin = await probeDatabase();
  if (!admin) {
    t.skip('PostgreSQL no disponible; arrancá la base con `pnpm db:up && pnpm db:migrate` (frontend/db/README.md)');
    return;
  }
  t.after(async () => {
    await closePools();
    await admin.end();
  });

  await runMigrations();
  const { getCatalog, getEdition, getOrganizer } = await routesPromise;
  const real = await seedTenant(admin, 'real');
  const decoy = await seedTenant(admin, 'decoy');
  const appPool = getAppPool();

  const countRows = async (table: string, tenantId: string): Promise<number> => {
    const { rows } = await admin.query(
      `select count(*)::int as n from growthx.${table} where tenant_id = $1`,
      [tenantId],
    );
    return rows[0].n as number;
  };

  await t.test('carga autorizada: el manifiesto fixture entra completo bajo el tenant real', async () => {
    const summary = await loadCuratedCatalog(appPool, real.tenantId, cloneFixtureManifest());
    assert.equal(summary.status, 'loaded');
    assert.equal(summary.material, 'synthetic');
    assert.deepEqual(summary.counts.sources, { inserted: 9, unchanged: 0 });
    assert.deepEqual(summary.counts.companies, { inserted: 2, unchanged: 0 });
    assert.deepEqual(summary.counts.organizerRevisions, { inserted: 4, unchanged: 0 });
    assert.deepEqual(summary.counts.editionRevisions, { inserted: 5, unchanged: 0 });
    assert.deepEqual(summary.counts.participationRevisions, { inserted: 2, unchanged: 0 });
    assert.deepEqual(summary.counts.claimRevisions, { inserted: 9, unchanged: 0 });
    const { rows } = await admin.query(
      'select material, authorized_by from growthx.catalog_loads where tenant_id = $1',
      [real.tenantId],
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].material, 'synthetic');
    assert.match(String(rows[0].authorized_by), /Curaduría sintética/);
  });

  await t.test('idempotencia: repetir la carga no duplica eventos ni revisiones', async () => {
    const before = await countRows('edition_revisions', real.tenantId);
    const summary = await loadCuratedCatalog(appPool, real.tenantId, cloneFixtureManifest());
    assert.equal(summary.status, 'already_loaded');
    assert.equal(await countRows('edition_revisions', real.tenantId), before);
    assert.equal(await countRows('claim_revisions', real.tenantId), 9);
    assert.equal(await countRows('catalog_loads', real.tenantId), 1);
  });

  await t.test('fuente replicada e inmutabilidad: mismo id sin cambios pasa; con cambios se rechaza entero', async () => {
    // Manifiesto que replica una fuente ya cargada, idéntica → unchanged.
    const replicated = emptyManifest('replica-fuente');
    replicated.sources = [cloneFixtureManifest().sources[0]];
    const okSummary = await loadCuratedCatalog(appPool, real.tenantId, replicated);
    assert.equal(okSummary.status, 'loaded');
    assert.deepEqual(okSummary.counts.sources, { inserted: 0, unchanged: 1 });
    assert.equal(await countRows('sources', real.tenantId), 9, 'la fuente replicada no se duplica');

    // Misma identidad con OTRO contenido: se rechaza y la transacción entera
    // se revierte (no queda ni la carga ni nada a medias).
    const mutated = cloneFixtureManifest();
    mutated.name = 'fixture-mutado';
    mutated.claims = mutated.claims.map((claim) =>
      claim.id === 'clm-summit-access-r1'
        ? { ...claim, value: { kind: 'text', text: 'Otro texto para la misma revisión' } }
        : claim,
    );
    const loadsBefore = await countRows('catalog_loads', real.tenantId);
    await assert.rejects(
      loadCuratedCatalog(appPool, real.tenantId, mutated),
      /una revisión es inmutable/,
    );
    assert.equal(await countRows('catalog_loads', real.tenantId), loadsBefore, 'rollback completo');
    assert.equal(await countRows('claim_revisions', real.tenantId), 9);
  });

  await t.test('una corrección es una revisión NUEVA que conserva la anterior', async () => {
    const correction = emptyManifest('correccion-org-bay');
    correction.organizers = [
      {
        contractVersion: '1',
        id: 'org-bay-builders-r2',
        organizerId: 'org-bay-builders',
        displayName: 'Bay Builders Collective (synthetic, nombre corregido)',
        aliases: [
          // El alias pasa de propuesto a CONFIRMADO con soporte ya cargado.
          { alias: 'BayBuilders SF', confirmation: 'confirmed', sourceIds: ['src-organizer-site-a'] },
        ],
        claimRevisionIds: [],
        revisedAt: '2026-09-08T02:00:00Z',
        previousRevisionId: 'org-bay-builders-r1',
      },
    ];
    const summary = await loadCuratedCatalog(appPool, real.tenantId, correction);
    assert.deepEqual(summary.counts.organizerRevisions, { inserted: 1, unchanged: 0 });

    const dossier = await readOrganizerDossier(appPool, real.tenantId, 'org-bay-builders', T1);
    assert.ok(dossier);
    assert.equal(dossier.organizerRevisions.length, 2, 'ambas revisiones presentes');
    assert.deepEqual(
      dossier.organizerRevisions.map((revision) => revision.id),
      ['org-bay-builders-r1', 'org-bay-builders-r2'],
      'cadena ordenada: la corrección no borra la revisión anterior',
    );
    assert.match(dossier.organizerRevisions[1].displayName, /nombre corregido/);
  });

  await t.test('rutas: sin sesión 401; id inválido 400', async () => {
    const anonymous = await getCatalog(getRequest('/api/catalog/editions'));
    assert.equal(anonymous.status, 401);
    const badId = await getEdition(getRequest('/api/catalog/editions/..%2Fx', real.token), {
      params: Promise.resolve({ id: '../x' }),
    });
    assert.equal(badId.status, 400);
    const badOrganizer = await getOrganizer(getRequest('/api/organizers/!', real.token), {
      params: Promise.resolve({ id: '!' }),
    });
    assert.equal(badOrganizer.status, 400);
  });

  await t.test('la lista del catálogo separa vigencia de promesas pendientes', async () => {
    const response = await getCatalog(getRequest('/api/catalog/editions', real.token));
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      editions: {
        editionId: string;
        validity: { validity: string };
        pendingAttributes: string[];
        curation: { material: string; authorizedBy: string } | null;
      }[];
      note: string | null;
    };
    assert.equal(body.editions.length, 5);
    const summit = body.editions.find((edition) => edition.editionId === 'ed-sf-dev-summit-2027');
    assert.ok(summit);
    // «Evento futuro verificado» ≠ «todas sus promesas confirmadas»: el costo
    // sigue pendiente y visible.
    assert.ok(summit.pendingAttributes.includes('cost:sponsorship'));
    assert.equal(summit.curation?.material, 'synthetic');
    const berlin = body.editions.find((edition) => edition.editionId === 'ed-builders-berlin-2025');
    assert.equal(berlin?.validity.validity, 'past');
    const roadshow = body.editions.find((edition) => edition.editionId === 'ed-us-roadshow-2027');
    assert.ok(roadshow?.pendingAttributes.includes('city'), 'alcance país: ciudad pendiente');
    assert.match(String(body.note), /Material sintético etiquetado/);
  });

  await t.test('dossier de edición: contradicción con ambas revisiones, costo pendiente y fuentes abribles', async () => {
    const response = await getEdition(getRequest('/api/catalog/editions/ed-sf-dev-summit-2027', real.token), {
      params: Promise.resolve({ id: 'ed-sf-dev-summit-2027' }),
    });
    assert.equal(response.status, 200);
    const read = (await response.json()) as EditionDossierRead;

    const audience = read.claims.find((claim) => claim.claimId === 'clm-summit-aud');
    assert.ok(audience);
    assert.equal(audience.revisions.length, 2, 'la contradicción conserva la revisión anterior');
    assert.equal(audience.revisions[1].status, 'contradicted');
    assert.deepEqual(audience.revisions[1].sourceIds, ['src-organizer-site-a', 'src-community-report']);
    const sourceIds = read.sources.map((source) => source.id);
    assert.ok(sourceIds.includes('src-organizer-site-a') && sourceIds.includes('src-community-report'));

    const view = projectEditionDossierView(read);
    assert.equal(view.audience.conflict, true);
    assert.equal(view.audience.history.length, 2);
    assert.match(String(view.audience.field.state === 'known' ? view.audience.field.pendingNote : ''), /150 asistentes.*60/);
    assert.equal(view.audience.sources.length, 2, 'ambas fuentes discrepantes abribles');
    // Costo pendiente → pregunta concreta; acceso observado con su fuente.
    const cost = view.costs.find((value) => value.attribute === 'cost:sponsorship');
    assert.ok(cost && cost.field.state === 'pending');
    assert.ok(view.openQuestions.some((question) => /sponsorship items/.test(question)));
    assert.equal(view.access.field.state, 'known');
    assert.equal(view.access.sources[0]?.id, 'src-luma-dev-summit');
    assert.equal(view.access.sources[0]?.url, 'https://luma.example/sf-dev-summit-2027');
    // Fecha y lugar respaldados por claims con fuente del listado.
    assert.equal(view.date.sources[0]?.id, 'src-luma-dev-summit');
    assert.equal(view.location.sources[0]?.id, 'src-luma-dev-summit');
    // La curación de la carga viaja con el dossier.
    assert.equal(view.curation?.material, 'synthetic');
    assert.match(String(view.materialNote), /D4/);
  });

  await t.test('homónimos e independencia: identidades separadas, coorganizador sin herencia', async () => {
    const aResponse = await getOrganizer(getRequest('/api/organizers/org-mission-ai-a', real.token), {
      params: Promise.resolve({ id: 'org-mission-ai-a' }),
    });
    const bResponse = await getOrganizer(getRequest('/api/organizers/org-mission-ai-b', real.token), {
      params: Promise.resolve({ id: 'org-mission-ai-b' }),
    });
    assert.equal(aResponse.status, 200);
    assert.equal(bResponse.status, 200);
    const a = (await aResponse.json()) as OrganizerDossierRead;
    const b = (await bResponse.json()) as OrganizerDossierRead;
    // Mismo displayName, identidades y expedientes DISTINTOS.
    assert.equal(a.organizerRevisions[0].displayName, b.organizerRevisions[0].displayName);
    assert.notEqual(a.organizerId, b.organizerId);
    assert.equal(a.editions.length, 0);
    assert.deepEqual(
      b.editions.map(({ edition }) => edition.editionId),
      ['ed-sf-dev-summit-2027'],
      'el coorganizador solo tiene SU edición: no hereda Berlín ni la trayectoria ajena',
    );

    // Cobertura con reloj controlado: el coorganizador no tiene antecedentes y
    // la insuficiencia se DECLARA, no se fabrica trayectoria.
    const bDossier = await readOrganizerDossier(appPool, real.tenantId, 'org-mission-ai-b', T1);
    assert.ok(bDossier);
    assert.equal(bDossier.coverage.antecedentsDocumented, 0);
    assert.match(String(bDossier.coverage.note), /insuficiencia de cobertura/);

    // Dos organizadores comparables con un antecedente documentado cada uno.
    const bay = await readOrganizerDossier(appPool, real.tenantId, 'org-bay-builders', T1);
    const gg = await readOrganizerDossier(appPool, real.tenantId, 'org-gg-ml', T1);
    assert.equal(bay?.coverage.antecedentsDocumented, 1);
    assert.equal(gg?.coverage.antecedentsDocumented, 1);

    // El antecedente de fuera de SF conserva su geografía.
    const bayView = projectOrganizerDossierView(bay!);
    assert.equal(bayView.antecedents.length, 1);
    assert.equal(bayView.antecedents[0].editionId, 'ed-builders-berlin-2025');
    assert.equal(bayView.antecedents[0].location.state === 'known' ? bayView.antecedents[0].location.display : null, 'Berlin');
    assert.ok(bayView.upcomingEditions.some((edition) => edition.editionId === 'ed-sf-dev-summit-2027'));
  });

  await t.test('participaciones: rol recorrible empresa → edición → fuente; ausencia de resultado ≠ fracaso', async () => {
    const gg = await readOrganizerDossier(appPool, real.tenantId, 'org-gg-ml', T1);
    const ggView = projectOrganizerDossierView(gg!);
    const logo = ggView.participations.find((participation) => participation.participationId === 'part-nimbus-ggml');
    assert.ok(logo);
    assert.equal(logo.role, 'logo_present');
    assert.equal(logo.company.name, 'NimbusDB (synthetic)');
    assert.equal(logo.editionName, 'GG ML Night junio 2025 (synthetic)');
    assert.equal(logo.sources[0]?.id, 'src-logo-wall');
    assert.equal(logo.outcome.state, 'unknown');

    const bay = await readOrganizerDossier(appPool, real.tenantId, 'org-bay-builders', T1);
    const bayView = projectOrganizerDossierView(bay!);
    const sponsor = bayView.participations.find(
      (participation) => participation.participationId === 'part-quiver-berlin',
    );
    assert.ok(sponsor);
    assert.equal(sponsor.role, 'paid_sponsor');
    assert.equal(sponsor.roleStatus, 'reported');
    assert.equal(sponsor.sources[0]?.id, 'src-sponsor-page');
    // Anuncio, ejecución reportada y resultado: tres niveles separados.
    assert.match(String(sponsor.announced), /Anunciada como sponsor/);
    assert.match(String(sponsor.reportedExecution), /booth operativo/);
    assert.equal(sponsor.outcome.state, 'unknown');
    if (sponsor.outcome.state === 'unknown') assert.match(sponsor.outcome.note, /not evidence of failure/);
  });

  await t.test('research persistido: sin catálogo → null (fixture de 08); con catálogo → candidatos vigentes', async () => {
    // El tenant señuelo no cargó catálogo: el worker cae al fixture preparado.
    const none = await researchPersistedCatalog(getWorkerPool(), decoy.tenantId, {
      stack: ['python'],
      evaluationInstant: T1,
    });
    assert.equal(none, null);

    // Con catálogo (rol growthx_worker, solo lectura): candidatos con razones
    // por atributo y pendientes; nunca un índice de confianza.
    const research = await researchPersistedCatalog(getWorkerPool(), real.tenantId, {
      stack: ['python'],
      evaluationInstant: T1,
    });
    assert.ok(research);
    assert.equal(research.kind, 'catalog_research');
    const ids = research.candidates.map((candidate) => candidate.organizerId);
    assert.ok(ids.includes('org-bay-builders') && ids.includes('org-gg-ml'));
    const bay = research.candidates.find((candidate) => candidate.organizerId === 'org-bay-builders')!;
    assert.ok(bay.matchedAttributes.some((reason) => /python/.test(reason)));
    assert.ok(bay.pending.some((pending) => /costo/.test(pending)));
    assert.match(research.catalogNote, /sintético/);
    assert.match(research.catalogNote, /vencieron/);

    // Reloj en T3: todo vencido → límite declarado, sin candidatos y sin seeds.
    const expired = await researchPersistedCatalog(getWorkerPool(), real.tenantId, {
      stack: ['python'],
      evaluationInstant: T3,
    });
    assert.ok(expired);
    assert.equal(expired.candidates.length, 0);
    assert.match(expired.catalogNote, /no se rellena con seeds históricos/);
  });

  await t.test('tenant señuelo: catálogo vacío por RLS y referencias cruzadas rechazadas', async () => {
    // Rutas: el señuelo no ve el catálogo del tenant real.
    const listResponse = await getCatalog(getRequest('/api/catalog/editions', decoy.token));
    assert.equal(listResponse.status, 200);
    const listBody = (await listResponse.json()) as { editions: unknown[]; note: string | null };
    assert.equal(listBody.editions.length, 0);
    assert.match(String(listBody.note), /No hay catálogo curado/);
    const editionResponse = await getEdition(
      getRequest('/api/catalog/editions/ed-sf-dev-summit-2027', decoy.token),
      { params: Promise.resolve({ id: 'ed-sf-dev-summit-2027' }) },
    );
    assert.equal(editionResponse.status, 404, 'sin confirmar existencia ajena');
    const organizerResponse = await getOrganizer(getRequest('/api/organizers/org-bay-builders', decoy.token), {
      params: Promise.resolve({ id: 'org-bay-builders' }),
    });
    assert.equal(organizerResponse.status, 404);

    // SQL de aplicación bajo contexto señuelo: cero filas.
    const underDecoy = await withTenantTransaction(appPool, decoy.tenantId, async (client) => {
      const { rows } = await client.query('select id from growthx.edition_revisions');
      return rows.length;
    });
    assert.equal(underDecoy, 0);

    // Carga señuelo citando una fuente del tenant real: rechazada entera.
    const crossManifest = emptyManifest('decoy-cruzado');
    crossManifest.organizers = [
      {
        contractVersion: '1',
        id: 'org-decoy-r1',
        organizerId: 'org-decoy',
        displayName: 'Decoy Org',
        aliases: [],
        claimRevisionIds: [],
        revisedAt: '2026-09-08T01:00:00Z',
        previousRevisionId: null,
      },
    ];
    crossManifest.claims = [
      {
        contractVersion: '1',
        id: 'clm-decoy-r1',
        claimId: 'clm-decoy',
        subject: { type: 'organizer', organizerId: 'org-decoy' },
        attribute: 'focus',
        value: { kind: 'text', text: 'lo que sea' },
        status: 'announced',
        sourceIds: ['src-luma-dev-summit'], // fuente del OTRO tenant
        method: 'manual_curation',
        note: null,
        reviewer: null,
        reviewedAt: '2026-09-08T01:00:00Z',
        previousRevisionId: null,
      },
    ];
    await assert.rejects(
      loadCuratedCatalog(appPool, decoy.tenantId, crossManifest),
      /fuentes inexistentes bajo el tenant/,
    );
    assert.equal(await countRows('catalog_loads', decoy.tenantId), 0, 'rollback: nada persistido');

    // Restricción compuesta incluso SIN RLS (admin): un vínculo claim→fuente
    // con tenant señuelo no puede apuntar a la fuente del tenant real.
    await assert.rejects(
      admin.query(
        `insert into growthx.claim_revision_sources (tenant_id, claim_revision_id, source_id)
         values ($1, 'clm-summit-aud-r1', 'src-luma-dev-summit')`,
        [decoy.tenantId],
      ),
      /foreign key/i,
    );
  });

  await t.test('reloj controlado: la vigencia cambia al evaluar y el catálogo vencido se declara', async () => {
    const atT1 = await listCatalogEditions(appPool, real.tenantId, T1);
    assert.equal(atT1.upcomingCount, 3);
    assert.equal(
      atT1.editions.find((edition) => edition.editionId === 'ed-ml-night-2026')?.validity.validity,
      'upcoming',
    );

    // El mismo evento, curado como futuro, vence DESPUÉS de la curación y se
    // marca como tal al evaluarlo — sin re-curar nada.
    const atT2 = await listCatalogEditions(appPool, real.tenantId, T2);
    assert.equal(
      atT2.editions.find((edition) => edition.editionId === 'ed-ml-night-2026')?.validity.validity,
      'past',
    );
    assert.equal(atT2.upcomingCount, 2);

    // Catálogo sin opciones vigentes: se declara; los 136 seeds NO aparecen.
    const atT3 = await listCatalogEditions(appPool, real.tenantId, T3);
    assert.equal(atT3.upcomingCount, 0);
    assert.match(String(atT3.note), /no se rellena con seeds históricos/);
    assert.equal(atT3.editions.length, 5, 'siguen siendo solo las ediciones curadas');
    assert.ok(atT3.editions.every((edition) => edition.editionId.startsWith('ed-')));
  });
});
