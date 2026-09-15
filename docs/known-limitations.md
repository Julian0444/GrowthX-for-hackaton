# Known limitations and remaining work

Growth Atlas is a working local prototype. This page records its boundaries and open defects as of **September 14, 2026**, against application code `8b0fba1`. Earlier ticket closures describe the cases verified at their recorded versions; they are not a claim that every path is complete. See [verification evidence](verification.md).

## Coverage and interpretation

**Discovery does not guarantee readable evidence.** Search results are candidate sources. The reader supports a bounded set of extraction paths, and some public pages cannot be retrieved. In the recorded AI Tinkerers background run, two of six pages were read; four returned HTTP 403. No linked project pages were established in that saved run. The complete project-navigation scenario is verified with controlled sources, not a successful fresh scrape of those blocked pages. [Recorded coverage](../DemoPuentes/evidence/local-integration-DP05-DP06-DP08/README.md).

**Public statements retain their limits.** A published agenda is evidence of an announcement, not proof of delivery. Sponsor logos do not establish payment, exclusivity, attendance, audience quality or return. Vultr's documented sponsor role at a Paris event is not a history of organizing SF editions. Buyer proposals and attributed answers remain separate from source evidence.

**Dates constrain what can be shown today.** The demo's AI Tinkerers edition was dated September 12, and AI Security Hackathon September 13, 2026; both dates are now past. Historical comparisons preserve their original evaluation context. Agent Arena's saved September 26 start is later than this review date, but its current availability, venue and commercial terms have not been freshly confirmed. A new company profile does not remove expired dates or source-access limits.

**Commercial validation remains early.** Company interviews informed the problem and workflow. The repository does not establish willingness to pay, customers, measured time savings, ROI, or successful sponsorship outcomes. Full quotes, permission to participate, and audience fit still need organizer confirmation.

## Open implementation defects

These are specific review findings to address, not behavior certified by the passing suites.

| Area | Current behavior and effect | Relevant code |
| --- | --- | --- |
| Buyer cost state changes | Changing a numeric cost's state creates a new value initialized to **USD 0**, losing the previous amount, currency and some support fields. Re-enter and verify these fields before saving. | [Decision cost editor](../frontend/components/research-dashboard/decision-campaign-fields.tsx) |
| Contradicted buyer costs | The UI offers “Contradicted” but provides no field for its required contradiction note. The server requires a note and source, so a newly entered contradicted cost cannot be completed through that form. | [Editor](../frontend/components/research-dashboard/decision-campaign-fields.tsx), [money validation](../frontend/lib/contracts/evaluation-validation.ts) |
| Map relevance fallback | Outside an explicit comparison reading, the fallback searches the flattened claim revisions with `.find()`. It can select an older buyer-relevance explanation instead of the latest applicable revision. | [Map opportunity projection](../frontend/lib/research/map-opportunities.ts) |
| Program evidence in comparisons | General source extraction writes the attribute `program`, while the comparison's topical matcher accepts `program:`. Some extracted agenda evidence may therefore be omitted from relevance, producing an unnecessarily weak fit explanation. | [Source extraction](../frontend/lib/server/sources/extract.ts), [comparison reading](../frontend/lib/server/evaluations/decision-reading.ts) |
| Reused annual Luma URLs | The native Luma import identifies an existing edition by canonical URL without a year comparison. Reusing one URL for a new annual edition can retain the previous edition identity and relationships. This inherited import gap was identified by static review; it was not reproduced against the user's database. | [Luma identity and persistence](../frontend/lib/server/catalog/luma-adapter.ts) |
| English consistency | The September 14 manual DataBridge brief preview generated research questions in Spanish. Primary navigation is English, but these questions, fallback and validation messages still need translation. Original buyer text and quoted sources retain their language intentionally. | [Research questions](../frontend/lib/research/brief-plan.ts), [map fallback](../frontend/lib/research/map-opportunities.ts), [Luma warnings](../frontend/lib/api/luma.ts), [validation](../frontend/lib/contracts/evaluation-validation.ts) |

Resolving these defects requires targeted regression cases and another check of their affected workflows. Passing compilation or unrelated browser tests does not close them.

**A browser fixture has aged out.** The decision scenario uses an AIT edition dated September 12 with a real evaluation clock. On September 14, “Choose” is correctly disabled for that past event and the test times out. Saving, copying, reopening and conflict assertions preceding that step passed; later assertions did not run. The fixture needs an explicit clock strategy. [Current failure](evidence/2026-09-14/browser.log), [fixture](../frontend/tests/fixtures/relationships.ts), [test](../frontend/tests/e2e/decision-brief.spec.ts).

## Geography and providers

Census interpolation supplies an approximate street-address position, not verified entrance or rooftop accuracy. Geocoding does not confirm that an event happened or admission is available. City-only, ambiguous and hidden venues may remain in the list without markers.

MapLibre's public map assets require network access; a usable list remains available on failure. The application has durable provider reservations and bounded reading, but complete account-wide costs are not available. Apify's fallback integration is tested with controlled transport; a real Actor smoke remains unperformed. Optional Gemini narrative is not required for deterministic comparison, and the recorded real demo did not establish a live Gemini call. [Provider audit](../DemoPuentes/evidence/DP-12/provider-usage.md).

## Acceptance and availability

**DP-12 acceptance and the user-supplied video review remain pending.** Demo scripts and screenshots are preparation artifacts, not proof of a reviewed final recording. No deployment readiness or public hosted service is certified by the local tests.

Saved research is scoped to a tenant session. A localhost link from the author's machine will not open the same research for a reviewer who clones the repository. Historical catalogs also include explicitly labeled test fixtures; these must remain distinguishable from real source material. A public reviewer demo, production onboarding and deployment verification require separate work.

The September 14 manual local check reached the unauthenticated brief preview. It did not inspect persisted research because that browser required sign-in.

The current scope ends at research, comparison and a saved decision brief. It does not send organizer messages, reserve activities, spend the participation budget, execute a campaign, track leads or prove business outcomes.
