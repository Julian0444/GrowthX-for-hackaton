# DP-12 — Provider usage audit

Read-only audit on 2026-09-11 UTC (2026-09-10 Pacific). [Machine-readable counts, identifiers and query scope](provider-usage.json). No new research-provider operation was initiated by DP-12 for this audit. The app's existing data, allowances and provider configuration were preserved.

| Provider | Retained real usage evidence | Cost and confidence |
| --- | --- | --- |
| Exa Search | Local ledger: **12 succeeded operations**, four runs, distinct response request IDs; all marked `real`. Separate DP-04 real smoke: **1 operation**, absent from local ledger. Deduplicated retained total: **13 ledger-reported requests**. | **USD 0.091 reported**, of which USD 0.084 is local and USD 0.007 is the DP-04 smoke. No unknown-cost local operations. This is provider-reported data, **not independently reconciled billing**. |
| Exa Contents | No real calls reported in DP-05–12 evidence. | Account-wide total/cost unknown; no new DP-12 calls. |
| Apify | **0 real Actor starts** in retained DP evidence; local Actor ledger has zero rows. DP-05 transport and recovery tests were controlled. | No new DP-12 Actor charge. Account-wide usage/cost unknown. A real Actor smoke remains unperformed because source coverage did not justify it. |
| US Census Geocoder | **5 documented real requests**: DP-08 probe + worker (2), DP-09 first attempt + final smoke (2), local integration (1). | **USD 0 service charge**, grounded in the free provider documented in DP-08. Compute/network costs are not measured. The local lookup is the same integration request, counted once. |
| Public source HTTP | Current local source-read ledger: **23 rows = 17 successful misses + 4 failures + 2 cache hits**. Thus **21 recorded non-hit read attempts**, including failures. | Whole-project HTTP request total and cost **unknown**. Page reads are not necessarily network-request counts because of redirects; manual browser reads, older ingestion and isolated iterations are not globally metered. |
| OpenFreeMap | Real styles/tiles verified in DP-09 and reused in map acceptance. Request total unmetered. | Total cost **unknown**; no paid map account or quota was opened. Map tiles are separate from Census geocoding. |
| Gemini / other application models | DP-07 real comparison worked without a Gemini call; model integration tested with controlled responses. No new DP-12 application calls. | Whole-project/account model usage and cost **unknown**. Codex platform usage is separate and unavailable to this app audit. |

Two local Exa runs (`8c8e2be1…` and `bdab116c…`) each recorded three queries in roughly 0.3 seconds. They predate this DP-12 audit, are labelled real and contain distinct request IDs, but their dispatch was not independently witnessed in this task. Timing alone proves neither replay nor billing. Their USD 0.042 remains included only as **ledger-reported** usage; the confirmed earlier DP-04 real smoke remains separately identifiable. No assertion of exact account-wide consumption is justified.

Local operational reservations are **USD 0.24 Exa**, against the existing USD 10 cap, and **USD 0 Apify**, against USD 15. Reservations are not invoices or balances. They are separate from the buyer's participation budget. Old account-credit screenshots do not establish current balances.

Deduplication: discovery operation IDs, local geocoder run ID, and separate isolated smoke scope. DP-04 `real-smoke.json`/README/reopen are one operation; local integration's 13 reads and DP-11's four-page refresh are already included in the current source-read ledger. Reopening saved research does not itself repeat those provider operations. The total public-HTTP history remains unknown instead of adding overlapping partial counts.

Sources: [DP-04 smoke](../DP-04/real-smoke.json), [DP-05 provider decision](../DP-05/README.md), [DP-06 real coverage](../DP-06/README.md), [DP-08 usage](../DP-08/README.md), [DP-09 usage including first attempt](../DP-09/README.md), [local integration](../local-integration-DP05-DP06-DP08/README.md), [DP-11 real refresh](../DP-11/README.md). Exact safe SQL outputs are summarized in the JSON; no credentials or raw provider secrets are stored.
