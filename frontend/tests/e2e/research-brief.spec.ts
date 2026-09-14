// DP-03: brief completo y selección común en navegador + PostgreSQL + worker.
// Se ejecuta con `pnpm test` y `pnpm test:e2e`. Requiere PostgreSQL local y
// Chromium (`pnpm exec playwright install chromium`). Sin infraestructura
// falla explícitamente: no acepta la durabilidad usando mocks o skips.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { cpSync, mkdtempSync, symlinkSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { chromium } from 'playwright';
import { CONTROLLED_MAP_STYLE } from '../fixtures/sf-map.ts';
import { hashSessionToken } from '../../lib/server/auth/session.ts';
import { runMigrations } from '../../lib/server/db/migrate.ts';
import { closePools, getAppPool } from '../../lib/server/db/pool.ts';
import { loadCuratedCatalog } from '../../lib/server/catalog/store.ts';
import { FIXTURE_CURATION_MANIFEST } from '../../lib/server/catalog/fixture-manifest.ts';
import type { EvaluationRunView } from '../../lib/api/atlas-client.ts';

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

test('DP03: editar brief, cambiar preguntas, guardar dos revisiones y reabrir; lista/pin/dossier', { timeout: 180000 }, async t => {
  const admin = new pg.Client({ connectionString: process.env.GROWTHX_ADMIN_DATABASE_URL }); await admin.connect(); await runMigrations();
  const tenant = await seedTenant(admin), decoy = await seedTenant(admin);
  await loadCuratedCatalog(getAppPool(), tenant.tenantId, structuredClone(FIXTURE_CURATION_MANIFEST));
  const temp = mkdtempSync(path.join(tmpdir(), 'growthx-dp03-e2e-'));
  cpSync(FRONTEND, temp, { recursive: true, filter: file => !['node_modules','.next','.env.local','.env','tests','.git'].includes(path.basename(file)) });
  symlinkSync(path.join(FRONTEND,'node_modules'), path.join(temp,'node_modules'), 'dir');
  const port = await freePort(), base = `http://127.0.0.1:${port}`;
  const next = processRunner([path.join(FRONTEND,'node_modules/next/dist/bin/next'), 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', String(port)], temp);
  const worker = processRunner(['worker/index.ts'], FRONTEND);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  t.after(async () => { await browser.close(); await stop(worker.child); await stop(next.child); await closePools(); await admin.end(); rmSync(temp, { recursive: true, force: true }); });
  await eventually(async () => { if (next.child.exitCode !== null) throw Error(next.log()); try { return (await fetch(base)).ok ? true : null; } catch { return null; } }, 'Next listo');
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await context.addCookies([{ name: 'growthx_session', value: tenant.token, url: base, httpOnly: true }]);
  await context.route('https://tiles.openfreemap.org/**', route => route.fulfill({ json: CONTROLLED_MAP_STYLE }));
  const page = await context.newPage(); page.setDefaultTimeout(20000);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const nav = (name: string) => page.getByRole('navigation').getByRole('button', { name, exact: true }).click();
  const capture = async (name: string) => { const dir = process.env.GROWTHX_E2E_SCREENSHOT_DIR; if (dir) { mkdirSync(dir, { recursive: true }); await page.screenshot({ path: path.join(dir, `brief-${name}.png`), fullPage: true }); } };
  const read = async (id: string): Promise<EvaluationRunView> => { const r = await context.request.get(`${base}/api/evaluations/${id}`); assert.equal(r.status(),200); return r.json(); };
  const complete = (id: string) => eventually(async () => { const r = await read(id); if (r.state === 'failed') throw Error(r.error ?? worker.log()); return r.state === 'completed' ? r : null; }, 'run completado');
  const save = async (previousId?: string) => {
    await page.getByRole('button', { name: 'Review brief', exact: true }).click();
    await capture(previousId ? 'review-v2' : 'review-v1');
    await page.getByRole('button', { name: 'Confirm and research SF' }).click();
    const id = await eventually(async () => { const id = new URL(page.url()).searchParams.get('run'); return id && id !== previousId ? id : null; }, 'run aceptado');
    return complete(id);
  };
  await page.goto(base); await page.getByTestId('research-coverage').waitFor(); await nav('Brief');
  await page.getByLabel('Product', { exact: true }).fill('Observabilidad para agentes');
  await page.getByLabel('Audience', { exact: true }).fill('Equipos que construyen agentes');
  await page.getByLabel('Stack and topics').fill('python');
  await page.getByRole('button', { name: 'Adoption', exact: true }).click();
  await page.getByLabel('Goal status').selectOption('confirmed');
  await page.getByLabel('Definition of success').fill('Instrumentar un proyecto voluntario');
  await page.getByLabel('Participation budget').fill('5000');
  await page.getByLabel('Currency', { exact: true }).fill('USD');
  await page.getByLabel('From', { exact: true }).fill('2026-09-10'); await page.getByLabel('To', { exact: true }).fill('2026-10-22');
  await page.getByLabel('Formats (').fill('workshop, hackathon');
  await page.getByLabel('Constraints (').fill('No comprar solo logo\nIntroducciones con opt-in');
  await page.getByLabel('Comparable company name').fill('Datadog'); await page.getByRole('button', { name: 'Add company', exact: true }).click();
  const questions1 = await page.getByTestId('brief-questions').innerText(); assert.match(questions1,/instrumentar/i); assert.match(questions1,/opt-in/);
  const first = await save();
  assert.equal(first.profile.objective.confirmation,'confirmed'); assert.equal(first.profile.objective.successDefinition.status,'defined');
  assert.deepEqual(first.profile.formats,['workshop','hackathon']); assert.deepEqual(first.profile.restrictions,['No comprar solo logo','Introducciones con opt-in']);
  assert.equal(first.profile.comparableCompanies[0].name,'Datadog');
  await page.reload(); await page.getByTestId('research-technical').locator('summary').first().click(); await page.getByTestId('saved-brief-questions').waitFor(); await nav('Brief');
  assert.equal(await page.getByLabel('Goal status').inputValue(),'confirmed'); assert.equal(await page.getByLabel('Definition of success').inputValue(),'Instrumentar un proyecto voluntario');
  await page.getByLabel('Product', { exact: true }).fill('Infraestructura de pagos'); await page.getByLabel('Audience', { exact: true }).fill('Ingenieros fintech');
  await page.getByRole('button', { name: 'Hiring', exact: true }).click(); await page.getByLabel('Currency', { exact: true }).fill('EUR');
  await page.getByLabel('Definition of success').fill('Conversaciones con candidatos de infraestructura');
  const questions2 = await page.getByTestId('brief-questions').innerText(); assert.notEqual(questions2, questions1); assert.match(questions2,/candidatos/); assert.match(questions2,/fintech/);
  await page.setViewportSize({ width: 390, height: 844 }); await capture('mobile');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'sin overflow horizontal');
  await page.setViewportSize({ width: 1366, height: 900 });
  const second = await save(first.runId);
  assert.equal(second.profile.profileVersion,2); assert.equal(second.previousRunId,first.runId);
  assert.deepEqual(second.researchPlan?.providerLimits,first.researchPlan?.providerLimits);
  assert.notDeepEqual(second.researchPlan?.questions,first.researchPlan?.questions);
  await page.goto(`${base}/?run=${second.runId}`); await page.getByTestId('research-technical').locator('summary').first().click(); await page.getByTestId('saved-brief-questions').waitFor(); await nav('Brief');
  assert.equal(await page.getByLabel('Currency', { exact: true }).inputValue(),'EUR'); assert.equal(await page.getByLabel('Audience', { exact: true }).inputValue(),'Ingenieros fintech');
  assert.deepEqual((await read(first.runId)).profile,first.profile);
  // The new discovery run must not display fixture editions as discoveries.
  // Check the existing list/map regression from an explicit catalog view.
  await nav('Events');
  assert.equal(await page.getByTestId('sf-edition-list').locator('[data-edition-id]').count(),0);
  await page.goto(base); await page.getByTestId('research-coverage').waitFor(); await nav('Events');
  const edition = page.getByTestId('sf-edition-list').locator('[data-edition-id="ed-sf-dev-summit-2027"]');
  const revisionId = await edition.getAttribute('data-edition-revision-id'); assert.ok(revisionId);
  await edition.locator('h3').getByRole('button').click(); assert.equal(await page.getByTestId('edition-dossier').getAttribute('data-edition-revision-id'),revisionId);
  await page.getByRole('button', { name: 'Close evidence' }).click(); await page.getByRole('button', { name: 'Map', exact: true }).click();
  await page.locator('[data-map-state="ready"]').waitFor().catch(async error => { throw new Error(`${error.message} · ${await page.getByTestId('sf-map').innerText()} · ${errors.join('; ')}`); });
  const pin = page.locator('[data-point-edition-id="ed-sf-dev-summit-2027"]'); assert.equal(await pin.getAttribute('aria-pressed'),'true'); assert.equal(await pin.getAttribute('data-edition-revision-id'),revisionId);
  await capture('selection'); await page.getByRole('button', {name:'Close map popup',exact:true}).click(); await pin.click(); await page.getByTestId('map-event-popup').getByRole('button', { name: 'Open dossier' }).click(); assert.equal(await page.getByTestId('edition-dossier').getAttribute('data-edition-revision-id'),revisionId);
  const other = await browser.newContext(); await other.addCookies([{name:'growthx_session',value:decoy.token,url:base,httpOnly:true}]);
  assert.equal((await other.request.get(`${base}/api/evaluations/${first.runId}`)).status(),404);
  assert.deepEqual(errors,[]); t.diagnostic('Dos briefs, dos revisiones reabiertas, objetivos/éxito/moneda conservados; identidad de lista/pin/dossier; 1366×900 y 390×844 sin overflow; HTTP tenant ajeno 404.');
});
