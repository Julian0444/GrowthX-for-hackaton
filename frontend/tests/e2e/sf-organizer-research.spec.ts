// Ticket 10: navegador + Next + PostgreSQL + worker en procesos reales.
// Se ejecuta con `pnpm test` y `pnpm test:e2e`. Requiere PostgreSQL local y
// Chromium (`pnpm exec playwright install chromium`). Sin infraestructura
// falla explícitamente: no acepta la durabilidad usando mocks o skips.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { cpSync, mkdtempSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { chromium } from 'playwright';
import { hashSessionToken } from '../../lib/server/auth/session.ts';
import { runMigrations } from '../../lib/server/db/migrate.ts';
import { closePools, getAppPool, withTenantTransaction } from '../../lib/server/db/pool.ts';
import { loadCuratedCatalog } from '../../lib/server/catalog/store.ts';
import { FIXTURE_CURATION_MANIFEST } from '../../lib/server/catalog/fixture-manifest.ts';
import type { CurationManifest } from '../../lib/server/catalog/manifest.ts';
import type { SfResearchResult } from '../../components/research-dashboard/research-types.ts';
import type { EvaluationRunView, EvaluationStartInput } from '../../lib/api/atlas-client.ts';

const FRONTEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
for (const [key, value] of Object.entries({
  GROWTHX_ADMIN_DATABASE_URL: 'postgres://growthx:growthx@127.0.0.1:54329/growthx',
  GROWTHX_DATABASE_URL: 'postgres://growthx_app:growthx_app_dev@127.0.0.1:54329/growthx',
  GROWTHX_WORKER_DATABASE_URL: 'postgres://growthx_worker:growthx_worker_dev@127.0.0.1:54329/growthx',
  GROWTHX_QUEUE_DATABASE_URL: 'postgres://growthx_queue:growthx_queue_dev@127.0.0.1:54329/growthx',
})) if (!process.env[key]) process.env[key] = value;

async function eventually<T>(get: () => Promise<T | null>, message: string, timeout = 60000): Promise<T> {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const value = await get();
    if (value !== null) return value;
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error(`Timeout: ${message}`);
}
async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}
function processRunner(args: string[], cwd: string) {
  const child = spawn(process.execPath, args, { cwd, env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', GROWTHX_WORKER_POLL_SECONDS: '0.5', GROWTHX_WORKER_EXIT_AFTER_STEP: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout?.on('data', chunk => { log = (log + String(chunk)).slice(-12000); });
  child.stderr?.on('data', chunk => { log = (log + String(chunk)).slice(-12000); });
  return { child, log: () => log };
}
async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>(resolve => {
    const timer = setTimeout(() => child.kill('SIGKILL'), 12000);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
    child.kill('SIGTERM');
  });
}
async function seedTenant(admin: pg.Client) {
  const slug = `sf-e2e-${randomUUID()}`;
  const tenant = await admin.query('insert into growthx.tenants(slug,display_name) values($1,$1) returning id', [slug]);
  const user = await admin.query('insert into growthx.app_users(email,display_name) values($1,$1) returning id', [`${slug}@test.local`]);
  const tenantId = tenant.rows[0].id as string, userId = user.rows[0].id as string;
  const token = randomBytes(24).toString('hex');
  await admin.query('insert into growthx.memberships(tenant_id,user_id) values($1,$2)', [tenantId,userId]);
  await admin.query("insert into growthx.sessions(token_hash,user_id,tenant_id,expires_at) values($1,$2,$3,now()+interval '1 hour')", [hashSessionToken(token),userId,tenantId]);
  return { tenantId,userId,token };
}
function controlledCatalog(): CurationManifest {
  const fixture = structuredClone(FIXTURE_CURATION_MANIFEST);
  // Fechas controladas relativas a esta ejecución: el catálogo no caduca en CI.
  const futureYear = new Date().getUTCFullYear() + 1;
  for (const edition of fixture.editions) {
    if (edition.startDate.precision === 'instant' && edition.startDate.iso.startsWith('2027')) edition.startDate.iso = edition.startDate.iso.replace('2027', String(futureYear));
    if (edition.startDate.precision === 'date_only' && edition.startDate.date.startsWith('2026')) edition.startDate.date = `${futureYear}-10-01`;
  }
  for (const claim of fixture.claims) if (claim.value.kind === 'date' && claim.value.date.precision === 'instant' && claim.value.date.iso.startsWith('2027')) claim.value.date.iso = claim.value.date.iso.replace('2027', String(futureYear));
  fixture.companies.push({ ...fixture.companies[0], id: 'comp-quiver-homonym', websiteUrl: 'https://other-quiver.example' });
  for (const suffix of ['a','b']) {
    const organizer = fixture.organizers.find(o => o.organizerId === `org-mission-ai-${suffix}`)!;
    const source = { ...fixture.sources[0], id: `src-mission-${suffix}`, url: `https://mission-${suffix}.example`, content: { kind: 'excerpt' as const, excerpt: `Organizador sintético Mission AI ${suffix}: python, agents.` } };
    fixture.sources.push(source);
    const claim = { ...fixture.claims[0], id: `clm-mission-${suffix}-r1`, claimId: `clm-mission-${suffix}`, subject: { type: 'organizer' as const, organizerId: organizer.organizerId }, sourceIds: [source.id], value: { kind: 'text' as const, text: 'python, agents' } };
    organizer.claimRevisionIds = [claim.id]; fixture.claims.push(claim);
  }
  // Edición futura explícitamente fuera de SF del organizador con sede/actividad SF.
  fixture.editions.push({ ...fixture.editions[2], id: 'ed-berlin-future-r1', editionId: 'ed-berlin-future', name: 'Berlin Future (synthetic)', startDate: { precision: 'instant', iso: `${futureYear}-12-01T18:00:00+01:00`, timezone: 'Europe/Berlin' } });
  return fixture;
}
const researchBody = (overrides: Partial<EvaluationStartInput['profile']> = {}): EvaluationStartInput => ({ idempotencyKey: randomUUID(), mode: 'catalog_research', researchScope: 'sf_organizers', profile: { product: 'Herramienta de agentes', audienceDescription: 'Equipos backend', audienceProfiles: [], stack: ['python'], budget: { status: 'unknown' }, window: { from: null, to: null }, objective: { kind: 'feedback' }, comparableCompanies: [], ...overrides } });

// Aislamiento de Next: copia desechable, node_modules enlazado. Nunca modifica
// next-env.d.ts ni interrumpe el servidor que usa la persona en el workspace.
test('SF: dashboard y organizadores con navegador, PostgreSQL y worker reales', { timeout: 240000 }, async t => {
  const admin = new pg.Client({ connectionString: process.env.GROWTHX_ADMIN_DATABASE_URL, connectionTimeoutMillis: 3000 });
  await admin.connect();
  await runMigrations();
  const tenant = await seedTenant(admin), decoy = await seedTenant(admin);
  const fixture = controlledCatalog();
  await loadCuratedCatalog(getAppPool(), tenant.tenantId, fixture);
  const temp = mkdtempSync(path.join(tmpdir(), 'growthx-sf-e2e-'));
  cpSync(FRONTEND, temp, { recursive: true, filter: file => !['node_modules','.next','.env.local','.env','tests','.git'].includes(path.basename(file)) });
  symlinkSync(path.join(FRONTEND,'node_modules'), path.join(temp,'node_modules'), 'dir');
  const port = await freePort(), base = `http://127.0.0.1:${port}`;
  const next = processRunner([path.join(FRONTEND,'node_modules/next/dist/bin/next'), 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', String(port)], temp);
  let worker: ReturnType<typeof processRunner> | null = null;
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    if (worker) await stop(worker.child);
    await stop(next.child);
    await closePools();
    // Solo filas de los tenants creados por esta prueba (sin tocar el tenant dev).
    for (const seeded of [tenant, decoy]) {
      for (const table of ['organizer_research','run_logs','run_steps','runs','profiles','claim_revision_sources','claim_revisions','claims','participation_revisions','participations','edition_revisions','event_editions','organizer_revisions','organizers','sources','companies','catalog_loads','sessions','memberships'])
        await admin.query(`delete from growthx.${table} where tenant_id=$1`, [seeded.tenantId]);
      await admin.query('delete from growthx.tenants where id=$1', [seeded.tenantId]);
      await admin.query('delete from growthx.app_users where id=$1', [seeded.userId]);
    }
    await admin.end(); rmSync(temp, { recursive: true, force: true });
  });
  await eventually(async () => {
    if (next.child.exitCode !== null) throw new Error(next.log());
    try { return (await fetch(base)).ok ? true : null; } catch { return null; }
  }, 'Next listo');
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await context.addCookies([{ name: 'growthx_session', value: tenant.token, url: base, httpOnly: true }]);
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const globalCalls: string[] = [], errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await context.route('**/*', route => {
    const url = route.request().url();
    if (/\/api\/opportunities\/search|api\.exa|apify|generativelanguage/.test(url)) { globalCalls.push(url); return route.abort(); }
    return route.continue();
  });
  const nav = (name: string) => page.getByRole('navigation').getByRole('button', { name, exact: true }).click();
  const readRun = async (id: string): Promise<EvaluationRunView> => {
    const response = await context.request.get(`${base}/api/evaluations/${id}`);
    assert.equal(response.status(), 200); return response.json();
  };
  const complete = (id: string) => eventually(async () => { const r = await readRun(id); if (r.state === 'failed') throw new Error(r.error ?? worker?.log()); return r.state === 'completed' ? r : null; }, 'worker completó la investigación');
  let firstId = '', firstRun: EvaluationRunView;
  const capture = async (name: string) => {
    if (process.env.GROWTHX_E2E_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.GROWTHX_E2E_SCREENSHOT_DIR, `${name}.png`), fullPage: true });
  };

  await t.test('entrada dashboard, sesión y perfil corregible antes de investigar', async () => {
    assert.equal((await fetch(`${base}/api/evaluations`)).status, 401);
    await page.goto(base);
    await page.getByTestId('research-coverage').waitFor();
    assert.equal(await page.getByTestId('sf-map').count(), 0);
    for (const label of ['Resumen','Organizadores','Eventos','Decisiones','Perfil']) assert.equal(await page.getByRole('navigation').getByRole('button', { name: label, exact: true }).count(), 1);
    await nav('Perfil');
    await page.getByLabel('Producto', { exact: true }).fill('Herramienta para equipos que construyen agentes');
    await page.getByLabel('Audiencia', { exact: true }).fill('Audiencia inicial a corregir');
    await page.getByLabel('Stack y temas').fill('python, agents');
    await page.getByRole('button', { name: 'Feedback técnico', exact: true }).click();
    await page.getByLabel('Nombre de empresa comparable').fill('Quiver Labs');
    await page.getByRole('button', { name: 'Agregar empresa', exact: true }).click();
    await page.getByLabel('Identidad de Quiver Labs', { exact: true }).selectOption('comp-quiverlabs');
    await page.getByRole('button', { name: 'Revisar interpretación', exact: true }).click();
    assert.match(await page.getByTestId('profile-review').innerText(), /comp-quiverlabs/);
    assert.equal((await context.request.get(`${base}/api/evaluations`).then(r => r.json())).runs.length, 0);
    await page.getByRole('button', { name: 'Corregir interpretación' }).click();
    await page.getByLabel('Audiencia', { exact: true }).fill('Equipos backend que construyen agentes');
    await page.getByRole('button', { name: 'Revisar interpretación', exact: true }).click();
    await page.getByRole('button', { name: 'Confirmar e investigar SF' }).click();
    await page.getByTestId('run-progress').waitFor();
    firstId = new URL(page.url()).searchParams.get('run')!;
    assert.ok(firstId);
    const queued = await readRun(firstId);
    assert.equal(queued.state, 'queued');
    assert.equal(queued.profile.audience.description, 'Equipos backend que construyen agentes');
    assert.deepEqual(queued.profile.budget, { status: 'unknown', note: null });
    assert.equal(queued.profile.comparableCompanies[0].companyId, 'comp-quiverlabs');
    await page.reload();
    await page.getByTestId('run-progress').waitFor();
    assert.equal((await readRun(firstId)).state, 'queued');
    worker = processRunner(['worker/index.ts'], FRONTEND);
    firstRun = await complete(firstId);
    await nav('Organizadores');
    await page.locator('[data-organizer-id="org-bay-builders"]').waitFor();
    assert.equal((firstRun.result as SfResearchResult).coverage.matched, 4);
    await capture('organizers');
    assert.equal(await page.getByTestId('sf-map').count(), 0);
  });

  await t.test('homónimos independientes y guardado durable sin edición elegible', async () => {
    const a = page.locator('[data-organizer-id="org-mission-ai-a"]');
    const b = page.locator('[data-organizer-id="org-mission-ai-b"]');
    assert.equal(await a.count(), 1); assert.equal(await b.count(), 1);
    assert.match(await a.innerText(), /Sin edición futura/);
    const savingResponse = page.waitForResponse(r => r.url().endsWith(`/api/evaluations/${firstId}/organizers/org-mission-ai-a`) && r.request().method() === 'POST');
    await a.getByRole('button', { name: 'Guardar para investigar', exact: true }).click();
    const saveReply = await savingResponse;
    assert.equal(saveReply.status(), 200, await saveReply.text());
    await a.getByRole('button', { name: 'Guardado · investigación pendiente', exact: true }).waitFor();
    const saved = await context.request.post(`${base}/api/evaluations/${firstId}/organizers/org-mission-ai-a`, { data: {} });
    assert.equal(saved.status(), 200);
    assert.equal((await admin.query('select count(*)::int as n from growthx.organizer_research where tenant_id=$1 and run_id=$2', [tenant.tenantId,firstId])).rows[0].n, 1);
    await page.reload(); await nav('Organizadores');
    await page.locator('[data-organizer-id="org-mission-ai-a"]').getByRole('button', { name: 'Guardado · investigación pendiente', exact: true }).waitFor();
    assert.equal((await readRun(firstId)).savedOrganizers[0].state, 'pending_research');
    await page.locator('[data-organizer-id="org-mission-ai-b"]').getByRole('button', { name: 'Abrir expediente' }).click();
    const dossier = page.getByTestId('organizer-dossier');
    assert.doesNotMatch(await dossier.innerText(), /Quiver Labs|Berlin 2025/);
    await nav('Organizadores');
  });

  await t.test('razones → expediente → empresa → edición → rol → fuente; resultado desconocido', async () => {
    const bay = page.locator('[data-organizer-id="org-bay-builders"]');
    assert.match(await bay.innerText(), /comp|Quiver/);
    await bay.getByRole('button', { name: 'Abrir expediente' }).click();
    const dossier = page.getByTestId('organizer-dossier');
    assert.match(await dossier.innerText(), /Berlin/);
    assert.match(await dossier.innerText(), /Resultado comercial desconocido/);
    assert.equal(await dossier.locator('a[href="https://quiverlabs.example/events"]').count() > 0, true);
    await dossier.locator('[data-participation-id="part-quiver-berlin"]').getByRole('button').click();
    const event = page.getByTestId('edition-dossier');
    assert.match(await event.innerText(), /Berlin/); assert.match(await event.innerText(), /paid_sponsor/);
    assert.equal(await event.getByRole('link', { name: 'Abrir listado de la edición' }).getAttribute('href'), 'https://baybuilders.example/berlin-2025');
    assert.equal(await page.getByTestId('sf-map').count(), 0);
    await nav('Organizadores');
    await page.locator('[data-organizer-id="org-bay-builders"]').getByRole('button', { name: /Ver edición futura de SF/ }).click();
    assert.match(await page.getByTestId('edition-dossier').innerText(), /Revisiones en contradicción/);
    assert.match(await page.getByTestId('edition-dossier').innerText(), /150/);
    assert.match(await page.getByTestId('edition-dossier').innerText(), /60/);
    await capture('dossier');
    assert.equal(await page.getByTestId('sf-map').count(), 0);
  });

  await t.test('logo ambiguo y edición futura fuera de SF no se recomiendan', async () => {
    await nav('Organizadores');
    await page.locator('[data-organizer-id="org-gg-ml"]').getByRole('button', { name: 'Abrir expediente' }).click();
    assert.match(await page.getByTestId('organizer-dossier').innerText(), /logo_present/);
    assert.match(await page.getByTestId('organizer-dossier').innerText(), /no prueba patrocinio pagado/);
    const result = firstRun.result as SfResearchResult;
    assert.equal(result.candidates.flatMap(c => c.futureSfEditionIds).includes('ed-berlin-future'), false);
    assert.equal(result.candidates.flatMap(c => c.futureSfEditionIds).includes('ed-us-roadshow-2027'), false);
    assert.equal(result.candidates.find(c => c.organizerId === 'org-bay-builders')!.dossier.editions.find(e => e.edition.editionId === 'ed-berlin-future')!.edition.location.name, 'Berlin');
  });

  await t.test('Lista/Mapa conservan exactamente los mismos IDs y fuentes; sin sede inferida', async () => {
    await nav('Eventos');
    const identities = () => page.getByTestId('sf-edition-list').locator('[data-edition-id]').evaluateAll(elements => elements.map(e => [e.getAttribute('data-edition-id'), e.getAttribute('data-source-ids')]));
    const list = await identities(); assert.equal(list.length, 3);
    assert.equal(await page.getByTestId('sf-map').count(), 0);
    await page.getByRole('button', { name: 'Mapa', exact: true }).click();
    assert.deepEqual(await identities(), list);
    await capture('map');
    assert.equal(await page.locator('[data-point-edition-id="ed-sf-dev-summit-2027"]').count(), 1);
    assert.equal(await page.locator('[data-point-edition-id="ed-ml-night-2026"]').count(), 0, 'sin fuente urbana no se inventa punto');
    assert.equal(await page.locator('[data-point-edition-id="ed-berlin-future"]').count(), 0);
    await page.getByRole('button', { name: 'Lista', exact: true }).click(); assert.deepEqual(await identities(), list);
  });

  await t.test('revisión del perfil, ausencia de coincidencia e importador disponible', async () => {
    await nav('Perfil');
    await page.getByLabel('Stack y temas').fill('cobol');
    await page.getByLabel('Audiencia', { exact: true }).fill('Ejecutivos bancarios');
    await page.getByRole('button', { name: 'Quitar empresa' }).click();
    await capture('profile');
    await page.getByRole('button', { name: 'Revisar interpretación', exact: true }).click();
    await page.getByRole('button', { name: 'Confirmar e investigar SF' }).click();
    const secondId = await eventually(async () => { const id = new URL(page.url()).searchParams.get('run'); return id && id !== firstId ? id : null; }, 'nueva revisión');
    const revised = await complete(secondId);
    assert.equal(revised.previousRunId, firstId); assert.equal(revised.profile.profileVersion, 2);
    assert.equal((revised.result as SfResearchResult).candidates.length, 0);
    await page.getByLabel('Luma event URL').waitFor();
    assert.match(await page.locator('main').innerText(), /límite del catálogo/);
    assert.deepEqual((await readRun(firstId)).result, firstRun.result, 'la revisión no reescribe la investigación anterior');
    const lineages = await admin.query('select lineage_id, version from growthx.profiles where tenant_id=$1 order by version', [tenant.tenantId]);
    assert.deepEqual(lineages.rows.map(r => r.version), [1,2]); assert.equal(lineages.rows[0].lineage_id, lineages.rows[1].lineage_id);
    // Ticket 13: la sección Decisiones dejó de ser un placeholder — ahora
    // explica que la decisión se registra sobre el panel de la comparación.
    await nav('Decisiones'); assert.match(await page.locator('main').innerText(), /se registran sobre el panel de una comparación/);
    assert.equal(await page.getByTestId('sf-map').count(), 0);
    await nav('Resumen'); await page.getByRole('button', { name: firstRun.profile.product, exact: true }).first().waitFor();
  });

  await t.test('sesión señuelo, RLS, identidad comparable e idempotencia de nuevas revisiones', async () => {
    const other = await browser.newContext();
    await other.addCookies([{ name: 'growthx_session', value: decoy.token, url: base }]);
    assert.equal((await other.request.get(`${base}/api/evaluations/${firstId}`)).status(), 404);
    assert.equal((await other.request.post(`${base}/api/evaluations/${firstId}/organizers/org-mission-ai-a`, { data: {} })).status(), 404);
    const saved = await withTenantTransaction(getAppPool(), decoy.tenantId, c => c.query('select * from growthx.organizer_research where run_id=$1', [firstId]));
    assert.equal(saved.rowCount, 0);
    assert.equal((await context.request.post(`${base}/api/evaluations`, { data: { ...researchBody(), tenantId: decoy.tenantId } })).status(), 400);
    assert.equal((await context.request.post(`${base}/api/evaluations`, { data: researchBody({ comparableCompanies: [{ name: 'Nombre falso', companyId: 'comp-quiverlabs', relation: 'comparable', confirmation: 'confirmed' }] }) })).status(), 400);
    assert.equal((await other.request.post(`${base}/api/evaluations`, { data: { ...researchBody(), previousRunId: firstId } })).status(), 400);
    const body = { ...researchBody(), previousRunId: firstId };
    const response = await context.request.post(`${base}/api/evaluations`, { data: body }); assert.equal(response.status(), 202);
    const newId = (await response.json()).runId;
    assert.equal((await context.request.post(`${base}/api/evaluations`, { data: body }).then(r => r.json())).runId, newId);
    assert.equal((await context.request.post(`${base}/api/evaluations`, { data: { ...body, profile: { ...body.profile, product: 'Cambio conflictivo' } } })).status(), 409);
    await complete(newId);
    await other.close();
  });

  await t.test('matching usa la última revisión y la identidad confirmada, no nombres parecidos', async () => {
    const body = researchBody({ stack: [], audienceDescription: 'Ejecutivos bancarios', comparableCompanies: [{ companyId: 'comp-quiver-homonym', name: fixture.companies[0].name, relation: 'comparable', confirmation: 'confirmed' }] });
    const response = await context.request.post(`${base}/api/evaluations`, { data: body });
    assert.equal(response.status(), 202);
    assert.equal(((await complete((await response.json()).runId)).result as SfResearchResult).candidates.length, 0, 'el homónimo sin participaciones no hereda relaciones');
    const previous = fixture.claims.find(c => c.id === 'clm-bay-focus-r1')!;
    await loadCuratedCatalog(getAppPool(), tenant.tenantId, { ...fixture, name: 'corrección-foco-sintética', organizers: [], editions: [], participations: [], companies: [], sources: [], claims: [{ ...previous, id: 'clm-bay-focus-r2', previousRevisionId: previous.id, value: { kind: 'text', text: 'rust' }, reviewedAt: new Date().toISOString() }] });
    const updated = await context.request.post(`${base}/api/evaluations`, { data: researchBody() });
    assert.equal(updated.status(), 202);
    const after = (await complete((await updated.json()).runId)).result as SfResearchResult;
    assert.equal(after.candidates.some(c => c.organizerId === 'org-bay-builders'), false, 'python de la revisión anterior no sigue justificando afinidad');
    assert.deepEqual((await readRun(firstId)).result, firstRun.result);
  });

  await t.test('error del worker se persiste y aparece en el dashboard', async () => {
    // Corrupción controlada del catálogo de este tenant de prueba: el worker
    // real lo rechaza con el parser de contratos, agota reintentos y persiste el error.
    await admin.query(`update growthx.claim_revisions set payload = jsonb_set(payload, '{contractVersion}', '"invalid-fixture-version"') where tenant_id=$1 and id='clm-bay-focus-r2'`, [tenant.tenantId]);
    const response = await context.request.post(`${base}/api/evaluations`, { data: researchBody() });
    assert.equal(response.status(), 202);
    const id = (await response.json()).runId;
    const failed = await eventually(async () => { const r = await readRun(id); return r.state === 'failed' ? r : null; }, 'fallo definitivo del worker');
    assert.match(failed.error ?? '', /inválido/);
    assert.equal(failed.steps.find(s => s.name === 'research_catalog')?.attempts, 4);
    await page.goto(`${base}/?run=${id}`);
    await page.getByTestId('run-progress').waitFor();
    await eventually(async () => (await page.getByTestId('run-progress').innerText()).includes('Fallido') ? true : null, 'error visible');
    assert.match(await page.getByTestId('run-progress').innerText(), /inválido/);
    assert.equal(await page.getByTestId('sf-map').count(), 0);
  });

  await t.test('sin catálogo no hay fixtures de relleno; cero llamadas al pipeline global', async () => {
    const response = await fetch(`${base}/api/evaluations`, { method: 'POST', headers: { authorization: `Bearer ${decoy.token}`, 'content-type': 'application/json' }, body: JSON.stringify(researchBody()) });
    assert.equal(response.status, 202); const id = (await response.json()).runId;
    const result = await eventually(async () => { const r = await fetch(`${base}/api/evaluations/${id}`, { headers: { authorization: `Bearer ${decoy.token}` } }).then(r => r.json()); return r.state === 'completed' ? r.result as SfResearchResult : null; }, 'catálogo vacío');
    assert.equal(result.coverage.organizers, 0); assert.equal(result.candidates.length, 0); assert.equal(result.editions.length, 0);
    assert.match(result.catalogNote, /No hay catálogo/);
    assert.deepEqual(globalCalls, []); assert.deepEqual(errors, []);
    const screenshot = process.env.GROWTHX_E2E_SCREENSHOT;
    if (screenshot) { await nav('Perfil'); await page.screenshot({ path: screenshot, fullPage: true }); }
  });
  t.diagnostic(`Next real y worker real; ${globalCalls.length} llamadas al pipeline global. Catálogo sintético explícito.`);
});
