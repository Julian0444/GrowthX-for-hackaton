# Verification and evidence

This page distinguishes checks on the September 14, 2026 application code (`8b0fba1`) from earlier implementation evidence. Passing checks establish the behavior exercised; they do not establish complete source coverage, production readiness, or commercial validation. See [known limitations](known-limitations.md).

## Checks on the current code

The September 14 review used a separate source/build directory, with application provider keys excluded. The source comparison matches 293 files; generated `next-env.d.ts` is excluded from that comparison.

| Check | Result | Evidence |
| --- | --- | --- |
| Next.js production build, including TypeScript | Passed | [Build log](evidence/2026-09-14/build.log) |
| ESLint | Passed | [Lint log](evidence/2026-09-14/lint.log) |
| Acceptance, contracts, connectors and UI tests | 167 passed, zero failures or skips | [Test log](evidence/2026-09-14/pure-tests.log) |
| Research experience in production Chrome | Six scenarios passed; seven results including the parent; zero page errors | [Browser log](evidence/2026-09-14/experience.log) |
| Decisions and evaluation snapshots, isolated PostgreSQL | 25 passed, zero failures or skips | [Integration log](evidence/2026-09-14/integration.log) |
| Production street map | Nine scenarios passed; ten results including the parent | [Combined browser log](evidence/2026-09-14/browser.log) |
| Database-backed decision browser scenario | Incomplete: timed out at the disabled “Choose” option | [Failure and stack](evidence/2026-09-14/browser.log) |

The browser check runs the real production frontend in Chrome at **1366×900 and 390×844**, using controlled API responses and map assets. It verifies evidence navigation, keyboard focus, stable polling, mobile selection, empty results, and recovery from provider, map and server errors. It does **not** prove a new live search or a database-backed research run. Its configured isolated database port satisfies the test guard, but that scenario does not need a database service.

The additional integration/decision checks used the owned PostgreSQL container on **55461**, separate from the user's database. The combined browser run finished with ten passed results and one failure. Its AIT fixture has a fixed September 12 start, while the real worker evaluates against today's clock. The recorded [clipboard](evidence/2026-09-14/controlled-clipboard.txt) explicitly identifies it as a past event. Disabling “Choose” is the expected eligibility safeguard; the test's assumption that this fixture remains future is stale.

Before that failure, assertions passed for saving “Explore first,” native brief/message clipboard contents, reopening, concurrent-edit conflict recovery, attributed resolution, and unchanged revision-one data. The later choice, catalog-refresh, mobile, clipboard-denial and foreign-tenant assertions were **not reached in this run**. The complete scenario is not marked passed.

A separate manual check reached **localhost:3000 → Brief → DataBridge → Review brief** without authentication. Persisted research required sign-in and was not inspected in that browser session. Generated research questions still appeared in Spanish. This is a brief-preview check, not a new end-to-end real-source acceptance.

## Earlier implementation verification

These results belong to their recorded source versions. Suites overlap, and repeat runs are not additional distinct tests.

| Milestone | Recorded result | Evidence |
| --- | --- | --- |
| Source reading, relationships and location integrated locally | 318 function/integration tests and 29 browser results; build, TypeScript and lint passed | [Integration report](../DemoPuentes/evidence/local-integration-DP05-DP06-DP08/README.md) |
| Explainable comparison, DP-07 | 334 regression tests; factual priorities, changed briefs and immutable snapshots | [Comparison matrix](../DemoPuentes/evidence/DP-07/README.md) |
| Geographic resolution, DP-08 | 313 regression tests; real public coordinates and Census address resolution | [Location matrix](../DemoPuentes/evidence/DP-08/README.md) |
| Street map, DP-09 | Nine map scenarios passed on both Turbopack and webpack production builds | [Map matrix](../DemoPuentes/evidence/DP-09/README.md) |
| Research experience, DP-10 | 339 function/integration tests and 42 distinct browser scenarios across accepted runs | [Experience matrix](../DemoPuentes/evidence/DP-10/README.md) |
| Saved decisions, DP-11 | **349 function/integration tests and 29 distinct browser scenarios**, zero failures/skips; build and lint passed | [Final verification summary](../DemoPuentes/evidence/DP-11/verification-summary.json) |

DP-11 exercised transaction persistence, tenant isolation, four decision choices, attributed condition responses, concurrent edits, native clipboard contents, and reopening after catalog changes. Historical source and geographic revisions remained fixed. The local browser check read a **4,036-character brief** from the clipboard and confirmed identical contents after reopening. [Recorded browser result](../DemoPuentes/evidence/DP-11/real-browser.json), [original text](../DemoPuentes/evidence/DP-11/real-clipboard.txt), [reopened text](../DemoPuentes/evidence/DP-11/real-reopened-clipboard.txt).

## What was demonstrated with real sources

The September 10–11 local recordings used public event sources for AI Tinkerers, AI Security Hackathon and Agent Arena. The buyer profiles were illustrative. The map resolved a published **501 Folsom Street** address through Census, preserving its approximate/interpolated precision; city-only and private venues remained without a pin. [Real map evidence](../DemoPuentes/evidence/DP-09/real-production.json).

An announced prior AI Tinkerers program supplied a useful reason to investigate a technical activity. The recorded workflow saved a three-option comparison and an English decision brief. [Snapshot and source references](../DemoPuentes/evidence/DP-12/local-proof.json), [saved preview](../DemoPuentes/evidence/DP-12/brief-preview.txt). The matching reopened preview proves preview consistency; DP-12's empty `clipboard.txt` is not clipboard evidence. Its controlled decision browser scenario separately passed the native clipboard checks.

The September 12 and 13 editions are now historical. These recordings demonstrate the research and decision workflow, not current participation availability. Saved localhost links require the original database and tenant session; they are not public demo URLs.

## Interpreting DP-12

[DP-12](../DemoPuentes/issues/12-aceptacion-real-y-demo-puentes.md) remains **in progress**. Its build/lint passed, and [30 focused checks](../DemoPuentes/evidence/DP-12/corrected-checks.log) subsequently covered its two failed regression leaf cases. Its [browser run](../DemoPuentes/evidence/DP-12/browser-release.log) passed decision/map checks but stopped the experience suite at a database-port guard. Today's experience success supersedes that specific validation gap, not the original log. Global acceptance and video review remain open.

## Provider usage and reproducibility

The [retained usage audit](../DemoPuentes/evidence/DP-12/provider-usage.md) reports **13 Exa Search requests and USD 0.091**, with explicit ledger scope and no independent billing reconciliation. Apify recovery has controlled tests, but no real Actor start is established. Five real Census requests are documented with no provider service charge; compute/network costs, whole-project HTTP totals, map requests and account-wide model costs are not fully measured.

Use a separate database, queue and build directory, omit provider keys, and preserve previous logs. Follow the [isolated setup and test guide](local-development.md), [test scripts](../frontend/package.json) and milestone matrices. Fixed-date fixtures need an explicit test clock; do not change real event dates to make tests pass.
