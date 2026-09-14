// Explicit real-source smoke, isolated DB only. Never loads .env.local or
// outputs session tokens/credentials. No Exa or Apify calls are made.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import {chromium} from 'playwright';
import {readKnownSource,parseKnownSourceRead,type KnownSourceRead} from '../lib/server/sources/reader.ts';
import {runMigrations} from '../lib/server/db/migrate.ts';
import {closePools} from '../lib/server/db/pool.ts';
import {stopEvaluationQueue} from '../lib/server/evaluations/queue.ts';
import {createEvaluationService} from '../lib/server/evaluations/service.ts';
import {briefBody} from '../tests/fixtures/research-brief.ts';
import {startTestApp,startProcess,stopProcess,seedSession,eventually,FRONTEND} from '../tests/support/source-browser.ts';

async function main() {
assert.equal(process.env.DP05_REAL_SMOKE,'1','Explicit DP05_REAL_SMOKE=1 required');
assert.ok(process.env.GROWTHX_ADMIN_DATABASE_URL?.includes(':55445/'),'Only DP-05 isolated DB is allowed');
for(const key of ['EXA_API_KEY','APIFY_TOKEN','GEMINI_API_KEY','GROWTHX_WORKER_LUMA_FIXTURE','GROWTHX_WORKER_EXA_FIXTURE'])delete process.env[key];
const evidence=path.resolve(FRONTEND,'../DemoPuentes/evidence/DP-05');mkdirSync(path.join(evidence,'screenshots'),{recursive:true});
const urls=[
  'https://sf.aitinkerers.org/p/agents-everywhere-bots-channels-more-global-hackathon',
  'https://luma.com/7a4iutvp',
  'https://www.hackathons.team/events/ai-security-hackathon-2026/',
  'https://www.hackathons.team/',
  'https://www.hackathons.team/sponsor/enquire/',
  'https://cerebralvalley.ai/e/vultr-the-agent-arena',
];
const samples:{reference:string;sourceId:string;read:KnownSourceRead}[]=[];
for(const [i,url] of urls.entries()){
  const read=parseKnownSourceRead(await readKnownSource(url));
  samples.push({reference:`F${i+1}`,sourceId:`dp05-real-f${i+1}`,read});
}
const byId=(i:number)=>samples[i-1].read;
const text=(i:number)=>byId(i).fullContent.attributes.map(a=>JSON.stringify(a.value)).join('\n');
assert.match(text(1),/OpenAI/);assert.match(text(1),/CopilotKit/);assert.match(text(1),/OpenRouter/);assert.match(text(1),/Shared upon acceptance/);assert.equal(byId(1).fullContent.coordinates,null);
assert.match(text(2),/Wasmer/);assert.match(text(2),/TENKI CLOUD/);assert.match(text(2),/Security researchers/);assert.match(text(2),/94105/);assert.equal(byId(2).fullContent.coordinates?.lat,37.786980299999996);
assert.equal(byId(3).fullContent.location?.address?.streetAddress,'501 Folsom St');assert.match(text(4),/None yet/);
assert.match(text(5),/office-hours/);assert.match(text(5),/Opt-in/);assert.match(text(5),/do not publish packages/);
assert.match(text(6),/Vultr/);assert.match(text(6),/must apply and be approved/);assert.equal(byId(6).fullContent.coordinates,null);
writeFileSync(path.join(evidence,'real-sources.json'),JSON.stringify({observedAt:new Date().toISOString(),material:'real HTTP sources',providerUse:{exaCalls:0,apifyStarts:0},samples},null,2)+'\n');

const admin=new pg.Client({connectionString:process.env.GROWTHX_ADMIN_DATABASE_URL});await admin.connect();await runMigrations();
const session=await seedSession(admin),app=await startTestApp(),browser=await chromium.launch({headless:true});
const worker=startProcess(['worker/index.ts'],FRONTEND);
try{
  const service=createEvaluationService();const base=await service.accept({tenantId:session.tenantId,userId:session.userId,body:{...briefBody(),idempotencyKey:randomUUID()}});assert.equal(base.status,'accepted');const baseId=(base as {runId:string}).runId;
  await eventually(async()=> (await service.getRun({tenantId:session.tenantId,runId:baseId}))?.state==='completed'?true:null,'base research');
  const context=await browser.newContext({viewport:{width:1366,height:900}});await context.addCookies([{name:'growthx_session',value:session.token,url:app.base,httpOnly:true}]);const page=await context.newPage();
  await page.goto(`${app.base}/?run=${baseId}`);await page.getByTestId('research-coverage').waitFor();await page.getByRole('navigation').getByRole('button',{name:'Eventos',exact:true}).click();
  await page.getByLabel('Luma event URL').fill(urls[1]);const accepted=page.waitForResponse(r=>r.url().endsWith('/api/events/ingest')&&r.request().method()==='POST');await page.getByRole('button',{name:'Importar',exact:true}).click();const response=await accepted;assert.equal(response.status(),202);const runId=(await response.json()).runId;
  await page.getByRole('button',{name:'Abrir dossier persistido'}).waitFor({timeout:60000});await page.getByRole('button',{name:'Abrir dossier persistido'}).click();const dossier=page.getByTestId('edition-dossier');await dossier.waitFor();
  for(const label of ['Audience','Announced sponsors','Public address']) await dossier.locator('.research-fact').filter({has:page.getByText(label,{exact:true})}).getByTestId('claim-evidence').locator('summary').click();
  const visible=await dossier.innerText();assert.match(visible,/Security researchers/);assert.match(visible,/Wasmer/);assert.match(visible,/TENKI CLOUD/);assert.match(visible,/94105/);assert.match(visible,/HTML line/);assert.match(visible,/Attendance cost not published/);assert.doesNotMatch(visible,/test_fixture|Fuente de prueba/);
  const editionId=await dossier.getAttribute('data-edition-id'),revisionId=await dossier.getAttribute('data-edition-revision-id');
  await page.screenshot({path:path.join(evidence,'screenshots/real-desktop.png'),fullPage:true,animations:'disabled'});
  for(const [label,name] of [['Audience','audience'],['Announced sponsors','sponsors'],['Public address','address']])await dossier.locator('.research-fact').filter({has:page.getByText(label,{exact:true})}).screenshot({path:path.join(evidence,`screenshots/real-${name}.png`)});
  await page.reload();await page.getByRole('button',{name:'Abrir dossier persistido'}).click();await dossier.waitFor();assert.equal(await dossier.getAttribute('data-edition-revision-id'),revisionId);
  await page.setViewportSize({width:390,height:844});
  const mobileAudience=dossier.locator('.research-fact').filter({has:page.getByText('Audience',{exact:true})});
  await mobileAudience.getByTestId('claim-evidence').locator('summary').click();await mobileAudience.scrollIntoViewIfNeeded();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(evidence,'screenshots/real-mobile.png'),fullPage:true,animations:'disabled'});
  const run=await service.getRun({tenantId:session.tenantId,runId});
  writeFileSync(path.join(evidence,'real-browser.json'),JSON.stringify({observedAt:new Date().toISOString(),runId,editionId,revisionId,state:run?.state,material:'real source, isolated DB and worker',verified:['source imported through browser','audience fragment','announced sponsors fragment','full public address fragment','published coordinates','cost pending','same revision after reload','mobile no horizontal overflow'],result:run?.result,providerUse:{exaCalls:0,apifyStarts:0}},null,2)+'\n');
  console.log(JSON.stringify({samples:samples.length,realBrowser:'passed',editionId,revisionId,exaCalls:0,apifyStarts:0}));
}finally{await browser.close();await stopProcess(worker.child);await app.close();await stopEvaluationQueue();await closePools();await admin.end();}

}
main().catch(error=>{console.error(error instanceof Error ? error.message : 'Source smoke failed');process.exitCode=1;});
