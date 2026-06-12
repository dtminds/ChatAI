# Material Collection Real Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove synthetic all/default group behavior from file, mini-program, and H5 material collection, and require a real group before saving enterprise materials.

**Architecture:** Keep `group_id = 0` only for personal expression materials. File, mini-program, and H5 flows use real group rows end to end: contracts expose real group IDs for create/move, backend rejects missing or zero group IDs for enterprise material writes, and web dialogs only show real groups with inline group creation.

**Tech Stack:** pnpm workspace, TypeScript, TypeBox contracts, Fastify 5, Kysely/MySQL, React 19, Vitest, Testing Library, shadcn/ui, Hugeicons.

---

## Scope

In scope:

- Update the material collection design doc so enterprise materials no longer mention default groups or all-groups views.
- Change group create response to return the created group DTO because the collection dialog needs the new group ID immediately.
- Keep expression collection unchanged: expressions write `groupId: 0` and do not support group management.
- Require a real non-zero `groupId` for file, mini-program, and H5 collection and move operations.
- Remove “所有分组”, “默认分组”, and “移至默认” from file/mini-program/H5 material library UI.
- Add “新建分组” in the collection group dropdown; after creation, select the created group and allow saving.
- Disable collection save when no real group is selected.
- Do not add compatibility display for legacy enterprise `group_id = 0` materials.

Out of scope:

- Data migration or legacy `group_id = 0` enterprise data handling.
- Drag sorting or middle insertion.
- Real sending for collected materials.
- Custom expression upload.

## File Structure

Contracts:

- Modify `packages/contracts/src/chat/dto.ts` so enterprise material create/move requests use string group IDs and group create returns `WorkbenchMaterialCollectionGroupDto`.
- Modify `packages/contracts/test/chat-material-collection-dto.test.ts` to remove enterprise default group examples and cover group create response.

Backend:

- Modify `apps/backend/src/modules/chat/workbench.service.ts` to reject missing, numeric zero, and string zero group IDs for file/mini-program/H5 collection and movement; keep expression group zero.
- Modify `apps/backend/src/modules/chat/workbench-repository.ts` so `createMaterialGroup` returns the inserted group ID and service can return a DTO.
- Modify `apps/backend/src/modules/chat/chat.routes.ts` to remove `0` from the move body schema and keep create body permissive enough to return business `success:false` for invalid collection group IDs.
- Modify `apps/backend/test/modules/chat/workbench.service.test.ts`, `apps/backend/test/modules/chat/workbench-repository.test.ts`, `apps/backend/test/app.test.ts`, and `apps/backend/test/fixtures/workbench-memory.service.ts`.

Web:

- Modify `apps/web/src/pages/chat/components/material-collection/material-group-select-dialog.tsx` for no default selection, disabled save, and inline group creation from the dropdown.
- Modify `apps/web/src/pages/chat/components/material-collection/material-library-dialog.tsx` to only render real groups and remove move-to-default.
- Modify `apps/web/src/pages/chat/chat-workbench-page.tsx` to create groups from the collection dialog and select the returned group.
- Modify `apps/web/src/pages/chat/api/workbench-service.ts` mock and HTTP adapter for the new group create response and string-only enterprise move/create shape.
- Modify web tests in `apps/web/test/pages/chat/material-collection-components.test.tsx`, `apps/web/test/pages/chat/chat-workbench-page.test.tsx`, `apps/web/test/pages/chat/chat-workbench-composer.int.test.tsx`, and `apps/web/test/pages/chat/workbench-service.test.ts`.

---

## Task 1: Contracts And Docs

**Files:**

- Modify: `docs/superpowers/specs/2026-06-12-material-collection-design.md`
- Modify: `packages/contracts/src/chat/dto.ts`
- Modify: `packages/contracts/test/chat-material-collection-dto.test.ts`

- [ ] **Step 1: Write failing contract test updates**

Update `packages/contracts/test/chat-material-collection-dto.test.ts` so enterprise items use a real string `groupId`, group create returns the group DTO, and move requests use a string group ID:

```ts
const fileGroup: WorkbenchMaterialCollectionGroupDto = {
  bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
  id: "group-file-1",
  sort: 1_781_244_000_000,
  title: "常用文件",
};
const fileItem: WorkbenchMaterialCollectionItemDto = {
  bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
  content: {
    extension: "pdf",
    fileName: "报价单.pdf",
    fileSizeLabel: "1.2M",
    sourceLabel: "文件",
  },
  contentType: "file",
  groupId: fileGroup.id,
  id: "1001",
  messageId: "msg-file-001",
  sort: 1_781_244_000_000,
  title: "报价单.pdf",
};
const groupCreateResponse: WorkbenchMaterialCollectionGroupCreateResponse = fileGroup;
const moveRequest: WorkbenchMaterialCollectionMoveRequest = {
  groupId: fileGroup.id,
};

expect(groupCreateResponse.id).toBe("group-file-1");
expect(moveRequest.groupId).toBe("group-file-1");
```

Keep one expression item fixture with `groupId: 0` to document the expression-only exception.

- [ ] **Step 2: Run contract test and verify it fails**

Run:

```bash
pnpm --filter @chatai/contracts test test/chat-material-collection-dto.test.ts
```

Expected: TypeScript/typecheck fails because `WorkbenchMaterialCollectionGroupCreateResponse` is not exported yet or still returns `{ ok: true }` in the contract.

- [ ] **Step 3: Update DTO types**

In `packages/contracts/src/chat/dto.ts`, add:

```ts
export type WorkbenchEnterpriseMaterialCollectionBizType = Exclude<
  MaterialCollectionBizType,
  1
>;
```

Use it for group-managed operations:

```ts
export type WorkbenchMaterialCollectionGroupBizType =
  WorkbenchEnterpriseMaterialCollectionBizType;

export type WorkbenchMaterialCollectionGroupCreateResponse =
  WorkbenchMaterialCollectionGroupDto;

export type WorkbenchMaterialCollectionMoveRequest = {
  groupId: string;
};
```

Keep `WorkbenchMaterialCollectionItemDto.groupId` and `WorkbenchMaterialCollectionCreateRequest.groupId` as `string | 0` because expression collection still passes `0`, and backend returns business errors for invalid enterprise use.

- [ ] **Step 4: Run contract verification**

Run:

```bash
pnpm --filter @chatai/contracts test test/chat-material-collection-dto.test.ts
pnpm --filter @chatai/contracts build
```

Expected: both pass.

## Task 2: Backend Validation And Group Create Return

**Files:**

- Modify: `apps/backend/src/modules/chat/workbench-repository.ts`
- Modify: `apps/backend/src/modules/chat/workbench.service.ts`
- Modify: `apps/backend/src/modules/chat/chat.routes.ts`
- Modify: `apps/backend/test/modules/chat/workbench.service.test.ts`
- Modify: `apps/backend/test/modules/chat/workbench-repository.test.ts`
- Modify: `apps/backend/test/app.test.ts`
- Modify: `apps/backend/test/fixtures/workbench-memory.service.ts`

- [ ] **Step 1: Write failing backend tests**

Add service tests for:

```ts
await expect(
  service.collectMaterial("101", {
    bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
    messageId: "msg-file-001",
  }),
).resolves.toEqual({ success: false, errorMsg: "请选择分组" });

await expect(
  service.collectMaterial("101", {
    bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
    groupId: 0,
    messageId: "msg-file-001",
  }),
).resolves.toEqual({ success: false, errorMsg: "请选择分组" });

await expect(
  service.collectMaterial("101", {
    bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
    groupId: "0",
    messageId: "msg-file-001",
  }),
).resolves.toEqual({ success: false, errorMsg: "请选择分组" });
```

Assert `repository.findMaterialMessage` and `repository.createMaterialCollection` are not called for these invalid enterprise requests.

Add a group create test that expects:

```ts
await expect(
  service.createMaterialGroup("101", {
    bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
    title: "常用文件",
  }),
).resolves.toMatchObject({
  bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
  id: "88",
  title: "常用文件",
});
```

- [ ] **Step 2: Run backend tests and verify they fail**

Run:

```bash
pnpm --filter @chatai/backend test test/modules/chat/workbench.service.test.ts -t "material:"
pnpm --filter @chatai/backend test test/modules/chat/workbench-repository.test.ts -t "material:"
```

Expected: fail because enterprise collection still falls back to `0`, group create returns `{ ok: true }`, or repository create group does not return an ID.

- [ ] **Step 3: Implement repository group return**

Change `createMaterialGroup` in `workbench-repository.ts` to return inserted ID:

```ts
const result = (await this.db
  .insertInto("xy_wap_embed_material_collection_group")
  .values({ ... })
  .executeTakeFirstOrThrow()) as InsertResult;

const insertedId = parseInsertedMySqlId(result);
return insertedId == null ? undefined : String(insertedId);
```

- [ ] **Step 4: Implement service validation**

Add a helper in `workbench.service.ts`:

```ts
function readEnterpriseMaterialGroupId(groupId: string | 0 | undefined) {
  if (groupId === undefined || groupId === 0 || groupId === "0" || !String(groupId).trim()) {
    return undefined;
  }
  return String(groupId);
}
```

Use it before reading the source message for non-expression collection:

```ts
const groupId =
  bizType === MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION
    ? 0
    : readEnterpriseMaterialGroupId(request.groupId);

if (groupId === undefined) {
  return { success: false, errorMsg: "请选择分组" };
}
```

For `moveMaterialCollection`, reject `0` defensively before repository write:

```ts
const groupId = readEnterpriseMaterialGroupId(request.groupId);
if (!groupId) {
  throw new BadRequestError("MATERIAL_GROUP_REQUIRED", "请选择分组");
}
```

For `createMaterialGroup`, return the created group DTO:

```ts
const groupId = await this.repository.createMaterialGroup({ ... });
if (!groupId) {
  throw new BadGatewayError("MATERIAL_GROUP_CREATE_FAILED", "新建分组失败");
}
return {
  bizType,
  id: groupId,
  sort,
  title: request.title.trim(),
};
```

- [ ] **Step 5: Update route schemas and memory fixture**

Change move body schema to `groupId: Type.String({ minLength: 1 })`.

Update `apps/backend/test/fixtures/workbench-memory.service.ts` so `createMaterialGroup` returns the new group DTO and move only accepts string group IDs.

- [ ] **Step 6: Run backend verification**

Run:

```bash
pnpm --filter @chatai/backend test test/modules/chat/workbench.service.test.ts -t "material:"
pnpm --filter @chatai/backend test test/modules/chat/workbench-repository.test.ts -t "material:"
pnpm --filter @chatai/backend test test/app.test.ts -t "material:"
pnpm --filter @chatai/backend build
```

Expected: all pass.

## Task 3: Web UI And API Adapter

**Files:**

- Modify: `apps/web/src/pages/chat/api/workbench-service.ts`
- Modify: `apps/web/src/pages/chat/chat-workbench-page.tsx`
- Modify: `apps/web/src/pages/chat/components/material-collection/material-group-select-dialog.tsx`
- Modify: `apps/web/src/pages/chat/components/material-collection/material-library-dialog.tsx`
- Modify: `apps/web/test/pages/chat/material-collection-components.test.tsx`
- Modify: `apps/web/test/pages/chat/chat-workbench-page.test.tsx`
- Modify: `apps/web/test/pages/chat/chat-workbench-composer.int.test.tsx`
- Modify: `apps/web/test/pages/chat/workbench-service.test.ts`

- [ ] **Step 1: Write failing web component tests**

Update `MaterialGroupSelectDialog` tests to assert:

```ts
expect(screen.getByRole("button", { name: "收录" })).toBeDisabled();
expect(screen.queryByText("默认分组")).not.toBeInTheDocument();
await user.click(screen.getByRole("combobox", { name: "选择分组" }));
await user.click(await screen.findByRole("option", { name: "新建分组" }));
await user.type(screen.getByRole("textbox", { name: "分组名称" }), "售后文件");
await user.click(screen.getByRole("button", { name: "新建" }));
expect(onCreateGroup).toHaveBeenCalledWith("售后文件");
```

Mock `onCreateGroup` to resolve `{ id: "group-new", title: "售后文件", bizType: 2, sort: 123 }`, then click “收录” and expect `onSubmit("group-new")`.

Update `MaterialLibraryDialog` tests to assert no “所有分组”, no “默认分组”, and no “移至默认”; with groups, the first group is selected by default.

- [ ] **Step 2: Run web tests and verify they fail**

Run:

```bash
pnpm --filter @chatai/web test test/pages/chat/material-collection-components.test.tsx
```

Expected: fail because the current components still render synthetic groups and have no group creation callback in the selection dialog.

- [ ] **Step 3: Implement API adapter changes**

Change `WorkbenchService.createMaterialGroup` to return `WorkbenchMaterialCollectionGroupCreateResponse` in interface, mock service, and HTTP service.

Mock implementation should create and return the group:

```ts
const group = {
  bizType: request.bizType,
  id: `material-group-${state.nextId++}`,
  sort: Date.now(),
  title: request.title,
};
state.materialGroups = [group, ...state.materialGroups];
return clone(group);
```

- [ ] **Step 4: Implement collection dialog**

Update `MaterialGroupSelectDialog` props:

```ts
onCreateGroup: (title: string) => Promise<MaterialCollectionGroup | undefined>;
onSubmit: (groupId: string) => void;
```

Use empty string as initial selected value. Add a `SelectItem value="__create__">新建分组</SelectItem>`. When selected, show an inline `Input aria-label="分组名称"` and “新建” button. After `onCreateGroup` resolves a group, set `selectedGroupId` to the returned ID and clear the input. Disable “收录” when `selectedGroupId` is empty or create/save is in progress.

- [ ] **Step 5: Implement library dialog**

Use `activeGroupId: string | null`. When the dialog opens or groups change, select the first group if the current group is gone or null. Filter items by `item.groupId === activeGroupId`. Remove the synthetic group buttons and remove the “移至默认” button. If no groups exist, show only the empty state and new group input.

- [ ] **Step 6: Wire page handlers**

Add `handleCreatePendingMaterialGroup` in `chat-workbench-page.tsx` that calls `getWorkbenchService().createMaterialGroup`, updates `materialCollectionGroups`, and returns the group to the dialog.

Change `handleSubmitMaterialCollection` to take `groupId: string` for enterprise material collection. Keep expression collection with `groupId: 0`.

- [ ] **Step 7: Run web verification**

Run:

```bash
pnpm --filter @chatai/web test test/pages/chat/material-collection-components.test.tsx
pnpm --filter @chatai/web test test/pages/chat/chat-workbench-page.test.tsx -t "collects file messages"
pnpm --filter @chatai/web test test/pages/chat/workbench-service.test.ts -t "material"
pnpm --filter @chatai/web test test/pages/chat/chat-workbench-composer.int.test.tsx -t "material"
pnpm --filter @chatai/web build
```

Expected: all pass.

## Task 4: Final Verification And Commit

**Files:** all files changed by Tasks 1-3.

- [ ] **Step 1: Search for removed copy**

Run:

```bash
rg -n "所有分组|默认分组|移至默认|默认分组不会" apps/web/src apps/web/test docs/superpowers/specs/2026-06-12-material-collection-design.md
```

Expected: no matches in material collection UI/spec. Matches outside this feature must be inspected before ignoring.

- [ ] **Step 2: Run cross-package verification**

Run:

```bash
pnpm --filter @chatai/contracts build
pnpm --filter @chatai/backend build
pnpm --filter @chatai/web build
git diff --check
```

Expected: all pass.

- [ ] **Step 3: Commit implementation**

Stage only material collection files:

```bash
git status --short
git add docs/superpowers/specs/2026-06-12-material-collection-design.md \
  docs/superpowers/plans/2026-06-12-material-collection-implementation.md \
  packages/contracts/src/chat/dto.ts \
  packages/contracts/test/chat-material-collection-dto.test.ts \
  apps/backend/src/modules/chat/workbench-repository.ts \
  apps/backend/src/modules/chat/workbench.service.ts \
  apps/backend/src/modules/chat/chat.routes.ts \
  apps/backend/test/modules/chat/workbench.service.test.ts \
  apps/backend/test/modules/chat/workbench-repository.test.ts \
  apps/backend/test/app.test.ts \
  apps/backend/test/fixtures/workbench-memory.service.ts \
  apps/web/src/pages/chat/api/workbench-service.ts \
  apps/web/src/pages/chat/chat-workbench-page.tsx \
  apps/web/src/pages/chat/components/material-collection/material-group-select-dialog.tsx \
  apps/web/src/pages/chat/components/material-collection/material-library-dialog.tsx \
  apps/web/test/pages/chat/material-collection-components.test.tsx \
  apps/web/test/pages/chat/chat-workbench-page.test.tsx \
  apps/web/test/pages/chat/chat-workbench-composer.int.test.tsx \
  apps/web/test/pages/chat/workbench-service.test.ts

git diff --cached --check
git commit -m "fix(chat): require real material groups"
```

Expected: commit contains only this group-management change.
