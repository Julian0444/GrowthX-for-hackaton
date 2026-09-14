// Reopen the recorded real DP-06 runs on an isolated production build. No
// worker runs and no source is fetched again; this verifies persisted evidence.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { chromium } from 'playwright';
import { hashSessionToken } from '../lib/server/auth/session.ts';
import { FRONTEND, startTestApp } from '../tests/support/source-browser.ts';

async function main() {
  assert.ok(process.env.GROWTHX_ADMIN_DATABASE_URL?.includes(':55446/'), 'DP-06 owned cluster required');
  assert.ok(process.env.DP06_PRODUCTION_DIR, 'Isolated production build required');
  process.env.DP05_PRODUCTION_DIR = process.env.DP06_PRODUCTION_DIR;
  const evidence = path.resolve(FRONTEND, '../DemoPuentes/evidence/DP-06');
  const report = JSON.parse(readFileSync(path.join(evidence, 'real-browser.json'), 'utf8'));
  const admin = new pg.Client({ connectionString: process.env.GROWTHX_ADMIN_DATABASE_URL });
  await admin.connect();
  const app = await startTestApp();
  const browser = await chromium.launch({ headless: false });
  const checks: object[] = [];
  try {
    for (const item of [{ name: 'ait', runId: report.runId }, { name: 'vultr', runId: report.additional[0].runId }]) {
      const run = (await admin.query('select tenant_id,requested_by,result from growthx.runs where id=$1', [item.runId])).rows[0];
      assert.ok(run);
      const before = await admin.query('select canonical_url,output,state from growthx.source_reads where tenant_id=$1 order by run_id,canonical_url', [run.tenant_id]);
      const token = randomBytes(24).toString('hex');
      await admin.query("insert into growthx.sessions(token_hash,user_id,tenant_id,expires_at) values($1,$2,$3,now()+interval '1 hour')", [hashSessionToken(token), run.requested_by, run.tenant_id]);
      const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
      await context.addCookies([{ name: 'growthx_session', value: token, url: app.base, httpOnly: true }]);
      const page = await context.newPage();
      await page.goto(`${app.base}/?run=${item.runId}`);
      await page.getByRole('button', { name: 'Open background dossier', exact: true }).click();
      const dossier = page.getByTestId('edition-dossier');
      await dossier.waitFor();
      const id = await dossier.getAttribute('data-edition-id');
      const revision = await dossier.getAttribute('data-edition-revision-id');
      assert.equal(id, run.result.editionId);
      assert.ok(run.result.editionRevisionIds.includes(revision));
      await dossier.getByText('Why this matters for your brief', { exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(evidence, 'screenshots', `reopened-${item.name}-event.png`), fullPage: true, animations: 'disabled' });
      await dossier.getByRole('button', { name: item.name === 'ait' ? 'AI Tinkerers San Francisco' : 'Vultr', exact: true }).click();
      const organizer = page.getByTestId('organizer-dossier');
      const previous = organizer.getByRole('button', { name: item.name === 'ait' ? 'AI Tinkerers SF - Secure Agents Buildathon' : 'RAISE 2025 · agentic AI hackathon', exact: true });
      await previous.scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(evidence, 'screenshots', `reopened-${item.name}-organizer.png`), fullPage: true, animations: 'disabled' });
      await previous.click();
      const company = dossier.locator('[data-relationship-id]').filter({ has: page.getByText(item.name === 'ait' ? 'Google Cloud' : 'Vultr', { exact: true }) });
      await company.getByText('Evidence for this edition and role', { exact: true }).click();
      assert.match(await company.innerText(), item.name === 'ait' ? /Thank you to Google Cloud/ : /sponsoring the agentic AI hackathon, organized by our partner lablab.ai/);
      await company.scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(evidence, 'screenshots', `reopened-${item.name}-company.png`), fullPage: true, animations: 'disabled' });
      await page.setViewportSize({ width: 390, height: 844 });
      await company.scrollIntoViewIfNeeded();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: path.join(evidence, 'screenshots', `reopened-${item.name}-mobile.png`), fullPage: true, animations: 'disabled' });
      assert.deepEqual((await admin.query('select canonical_url,output,state from growthx.source_reads where tenant_id=$1 order by run_id,canonical_url', [run.tenant_id])).rows, before.rows);
      checks.push({ ...item, editionId: id, revision, samePersistedEvidence: true, mobileNoOverflow: true });
      await context.close();
      await admin.query('delete from growthx.sessions where token_hash=$1', [hashSessionToken(token)]);
    }
    writeFileSync(path.join(evidence, 'reopened-real.json'), JSON.stringify({ checks, noWorker: true, publicFetches: 0 }, null, 2));
    console.log('Both real dossiers reopened on the final build; unchanged source reads, company fragments and mobile verified.');
  } finally {
    await browser.close();
    await app.close();
    await admin.end();
  }
}
void main().catch(error => { console.error(error instanceof Error ? error.message : "Reopen verification failed"); process.exitCode = 1; });
