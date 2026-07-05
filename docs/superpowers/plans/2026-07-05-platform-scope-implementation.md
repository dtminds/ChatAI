# Platform Scope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove business-path dependency on `xy_wap_embed_sub_user.platform` while keeping current workbench pages scoped to platform `5`.

**Architecture:** Add a shared backend platform scope resolver that returns the current workbench platform. Refactor settings, AI hosting settings, and workbench seat/all-customer paths to consume authenticated `uid/subUserId` plus that platform scope instead of querying `sub_user.platform`.

**Tech Stack:** Fastify 5, TypeScript, Kysely, Vitest, existing backend route/service test helpers.

## Global Constraints

- Do not add `platform` to JWT or auth contract.
- Do not derive platform from `xy_wap_embed_sub_user`.
- Current no-selector workbench and settings pages use platform `5`.
- Keep `xy_wap_embed_user_seat_sub_relation.platform` writes for compatibility.
- Use TDD: write failing regression tests before production code changes.
- Run `git diff --check` before commit.
- Backend changes require backend tests and `pnpm --filter @chatai/backend build`.

---

### Task 1: Shared Workbench Platform Scope

**Files:**
- Create: `apps/backend/src/modules/workbench-platform-scope.ts`
- Test: covered by managed account, sub-account, sidebar item, AI hosting, and workbench route/service tests below

**Interfaces:**
- Produces: `CURRENT_WORKBENCH_PLATFORM: 5`
- Produces: `getCurrentWorkbenchPlatformScope(): { platform: number }`
- Produces: `type WorkbenchPlatformScope = { platform: number }`

- [ ] Create the shared module with a named platform constant and resolver.
- [ ] Replace service-local magic platform literals with the shared resolver as services are touched.

### Task 2: Settings Managed Accounts

**Files:**
- Modify: `apps/backend/src/modules/settings/settings.routes.ts`
- Modify: `apps/backend/src/modules/settings/managed-accounts.service.ts`
- Test: `apps/backend/test/modules/settings/managed-account-routes.test.ts`

**Interfaces:**
- Consumes: `getCurrentWorkbenchPlatformScope()`
- Service methods receive `{ uid: number; platform: number }` plus `subUserId` only where cache invalidation needs it.

- [ ] Add/adjust tests so managed account list and updates use authenticated `uid` and platform `5` without querying `xy_wap_embed_sub_user` for scope.
- [ ] Verify the new/changed tests fail against current code because `xy_wap_embed_sub_user` is still queried or scope is still derived from sub user.
- [ ] Refactor route/service arguments from `currentSubUserId` scope lookup to explicit tenant platform scope.
- [ ] Ensure same-uid `platform=6` seats/relations are not listed or mutated.
- [ ] Run the managed-account route tests and confirm they pass.

### Task 3: Settings Sub Accounts

**Files:**
- Modify: `apps/backend/src/modules/settings/settings.routes.ts`
- Modify: `apps/backend/src/modules/settings/sub-accounts.service.ts`
- Test: `apps/backend/test/modules/settings/sub-account-routes.test.ts`

**Interfaces:**
- Consumes: `WorkbenchPlatformScope`
- Service scope is `{ uid: number; platform: number }`; account identity remains `{ subUserId }` only for session/cache invalidation targets.

- [ ] Add/adjust tests proving sub-account list/update uses `uid` without filtering sub users by `sub_user.platform`.
- [ ] Add/adjust tests proving seat binding only sees seats in platform `5` and relation writes use platform `5`.
- [ ] Verify tests fail against current code.
- [ ] Refactor service to remove `getTenantScope()` and `sub_user.platform` filters.
- [ ] Run the sub-account route tests and confirm they pass.

### Task 4: Sidebar Items

**Files:**
- Modify: `apps/backend/src/modules/settings/settings.routes.ts`
- Modify: `apps/backend/src/modules/settings/sidebar-items.service.ts`
- Test: `apps/backend/test/modules/settings/sidebar-items-routes.test.ts`

**Interfaces:**
- Consumes: `WorkbenchPlatformScope`
- Sidebar service receives `{ uid: number; platform: number }`.

- [ ] Add/adjust tests proving sidebar item routes do not query `xy_wap_embed_sub_user` for platform.
- [ ] Verify tests fail against current code.
- [ ] Refactor sidebar service to accept explicit scope.
- [ ] Run the sidebar item route tests and confirm they pass.

### Task 5: AI Hosting Settings

**Files:**
- Modify: `apps/backend/src/modules/ai-hosting/ai-hosting.routes.ts`
- Modify: `apps/backend/src/modules/ai-hosting/ai-hosting-settings.service.ts`
- Test: `apps/backend/test/modules/ai-hosting/agent-routes.test.ts`

**Interfaces:**
- Consumes: `WorkbenchPlatformScope`
- Hosting settings service receives `{ uid: number; platform: number }`.

- [ ] Add/adjust tests proving hosting settings use JWT `uid` and default platform scope without querying `xy_wap_embed_sub_user`.
- [ ] Verify tests fail against current code.
- [ ] Refactor hosting settings service to remove `getSettingsScope()`.
- [ ] Run the AI hosting agent route tests and confirm they pass.

### Task 6: Workbench Seat Access And All-Customer Scope

**Files:**
- Modify: `apps/backend/src/modules/chat/workbench.routes.ts`
- Modify: `apps/backend/src/modules/chat/workbench.service.ts`
- Modify: `apps/backend/src/modules/chat/workbench-repository.ts`
- Test: `apps/backend/test/modules/chat/workbench-repository.test.ts`
- Test: `apps/backend/test/modules/chat/workbench.service.test.ts`

**Interfaces:**
- Consumes: `WorkbenchPlatformScope`
- `listSeats` and seat access snapshot use `{ subUserId, uid, platform }` rather than resolving `platform` from sub user.
- `getSubUser()` returns identity fields only; resource operations keep using resource platform rows.

- [ ] Add/adjust tests proving seat access/list seats do not query `xy_wap_embed_sub_user` for `platform`.
- [ ] Add/adjust tests proving all-customer scope uses current workbench platform and does not leak other platforms under the same `uid`.
- [ ] Verify tests fail against current code.
- [ ] Refactor repository/service route plumbing to pass authenticated `uid` and default platform scope.
- [ ] Run affected workbench tests and confirm they pass.

### Task 7: Full Verification And Review

**Files:**
- Review all modified files

**Interfaces:**
- Produces PR-ready branch

- [ ] Run targeted backend tests for settings, AI hosting, and workbench changes.
- [ ] Run `pnpm --filter @chatai/backend build`.
- [ ] Run `git diff --check`.
- [ ] Review `git diff` for platform literals, unintended JWT changes, stale `sub_user.platform` scope reads, and unrelated churn.
- [ ] Commit changes.
- [ ] Push branch.
- [ ] Open PR referencing issue #385.
- [ ] Prepare manual regression scenario list for the final response and PR body.
