# Growth Atlas

**Research developer events. Understand the evidence. Decide what to explore next.**

Growth Atlas helps growth, go-to-market and developer relations teams investigate events before committing time or participation budget. Starting with a company brief, it connects public sources, organizer history and event details to an explainable comparison—and saves the team's decision together with its evidence and open questions.

This repository contains the working **San Francisco research-to-decision prototype**, developed as GrowthX and documented for a Puentes engineering review. Some interface and package names still use GrowthX or GrowXth.

**[Watch the quick demo on Loom](https://www.loom.com/share/c92423774f7847368838580346519133)**

[Product and discovery](docs/product.md) · [System architecture](#system-architecture) · [Tools and their roles](#tools-and-their-roles) · [Run locally](docs/local-development.md) · [Verification](docs/verification.md) · [Known limitations](docs/known-limitations.md)

For an engineering review, start with the demo, then follow the architecture below into the linked source files. The [verification report](docs/verification.md) shows which claims were tested and where the prototype still falls short.

![Growth Atlas showing researched events alongside a San Francisco street map](DemoPuentes/evidence/DP-12/screenshots/production-real-map.png)

*Recorded local demo using real public-source research, September 2026. An approximate public address can produce a map point; a city-only or private venue does not. These saved editions are dated examples, not a current event feed.*

## Why I built it

Conversations with growth and GTM teams surfaced a recurring decision: where should a company participate to reach the right developers, and what evidence makes that opportunity worth exploring? Teams piece together event pages, organizer relationships, past editions and incomplete commercial information. An impressive sponsor list does not establish audience fit, and a free ticket does not establish the cost of a useful activity.

I wanted to make that research easier to inspect and act on. The repository preserves [a documented discovery interview](docs/research/discovery-terac-2026-09.md), the product decisions that followed, and the implementation evidence. The interview is qualitative input; this prototype does not yet establish market size, willingness to pay or improved growth outcomes.

What I am most proud of is taking a problem explored through company interviews in Silicon Valley and turning it into a working, testable proposal. Finding and understanding the problem matters to me as much as building the software.

## What you can do

| Step | What the application provides |
| --- | --- |
| **Define a brief** | Describe the product, audience, topics, dates, budget, constraints and success criteria. Goals include adoption, technical feedback, hiring and awareness. |
| **Research sources** | Run bounded discovery, inspect proposed pages and request deeper reading of supported organizer and project sources. Progress and partial failures persist. |
| **Inspect background** | Follow dated source excerpts, previous editions, organizer roles and documented company participation. Announcements and reported outcomes remain distinct. |
| **Explore events** | Move between the list, SF street map and evidence dossier. Locations retain their declared precision and uncertainty. |
| **Compare editions** | Compare up to three options against a versioned brief. See relevant evidence, exclusions, incomplete costs and questions under “What to investigate first.” |
| **Record a decision** | Explore first, choose, discard or leave pending. Record reasons and, where applicable, an activity proposal, owner, conditions and costs. |
| **Copy and reopen** | Copy a manual brief or inquiry draft. Reopen an exact saved revision with the evidence available when it was evaluated. |

A useful result can be **“investigate this first, and ask these questions.”** The system does not need to manufacture certainty to support a next step. Saving a decision does not contact an organizer, reserve participation or spend the buyer's budget.

## A concrete example

**DataBridge is a fictional data-tool company**, used to demonstrate a buyer's workflow. It wants developers to connect APIs, databases and spreadsheets to real projects, with a USD 15,000 participation budget and a technical-feedback goal.

Its success definition is to help ten developers connect a source and collect feedback from five. Those are proposed targets, not achieved results. The team investigates whether participants will build relevant projects, whether a hands-on session is permitted, and what participation will cost. A saved **Explore first** decision can preserve those questions and a proposed workshop without claiming the organizer has offered one.

The short [narration and click script](DemoPuentes/demo-script.md) and the [DataBridge script in Word](DemoPuentes/DataBridge-demo-script.docx) support a walkthrough. The Markdown script uses the earlier agent-observability example; the Word version uses DataBridge. Their saved links require the original local database and session. A fresh installation starts with its own research, and can produce different or insufficient results.

## What the real research established

The retained case studied **AI Tinkerers**, **Vultr's documented sponsorship background**, and **AI Security Hackathon / Hackathons.team**. Public pages supplied different kinds of evidence: announced technical programs, previous editions, company roles and an address suitable for approximate geocoding.

Those differences matter. Vultr's historical sponsorship does not make it the organizer of a San Francisco event. An announced technical program is evidence of intended content, not measured attendance or successful adoption. A team's proposed workshop is not a confirmed commercial offer.

The [case and sources](DemoPuentes/evidence/dp-01-caso-y-fuentes.md), [claim register](DemoPuentes/evidence/dp-01-afirmaciones.md) and [real-run evidence](DemoPuentes/evidence/DP-11/README.md) make that reasoning inspectable. Some organizer pages returned HTTP 403, and some discovered domains are outside the current reader's allowlist. Project coverage is incomplete. No live Apify Actor was needed in the retained reference sample; its fallback and recovery paths were tested with controlled responses.

**Dates matter:** the recorded September 12 and 13, 2026 editions are past as of this documentation review on **September 14, 2026**. The September 26 Agent Arena edition was future at this review date, but this documentation does not confirm current availability or participation terms. Historical comparisons remain useful evidence of the workflow; they are not a promise of today's opportunities.

## System architecture

Growth Atlas is a **modular TypeScript application with two processes**: Next.js serves the interface and API, while a separate Node.js worker performs durable research and comparison jobs. Both use PostgreSQL, which stores the business records and the pg-boss queue in separate schemas. Keeping these responsibilities in one codebase makes the contracts easy to inspect while allowing research to continue after the browser closes.

```mermaid
flowchart TB
    UI["Browser · React 19 + MapLibre<br/>Brief, dossiers, map, comparison and decisions"]
    API["Next.js 16 API<br/>Session, input validation and application services"]
    subgraph PG["PostgreSQL 17 · separate database roles"]
        DATA[("Business records<br/>Sources, revisions, snapshots and decisions")]
        QUEUE["pg-boss queue<br/>Durable jobs"]
    end
    WORKER["Node.js worker<br/>Persisted steps, recovery and comparison"]
    SOURCES["Source acquisition<br/>Exa discovery + public-page reading"]
    APIFY["Apify · optional<br/>Explicit content-reading fallback"]
    CENSUS["US Census · optional<br/>Address resolution"]
    GEMINI["Gemini · optional<br/>Claim selection after the snapshot"]
    TILES["OpenFreeMap<br/>Browser map assets"]

    UI <-->|"HTTP requests and status polling"| API
    UI -->|"Style and tiles"| TILES
    API -->|"Read and write under tenant context"| DATA
    API -->|"Enqueue in the run transaction"| QUEUE
    QUEUE -->|"Claim job"| WORKER
    WORKER -->|"Save progress and immutable results"| DATA
    WORKER --> SOURCES
    WORKER -.-> APIFY
    WORKER -.-> CENSUS
    WORKER -.-> GEMINI
```

*The diagram follows the durable research/comparison path. Source acquisition includes application code and external HTTP calls; the optional branches are configured or explicitly requested. Provider keys stay on the server. Public map assets are fetched by the browser.*

### How one research run moves through the system

1. **Accept:** the API resolves the session, validates the brief, and saves its version, run, steps and queued job in one transaction. Only then does it return `202` with a run ID. Repeating an idempotency key with the same input returns the existing run.
2. **Investigate:** the worker claims the job and executes persisted steps. Discovery produces candidate pages; selected supported pages can then be read in a separate background-research run. Source text is parsed into evidence with provenance and coverage limits.
3. **Compare:** after the user selects editions, a comparison run evaluates dates, constraints, costs and evidence against the brief. It saves an immutable snapshot before requesting any optional model output.
4. **Decide and reopen:** a user decision references that snapshot. Saving the decision and applicable activity brief is transactional; later edits append revisions. The browser can reopen the exact earlier revision even when the catalog changes.

These are connected user actions, not one hidden call that automatically discovers, endorses and commits to an event. The [architecture guide](docs/architecture.md) expands the contracts, roles, recovery behavior and provider budgets.

## Tools and their roles

### Application stack

| Layer | Tools | Role in this project |
| --- | --- | --- |
| Interface | **Next.js 16, React 19, TypeScript** | The dashboard and API share explicit domain contracts for briefs, evidence, editions and decisions. |
| Styling and components | **Tailwind CSS 4, Base UI / shadcn components, Lucide** | Layout, interface primitives and navigation icons. |
| Persistence | **PostgreSQL 17, node-postgres (`pg`)** | SQL transactions, revisioned JSONB records, opaque sessions and tenant isolation through row-level security. |
| Background execution | **Node.js, pg-boss 12** | A separate worker consumes a PostgreSQL-backed queue and resumes persisted steps. |
| Discovery | **Exa Search** | Finds candidate public pages within explicit query, deadline and provider-budget limits. Search snippets alone are not claim evidence. |
| Source reading | **Native HTTP reader, `parse5`** | Reads supported pages and extracts visible text and structured metadata without executing page JavaScript. |
| Optional reading fallback | **Apify Website Content Crawler** | Handles an explicitly identified reading gap. Implemented and tested with controlled responses; no live Actor run is claimed for the reference demo. |
| Optional model integration | **Gemini API** | Selects admissible claims for a narrative after the official comparison is saved. It cannot change eligibility or the human decision. The retained demo does not establish a live Gemini call. |
| Geography | **MapLibre GL 6.9, OpenFreeMap, US Census Geocoder** | Street-map rendering, public map assets and optional approximate address resolution. Uncertain or withheld locations do not become invented venue pins. |

Versions and resolved dependencies are recorded in [package.json](frontend/package.json) and [pnpm-lock.yaml](frontend/pnpm-lock.yaml). The source links below show how the tools are composed; installing a library is not itself evidence that every associated feature is complete.

### Building and verification tools

| Tool | How I used it |
| --- | --- |
| **Cursor and Codex** | AI-assisted implementation, code inspection, debugging, tests and documentation, guided by the product specification and ticket acceptance criteria. |
| **Node.js test runner** | Contract, acceptance, connector and database integration tests, including failure and recovery cases. |
| **Playwright + Google Chrome** | Browser checks against the production frontend: desktop/mobile behavior, native clipboard, reopening, revision conflicts and map failures. |
| **TypeScript + ESLint + Next.js build** | Type checking, static checks and production compilation. |
| **Docker + PostgreSQL** | Separate verification databases that preserve the user's local research data. |
| **pnpm + Git/GitHub** | Locked dependencies, versioned implementation and a reviewable history of documentation and evidence. |
| **Loom** | A short [product walkthrough](https://www.loom.com/share/c92423774f7847368838580346519133) alongside the repository. |

The coding assistants are development tools; the application integrates Gemini separately for its optional model step. The [verification report](docs/verification.md) distinguishes controlled provider fixtures from real browser/database execution and earlier live-source research.

## Engineering decisions worth reviewing

| Decision | Why it matters | Tradeoff and code to inspect |
| --- | --- | --- |
| **One PostgreSQL database for records and queue** | Run acceptance and enqueueing can commit together, so a successful response corresponds to durable work. | The worker and database need operation and recovery handling. [Acceptance service](frontend/lib/server/evaluations/service.ts), [queue adapter](frontend/lib/server/evaluations/queue.ts). |
| **Immutable comparison snapshots** | Reopening a decision should show the evidence used then, even after a new source or edition revision arrives. | More storage and explicit revision management. [Snapshot store](frontend/lib/server/evaluations/snapshot-store.ts), [decision store](frontend/lib/server/decisions/store.ts). |
| **Deterministic eligibility before optional model output** | Past dates, confirmed exclusions and known costs must remain enforceable regardless of generated wording. | The system can return insufficient evidence. No approved commercial scoring policy currently exists. [Eligibility](frontend/lib/server/evaluations/eligibility.ts), [model adapter](frontend/lib/server/evaluations/model-adapter.ts). |
| **Persist external-request uncertainty** | A crash after dispatch must not silently trigger another paid request as though nothing happened. | An uncertain operation can require review instead of automatic completion. [Durable discovery](frontend/lib/server/discovery/durable.ts). |
| **Tenant context and revision conflicts** | One tenant should not read another's research, and an old browser tab should not silently overwrite a newer decision. | Every business operation must carry the server-resolved context; conflicting edits require an explicit reload. [Tenant transactions](frontend/lib/server/db/pool.ts), [decision revisions](frontend/lib/server/decisions/store.ts). |

These choices make the prototype's behavior inspectable. They do not establish universal correctness: source coverage, edition identity and other concrete defects remain listed in [Known limitations](docs/known-limitations.md).

## Run it locally

The complete [local development guide](docs/local-development.md) covers PostgreSQL, migrations, a development session, provider configuration and the separate worker. The checks recorded here used Node **25** and pnpm; the repository executes TypeScript tests directly with Node.

```bash
git clone https://github.com/Julian0444/GrowthX-for-hackaton.git
cd GrowthX-for-hackaton/frontend
pnpm install --frozen-lockfile
```

After following the guide's database and session setup, run these in two terminals:

```bash
pnpm dev
```

```bash
pnpm worker:dev
```

Open [localhost:3000](http://localhost:3000/). A fresh database contains no preloaded research. Live discovery requires a server-side Exa key; missing credentials or unreadable pages produce explicit limited coverage, not a hidden synthetic dataset. The guide also explains how to review the UI and run controlled tests without paid provider calls.

## Verification and current status

**Working local prototype; final demo acceptance remains open.** DP-01 through DP-11 retain their dated implementation closures. DP-12 is in progress; it is not marked verified, and the final video has not been reviewed.

The September 14 review checked the application code at **`8b0fba1`** in an isolated copy. It reused current passing checks after matching 293 source files, then exercised additional database and browser paths:

| Check | Observed result |
| --- | --- |
| Production build / TypeScript and ESLint | Passed |
| Acceptance, contract, connector and UI tests | 167 passed, no failures or skips |
| Decision and snapshot integration tests with PostgreSQL | 25 test results passed, no failures or skips |
| Research experience in production Chrome | Six scenarios passed, including desktop and mobile |
| Street map in production Chrome | Nine scenarios passed |
| Decision browser journey | Saved, copied, reopened and checked revision conflicts; later failed when a fixed September 12 fixture was correctly excluded as past |

The last row is **a failing end-to-end test**, not a complete pass. The remainder of that scenario was not reached. [Verification](docs/verification.md) links commands, logs and the explanation; [the audit record](docs/evidence/2026-09-14/README.md) distinguishes real browser/database checks from controlled source responses and earlier live research. This documentation pass made no new paid provider calls and did not migrate or reseed the user's local application database.

Known issues include incomplete source coverage, remaining Spanish system text, cost-editor edge cases, a claim-extraction/comparison mismatch, map/list revision inconsistency and annual-event identity handling. These are documented with code references in [Known limitations](docs/known-limitations.md). There is no claim of production readiness, complete English localization, customer adoption or measured commercial return.

## Documentation map

| Document | Purpose |
| --- | --- |
| [Product](docs/product.md) | Buyer problem, discovery evidence, examples and scope |
| [Architecture](docs/architecture.md) | Runtime, contracts, worker, evidence, security boundaries and tradeoffs |
| [Local development](docs/local-development.md) | Reproducible setup, sessions, providers, tests and troubleshooting |
| [Verification](docs/verification.md) | Current checks, historical evidence and what each establishes |
| [Known limitations](docs/known-limitations.md) | Concrete defects, coverage limits and remaining work |
| [DemoPuentes index](DemoPuentes/README.md) | Product specification, implementation tickets, scripts and retained evidence |
| [Product definition](DemoPuentes/finalProduct.md) / [Specification](DemoPuentes/spec.md) | Intended product and acceptance requirements; broader than completed implementation |
| [Implementation plan](DemoPuentes/implementation-plan.md) / [Handoff](DemoPuentes/PuentesHandoff.md) | Milestone status, dependency history and continuation context |
| [Architecture decision record](docs/adr/0001-arquitectura-agente-growth-atlas.md) | Earlier directions and subsequent amendments |

The new reviewer documentation is in English. Historical research and execution notes retain their original Spanish. Screenshots, logs and fixture tests are evidence artifacts, not a licensed event dataset or commercial offers.

## What comes next

First, correct the documented defects and finish the dated acceptance/video review. Then broaden reliable source reading, test the workflow with growth and DevRel teams, and measure whether it reduces research effort while preserving defensible decisions. Willingness to pay and the value of repeated use still need validation.

Outcome tracking, learned commercial recommendations, CRM integrations and automated outreach are future directions. They are not described here as shipped features.

## Build process

I used AI coding tools to help turn discovery and product decisions into implementation, tests and documentation. The repository preserves specifications, execution notes, source-backed findings and failures so reviewers can inspect the work beyond the interface. The engineering review includes incomplete coverage and defects found after earlier green suites.
