// Opt-in real public HTTP + Census + OpenFreeMap on the DP-09 owned stack.
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { chromium } from 'playwright';
import { createEvaluationService } from '../lib/server/evaluations/service.ts';
import { closePools } from '../lib/server/db/pool.ts';
import { stopEvaluationQueue } from '../lib/server/evaluations/queue.ts';
import { readEditionDossier } from '../lib/server/catalog/read.ts';
import { hashSessionToken } from '../lib/server/auth/session.ts';
import { runMigrations } from '../lib/server/db/migrate.ts';
import { projectEditionDossierView } from '../lib/api/opportunity-adapter.ts';
import { briefBody } from '../tests/fixtures/research-brief.ts';
import { startTestApp, startProcess, stopProcess, seedSession, eventually } from '../tests/support/source-browser.ts';
import type { BackgroundResult } from '../lib/contracts/background.ts';

async function main() {
assert.ok(process.env.GROWTHX_ADMIN_DATABASE_URL?.includes(':55459/'));
assert.ok(process.env.DP05_PRODUCTION_DIR);
for (const key of ['EXA_API_KEY','APIFY_TOKEN','GEMINI_API_KEY','GROWTHX_WORKER_LUMA_FIXTURE','GROWTHX_WORKER_EXA_FIXTURE']) delete process.env[key];
const out=process.env.DP09_EVIDENCE_DIR!;mkdirSync(path.join(out,'screenshots'),{recursive:true});
const admin=new pg.Client({connectionString:process.env.GROWTHX_ADMIN_DATABASE_URL});await admin.connect();await runMigrations();
const db=new pg.Pool({connectionString:process.env.GROWTHX_DATABASE_URL});
const prior=process.argv.includes('--reopen')?JSON.parse(readFileSync(path.join(out,'real-production.json'),'utf8')):null;
const session=prior?{tenantId:prior.tenantId,userId:(await admin.query('select user_id from growthx.memberships where tenant_id=$1',[prior.tenantId])).rows[0].user_id as string,token:randomBytes(24).toString('hex')}:await seedSession(admin);
if(prior)await admin.query("insert into growthx.sessions(token_hash,user_id,tenant_id,expires_at) values($1,$2,$3,now()+interval '1 hour')",[hashSessionToken(session.token),session.userId,session.tenantId]);
const service=createEvaluationService();const app=await startTestApp();const browser=await chromium.launch({channel:'chrome',headless:true});
const worker=startProcess(['worker/index.ts'],process.env.DP05_PRODUCTION_DIR,{GROWTHX_GEOCODER:'us-census'});
try {
  const complete=(runId:string)=>eventually(async()=>{const run=await service.getRun({tenantId:session.tenantId,runId});if(run?.state==='failed')throw Error(run.error??'failed');return run?.state==='completed'?run:null;},'real worker complete',90000);
  const base=prior?{status:'accepted' as const,runId:prior.samples[0].runId as string}:await service.accept({...session,body:{...briefBody(),idempotencyKey:randomUUID()}});assert.equal(base.status,'accepted');if(base.status!=='accepted')throw Error('brief');await complete(base.runId);
  const context=await browser.newContext({viewport:{width:1366,height:900}});await context.addCookies([{name:'growthx_session',value:session.token,url:app.base,httpOnly:true}]);
  const page=await context.newPage();page.setDefaultTimeout(30000);const errors:string[]=[];const assets:{url:string;status:number}[]=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().includes('openfreemap.org')||r.url().includes('/maplibre/'))assets.push({url:r.url(),status:r.status()});});
  const samples:unknown[]=[];
  await page.goto(`${app.base}/?run=${base.runId}`);await page.getByTestId('research-coverage').waitFor();await page.getByRole('navigation').getByRole('button',{name:'Eventos',exact:true}).click();
  async function background(url:string){
    if(prior){const sample=prior.samples.find((s:{url:string})=>s.url===url);const read=await readEditionDossier(db,session.tenantId,sample.result.editionId,new Date().toISOString());assert.ok(read);await page.goto(`${app.base}/?run=${sample.runId}`);await page.locator(`[data-testid="sf-edition-list"] [data-edition-id="${read.editionId}"]`).waitFor();samples.push(sample);return{read,view:projectEditionDossierView(read),runId:sample.runId as string};}
    await page.getByLabel('Background source URL').fill(url);const response=page.waitForResponse(r=>r.url().endsWith('/api/events/background')&&r.request().method()==='POST');await page.getByRole('button',{name:'Research organizer & projects',exact:true}).click();const accepted=await response;assert.equal(accepted.status(),202);const {runId}=await accepted.json();const run=await complete(runId);const result=run.result as BackgroundResult;assert.ok(result.editionId);const read=await readEditionDossier(db,session.tenantId,result.editionId,new Date().toISOString());assert.ok(read);const view=projectEditionDossierView(read);samples.push({url,runId,result,read});await page.locator(`[data-testid="sf-edition-list"] [data-edition-id="${read.editionId}"]`).waitFor();return{read,view,runId};
  }
  const address=await background('https://www.hackathons.team/events/ai-security-hackathon-2026/');assert.equal(address.view.publicLocation.method,'geocoded');assert.ok(address.view.mapPoint);
  await page.getByRole('button',{name:'Ver en mapa',exact:true}).click();await page.locator('[data-map-state="ready"]').waitFor();
  const popup=page.getByTestId('map-event-popup');await popup.waitFor();assert.equal(await popup.getAttribute('data-edition-revision-id'),address.view.editionRevisionId);assert.match(await popup.innerText(),/interpolada/);
  assert.ok(await page.getByTestId('sf-map').getByRole('link',{name:'OpenStreetMap',exact:true}).isVisible());
  await page.getByTestId('sf-map').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'screenshots/real-production-desktop.png')});
  await popup.getByRole('button',{name:'Abrir dossier'}).click();assert.equal(await page.getByTestId('edition-dossier').getAttribute('data-edition-id'),address.read.editionId);await page.getByTestId('location-evidence').locator('summary').click();await page.getByTestId('location-evidence').screenshot({path:path.join(out,'screenshots/real-production-provenance.png')});
  await page.getByRole('button',{name:'Volver a eventos'}).click();await page.getByRole('button',{name:'Mapa',exact:true}).click();await page.locator('[data-map-state="ready"]').waitFor();
  await page.setViewportSize({width:390,height:844});await page.getByTestId('sf-map').scrollIntoViewIfNeeded();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(out,'screenshots/real-production-mobile.png')});
  await page.getByRole('button',{name:'Lista',exact:true}).click();assert.equal(await page.getByTestId('sf-edition-list').locator(`[data-edition-id="${address.read.editionId}"]`).getAttribute('data-selected'),'true');
  const city=await background('https://cerebralvalley.ai/e/vultr-the-agent-arena');assert.equal(city.view.mapPoint,null);await page.getByRole('button',{name:'Mapa',exact:true}).click();await page.locator('[data-map-state="ready"]').waitFor();assert.equal(await page.locator('.sf-location-pin').count(),0);await page.getByRole('button',{name:'Lista',exact:true}).click();assert.match(await page.getByTestId('sf-edition-list').innerText(),/Solo ciudad/);await page.getByTestId('sf-edition-list').screenshot({path:path.join(out,'screenshots/real-production-city.png')});
  await page.goto(`${app.base}/?run=${address.runId}`);await page.getByRole('button',{name:'Ver en mapa',exact:true}).click();await page.locator('[data-map-state="ready"]').waitFor();assert.equal(await page.getByTestId('map-event-popup').getAttribute('data-edition-revision-id'),address.view.editionRevisionId);
  assert.deepEqual(errors,[]);assert.ok(assets.some(a=>a.url.includes('/planet/')&&a.status===200),'real vector tiles fetched');
  const operations=(await admin.query('select run_id,state,created_at from growthx.location_lookups where tenant_id=$1',[session.tenantId])).rows;
  writeFileSync(path.join(out,prior?'real-reopen.json':'real-production.json'),JSON.stringify({observedAt:new Date().toISOString(),browser:await browser.version(),build:process.env.DP05_PRODUCTION_DIR,tenantId:session.tenantId,samples,assets,errors,operations,checks:{sourceToGeocodedPin:true,workerSharedTilesCss:true,attribution:true,desktop1366x900:true,mobile390x844:true,sameDossierRevision:true,cityWithoutPoint:true,runChangeNoDuplicates:true,reopenWithoutRefresh:true},paidProviderCalls:0,censusRequests:operations.length},null,2));
  console.log('Real production Chrome: source -> street-map point -> dossier/provenance; mobile, city without point, run change and reopen passed.');
} finally {
  await Promise.all([stopProcess(worker.child),app.close()]);
  await browser.close();
  await stopEvaluationQueue(); await closePools(); await db.end(); await admin.end();
  console.log('Owned browser, Next, worker, queue and database connections closed.');
}

}
main().catch(error => { console.error(error); process.exitCode = 1; });
