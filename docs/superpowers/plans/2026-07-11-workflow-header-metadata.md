# Workflow Header Metadata Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist a 1000-character Workflow description and render a compact two-row canvas header with runtime, save, description, and unpublished-change states.

**Architecture:** Add description to the Workflow definition metadata across schema, contracts, backend repositories, and web view models. Replace name-only editor behavior with a metadata update operation and dialog while preserving the old name route as a compatibility adapter.

**Tech Stack:** TypeBox, Fastify 5, Kysely, MySQL, React 19, React Router v7, Tailwind CSS v4, shadcn/ui, Hugeicons, Vitest, Testing Library

## Global Constraints

- `name` is trimmed and limited to 1-100 characters.
- `description` is trimmed and limited to 0-1000 characters, represented as `""` when absent.
- Description is Workflow metadata and never enters the graph draft or revision hash.
- Use `/api/server/workflows/:workflowId/metadata`; preserve `/name` compatibility.
- Use existing shadcn components and Hugeicons only.
- UI tests cover behavior and state, not Tailwind classes or ordinary copy.
- Run all package scripts through `corepack pnpm`.

---

### Task 1: Contract And Database Metadata

**Files:**
- Modify: `packages/contracts/src/workflow/dto.ts`
- Modify: `packages/contracts/test/workflow-dto.test.ts`
- Modify: `packages/workflow-runtime/src/db.ts`
- Modify: `docs/db/schema.sql`
- Modify: `docs/db/change-log.md`
- Modify: `apps/backend/test/db/schema-doc.test.ts`

**Interfaces:**
- Produces: `WorkflowMetadataUpdateRequest = { name: string; description: string }`
- Produces: required `description: string` on Workflow definition responses

- [ ] **Step 1: Add failing contract and schema tests**

Add TypeBox assertions that a definition requires `description`, metadata accepts 1000 characters, and rejects 1001. Add a schema-doc assertion:

```ts
expect(definitionTable).toContain(
  "description VARCHAR(1000) NOT NULL DEFAULT '' COMMENT 'Workflow描述'",
);
```

- [ ] **Step 2: Run tests and verify failure**

```bash
corepack pnpm --filter @chatai/contracts test -- workflow-dto.test.ts
cd apps/backend && ./node_modules/.bin/vitest run test/db/schema-doc.test.ts
```

Expected: FAIL because the contract and schema have no description field.

- [ ] **Step 3: Implement contract and schema fields**

Add:

```ts
description: Type.String({ maxLength: 1000 }),
```

to definition responses and create:

```ts
export const WorkflowMetadataUpdateRequestSchema = Type.Object({
  description: Type.String({ maxLength: 1000 }),
  name: Type.String({ minLength: 1, maxLength: 100 }),
});
```

Add `description: string` to `WorkflowDefinitionTable`, the schema column, and an `ALTER TABLE ... ADD COLUMN` entry in the change log.

- [ ] **Step 4: Run contract and schema tests**

Run Step 2 commands. Expected: PASS.

---

### Task 2: Backend Metadata Persistence And Routes

**Files:**
- Modify: `apps/backend/src/modules/workflow/workflow-repository-types.ts`
- Modify: `apps/backend/src/modules/workflow/workflow-memory.repository.ts`
- Modify: `apps/backend/src/modules/workflow/workflow-mysql.repository.ts`
- Modify: `apps/backend/src/modules/workflow/workflow.service.ts`
- Modify: `apps/backend/src/modules/workflow/workflow.routes.ts`
- Modify: `apps/backend/test/modules/workflow/workflow-service.test.ts`
- Modify: `apps/backend/test/modules/workflow/workflow-routes.test.ts`
- Modify: `apps/backend/test/modules/workflow/workflow-mysql-repository.test.ts`

**Interfaces:**
- Consumes: `WorkflowMetadataUpdateRequest`
- Produces: `updateDefinitionMetadata({ name?, description?, ...scope })`
- Produces: `WorkflowService.updateMetadata(scope, workflowId, metadata)`

- [ ] **Step 1: Add failing backend tests**

Cover service trimming, 1001-character rejection, metadata route response, name-route preservation of description, and MySQL update values:

```ts
expect(db.updateBuilders[0].sets).toMatchObject({
  description: "引导新客完成首购",
  name: "新客首购旅程",
  op_sub_uid: "19",
});
```

- [ ] **Step 2: Run backend tests and verify failure**

```bash
cd apps/backend && ./node_modules/.bin/vitest run test/modules/workflow/workflow-service.test.ts test/modules/workflow/workflow-routes.test.ts test/modules/workflow/workflow-mysql-repository.test.ts
```

Expected: FAIL because metadata update APIs do not exist.

- [ ] **Step 3: Implement backend metadata update**

Change the definition record and row mapping to include description. Replace `renameDefinition` with:

```ts
updateDefinitionMetadata(input: {
  description?: string;
  name?: string;
  opSubUserId: string;
  uid: number;
  workflowId: string;
}): Promise<WorkflowMutationResult<WorkflowDefinitionRecord>>;
```

Add `PATCH /api/server/workflows/:workflowId/metadata`. Keep `/name` by calling the service with `{ name }`, leaving description unchanged. Create definitions with `description: ""`.

- [ ] **Step 4: Run backend tests**

Run Step 2 command. Expected: PASS.

---

### Task 3: Web Metadata Repository And Document State

**Files:**
- Modify: `apps/web/src/pages/chat/workflow/workflow-repository-types.ts`
- Modify: `apps/web/src/pages/chat/workflow/workflow-http-repository.ts`
- Modify: `apps/web/src/pages/chat/workflow/workflow-in-memory-repository.ts`
- Modify: `apps/web/src/pages/chat/workflow/workflow-draft-service.ts`
- Modify: `apps/web/src/pages/chat/workflow/use-workflow-workspace.ts`
- Modify: `apps/web/test/pages/chat/workflow/workflow-http-repository.test.ts`
- Modify: `apps/web/test/pages/chat/workflow/workflow-draft-service.test.tsx`
- Modify: `apps/web/test/pages/chat/workflow/workflow-workspace.test.tsx`

**Interfaces:**
- Produces: `WorkflowMetadata = { name: string; description: string }`
- Produces: `updateDocumentMetadata(workflowId, metadata)` repository operation
- Produces: top-bar `description`, `runtimeStatus`, and `hasUnpublishedChanges`

- [ ] **Step 1: Add failing web data tests**

Assert HTTP sends:

```ts
expect(client.patch).toHaveBeenCalledWith("/server/workflows/42/metadata", {
  description: "引导新客完成首购",
  name: "新客首购旅程",
});
```

Assert the document hook updates name and description without changing draft, and workspace exposes unpublished changes only when `publishedRevision !== null && publishState === "idle"`.

- [ ] **Step 2: Run web data tests and verify failure**

```bash
cd apps/web && ./node_modules/.bin/vitest run --config vitest.config.ts test/pages/chat/workflow/workflow-http-repository.test.ts test/pages/chat/workflow/workflow-draft-service.test.tsx test/pages/chat/workflow/workflow-workspace.test.tsx
```

Expected: FAIL because description and metadata update are missing.

- [ ] **Step 3: Implement web metadata state**

Add description to list/document mapping and fixtures. Replace `renameDocument` with:

```ts
updateDocumentMetadata(
  workflowId: string,
  metadata: { description: string; name: string },
): Promise<WorkflowDocument> | WorkflowDocument;
```

Expose `updateMetadata(metadata): Promise<boolean>` and `metadataUpdateState` from `useWorkflowDocument`. Workspace catches errors and exposes the compact-header state.

- [ ] **Step 4: Run web data tests**

Run Step 2 command. Expected: PASS.

---

### Task 4: Compact Header And Metadata Dialog

**Files:**
- Modify: `apps/web/src/pages/chat/workflow/canvas/workflow-topbar.tsx`
- Modify: `apps/web/src/pages/chat/workflow/workflow-editor-page.tsx`
- Modify: `apps/web/test/pages/chat/workflow/workflow-topbar-lifecycle.test.tsx`
- Modify: `apps/web/test/pages/chat/workflow/workflow-page.test.tsx`

**Interfaces:**
- Consumes: Task 3 metadata and state props
- Produces: runtime badge, description tooltip, metadata dialog, cloud save row, unpublished-change badge

- [ ] **Step 1: Add failing header behavior tests**

Cover:

```ts
expect(screen.getByText("执行中")).toBeInTheDocument();
await user.hover(screen.getByRole("button", { name: "查看 Workflow 描述" }));
expect(await screen.findByRole("tooltip")).toHaveTextContent("引导新客完成首购");
```

Also cover dialog submission, 1000-character limit, no info icon for empty description, and unpublished-change badge visibility.

- [ ] **Step 2: Run header tests and verify failure**

```bash
cd apps/web && ./node_modules/.bin/vitest run --config vitest.config.ts test/pages/chat/workflow/workflow-topbar-lifecycle.test.tsx test/pages/chat/workflow/workflow-page.test.tsx
```

Expected: FAIL because the compact metadata header is not implemented.

- [ ] **Step 3: Implement the compact header**

Use existing `Badge`, `Dialog`, `Input`, `Textarea`, and `Tooltip`. Render runtime status, title, conditional info tooltip, and edit icon in row one. Render the cloud save state and conditional unpublished badge in row two. Replace inline rename with the metadata dialog.

- [ ] **Step 4: Run header tests**

Run Step 2 command. Expected: PASS.

---

### Task 5: Cross-Package Verification

**Files:**
- Review: all Task 1-4 files

- [ ] **Step 1: Run contracts checks**

```bash
corepack pnpm --filter @chatai/contracts test
corepack pnpm --filter @chatai/contracts build
```

- [ ] **Step 2: Run backend checks**

```bash
corepack pnpm --filter @chatai/backend test
corepack pnpm --filter @chatai/backend build
```

- [ ] **Step 3: Run affected web tests and build**

```bash
cd apps/web && ./node_modules/.bin/vitest run --config vitest.config.ts test/pages/chat/workflow/workflow-http-repository.test.ts test/pages/chat/workflow/workflow-draft-service.test.tsx test/pages/chat/workflow/workflow-workspace.test.tsx test/pages/chat/workflow/workflow-topbar-lifecycle.test.tsx test/pages/chat/workflow/workflow-page.test.tsx
corepack pnpm --filter @chatai/web build
```

- [ ] **Step 4: Review final diff**

```bash
git diff --check
git status --short
git diff --stat
```

Expected: all commands exit 0; only Workflow metadata, header, schema docs, and tests are changed.
