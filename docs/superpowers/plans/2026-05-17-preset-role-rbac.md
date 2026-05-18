# Preset Role RBAC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement preset role RBAC for ChatAI settings so sub-accounts can be assigned admin, operator, or viewer roles without custom role definitions.

**Architecture:** Shared contracts define roles, permissions, and DTO fields. Backend derives permissions from `xy_wap_embed_sub_user.type` and `role`, enforces permissions on settings routes, and persists role on sub-account create/update. `owner` is derived from `type=1` and is not stored in `role`; new tenant main-account rows should use `type=1 + role=admin`. Frontend displays fixed role definitions and adds role selection to sub-account management.

**Tech Stack:** TypeScript, TypeBox, Fastify, Kysely, React 19, Vitest, Testing Library

---

### Task 1: Contracts Role DTOs

**Files:**
- Modify: `packages/contracts/src/auth/dto.ts`
- Modify: `packages/contracts/src/settings/dto.ts`
- Modify: `packages/contracts/test/settings-dto.test.ts`

- [ ] **Step 1: Write failing contract tests**

Add assertions that `AuthSessionResponseSchema` accepts role and permissions, `SettingsSubAccountSchema` includes `role`, and create/update requests accept `role`.

Run: `pnpm --filter @chatai/contracts test packages/contracts/test/settings-dto.test.ts`

Expected: FAIL because schemas do not yet include role/permissions.

- [ ] **Step 2: Implement contract schemas**

Add `AccountRoleSchema`, `AccountPermissionSchema`, extend auth session/login subUser payloads, and extend settings sub-account DTOs and request DTOs.

- [ ] **Step 3: Verify contract tests**

Run: `pnpm --filter @chatai/contracts test packages/contracts/test/settings-dto.test.ts`

Expected: PASS.

### Task 2: Backend Role Derivation And Auth Session

**Files:**
- Modify: `apps/backend/src/db/schema.ts`
- Create: `apps/backend/src/modules/auth/permissions.ts`
- Modify: `apps/backend/src/modules/auth/auth.service.ts`
- Modify: `apps/backend/test/app.test.ts`

- [ ] **Step 1: Write failing backend tests**

Update login/session expectations to require role and permissions. Add cases for admin and owner role derivation.

Run: `pnpm --filter @chatai/backend test apps/backend/test/app.test.ts`

Expected: FAIL because backend still returns only displayName/subUserId and JWT hard-codes the legacy role.

- [ ] **Step 2: Implement role derivation**

Add permission helper functions and read `type`/`role` from `xy_wap_embed_sub_user`. Sign JWT with derived role. Return session subUser metadata.

- [ ] **Step 3: Verify backend auth tests**

Run: `pnpm --filter @chatai/backend test apps/backend/test/app.test.ts`

Expected: PASS for auth/session cases.

### Task 3: Backend Settings Permission Enforcement And Role Persistence

**Files:**
- Modify: `apps/backend/src/modules/settings/settings.routes.ts`
- Modify: `apps/backend/src/modules/settings/sub-accounts.service.ts`
- Modify: `apps/backend/src/modules/settings/managed-accounts.service.ts`
- Modify: `apps/backend/src/modules/settings/sidebar-items.service.ts`
- Modify: `apps/backend/test/app.test.ts`

- [ ] **Step 1: Write failing route/service tests**

Add tests proving `operator` receives 403 for settings write routes and `admin` can update sub-account role. Add test that main account role is immutable.

Run: `pnpm --filter @chatai/backend test apps/backend/test/app.test.ts`

Expected: FAIL because settings routes only require authentication and services do not persist role.

- [ ] **Step 2: Add settings route guards**

Use a shared permission pre-handler for settings routes. Reads may use `settings.access`; writes use the specific management permission.

- [ ] **Step 3: Persist and map sub-account roles**

Update create/update/list mapping to read/write `role`. Main account maps to derived `owner`; new tenant main-account rows should be created as `type=1 + role=admin`; invalid sub-account role falls back to `operator`; main account update rejects role changes.

- [ ] **Step 4: Verify backend settings tests**

Run: `pnpm --filter @chatai/backend test apps/backend/test/app.test.ts`

Expected: PASS.

### Task 4: Frontend Role UI

**Files:**
- Modify: `apps/web/src/pages/chat/settings/pages/role-permission-settings-page.tsx`
- Modify: `apps/web/src/pages/chat/settings/pages/sub-accounts-settings-page.tsx`
- Modify: `apps/web/src/pages/chat/settings/settings-service.ts`
- Modify: `apps/web/src/pages/chat/settings/chat-settings-page.tsx`
- Add/modify tests under `apps/web/test`

- [ ] **Step 1: Write failing frontend tests**

Add tests for fixed role matrix text and sub-account role payload submission.

Run: `pnpm --filter @chatai/web test apps/web/test/<new-test-file>.test.tsx`

Expected: FAIL because UI still uses demo roles and form has no role field.

- [ ] **Step 2: Replace fake role page**

Render fixed `owner/admin/operator/viewer` role definitions from local constants, read-only.

- [ ] **Step 3: Add sub-account role selection**

Add role column and select control in create/edit dialog. Include role in create/update payloads. Keep owner non-editable.

- [ ] **Step 4: Verify frontend tests**

Run: `pnpm --filter @chatai/web test apps/web/test/<new-test-file>.test.tsx`

Expected: PASS.

### Task 5: Final Verification

**Files:**
- All modified files

- [ ] **Step 1: Run affected builds and tests**

Run:
- `pnpm --filter @chatai/contracts build`
- `pnpm --filter @chatai/contracts test`
- `pnpm --filter @chatai/backend build`
- `pnpm --filter @chatai/backend test`
- `pnpm --filter @chatai/web build`
- `pnpm --filter @chatai/web test`
- `git diff --check`

Expected: all pass.

- [ ] **Step 2: Review diff**

Run: `git diff --stat` and inspect key files for scope creep.
