import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID,createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import {chromium,type Page} from 'playwright';
import {runMigrations} from '../../lib/server/db/migrate.ts';
import {loadCuratedCatalog} from '../../lib/server/catalog/store.ts';
import {createEvaluationService} from '../../lib/server/evaluations/service.ts';
import {stopEvaluationQueue} from '../../lib/server/evaluations/queue.ts';
import {closePools} from '../../lib/server/db/pool.ts';
import {comparisonFixture} from '../fixtures/comparison.ts';
import {briefBody} from '../fixtures/research-brief.ts';
import {CONTROLLED_MAP_STYLE} from '../fixtures/sf-map.ts';
import {composeDecisionBrief} from '../../lib/research/decision-brief.ts';
import type {ResearchHome} from '../../components/research-dashboard/research-types.ts';
import type {ComparisonRunResult,DecisionRead} from '../../lib/api/atlas-client.ts';
import {FRONTEND,startTestApp,startProcess,stopProcess,seedSession,eventually} from '../support/source-browser.ts';

test('DP11 Chrome production: actionable brief, actual clipboard, revisions, tab conflict and historical evidence/map',{timeout:240000},async t=>{
 assert.ok(/:554(?:61|72)\//.test(process.env.GROWTHX_ADMIN_DATABASE_URL ?? ''),'Owned DP11/DP12 isolated DB required');
 await runMigrations();const admin=new pg.Client({connectionString:process.env.GROWTHX_ADMIN_DATABASE_URL});await admin.connect();const session=await seedSession(admin),foreign=await seedSession(admin);
 const pool=new pg.Pool({connectionString:process.env.GROWTHX_DATABASE_URL});const fixture=comparisonFixture();const edition=fixture.manifest.editions.find(e=>e.editionId===fixture.ait.editionId)!;
 edition.coordinates={lat:37.7872,lng:-122.3944};edition.publicLocation={originalAddress:'501 Folsom St, San Francisco, CA 94105',address:null,venue:'Controlled historical venue',city:'San Francisco',precision:'venue',method:'published_coordinates',provider:'controlled test',resolvedAt:edition.revisedAt,sourceIds:[fixture.manifest.sources[0].id],status:'announced',limitation:'Synthetic test location'};
 // This synthetic map case explicitly publishes the venue, unlike the private-venue AIT source fixture.
 for (const claim of fixture.manifest.claims) if (claim.subject.type === 'edition' && claim.subject.editionId === edition.editionId && claim.attribute === 'location:restriction') claim.value = {kind:'text',text:'Controlled test: public venue announced'};
 await loadCuratedCatalog(pool,session.tenantId,fixture.manifest);
 const service=createEvaluationService();const app=await startTestApp();const worker=startProcess(['worker/index.ts'],FRONTEND);const browser=await chromium.launch({channel:'chrome'});
 t.after(async()=>{await browser.close();await stopProcess(worker.child);await app.close();await stopEvaluationQueue();await closePools();await pool.end();await admin.end()});
 const base=await service.accept({...session,body:{...briefBody(),idempotencyKey:randomUUID()}});if(base.status!=='accepted')throw Error('profile');
 await eventually(async()=>(await service.getRun({tenantId:session.tenantId,runId:base.runId}))?.state==='completed'?true:null,'profile');
 const compared=await service.accept({...session,body:{mode:'investment_comparison',profileRunId:base.runId,editionIds:[edition.editionId,fixture.vultr.editionId],idempotencyKey:randomUUID()}});if(compared.status!=='accepted')throw Error('comparison');
 await eventually(async()=>(await service.getRun({tenantId:session.tenantId,runId:compared.runId}))?.state==='completed'?true:null,'comparison');
 const result=(await service.getRun({tenantId:session.tenantId,runId:compared.runId}))!.result as ComparisonRunResult;const original=JSON.stringify(result.bundle);
 const context=await browser.newContext({viewport:{width:1366,height:900},permissions:['clipboard-read','clipboard-write']});
 await context.addCookies([{name:'growthx_session',value:session.token,url:app.base,httpOnly:true}]);await context.route('https://tiles.openfreemap.org/styles/liberty',route=>route.fulfill({json:CONTROLLED_MAP_STYLE}));
 let page=await context.newPage();const errors:string[]=[];const watch=(p:Page)=>p.on('pageerror',e=>errors.push(e.message));watch(page);
 const out=process.env.DP11_EVIDENCE_DIR!;mkdirSync(path.join(out,'screenshots'),{recursive:true});
 const candidate=(p:Page)=>p.locator(`article[data-edition-id="${edition.editionId}"]`);
 const open=async(p:Page,url=`${app.base}/?run=${compared.runId}`)=>{await p.goto(url);await candidate(p).getByTestId('decision-open').or(candidate(p).getByTestId('candidate-decision')).waitFor()};
 await open(page);await candidate(page).getByTestId('decision-open').click();await page.getByLabel('Decision reasons',{exact:true}).fill('Explore an agent debugging workshop before committing budget.');
 await page.getByRole('radio',{name:'Explore first',exact:true}).check();await page.getByLabel('Activity objective',{exact:true}).fill('Collect practical feedback from agent builders');await page.getByLabel('Brief owner',{exact:true}).fill('Alex');
 await page.getByLabel('Activity modality',{exact:true}).selectOption('workshop');await page.getByLabel('Activity detail',{exact:true}).fill('Hands-on debugging lab; proposed only');await page.getByLabel('Next questions',{exact:true}).fill('Can we run a workshop?\nWhat is the full quote and access policy?');
 await page.getByRole('button',{name:'Add buyer cost',exact:true}).click();await page.getByLabel('Cost 1 label',{exact:true}).fill('Travel');await page.getByLabel('Cost 1 state',{exact:true}).selectOption('estimated');await page.getByLabel('Cost 1 amount',{exact:true}).fill('500');
 const response=page.waitForResponse(r=>r.url().endsWith('/api/decisions')&&r.request().method()==='POST');await page.getByTestId('decision-save').click();const savedResponse=await response;assert.equal(savedResponse.status(),201,await savedResponse.text());const saved:DecisionRead=await savedResponse.json();delete (saved as DecisionRead & {deduplicated?:boolean}).deduplicated;
 assert.equal(saved.decision.intent,'explore_first');assert.equal(saved.campaign?.owner,'Alex');assert.ok(saved.campaign?.costItems.some(c=>c.evidence));
 await page.getByTestId('campaign-draft-panel').waitFor();const campaignHref=await page.getByTestId('campaign-link').getAttribute('href');assert.ok(campaignHref?.includes('revision=1'));
 await page.getByRole('button',{name:'Copy manual draft',exact:true}).click();await page.getByLabel('Decision brief preview').waitFor();
 let clipboard=await page.evaluate(()=>navigator.clipboard.readText());assert.equal(clipboard,composeDecisionBrief(saved,result.bundle,`${app.base}${campaignHref}`));writeFileSync(path.join(out,'controlled-clipboard.txt'),clipboard);
 await page.getByRole('button',{name:'Copy inquiry message',exact:true}).click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),composeDecisionBrief(saved,result.bundle,`${app.base}${campaignHref}`,true));
 await page.screenshot({path:path.join(out,'screenshots/controlled-brief.png'),fullPage:true});
 await page.close();page=await context.newPage();watch(page);await page.goto(`${app.base}${campaignHref}`);await page.getByTestId('campaign-draft-panel').waitFor();assert.match(await page.getByTestId('saved-brief-context').innerText(),/Alex/);
 const decisionUrl=`${app.base}/?run=${compared.runId}&decision=${saved.decisionId}`;await open(page,decisionUrl);const tabB=await context.newPage();watch(tabB);await open(tabB,decisionUrl);
 await candidate(page).getByRole('button',{name:'Edit decision & brief',exact:true}).click();await candidate(tabB).getByRole('button',{name:'Edit decision & brief',exact:true}).click();
 await page.getByLabel('Decision reasons',{exact:true}).fill('Tab A: ask for complete commercial conditions');await tabB.getByLabel('Decision reasons',{exact:true}).fill('Tab B: keep my original research rationale');await tabB.getByLabel('Brief owner',{exact:true}).fill('Sam');
 let changed=page.waitForResponse(r=>r.url().includes(`/api/decisions/${saved.decisionId}`)&&r.request().method()==='PATCH');await page.getByTestId('decision-save').click();assert.equal((await changed).status(),200);
 const rejected=tabB.waitForResponse(r=>r.url().includes(`/api/decisions/${saved.decisionId}`)&&r.request().method()==='PATCH');await tabB.getByTestId('decision-save').click();assert.equal((await rejected).status(),409);assert.equal(await tabB.getByLabel('Decision reasons',{exact:true}).inputValue(),'Tab B: keep my original research rationale');assert.equal(await tabB.getByLabel('Brief owner',{exact:true}).inputValue(),'Sam');
 await tabB.getByRole('button',{name:'Load latest revision · keep my draft',exact:true}).click();await tabB.getByText(/Current revision 2 loaded/).waitFor();assert.equal(await tabB.getByLabel('Decision reasons',{exact:true}).inputValue(),'Tab B: keep my original research rationale');await tabB.screenshot({path:path.join(out,'screenshots/controlled-conflict.png'),fullPage:true});
 changed=tabB.waitForResponse(r=>r.url().includes(`/api/decisions/${saved.decisionId}`)&&r.request().method()==='PATCH');await tabB.getByTestId('decision-save').click();assert.equal((await changed).status(),200);
 await open(page,decisionUrl);await candidate(page).getByRole('button',{name:'Mark resolved',exact:true}).first().click();await page.getByLabel('Answer resolving the condition',{exact:true}).fill('Buyer accepts this uncertainty only for research');await page.getByLabel('Response attributed to',{exact:true}).fill('Alex, buyer');await page.getByLabel('Response support',{exact:true}).fill('Internal planning note; no organizer confirmation');
 changed=page.waitForResponse(r=>r.url().includes(`/api/decisions/${saved.decisionId}`)&&r.request().method()==='PATCH');await page.getByRole('button',{name:'Confirm resolution',exact:true}).click();assert.equal((await changed).status(),200);await page.getByTestId('decision-revision').first().getByText('4',{exact:true}).waitFor();
 const exact=await context.request.get(`${app.base}/api/decisions/${saved.decisionId}?revision=1`);assert.deepEqual(await exact.json(),saved);
 // The three other human choices work through the same editor and transaction.
 let humanRevision=4;
 for(const [label,verdict] of [['Choose','chosen'],['Discard','discarded'],['Leave pending','pending']] as const){
   await open(page,decisionUrl);await candidate(page).getByRole('button',{name:'Edit decision & brief',exact:true}).click();
   await page.getByRole('radio',{name:label,exact:true}).check();await page.getByLabel('Decision reasons',{exact:true}).fill(`Buyer rationale for ${verdict}`);
   const response=page.waitForResponse(r=>r.url().includes(`/api/decisions/${saved.decisionId}`)&&r.request().method()==='PATCH');await page.getByTestId('decision-save').click();const reply=await response;assert.equal(reply.status(),200,await reply.text());const choice:DecisionRead=await reply.json();humanRevision++;
   assert.equal(choice.decision.verdict,verdict);assert.equal(choice.decision.intent,null);assert.equal(choice.decision.revision,humanRevision);assert.equal(choice.decision.conditions.length,saved.decision.conditions.length);assert.equal(!!choice.campaign,verdict==='chosen');
 }
 // Reimport into this isolated tenant using the normal catalog writer, with a new venue/name and source revision.
 const refreshed=structuredClone(fixture.manifest);refreshed.label=`DP11 reimport ${randomUUID()}`;const current=refreshed.editions.find(e=>e.editionId===edition.editionId)!;current.previousRevisionId=current.id;current.id=`dp11-new-${randomUUID()}`;current.revisedAt='2026-09-11T02:00:00Z';current.name='Changed current catalog venue';current.coordinates={lat:37.776,lng:-122.42};current.publicLocation={...current.publicLocation!,venue:'New current venue',originalAddress:'New venue address',resolvedAt:current.revisedAt};
 await loadCuratedCatalog(pool,session.tenantId,refreshed);
 const home:ResearchHome=await (await context.request.get(`${app.base}/api/evaluations`)).json();const historical=home.evaluations.find(e=>e.runId===compared.runId)!;
 assert.equal(historical.editions.find(e=>e.editionId===edition.editionId)?.name,edition.name,'saved index must keep the snapshot edition name');
 await open(page,`${decisionUrl}&revision=1`);await candidate(page).getByRole('button',{name:'Inspect evidence',exact:true}).click();const dossier=page.getByTestId('edition-dossier');await dossier.waitFor();assert.equal(await dossier.getAttribute('data-edition-revision-id'),edition.id);assert.ok(!(await dossier.innerText()).includes('Changed current catalog venue'));
 await page.getByRole('button',{name:'Close evidence',exact:true}).click();await page.getByRole('button',{name:'Explore this comparison in list & map',exact:true}).click();await page.getByRole('button',{name:'Map',exact:true}).click();
 const pin=page.locator(`[data-point-edition-id="${edition.editionId}"]`);await pin.waitFor();assert.equal(await pin.getAttribute('data-edition-revision-id'),edition.id);assert.equal(Number(await pin.getAttribute('data-longitude')),edition.coordinates!.lng);assert.equal(Number(await pin.getAttribute('data-latitude')),edition.coordinates!.lat);await pin.press('Enter');assert.match(await page.getByTestId('map-event-popup').innerText(),/501 Folsom/);await page.screenshot({path:path.join(out,'screenshots/controlled-historical-map.png'),fullPage:true});
 assert.equal(JSON.stringify(((await service.getRun({tenantId:session.tenantId,runId:compared.runId}))!.result as ComparisonRunResult).bundle),original);
 await page.setViewportSize({width:390,height:844});await page.goto(`${app.base}${campaignHref}`);await page.getByTestId('campaign-draft-panel').waitFor();await page.screenshot({path:path.join(out,'screenshots/controlled-brief-mobile.png'),fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 // Clipboard failure must report failure, with the actual previous clipboard unchanged.
 await page.evaluate(()=>Object.defineProperty(navigator.clipboard,'writeText',{configurable:true,value:async()=>{throw new DOMException('Denied','NotAllowedError')}}));clipboard=await page.evaluate(()=>navigator.clipboard.readText());await page.getByRole('button',{name:'Copy manual draft',exact:true}).click();await page.getByText('Copy failed. Select and copy the preview text manually.',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),clipboard);
 const decoy=await browser.newContext();await decoy.addCookies([{name:'growthx_session',value:foreign.token,url:app.base,httpOnly:true}]);assert.equal((await decoy.request.get(`${app.base}/api/decisions/${saved.decisionId}?revision=1`)).status(),404);assert.equal((await decoy.request.patch(`${app.base}/api/decisions/${saved.decisionId}`,{data:{expectedRevision:4,reasons:['foreign']}})).status(),404);await decoy.close();assert.deepEqual(errors,[]);
 writeFileSync(path.join(out,'dp11-controlled-browser.json'),JSON.stringify({browser:'Google Chrome',production:true,databasePort:Number(new URL(process.env.GROWTHX_ADMIN_DATABASE_URL!).port),material:'Controlled sources and changed catalog; real DB, worker and UI',runId:compared.runId,decisionId:saved.decisionId,clipboardSha256:createHash('sha256').update(clipboard).digest('hex'),checks:{fullBrief:true,fourHumanChoices:true,actualClipboard:true,inquiryClipboard:true,closeReopen:true,twoTabConflict:true,localTextRetained:true,resolutionAttributed:true,revisionOneUnchanged:true,historicalIndexName:true,reimportHistoricalDossier:true,reimportHistoricalCoordinates:true,mobile:true,clipboardDenied:true,foreignTenant:true},errors},null,2));
});
