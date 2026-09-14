# DP-12 — Dependency and acceptance evidence audit

Read on 2026-09-11 UTC: complete DP-12 ticket, including Execution/Comments; `spec.md`; `implementation-plan.md`; current `PuentesHandoff.md` and finalProduct sections on research, evidence/relationships, map, comparison, budget, saved brief/reopening, two-minute demo, provider economy and validation. Historic pending notes in handoff/individual Comments do not supersede their later verified closures. [Captured closures](dependency-closures.json).

All **DP-01–11 tickets declare Execution: verified**, supported by their closure matrices and logs. Their verification applies to their scope and recorded revisions; it does not automatically mark DP-12 or the missing user video verified.

| Dependency | Evidence checked | Current code/contract reused |
| --- | --- | --- |
| DP-01 | [Verification](../dp-01-verificacion.md), [claims](../dp-01-afirmaciones.md), [organizers](../dp-01-organizadores.md). Three factual future SF options at source-review date; role and coverage limits explicit. | Reference URLs are research leads. They do not populate fallback facts or certify audience, access, payment or ROI. |
| DP-02 | [Trust matrix](../DP-02/README.md), later DP-11 regression log. | `lib/evidence/{calendar,claim-support,costs}.ts`; eligibility/research/decision consumers preserve constraints and uncertain costs. |
| DP-03 | [Brief/contract matrix](../DP-03/README.md), later DP-11 regression log. | Shared profile/claim/source/location/consumption contracts and runtime validation; profile revisions remain immutable. |
| DP-04 | [Discovery matrix and real smoke](../DP-04/README.md), current ledger. | `discovery/durable.ts`, `exa-search.ts`, query plan and SQL migration 007; reservations precede dispatch, snippets remain candidate sources. |
| DP-05 | [Source matrix and real sources](../DP-05/README.md). | `sources/{reader,extract,cache,proposed-source,website-crawler}.ts`; proposed/full sources remain distinct; reading cache and directed Apify recovery. |
| DP-06 | [Relationships matrix](../DP-06/README.md), [real saved dossiers](../DP-06/real-browser.json), later local integration. | `relationships/{durable,resolve}.ts`, `sources/relationship-content.ts`; `readProposedSource`/`cachedSourceRead` are actually called by the durable workflow. Edition and role remain explicit. |
| DP-07 | [Comparison matrix](../DP-07/README.md), later DP-11 browser release. | `evaluations/decision-reading.ts` version `research-comparison/1`, comparison and snapshot store; `buildReadBundle` used by historical reopen. |
| DP-08 | [Location matrix](../DP-08/README.md), [real consumers](../DP-08/real-consumers.json), [local integration](../local-integration-DP05-DP06-DP08/README.md). | Shared location projection, append-only geo revisions, Census provenance, no city-only venue pin. Local migrations 008–010 were subsequently integrated; original isolated-only note is superseded. |
| DP-09 | [Map matrix](../DP-09/README.md), later DP-11 production browser release. | MapLibre/OpenFreeMap; current shared list/map revision and selection, approximate marker, no-point reasons and degradation. |
| DP-10 | [Experience matrix](../DP-10/README.md), [real Chrome](../DP-10/real-browser.json), later DP-11 browser release. | Research dashboard, evidence panel, comparison and list/map state. English acceptance is being extended in DP-12 because persisted/generated Spanish remained visible. |
| DP-11 | [Closure matrix](../DP-11/README.md), [verification summary](../DP-11/verification-summary.json), [real browser](../DP-11/real-browser.json), clipboard and local preservation evidence. | Decision store transactions, expected revision conflict check, attributed resolution; revision-aware wire/read and campaign/index consumers. |

## Why the prior green suites are reusable

[Preflight reuse audit](reuse-audit.json) compared **283 frontend files** with the retained DP-11 build copy. Its only mismatch at that point was generated `frontend/next-env.d.ts`. The actual DP-11 final logs end with **349/349 functions/integration** and **33/33 browser results, corresponding to 29 distinct leaf cases**, zero failures/skips. Build/TypeScript and lint exited zero with provider keys unloaded, DB 55461 and a separate build directory. These are prior executed results, not tests credited merely because their files exist.

DP-12's subsequent English changes invalidate blanket reuse for the modified presentation/generated explanations. Scoped English, affected decision/evidence/map regressions, lint, TypeScript and a new isolated production build are required and are recorded separately by the main DP-12 acceptance run. Unchanged database/recovery suites need no repeat absent a new failure or changed contract. This audit itself executes no tests, builds, workers or provider smokes.

## Mapping the spec acceptance matrix to executed evidence

Rows refer to the exact named cases in `spec.md`. DP-11 regression release executed `tests/**/*.test.ts`; browser files below refer to the recorded final release or the earlier source-specific closure when the browser file was outside that release. Controlled cases remain controlled evidence.

| Spec case(s) | Executed evidence reused | DP-12 consideration |
| --- | --- | --- |
| Two different briefs | DP-03/04/07 closure; `research-brief`, `exa-discovery`, `explicable-comparison` contract/acceptance/integration cases in DP-11 regression; comparison browser in DP-11 release. | Copy changes should preserve query/profile semantics. |
| Rich JSON-LD + text; URL/alias retry | DP-05 source tests and real F1–F6; DP-04 discovery and DP-06 relationships cases, included in DP-11 regression. | Do not attribute controlled conflict to a real source without observing it. |
| Calendar versus host; logo/project from another edition | DP-06 relationship connector/integration cases in DP-11 regression; DP-06 controlled and real browser closures. | AIT program and Vultr role limits below remain visible. |
| Inferred/contradicted price; additive USD 3000 + 3000 vs USD 5000; pending/mixed currency costs | DP-02 trust regression/integration/UI cases and comparison/decision cases, all in DP-11 regression. | Translation must not promote certainty or change quantities. |
| Contradicted date/local UTC day; pending audience; strengthened confirmed claim | Trust/calendar/eligibility/map/decision cases in DP-11 regression. | User's expired RastroAI results are correctly historical; translating the exclusion must not change their dates. |
| Full address without coordinates; city/ambiguous address; announced location | DP-08 connector/integration and DP-11 map acceptance/UI cases; real Census address and published-coordinate samples in DP-08; local integration. | Verify current production map; never fabricate a point for hidden/city-only location. |
| Card → pin / pin → dossier; new result/run; map/provider failure | DP-09 map and DP-10 experience cases in DP-11 production browser release; DP-09 real street-map smoke. | New current UI smoke required after English edits; unchanged camera/failure mechanics retain prior evidence. |
| Reopen after new import | DP-11 real four-page reimport and historical dossier/map; isolated production changes catalog name/coordinates and retains snapshot. | New recording reopens the existing exact revision; original immutable payload remains intact. |
| Copy brief, actual clipboard | DP-11 real 4036-character brief and original/reopened equality; controlled clipboard denial and full-content browser assertions. | English copy serializer changes require scoped recheck; prior source/history persistence remains evidenced. |
| Cross-tenant source/decision | DP-11 regression covers tenant isolation plus source, relationship, comparison and decision integration rejects; production persisted/reopen/decision cases. | No DB or authorization change introduced by this audit. |
| Full real route including map | Source/relationship/location smokes and DP-11 decision/reopening are independent real building blocks. | DP-12 must add integrated current localhost proof, source fragment, exact links, script and explicit coverage; prior green suites alone do not certify it. |

## Coverage and claims the demo may make

The main prepared corpus includes AIT SF, Agent Arena/Vultr and AI Security Hackathon (cross-listings are not additional independent events). AIT and Vultr are two current organizers/hosts with documented antecedents; **only AIT provides an organizing antecedent in SF**. Vultr's older role is **sponsor in Paris, with lablab.ai organizing**, not previous SF organization.

The AIT background dossier's useful finding is the **announced** Secure Agents Buildathon program mentioning monitoring, auditing and recovery, plus announced Google Cloud sponsorship. It supports exploring a focused SDK workshop/integration and asking for audience, format, access and total price. It does **not** prove the program happened, technical effectiveness, attendance, adoption or an offer for the upcoming edition.

In the final real AIT background run, only **2 of 6 pages** were obtained; the gallery, Citadel, Cleo and organizer directory returned 403. **Zero linked project pages** were established in that saved run. An earlier Citadel HTTP reading and DP-01 manual research exist separately; neither is a fresh browser-run project or permission to seed one. Do not narrate fixture projects, prize outcomes or audience composition as newly researched app results.

AI Security has a publicly announced address at 501 Folsom St with an explicitly approximate Census location; its published-coordinate cross-listing has separate provenance. AIT's hidden venue and Agent Arena's city-only location remain list results without pins. A pin certifies neither admission nor cost nor commercial suitability. Recheck time-sensitive dates before any later recording; expired results remain historical.

The buyer/product used for rehearsal is illustrative; source events and stored source evidence are real. Reused investigations must be labelled preloaded with their fetchedAt date. Technical acceptance, current visual acceptance and commercial validation are different; no willingness to pay, ROI or time saving is demonstrated by this demo. The missing user-supplied video remains a DP-12 review dependency, and no submission/upload is authorized here.
