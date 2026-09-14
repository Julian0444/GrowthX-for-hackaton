import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { startTestApp, eventually } from '../support/source-browser.ts';
import { CONTROLLED_MAP_STYLE, mapRead, mapRun } from '../fixtures/sf-map.ts';

// Real Chrome + production React/MapLibre. HTTP failures and polls are
// controlled; real saved data is verified separately in localhost Chrome.
test('DP10 research experience: meaningful results, stable polls, evidence, keyboard, mobile and errors', {timeout:180000}, async t => {
  assert.ok(['55460','55461'].some(port=>process.env.GROWTHX_ADMIN_DATABASE_URL?.includes(`:${port}/`)), 'Use the dedicated DP10 test database');
  assert.ok(process.env.DP05_PRODUCTION_DIR, 'Use the isolated production build');
  const app = await startTestApp(); const browser = await chromium.launch({channel:'chrome', headless:true});
  t.after(async () => { await browser.close(); await app.close() });
  const context = await browser.newContext({viewport:{width:1366,height:900}});
  const page = await context.newPage(); const errors:string[] = []; page.on('pageerror', e=>errors.push(e.message));
  const a=mapRead('a'), city=mapRead('city',{noPoint:true}), newEvent=mapRead('new',{lng:-122.45});
  const conflict=mapRead('conflict',{status:'contradicted'}); conflict.claims[0].revisions[0].status='contradicted';
  for (const chain of a.claims.filter(c => c.revisions.at(-1)?.attribute.startsWith('cost:'))) { chain.revisions[0].status='pending'; chain.revisions[0].value={kind:'pending',note:'Quote missing'}; }
  let current=mapRun('live',[a,city],'running');
  const failed={...mapRun('failed',[a],'failed'), error:'Source returned HTTP 503', steps:[{seq:1,name:'fetch_event_page',state:'failed',attempts:2,error:'Source returned HTTP 503',startedAt:null,finishedAt:null}]};
  const empty=mapRun('empty',[]); const contradictory=mapRun('conflict',[conflict]);
  let unavailable=false, mapFailure=false;
  await context.route('https://tiles.openfreemap.org/**', r=> mapFailure ? r.abort() : r.fulfill({json:CONTROLLED_MAP_STYLE}));
  await context.route('**/api/**', route => {
    const p=new URL(route.request().url()).pathname;
    if(unavailable) return route.fulfill({status:503,json:{message:'Database unavailable'}});
    if(p==='/api/evaluations') return route.fulfill({json:{runs:[current,failed,empty].map(r=>({runId:r.runId,product:r.runId,profileVersion:1,state:r.state,createdAt:r.createdAt})), companies:[],saved:[],coverage:{organizers:0,editions:3,material:['synthetic'],verifiedAt:[]},evaluations:[],evaluationProfiles:[],evaluationFilter:{profileId:null}}});
    if(p.startsWith('/api/evaluations/')) { const run=[current,failed,empty,contradictory].find(r=>r.runId===p.split('/')[3]); return run?route.fulfill({json:run}):route.fulfill({status:404,json:{}}) }
    if(p==='/api/catalog/editions')return route.fulfill({json:{editions:[a,city,newEvent].map(r=>({editionId:r.editionId}))}});
    if(p.startsWith('/api/catalog/editions/'))return route.fulfill({json:[a,city,newEvent].find(r=>r.editionId===p.split('/')[4])});
    return route.fulfill({status:404,json:{}});
  });
  const out=process.env.DP10_EVIDENCE_DIR!; mkdirSync(path.join(out,'screenshots'),{recursive:true});
  const shot=async(name:string)=>page.screenshot({path:path.join(out,'screenshots',`experience-${name}.png`),animations:'disabled'});
  const list=()=>page.getByTestId('sf-edition-list');
  const open=async(id:string)=>{await page.goto(`${app.base}/?run=${id}`); await page.locator(`[data-testid="run-progress"][data-run-id="${id}"]`).waitFor(); await page.getByRole('navigation').getByRole('button',{name:'Events',exact:true}).click();};
  await t.test('desktop response, source action and technical disclosure', async()=>{
    await open('live'); await list().locator('[data-edition-id="a"]').waitFor();
    assert.equal(await list().locator('article').count(),2); assert.equal(await page.getByTestId('compact-brief').count(),1);
    assert.match(await list().first().innerText(),/Why explore:[\s\S]*Full participation cost is unknown/);
    assert.doesNotMatch(await page.getByTestId('run-progress').innerText(), /live|attempts|snapshot/);
    await page.getByTestId('research-technical').getByText('Technical details',{exact:true}).click(); assert.match(await page.getByTestId('research-technical').innerText(),/live/);
    await page.getByTestId('research-technical').getByText('Technical details',{exact:true}).click();
    const first=list().locator('article').first(); const action=first.getByRole('button',{name:'Review quote requirements'}); const box=await action.boundingBox(); assert.ok(box && box.y+box.height<=900,'next action visible on laptop');
    assert.equal(await first.getByRole('link',{name:'Open event'}).getAttribute('href'),'https://luma.com/dp09-controlled-a');
    await shot('desktop');
  });
  await t.test('evidence panel preserves map, selection, scroll and keyboard focus', async()=>{
    const card=list().locator('[data-edition-id="a"]'); await card.getByRole('button',{name:'Show on map'}).click();
    await page.locator('[data-map-state="ready"]').waitFor(); const canvas=await page.locator('.maplibregl-canvas').elementHandle(); assert.ok(canvas);
    const trigger=card.getByRole('button',{name:'Review quote requirements'}); await trigger.press('Enter');
    const panel=page.getByRole('dialog',{name:'Research evidence'}); await panel.waitFor(); assert.equal(await panel.evaluate(e=>e.matches(':modal')),false);
    assert.equal(await page.getByTestId('edition-dossier').getAttribute('data-edition-id'),'a');
    assert.equal(await canvas.evaluate(e=>e.isConnected),true); assert.equal(await card.getAttribute('data-selected'),'true');
    assert.equal(await panel.getByRole('region',{name:'Source summary'}).count(),1);
    await shot('evidence'); await panel.getByRole('button',{name:'Close evidence'}).press('Escape');
    assert.equal(await trigger.evaluate(e=>e===document.activeElement),true); assert.equal(await canvas.evaluate(e=>e.isConnected),true);
    await card.getByRole('checkbox').check(); assert.match(await page.getByTestId('compare-toolbar').innerText(),/1\/3/);
  });
  await t.test('out-of-order polling appends findings without moving cards or selection', async()=>{
    current=mapRun('live',[newEvent,city,a],'running');
    await list().locator('[data-edition-id="new"]').waitFor();
    assert.deepEqual(await list().locator('article').evaluateAll(es=>es.map(e=>e.getAttribute('data-edition-id'))),['a','city','new']);
    assert.equal(await list().locator('[data-edition-id="a"]').getAttribute('data-selected'),'true');
    assert.equal(await list().locator('[data-edition-id="a"]').getByRole('checkbox').isChecked(),true);
  });
  await t.test('mobile retains every action, traps evidence focus and restores selection', async()=>{
    await page.setViewportSize({width:390,height:844}); await page.getByRole('button',{name:'List',exact:true}).click();
    const card=list().locator('[data-edition-id="a"]'); assert.equal(await card.getAttribute('data-selected'),'true');
    await card.getByRole('button',{name:'Review quote requirements'}).click(); const panel=page.getByRole('dialog',{name:'Research evidence'}); await panel.waitFor();
    assert.equal(await panel.evaluate(e=>e.matches(':modal')),true);
    await panel.getByRole('button',{name:'Close evidence'}).press('Shift+Tab'); assert.equal(await panel.evaluate(e=>e.contains(document.activeElement)),true);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)); await shot('mobile-evidence');
    await panel.getByRole('button',{name:'Close evidence'}).click(); await page.getByRole('button',{name:'Map',exact:true}).click();
    assert.equal(await page.locator('[data-point-edition-id="a"]').getAttribute('aria-pressed'),'true');
    await page.getByRole('button',{name:'List',exact:true}).click(); await shot('mobile');
  });
  await t.test('empty filters are recoverable; unknown location and contradiction stay explicit',async()=>{
    await page.getByLabel('Find an event or address').fill('no-such-event'); assert.equal(await list().locator('article').count(),0);
    await page.getByRole('button',{name:'Clear filters'}).click(); assert.equal(await list().locator('article').count(),3);
    await page.getByLabel('Location',{exact:true}).selectOption('unlocated'); assert.match(await list().innerText(),/City only/);
    await open('conflict'); assert.match(await list().innerText(),/Contradiction|Conflicting/); assert.equal(await page.locator('.sf-location-pin').count(),0); await shot('contradiction');
    await open('empty'); assert.match(await page.getByText('No event evidence yet').innerText(),/No event evidence/); await shot('empty');
  });
  await t.test('provider, map and server failures keep saved findings and allow explicit recovery',async()=>{
    await open('failed'); assert.match(await page.getByTestId('run-progress').innerText(),/Interrupted[\s\S]*Saved findings remain available/); assert.equal(await list().locator('article').count(),1);
    await page.getByText('Technical details',{exact:true}).click(); assert.match(await page.getByTestId('research-technical').innerText(),/503[\s\S]*attempts|attempts[\s\S]*503/); await shot('provider-error');
    mapFailure=true; await open('live'); await page.getByRole('button',{name:'Map',exact:true}).click(); await page.locator('[data-map-state="error"]').waitFor(); assert.equal(await list().isVisible(),true); await shot('map-error');
    mapFailure=false; await page.getByRole('button',{name:'Retry map'}).click(); await page.locator('[data-map-state="ready"]').waitFor();
    unavailable=true; await page.goto(`${app.base}/?run=live`); await page.getByText('The server could not be reached.',{exact:false}).waitFor(); await shot('server-error');
    unavailable=false; await page.getByRole('button',{name:'Retry reading'}).click(); await eventually(async()=>await page.getByTestId('compact-brief').isVisible()?true:null,'saved brief recovered');
    await page.goto(`${app.base}/?run=missing`); await page.getByText('This research is not available to this session.').waitFor(); assert.equal(await page.getByText('Loading research…', {exact:true}).count(),0, 'a failed read must not continue to announce loading');
  });
  assert.deepEqual(errors,[]); writeFileSync(path.join(out,'experience-browser.json'),JSON.stringify({browser:await browser.version(),material:'Controlled HTTP responses and map style; real production app and Chrome',viewports:['1366x900','390x844'],pageErrors:errors},null,2));
});
