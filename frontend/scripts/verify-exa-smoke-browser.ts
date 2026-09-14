// Read-only verification of an ALREADY executed real smoke; no Exa key needed.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startTestApp } from '../tests/support/discovery-browser.ts';
import type { EvaluationRunView } from '../lib/api/atlas-client.ts';

async function main() {
  const dir=path.resolve(process.argv[2]);await mkdir(path.join(dir,'screenshots'),{recursive:true});
  const session=JSON.parse(await readFile('/tmp/growthx-dp04-smoke-session.json','utf8'));
  const app=await startTestApp();const browser=await chromium.launch({headless:true});
  try {
    const context=await browser.newContext({viewport:{width:1366,height:900}});await context.addCookies([{name:'growthx_session',value:session.token,url:app.base,httpOnly:true}]);
    const page=await context.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`${app.base}/?run=${session.runId}`);await page.getByTestId('discovery-candidate').first().waitFor();
    const response=await context.request.get(`${app.base}/api/evaluations/${session.runId}`);assert.equal(response.status(),200);
    const run:EvaluationRunView=await response.json();assert.equal(run.discovery?.progress.material,'real');assert.equal(run.discovery?.operations.length,1);
    assert.equal(await page.getByTestId('discovery-candidate').count(),5);assert.equal(await page.locator('[data-organizer-id]').count(),0);
    for(const candidate of run.discovery!.candidates)assert.equal(await page.getByTestId('discovery-candidate').locator(`a[href="${candidate.canonicalUrl}"]`).count(),2);
    const sourceIds=await page.getByTestId('discovery-candidate').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-source-ids')));
    await page.screenshot({path:path.join(dir,'screenshots/real-discovery-desktop.png'),fullPage:true,animations:'disabled'});
    await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
    await page.getByTestId('discovery-candidate').first().scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(dir,'screenshots/real-discovery-mobile.png'),fullPage:true,animations:'disabled'});
    await page.close();const reopened=await context.newPage();await reopened.goto(`${app.base}/?run=${session.runId}`);await reopened.getByTestId('discovery-candidate').first().waitFor();
    assert.deepEqual(await reopened.getByTestId('discovery-candidate').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-source-ids'))),sourceIds);
    await reopened.getByTestId('discovery-audit').locator('summary').click();assert.match(await reopened.getByTestId('discovery-audit').innerText(),/USD 0.007/);
    await reopened.screenshot({path:path.join(dir,'screenshots/real-discovery-reopened.png'),fullPage:true,animations:'disabled'});
    assert.deepEqual(errors,[]);
    const result={runId:session.runId,production:Boolean(process.env.DP04_PRODUCTION_DIR),pages:5,viewports:['1366x900','390x844'],sameSourceIdsAfterClosingTab:true,providerCallsBeforeAndAfter:1,reportedCostUsd:.007,pageErrors:errors};
    await writeFile(path.join(dir,'real-browser.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
  } finally {await browser.close();await app.close();}
}
void main().catch(error=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1;});
