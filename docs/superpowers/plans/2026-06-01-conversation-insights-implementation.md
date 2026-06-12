# Conversation Insights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the P0 conversation insights module defined by the June 1 specs: overview, service quality, follow-ups, seed-backed settings, shared detail/evidence APIs, worker-ready persistence, and Volcengine Ark configuration.

**Architecture:** Add a dedicated `insights` backend module and matching contracts package surface. Persist all new application tables with the `xy_wap_embed_` prefix, keep platform message/conversation tables read-only, and expose first-version APIs that can be backed by deterministic repositories plus async job records. Add P0 web pages under `/chat/insights` with shared detail/evidence UI and seed-backed configuration display.

**Tech Stack:** pnpm workspace, TypeScript, TypeBox contracts, Fastify backend, Kysely/MySQL schema types, React 19, React Router v7, Vitest, Testing Library, shadcn/ui, Hugeicons.

---

## Scope

P0 in scope:

- `/chat/insights` overview.
- `/chat/insights/quality` service quality.
- `/chat/insights/follow-ups` action queue with manual `done`/`dismissed`.
- `/chat/insights/settings` seed-backed settings, admin-only.
- Shared insight detail and evidence message contexts.
- `POST /api/server/insights/jobs/rescan` for from-time historical rescan job creation.
- Volcengine Ark env/model profile config.
- Table names use `xy_wap_embed_` for all new persisted tables.

P1 postponed:

- `/chat/insights/business`.
- `/chat/insights/records`.

## Planned Commits

1. `docs: align insight table names` - already completed.
2. `docs: add conversation insights implementation plan`.
3. `feat(contracts): add insights dto contracts`.
4. `feat(backend): add insight schema and seed repositories`.
5. `feat(backend): add insight APIs and action updates`.
6. `feat(backend): add insight worker and Volcengine config`.
7. `feat(web): add P0 insight pages`.
8. `test: verify conversation insights P0`.

## Task 1: Contracts

**Files:**

- Create: `packages/contracts/src/insights/dto.ts`
- Modify: `packages/contracts/src/index.ts`
- Test: `packages/contracts/test/insights-dto.test.ts`

Steps:

- [ ] Write failing tests for insight DTO literal values, required evidence context fields, follow-up action status values, and settings response shape.
- [ ] Run `pnpm --filter @chatai/contracts test packages/contracts/test/insights-dto.test.ts` and verify failures.
- [ ] Add `InsightsOverviewResponse`, `InsightsQualityResponse`, `InsightsFollowUpsResponse`, `InsightDetailResponse`, `InsightSettingsResponse`, `InsightActionStatus`, `InsightAnalysisStatus`, and rescan request/response DTOs.
- [ ] Export DTOs from `packages/contracts/src/index.ts`.
- [ ] Re-run the contracts test and `pnpm --filter @chatai/contracts build`.
- [ ] Commit.

## Task 2: Database Schema Types And Docs

**Files:**

- Modify: `apps/backend/src/db/schema.ts`
- Modify: `apps/backend/src/db/writable-tables.ts`
- Modify: `docs/db/schema.sql`
- Modify: `docs/db/change-log.md`

Steps:

- [ ] Add TypeScript interfaces for P0 `xy_wap_embed_*` insight tables: logical sessions, session messages, jobs, analysis runs, snapshots, summary, problem resolution, QA findings, risks, action items, evidence, settings seed/config tables, provider/profile.
- [ ] Add these new application-owned tables to `WRITABLE_TABLES`; do not add platform source tables beyond existing entries.
- [ ] Add matching SQL DDL to `docs/db/schema.sql`.
- [ ] Add a dated change-log entry.
- [ ] Run `pnpm --filter @chatai/backend typecheck`.
- [ ] Commit.

## Task 3: Backend Insight Domain Utilities

**Files:**

- Create: `apps/backend/src/modules/insights/insights.types.ts`
- Create: `apps/backend/src/modules/insights/insights-seeds.ts`
- Create: `apps/backend/src/modules/insights/insight-message-input-builder.ts`
- Create: `apps/backend/test/modules/insights/insight-message-input-builder.test.ts`

Steps:

- [ ] Write failing tests for text, voice with `content.transVoiceText`, voice pending, file, link, miniapp/weapp, image without OCR, and system/revoke handling.
- [ ] Run the focused backend test and verify failure.
- [ ] Implement `buildInsightMessageInput` using existing content parsing patterns from `workbench-mappers`.
- [ ] Add seed config constants for sessionization, analysis policy, labels, QA rules, risk configs, and entity dictionary.
- [ ] Re-run focused tests.
- [ ] Commit.

## Task 4: Backend Repository And Service

**Files:**

- Create: `apps/backend/src/modules/insights/insights.repository.ts`
- Create: `apps/backend/src/modules/insights/insights.service.ts`
- Test: `apps/backend/test/modules/insights/insights-service.test.ts`

Steps:

- [ ] Write failing tests for summary aggregation DTO, service quality problem-resolution counts, unresolved list ordering, follow-up list filtering, detail evidence ordering by `msgtime, id`, and admin-only settings access behavior at service boundary.
- [ ] Implement repository methods against Kysely for current snapshots/dimension tables plus seed fallback values.
- [ ] Implement service mapping to contracts DTOs.
- [ ] Implement action status updates for `done` and `dismissed` scoped to insight action items.
- [ ] Implement rescan job creation with `run_after`, `idempotency_key`, and `job_type`.
- [ ] Re-run focused tests.
- [ ] Commit.

## Task 5: Backend Routes

**Files:**

- Create: `apps/backend/src/modules/insights/insights.routes.ts`
- Modify: `apps/backend/src/app.ts`
- Test: `apps/backend/test/modules/insights/insights-routes.test.ts`

Steps:

- [ ] Write failing route tests for authenticated summary, quality, follow-ups, detail, evidence contexts, action status update, settings admin visibility, settings non-admin rejection, and rescan job creation.
- [ ] Register `/api/server/insights/*` routes.
- [ ] Ensure data pages require normal auth but no extra role gate.
- [ ] Ensure settings routes require admin role.
- [ ] Re-run focused route tests.
- [ ] Commit.

## Task 6: Worker And LLM Provider Skeleton

**Files:**

- Create: `apps/backend/src/worker.ts`
- Create: `apps/backend/src/modules/insights/insights-worker.ts`
- Create: `apps/backend/src/modules/insights/llm-provider.ts`
- Modify: `apps/backend/src/config/env.ts`
- Modify: `apps/backend/package.json`
- Test: `apps/backend/test/modules/insights/llm-provider.test.ts`
- Test: `apps/backend/test/env.test.ts`

Steps:

- [ ] Write failing tests for Volcengine env loading shape and provider config validation.
- [ ] Add optional env keys: `VOLCENGINE_ARK_API_KEY`, `VOLCENGINE_ARK_BASE_URL`, `VOLCENGINE_ARK_MODEL`.
- [ ] Add `worker` package script.
- [ ] Implement worker loop helpers with no overlapping ticks.
- [ ] Implement OpenAI-compatible provider interface and Volcengine profile resolver without logging secrets.
- [ ] Re-run focused tests and backend build.
- [ ] Commit.

## Task 7: Web API Adapter

**Files:**

- Create: `apps/web/src/pages/chat/insights/api/insights-service.ts`
- Test: `apps/web/test/pages/chat/insights-service.test.ts`

Steps:

- [ ] Write failing tests that verify every P0 API uses `request` and maps query params/body for summary, quality, follow-ups, detail, action update, settings, and rescan.
- [ ] Implement the insights service adapter.
- [ ] Re-run focused web tests.
- [ ] Commit.

## Task 8: Web P0 Pages

**Files:**

- Create: `apps/web/src/pages/chat/insights/insights-layout.tsx`
- Create: `apps/web/src/pages/chat/insights/insights-overview-page.tsx`
- Create: `apps/web/src/pages/chat/insights/insights-quality-page.tsx`
- Create: `apps/web/src/pages/chat/insights/insights-follow-ups-page.tsx`
- Create: `apps/web/src/pages/chat/insights/insights-settings-page.tsx`
- Create: `apps/web/src/pages/chat/insights/insight-detail-panel.tsx`
- Modify: `apps/web/src/router` route definitions.
- Test: `apps/web/test/pages/chat/insights-pages.test.tsx`

Steps:

- [ ] Write failing tests for navigation labels, overview metric links, quality unresolved list, follow-up status buttons, admin-only settings affordance, shared detail evidence context, and P1 placeholder behavior if routes are registered.
- [ ] Implement layout and pages using shadcn/ui primitives and Hugeicons.
- [ ] Use dense workbench styling; no hero/marketing layout.
- [ ] Re-run focused tests.
- [ ] Commit.

## Task 9: Verification

Commands:

- [ ] `pnpm --filter @chatai/contracts build`
- [ ] `pnpm --filter @chatai/contracts test`
- [ ] `pnpm --filter @chatai/backend build`
- [ ] `pnpm --filter @chatai/backend test`
- [ ] `pnpm --filter @chatai/web test apps/web/test/pages/chat/insights-pages.test.tsx apps/web/test/pages/chat/insights-service.test.ts`
- [ ] `pnpm --filter @chatai/web build`
- [ ] `git diff --check`

Completion requires all applicable commands to pass or documented environment-specific failures with risk.
