# Insights Config Limit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce enabled-config limits across insights settings writes, align worker prompt limits with those caps, and surface blocking dialogs in the settings UI.

**Architecture:** Add one shared backend limit policy that validates any write resulting in `status = 1`, returns a stable error envelope, and feeds limit metadata into the summary response. Keep UI list ordering separate from worker prompt ordering by updating repository queries for settings tables and prompt normalization independently.

**Tech Stack:** pnpm workspace, TypeScript, Fastify, Kysely, TypeBox contracts, React/Vite, Vitest.

---

### Task 1: Contracts For Summary Limits And Stable Error Handling

**Files:**
- Modify: `packages/contracts/src/insights/dto.ts`
- Test: `packages/contracts/test/insights-dto.test.ts`

- [ ] Add summary fields for each config family hard/soft limit and rename entity enabled count to an explicit enabled field.
- [ ] Keep existing config mutation request bodies unchanged.
- [ ] Add contract coverage for the updated summary response shape.

### Task 2: Backend Limit Policy And Write Validation

**Files:**
- Modify: `apps/backend/src/modules/insights/insights.service.ts`
- Modify: `apps/backend/src/modules/insights/insights.repository.ts`
- Modify: `apps/backend/src/modules/insights/insights.routes.ts`
- Test: `apps/backend/test/modules/insights/insights-service.test.ts`
- Test: `apps/backend/test/modules/insights/insights-routes.test.ts`

- [ ] Add one shared limit definition for `intentConfigs`, `labelConfigs`, `qaRuleConfigs`, and `entityDictionary`.
- [ ] Validate all writes that persist `status = 1`, including create, full update, and status toggle flows.
- [ ] Return a stable backend error code with `configType`, `currentEnabled`, and `limit` details on limit violations.
- [ ] Update settings summary responses to include the new limit metadata and enabled entity count field.

### Task 3: Repository Ordering And Worker Prompt Limits

**Files:**
- Modify: `apps/backend/src/modules/insights/insights.repository.ts`
- Modify: `apps/backend/src/modules/insights/insight-prompt-builder.ts`
- Test: `apps/backend/test/modules/insights/insight-prompt-builder.test.ts`

- [ ] Change settings list queries for all four config tables to `id desc`.
- [ ] Reduce prompt-side item caps to `20/20/10/20`.
- [ ] Keep worker-side sort rules for prompt payloads only, matching the spec for intent, label, QA, and entity precedence.

### Task 4: Web Summary Rendering And Blocking Dialogs

**Files:**
- Modify: `apps/web/src/pages/chat/insights/insights-settings-page.tsx`
- Test: `apps/web/test/pages/chat/insights-pages.test.tsx`

- [ ] Render top summary counts as `enabled / limit`, with soft-limit warning state derived from backend values.
- [ ] Replace enable-limit toast handling with a blocking alert dialog for both toggle and save failures.
- [ ] Preserve dialog form state on create/update limit failures and roll back optimistic switch intent by simply leaving server state unchanged in the refreshed list.

### Task 5: Verification

- [ ] Run `pnpm --filter @chatai/contracts test packages/contracts/test/insights-dto.test.ts`.
- [ ] Run `pnpm contracts:build`.
- [ ] Run focused backend tests for insights service, routes, and prompt builder.
- [ ] Run `pnpm --filter @chatai/backend build`.
- [ ] Run focused web insights page tests.
- [ ] Run `pnpm --filter @chatai/web build`.
- [ ] Run `git diff --check`.
