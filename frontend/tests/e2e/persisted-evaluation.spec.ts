// Ticket 15: la demo completa del slice bajo caídas y cruces — navegador,
// Next, PostgreSQL y worker en procesos REALES. Se ejecuta con `pnpm test` y
// `pnpm test:e2e`. Requiere PostgreSQL local (pnpm db:up && pnpm db:migrate) y
// Chromium (`pnpm exec playwright install chromium`). Sin infraestructura
// falla explícitamente: no acepta la durabilidad usando mocks ni skips.
//
// Recorrido 1 (Demostración del ticket): pegar una URL de Luma → cerrar la
// pestaña; el worker cae ABRUPTAMENTE (SIGKILL en una barrera de commit) y se
// reinicia; el dossier importado queda con campos pendientes → elegir
// condicionalmente sobre una comparación → guardar → cerrar TODO → reiniciar
// Next → la misma persona recupera identidad, evidencia y condiciones; la
// sesión señuelo no puede leer ni modificar. Recorrido 2: perfil →
// organizadores pertinentes de SF → antecedente con empresa/rol → evento →
// decisión, sin abrir el mapa; el resultado comercial ausente se muestra
// desconocido y una edición de otra ciudad no se vuelve oportunidad local.
//
// Proveedores CONTROLADOS: el worker corre con el transporte de fixture del
// ticket 15 (GROWTHX_WORKER_LUMA_FIXTURE) — ninguna URL real de Luma se
// consulta — y sin claves de modelo (la redacción degrada declarándolo; si un
// worker ajeno con claves procesara los runs, el test falla explícitamente).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { cpSync, mkdtempSync, symlinkSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { hashSessionToken } from '../../lib/server/auth/session.ts';
import { runMigrations } from '../../lib/server/db/migrate.ts';
import { closePools, getAppPool } from '../../lib/server/db/pool.ts';
import { loadCuratedCatalog } from '../../lib/server/catalog/store.ts';
import { FIXTURE_CURATION_MANIFEST } from '../../lib/server/catalog/fixture-manifest.ts';
import type { CurationManifest } from '../../lib/server/catalog/manifest.ts';
import type { ComparisonRunResult, DecisionRead, EvaluationRunView } from '../../lib/api/atlas-client.ts';
import type { LumaIngestResult } from '../../lib/server/evaluations/luma-step.ts';

const FRONTEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
for (const [key, value] of Object.entries({
  GROWTHX_ADMIN_DATABASE_URL: 'postgres://growthx:growthx@127.0.0.1:54329/growthx',
  GROWTHX_DATABASE_URL: 'postgres://growthx_app:growthx_app_dev@127.0.0.1:54329/growthx',
  GROWTHX_WORKER_DATABASE_URL: 'postgres://growthx_worker:growthx_worker_dev@127.0.0.1:54329/growthx',
  GROWTHX_QUEUE_DATABASE_URL: 'postgres://growthx_queue:growthx_queue_dev@127.0.0.1:54329/growthx',
})) if (!process.env[key]) process.env[key] = value;
for (const key of ['GEMINI_API_KEY', 'EXA_API_KEY', 'APIFY_TOKEN']) delete process.env[key];

const SUMMIT = 'ed-sf-dev-summit-2027';
const IMPORT_URL = 'https://lu.ma/growthx-e2e-persisted';
// El navegador jamás sale a proveedores ni a Luma; la importación viaja por
// nuestra ruta durable y la obtiene el worker (con transporte de fixture).
const EXTERNAL = /api\.exa|apify|generativelanguage|lu\.ma|luma\.com|\/api\/opportunities\/search/;

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
function processRunner(args: string[], cwd: string, extraEnv: Record<string, string> = {}) {
  const child = spawn(process.execPath, args, { cwd, env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', GROWTHX_WORKER_POLL_SECONDS: '0.5', GROWTHX_WORKER_EXIT_AFTER_STEP: '', GROWTHX_WORKER_KILL_AT: '', ...extraEnv }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout?.on('data', chunk => { log = (log + String(chunk)).slice(-12000); });
  child.stderr?.on('data', chunk => { log = (log + String(chunk)).slice(-12000); });
  const exited = new Promise<{ code: number | null; signal: string | null }>(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
  return { child, log: () => log, exited };
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
  const slug = `persisted-e2e-${randomUUID()}`;
  const tenant = await admin.query('insert into growthx.tenants(slug,display_name) values($1,$1) returning id', [slug]);
  const user = await admin.query('insert into growthx.app_users(email,display_name) values($1,$1) returning id', [`${slug}@test.local`]);
  const tenantId = tenant.rows[0].id as string, userId = user.rows[0].id as string;
  const token = randomBytes(24).toString('hex');
  await admin.query('insert into growthx.memberships(tenant_id,user_id) values($1,$2)', [tenantId,userId]);
  await admin.query("insert into growthx.sessions(token_hash,user_id,tenant_id,expires_at) values($1,$2,$3,now()+interval '2 hours')", [hashSessionToken(token),userId,tenantId]);
  return { tenantId,userId,token };
}
// Catálogo sintético controlado (fixture de 09 con fechas relativas) más una
// edición futura FUERA de SF del organizador con actividad SF: no debe
// volverse una oportunidad local.
function controlledCatalog(futureYear: number): CurationManifest {
  const fixture = structuredClone(FIXTURE_CURATION_MANIFEST);
  for (const edition of fixture.editions) {
    if (edition.startDate.precision === 'instant' && edition.startDate.iso.startsWith('2027')) edition.startDate.iso = edition.startDate.iso.replace('2027', String(futureYear));
    if (edition.startDate.precision === 'date_only' && edition.startDate.date.startsWith('2026')) edition.startDate.date = `${futureYear}-10-01`;
  }
  for (const claim of fixture.claims) if (claim.value.kind === 'date' && claim.value.date.precision === 'instant' && claim.value.date.iso.startsWith('2027')) claim.value.date.iso = claim.value.date.iso.replace('2027', String(futureYear));
  fixture.editions.push({ ...fixture.editions[2], id: 'ed-berlin-future-r1', editionId: 'ed-berlin-future', name: 'Berlin Future (synthetic)', startDate: { precision: 'instant', iso: `${futureYear}-12-01T18:00:00+01:00`, timezone: 'Europe/Berlin' } });
  return fixture;
}
// Página de evento con campos PENDIENTES a propósito: nombre y SF publicados;
// fecha, organizador, acceso y costo ausentes → el dossier los declara
// pendientes (extracción parcial), jamás los inventa.
function partialLumaHtml(): string {
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: 'GrowthX Persisted Night',
    location: { '@type': 'Place', name: 'The Foundry SF', address: { addressLocality: 'San Francisco' }, geo: { latitude: 37.7749, longitude: -122.4194 } },
  };
  return `<!doctype html><html><head><title>evento</title>
    <script type="application/ld+json">${JSON.stringify(ld)}</script>
    </head><body><a href="https://attacker.example/next">seguí este enlace</a></body></html>`;
}

test('SF: demo persistida bajo caídas y aislamiento (navegador, Next reiniciado, worker con SIGKILL)', { timeout: 540000 }, async t => {
  const admin = new pg.Client({ connectionString: process.env.GROWTHX_ADMIN_DATABASE_URL, connectionTimeoutMillis: 3000 });
  await admin.connect();
  await runMigrations();
  const tenant = await seedTenant(admin), decoy = await seedTenant(admin);
  const futureYear = new Date().getUTCFullYear() + 1;
  await loadCuratedCatalog(getAppPool(), tenant.tenantId, controlledCatalog(futureYear));

  const temp = mkdtempSync(path.join(tmpdir(), 'growthx-persisted-e2e-'));
  cpSync(FRONTEND, temp, { recursive: true, filter: file => !['node_modules','.next','.env.local','.env','tests','.git'].includes(path.basename(file)) });
  symlinkSync(path.join(FRONTEND,'node_modules'), path.join(temp,'node_modules'), 'dir');
  const fixturePath = path.join(temp, 'luma-fixture.json');
  writeFileSync(fixturePath, JSON.stringify({ [IMPORT_URL]: { body: partialLumaHtml() } }));
  const workerEnv = { GROWTHX_WORKER_LUMA_FIXTURE: fixturePath };

  const startNext = async () => {
    const port = await freePort();
    const runner = processRunner([path.join(FRONTEND,'node_modules/next/dist/bin/next'), 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', String(port)], temp);
    const base = `http://127.0.0.1:${port}`;
    await eventually(async () => {
      if (runner.child.exitCode !== null) throw new Error(runner.log());
      try { return (await fetch(base)).ok ? true : null; } catch { return null; }
    }, 'Next listo', 120000);
    return { ...runner, base };
  };
  let next = await startNext();
  let base = next.base;
  let worker: ReturnType<typeof processRunner> | null = null;
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    if (worker) await stop(worker.child);
    await stop(next.child);
    await closePools();
    await admin.query("update pgboss.job set state = 'cancelled' where state in ('created','retry','active') and data->>'tenantId' = any($1)", [[tenant.tenantId, decoy.tenantId]]);
    for (const seeded of [tenant, decoy]) {
      for (const table of ['campaign_drafts','decisions','snapshot_narratives','snapshots','organizer_research','run_logs','run_steps','runs','profiles','claim_revision_sources','claim_revisions','claims','participation_revisions','participations','edition_revisions','event_editions','organizer_revisions','organizers','sources','companies','catalog_loads','sessions','memberships'])
        await admin.query(`delete from growthx.${table} where tenant_id=$1`, [seeded.tenantId]);
      await admin.query('delete from growthx.tenants where id=$1', [seeded.tenantId]);
      await admin.query('delete from growthx.app_users where id=$1', [seeded.userId]);
    }
    await admin.end(); rmSync(temp, { recursive: true, force: true });
  });

  // ---- Utilidades ----
  const api = (pathname: string, init: RequestInit = {}) => fetch(`${base}${pathname}`, { ...init, headers: { authorization: `Bearer ${tenant.token}`, 'content-type': 'application/json', ...(init.headers ?? {}) } });
  const readRun = async (id: string): Promise<EvaluationRunView> => { const r = await api(`/api/evaluations/${id}`); const text = await r.text(); assert.equal(r.status, 200, text); return JSON.parse(text); };
  const complete = (id: string) => eventually(async () => { const r = await readRun(id); if (r.state === 'failed') throw new Error(r.error ?? worker?.log()); return r.state === 'completed' ? r : null; }, `worker completó ${id}`, 90000);
  // Re-entrega tras un SIGKILL: lo que el mantenimiento de la cola hace al
  // expirar el job (active → retry), sin esperar los 120 s.
  const expedite = async (runId: string) => {
    await admin.query(`update pgboss.job set state='retry', start_after=now() where name='evaluation-run' and singleton_key=$1 and state='active'`, [runId]);
    await admin.query(`update pgboss.job set start_after=now() where name='evaluation-run' and singleton_key=$1 and state in ('retry','created')`, [runId]);
  };
  const counts = async () => {
    const n = async (table: string) => (await admin.query(`select count(*)::int as n from growthx.${table} where tenant_id=$1`, [tenant.tenantId])).rows[0].n as number;
    return { runs: await n('runs'), snapshots: await n('snapshots'), decisions: await n('decisions'), campaigns: await n('campaign_drafts'), claims: await n('claim_revisions'), profiles: await n('profiles') };
  };
  const capture = async (page: Page, name: string) => {
    if (process.env.GROWTHX_E2E_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.GROWTHX_E2E_SCREENSHOT_DIR, `${name}.png`), fullPage: true });
  };
  const forbidden: string[] = [], errors: string[] = [];
  let readOnlyPhase = false;
  const armContext = async (context: BrowserContext, token = tenant.token) => {
    await context.addCookies([{ name: 'growthx_session', value: token, url: base, httpOnly: true }]);
    await context.route('**/*', route => {
      const request = route.request(), url = request.url();
      if (EXTERNAL.test(url) || (readOnlyPhase && request.method() !== 'GET' && url.includes('/api/'))) { forbidden.push(`${request.method()} ${url}`); return route.abort(); }
      return route.continue();
    });
  };
  const newPage = async (context: BrowserContext) => { const page = await context.newPage(); page.setDefaultTimeout(20000); page.on('pageerror', e => errors.push(e.message)); return page; };
  const nav = (page: Page, name: string) => page.getByRole('navigation').getByRole('button', { name, exact: true }).click();
  const panel = (page: Page) => page.getByTestId('comparison-panel');
  const candidate = (page: Page, editionId: string) => panel(page).locator(`[data-edition-id="${editionId}"]`);
  // La cola es compartida con cualquier worker local: se exige la degradación
  // por clave ausente para detectar un worker ajeno con claves reales.
  const assertProcessedWithoutProviders = (result: ComparisonRunResult) => {
    assert.equal(result.narrative?.status, 'deterministic_only', 'la redacción degradó sin red');
    assert.match(result.narrative?.motive ?? '', /GEMINI_API_KEY ausente/, 'un worker ajeno con claves procesó el run (cola compartida): apagá tu worker de desarrollo para correr este e2e');
  };

  let researchId = '', ingestId = '', importedEditionId = '', importedEditionRevisionId = '';
  await t.test('perfil → investigación; pegar URL de Luma y cerrar la pestaña; el worker cae con SIGKILL y al reiniciar el dossier queda durable con pendientes', async () => {
    // Worker 1 con transporte de fixture y barrera de kill: procesará la
    // investigación normalmente y morirá ABRUPTAMENTE al persistir el dossier.
    worker = processRunner(['worker/index.ts'], FRONTEND, { ...workerEnv, GROWTHX_WORKER_KILL_AT: 'before_step_commit:persist_dossier' });
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await armContext(context);
    const page = await newPage(context);
    await page.goto(base);
    await nav(page, 'Perfil');
    await page.getByLabel('Producto', { exact: true }).fill('Herramienta de agentes');
    await page.getByLabel('Audiencia', { exact: true }).fill('Equipos backend que construyen agentes');
    await page.getByLabel('Stack y temas').fill('python, agents');
    await page.getByRole('button', { name: 'Feedback técnico', exact: true }).click();
    await page.getByRole('button', { name: 'Revisar interpretación', exact: true }).click();
    await page.getByRole('button', { name: 'Confirmar e investigar SF' }).click();
    await page.getByTestId('run-progress').waitFor();
    researchId = new URL(page.url()).searchParams.get('run')!;
    await complete(researchId);

    // Pegar la URL en Eventos: la aceptación es durable (202 + runId).
    await nav(page, 'Eventos');
    await page.getByLabel('Luma event URL').fill(IMPORT_URL);
    const accepting = page.waitForResponse(r => r.url().endsWith('/api/events/ingest') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Importar', exact: true }).click();
    assert.equal((await accepting).status(), 202);
    ingestId = await eventually(async () => { const id = new URL(page.url()).searchParams.get('run'); return id && id !== researchId ? id : null; }, 'run de importación');
    // «Una persona pega la URL y cierra la pestaña.»
    await context.close();

    // «Otra detiene el worker»: la barrera lo mata con el dossier YA escrito
    // pero el paso sin confirmar — una caída abrupta de verdad.
    const exit = await worker.exited;
    assert.equal(exit.signal, 'SIGKILL', worker.log());
    worker = null;
    const midway = await readRun(ingestId);
    assert.notEqual(midway.state, 'completed');

    // Reinicio del worker: el MISMO run llega a terminal sin duplicar efectos.
    await expedite(ingestId);
    worker = processRunner(['worker/index.ts'], FRONTEND, workerEnv);
    const done = await complete(ingestId);
    const result = done.result as LumaIngestResult;
    assert.equal(result.kind, 'luma_event_ingest');
    assert.equal(result.extraction.status, 'partial', 'el dossier declara campos pendientes');
    importedEditionId = result.editionId;
    importedEditionRevisionId = result.editionRevisionId;
    const { rows: loads } = await admin.query(`select count(*)::int as n from growthx.catalog_loads where tenant_id=$1 and material='imported'`, [tenant.tenantId]);
    assert.equal(loads[0].n, 1, 'una sola carga importada pese a la caída y la re-entrega');

    // El dossier persistido declara lo ausente como pendiente (no lo inventa).
    const dossier = await api(`/api/catalog/editions/${importedEditionId}`);
    const dossierText = await dossier.text();
    assert.equal(dossier.status, 200, dossierText);
    const read = JSON.parse(dossierText) as { claims: { revisions: { attribute: string; status: string }[] }[] };
    const latest = read.claims.map(c => c.revisions[c.revisions.length - 1]);
    const lastStatus = (attribute: string) => latest.filter(r => r.attribute === attribute).map(r => r.status);
    assert.deepEqual(lastStatus('access'), ['pending'], 'acceso pendiente explícito');
    assert.deepEqual(lastStatus('date'), ['pending'], 'fecha pendiente explícita (jamás «hoy»)');
    assert.ok(latest.some(r => r.attribute.startsWith('cost') && r.status === 'pending'), 'costo pendiente explícito');

    // Un navegador nuevo recupera el run por su enlace y abre el dossier.
    const reopened = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await armContext(reopened);
    const page2 = await newPage(reopened);
    await page2.goto(`${base}/?run=${ingestId}`);
    await nav(page2, 'Eventos');
    const ingestPanel = page2.getByTestId('ingest-run');
    await ingestPanel.waitFor();
    assert.match(await ingestPanel.innerText(), new RegExp(ingestId));
    assert.match(await ingestPanel.innerText(), /Dossier parcial/);
    await ingestPanel.getByRole('button', { name: 'Abrir dossier persistido' }).click();
    await page2.getByTestId('edition-dossier').waitFor();
    assert.match(await page2.getByTestId('edition-dossier').innerText(), new RegExp(importedEditionId));
    await capture(page2, 'persisted-import');
    await reopened.close();
  });

  let cmpId = '', internalLink = '', campaignId = '';
  let decision: DecisionRead, cmp: ComparisonRunResult;
  let baseline: Awaited<ReturnType<typeof counts>>;
  await t.test('elegir condicionalmente sobre la comparación y guardar; luego cerrar navegador, worker y Next', async () => {
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await armContext(context);
    const page = await newPage(context);
    // Con el run de importación abierto, la lista de Eventos sale del catálogo
    // PERSISTIDO (que ya incluye la edición importada); la comparación reutiliza
    // el perfil de la investigación guardada de la sesión.
    await page.goto(`${base}/?run=${ingestId}`);
    await nav(page, 'Eventos');
    const list = page.getByTestId('sf-edition-list');
    await list.locator(`[data-edition-id="${importedEditionId}"]`).waitFor();
    // La edición de otra ciudad no aparece como oportunidad local de SF.
    assert.equal(await list.locator('[data-edition-id="ed-berlin-future"]').count(), 0, 'Berlin no se vuelve oportunidad local');
    for (const editionId of [importedEditionId, SUMMIT])
      await list.locator(`[data-edition-id="${editionId}"]`).getByLabel(/Seleccionar para comparar/).check();
    const accepting = page.waitForResponse(r => r.url().endsWith('/api/evaluations') && r.request().method() === 'POST');
    await page.getByRole('button', { name: /Comparar seleccionadas/ }).click();
    assert.equal((await accepting).status(), 202);
    cmpId = await eventually(async () => { const id = new URL(page.url()).searchParams.get('run'); return id && id !== researchId && id !== ingestId ? id : null; }, 'run de comparación');
    const cmpRun = await complete(cmpId);
    cmp = cmpRun.result as ComparisonRunResult;
    assertProcessedWithoutProviders(cmp);
    const imported = cmp.bundle.snapshot.alternatives.find(a => a.editionId === importedEditionId)!;
    assert.equal(imported.eligibility.status, 'conditional', 'el dossier con pendientes queda condicionado, no excluido ni elegible');

    // Elegir condicionalmente la edición importada, con condición completa.
    await panel(page).waitFor();
    const imported$ = candidate(page, importedEditionId);
    await imported$.getByTestId('decision-open').click();
    await imported$.getByLabel('Motivos de la decisión').fill('Audiencia y ciudad publicadas por la página\nCosto y acceso por confirmar con el organizador');
    await imported$.getByText('Agregar condición (pregunta al organizador').click();
    await imported$.getByLabel('Dato pendiente').fill('Costo del patrocinio');
    await imported$.getByLabel('Pregunta al organizador').fill('¿Cuál es la tarifa y qué incluye?');
    await imported$.getByLabel('Respuesta esperada').fill('Tarifario con monto y moneda');
    await imported$.getByLabel('Efecto sobre la decisión').selectOption('discarded');
    await imported$.getByLabel('Responsable').fill('Julian');
    await imported$.getByLabel('Plazo').fill(`${futureYear}-02-28`);
    await imported$.getByRole('button', { name: 'Agregar condición', exact: true }).click();
    const saving = page.waitForResponse(r => r.url().endsWith('/api/decisions') && r.request().method() === 'POST');
    await imported$.getByTestId('decision-save').click();
    assert.equal((await saving).status(), 201);
    const campaign = page.getByTestId('campaign-draft-panel');
    await campaign.waitFor();
    campaignId = await page.getByTestId('campaign-draft-id').innerText();
    const decisionId = await page.getByTestId('campaign-draft-decision-id').innerText();
    internalLink = (await page.getByTestId('campaign-link').getAttribute('href'))!;
    const read = await api(`/api/decisions/${decisionId}`);
    assert.equal(read.status, 200);
    decision = await read.json();
    assert.equal(decision.editionId, importedEditionId);
    assert.equal(decision.decision.verdict, 'chosen');
    assert.ok(decision.decision.conditions.some(c => c.description.includes('Costo del patrocinio') && c.owner === 'Julian'));
    baseline = await counts();
    assert.equal(baseline.decisions, 1); assert.equal(baseline.campaigns, 1); assert.equal(baseline.snapshots, 1);
    await capture(page, 'persisted-decision');
    // Cerrar TODO: pestaña, worker y Next.
    await context.close();
    await stop(worker!.child); worker = null;
    await stop(next.child);
  });

  let context: BrowserContext, page: Page;
  await t.test('reiniciar Next y recuperar por el enlace interno: identidad, evidencia y condiciones intactas; el señuelo no puede leer ni modificar', async () => {
    next = await startNext(); base = next.base;
    readOnlyPhase = true;
    context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await armContext(context);
    page = await newPage(context);
    await page.goto(`${base}${internalLink}`);
    const campaign = page.getByTestId('campaign-draft-panel');
    await campaign.waitFor();
    assert.equal(await page.getByTestId('campaign-draft-id').innerText(), campaignId);
    assert.equal(await page.getByTestId('campaign-draft-decision-id').innerText(), decision.decisionId);
    assert.equal(await page.getByTestId('campaign-draft-snapshot-id').innerText(), cmp.snapshotId);
    await page.getByRole('button', { name: 'Volver a la comparación' }).click();
    await panel(page).waitFor();
    const imported$ = candidate(page, importedEditionId);
    await imported$.getByTestId('candidate-decision').waitFor();
    assert.equal(await imported$.getByTestId('candidate-decision').getAttribute('data-decision-id'), decision.decisionId);
    assert.equal(await imported$.getByTestId('decision-state').innerText(), 'Elegida · elección condicional');
    assert.equal(await imported$.getByTestId('decision-revision').innerText(), '1');
    const blockText = await imported$.getByTestId('candidate-decision').innerText();
    for (const reason of decision.decision.reasons) assert.ok(blockText.includes(reason), `motivo «${reason}» visible`);
    assert.match(blockText, /Costo del patrocinio.*Responsable: Julian/);
    // Evidencia fijada por el snapshot: la revisión exacta del dossier importado.
    const fixed = await imported$.getByTestId('candidate-fixed-revisions').innerText();
    assert.ok(fixed.includes(importedEditionRevisionId), 'la revisión de edición importada quedó fijada por el snapshot');
    await capture(page, 'persisted-reopen');
    // Cero llamadas externas, cero escrituras, worker apagado: nada se recalculó.
    assert.equal(worker, null);
    assert.deepEqual(await counts(), baseline);
    assert.deepEqual(forbidden, []);
    // La sesión señuelo no puede leer ni modificar la decisión recuperada.
    const decoyHeaders = { authorization: `Bearer ${decoy.token}`, 'content-type': 'application/json' };
    assert.equal((await fetch(`${base}/api/decisions/${decision.decisionId}`, { headers: decoyHeaders })).status, 404);
    assert.equal((await fetch(`${base}/api/evaluations/${cmpId}`, { headers: decoyHeaders })).status, 404);
    assert.equal((await fetch(`${base}/api/catalog/editions/${importedEditionId}`, { headers: decoyHeaders })).status, 404);
    const decoyPatch = await fetch(`${base}/api/decisions/${decision.decisionId}`, {
      method: 'PATCH', headers: decoyHeaders,
      body: JSON.stringify({ idempotencyKey: null, expectedRevision: 1, verdict: 'discarded', reasons: ['cruce'], addConditions: [], resolveConditions: [], campaignDraft: null }),
    });
    assert.equal(decoyPatch.status, 404, 'modificar desde el señuelo no existe');
    const intact: DecisionRead = await (await api(`/api/decisions/${decision.decisionId}`)).json();
    assert.equal(intact.decision.revision, 1, 'la decisión no cambió');
    assert.equal(intact.decision.verdict, 'chosen');
  });

  await t.test('perfil → organizadores de SF → antecedente con empresa/rol → evento → decisión, sin abrir el mapa; resultado comercial ausente = desconocido', async () => {
    // El recorrido parte de la investigación del perfil (sus organizadores
    // pertinentes de SF), no de la comparación.
    await page.goto(`${base}/?run=${researchId}`);
    await nav(page, 'Organizadores');
    const bay = page.locator('[data-organizer-id="org-bay-builders"]');
    await bay.waitFor();
    assert.equal(await page.getByTestId('sf-map').count(), 0, 'el mapa no se abre en todo el recorrido');
    await bay.getByRole('button', { name: 'Abrir expediente' }).click();
    const dossier = page.getByTestId('organizer-dossier');
    await dossier.waitFor();
    // Antecedente con empresa y rol; el resultado comercial ausente se muestra
    // desconocido (no éxito ni fracaso).
    assert.match(await dossier.innerText(), /Berlin/);
    assert.match(await dossier.innerText(), /Resultado comercial desconocido/);
    await dossier.locator('[data-participation-id="part-quiver-berlin"]').getByRole('button').click();
    const event = page.getByTestId('edition-dossier');
    await event.waitFor();
    assert.match(await event.innerText(), /Berlin/);
    assert.match(await event.innerText(), /paid_sponsor/);
    assert.equal(await page.getByTestId('sf-map').count(), 0);
    // …y de vuelta a la decisión guardada, desde la lista, sin mapa.
    await nav(page, 'Decisiones');
    const rows = page.getByTestId('evaluation-list').locator('[data-testid="saved-evaluation"]');
    await eventually(async () => (await rows.count()) === 1 ? true : null, 'lista con la evaluación guardada');
    assert.equal(await rows.first().getAttribute('data-run-id'), cmpId);
    const savedDecision = rows.first().locator(`[data-decision-id="${decision.decisionId}"]`);
    assert.match(await savedDecision.innerText(), /Elegida · elección condicional · revisión 1/);
    await savedDecision.getByRole('button', { name: 'Abrir decisión', exact: true }).click();
    await candidate(page, importedEditionId).getByTestId('candidate-decision').waitFor();
    assert.equal(await page.getByTestId('sf-map').count(), 0);
    await capture(page, 'persisted-organizers');
    assert.deepEqual(await counts(), baseline);
    assert.deepEqual(forbidden, []);
    assert.deepEqual(errors, []);
  });
  t.diagnostic(`Worker con SIGKILL real + Next reiniciado; ${forbidden.length} llamadas prohibidas; catálogo sintético y transporte de fixture explícitos.`);
});
