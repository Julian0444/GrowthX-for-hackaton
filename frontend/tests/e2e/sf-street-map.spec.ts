import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { startTestApp } from '../support/source-browser.ts';
import { CONTROLLED_MAP_STYLE, mapRead, mapRun, mapComparison } from '../fixtures/sf-map.ts';

// Actual production React/MapLibre/CSS/worker. Only HTTP data and cartography
// are controlled, so CI never depends on an external tiles provider.
test('DP-09 production street map: run, revisions, grouping, camera, keyboard, mobile and failures', { timeout: 180000 }, async t => {
  assert.ok(process.env.GROWTHX_ADMIN_DATABASE_URL && !process.env.GROWTHX_ADMIN_DATABASE_URL.includes(':54329/'), 'DP-09 isolated database only');
  assert.ok(process.env.DP05_PRODUCTION_DIR, 'Use the isolated production build');
  const app = await startTestApp(); const browser = await chromium.launch({ channel: 'chrome', headless: true });
  t.after(async () => { await app.close(); await browser.close(); t.diagnostic('Owned Next and Chrome closed.'); });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await context.newPage(); const errors: string[] = []; const assets = new Set<string>();
  page.on('pageerror', e => errors.push(e.message)); page.on('response', r => { if (r.url().includes('/maplibre/')) assets.add(`${r.status()} ${new URL(r.url()).pathname}`); });
  const a = mapRead('a'), b = mapRead('b', { approximate: true }), city = mapRead('city', { noPoint: true }), decoy = mapRead('catalog-only');
  let current = mapRun('live', [a, city], 'running');
  const other = mapRun('other', [city]); const saved = mapComparison('saved', [a]);
  const latest = structuredClone(a); latest.editionRevisions.push({ ...structuredClone(a.editionRevisions[0]), id: 'a-r2', previousRevisionId: 'a-r1', coordinates: { lng: -122.46, lat: 37.76 } });
  const catalog = [latest, b, city, decoy];
  let failure: 'none' | 'style' | 'tiles' = 'none';
  const fulfill = (route: import('playwright').Route, data: unknown) => route.fulfill({ json: data });
  await context.route('https://tiles.openfreemap.org/**', route => failure === 'style' ? route.abort('failed') : fulfill(route, failure === 'tiles' ? { version: 8, sources: { fail: { type: 'raster', tiles: ['https://dp09-tiles.invalid/{z}/{x}/{y}.png'], tileSize: 256 } }, layers: [{ id: 'fail', source: 'fail', type: 'raster' }] } : CONTROLLED_MAP_STYLE));
  await context.route('https://dp09-tiles.invalid/**', route => route.abort('failed'));
  await context.route('**/api/**', route => {
    const url = new URL(route.request().url()); const p = url.pathname;
    if (p === '/api/evaluations') return fulfill(route, { runs: [current, other, saved].map(r => ({ runId: r.runId, product: r.runId, profileVersion: 1, state: r.state, createdAt: r.createdAt })), companies: [], saved: [], coverage: { organizers: 0, editions: catalog.length, material: ['synthetic'], verifiedAt: [] }, evaluations: [], evaluationProfiles: [], evaluationFilter: { profileId: null } });
    if (p.startsWith('/api/evaluations/')) {
      const id = p.split('/')[3]; const run = [current, other, saved].find(r => r.runId === id);
      if (p.endsWith('/decisions')) return fulfill(route, { decisions: [] });
      return run ? fulfill(route, run) : route.fulfill({ status: 404, json: {} });
    }
    if (p === '/api/catalog/editions') return fulfill(route, { editions: catalog.map(r => ({ editionId: r.editionId })) });
    if (p.startsWith('/api/catalog/editions/')) return fulfill(route, catalog.find(r => r.editionId === p.split('/')[4]));
    return route.fulfill({ status: 404, json: {} });
  });
  const list = () => page.getByTestId('sf-edition-list');
  const nav = (name: string) => page.getByRole('navigation').getByRole('button', { name, exact: true }).click();
  const showMap = () => page.getByRole('button', { name: 'Map', exact: true }).click();
  const waitMap = () => page.locator('[data-testid="sf-map"][data-map-state="ready"]').waitFor();
  const shot = async (name: string) => { const out = process.env.DP09_EVIDENCE_DIR!; mkdirSync(path.join(out, 'screenshots'), { recursive: true }); await page.getByTestId('sf-map').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, 'screenshots', `${name}.png`) }); };
  const open = async (id: string) => { await page.goto(`${app.base}/?run=${id}`); await page.locator(`[data-testid="run-progress"][data-run-id="${id}"]`).waitFor(); await nav('Events'); };
  await t.test('same filtered set, published location, source link, selection and dossier by keyboard', async () => {
    await open('live'); await list().locator('[data-edition-id="a"]').waitFor(); assert.equal(await list().locator('article').count(), 2);
    assert.equal(await list().getByText('Evento catalog-only').count(), 0);
    await list().locator('[data-edition-id="a"]').getByRole('button', { name: 'Show on map' }).click(); await waitMap();
    const pin = page.locator('[data-point-edition-id="a"]'); assert.equal(await pin.getAttribute('aria-pressed'), 'true');
    await pin.press('Enter'); const popup = page.getByTestId('map-event-popup'); await popup.waitFor();
    assert.equal(await popup.getAttribute('data-edition-revision-id'), 'a-r1'); assert.match(await popup.innerText(), /501 Folsom/); assert.match(await popup.innerText(), /announced/);
    assert.equal(await popup.getByRole('link', { name: 'Open event' }).getAttribute('href'), 'https://luma.com/dp09-controlled-a');
    await shot('controlled-desktop'); await popup.getByRole('button', { name: 'Open dossier' }).press('Enter');
    assert.equal(await page.getByTestId('edition-dossier').getAttribute('data-edition-id'), 'a');
    assert.equal(await page.getByTestId('edition-dossier').getAttribute('data-edition-revision-id'), 'a-r1');
    await page.getByRole('button', { name: 'Close evidence' }).click(); await showMap(); await waitMap();
  });
  await t.test('new result updates markers without replacing map or recentering; same venue identities remain distinct', async () => {
    await page.getByTestId('map-event-popup').getByRole('button', { name: 'Close map popup' }).click();
    const canvas = await page.locator('.maplibregl-canvas').elementHandle(); assert.ok(canvas);
    const pin = page.locator('[data-point-edition-id="a"]');
    await page.locator('.maplibregl-canvas').press('ArrowLeft'); await page.waitForTimeout(450);
    const before = await pin.locator('..').getAttribute('style');
    const far = mapRead('far', { lng: -122.45 }); current = mapRun('live', [a, city, far], 'running');
    await list().locator('[data-edition-id="far"]').waitFor();
    assert.equal(await canvas.evaluate(e => e.isConnected), true); assert.equal(await pin.locator('..').getAttribute('style'), before);
    current = mapRun('live', [a, b, city, far], 'completed'); await list().locator('[data-edition-id="b"]').waitFor();
    const group = page.getByRole('button', { name: '2 events in this area: Evento a, Evento b', exact: true }); await group.waitFor(); await group.click();
    await page.getByTestId('map-event-popup').getByRole('button', { name: 'Evento b', exact: true }).click();
    assert.equal(await page.getByTestId('map-event-popup').getAttribute('data-edition-id'), 'b'); assert.match(await page.getByTestId('map-event-popup').innerText(), /approximate/);
    assert.equal(await list().locator('[data-edition-id="b"]').getAttribute('data-selected'), 'true');
    await page.getByRole('button', { name: 'Fit results' }).click(); assert.equal(await page.locator('.maplibregl-canvas').count(), 1);
  });
  await t.test('mobile switches list/map without losing selection or map, with filters and zero points', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await list().isVisible(), false);
    await page.getByRole('button', { name: 'List', exact: true }).click(); assert.equal(await list().isVisible(), true);
    assert.equal(await list().locator('[data-edition-id="b"]').getAttribute('data-selected'), 'true');
    await showMap(); await waitMap(); const selectedPin = page.locator('.sf-location-pin[aria-pressed="true"]'); assert.equal(await selectedPin.count(), 1); await selectedPin.click(); assert.equal(await page.getByTestId('map-event-popup').getAttribute('data-edition-id'), 'b');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); await shot('controlled-mobile');
    await page.getByLabel('Location', { exact: true }).selectOption('unlocated');
    assert.equal(await page.locator('.sf-location-pin').count(), 0); assert.match(await page.getByTestId('event-location-count').innerText(), /1 without a point/);
    await page.getByRole('button', { name: 'List', exact: true }).click(); assert.match(await list().innerText(), /City only/);
    await page.getByLabel('Find an event or address').fill('inexistente'); assert.equal(await list().locator('article').count(), 0);
  });
  await t.test('run change and unmount remove old markers/listeners; no catalog leakage', async () => {
    await nav('Research'); await page.getByRole('button', { name: 'other', exact: true }).click(); await nav('Events'); await showMap(); await waitMap();
    assert.equal(await page.locator('.maplibregl-canvas').count(), 1); assert.equal(await page.locator('.sf-location-pin').count(), 0);
    assert.equal(await page.getByTestId('sf-map').getAttribute('data-map-point-count'), '0');
    await nav('Brief'); assert.equal(await page.locator('.maplibregl-canvas').count(), 0);
  });
  await t.test('snapshot geography and dossier remain old; current data requires a separate view', async () => {
    await page.setViewportSize({ width: 1366, height: 900 }); await open('saved'); await showMap(); await waitMap();
    await page.locator('[data-point-edition-id="a"]').click(); assert.equal(await page.getByTestId('map-event-popup').getAttribute('data-edition-revision-id'), 'a-r1');
    await page.getByTestId('map-event-popup').getByRole('button', { name: 'Open dossier' }).click(); assert.equal(await page.getByTestId('edition-dossier').getAttribute('data-edition-revision-id'), 'a-r1');
    await page.getByRole('button', { name: 'Close evidence' }).click(); await page.getByText('Research scope and saved revisions',{exact:true}).click(); await page.getByRole('button', { name: 'View current catalog (separate view)' }).click();
    await list().locator('[data-edition-id="catalog-only"]').waitFor(); assert.equal(await list().locator('[data-edition-id="a"]').getAttribute('data-edition-revision-id'), 'a-r2');
  });
  for (const mode of ['style', 'tiles'] as const) await t.test(`${mode} failure preserves mobile list and can recover`, async () => {
    failure = mode; await page.setViewportSize({ width: 390, height: 844 }); await open('other'); await showMap();
    await page.locator('[data-map-state="error"]').waitFor(); assert.equal(await list().isVisible(), true); assert.match(await page.getByTestId('sf-map').getByRole('alert').innerText(), /Street map unavailable/);
    await shot(`controlled-${mode}-failure`); failure = 'none'; await page.getByRole('button', { name: 'Retry map' }).click(); await waitMap(); assert.equal(await page.locator('.maplibregl-canvas').count(), 1);
  });
  await t.test('WebGL context loss exposes the list and retry creates one new map', async () => {
    await page.locator('.maplibregl-canvas').evaluate(canvas => { const gl = (canvas as HTMLCanvasElement).getContext('webgl2'); gl?.getExtension('WEBGL_lose_context')?.loseContext(); });
    await page.locator('[data-map-state="error"]').waitFor(); assert.equal(await list().isVisible(), true);
    assert.match(await page.getByTestId('sf-map').getByRole('alert').innerText(), /WebGL/);
    await page.getByRole('button', {name:'Retry map'}).click(); await waitMap(); assert.equal(await page.locator('.maplibregl-canvas').count(), 1);
  });
  await t.test('WebGL initialization failure leaves usable list', async () => {
    const disabled = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await disabled.addInitScript(() => { const original = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function(this: HTMLCanvasElement, type: string, ...args: unknown[]) { return type.startsWith('webgl') ? null : Reflect.apply(original, this, [type, ...args]); } as typeof original; });
    // Same controlled HTTP routes, no fixture server or external credentials.
    const p = await disabled.newPage(); await p.route('**/api/**', async route => { const url = new URL(route.request().url()); if(url.pathname === '/api/evaluations') return fulfill(route, {runs:[],companies:[],saved:[],coverage:{organizers:0,editions:0,material:[],verifiedAt:[]},evaluations:[],evaluationProfiles:[],evaluationFilter:{profileId:null}}); if(url.pathname.startsWith('/api/evaluations/')) return fulfill(route,other); if(url.pathname==='/api/catalog/editions')return fulfill(route,{editions:[]});return route.fulfill({status:404,json:{}}); });
    await p.goto(`${app.base}/?run=other`); await p.getByRole('navigation').getByRole('button',{name:'Events',exact:true}).click(); await p.getByRole('button',{name:'Map',exact:true}).click();
    await p.locator('[data-map-state="error"]').waitFor(); assert.match(await p.getByTestId('sf-map').getByRole('alert').innerText(),/WebGL/); assert.equal(await p.getByTestId('sf-edition-list').isVisible(),true); await disabled.close();
  });
  assert.deepEqual(errors, []); assert.ok([...assets].some(s => s.includes('200 /maplibre/6.9.0/maplibre-gl-worker.mjs'))); assert.ok([...assets].some(s => s.includes('200 /maplibre/6.9.0/maplibre-gl-shared.mjs')));
  writeFileSync(path.join(process.env.DP09_EVIDENCE_DIR!, 'controlled-map-assets.json'), JSON.stringify({ browser: await browser.version(), assets: [...assets], errors, externalProviders: false }, null, 2));
});
