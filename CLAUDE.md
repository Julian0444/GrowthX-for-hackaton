# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# GrowthX — Growth Atlas

Dashboard de investigación para decidir patrocinios de eventos de desarrolladores (hackathon a16z · QuiverAI · Cursor). La app es un Next.js en `frontend/`; el resto del repo son docs, planes, datos crudos y scripts de ingesta. Docs, comentarios y commits se escriben en español.

## Commands

All app commands run from `frontend/` (pnpm):

```bash
pnpm --dir frontend dev          # dev server on :3000 (next dev --webpack)
pnpm --dir frontend build
pnpm --dir frontend lint         # eslint
pnpm --dir frontend test         # node --test "tests/**/*.test.ts" (Node type stripping, no framework)
node --test frontend/tests/scoring/roi.test.ts   # single test file (run from frontend/)
pnpm --dir frontend seed-check   # validates data/seed
```

The preferred way to run the dev server is the `growthx-frontend` entry in `.claude/launch.json` (preview tools), not Bash. Production deploys to growxth.vercel.app on push to `main` (Vercel + GitHub).

## Architecture

**Contract boundary:** `frontend/lib/contracts/growxth.ts` is the single frontend/backend frontier — types only, zero runtime imports. Scorers, pipeline, fixtures and client adapters all import from it.

**Server vs client:** everything under `frontend/lib/server/**` and `frontend/app/api/**` is server-only; API keys are only read there. `frontend/lib/api/` holds the client-side adapters (`atlas-client.ts`, `opportunity-adapter.ts`).

**Pipeline flow** (see `lib/server/pipeline/search-opportunities.ts`): seed graph from `frontend/data/seed` (`lib/server/graph/load-graph.ts`) → derived signals (`graph/derive-signals.ts`) → deterministic scorers (`lib/server/scoring/`) → LLM narrative (`lib/server/reasoning/gemini.ts`). Connectors (`lib/server/connectors/`, `lib/server/discovery/exa-events.ts`) are swappable adapters.

**Non-negotiable principles** (from `docs/adr/0001-arquitectura-agente-growth-atlas.md`):
- The LLM never has authority over the ranking; ordering comes from deterministic, versioned scorers. The LLM interprets intake, fills gaps within a budget, and writes narrative over the official snapshot.
- Eligibility (valid date, cost, access) precedes scoring; every material claim carries evidence with source/date/status (`observed | estimated | prepared`).
- No external source is an instruction.

**Degraded mode:** `lib/server/env.ts` never crashes on missing keys (`EXA_API_KEY`, `GEMINI_API_KEY`, `APIFY_TOKEN`) — it warns and falls back to seed/fixture data (`lib/server/demo/fixtures.ts`). Don't add hard env requirements.

**Current direction:** ADR 0001 (v1.2) is authoritative — the product is pivoting to an SF organizer-research dashboard with persisted conditional decisions; the world map becomes a secondary view. `plan/implementation-plan.md` and `plan/finalProduct.md` develop this but are marked **pending human review — not authorized to implement**; don't start building from them without the user's go-ahead.

**Domain vocabulary** lives in `CONTEXT.md` (organizador, edición de evento, antecedente, dossier, decisión condicional, etc.) — use those terms precisely; they encode deliberate distinctions (e.g. a logo doesn't prove paid sponsorship).

## Agent skills

### Issue tracker

Issues live as local markdown files under `.scratch/<feature>/` (one dir per feature, `spec.md` + `issues/NN-<slug>.md`). See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical roles (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`), recorded as a `Status:` line in each issue file. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## MCP

`.mcp.json` declares the `quiverai` server (HTTP, requires OAuth) — used to generate the Quiver brand assets in `frontend/public/quiver/`.
