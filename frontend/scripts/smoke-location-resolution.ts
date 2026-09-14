// Explicit real HTTP/geocoder smoke. Only DP-08 DB, no .env or paid services.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import {chromium} from 'playwright';
import {createEvaluationService} from '../lib/server/evaluations/service.ts';
import {closePools} from '../lib/server/db/pool.ts';
import {stopEvaluationQueue} from '../lib/server/evaluations/queue.ts';
import {readEditionDossier} from '../lib/server/catalog/read.ts';
import {projectEditionDossierView} from '../lib/api/opportunity-adapter.ts';
import {projectEditionPosition} from '../lib/research/edition-location.ts';
import {briefBody} from '../tests/fixtures/research-brief.ts';
import {startTestApp,startProcess,stopProcess,seedSession,eventually,FRONTEND} from '../tests/support/source-browser.ts';
import type {BackgroundResult} from '../lib/contracts/background.ts';

async function main() {
assert.equal(process.env.DP08_REAL_SMOKE,'1');
assert.ok(process.env.GROWTHX_ADMIN_DATABASE_URL?.includes(':55448/'),'Owned cluster required');
assert.ok(process.env.DP08_PRODUCTION_DIR,'Owned production build required');
for(const key of ['EXA_API_KEY','APIFY_TOKEN','GEMINI_API_KEY','GROWTHX_WORKER_LUMA_FIXTURE','GROWTHX_WORKER_EXA_FIXTURE'])delete process.env[key];
process.env.DP05_PRODUCTION_DIR=process.env.DP08_PRODUCTION_DIR;
const evidence=path.resolve(FRONTEND,'../DemoPuentes/evidence/DP-08');mkdirSync(path.join(evidence,'screenshots'),{recursive:true});
const admin=new pg.Client({connectionString:process.env.GROWTHX_ADMIN_DATABASE_URL});await admin.connect();
const db=new pg.Pool({connectionString:process.env.GROWTHX_DATABASE_URL});
const session=await seedSession(admin);const service=createEvaluationService();
const app=await startTestApp();const browser=await chromium.launch({headless:true});
const worker=startProcess(['worker/index.ts'],process.env.DP08_PRODUCTION_DIR,{GROWTHX_GEOCODER:'us-census'});
const now=()=>new Date().toISOString();
try {
  const base=await service.accept({...session,body:{...briefBody(),idempotencyKey:randomUUID()}});if(base.status!=='accepted')throw Error('base rejected');
  const complete=(runId:string)=>eventually(async()=>{const run=await service.getRun({tenantId:session.tenantId,runId});if(run?.state==='failed')throw Error(run.error??'run failed');return run?.state==='completed'?run:null;},'real worker completion',90000);
  await complete(base.runId);
  const context=await browser.newContext({viewport:{width:1366,height:900}});await context.addCookies([{name:'growthx_session',value:session.token,url:app.base,httpOnly:true}]);
  const page=await context.newPage();page.setDefaultTimeout(25000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${app.base}/?run=${base.runId}`);await page.getByTestId('research-coverage').waitFor();
  const nav=()=>page.getByRole('navigation').getByRole('button',{name:'Eventos',exact:true}).click();await nav();
  const samples:unknown[]=[];
  const background=async(url:string)=>{
    await page.getByLabel('Background source URL').fill(url);
    const response=page.waitForResponse(r=>r.url().endsWith('/api/events/background')&&r.request().method()==='POST');
    await page.getByTestId('background-panel').getByRole('button',{name:'Research organizer & projects',exact:true}).click();
    const accepted=await response;assert.equal(accepted.status(),202);const {runId}=await accepted.json();
    const run=await complete(runId);const result=run.result as BackgroundResult;assert.ok(result.editionId);
    await page.getByRole('button',{name:'Open background dossier',exact:true}).waitFor();await page.getByRole('button',{name:'Open background dossier',exact:true}).click();
    await page.getByTestId('edition-dossier').waitFor();
    const read=await readEditionDossier(db,session.tenantId,result.editionId,now());assert.ok(read);const view=projectEditionDossierView(read);
    samples.push({url,runId,result,read,position:projectEditionPosition(read.editionRevisions.at(-1)!,read.sources,read.claims.map(c=>c.revisions.at(-1)!))});
    return {runId,read,view};
  };
  const address=await background('https://www.hackathons.team/events/ai-security-hackathon-2026/');
  assert.equal(address.view.publicLocation.method,'geocoded');assert.equal(address.view.publicLocation.resolution?.accuracy,'interpolated');assert.equal(address.view.publicLocation.resolution?.countyGeoid,'06075');assert.ok(address.view.mapPoint);
  const loc=page.getByTestId('location-evidence');await loc.scrollIntoViewIfNeeded();await loc.locator('summary').click();assert.match(await loc.innerText(),/501 Folsom|501 FOLSOM/);assert.match(await loc.innerText(),/interpolada/);assert.match(await loc.innerText(),/us-census/);
  await loc.screenshot({path:path.join(evidence,'screenshots/real-geocoded-address.png')});
  await page.reload();await page.getByRole('button',{name:'Open background dossier',exact:true}).click();assert.equal(await page.getByTestId('edition-dossier').getAttribute('data-edition-revision-id'),address.view.editionRevisionId);
  await nav();await page.getByRole('button',{name:'Mapa',exact:true}).click();const pin=page.locator(`[data-point-edition-id="${address.view.editionId}"]`);await pin.waitFor();assert.match(await pin.locator('title').textContent()??'',/aproximada/);await pin.click();assert.equal(await page.getByTestId('edition-dossier').getAttribute('data-edition-id'),address.view.editionId);
  await nav();await page.getByTestId('sf-map').screenshot({path:path.join(evidence,'screenshots/real-current-map.png')});
  const city=await background('https://cerebralvalley.ai/e/vultr-the-agent-arena');assert.equal(city.view.mapPoint,null);assert.equal(city.view.publicLocation.precision,'city');
  await nav();assert.equal(await page.locator(`[data-point-edition-id="${city.view.editionId}"]`).count(),0);await page.locator(`[data-testid="sf-edition-list"] [data-edition-id="${city.view.editionId}"]`).waitFor();
  const beforeCount=Number((await admin.query('select count(*) as n from growthx.location_lookups where tenant_id=$1',[session.tenantId])).rows[0].n);
  await page.getByLabel('Luma event URL').fill('https://luma.com/7a4iutvp');const accepted=page.waitForResponse(r=>r.url().endsWith('/api/events/ingest')&&r.request().method()==='POST');await page.getByRole('button',{name:'Importar',exact:true}).click();const {runId}=await (await accepted).json();const run=await complete(runId);const imported=run.result as {editionId:string};const published=await readEditionDossier(db,session.tenantId,imported.editionId,now());assert.ok(published);assert.equal(published.editionRevisions.at(-1)!.publicLocation?.method,'published_coordinates');assert.equal(Number((await admin.query('select count(*) as n from growthx.location_lookups where tenant_id=$1',[session.tenantId])).rows[0].n),beforeCount);
  samples.push({url:'https://luma.com/7a4iutvp',runId,read:published,zeroAdditionalGeocoderCalls:true});
  await page.getByRole('button',{name:'Abrir dossier persistido',exact:true}).click();await page.getByTestId('location-evidence').scrollIntoViewIfNeeded();await page.getByTestId('location-evidence').screenshot({path:path.join(evidence,'screenshots/real-published-coordinates.png')});
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.getByTestId('location-evidence').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(evidence,'screenshots/real-mobile.png')});
  assert.deepEqual(errors,[]);
  const operations=(await admin.query('select run_id,state,output,created_at from growthx.location_lookups where tenant_id=$1 order by created_at',[session.tenantId])).rows;
  writeFileSync(path.join(evidence,'real-consumers.json'),JSON.stringify({observedAt:now(),environment:'isolated production build + Next + worker + PostgreSQL + Chromium',tenantId:session.tenantId,baseRunId:base.runId,providerUse:{censusRequests:operations.length,censusCostUsd:0,exaCalls:0,apifyCalls:0},checks:['real public address to interpolated pin','source claim and provider provenance','same revision after reload','current SVG map pin to dossier','city-only remains in list without pin','published coordinates no provider call','390px no horizontal overflow'],operations,samples},null,2)+'\n');
  console.log(JSON.stringify({status:'passed',samples:samples.length,geocoderRequests:operations.length,censusCostUsd:0,exaCalls:0,apifyCalls:0}));
} finally {await browser.close();await stopProcess(worker.child);await app.close();await stopEvaluationQueue();await closePools();await db.end();await admin.end();}

}
main().catch(error=>{console.error(error instanceof Error?error.message:"Location smoke failed");process.exitCode=1;});
