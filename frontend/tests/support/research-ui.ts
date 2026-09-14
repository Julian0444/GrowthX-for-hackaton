import type { Page } from 'playwright';

// Existing persistence regressions inspect the audit. Open it through the
// same disclosures a user uses; DP10 tests separately assert its initial state.
export async function revealComparisonAudit(page: Page) {
  for (const name of ['Comparison technical details', 'All conditions, sources and technical detail', 'Decision technical details', 'Source metadata']) {
    for (const summary of await page.getByText(name, {exact:true}).all()) {
      if (await summary.isVisible() && await summary.locator('..').getAttribute('open') === null) await summary.click();
    }
  }
}
export async function revealSavedEvaluations(page: Page) {
  const summary=page.getByText('Saved decisions and evaluations',{exact:true});
  if(await summary.isVisible() && await summary.locator('..').getAttribute('open') === null) await summary.click();
}
