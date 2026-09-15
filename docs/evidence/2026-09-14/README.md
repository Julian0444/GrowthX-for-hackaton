# Documentation review evidence — September 14, 2026

This directory supports the [project README](../../../README.md), [verification report](../../verification.md) and [known limitations](../../known-limitations.md). Dates use America/Los_Angeles; some raw timestamps are September 15 in UTC.

## Scope and source identity

Application source: **`8b0fba1`**. Checks ran from `/tmp/growthx-review-20260914/frontend`, separate from the user's working frontend. The [source manifest](tested-source.json) compares **293 files with zero mismatches**; generated `next-env.d.ts` is excluded. It contains the full commit ID and hashes.

The [documentation audit](documentation-audit.json) inventories **all 958 files under DemoPuentes**: primary documents, all twelve tickets including Execution and Comments, historical evidence, helper scripts, logs, machine reports, 364 PNGs and two Word scripts. Text was read in full or parsed in full according to its recorded method. All images were inspected through contact sheets, with selected originals checked at full size; DOCX text was extracted from its document XML. File-level methods and hashes are retained. The index is a record of inspection, not an independent certification of every claim in those files.

Primary documentation links were converted from the author's absolute filesystem paths to repository-relative links for GitHub. Earlier evidence payloads, screenshots, logs and their recorded test outcomes were preserved. Historical helper paths and localhost UUID links retain the environment in which they were captured.

## Reused checks on unchanged code

These checks completed earlier in the same September 14 review. Their source hashes still matched, so they were reused rather than rerun for a documentation-only edit.

| Check | Outcome | Raw record |
| --- | --- | --- |
| Production build, including TypeScript | Exit 0 | [Metadata](build.json), [log](build.log) |
| ESLint | Exit 0 | [Metadata](lint.json), [log](lint.log) |
| Acceptance, contracts, connectors and UI | 167 passed, 0 failed, 0 skipped | [Metadata](pure-tests.json), [log](pure-tests.log) |
| Research experience | 6 leaf scenarios passed; 7 results including parent | [Metadata](experience.json), [log](experience.log) |

The research-experience scenario used the production frontend and real Chrome, with controlled API responses and map assets at desktop/mobile sizes. It did not perform a live provider search or require database access.

## Additional checks during documentation

| Check | Outcome | Raw record |
| --- | --- | --- |
| Decision and snapshot integration | 25 results passed, 0 failed, 0 skipped | [Metadata](integration.json), [log](integration.log) |
| Combined decision/map browser command | 10 results passed, 1 failed | [Metadata](browser.json), [log](browser.log) |
| Map portion of that command | 9 leaf scenarios passed, plus their parent result | [Screenshots](screenshots/), [asset check](controlled-map-assets.json) |
| Manual localhost brief preview | DataBridge preview reached; authentication and Spanish-text limitations observed | [Observation record](manual-local-check.json) |

The integration/decision checks used real PostgreSQL and a real worker where required, with controlled source fixtures and no provider keys. Database port **55461** belonged to `growthx-dp11-verification`. It was initially stopped, started for these checks, and stopped again with its data retained. The user's database on port 54329 was not started, migrated, seeded or used by this run.

The decision browser scenario passed assertions for **Explore first**, native manual brief and inquiry copying, reopening, revision conflicts, attributed resolution and immutable revision-one data. Its [clipboard text](controlled-clipboard.txt) is synthetic test material, not an organizer agreement or a real customer outcome.

The scenario subsequently timed out at **Choose**. Its fixed AIT edition is dated September 12, while the worker evaluates at the real current time. The clipboard explicitly shows a past-event exclusion. Disabling Choose is correct product behavior; the test's calendar assumption is stale. Assertions after that point were not executed and the scenario remains failed.

The [manual observation](manual-local-check.json) used the existing server at localhost:3000. It reached the unauthenticated brief preview only. No research was confirmed, no saved run was inspected, and no business record was written through that browser. Dates in the preview were pending; this check does not certify date-input behavior. Generated Spanish questions are a confirmed localization gap.

## Preservation and interpretation

- No application source was changed by this documentation pass.
- No new Exa, Gemini or Apify call was requested by these checks. Provider material in the test harness was controlled.
- The test harness closed the server, worker and Chrome instances it created. The user's existing Next process on port 3000 remained running.
- Only the test container started for this pass was stopped. No containers or volumes were removed. See [cleanup](cleanup.json).
- No commit, push, deployment or external message was performed in this documentation pass.
- Historical tests overlap. Do not add their totals across milestones or count reruns as additional distinct scenarios.
- DP-12 remains in progress. This evidence does not close final acceptance or the unreviewed final video.

For portable setup and the exact current test commands, follow [Local development](../../local-development.md). Metadata here preserves the actual execution directory and command arrays used in this review.
