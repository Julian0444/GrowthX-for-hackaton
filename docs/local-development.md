# Local development and reviewer walkthrough

Growth Atlas needs a Next.js process, a Node worker and PostgreSQL for persisted research. This guide creates a separate development database; it does not depend on the author's existing records. The recorded verification used macOS, Node 25, pnpm and PostgreSQL 17. Other environments have not been certified by this documentation pass.

## 1. Install dependencies

Install Node 25, pnpm and Docker, and start the Docker daemon. Google Chrome is needed for the retained browser tests. Then:

```bash
git clone https://github.com/Julian0444/GrowthX-for-hackaton.git
cd GrowthX-for-hackaton/frontend
pnpm install --frozen-lockfile
```

Use Node 25 when reproducing the recorded direct-TypeScript test commands. The package does not declare an engines range; do not infer that every earlier Node release supports this test setup.

## 2. Create a dedicated development database

The following uses a new container name, a persistent volume and port **55480**. Check that the name and port are available. If this container already belongs to your earlier installation, start that existing container instead of recreating it.

```bash
docker run -d --name growthx-reviewer-postgres \
  -e POSTGRES_USER=growthx \
  -e POSTGRES_PASSWORD=growthx \
  -e POSTGRES_DB=growthx \
  -p 127.0.0.1:55480:5432 \
  -v growthx-reviewer-data:/var/lib/postgresql/data \
  postgres:17-alpine
```

Wait until this succeeds:

```bash
docker exec growthx-reviewer-postgres pg_isready -U growthx -d growthx
```

Create `frontend/.env.local` with these **development-only** credentials:

```dotenv
GROWTHX_ADMIN_DATABASE_URL=postgres://growthx:growthx@127.0.0.1:55480/growthx
GROWTHX_DATABASE_URL=postgres://growthx_app:growthx_app_dev@127.0.0.1:55480/growthx
GROWTHX_WORKER_DATABASE_URL=postgres://growthx_worker:growthx_worker_dev@127.0.0.1:55480/growthx
GROWTHX_QUEUE_DATABASE_URL=postgres://growthx_queue:growthx_queue_dev@127.0.0.1:55480/growthx
```

`.env.local` is ignored by Git. These passwords and the development session workflow below are for your local installation, not a public deployment. Shared identity, operational hardening and deployment remain open work.

The repository's older `pnpm db:up` uses `growthx-postgres` on **54329**. `pnpm db:down` removes that container. Neither is needed for this guide; do not use them to reset someone else's running app.

## 3. Migrate and create a development session

From `frontend/`:

```bash
node --env-file=.env.local lib/server/db/migrate.ts
node --env-file=.env.local lib/server/db/seed-dev.ts
```

Migration creates the application roles, applies the SQL migrations and initializes the queue. The application, business worker and queue use separate roles; the admin URL is for setup. Migration role passwords can be overridden using `GROWTHX_APP_DB_PASSWORD`, `GROWTHX_WORKER_DB_PASSWORD` and `GROWTHX_QUEUE_DB_PASSWORD`.

The seed creates a development tenant, user, membership and a 30-day session. It prints a token locally. It **does not seed events or research**. Do not paste that token into the repository or an evidence file.

Start the frontend:

```bash
pnpm dev
```

Open [localhost:3000](http://localhost:3000/), then use that page's developer console to set your printed token:

```javascript
document.cookie = "growthx_session=YOUR_PRINTED_TOKEN; path=/";
```

Reload the page. There is currently no complete public sign-up flow. Without a valid session, the UI can show the brief editor while persisted research responds with “Sign in to access this research.”

In a second terminal, also from `frontend/`, start the worker:

```bash
pnpm worker:dev
```

Next loads `.env.local`; `worker:dev` explicitly loads it too. Plain `pnpm worker`, migration and seed commands do not automatically load that file, which is why this guide uses explicit `--env-file` commands. Restart the affected processes after changing configuration.

## 4. Choose which external services to enable

| Setting | Purpose and behavior |
| --- | --- |
| `EXA_API_KEY` | Server/worker discovery of candidate source pages. Needed for a new live search. Missing configuration or exhausted allowance is reported explicitly. |
| `GEMINI_API_KEY` | Optional bounded narrative selection after the official comparison snapshot. Deterministic comparison remains available without it. |
| `APIFY_TOKEN` | Optional website-content fallback for explicitly identified gaps. A token alone does not turn on an automatic crawler for every source. |
| `GROWTHX_GEOCODER=us-census` | Optional Census address resolution. Its result remains approximate and must satisfy the geographic checks. |
| `NEXT_PUBLIC_SF_MAP_STYLE_URL` | Optional map style override. This is public browser configuration, not a place for a private API credential. |

Provider keys belong only on the server/worker. Live discovery consumes provider allowance when requested. The buyer's participation budget is a different quantity and is never used as permission for API spending. See [Architecture](architecture.md) for local reservation limits and uncertain-request handling.

The current native reader accepts known hosts for **Luma, AI Tinkerers, Hackathons.team, Cerebral Valley and Vultr's blog**. The exact list is in [reader.ts](../frontend/lib/server/sources/reader.ts). A discovered page may still be unsupported, blocked, incomplete or dated in the past. No credential setting guarantees a usable comparison.

Without provider keys, you can inspect the brief UI and run controlled tests. You cannot claim that an empty installation performed a new real search or contains the author's saved evidence.

## 5. Walk through the product

Use a fresh URL without a `run`, `decision` or `revision` parameter. In **Brief**, enter the fictional DataBridge example:

| Field | Example |
| --- | --- |
| Product | DataBridge helps teams connect APIs, databases and spreadsheets to build dashboards and AI applications. We want developers to try it on real projects and share integration feedback. |
| Audience | Software developers, data engineers and small teams building data-driven products. |
| Audience segments | developers, data engineers, startup founders, AI builders |
| Stack and topics | Python, SQL, APIs, data integration, analytics, AI applications |
| Participation budget / currency | 15000 / USD |
| Goal / status | Technical feedback / Declared by me |
| Definition of success | Help 10 developers connect a real source and collect feedback from 5 about setup, documentation and missing integrations. |
| Dates | A future window appropriate to the day you run the demo; verify each edition's actual date separately. |
| City / formats | San Francisco / hackathon, workshop, developer meetup, demo day |
| Constraints | Confirm permission to demonstrate the product and support participants. Obtain the complete participation cost before committing budget. |
| Companies you have in mind | Leave blank. |

1. **Review brief → Confirm and research SF.** Check the interpretation before confirming. This starts live discovery if configured.
2. On a relevant supported page, select **Research organizer & projects**. Read the returned background, source excerpt, edition date and coverage limitations.
3. Inspect **Events**, including the map when a supported public location exists. A past edition is background. A missing map point is not proof of missing research.
4. Select **Compare** on up to three editions, then **Compare selected**. Read **What to investigate first**, **Inspect evidence**, costs and open conditions.
5. Use **Record decision → Explore first** for a tentative investigation. Explain the reason, propose a workshop, set **Team proposal · not offered**, and retain questions about projects, permission and cost.
6. **Save decision**, copy the manual brief, compare it with the preview, and reopen the saved internal link. A revision-pinned link should show that revision; editing creates a later revision.

Use only the evidence actually returned. Another company's presence does not establish exclusivity. Missing affinity evidence is a valid research result. The [historical demo scripts](../DemoPuentes/demo-script.md) use records from the author's database, so their UUID links do not transfer to a fresh installation.

## 6. Run checks without touching the development database

Tests include real writes, migrations, workers and browser servers. Some older suites default to port 54329 when a URL is absent. Newer browser suites deliberately reject the local application database. Do not run the broad `pnpm test` command against a database that contains personal research.

For the checks below, make an isolated copy from the repository root. `mktemp` creates a unique directory; `rsync` excludes environment files and generated output.

```bash
review_dir=$(mktemp -d /tmp/growthx-review.XXXXXX)
rsync -a --exclude=node_modules --exclude=.next --exclude='.env*' \
  --exclude='*.tsbuildinfo' frontend/ "$review_dir/frontend/"
cd "$review_dir/frontend"
unset EXA_API_KEY GEMINI_API_KEY APIFY_TOKEN
unset GROWTHX_ADMIN_DATABASE_URL GROWTHX_DATABASE_URL
unset GROWTHX_WORKER_DATABASE_URL GROWTHX_QUEUE_DATABASE_URL
pnpm install --frozen-lockfile
pnpm build
pnpm lint
node --test --test-concurrency=1 \
  'tests/acceptance/*.test.ts' 'tests/contracts/*.test.ts' \
  'tests/connectors/*.test.ts' 'tests/ui/*.test.ts'
```

For the recorded DB/browser checks, create a **separate test container** on port **55461**, which the test guards allow. If that port or name is already in use, inspect ownership before continuing; never replace an existing database to make the command succeed.

```bash
docker run -d --name growthx-reviewer-tests \
  -e POSTGRES_USER=growthx -e POSTGRES_PASSWORD=growthx \
  -e POSTGRES_DB=growthx -p 127.0.0.1:55461:5432 postgres:17-alpine
docker exec growthx-reviewer-tests pg_isready -U growthx -d growthx
```

After PostgreSQL is ready, in the isolated source directory:

```bash
export GROWTHX_ADMIN_DATABASE_URL=postgres://growthx:growthx@127.0.0.1:55461/growthx
export GROWTHX_DATABASE_URL=postgres://growthx_app:growthx_app_dev@127.0.0.1:55461/growthx
export GROWTHX_WORKER_DATABASE_URL=postgres://growthx_worker:growthx_worker_dev@127.0.0.1:55461/growthx
export GROWTHX_QUEUE_DATABASE_URL=postgres://growthx_queue:growthx_queue_dev@127.0.0.1:55461/growthx
export DP05_PRODUCTION_DIR="$PWD"
export DP09_EVIDENCE_DIR="$review_dir/evidence"
export DP10_EVIDENCE_DIR="$review_dir/evidence"
export DP11_EVIDENCE_DIR="$review_dir/evidence"
mkdir -p "$review_dir/evidence"
node lib/server/db/migrate.ts
node --test --test-concurrency=1 --test-force-exit \
  tests/integration/decision-brief.test.ts \
  tests/integration/evaluation-snapshot.test.ts
node --test --test-concurrency=1 --test-force-exit \
  tests/e2e/research-experience.spec.ts tests/e2e/sf-street-map.spec.ts
node --test --test-concurrency=1 --test-force-exit \
  tests/e2e/decision-brief.spec.ts
```

The harness launches and closes its own production server, browser and worker where applicable. Tests use controlled provider material. These browser suites request Playwright’s `chrome` channel, so Google Chrome must be installed. See [the production server helper](../frontend/tests/support/source-browser.ts) and [the browser scenario](../frontend/tests/e2e/decision-brief.spec.ts) before adapting another environment.

**Expected current failure:** `decision-brief.spec.ts` assumes its fixed September 12, 2026 AIT edition can still be chosen. After that date, the real-time eligibility check disables **Choose**. The September 14 run therefore failed at that later step after successful save/copy/reopen checks. Do not relabel that run as passed or change real event dates to demonstrate availability. See the [verification report](verification.md).

## Stop and resume your own services

Stop the frontend and worker with Ctrl+C in their terminals. For containers created by this guide:

```bash
docker stop growthx-reviewer-postgres growthx-reviewer-tests
```

Only name containers you actually created. Stopping preserves data. To resume the development database later:

```bash
docker start growthx-reviewer-postgres
```

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Sign-in message | The token belongs to this database, has not expired, and is set as the `growthx_session` cookie for the current localhost host. |
| Database unavailable / 503 | PostgreSQL is ready; migrations ran; each process loaded the correct role URL and port. |
| Run remains queued | The separate worker is running with worker and queue URLs. Reopening the browser does not start a worker. |
| Discovery incomplete | Exa configuration, persisted provider allowance, deadline and recorded error. Do not reset allowance to hide an uncertain request. |
| Page cannot be read | Domain allowlist, source access, redirect or content limitation. Discovery and complete reading are separate operations. |
| Event cannot be chosen | Actual edition date, brief window, confirmed exclusions and unresolved conditions. |
| No map point | The venue may be private, city-only, conflicting or unresolvable. Use the list and location evidence. |
| Some system text is Spanish | This is a documented implementation gap; the new English documentation does not certify complete UI translation. |

Public hosting, production identity, backups, provider operations and ongoing outcome measurement need separate decisions. This guide reproduces local development and bounded tests, not a production rollout.
