import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import pg from 'pg';
import {chromium} from 'playwright';
import {runMigrations} from '../../lib/server/db/migrate.ts';
import {stopEvaluationQueue} from '../../lib/server/evaluations/queue.ts';
import {closePools} from '../../lib/server/db/pool.ts';
import {createEvaluationService} from '../../lib/server/evaluations/service.ts';
import {briefBody} from '../fixtures/research-brief.ts';
import {relationshipRoutes,AIT_CURRENT,VULTR_CURRENT} from '../fixtures/relationships.ts';
import {FRONTEND,startTestApp,startProcess,stopProcess,seedSession,eventually} from '../support/source-browser.ts';

// Same public UI and real queue/worker for both runs; the live version never
// enables fixture transport. The buyer brief is explicitly illustrative.
for(const real of process.env.DP06_REAL_SMOKE==='1'?[true]:[false])test(`DP06 browser: ${real?'real public sources':'controlled sources'} -> organizer -> previous edition -> company/project -> evidence`,{timeout:240000},async t=>{
 assert.ok(process.env.GROWTHX_ADMIN_DATABASE_URL&&!process.env.GROWTHX_ADMIN_DATABASE_URL.includes(':54329/'),'Explicit isolated DB required');
 for(const key of ['EXA_API_KEY','APIFY_TOKEN','GEMINI_API_KEY','GROWTHX_GEOCODER'])delete process.env[key];
 if(process.env.DP06_PRODUCTION_DIR)process.env.DP05_PRODUCTION_DIR=process.env.DP06_PRODUCTION_DIR;
 const admin=new pg.Client({connectionString:process.env.GROWTHX_ADMIN_DATABASE_URL});await admin.connect();await runMigrations();
 const tenant=await seedSession(admin),decoy=await seedSession(admin);
 const temp=mkdtempSync(path.join(tmpdir(),'dp06-browser-'));const fixture=path.join(temp,'transport.json'),calls=path.join(temp,'calls.log');
 writeFileSync(fixture,JSON.stringify(Object.fromEntries(Object.entries(relationshipRoutes()).map(([url,body])=>[url,{body}]))));
 const app=await startTestApp();const browser=await chromium.launch({headless:!real});
 const worker=startProcess(['worker/index.ts'],FRONTEND,real?{}:{GROWTHX_WORKER_LUMA_FIXTURE:fixture,GROWTHX_WORKER_LUMA_CALLS_FILE:calls});
 t.after(async()=>{await browser.close();await stopProcess(worker.child);await app.close();await stopEvaluationQueue();await closePools();await admin.end();rmSync(temp,{recursive:true,force:true});});
 const service=createEvaluationService();const base=await service.accept({tenantId:tenant.tenantId,userId:tenant.userId,body:{...briefBody(),idempotencyKey:randomUUID()}});if(base.status!=='accepted')throw Error('profile');
 await eventually(async()=> (await service.getRun({tenantId:tenant.tenantId,runId:base.runId}))?.state==='completed'?true:null,'base research completed');
 const context=await browser.newContext({viewport:{width:1366,height:900}});await context.addCookies([{name:'growthx_session',value:tenant.token,url:app.base,httpOnly:true}]);
 const page=await context.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${app.base}/?run=${base.runId}`);await page.getByTestId('run-progress').waitFor();
 await page.getByRole('navigation').getByRole('button',{name:'Events',exact:true}).click();
 await page.getByLabel('Background source URL').fill(AIT_CURRENT);
 const accepted=page.waitForResponse(r=>r.url().endsWith('/api/events/background')&&r.request().method()==='POST');
 await page.getByRole('button',{name:'Research organizer & projects',exact:true}).click();const response=await accepted;assert.equal(response.status(),202,await response.text());const {runId}=await response.json();
 await page.getByRole('button',{name:'Open background dossier',exact:true}).waitFor({timeout:120000});
 const run=await service.getRun({tenantId:tenant.tenantId,runId});assert.equal(run?.state,'completed');
 await page.getByRole('button',{name:'Open background dossier',exact:true}).click();const dossier=page.getByTestId('edition-dossier');await dossier.waitFor();
 const primaryId=await dossier.getAttribute('data-edition-id'),primaryRevision=await dossier.getAttribute('data-edition-revision-id');assert.ok(primaryId&&primaryRevision);
 assert.match(await dossier.innerText(),/Why this matters for your brief/i);assert.match(await dossier.innerText(),real?/Citadel|monitoring, auditing/i:/Citadel/);
 const dir=process.env.GROWTHX_E2E_SCREENSHOT_DIR!;mkdirSync(dir,{recursive:true});const prefix=real?'real':'controlled';
 await dossier.getByText('Why this matters for your brief',{exact:true}).scrollIntoViewIfNeeded();
 await page.screenshot({path:path.join(dir,`${prefix}-event.png`),fullPage:true,animations:'disabled'});
 await dossier.getByRole('button',{name:'AI Tinkerers San Francisco',exact:true}).click();const organizer=page.getByTestId('organizer-dossier');await organizer.waitFor();
 assert.match(await organizer.innerText(),/Identity, experience and open questions/);assert.match(await organizer.innerText(),/Documented role: organizer/);
 const previous=organizer.getByRole('button',{name:'AI Tinkerers SF - Secure Agents Buildathon',exact:true});await previous.waitFor();await previous.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(dir,`${prefix}-organizer.png`),fullPage:true,animations:'disabled'});await previous.click();await dossier.waitFor();
 let projectUrl:string|null=null;
 const project=dossier.locator('[data-relationship-id]').filter({hasText:'The Citadel: Neuro-Symbolic Security Gateway'});
 const projectAvailable=await project.count()>0;
 const evidenceCard=projectAvailable?project:dossier.locator('[data-relationship-id]').filter({hasText:'Google Cloud'});
 if(projectAvailable){
   await project.getByText('Evidence for this edition and role',{exact:true}).click();
   const tech=project.locator('.research-fact').filter({has:page.getByText('Declared technology',{exact:true})});await tech.getByTestId('claim-evidence').locator('summary').click();
   assert.match(await project.innerText(),/Google Cloud/);assert.match(await project.innerText(),/Back to Showcase/);assert.match(await project.innerText(),/not executed|not.*verified/);
   projectUrl=await project.getByRole('link',{name:'Open published project'}).getAttribute('href');assert.match(projectUrl??'',/\/entries\//);
 }else{
   assert.ok(real,'controlled project scenario must produce a project');
   assert.match(await dossier.innerText(),/Monitoring, auditing, and recovery patterns for long-running agents/);
   await evidenceCard.getByText('Evidence for this edition and role',{exact:true}).click();
   assert.match(await evidenceCard.innerText(),/Thank you to Google Cloud/);assert.match(await evidenceCard.innerText(),/sponsor · announced/);
 }
 assert.match(await dossier.innerText(),/partial sample of published projects[\s\S]*never a count or percentage of attendees/);
 await evidenceCard.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(dir,`${prefix}-${projectAvailable?'project':'company'}.png`),fullPage:true,animations:'disabled'});
 await page.setViewportSize({width:390,height:844});await evidenceCard.scrollIntoViewIfNeeded();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'mobile overflow');await page.screenshot({path:path.join(dir,`${prefix}-mobile.png`),fullPage:true,animations:'disabled'});
 await page.reload();await page.getByRole('button',{name:'Open background dossier',exact:true}).click();await dossier.waitFor();assert.equal(await dossier.getAttribute('data-edition-id'),primaryId);assert.equal(await dossier.getAttribute('data-edition-revision-id'),primaryRevision);
 if(!real)assert.equal(readFileSync(calls,'utf8').trim().split('\n').length,6,'reload did not consume again');
 const other=await browser.newContext();await other.addCookies([{name:'growthx_session',value:decoy.token,url:app.base}]);assert.equal((await other.request.get(`${app.base}/api/catalog/editions/${primaryId}`)).status(),404);assert.equal((await other.request.get(`${app.base}/api/evaluations/${runId}`)).status(),404);
 assert.deepEqual(errors,[]);
 const additional:unknown[]=[];
 if(real){
   await page.setViewportSize({width:1366,height:900});
   await page.getByRole('navigation').getByRole('button',{name:'Events',exact:true}).click();
   await page.getByLabel('Background source URL').fill(VULTR_CURRENT);
   const vultrAccepted=page.waitForResponse(r=>r.url().endsWith('/api/events/background')&&r.request().method()==='POST');
   await page.getByRole('button',{name:'Research organizer & projects',exact:true}).click();const vr=await vultrAccepted;assert.equal(vr.status(),202);const vultrRunId=(await vr.json()).runId;
   await eventually(async()=>{const result=await service.getRun({tenantId:tenant.tenantId,runId:vultrRunId});return result?.state==='completed'?result:null;},'Vultr background complete');
   await page.getByRole('button',{name:'Open background dossier',exact:true}).click();await dossier.waitFor();await dossier.getByRole('button',{name:'Vultr',exact:true}).click();await organizer.waitFor();
   assert.match(await organizer.innerText(),/Paris/);assert.match(await organizer.innerText(),/sponsor \(reported\)/);await organizer.getByRole('button',{name:'RAISE 2025 · agentic AI hackathon',exact:true}).click();await dossier.waitFor();
   const sponsor=dossier.locator('[data-relationship-id]').filter({has:page.getByText('Vultr',{exact:true})});await sponsor.getByText('Evidence for this edition and role',{exact:true}).click();assert.match(await sponsor.innerText(),/sponsoring the agentic AI hackathon, organized by our partner lablab.ai/);
   await sponsor.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(dir,'real-vultr-paris.png'),fullPage:true,animations:'disabled'});
   additional.push({case:'Vultr current host -> historical sponsor in Paris; lablab.ai organizer',runId:vultrRunId,result:(await service.getRun({tenantId:tenant.tenantId,runId:vultrRunId}))?.result,verified:true});
 }
 const rows=await admin.query('select payload from growthx.sources where tenant_id=$1',[tenant.tenantId]);
 const report={material:real?'real public HTTP sources; illustrative buyer':'controlled fixture transport',runId,editionId:primaryId,editionRevisionId:primaryRevision,projectUrl,result:run!.result,additional,sourceEvidence:rows.rows.map(r=>r.payload),checks:{eventToOrganizer:true,organizerToPreviousEdition:true,projectLink:projectAvailable,technologyFragment:projectAvailable,companyRoleFragment:!projectAvailable,partialCoverage:true,reloadSameRevision:true,mobileNoOverflow:true,foreignTenant404:true},paidProviders:{exa:0,apify:0},errors};
 writeFileSync(path.resolve(FRONTEND,'../DemoPuentes/evidence/DP-06',`${prefix}-browser.json`),JSON.stringify(report,null,2));
 t.diagnostic(`${prefix}: event -> organizer -> previous edition -> company/project -> exact relationship fragments; reload and mobile; no paid providers.`);
});
