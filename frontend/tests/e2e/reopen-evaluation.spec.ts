// Ticket 14: reabrir la decisión exacta desde el dashboard — navegador, Next,
// PostgreSQL y worker en procesos REALES. Se ejecuta con `pnpm test` y
// `pnpm test:e2e`. Requiere PostgreSQL local (pnpm db:up && pnpm db:migrate) y
// Chromium (`pnpm exec playwright install chromium`). Sin infraestructura
// falla explícitamente: no acepta la durabilidad usando mocks ni skips.
//
// Recorrido: guardar una elección condicional → cerrar el contexto del
// navegador → REINICIAR Next → volver a autenticar → reabrir por el enlace
// interno y por la lista → cotejar runId, snapshotId, revisión de decisión,
// motivos, claims y campaña con cero llamadas a proveedores (contador del
// navegador + invariantes en PostgreSQL + worker apagado durante la lectura).
// Después: vigencia actual con reloj controlado, reevaluación con vínculo al
// run anterior, y un segundo presupuesto que crea otro perfil/run sin
// sustituir el anterior.
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
import { chromium, type BrowserContext, type Page } from 'playwright';
import { hashSessionToken } from '../../lib/server/auth/session.ts';
import { runMigrations } from '../../lib/server/db/migrate.ts';
import { closePools, getAppPool } from '../../lib/server/db/pool.ts';
import { loadCuratedCatalog } from '../../lib/server/catalog/store.ts';
import { FIXTURE_CURATION_MANIFEST } from '../../lib/server/catalog/fixture-manifest.ts';
import type { CurationManifest } from '../../lib/server/catalog/manifest.ts';
import type { ResearchHome } from '../../components/research-dashboard/research-types.ts';
import type { ComparisonRunResult, DecisionRead, EvaluationRunView, EvaluationStartInput } from '../../lib/api/atlas-client.ts';

const FRONTEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
for (const [key, value] of Object.entries({
  GROWTHX_ADMIN_DATABASE_URL: 'postgres://growthx:growthx@127.0.0.1:54329/growthx',
  GROWTHX_DATABASE_URL: 'postgres://growthx_app:growthx_app_dev@127.0.0.1:54329/growthx',
  GROWTHX_WORKER_DATABASE_URL: 'postgres://growthx_worker:growthx_worker_dev@127.0.0.1:54329/growthx',
  GROWTHX_QUEUE_DATABASE_URL: 'postgres://growthx_queue:growthx_queue_dev@127.0.0.1:54329/growthx',
})) if (!process.env[key]) process.env[key] = value;
// Ningún proveedor pagado: la redacción del run de comparación degrada a
// deterministic_only sin red, y ninguna lectura puede salir a Exa/Apify/Luma.
for (const key of ['GEMINI_API_KEY', 'EXA_API_KEY', 'APIFY_TOKEN']) delete process.env[key];

const SUMMIT = 'ed-sf-dev-summit-2027';
const ML_NIGHT = 'ed-ml-night-2026';
const QUOTED = 'ed-e2e-quoted';
const COMPARED = [SUMMIT, ML_NIGHT, QUOTED].sort();
const EXTERNAL = /api\.exa|apify|generativelanguage|lu\.ma|luma\.com|\/api\/opportunities\/search|\/api\/events\/ingest/;

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
  const slug = `reopen-e2e-${randomUUID()}`;
  const tenant = await admin.query('insert into growthx.tenants(slug,display_name) values($1,$1) returning id', [slug]);
  const user = await admin.query('insert into growthx.app_users(email,display_name) values($1,$1) returning id', [`${slug}@test.local`]);
  const tenantId = tenant.rows[0].id as string, userId = user.rows[0].id as string;
  const token = randomBytes(24).toString('hex');
  await admin.query('insert into growthx.memberships(tenant_id,user_id) values($1,$2)', [tenantId,userId]);
  await admin.query("insert into growthx.sessions(token_hash,user_id,tenant_id,expires_at) values($1,$2,$3,now()+interval '2 hours')", [hashSessionToken(token),userId,tenantId]);
  return { tenantId,userId,token };
}
// Catálogo sintético controlado: el fixture de 09 con fechas relativas a esta
// ejecución más una edición de SF con costo COTIZADO (USD 1500, con fuente):
// con presupuesto no declarado queda condicionada; con 500 USD declarados
// queda excluida por conflicto confirmado. Así un segundo presupuesto produce
// otra evaluación distinguible, nunca una sustitución de la primera.
function controlledCatalog(futureYear: number): CurationManifest {
  const fixture = structuredClone(FIXTURE_CURATION_MANIFEST);
  for (const edition of fixture.editions) {
    if (edition.startDate.precision === 'instant' && edition.startDate.iso.startsWith('2027')) edition.startDate.iso = edition.startDate.iso.replace('2027', String(futureYear));
    if (edition.startDate.precision === 'date_only' && edition.startDate.date.startsWith('2026')) edition.startDate.date = `${futureYear}-10-01`;
  }
  for (const claim of fixture.claims) if (claim.value.kind === 'date' && claim.value.date.precision === 'instant' && claim.value.date.iso.startsWith('2027')) claim.value.date.iso = claim.value.date.iso.replace('2027', String(futureYear));
  fixture.sources.push({ ...fixture.sources[0], id: 'src-e2e-quoted', url: 'https://quoted.example/sf-night', locator: 'sección «Sponsors»', content: { kind: 'excerpt', excerpt: 'Quoted SF Night — sponsorship USD 1500, open registration, San Francisco.' } });
  const base = fixture.claims.find(c => c.id === 'clm-summit-access-r1')!;
  const subject = { type: 'edition' as const, editionId: QUOTED };
  fixture.claims.push(
    { ...base, id: 'clm-e2e-quoted-loc-r1', claimId: 'clm-e2e-quoted-loc', subject, attribute: 'location', value: { kind: 'location', scope: 'city', name: 'San Francisco' }, status: 'observed', sourceIds: ['src-e2e-quoted'] },
    { ...base, id: 'clm-e2e-quoted-access-r1', claimId: 'clm-e2e-quoted-access', subject, attribute: 'access', value: { kind: 'text', text: 'Registro abierto según el listado' }, status: 'observed', sourceIds: ['src-e2e-quoted'] },
    { ...base, id: 'clm-e2e-quoted-cost-r1', claimId: 'clm-e2e-quoted-cost', subject, attribute: 'cost:sponsorship', value: { kind: 'money', amount: 1500, currency: 'USD' }, status: 'observed', sourceIds: ['src-e2e-quoted'] },
  );
  fixture.editions.push({ ...fixture.editions[0], id: `${QUOTED}-r1`, editionId: QUOTED, organizerIds: ['org-bay-builders'], name: 'Quoted SF Night (synthetic)', canonicalUrl: 'https://quoted.example/sf-night', startDate: { precision: 'instant', iso: `${futureYear}-04-15T18:00:00-07:00`, timezone: 'America/Los_Angeles' }, location: { scope: 'city', name: 'San Francisco' }, coordinates: null, claimRevisionIds: ['clm-e2e-quoted-loc-r1', 'clm-e2e-quoted-access-r1', 'clm-e2e-quoted-cost-r1'] });
  return fixture;
}
const researchBody = (overrides: Partial<EvaluationStartInput['profile']> = {}, extra: Partial<EvaluationStartInput> = {}): EvaluationStartInput => ({ idempotencyKey: randomUUID(), mode: 'catalog_research', researchScope: 'sf_organizers', ...extra, profile: { product: 'Herramienta de agentes', audienceDescription: 'Equipos backend', audienceProfiles: [], stack: ['python'], budget: { status: 'unknown' }, window: { from: null, to: null }, objective: { kind: 'feedback' }, comparableCompanies: [], ...overrides } });
const href = (runId: string, decisionId?: string, view?: 'campaign') => `/?run=${encodeURIComponent(runId)}${decisionId ? `&decision=${encodeURIComponent(decisionId)}` : ''}${view ? `&view=${view}` : ''}`;

test('SF: reabrir la decisión exacta desde el dashboard (navegador, Next reiniciado, PostgreSQL y worker reales)', { timeout: 540000 }, async t => {
  const admin = new pg.Client({ connectionString: process.env.GROWTHX_ADMIN_DATABASE_URL, connectionTimeoutMillis: 3000 });
  await admin.connect();
  await runMigrations();
  const tenant = await seedTenant(admin), decoy = await seedTenant(admin);
  const futureYear = new Date().getUTCFullYear() + 1;
  const fixture = controlledCatalog(futureYear);
  await loadCuratedCatalog(getAppPool(), tenant.tenantId, fixture);
  const temp = mkdtempSync(path.join(tmpdir(), 'growthx-reopen-e2e-'));
  cpSync(FRONTEND, temp, { recursive: true, filter: file => !['node_modules','.next','.env.local','.env','tests','.git'].includes(path.basename(file)) });
  symlinkSync(path.join(FRONTEND,'node_modules'), path.join(temp,'node_modules'), 'dir');
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
    await admin.query("update pgboss.job set state = 'cancelled' where state in ('created','retry') and data->>'tenantId' = any($1)", [[tenant.tenantId, decoy.tenantId]]);
    for (const seeded of [tenant, decoy]) {
      for (const table of ['campaign_drafts','decisions','snapshot_narratives','snapshots','organizer_research','run_logs','run_steps','runs','profiles','claim_revision_sources','claim_revisions','claims','participation_revisions','participations','edition_revisions','event_editions','organizer_revisions','organizers','sources','companies','catalog_loads','sessions','memberships'])
        await admin.query(`delete from growthx.${table} where tenant_id=$1`, [seeded.tenantId]);
      await admin.query('delete from growthx.tenants where id=$1', [seeded.tenantId]);
      await admin.query('delete from growthx.app_users where id=$1', [seeded.userId]);
    }
    await admin.end(); rmSync(temp, { recursive: true, force: true });
  });

  // ---- Utilidades HTTP (sesión del tenant real) ----
  const api = (pathname: string, init: RequestInit = {}) => fetch(`${base}${pathname}`, { ...init, headers: { authorization: `Bearer ${tenant.token}`, 'content-type': 'application/json', ...(init.headers ?? {}) } });
  const readRun = async (id: string): Promise<EvaluationRunView> => { const r = await api(`/api/evaluations/${id}`); const text = await r.text(); assert.equal(r.status, 200, text); return JSON.parse(text); };
  const complete = (id: string) => eventually(async () => { const r = await readRun(id); if (r.state === 'failed') throw new Error(r.error ?? worker?.log()); return r.state === 'completed' ? r : null; }, `worker completó ${id}`, 90000);
  const accept = async (body: unknown, pathname = '/api/evaluations'): Promise<string> => { const r = await api(pathname, { method: 'POST', body: JSON.stringify(body) }); const text = await r.text(); assert.equal(r.status, 202, text); return JSON.parse(text).runId; };
  const comparisonOf = (run: EvaluationRunView) => run.result as ComparisonRunResult;
  const counts = async () => {
    const n = async (table: string) => (await admin.query(`select count(*)::int as n from growthx.${table} where tenant_id=$1`, [tenant.tenantId])).rows[0].n as number;
    const jobs = (await admin.query("select count(*)::int as n from pgboss.job where data->>'tenantId' = $1", [tenant.tenantId])).rows[0].n as number;
    return { runs: await n('runs'), snapshots: await n('snapshots'), decisions: await n('decisions'), campaigns: await n('campaign_drafts'), claims: await n('claim_revisions'), profiles: await n('profiles'), jobs };
  };
  const capture = async (page: Page, name: string) => {
    if (process.env.GROWTHX_E2E_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.GROWTHX_E2E_SCREENSHOT_DIR, `${name}.png`), fullPage: true });
  };
  // Contador del proveedor: toda llamada externa (o al pipeline mundial/al
  // importador) se aborta y se cuenta; durante las fases de LECTURA también
  // cualquier escritura HTTP (POST/PATCH) del navegador.
  const forbidden: string[] = [], errors: string[] = [];
  let readOnlyPhase = false;
  const armContext = async (context: BrowserContext) => {
    await context.addCookies([{ name: 'growthx_session', value: tenant.token, url: base, httpOnly: true }]);
    await context.route('**/*', route => {
      const request = route.request(), url = request.url();
      if (EXTERNAL.test(url) || (readOnlyPhase && request.method() !== 'GET' && url.includes('/api/'))) { forbidden.push(`${request.method()} ${url}`); return route.abort(); }
      return route.continue();
    });
  };
  const newPage = async (context: BrowserContext) => { const page = await context.newPage(); page.setDefaultTimeout(20000); page.on('pageerror', e => errors.push(e.message)); return page; };
  const panel = (page: Page) => page.getByTestId('comparison-panel');
  const candidate = (page: Page, editionId: string) => panel(page).locator(`[data-edition-id="${editionId}"]`);
  const nav = (page: Page, name: string) => page.getByRole('navigation').getByRole('button', { name, exact: true }).click();

  // ---- Investigación (perfil v1, presupuesto no declarado) y comparación ----
  worker = processRunner(['worker/index.ts'], FRONTEND);
  const researchId = await accept(researchBody());
  await complete(researchId);
  const cmpId = await accept({ idempotencyKey: randomUUID(), mode: 'investment_comparison', profileRunId: researchId, editionIds: COMPARED });
  const cmpRun = await complete(cmpId);
  const cmp = comparisonOf(cmpRun);
  assert.equal(cmp.kind, 'investment_comparison');
  const statusOf = (result: ComparisonRunResult, editionId: string) => result.bundle.snapshot.alternatives.find(a => a.editionId === editionId)!.eligibility.status;
  // La cola pg-boss es compartida: si otro worker (p. ej. uno de desarrollo
  // con claves reales) procesara los runs de esta prueba, la redacción no
  // degradaría por «clave ausente». Se exige esa degradación para que el
  // test falle explícitamente en vez de dejar pasar llamadas al proveedor.
  const assertProcessedWithoutProviders = (result: ComparisonRunResult) => {
    assert.equal(result.narrative?.status, 'deterministic_only', 'la redacción degradó sin red');
    assert.match(result.narrative?.motive ?? '', /GEMINI_API_KEY ausente/, 'un worker ajeno con claves procesó el run (cola compartida): apagá tu worker de desarrollo para correr este e2e');
  };
  assertProcessedWithoutProviders(cmp);
  assert.equal(statusOf(cmp, SUMMIT), 'conditional');
  assert.equal(statusOf(cmp, QUOTED), 'conditional', 'sin presupuesto declarado el costo cotizado no excluye');

  let decision: DecisionRead, discard: DecisionRead;
  let campaignId = '', summitStateLabel = '', internalLink = '';
  let baseline: Awaited<ReturnType<typeof counts>>;

  await t.test('guardar una elección condicional, ver su campaña y copiar el enlace interno', async () => {
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await armContext(context);
    const page = await newPage(context);
    await page.goto(`${base}${href(cmpId)}`);
    await panel(page).waitFor();
    assert.equal(await page.getByTestId('comparison-snapshot-id').innerText(), cmp.snapshotId);
    // La lectura de decisiones termina antes de ofrecer «Registrar decisión»:
    // «leyendo» ≠ «no hay decisión».
    await candidate(page, SUMMIT).getByTestId('decision-open').waitFor();
    assert.equal(await page.getByTestId('decision-loading').count(), 0);
    summitStateLabel = await candidate(page, SUMMIT).getByTestId('candidate-state').innerText();
    assert.equal(summitStateLabel, 'Condicionado');
    const summit = candidate(page, SUMMIT);
    await summit.getByTestId('decision-open').click();
    await summit.getByLabel('Motivos de la decisión').fill('Audiencia backend declarada\nCosto por confirmar con el organizador');
    await summit.getByText('Agregar condición (pregunta al organizador').click();
    await summit.getByLabel('Dato pendiente').fill('Tarifa de patrocinio');
    await summit.getByLabel('Pregunta al organizador').fill('¿Cuál es la tarifa del tier principal?');
    await summit.getByLabel('Respuesta esperada').fill('Un tarifario con monto y moneda');
    await summit.getByLabel('Efecto sobre la decisión').selectOption('discarded');
    await summit.getByLabel('Responsable').fill('Julian');
    await summit.getByLabel('Plazo').fill(`${futureYear}-01-31`);
    await summit.getByRole('button', { name: 'Agregar condición', exact: true }).click();
    const saving = page.waitForResponse(r => r.url().endsWith('/api/decisions') && r.request().method() === 'POST');
    await summit.getByTestId('decision-save').click();
    assert.equal((await saving).status(), 201);
    // Elegir abre la campaña persistida con su identidad de origen.
    const campaign = page.getByTestId('campaign-draft-panel');
    await campaign.waitFor();
    campaignId = await page.getByTestId('campaign-draft-id').innerText();
    const decisionId = await page.getByTestId('campaign-draft-decision-id').innerText();
    assert.equal(await page.getByTestId('campaign-draft-snapshot-id').innerText(), cmp.snapshotId);
    assert.equal(await page.getByTestId('campaign-draft-revision').innerText(), '1');
    internalLink = (await page.getByTestId('campaign-link').getAttribute('href'))!;
    assert.equal(internalLink, href(cmpId, decisionId, 'campaign'));
    assert.equal(new URL(page.url()).search, internalLink.slice(1));
    await capture(page, 'reopen-campaign');
    // Lo leído por la API es exactamente lo guardado.
    const read = await api(`/api/decisions/${decisionId}`); assert.equal(read.status, 200);
    decision = await read.json();
    assert.equal(decision.decisionId, decisionId); assert.equal(decision.snapshotId, cmp.snapshotId); assert.equal(decision.editionId, SUMMIT);
    assert.equal(decision.decision.verdict, 'chosen'); assert.equal(decision.decision.revision, 1); assert.equal(decision.campaign?.id, campaignId);
    assert.ok(decision.decision.conditions.some(c => c.description.includes('Tarifa de patrocinio') && c.owner === 'Julian'));
    // Descarte de otra alternativa con su propio motivo (no es outcome).
    await page.getByRole('button', { name: 'Volver a la comparación' }).click();
    const night = candidate(page, ML_NIGHT);
    await night.getByTestId('decision-open').click();
    await night.getByLabel('Descartar').check();
    await night.getByLabel('Motivos de la decisión').fill('Sin fuente urbana ni acceso confirmado');
    await night.getByTestId('decision-save').click();
    await night.getByTestId('decision-state').waitFor();
    assert.equal(await night.getByTestId('decision-state').innerText(), 'Descartada');
    discard = await (await api(`/api/decisions/${await night.getByTestId('decision-id').innerText()}`)).json();
    assert.equal(discard.campaign, null);
    baseline = await counts();
    assert.equal(baseline.decisions, 2); assert.equal(baseline.campaigns, 1); assert.equal(baseline.snapshots, 1);
    // Cerrar el contexto del navegador (la pestaña) y apagar Next y el worker.
    await context.close();
    await stop(worker!.child); worker = null;
    await stop(next.child);
  });

  let context: BrowserContext, page: Page;
  await t.test('reiniciar Next y reabrir por el enlace interno: mismos IDs, motivos, claims y campaña; cero llamadas externas', async () => {
    next = await startNext(); base = next.base;
    readOnlyPhase = true;
    context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await armContext(context);
    page = await newPage(context);
    await page.goto(`${base}${internalLink}`);
    const campaign = page.getByTestId('campaign-draft-panel');
    await campaign.waitFor();
    assert.equal(await page.getByTestId('campaign-draft-id').innerText(), campaignId);
    assert.equal(await page.getByRole('heading', { level: 1 }).innerText(), 'Decisiones', 'el enlace de campaña abre la sección correspondiente');
    assert.equal(await page.getByTestId('campaign-draft-decision-id').innerText(), decision.decisionId);
    assert.equal(await page.getByTestId('campaign-draft-snapshot-id').innerText(), cmp.snapshotId);
    assert.equal(await page.getByTestId('campaign-draft-revision').innerText(), '1');
    assert.match(await page.getByTestId('campaign-draft-meta').innerText(), new RegExp(`Run ${cmpId}`));
    assert.match(await campaign.innerText(), /partida desconocida queda pendiente/);
    await page.getByRole('button', { name: 'Volver a la comparación' }).click();
    await panel(page).waitFor();
    assert.equal(new URL(page.url()).search, href(cmpId, decision.decisionId).slice(1));
    assert.equal(await page.getByTestId('comparison-snapshot-id').innerText(), cmp.snapshotId);
    const summit = candidate(page, SUMMIT);
    const block = summit.getByTestId('candidate-decision');
    await block.waitFor();
    assert.equal(await block.getAttribute('data-decision-id'), decision.decisionId);
    assert.equal(await summit.getByTestId('decision-state').innerText(), 'Elegida · elección condicional');
    assert.equal(await summit.getByTestId('decision-revision').innerText(), '1');
    assert.equal(await summit.getByTestId('decision-decided-at').innerText(), decision.decision.decidedAt, 'fecha original de la revisión');
    const blockText = await block.innerText();
    for (const reason of decision.decision.reasons) assert.ok(blockText.includes(reason), `motivo «${reason}» visible`);
    assert.match(blockText, /Tarifa de patrocinio.*Responsable: Julian/);
    assert.equal(await summit.getByTestId('decision-link').getAttribute('href'), href(cmpId, decision.decisionId));
    // Evidencia con su revisión/fecha original: claims fijados por el snapshot
    // y fuentes con su fecha de obtención (no «hoy»).
    const fixed = await summit.getByTestId('candidate-fixed-revisions').innerText();
    for (const id of ['clm-summit-access-r1', 'clm-summit-cost-r1']) assert.ok(fixed.includes(id), `claim ${id} fijado`);
    assert.match(fixed, /edición ed-sf-dev-summit-2027-r1/);
    assert.match(await summit.innerText(), /obtained 2026-09-08/);
    assert.equal(await summit.getByTestId('candidate-state').innerText(), summitStateLabel);
    assert.equal(await candidate(page, ML_NIGHT).getByTestId('decision-state').innerText(), 'Descartada');
    assert.equal(await candidate(page, QUOTED).getByTestId('decision-open').count(), 1, 'sin decisión ≠ error');
    assert.equal(await page.getByTestId('current-validity-notice').count(), 0, 'todavía vigente: sin aviso');
    await capture(page, 'reopen-decision');
    // Cero llamadas a proveedores y ninguna escritura: ni el navegador ni el
    // servidor crearon runs, snapshots, decisiones, claims ni jobs; el worker
    // está apagado.
    assert.equal(worker, null);
    assert.deepEqual(await counts(), baseline);
    assert.deepEqual(forbidden, []);
    // Errores distinguibles de «no hay decisión» (misma autorización en todas
    // las rutas del slice).
    assert.equal((await api(`/api/decisions/${decision.decisionId}`)).status, 200);
    assert.equal((await api('/api/decisions/no-es-uuid')).status, 400);
    assert.equal((await api(`/api/decisions/${randomUUID()}`)).status, 404);
    assert.equal((await api('/api/decisions?snapshotId=no-es-uuid')).status, 400);
    assert.equal((await api('/api/evaluations?profileId=no-es-uuid')).status, 400);
    assert.equal((await fetch(`${base}/api/decisions/${decision.decisionId}`)).status, 401);
    const decoyHeaders = { authorization: `Bearer ${decoy.token}` };
    assert.equal((await fetch(`${base}/api/decisions/${decision.decisionId}`, { headers: decoyHeaders })).status, 404);
    assert.equal((await fetch(`${base}/api/evaluations/${cmpId}`, { headers: decoyHeaders })).status, 404);
    const decoyHome: ResearchHome = await (await fetch(`${base}/api/evaluations?profileId=${cmpRun.profileId}`, { headers: decoyHeaders })).json();
    assert.deepEqual(decoyHome.evaluations, []); assert.deepEqual(decoyHome.evaluationProfiles, []);
    assert.deepEqual((await (await fetch(`${base}/api/decisions?snapshotId=${cmp.snapshotId}`, { headers: decoyHeaders })).json()).decisions, []);
  });

  await t.test('navegar fuera de una comparación o campaña muestra solo la sección elegida; la lista recupera la misma decisión', async () => {
    for (const section of ['Perfil', 'Eventos', 'Organizadores', 'Resumen']) {
      await nav(page, section);
      assert.equal(await page.getByRole('heading', { level: 1 }).innerText(), section);
      assert.equal(await panel(page).count(), 0, `la comparación no ocupa la sección ${section}`);
      assert.equal(await page.getByTestId('campaign-draft-panel').count(), 0, `la campaña no ocupa la sección ${section}`);
    }
    await nav(page, 'Decisiones');
    const savedChosen = page.getByTestId('evaluation-list').locator(`[data-decision-id="${decision.decisionId}"]`);
    await savedChosen.getByRole('button', { name: `Abrir campaña ${campaignId}`, exact: true }).click();
    await page.getByTestId('campaign-draft-panel').waitFor();
    assert.equal(await page.getByTestId('campaign-draft-id').innerText(), campaignId);
    assert.equal(await page.getByRole('heading', { level: 1 }).innerText(), 'Decisiones');
    await nav(page, 'Perfil');
    assert.equal(await page.getByTestId('campaign-draft-panel').count(), 0, 'editar el perfil oculta la campaña abierta');
    assert.equal(await panel(page).count(), 0);
    await nav(page, 'Decisiones');
    // Si la lectura del run llega después de navegar, no recupera el panel
    // por encima de la sección que el usuario acaba de elegir.
    let releaseRead!: () => void, readStarted!: () => void;
    const heldRead = new Promise<void>(resolve => { releaseRead = resolve; });
    const requestedRead = new Promise<void>(resolve => { readStarted = resolve; });
    const runUrl = `${base}/api/evaluations/${cmpId}`;
    await page.route(runUrl, async route => { readStarted(); await heldRead; await route.continue(); });
    try {
      await savedChosen.getByRole('button', { name: 'Abrir decisión', exact: true }).click();
      await requestedRead;
      await nav(page, 'Perfil');
      const completedRead = page.waitForResponse(runUrl);
      releaseRead();
      await completedRead;
      await eventually(async () => (await page.getByTestId('run-progress').innerText()).includes('Completado') ? true : null, 'lectura demorada completada');
      assert.equal(await page.getByRole('heading', { level: 1 }).innerText(), 'Perfil');
      assert.equal(await panel(page).count(), 0, 'la lectura demorada respeta la navegación posterior');
    } finally {
      releaseRead();
      await page.unroute(runUrl);
    }
    await nav(page, 'Decisiones');
    await savedChosen.getByRole('button', { name: 'Abrir decisión', exact: true }).click();
    await candidate(page, SUMMIT).getByTestId('candidate-decision').waitFor();
    assert.equal(await page.getByTestId('comparison-snapshot-id').innerText(), cmp.snapshotId);
    assert.equal(await candidate(page, SUMMIT).getByTestId('decision-revision').innerText(), '1');
    assert.equal(new URL(page.url()).search, href(cmpId, decision.decisionId).slice(1));

    // La restauración del enlace tampoco puede esperar al historial y
    // apropiarse de una navegación hecha mientras esa primera lectura tarda.
    const opening = await newPage(context);
    let releaseHome!: () => void, homeStarted!: () => void;
    const heldHome = new Promise<void>(resolve => { releaseHome = resolve; });
    const requestedHome = new Promise<void>(resolve => { homeStarted = resolve; });
    const homeUrl = `${base}/api/evaluations`;
    await opening.route(homeUrl, async route => { homeStarted(); await heldHome; await route.continue(); });
    try {
      await opening.goto(`${base}${href(cmpId, decision.decisionId)}`);
      await requestedHome;
      await nav(opening, 'Perfil');
      const completedHome = opening.waitForResponse(homeUrl);
      releaseHome();
      await completedHome;
      await eventually(async () => (await opening.getByTestId('run-progress').innerText()).includes('Completado') ? true : null, 'run restaurado con historial demorado');
      assert.equal(await opening.getByRole('heading', { level: 1 }).innerText(), 'Perfil', 'restaurar el enlace respeta la navegación durante la lectura inicial del historial');
      assert.equal(await panel(opening).count(), 0);
      await nav(opening, 'Decisiones');
      await panel(opening).waitFor();
      assert.equal(await opening.getByTestId('comparison-snapshot-id').innerText(), cmp.snapshotId, 'el run se carga aunque haya cambiado la sección');
    } finally {
      releaseHome();
      await opening.close();
    }
    assert.deepEqual(await counts(), baseline);
    assert.deepEqual(forbidden, []);
  });

  await t.test('lista de evaluaciones por identidad y regreso dashboard → organizador → evento → campaña', async () => {
    await nav(page, 'Decisiones');
    const list = page.getByTestId('evaluation-list');
    await list.waitFor();
    const rows = list.locator('[data-testid="saved-evaluation"]');
    assert.equal(await rows.count(), 1);
    assert.equal(await rows.first().getAttribute('data-run-id'), cmpId);
    assert.equal(await rows.first().getAttribute('data-snapshot-id'), cmp.snapshotId);
    assert.match(await rows.first().getByTestId('saved-evaluation-profile').innerText(), /Herramienta de agentes · perfil v1 · presupuesto no declarado · objetivo feedback/);
    assert.match(await rows.first().innerText(), /SF Dev Summit 2027 \(synthetic\)/);
    const savedDecisions = rows.first().locator('[data-testid="saved-decision"]');
    assert.equal(await savedDecisions.count(), 2);
    const savedChosen = rows.first().locator(`[data-decision-id="${decision.decisionId}"]`);
    assert.equal(await savedChosen.getAttribute('data-revision'), '1');
    assert.equal(await savedChosen.getAttribute('data-campaign-id'), campaignId);
    assert.match(await savedChosen.innerText(), /Elegida · elección condicional · revisión 1/);
    assert.equal(await savedChosen.getByTestId('decision-link').getAttribute('href'), href(cmpId, decision.decisionId));
    await savedChosen.getByRole('button', { name: 'Abrir decisión', exact: true }).click();
    await candidate(page, SUMMIT).getByTestId('candidate-decision').waitFor();
    assert.equal(new URL(page.url()).search, href(cmpId, decision.decisionId).slice(1));
    // Organizador → evento → volver: la selección persiste y el mapa no se abre.
    await candidate(page, SUMMIT).getByRole('button', { name: 'Abrir expediente del organizador' }).click();
    const dossier = page.getByTestId('organizer-dossier');
    await dossier.waitFor();
    assert.match(await dossier.innerText(), /org-bay-builders/);
    await dossier.getByRole('button', { name: 'SF Dev Summit 2027 (synthetic)', exact: true }).first().click();
    await page.getByTestId('edition-dossier').waitFor();
    assert.match(await page.getByTestId('edition-dossier').innerText(), /ed-sf-dev-summit-2027/);
    assert.equal(await page.getByTestId('sf-map').count(), 0);
    await page.getByRole('button', { name: 'Volver a decisiones' }).click();
    await candidate(page, SUMMIT).getByTestId('candidate-decision').waitFor();
    assert.equal(await candidate(page, SUMMIT).getByTestId('decision-revision').innerText(), '1');
    await candidate(page, SUMMIT).getByTestId('open-campaign').click();
    await page.getByTestId('campaign-draft-panel').waitFor();
    assert.equal(await page.getByTestId('campaign-draft-id').innerText(), campaignId);
    assert.equal(new URL(page.url()).search, internalLink.slice(1));
    await page.getByRole('button', { name: 'Volver a la comparación' }).click();
    await panel(page).waitFor();
    assert.equal(await page.getByTestId('sf-map').count(), 0);
    assert.deepEqual(await counts(), baseline);
    assert.deepEqual(forbidden, []);
  });

  await t.test('vigencia actual con reloj controlado: aviso sin alterar el resultado histórico', async () => {
    // El reloj fijo es por contexto del navegador: se aísla en uno propio para
    // no contaminar la sesión principal (Date.now() sigue siendo real allí).
    const laterContext = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await armContext(laterContext);
    await laterContext.clock.setFixedTime(new Date(Date.UTC(futureYear + 2, 0, 15, 12, 0, 0)));
    const later = await newPage(laterContext);
    await later.goto(`${base}${href(cmpId, decision.decisionId)}`);
    await panel(later).waitFor();
    const summit = candidate(later, SUMMIT);
    await summit.getByTestId('candidate-decision').waitFor();
    assert.match(await later.getByTestId('comparison-read-at').innerText(), new RegExp(`^${futureYear + 2}-01-15`));
    const notice = summit.getByTestId('current-validity-notice');
    assert.equal(await notice.count(), 1);
    assert.match(await notice.innerText(), /ya pasó respecto de la lectura/);
    assert.match(await notice.innerText(), /no se altera/);
    assert.equal(await summit.getByTestId('candidate-state').innerText(), summitStateLabel, 'el estado histórico no cambia');
    assert.equal(await summit.getByTestId('decision-revision').innerText(), '1');
    assert.equal(await later.getByTestId('comparison-snapshot-id').innerText(), cmp.snapshotId);
    await capture(later, 'reopen-validity');
    await laterContext.close();
    assert.deepEqual(await counts(), baseline);
    assert.deepEqual(forbidden, []);
  });

  let reevalId = '';
  await t.test('reevaluar crea otro run vinculado; la decisión previa sigue disponible sin ediciones encubiertas', async () => {
    readOnlyPhase = false;
    worker = processRunner(['worker/index.ts'], FRONTEND);
    // Vínculo inválido → 400 (no un run huérfano).
    assert.equal((await api('/api/evaluations', { method: 'POST', body: JSON.stringify({ idempotencyKey: randomUUID(), mode: 'investment_comparison', profileRunId: researchId, editionIds: COMPARED, previousRunId: randomUUID() }) })).status, 400);
    const accepting = page.waitForResponse(r => r.url().endsWith('/api/evaluations') && r.request().method() === 'POST');
    await page.getByTestId('reevaluate').click();
    assert.equal((await accepting).status(), 202);
    reevalId = await eventually(async () => { const id = new URL(page.url()).searchParams.get('run'); return id && id !== cmpId ? id : null; }, 'run de reevaluación');
    const reevalRun = await complete(reevalId);
    assert.equal(reevalRun.previousRunId, cmpId);
    const reeval = comparisonOf(reevalRun);
    assertProcessedWithoutProviders(reeval);
    assert.notEqual(reeval.snapshotId, cmp.snapshotId);
    assert.equal(reeval.bundle.profile.id, cmpRun.profile.id, 'mismo perfil');
    await page.getByTestId('reevaluation-note').waitFor();
    assert.match(await page.getByTestId('reevaluation-note').innerText(), new RegExp(cmpId));
    assert.equal(await page.getByTestId('comparison-snapshot-id').innerText(), reeval.snapshotId);
    const summit = candidate(page, SUMMIT);
    await summit.getByTestId('previous-decision').waitFor();
    assert.equal(await summit.getByTestId('previous-decision').getAttribute('data-decision-id'), decision.decisionId);
    assert.match(await summit.getByTestId('previous-decision').innerText(), /Elegida · elección condicional · revisión 1/);
    assert.equal(await summit.getByTestId('decision-open').count(), 1, 'el nuevo snapshot no tiene decisión propia');
    // La decisión y el snapshot anteriores quedaron intactos.
    const previousRead: DecisionRead = await (await api(`/api/decisions/${decision.decisionId}`)).json();
    assert.deepEqual(previousRead, decision);
    assert.deepEqual((await readRun(cmpId)).result, cmpRun.result);
    const after = await counts();
    assert.equal(after.decisions, baseline.decisions); assert.equal(after.snapshots, baseline.snapshots + 1); assert.equal(after.runs, baseline.runs + 1);
    // Navegar a ambas versiones.
    await summit.getByRole('button', { name: 'Abrir la decisión previa' }).click();
    await candidate(page, SUMMIT).getByTestId('candidate-decision').waitFor();
    assert.equal(new URL(page.url()).search, href(cmpId, decision.decisionId).slice(1));
    assert.equal(await page.getByTestId('comparison-snapshot-id').innerText(), cmp.snapshotId);
    assert.equal(await candidate(page, SUMMIT).getByTestId('decision-revision').innerText(), '1');
    await nav(page, 'Decisiones');
    const rows = page.getByTestId('evaluation-list').locator('[data-testid="saved-evaluation"]');
    await eventually(async () => (await rows.count()) === 2 ? true : null, 'lista con las dos evaluaciones');
    const reevalRow = page.getByTestId('evaluation-list').locator(`[data-run-id="${reevalId}"]`);
    assert.match(await reevalRow.getByTestId('saved-evaluation-previous').innerText(), new RegExp(cmpId.slice(0, 8)));
    await reevalRow.getByRole('button', { name: `Evaluación ${reevalId.slice(0, 8)}`, exact: true }).click();
    await page.getByTestId('reevaluation-note').waitFor();
    assert.equal(await page.getByTestId('comparison-snapshot-id').innerText(), reeval.snapshotId);
  });

  await t.test('un segundo presupuesto crea otro perfil y otro run; nunca sustituye el anterior', async () => {
    const research2 = await accept(researchBody({ budget: { status: 'declared', amount: 500, currency: 'USD' } }, { previousRunId: researchId }));
    const research2Run = await complete(research2);
    assert.equal(research2Run.profile.profileVersion, 2);
    const cmp2Id = await accept({ idempotencyKey: randomUUID(), mode: 'investment_comparison', profileRunId: research2, editionIds: COMPARED });
    const cmp2 = comparisonOf(await complete(cmp2Id));
    assertProcessedWithoutProviders(cmp2);
    assert.equal(statusOf(cmp2, QUOTED), 'excluded', 'con 500 USD declarados el costo cotizado de 1500 excluye');
    assert.equal(statusOf(cmp, QUOTED), 'conditional', 'el snapshot anterior no cambia');
    assert.deepEqual((await readRun(cmpId)).result, cmpRun.result);
    // Lista: tres evaluaciones; el filtro es por identidad de perfil.
    await nav(page, 'Decisiones');
    const list = page.getByTestId('evaluation-list');
    const rows = list.locator('[data-testid="saved-evaluation"]');
    await eventually(async () => (await rows.count()) === 3 ? true : null, 'tres evaluaciones');
    await page.getByLabel('Filtrar evaluaciones por perfil').selectOption(cmpRun.profileId);
    await eventually(async () => (await rows.count()) === 2 ? true : null, 'filtro perfil v1');
    assert.deepEqual(await rows.evaluateAll(elements => [...new Set(elements.map(e => e.getAttribute('data-profile-id')))]), [cmpRun.profileId]);
    await page.getByLabel('Filtrar evaluaciones por perfil').selectOption(research2Run.profileId);
    await eventually(async () => (await rows.count()) === 1 ? true : null, 'filtro perfil v2');
    assert.equal(await rows.first().getAttribute('data-run-id'), cmp2Id);
    assert.match(await rows.first().getByTestId('saved-evaluation-profile').innerText(), /perfil v2 · presupuesto USD 500/);
    assert.equal(await rows.first().locator('[data-testid="saved-decision"]').count(), 0);
    const filtered: ResearchHome = await (await api(`/api/evaluations?profileId=${cmpRun.profileId}`)).json();
    assert.deepEqual(filtered.evaluations.map(e => e.runId).sort(), [cmpId, reevalId].sort());
    assert.ok(filtered.evaluations.every(e => e.profile.version === 1));
    assert.equal(filtered.evaluationProfiles.length, 2);
    const chosenSummary = filtered.evaluations.find(e => e.runId === cmpId)!.decisions.find(d => d.decisionId === decision.decisionId)!;
    assert.deepEqual({ verdict: chosenSummary.verdict, revision: chosenSummary.revision, campaignId: chosenSummary.campaignId, decidedAt: chosenSummary.decidedAt }, { verdict: 'chosen', revision: 1, campaignId, decidedAt: decision.decision.decidedAt });
    await capture(page, 'reopen-list');
    assert.equal((await counts()).decisions, baseline.decisions);
    assert.deepEqual(forbidden, []); assert.deepEqual(errors, []);
  });

  await t.test('dos pestañas recuperan una revisión nueva tras conflicto; una lectura fallida conserva la respuesta y ofrece reintento', async () => {
    const current: DecisionRead = await (await api(`/api/decisions/${decision.decisionId}`)).json();
    const openConditions = current.decision.conditions.filter(condition => condition.status === 'open');
    assert.ok(openConditions.length >= 2, 'la decisión condicional tiene dos pendientes independientes');
    const [firstCondition, secondCondition] = openConditions;
    const firstNote = 'Respuesta documentada por la primera pestaña';
    const secondNote = 'Respuesta pendiente de guardar en la segunda pestaña';
    const decisionUrl = `${base}/api/decisions/${decision.decisionId}`;
    const firstTab = await newPage(context), secondTab = await newPage(context);
    const revision = (tab: Page, expected: number) => eventually(async () => (await candidate(tab, SUMMIT).getByTestId('decision-revision').innerText()) === String(expected) ? true : null, `revisión ${expected} visible`, 5000);
    const conditionRow = (tab: Page, description: string) => candidate(tab, SUMMIT).getByTestId('decision-conditions').getByRole('listitem').filter({ hasText: description });
    const beginResolution = async (tab: Page, description: string, note: string) => {
      const row = conditionRow(tab, description);
      await row.getByRole('button', { name: 'Marcar resuelta', exact: true }).click();
      await row.getByLabel('Respuesta que resuelve la condición').fill(note);
      return row;
    };
    try {
      await Promise.all([firstTab.goto(`${base}${href(cmpId, decision.decisionId)}`), secondTab.goto(`${base}${href(cmpId, decision.decisionId)}`)]);
      await Promise.all([revision(firstTab, current.decision.revision), revision(secondTab, current.decision.revision)]);
      const firstRow = await beginResolution(firstTab, firstCondition.description, firstNote);
      let response = firstTab.waitForResponse(r => r.url() === decisionUrl && r.request().method() === 'PATCH');
      await firstRow.getByRole('button', { name: 'Confirmar resolución', exact: true }).click();
      assert.equal((await response).status(), 200);
      await revision(firstTab, current.decision.revision + 1);

      let failedReads = 0;
      await secondTab.route(decisionUrl, route => {
        if (route.request().method() !== 'GET') return route.continue();
        failedReads++;
        return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'unavailable' }) });
      });
      const secondRow = await beginResolution(secondTab, secondCondition.description, secondNote);
      response = secondTab.waitForResponse(r => r.url() === decisionUrl && r.request().method() === 'PATCH');
      await secondRow.getByRole('button', { name: 'Confirmar resolución', exact: true }).click();
      assert.equal((await response).status(), 409);
      await candidate(secondTab, SUMMIT).getByRole('alert').waitFor();
      assert.equal(failedReads, 1, 'el conflicto relee la decisión en vez de repetir indefinidamente la revisión obsoleta');
      assert.equal(await secondRow.getByLabel('Respuesta que resuelve la condición').inputValue(), secondNote, 'la respuesta escrita no se pierde si falla la lectura');
      assert.equal(await secondRow.getByRole('button', { name: 'Confirmar resolución', exact: true }).isDisabled(), true, 'no se reenvía una revisión conocida como obsoleta');
      await secondTab.unroute(decisionUrl);
      await candidate(secondTab, SUMMIT).getByRole('button', { name: 'Reintentar lectura de la decisión', exact: true }).click();
      await revision(secondTab, current.decision.revision + 1);
      assert.equal(await secondRow.getByLabel('Respuesta que resuelve la condición').inputValue(), secondNote);
      response = secondTab.waitForResponse(r => r.url() === decisionUrl && r.request().method() === 'PATCH');
      await secondRow.getByRole('button', { name: 'Confirmar resolución', exact: true }).click();
      assert.equal((await response).status(), 200);
      await revision(secondTab, current.decision.revision + 2);

      // La primera pestaña aún conserva la revisión anterior. Releer con
      // éxito tampoco sobrescribe la respuesta ya guardada por la segunda.
      const staleRow = await beginResolution(firstTab, secondCondition.description, 'Una respuesta escrita sobre la revisión anterior');
      response = firstTab.waitForResponse(r => r.url() === decisionUrl && r.request().method() === 'PATCH');
      await staleRow.getByRole('button', { name: 'Confirmar resolución', exact: true }).click();
      assert.equal((await response).status(), 409);
      await revision(firstTab, current.decision.revision + 2);
      assert.match(await staleRow.innerText(), new RegExp(secondNote));
      const latest: DecisionRead = await (await api(`/api/decisions/${decision.decisionId}`)).json();
      assert.equal(latest.decision.revision, current.decision.revision + 2);
      assert.equal(latest.decision.conditions.find(condition => condition.id === firstCondition.id)?.resolvedNote, firstNote);
      assert.equal(latest.decision.conditions.find(condition => condition.id === secondCondition.id)?.resolvedNote, secondNote);
      assert.deepEqual(latest.decision.reasons, current.decision.reasons);
      assert.deepEqual(forbidden, []); assert.deepEqual(errors, []);
    } finally {
      await firstTab.close();
      await secondTab.close();
    }
  });
  t.diagnostic(`Next reiniciado una vez; ${forbidden.length} llamadas prohibidas durante la lectura; catálogo sintético explícito.`);
});
