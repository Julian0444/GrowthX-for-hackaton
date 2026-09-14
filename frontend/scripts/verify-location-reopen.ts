// Reopen already saved real observations against a production build. No worker,
// source reads, geocoding or credentials in output; temporary browser session.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import {chromium} from 'playwright';
import {hashSessionToken} from '../lib/server/auth/session.ts';
import {startTestApp,FRONTEND} from '../tests/support/source-browser.ts';

async function main(){
  assert.ok(process.env.GROWTHX_ADMIN_DATABASE_URL?.includes(':55448/'));assert.ok(process.env.DP08_PRODUCTION_DIR);
  process.env.DP05_PRODUCTION_DIR=process.env.DP08_PRODUCTION_DIR;
  const evidence=path.resolve(FRONTEND,'../DemoPuentes/evidence/DP-08');
  const saved=JSON.parse(readFileSync(path.join(evidence,'real-consumers.json'),'utf8'));
  const admin=new pg.Client({connectionString:process.env.GROWTHX_ADMIN_DATABASE_URL});await admin.connect();
  const user=(await admin.query('select user_id from growthx.memberships where tenant_id=$1 limit 1',[saved.tenantId])).rows[0];assert.ok(user);
  const token=randomBytes(24).toString('hex');
  await admin.query("insert into growthx.sessions(token_hash,user_id,tenant_id,expires_at) values($1,$2,$3,now()+interval '1 hour')",[hashSessionToken(token),user.user_id,saved.tenantId]);
  const app=await startTestApp(),browser=await chromium.launch({headless:true});
  try{
    const context=await browser.newContext({viewport:{width:1366,height:900}});await context.addCookies([{name:'growthx_session',value:token,url:app.base,httpOnly:true}]);
    const page=await context.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    const address=saved.samples[0],city=saved.samples[1];
    await page.goto(`${app.base}/?run=${address.runId}`);await page.getByRole('navigation').getByRole('button',{name:'Eventos',exact:true}).click();await page.getByRole('button',{name:'Open background dossier',exact:true}).click();
    const dossier=page.getByTestId('edition-dossier');await dossier.waitFor();assert.equal(await dossier.getAttribute('data-edition-revision-id'),address.read.editionRevisions.at(-1).id);
    const location=page.getByTestId('location-evidence');await location.locator('summary').click();assert.match(await location.innerText(),/aproximada.*interpolada/);assert.match(await location.innerText(),/06075/);await location.screenshot({path:path.join(evidence,'screenshots/final-address.png')});
    await page.setViewportSize({width:390,height:844});await location.scrollIntoViewIfNeeded();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(evidence,'screenshots/final-address-mobile.png')});
    await page.setViewportSize({width:1366,height:900});await page.getByRole('navigation').getByRole('button',{name:'Eventos',exact:true}).click();await page.getByRole('button',{name:'Mapa',exact:true}).click();
    const pin=page.locator(`[data-point-edition-id="${address.result.editionId}"]`);await pin.waitFor();assert.equal(await page.locator(`[data-point-edition-id="${city.result.editionId}"]`).count(),0);
    const card=page.locator(`[data-testid="sf-edition-list"] [data-edition-id="${city.result.editionId}"]`);await card.waitFor();assert.match(await card.getByTestId('event-location-summary').innerText(),/Solo ciudad/);await card.screenshot({path:path.join(evidence,'screenshots/final-city-without-pin.png')});
    await pin.focus();await pin.press('Enter');assert.equal(await dossier.getAttribute('data-edition-id'),address.result.editionId);
    assert.deepEqual(errors,[]);
    const requests=Number((await admin.query('select count(*) as n from growthx.location_lookups where tenant_id=$1',[saved.tenantId])).rows[0].n);assert.equal(requests,saved.providerUse.censusRequests);
    writeFileSync(path.join(evidence,'reopen-production.json'),JSON.stringify({observedAt:new Date().toISOString(),build:process.env.DP08_PRODUCTION_DIR,checks:['original geographic revision reopens','interpolation/provenance visible','city stays in list with reason and without marker','keyboard selection in current map opens same edition despite overlapping source markers','mobile no horizontal overflow','no new source/geocoder/paid requests'],additionalRequests:0,requestCount:requests},null,2)+'\n');
    console.log('Production reopen passed; no additional external requests.');
  }finally{await browser.close();await app.close();await admin.query('delete from growthx.sessions where token_hash=$1',[hashSessionToken(token)]);await admin.end();}
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Reopen failed');process.exitCode=1;});
