# Insight Rescan Tasks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add user-visible historical rescan tasks with scoped reanalysis, progress counts, and a recent-task list.

**Architecture:** Keep the existing worker job queue for executable work and add a rescan task batch record for user-facing progress. Scoped reanalysis still writes a complete new snapshot by merging old dimensions with newly computed dimensions before publishing `current_snapshot_id`.

**Tech Stack:** pnpm workspace, TypeScript, Fastify, Kysely, TypeBox contracts, React/Vite, Vitest.

---

### Task 1: Contracts And DB Shape

**Files:**
- Modify: `docs/db/schema.sql`
- Modify: `apps/backend/src/db/schema.ts`
- Modify: `packages/contracts/src/insights/dto.ts`
- Test: `packages/contracts/test/insights-dto.test.ts`

- [ ] Add `xy_wap_embed_insight_rescan_task` to schema docs.
- [ ] Add nullable `rescan_task_id` to `xy_wap_embed_insight_job`.
- [ ] Add `InsightRescanAnalysisScope`, request/response task DTOs, and list response.
- [ ] Add contract tests for scoped request parsing and task list response shape.

### Task 2: Backend Repository And Routes

**Files:**
- Modify: `apps/backend/src/modules/insights/insights.repository.ts`
- Modify: `apps/backend/src/modules/insights/insights.service.ts`
- Modify: `apps/backend/src/modules/insights/insights.routes.ts`
- Test: `apps/backend/test/modules/insights/insights-service.test.ts`
- Test: `apps/backend/test/modules/insights/insights-routes.test.ts`

- [ ] Create rescan task rows before queueing the scan job.
- [ ] Return rescan task id from `POST /api/server/insights/jobs/rescan`.
- [ ] Add `GET /api/server/insights/jobs/rescan` for recent tasks.
- [ ] Validate `to >= from` and default `to` to now.

### Task 3: Worker Progress And Scoped Analyze

**Files:**
- Modify: `apps/backend/src/modules/insights/insights-worker.ts`
- Modify: `apps/backend/src/modules/insights/insights-worker.repository.ts`
- Modify: `apps/backend/src/modules/insights/llm-provider.ts`
- Test: `apps/backend/test/modules/insights/insights-worker.test.ts`
- Test: `apps/backend/test/modules/insights/insights-repository.test.ts`
- Test: `apps/backend/test/modules/insights/llm-provider.test.ts`

- [ ] Carry `rescanTaskId` and `analysisScope` through sync and reanalyze jobs.
- [ ] Update task counts when scan starts, queues sessions, and child analyses complete.
- [ ] For scoped reanalysis, load current output, run only the requested LLM dimension, merge output, then save a full snapshot.
- [ ] Keep existing full analysis behavior unchanged for `all`.

### Task 4: Web Rescan UI

**Files:**
- Modify: `apps/web/src/pages/chat/insights/api/insights-service.ts`
- Modify: `apps/web/src/pages/chat/insights/insights-settings-page.tsx`
- Test: `apps/web/test/pages/chat/insights-service.test.ts`
- Test: `apps/web/test/pages/chat/insights-pages.test.tsx`

- [ ] Add list API adapter and scoped create payload.
- [ ] Add rescan content selector and task list below the form.
- [ ] Show status, progress, counts, created time, completed time, and scope label.
- [ ] Refresh task list after creating a task.

### Task 5: Verification

- [ ] Run affected contract tests and build.
- [ ] Run affected backend tests and build.
- [ ] Run affected web tests and build.
- [ ] Run `git diff --check`.
