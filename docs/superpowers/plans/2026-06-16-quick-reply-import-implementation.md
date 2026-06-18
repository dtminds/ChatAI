# Quick Reply Excel Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add strict `.xlsx` import for quick replies, including category ensure, batch text reply creation, precheck, progress, and refresh.

**Architecture:** The browser parses Excel locally and orchestrates import through two reusable backend endpoints. Contracts define the request and response DTOs, backend service methods enforce business validation with `200 + ok: false`, and the quick reply panel owns the dialog while `useQuickReplies` owns server mutation and reload.

**Tech Stack:** pnpm workspace, TypeScript, React 19, Vite 7, shadcn/ui, Hugeicons, Fastify 5, Kysely, TypeBox, Vitest, Testing Library, `read-excel-file` dynamic import.

---

## File Structure

- Modify `apps/web/package.json` and `pnpm-lock.yaml`: add runtime dependency `read-excel-file`.
- Modify `packages/contracts/src/chat/quick-reply-content.ts`: export quick reply limits and allowed label color keys shared by backend and web.
- Modify `packages/contracts/src/chat/dto.ts`: add category ensure and batch create DTOs.
- Modify `packages/contracts/test/chat-quick-reply-dto.test.ts`: cover new constants and DTO shape expectations.
- Modify `apps/backend/src/modules/chat/workbench.service.ts`: add `ensureQuickReplyCategories` and `batchCreateQuickReplies`.
- Modify `apps/backend/src/modules/chat/chat.routes.ts`: add `POST /api/server/quick-replies/categories/ensure` and `POST /api/server/quick-replies/batch`.
- Modify `apps/backend/test/modules/chat/workbench.service.test.ts`: cover business validation, idempotent ensure, second-level category requirements, and no-write-on-validation-failure.
- Modify `apps/backend/test/app.test.ts`: cover public routes, `200 + ok:false`, and viewer rejection.
- Modify `apps/backend/test/fixtures/workbench-memory.service.ts`: support the new route tests in mocked app flows.
- Modify `apps/web/src/pages/chat/api/workbench-service.ts`: add service interface methods, mock behavior, and HTTP adapter methods.
- Create `apps/web/src/pages/chat/components/quick-reply/quick-reply-import.ts`: parse Excel, validate strict template, compute summary, assign colors, build API payloads, and chunk batches.
- Create `apps/web/src/pages/chat/components/quick-reply/quick-reply-import-dialog.tsx`: import dialog UI and progress state.
- Modify `apps/web/src/pages/chat/components/quick-reply/quick-reply-panel.tsx`: add the import icon button and dialog.
- Modify `apps/web/src/pages/chat/hooks/use-quick-replies.ts`: add import orchestration and reload.
- Modify `apps/web/src/pages/chat/chat-workbench-page.tsx`: pass the hook import action into `QuickReplyPanel`.
- Create `apps/web/test/pages/chat/quick-reply-import.test.ts`: parser and payload tests.
- Modify `apps/web/test/pages/chat/quick-reply-panel.test.tsx`: import entry and dialog behavior tests.
- Modify `apps/web/test/pages/chat/use-quick-replies.test.tsx`: import orchestration tests.
- Modify `apps/web/test/pages/chat/workbench-service.test.ts`: HTTP adapter and mock service tests.

## Task 1: Add Dependency And Shared Contracts

**Files:**
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `packages/contracts/src/chat/quick-reply-content.ts`
- Modify: `packages/contracts/src/chat/dto.ts`
- Test: `packages/contracts/test/chat-quick-reply-dto.test.ts`

- [ ] **Step 1: Add the Excel parser dependency**

Run:

```bash
pnpm --filter @chatai/web add read-excel-file
```

Expected: `apps/web/package.json` contains `"read-excel-file"` under `dependencies`, and `pnpm-lock.yaml` is updated.

- [ ] **Step 2: Write the failing contracts test**

Append these assertions to `packages/contracts/test/chat-quick-reply-dto.test.ts`:

```ts
import {
  QUICK_REPLY_BATCH_CREATE_LIMIT,
  QUICK_REPLY_CATEGORY_TITLE_MAX_LENGTH,
  QUICK_REPLY_IMPORT_MAX_ROWS,
  QUICK_REPLY_LABEL_COLOR_VALUES,
  QUICK_REPLY_LABEL_TEXT_MAX_LENGTH,
  QUICK_REPLY_CONTENT_TEXT_MAX_LENGTH,
} from "../src/chat/quick-reply-content.js";

it("exports quick reply import limits and label color keys", () => {
  expect(QUICK_REPLY_CATEGORY_TITLE_MAX_LENGTH).toBe(10);
  expect(QUICK_REPLY_LABEL_TEXT_MAX_LENGTH).toBe(10);
  expect(QUICK_REPLY_CONTENT_TEXT_MAX_LENGTH).toBe(1000);
  expect(QUICK_REPLY_IMPORT_MAX_ROWS).toBe(1000);
  expect(QUICK_REPLY_BATCH_CREATE_LIMIT).toBe(100);
  expect(QUICK_REPLY_LABEL_COLOR_VALUES).toEqual([
    "",
    "orange",
    "green",
    "blue",
    "pink",
    "purple",
    "rose",
    "teal",
    "brown",
    "slate",
  ]);
});
```

- [ ] **Step 3: Run the contracts test and verify it fails**

Run:

```bash
pnpm --filter @chatai/contracts test test/chat-quick-reply-dto.test.ts
```

Expected: FAIL because the new constants are not exported.

- [ ] **Step 4: Add shared quick reply constants**

In `packages/contracts/src/chat/quick-reply-content.ts`, add:

```ts
export const QUICK_REPLY_CATEGORY_TITLE_MAX_LENGTH = 10;
export const QUICK_REPLY_LABEL_TEXT_MAX_LENGTH = 10;
export const QUICK_REPLY_CONTENT_TEXT_MAX_LENGTH = 1000;
export const QUICK_REPLY_IMPORT_MAX_ROWS = 1000;
export const QUICK_REPLY_BATCH_CREATE_LIMIT = 100;
export const QUICK_REPLY_IMPORT_PRIMARY_CATEGORY_LIMIT = 100;
export const QUICK_REPLY_IMPORT_SECONDARY_CATEGORY_LIMIT = 500;

export const QUICK_REPLY_LABEL_COLOR_VALUES = [
  "",
  "orange",
  "green",
  "blue",
  "pink",
  "purple",
  "rose",
  "teal",
  "brown",
  "slate",
] as const;

export type QuickReplyLabelColor =
  (typeof QUICK_REPLY_LABEL_COLOR_VALUES)[number];

export function isQuickReplyLabelColor(
  value: string,
): value is QuickReplyLabelColor {
  return QUICK_REPLY_LABEL_COLOR_VALUES.includes(value as QuickReplyLabelColor);
}
```

Then replace the hardcoded `1000` in `validateQuickReplyPayload` with `QUICK_REPLY_CONTENT_TEXT_MAX_LENGTH`.

- [ ] **Step 5: Add import DTOs**

In `packages/contracts/src/chat/dto.ts`, add these types after `WorkbenchQuickReplyCategoryCreateRequest`:

```ts
export type WorkbenchQuickReplyImportRowError = {
  rowNumber: number;
  message: string;
};

export type WorkbenchQuickReplyCategoryEnsureRequest = {
  scopeType: QuickReplyScopeType;
  categories: Array<{
    title: string;
    children: string[];
  }>;
};

export type WorkbenchQuickReplyCategoryEnsureSuccessResponse = {
  ok: true;
  categories: Array<{
    id: string;
    title: string;
    children: Array<{
      id: string;
      title: string;
    }>;
  }>;
  summary: {
    createdPrimaryCategoryCount: number;
    createdSecondaryCategoryCount: number;
  };
};

export type WorkbenchQuickReplyImportFailureResponse = {
  ok: false;
  errorMsg: string;
  errors?: WorkbenchQuickReplyImportRowError[];
};

export type WorkbenchQuickReplyCategoryEnsureResponse =
  | WorkbenchQuickReplyCategoryEnsureSuccessResponse
  | WorkbenchQuickReplyImportFailureResponse;

export type WorkbenchQuickReplyBatchCreateRequest = {
  scopeType: QuickReplyScopeType;
  items: Array<{
    rowNumber: number;
    categoryId: string;
    labelText: string;
    labelColor: string;
    contentText: string;
  }>;
};

export type WorkbenchQuickReplyBatchCreateResponse =
  | {
      ok: true;
      summary: {
        createdQuickReplyCount: number;
      };
    }
  | WorkbenchQuickReplyImportFailureResponse;
```

- [ ] **Step 6: Run contracts verification**

Run:

```bash
pnpm --filter @chatai/contracts test test/chat-quick-reply-dto.test.ts
pnpm contracts:build
```

Expected: both commands pass.

- [ ] **Step 7: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml packages/contracts/src/chat/quick-reply-content.ts packages/contracts/src/chat/dto.ts packages/contracts/test/chat-quick-reply-dto.test.ts
git commit -m "feat: add quick reply import contracts"
```

## Task 2: Add Backend Service Behavior

**Files:**
- Modify: `apps/backend/src/modules/chat/workbench.service.ts`
- Test: `apps/backend/test/modules/chat/workbench.service.test.ts`

- [ ] **Step 1: Write failing ensure tests**

Add these cases near the existing quick reply service tests in `apps/backend/test/modules/chat/workbench.service.test.ts`:

```ts
it("quick reply import: ensures missing categories and reuses existing ones", async () => {
  const repository = createMaterialRepository({
    createQuickReplyCategory: vi
      .fn()
      .mockResolvedValueOnce("12")
      .mockResolvedValueOnce("13")
      .mockResolvedValueOnce("14"),
    listQuickReplyCategories: vi.fn().mockResolvedValue([
      {
        id: "10",
        parentId: 0,
        scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
        sort: 100,
        title: "已有一级",
      },
      {
        id: "11",
        parentId: "10",
        scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
        sort: 90,
        title: "已有二级",
      },
    ]),
  });
  const service = new MysqlWorkbenchService(repository, createJavaClient());

  await expect(
    service.ensureQuickReplyCategories("101", {
      scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      categories: [
        { title: "已有一级", children: ["已有二级", "新增二级"] },
        { title: "新增一级", children: ["新子类"] },
      ],
    }),
  ).resolves.toEqual({
    ok: true,
    categories: [
      {
        id: "10",
        title: "已有一级",
        children: [
          { id: "11", title: "已有二级" },
          { id: "12", title: "新增二级" },
        ],
      },
      {
        id: "13",
        title: "新增一级",
        children: [{ id: "14", title: "新子类" }],
      },
    ],
    summary: {
      createdPrimaryCategoryCount: 1,
      createdSecondaryCategoryCount: 2,
    },
  });
});

it("quick reply import: returns ok false for invalid category ensure input", async () => {
  const repository = createMaterialRepository();
  const service = new MysqlWorkbenchService(repository, createJavaClient());

  await expect(
    service.ensureQuickReplyCategories("101", {
      scopeType: QUICK_REPLY_SCOPE_TYPE.PERSONAL,
      categories: [{ title: "超过十个字的一级分类", children: ["二级"] }],
    }),
  ).resolves.toEqual({
    ok: false,
    errorMsg: "导入数据有误",
    errors: [{ rowNumber: 0, message: "一级分类不能超过10个字" }],
  });
  expect(repository.createQuickReplyCategory).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Write failing batch tests**

Add:

```ts
it("quick reply import: creates a valid batch in row order", async () => {
  const repository = createMaterialRepository({
    findQuickReplyCategoryScope: vi.fn().mockResolvedValue({ parentId: "10" }),
    findQuickReplySortBoundary: vi.fn().mockResolvedValue(80),
    hasActiveQuickReplyCategory: vi.fn().mockResolvedValue(true),
    isChildQuickReplyCategory: vi.fn().mockResolvedValue(true),
  });
  const service = new MysqlWorkbenchService(repository, createJavaClient());

  await expect(
    service.batchCreateQuickReplies("101", {
      scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      items: [
        {
          rowNumber: 2,
          categoryId: "11",
          labelText: "开场",
          labelColor: "orange",
          contentText: "您好",
        },
        {
          rowNumber: 3,
          categoryId: "11",
          labelText: "开场",
          labelColor: "orange",
          contentText: "请问有什么可以帮您",
        },
      ],
    }),
  ).resolves.toEqual({
    ok: true,
    summary: { createdQuickReplyCount: 2 },
  });
  expect(repository.createQuickReply).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      attachments: [],
      categoryId: "11",
      contentText: "您好",
      labelColor: "orange",
      labelText: "开场",
      sort: 79,
    }),
  );
  expect(repository.createQuickReply).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({
      categoryId: "11",
      contentText: "请问有什么可以帮您",
      sort: 78,
    }),
  );
});

it("quick reply import: rejects a batch with any invalid row before writing", async () => {
  const repository = createMaterialRepository({
    hasActiveQuickReplyCategory: vi.fn().mockResolvedValue(true),
    isChildQuickReplyCategory: vi.fn().mockResolvedValue(false),
  });
  const service = new MysqlWorkbenchService(repository, createJavaClient());

  await expect(
    service.batchCreateQuickReplies("101", {
      scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      items: [
        {
          rowNumber: 2,
          categoryId: "10",
          labelText: "",
          labelColor: "bad-color",
          contentText: "",
        },
      ],
    }),
  ).resolves.toEqual({
    ok: false,
    errorMsg: "导入数据有误",
    errors: [
      { rowNumber: 2, message: "短标题颜色无效" },
      { rowNumber: 2, message: "话术内容不能为空" },
      { rowNumber: 2, message: "话术必须挂到二级分类" },
    ],
  });
  expect(repository.createQuickReply).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Run service tests and verify failure**

Run:

```bash
pnpm --filter @chatai/backend test apps/backend/test/modules/chat/workbench.service.test.ts -- --runInBand
```

Expected: FAIL because the service methods do not exist.

- [ ] **Step 4: Extend backend service interface and imports**

In `apps/backend/src/modules/chat/workbench.service.ts`, import the new contract types and constants:

```ts
import type {
  WorkbenchQuickReplyBatchCreateRequest,
  WorkbenchQuickReplyBatchCreateResponse,
  WorkbenchQuickReplyCategoryEnsureRequest,
  WorkbenchQuickReplyCategoryEnsureResponse,
  WorkbenchQuickReplyCategoryEnsureSuccessResponse,
  WorkbenchQuickReplyImportRowError,
} from "@chatai/contracts";
import {
  QUICK_REPLY_BATCH_CREATE_LIMIT,
  QUICK_REPLY_CATEGORY_TITLE_MAX_LENGTH,
  QUICK_REPLY_IMPORT_PRIMARY_CATEGORY_LIMIT,
  QUICK_REPLY_IMPORT_SECONDARY_CATEGORY_LIMIT,
  QUICK_REPLY_LABEL_TEXT_MAX_LENGTH,
  isQuickReplyLabelColor,
} from "@chatai/contracts";
```

Add these methods to the exported `WorkbenchService` type:

```ts
ensureQuickReplyCategories(
  subUserId: string,
  request: WorkbenchQuickReplyCategoryEnsureRequest,
):
  | Promise<WorkbenchQuickReplyCategoryEnsureResponse>
  | WorkbenchQuickReplyCategoryEnsureResponse;
batchCreateQuickReplies(
  subUserId: string,
  request: WorkbenchQuickReplyBatchCreateRequest,
):
  | Promise<WorkbenchQuickReplyBatchCreateResponse>
  | WorkbenchQuickReplyBatchCreateResponse;
```

- [ ] **Step 5: Implement business validation helpers**

Add helpers near the quick reply helper functions:

```ts
function importFailure(
  errors: WorkbenchQuickReplyImportRowError[],
): { ok: false; errorMsg: string; errors: WorkbenchQuickReplyImportRowError[] } {
  return {
    ok: false,
    errorMsg: "导入数据有误",
    errors,
  };
}

function validateImportCategoryTitle(
  title: string,
  label: "一级分类" | "二级分类",
): string | { message: string } {
  const normalizedTitle = title.trim();

  if (!normalizedTitle) {
    return { message: `${label}不能为空` };
  }

  if (normalizedTitle.length > QUICK_REPLY_CATEGORY_TITLE_MAX_LENGTH) {
    return { message: `${label}不能超过10个字` };
  }

  return normalizedTitle;
}
```

- [ ] **Step 6: Implement `ensureQuickReplyCategories`**

Add this method to `MysqlWorkbenchService`:

```ts
async ensureQuickReplyCategories(
  subUserId: string,
  request: WorkbenchQuickReplyCategoryEnsureRequest,
): Promise<WorkbenchQuickReplyCategoryEnsureResponse> {
  const me = await this.getMaterialActor(subUserId);
  const scopeType = parseQuickReplyScopeType(request.scopeType);
  const errors: WorkbenchQuickReplyImportRowError[] = [];

  if (!Array.isArray(request.categories) || request.categories.length === 0) {
    return importFailure([{ rowNumber: 0, message: "分类不能为空" }]);
  }

  if (request.categories.length > QUICK_REPLY_IMPORT_PRIMARY_CATEGORY_LIMIT) {
    return importFailure([{ rowNumber: 0, message: "一级分类最多100个" }]);
  }

  let secondaryCount = 0;
  const normalizedCategories: Array<{ title: string; children: string[] }> = [];

  for (const category of request.categories) {
    const titleResult = validateImportCategoryTitle(category.title, "一级分类");
    if (typeof titleResult !== "string") {
      errors.push({ rowNumber: 0, message: titleResult.message });
      continue;
    }

    const children: string[] = [];
    for (const childTitle of category.children) {
      const childResult = validateImportCategoryTitle(childTitle, "二级分类");
      if (typeof childResult !== "string") {
        errors.push({ rowNumber: 0, message: childResult.message });
        continue;
      }
      if (!children.includes(childResult)) {
        children.push(childResult);
      }
    }

    secondaryCount += children.length;
    normalizedCategories.push({ title: titleResult, children });
  }

  if (secondaryCount > QUICK_REPLY_IMPORT_SECONDARY_CATEGORY_LIMIT) {
    errors.push({ rowNumber: 0, message: "二级分类最多500个" });
  }

  if (errors.length) {
    return importFailure(errors);
  }

  const existing = await this.repository.listQuickReplyCategories({
    scopeType,
    subUserId,
    uid: me.uid,
  });
  const byParentAndTitle = new Map<string, { id: string; title: string }>();
  for (const category of existing) {
    byParentAndTitle.set(`${category.parentId}:${category.title}`, {
      id: category.id,
      title: category.title,
    });
  }

  let createdPrimaryCategoryCount = 0;
  let createdSecondaryCategoryCount = 0;
  const categories: WorkbenchQuickReplyCategoryEnsureSuccessResponse["categories"] = [];

  for (const category of normalizedCategories) {
    let primary = byParentAndTitle.get(`0:${category.title}`);
    if (!primary) {
      const id = await this.repository.createQuickReplyCategory({
        opSubUserId: subUserId,
        parentId: 0,
        scopeType,
        sort: await this.getQuickReplyCategoryAppendSort({
          parentId: 0,
          scopeType,
          subUserId,
          uid: me.uid,
        }),
        subUserId,
        title: category.title,
        uid: me.uid,
      });
      primary = { id: id ?? "", title: category.title };
      byParentAndTitle.set(`0:${category.title}`, primary);
      createdPrimaryCategoryCount += 1;
    }

    const children = [];
    for (const childTitle of category.children) {
      let child = byParentAndTitle.get(`${primary.id}:${childTitle}`);
      if (!child) {
        const id = await this.repository.createQuickReplyCategory({
          opSubUserId: subUserId,
          parentId: primary.id,
          scopeType,
          sort: await this.getQuickReplyCategoryAppendSort({
            parentId: primary.id,
            scopeType,
            subUserId,
            uid: me.uid,
          }),
          subUserId,
          title: childTitle,
          uid: me.uid,
        });
        child = { id: id ?? "", title: childTitle };
        byParentAndTitle.set(`${primary.id}:${childTitle}`, child);
        createdSecondaryCategoryCount += 1;
      }
      children.push(child);
    }

    categories.push({ ...primary, children });
  }

  return {
    ok: true,
    categories,
    summary: {
      createdPrimaryCategoryCount,
      createdSecondaryCategoryCount,
    },
  };
}
```

- [ ] **Step 7: Implement `batchCreateQuickReplies`**

Add this method to `MysqlWorkbenchService`:

```ts
async batchCreateQuickReplies(
  subUserId: string,
  request: WorkbenchQuickReplyBatchCreateRequest,
): Promise<WorkbenchQuickReplyBatchCreateResponse> {
  const me = await this.getMaterialActor(subUserId);
  const scopeType = parseQuickReplyScopeType(request.scopeType);
  const errors: WorkbenchQuickReplyImportRowError[] = [];

  if (!Array.isArray(request.items) || request.items.length === 0) {
    return importFailure([{ rowNumber: 0, message: "话术不能为空" }]);
  }

  if (request.items.length > QUICK_REPLY_BATCH_CREATE_LIMIT) {
    return importFailure([{ rowNumber: 0, message: "单批最多导入100条话术" }]);
  }

  const normalizedItems = request.items.map((item) => ({
    rowNumber: item.rowNumber,
    categoryId: normalizeQuickReplyCategoryId(item.categoryId),
    contentText: item.contentText.trim(),
    labelColor: item.labelColor.trim(),
    labelText: item.labelText.trim(),
  }));

  const categoryIds = Array.from(
    new Set(
      normalizedItems
        .map((item) => item.categoryId)
        .filter((categoryId): categoryId is string => typeof categoryId === "string"),
    ),
  );
  const childCategoryIds = new Set<string>();

  for (const categoryId of categoryIds) {
    const [exists, isChild] = await Promise.all([
      this.repository.hasActiveQuickReplyCategory({
        categoryId,
        scopeType,
        subUserId,
        uid: me.uid,
      }),
      this.repository.isChildQuickReplyCategory({
        categoryId,
        scopeType,
        subUserId,
        uid: me.uid,
      }),
    ]);

    if (exists && isChild) {
      childCategoryIds.add(categoryId);
    }
  }

  for (const item of normalizedItems) {
    if (item.categoryId === 0 || !childCategoryIds.has(item.categoryId)) {
      errors.push({ rowNumber: item.rowNumber, message: "话术必须挂到二级分类" });
    }
    if (item.labelText.length > QUICK_REPLY_LABEL_TEXT_MAX_LENGTH) {
      errors.push({ rowNumber: item.rowNumber, message: "短标题不能超过10个字" });
    }
    if (!isQuickReplyLabelColor(item.labelColor)) {
      errors.push({ rowNumber: item.rowNumber, message: "短标题颜色无效" });
    }
    if (!item.contentText) {
      errors.push({ rowNumber: item.rowNumber, message: "话术内容不能为空" });
    }
    if (item.contentText.length > QUICK_REPLY_CONTENT_TEXT_MAX_LENGTH) {
      errors.push({ rowNumber: item.rowNumber, message: "话术内容不能超过1000字" });
    }
  }

  if (errors.length) {
    return importFailure(errors);
  }

  const nextSortByCategoryId = new Map<string, number>();

  for (const item of normalizedItems) {
    if (typeof item.categoryId !== "string") {
      continue;
    }

    let nextSort = nextSortByCategoryId.get(item.categoryId);
    if (nextSort == null) {
      nextSort = await this.getQuickReplyAppendSort({
        categoryId: item.categoryId,
        scopeType,
        subUserId,
        uid: me.uid,
      });
    }

    await this.repository.createQuickReply({
      attachments: [],
      categoryId: item.categoryId,
      contentText: item.contentText,
      labelColor: item.labelColor,
      labelText: item.labelText,
      opSubUserId: subUserId,
      scopeType,
      sort: nextSort,
      subUserId,
      uid: me.uid,
    });
    nextSortByCategoryId.set(item.categoryId, Math.max(0, nextSort - 1));
  }

  return {
    ok: true,
    summary: { createdQuickReplyCount: normalizedItems.length },
  };
}
```

- [ ] **Step 8: Run backend service tests**

Run:

```bash
pnpm --filter @chatai/backend test apps/backend/test/modules/chat/workbench.service.test.ts -- --runInBand
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/backend/src/modules/chat/workbench.service.ts apps/backend/test/modules/chat/workbench.service.test.ts
git commit -m "feat: add quick reply import service"
```

## Task 3: Add Backend Routes

**Files:**
- Modify: `apps/backend/src/modules/chat/chat.routes.ts`
- Modify: `apps/backend/test/app.test.ts`
- Modify: `apps/backend/test/fixtures/workbench-memory.service.ts`

- [ ] **Step 1: Add failing route tests**

Add route tests in `apps/backend/test/app.test.ts`:

```ts
it("quick reply import: ensures categories and creates batches through public routes", async () => {
  const app = await buildMockedApp();
  const authHeaders = await loginAsAdmin(app);

  const ensureResponse = await app.inject({
    headers: authHeaders,
    method: "POST",
    payload: {
      scopeType: 1,
      categories: [{ title: "售前", children: ["开场"] }],
    },
    url: "/api/server/quick-replies/categories/ensure",
  });
  expect(ensureResponse.statusCode).toBe(200);
  expect(ensureResponse.json()).toMatchObject({
    ok: true,
    summary: {
      createdPrimaryCategoryCount: 1,
      createdSecondaryCategoryCount: 1,
    },
  });

  const categoryId = ensureResponse.json().categories[0].children[0].id;
  const batchResponse = await app.inject({
    headers: authHeaders,
    method: "POST",
    payload: {
      scopeType: 1,
      items: [
        {
          rowNumber: 2,
          categoryId,
          labelText: "开场",
          labelColor: "orange",
          contentText: "您好",
        },
      ],
    },
    url: "/api/server/quick-replies/batch",
  });
  expect(batchResponse.statusCode).toBe(200);
  expect(batchResponse.json()).toEqual({
    ok: true,
    summary: { createdQuickReplyCount: 1 },
  });
});

it("quick reply import: returns ok false for business validation errors", async () => {
  const app = await buildMockedApp();
  const authHeaders = await loginAsAdmin(app);

  const response = await app.inject({
    headers: authHeaders,
    method: "POST",
    payload: {
      scopeType: 1,
      items: [
        {
          rowNumber: 2,
          categoryId: "0",
          labelText: "",
          labelColor: "orange",
          contentText: "",
        },
      ],
    },
    url: "/api/server/quick-replies/batch",
  });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toMatchObject({
    ok: false,
    errorMsg: "导入数据有误",
  });
});
```

Use the same authenticated-header helper already used by nearby quick reply route tests in `apps/backend/test/app.test.ts`.

- [ ] **Step 2: Run route tests and verify failure**

Run:

```bash
pnpm --filter @chatai/backend test apps/backend/test/app.test.ts -- --runInBand
```

Expected: FAIL because the routes do not exist.

- [ ] **Step 3: Add TypeBox schemas**

In `apps/backend/src/modules/chat/chat.routes.ts`, add:

```ts
const QuickReplyCategoryEnsureBodySchema = Type.Object({
  categories: Type.Array(
    Type.Object({
      children: Type.Array(Type.String()),
      title: Type.String(),
    }),
  ),
  scopeType: QuickReplyScopeTypeSchema,
});

const QuickReplyBatchCreateBodySchema = Type.Object({
  items: Type.Array(
    Type.Object({
      categoryId: Type.String({ maxLength: 64, minLength: 1 }),
      contentText: Type.String(),
      labelColor: Type.String(),
      labelText: Type.String(),
      rowNumber: Type.Integer({ minimum: 1 }),
    }),
  ),
  scopeType: QuickReplyScopeTypeSchema,
});
```

Add static types:

```ts
type QuickReplyCategoryEnsureBody = Static<typeof QuickReplyCategoryEnsureBodySchema>;
type QuickReplyBatchCreateBody = Static<typeof QuickReplyBatchCreateBodySchema>;
```

- [ ] **Step 4: Add routes**

Add routes before `POST /api/server/quick-replies/categories` and before `POST /api/server/quick-replies`:

```ts
app.post<{ Body: QuickReplyCategoryEnsureBody }>(
  "/api/server/quick-replies/categories/ensure",
  {
    preHandler: app.authenticate,
    schema: {
      body: QuickReplyCategoryEnsureBodySchema,
    },
  },
  async (request) => {
    assertChatWriteAccess(request);
    return getWorkbenchService(app, request).ensureQuickReplyCategories(
      getSubUserId(request),
      request.body,
    );
  },
);

app.post<{ Body: QuickReplyBatchCreateBody }>(
  "/api/server/quick-replies/batch",
  {
    preHandler: app.authenticate,
    schema: {
      body: QuickReplyBatchCreateBodySchema,
    },
  },
  async (request) => {
    assertChatWriteAccess(request);
    return getWorkbenchService(app, request).batchCreateQuickReplies(
      getSubUserId(request),
      request.body,
    );
  },
);
```

- [ ] **Step 5: Update memory service fixture**

In `apps/backend/test/fixtures/workbench-memory.service.ts`, implement:

```ts
ensureQuickReplyCategories(
  _subUserId: string,
  request: WorkbenchQuickReplyCategoryEnsureRequest,
): WorkbenchQuickReplyCategoryEnsureResponse {
  const categories = request.categories.map((category) => {
    let primary = state.quickReplyCategories.find(
      (item) =>
        item.scopeType === request.scopeType &&
        item.parentId === 0 &&
        item.title === category.title,
    );
    let createdPrimary = false;
    if (!primary) {
      primary = {
        id: `quick-reply-category-${state.nextId++}`,
        parentId: 0,
        scopeType: request.scopeType,
        sort: getAppendQuickReplyCategorySort(
          state.quickReplyCategories,
          request.scopeType,
          0,
        ),
        title: category.title,
      };
      state.quickReplyCategories.push(primary);
      createdPrimary = true;
    }

    const children = category.children.map((childTitle) => {
      let child = state.quickReplyCategories.find(
        (item) =>
          item.scopeType === request.scopeType &&
          item.parentId === primary.id &&
          item.title === childTitle,
      );
      if (!child) {
        child = {
          id: `quick-reply-category-${state.nextId++}`,
          parentId: primary.id,
          scopeType: request.scopeType,
          sort: getAppendQuickReplyCategorySort(
            state.quickReplyCategories,
            request.scopeType,
            primary.id,
          ),
          title: childTitle,
        };
        state.quickReplyCategories.push(child);
      }
      return { id: child.id, title: child.title };
    });

    return {
      category: { id: primary.id, title: primary.title, children },
      createdPrimary,
      createdSecondaryCount: children.length,
    };
  });

  return {
    ok: true,
    categories: categories.map((item) => item.category),
    summary: {
      createdPrimaryCategoryCount: categories.filter((item) => item.createdPrimary).length,
      createdSecondaryCategoryCount: categories.reduce(
        (total, item) => total + item.createdSecondaryCount,
        0,
      ),
    },
  };
}

batchCreateQuickReplies(
  _subUserId: string,
  request: WorkbenchQuickReplyBatchCreateRequest,
): WorkbenchQuickReplyBatchCreateResponse {
  for (const item of request.items) {
    const category = state.quickReplyCategories.find(
      (entry) =>
        entry.id === item.categoryId &&
        entry.scopeType === request.scopeType &&
        entry.parentId !== 0,
    );

    if (!category || !item.contentText.trim()) {
      return {
        ok: false,
        errorMsg: "导入数据有误",
        errors: [{ rowNumber: item.rowNumber, message: "导入数据有误" }],
      };
    }

    state.quickReplies = [
      ...state.quickReplies,
      {
        attachments: [],
        categoryId: item.categoryId,
        contentText: item.contentText.trim(),
        id: `quick-reply-${state.nextId++}`,
        labelColor: item.labelColor.trim(),
        labelText: item.labelText.trim(),
        scopeType: request.scopeType,
        sort: getAppendQuickReplySort(
          state.quickReplies,
          request.scopeType,
          item.categoryId,
        ),
      },
    ];
  }

  return {
    ok: true,
    summary: { createdQuickReplyCount: request.items.length },
  };
}
```

- [ ] **Step 6: Run backend route verification**

Run:

```bash
pnpm --filter @chatai/backend test apps/backend/test/app.test.ts -- --runInBand
pnpm backend:build
```

Expected: both commands pass.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/chat/chat.routes.ts apps/backend/test/app.test.ts apps/backend/test/fixtures/workbench-memory.service.ts
git commit -m "feat: expose quick reply import routes"
```

## Task 4: Add Frontend Import Parser And Payload Builders

**Files:**
- Create: `apps/web/src/pages/chat/components/quick-reply/quick-reply-import.ts`
- Test: `apps/web/test/pages/chat/quick-reply-import.test.ts`

- [ ] **Step 1: Write failing parser tests**

Create `apps/web/test/pages/chat/quick-reply-import.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { QUICK_REPLY_SCOPE_TYPE } from "@chatai/contracts";
import {
  assignQuickReplyImportColors,
  buildQuickReplyCategoryEnsureRequest,
  buildQuickReplyImportPrecheckFromRows,
  chunkQuickReplyImportItems,
  QUICK_REPLY_IMPORT_HEADERS,
} from "@/pages/chat/components/quick-reply/quick-reply-import";

describe("quick reply import", () => {
  it("parses strict template rows and reports summary", () => {
    const result = buildQuickReplyImportPrecheckFromRows(
      [
        QUICK_REPLY_IMPORT_HEADERS,
        ["售前", "开场", "欢迎", "您好"],
        ["售前", "开场", "欢迎", "请问有什么可以帮您"],
      ],
      [],
    );

    expect(result.ok).toBe(true);
    expect(result.summary).toMatchObject({
      creatableQuickReplyCount: 2,
      errorCount: 0,
      newPrimaryCategoryCount: 1,
      newSecondaryCategoryCount: 1,
    });
  });

  it("rejects non-exact headers and blank rows", () => {
    const result = buildQuickReplyImportPrecheckFromRows(
      [
        [" 一级分类", "二级分类", "话术标题", "话术内容"],
        ["", "", "", ""],
      ],
      [],
    );

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([
      { rowNumber: 1, message: "表头必须完全等于模板" },
      { rowNumber: 2, message: "整行不能为空" },
    ]);
  });

  it("assigns colors by secondary category and label first appearance", () => {
    const rows = [
      {
        rowNumber: 2,
        primaryCategory: "售前",
        secondaryCategory: "开场",
        labelText: "欢迎",
        contentText: "您好",
      },
      {
        rowNumber: 3,
        primaryCategory: "售前",
        secondaryCategory: "开场",
        labelText: "欢迎",
        contentText: "再次您好",
      },
      {
        rowNumber: 4,
        primaryCategory: "售前",
        secondaryCategory: "发货",
        labelText: "欢迎",
        contentText: "发货说明",
      },
    ];

    expect(assignQuickReplyImportColors(rows).map((item) => item.labelColor)).toEqual([
      "orange",
      "orange",
      "orange",
    ]);
  });

  it("builds category ensure request and 100-item chunks", () => {
    const rows = Array.from({ length: 101 }, (_, index) => ({
      rowNumber: index + 2,
      primaryCategory: "售前",
      secondaryCategory: index === 100 ? "发货" : "开场",
      labelText: "",
      contentText: `内容${index}`,
    }));

    expect(
      buildQuickReplyCategoryEnsureRequest(
        QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
        rows,
      ),
    ).toEqual({
      scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      categories: [{ title: "售前", children: ["开场", "发货"] }],
    });
    expect(chunkQuickReplyImportItems(rows, 100)).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run parser tests and verify failure**

Run:

```bash
pnpm --filter @chatai/web test apps/web/test/pages/chat/quick-reply-import.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement parser module**

Create `apps/web/src/pages/chat/components/quick-reply/quick-reply-import.ts` with:

```ts
import {
  QUICK_REPLY_BATCH_CREATE_LIMIT,
  QUICK_REPLY_CATEGORY_TITLE_MAX_LENGTH,
  QUICK_REPLY_CONTENT_TEXT_MAX_LENGTH,
  QUICK_REPLY_IMPORT_MAX_ROWS,
  QUICK_REPLY_LABEL_COLOR_VALUES,
  QUICK_REPLY_LABEL_TEXT_MAX_LENGTH,
  type QuickReplyScopeType,
  type WorkbenchQuickReplyBatchCreateRequest,
  type WorkbenchQuickReplyCategoryDto,
  type WorkbenchQuickReplyCategoryEnsureRequest,
  type WorkbenchQuickReplyCategoryEnsureSuccessResponse,
} from "@chatai/contracts";

export const QUICK_REPLY_IMPORT_HEADERS = [
  "一级分类",
  "二级分类",
  "话术标题",
  "话术内容",
] as const;

export type QuickReplyImportParsedRow = {
  rowNumber: number;
  primaryCategory: string;
  secondaryCategory: string;
  labelText: string;
  contentText: string;
};

export type QuickReplyImportPrecheck = {
  ok: boolean;
  rows: QuickReplyImportParsedRow[];
  errors: Array<{ rowNumber: number; message: string }>;
  summary: {
    totalRowCount: number;
    creatableQuickReplyCount: number;
    errorCount: number;
    newPrimaryCategoryCount: number;
    newSecondaryCategoryCount: number;
  };
};

export async function parseQuickReplyImportFile(
  file: File,
  existingCategories: WorkbenchQuickReplyCategoryDto[],
): Promise<QuickReplyImportPrecheck> {
  const { default: readXlsxFile } = await import("read-excel-file");
  const rows = await readXlsxFile(file);

  return buildQuickReplyImportPrecheckFromRows(rows, existingCategories);
}

export function buildQuickReplyImportPrecheckFromRows(
  rows: unknown[][],
  existingCategories: WorkbenchQuickReplyCategoryDto[],
): QuickReplyImportPrecheck {
  const errors: Array<{ rowNumber: number; message: string }> = [];
  const header = rows[0] ?? [];

  if (
    header.length !== QUICK_REPLY_IMPORT_HEADERS.length ||
    QUICK_REPLY_IMPORT_HEADERS.some((name, index) => header[index] !== name)
  ) {
    errors.push({ rowNumber: 1, message: "表头必须完全等于模板" });
  }

  const parsedRows: QuickReplyImportParsedRow[] = [];

  rows.slice(1).forEach((row, index) => {
    const rowNumber = index + 2;
    const cells = row.map((cell) => String(cell ?? "").trim());

    if (cells.every((cell) => cell === "")) {
      errors.push({ rowNumber, message: "整行不能为空" });
      return;
    }

    const [
      primaryCategory = "",
      secondaryCategory = "",
      labelText = "",
      contentText = "",
    ] = cells;
    const rowErrors = validateParsedRow({
      rowNumber,
      primaryCategory,
      secondaryCategory,
      labelText,
      contentText,
    });

    errors.push(...rowErrors);
    parsedRows.push({
      rowNumber,
      primaryCategory,
      secondaryCategory,
      labelText,
      contentText,
    });
  });

  if (parsedRows.length > QUICK_REPLY_IMPORT_MAX_ROWS) {
    errors.push({ rowNumber: 0, message: "单次最多导入1000条话术" });
  }

  const summary = buildQuickReplyImportSummary(parsedRows, errors, existingCategories);

  return {
    ok: errors.length === 0,
    rows: parsedRows,
    errors,
    summary,
  };
}

function validateParsedRow(row: QuickReplyImportParsedRow) {
  const errors: Array<{ rowNumber: number; message: string }> = [];

  if (!row.primaryCategory) errors.push({ rowNumber: row.rowNumber, message: "一级分类不能为空" });
  if (!row.secondaryCategory) errors.push({ rowNumber: row.rowNumber, message: "二级分类不能为空" });
  if (!row.contentText) errors.push({ rowNumber: row.rowNumber, message: "话术内容不能为空" });
  if (row.primaryCategory.length > QUICK_REPLY_CATEGORY_TITLE_MAX_LENGTH) {
    errors.push({ rowNumber: row.rowNumber, message: "一级分类不能超过10个字" });
  }
  if (row.secondaryCategory.length > QUICK_REPLY_CATEGORY_TITLE_MAX_LENGTH) {
    errors.push({ rowNumber: row.rowNumber, message: "二级分类不能超过10个字" });
  }
  if (row.labelText.length > QUICK_REPLY_LABEL_TEXT_MAX_LENGTH) {
    errors.push({ rowNumber: row.rowNumber, message: "话术标题不能超过10个字" });
  }
  if (row.contentText.length > QUICK_REPLY_CONTENT_TEXT_MAX_LENGTH) {
    errors.push({ rowNumber: row.rowNumber, message: "话术内容不能超过1000字" });
  }

  return errors;
}

function buildQuickReplyImportSummary(
  rows: QuickReplyImportParsedRow[],
  errors: Array<{ rowNumber: number; message: string }>,
  existingCategories: WorkbenchQuickReplyCategoryDto[],
) {
  const existingPrimary = new Set(
    existingCategories
      .filter((category) => category.parentId === 0)
      .map((category) => category.title),
  );
  const primaryTitleById = new Map(
    existingCategories
      .filter((category) => category.parentId === 0)
      .map((category) => [category.id, category.title]),
  );
  const existingSecondary = new Set(
    existingCategories
      .filter((category) => category.parentId !== 0)
      .map((category) => {
        const primaryTitle = primaryTitleById.get(String(category.parentId)) ?? "";
        return `${primaryTitle}:${category.title}`;
      }),
  );
  const newPrimary = new Set<string>();
  const newSecondary = new Set<string>();

  for (const row of rows) {
    if (!existingPrimary.has(row.primaryCategory)) {
      newPrimary.add(row.primaryCategory);
    }
    newSecondary.add(`${row.primaryCategory}:${row.secondaryCategory}`);
  }

  return {
    totalRowCount: rows.length,
    creatableQuickReplyCount: rows.length,
    errorCount: errors.length,
    newPrimaryCategoryCount: newPrimary.size,
    newSecondaryCategoryCount: Array.from(newSecondary).filter(
      (value) => !existingSecondary.has(value),
    ).length,
  };
}

export function buildQuickReplyCategoryEnsureRequest(
  scopeType: QuickReplyScopeType,
  rows: QuickReplyImportParsedRow[],
): WorkbenchQuickReplyCategoryEnsureRequest {
  const categories = new Map<string, Set<string>>();

  for (const row of rows) {
    categories.set(
      row.primaryCategory,
      (categories.get(row.primaryCategory) ?? new Set()).add(row.secondaryCategory),
    );
  }

  return {
    scopeType,
    categories: Array.from(categories, ([title, children]) => ({
      title,
      children: Array.from(children),
    })),
  };
}

export function assignQuickReplyImportColors(rows: QuickReplyImportParsedRow[]) {
  const colorValues = QUICK_REPLY_LABEL_COLOR_VALUES.filter((value) => value !== "");
  const labelColorByCategory = new Map<string, Map<string, string>>();

  return rows.map((row) => {
    if (!row.labelText) {
      return { ...row, labelColor: "" };
    }

    const categoryKey = `${row.primaryCategory}:${row.secondaryCategory}`;
    const categoryColors = labelColorByCategory.get(categoryKey) ?? new Map<string, string>();
    labelColorByCategory.set(categoryKey, categoryColors);

    if (!categoryColors.has(row.labelText)) {
      categoryColors.set(
        row.labelText,
        colorValues[categoryColors.size % colorValues.length] ?? "",
      );
    }

    return {
      ...row,
      labelColor: categoryColors.get(row.labelText) ?? "",
    };
  });
}

export function buildQuickReplyBatchItems(
  rows: QuickReplyImportParsedRow[],
  ensureResponse: WorkbenchQuickReplyCategoryEnsureSuccessResponse,
): WorkbenchQuickReplyBatchCreateRequest["items"] {
  const categoryIdByPath = new Map<string, string>();
  for (const category of ensureResponse.categories) {
    for (const child of category.children) {
      categoryIdByPath.set(`${category.title}:${child.title}`, child.id);
    }
  }

  return assignQuickReplyImportColors(rows).map((row) => ({
    rowNumber: row.rowNumber,
    categoryId: categoryIdByPath.get(`${row.primaryCategory}:${row.secondaryCategory}`) ?? "",
    labelText: row.labelText,
    labelColor: row.labelColor,
    contentText: row.contentText,
  }));
}

export function chunkQuickReplyImportItems<T>(
  items: T[],
  size = QUICK_REPLY_BATCH_CREATE_LIMIT,
) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}
```

- [ ] **Step 4: Run parser tests**

Run:

```bash
pnpm --filter @chatai/web test apps/web/test/pages/chat/quick-reply-import.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/chat/components/quick-reply/quick-reply-import.ts apps/web/test/pages/chat/quick-reply-import.test.ts
git commit -m "feat: parse quick reply import files"
```

## Task 5: Add Frontend Service And Hook Orchestration

**Files:**
- Modify: `apps/web/src/pages/chat/api/workbench-service.ts`
- Modify: `apps/web/src/pages/chat/hooks/use-quick-replies.ts`
- Test: `apps/web/test/pages/chat/workbench-service.test.ts`
- Test: `apps/web/test/pages/chat/use-quick-replies.test.tsx`

- [ ] **Step 1: Write failing service adapter tests**

In `apps/web/test/pages/chat/workbench-service.test.ts`, add:

```ts
it("posts quick reply import ensure and batch requests", async () => {
  const service = createWorkbenchService();

  mock.onPost("/server/quick-replies/categories/ensure").reply((config) => [
    200,
    {
      ok: true,
      categories: [],
      summary: {
        createdPrimaryCategoryCount: 0,
        createdSecondaryCategoryCount: 0,
      },
    },
  ]);
  mock.onPost("/server/quick-replies/batch").reply((config) => [
    200,
    {
      ok: true,
      summary: { createdQuickReplyCount: 1 },
    },
  ]);

  await service.ensureQuickReplyCategories({ scopeType: 1, categories: [] });
  await service.batchCreateQuickReplies({
    scopeType: 1,
    items: [
      {
        rowNumber: 2,
        categoryId: "11",
        labelText: "",
        labelColor: "",
        contentText: "您好",
      },
    ],
  });

  expect(mock.history.post.map((request) => request.url)).toEqual([
    "/server/quick-replies/categories/ensure",
    "/server/quick-replies/batch",
  ]);
});
```

- [ ] **Step 2: Write failing hook orchestration test**

In `apps/web/test/pages/chat/use-quick-replies.test.tsx`, add:

```ts
it("imports quick replies by ensuring categories then posting 100-item batches", async () => {
  const ensureQuickReplyCategories = vi.fn().mockResolvedValue({
    ok: true,
    categories: [
      {
        id: "10",
        title: "售前",
        children: [{ id: "11", title: "开场" }],
      },
    ],
    summary: {
      createdPrimaryCategoryCount: 1,
      createdSecondaryCategoryCount: 1,
    },
  });
  const batchCreateQuickReplies = vi.fn().mockResolvedValue({
    ok: true,
    summary: { createdQuickReplyCount: 100 },
  });
  const service = createQuickReplyTestService({
    batchCreateQuickReplies,
    ensureQuickReplyCategories,
  });
  setWorkbenchService(service);

  const { result } = renderHook(() => useQuickReplies(), { wrapper });
  await waitFor(() => expect(result.current.isLoading).toBe(false));

  const rows = Array.from({ length: 101 }, (_, index) => ({
    rowNumber: index + 2,
    primaryCategory: "售前",
    secondaryCategory: "开场",
    labelText: "开场",
    contentText: `话术${index}`,
  }));

  await act(async () => {
    const response = await result.current.importQuickReplies(rows);
    expect(response).toEqual({ ok: true, importedCount: 101 });
  });

  expect(ensureQuickReplyCategories).toHaveBeenCalledOnce();
  expect(batchCreateQuickReplies).toHaveBeenCalledTimes(2);
});
```

Use the local service factory and wrapper names already present in `use-quick-replies.test.tsx`.

- [ ] **Step 3: Run frontend service and hook tests and verify failure**

Run:

```bash
pnpm --filter @chatai/web test apps/web/test/pages/chat/workbench-service.test.ts apps/web/test/pages/chat/use-quick-replies.test.tsx
```

Expected: FAIL because the service methods and hook action do not exist.

- [ ] **Step 4: Extend `WorkbenchService` and HTTP adapter**

In `apps/web/src/pages/chat/api/workbench-service.ts`, import the new types and add methods to `WorkbenchService`:

```ts
ensureQuickReplyCategories: (
  request: WorkbenchQuickReplyCategoryEnsureRequest,
) => Promise<WorkbenchQuickReplyCategoryEnsureResponse>;
batchCreateQuickReplies: (
  request: WorkbenchQuickReplyBatchCreateRequest,
) => Promise<WorkbenchQuickReplyBatchCreateResponse>;
```

Add HTTP adapter methods:

```ts
ensureQuickReplyCategories(request) {
  return http.post<
    WorkbenchQuickReplyCategoryEnsureResponse,
    WorkbenchQuickReplyCategoryEnsureRequest
  >("/server/quick-replies/categories/ensure", request);
},
batchCreateQuickReplies(request) {
  return http.post<
    WorkbenchQuickReplyBatchCreateResponse,
    WorkbenchQuickReplyBatchCreateRequest
  >("/server/quick-replies/batch", request);
},
```

Add matching mock service methods that mutate `state.quickReplyCategories` and `state.quickReplies` using the same sorting helpers as `createQuickReplyCategory` and `createQuickReply`.

- [ ] **Step 5: Add hook import action**

In `apps/web/src/pages/chat/hooks/use-quick-replies.ts`, import:

```ts
import {
  buildQuickReplyBatchItems,
  buildQuickReplyCategoryEnsureRequest,
  chunkQuickReplyImportItems,
  type QuickReplyImportParsedRow,
} from "@/pages/chat/components/quick-reply/quick-reply-import";
```

Add:

```ts
const importQuickReplies = useCallback(
  async (
    rows: QuickReplyImportParsedRow[],
    onProgress?: (input: { importedCount: number; totalCount: number; progress: number }) => void,
  ) => {
    setIsMutating(true);

    try {
      const ensureResponse = await getWorkbenchService().ensureQuickReplyCategories(
        buildQuickReplyCategoryEnsureRequest(activeScopeType, rows),
      );

      if (!ensureResponse.ok) {
        return {
          ok: false as const,
          errorMsg: ensureResponse.errorMsg,
          errors: ensureResponse.errors ?? [],
          importedCount: 0,
        };
      }

      const items = buildQuickReplyBatchItems(rows, ensureResponse);
      const chunks = chunkQuickReplyImportItems(items);
      let importedCount = 0;

      onProgress?.({ importedCount, totalCount: items.length, progress: 10 });

      for (const chunk of chunks) {
        const response = await getWorkbenchService().batchCreateQuickReplies({
          scopeType: activeScopeType,
          items: chunk,
        });

        if (!response.ok) {
          return {
            ok: false as const,
            errorMsg: response.errorMsg,
            errors: response.errors ?? [],
            importedCount,
          };
        }

        importedCount += response.summary.createdQuickReplyCount;
        onProgress?.({
          importedCount,
          totalCount: items.length,
          progress: 10 + Math.floor((importedCount / items.length) * 90),
        });
      }

      await loadQuickReplies();
      return { ok: true as const, importedCount };
    } finally {
      setIsMutating(false);
    }
  },
  [activeScopeType, loadQuickReplies],
);
```

Return `importQuickReplies` from the hook memo.

- [ ] **Step 6: Run frontend orchestration tests**

Run:

```bash
pnpm --filter @chatai/web test apps/web/test/pages/chat/workbench-service.test.ts apps/web/test/pages/chat/use-quick-replies.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/pages/chat/api/workbench-service.ts apps/web/src/pages/chat/hooks/use-quick-replies.ts apps/web/test/pages/chat/workbench-service.test.ts apps/web/test/pages/chat/use-quick-replies.test.tsx
git commit -m "feat: orchestrate quick reply imports"
```

## Task 6: Add Import Dialog UI

**Files:**
- Create: `apps/web/src/pages/chat/components/quick-reply/quick-reply-import-dialog.tsx`
- Modify: `apps/web/src/pages/chat/components/quick-reply/quick-reply-panel.tsx`
- Modify: `apps/web/src/pages/chat/chat-workbench-page.tsx`
- Test: `apps/web/test/pages/chat/quick-reply-panel.test.tsx`

- [ ] **Step 1: Write failing UI tests**

In `apps/web/test/pages/chat/quick-reply-panel.test.tsx`, add:

```tsx
it("opens the quick reply import dialog from the toolbar", async () => {
  const user = userEvent.setup();
  render(<QuickReplyPanel {...createPanelProps()} />);

  await user.click(screen.getByRole("button", { name: "导入话术" }));

  expect(screen.getByRole("dialog", { name: "导入话术" })).toBeInTheDocument();
});

it("disables import submit when precheck has errors", async () => {
  const user = userEvent.setup();
  render(<QuickReplyPanel {...createPanelProps()} />);

  await user.click(screen.getByRole("button", { name: "导入话术" }));

  expect(screen.getByText("请选择 .xlsx 文件")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "开始导入" })).toBeDisabled();
});
```

- [ ] **Step 2: Run UI tests and verify failure**

Run:

```bash
pnpm --filter @chatai/web test apps/web/test/pages/chat/quick-reply-panel.test.tsx
```

Expected: FAIL because the import dialog does not exist.

- [ ] **Step 3: Create dialog component**

Create `apps/web/src/pages/chat/components/quick-reply/quick-reply-import-dialog.tsx`:

```tsx
import { useRef, useState } from "react";
import type {
  QuickReplyScopeType,
  WorkbenchQuickReplyCategoryDto,
} from "@chatai/contracts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  parseQuickReplyImportFile,
  type QuickReplyImportParsedRow,
  type QuickReplyImportPrecheck,
} from "@/pages/chat/components/quick-reply/quick-reply-import";

type QuickReplyImportDialogProps = {
  categories: WorkbenchQuickReplyCategoryDto[];
  onImport: (
    rows: QuickReplyImportParsedRow[],
    onProgress: (input: { importedCount: number; totalCount: number; progress: number }) => void,
  ) => Promise<
    | { ok: true; importedCount: number }
    | {
        ok: false;
        errorMsg: string;
        errors: Array<{ rowNumber: number; message: string }>;
        importedCount: number;
      }
  >;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  scopeType: QuickReplyScopeType;
};

export function QuickReplyImportDialog({
  categories,
  onImport,
  onOpenChange,
  open,
}: QuickReplyImportDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [precheck, setPrecheck] = useState<QuickReplyImportPrecheck | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [resultText, setResultText] = useState("");

  const handleFileChange = async (file: File | undefined) => {
    if (!file) return;
    setIsParsing(true);
    setResultText("");
    try {
      if (!file.name.endsWith(".xlsx")) {
        setPrecheck({
          ok: false,
          rows: [],
          errors: [{ rowNumber: 0, message: "仅支持 .xlsx 文件" }],
          summary: {
            totalRowCount: 0,
            creatableQuickReplyCount: 0,
            errorCount: 1,
            newPrimaryCategoryCount: 0,
            newSecondaryCategoryCount: 0,
          },
        });
        return;
      }
      setPrecheck(await parseQuickReplyImportFile(file, categories));
    } finally {
      setIsParsing(false);
    }
  };

  const handleImport = async () => {
    if (!precheck?.ok) return;
    setIsImporting(true);
    setProgress(0);
    const response = await onImport(precheck.rows, (next) => setProgress(next.progress));
    setIsImporting(false);

    if (response.ok) {
      setProgress(100);
      setResultText(`导入完成，共导入 ${response.importedCount} 条话术`);
      return;
    }

    setResultText(`导入中断，已成功导入 ${response.importedCount} 条，请检查后重试`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[640px]">
        <DialogHeader>
          <DialogTitle>导入话术</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <input
            ref={inputRef}
            accept=".xlsx"
            className="sr-only"
            onChange={(event) => void handleFileChange(event.target.files?.[0])}
            type="file"
          />
          <Button
            disabled={isParsing || isImporting}
            onClick={() => inputRef.current?.click()}
            type="button"
            variant="outline"
          >
            选择文件
          </Button>

          {!precheck ? <p className="text-sm text-muted-foreground">请选择 .xlsx 文件</p> : null}

          {precheck ? (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-3 gap-2">
                <div>可导入 {precheck.summary.creatableQuickReplyCount} 条</div>
                <div>新建一级 {precheck.summary.newPrimaryCategoryCount} 个</div>
                <div>新建二级 {precheck.summary.newSecondaryCategoryCount} 个</div>
              </div>
              {precheck.errors.length ? (
                <ScrollArea className="max-h-40 rounded-[6px] border p-2">
                  {precheck.errors.map((error, index) => (
                    <div key={`${error.rowNumber}-${index}`}>
                      第 {error.rowNumber} 行：{error.message}
                    </div>
                  ))}
                </ScrollArea>
              ) : (
                <div>确认导入 {precheck.summary.creatableQuickReplyCount} 条话术？</div>
              )}
            </div>
          ) : null}

          {isImporting ? (
            <div className="space-y-2">
              <Progress value={progress} />
              <div className="text-sm text-muted-foreground">正在导入 {progress}%</div>
            </div>
          ) : null}

          {resultText ? <div className="text-sm">{resultText}</div> : null}
        </div>

        <DialogFooter>
          <Button
            disabled={isImporting}
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            关闭
          </Button>
          <Button
            disabled={!precheck?.ok || isParsing || isImporting}
            onClick={() => void handleImport()}
            type="button"
          >
            开始导入
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Add toolbar button and props**

In `QuickReplyPanelProps`, add:

```ts
onImportQuickReplies: React.ComponentProps<typeof QuickReplyImportDialog>["onImport"];
```

Import `Upload01Icon` and `Tooltip` primitives used elsewhere in the project, add local state:

```tsx
const [importDialogOpen, setImportDialogOpen] = useState(false);
```

Change the toolbar grid to three columns and add the icon button after search:

```tsx
<Button
  aria-label="导入话术"
  className="size-8 shrink-0 rounded-[6px] p-0"
  disabled={isMutating}
  onClick={() => setImportDialogOpen(true)}
  size="icon"
  type="button"
  variant="ghost"
>
  <HugeiconsIcon aria-hidden="true" icon={Upload01Icon} size={16} strokeWidth={1.8} />
</Button>
```

Render:

```tsx
<QuickReplyImportDialog
  categories={categories}
  onImport={onImportQuickReplies}
  onOpenChange={setImportDialogOpen}
  open={importDialogOpen}
  scopeType={activeScopeType}
/>
```

In `chat-workbench-page.tsx`, pass:

```tsx
onImportQuickReplies={quickReplies.importQuickReplies}
```

- [ ] **Step 5: Run UI tests**

Run:

```bash
pnpm --filter @chatai/web test apps/web/test/pages/chat/quick-reply-panel.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/chat/components/quick-reply/quick-reply-import-dialog.tsx apps/web/src/pages/chat/components/quick-reply/quick-reply-panel.tsx apps/web/src/pages/chat/chat-workbench-page.tsx apps/web/test/pages/chat/quick-reply-panel.test.tsx
git commit -m "feat: add quick reply import dialog"
```

## Task 7: Full Verification

**Files:**
- Verify all touched files.

- [ ] **Step 1: Run targeted tests**

Run:

```bash
pnpm --filter @chatai/contracts test test/chat-quick-reply-dto.test.ts
pnpm --filter @chatai/backend test apps/backend/test/modules/chat/workbench.service.test.ts apps/backend/test/app.test.ts -- --runInBand
pnpm --filter @chatai/web test apps/web/test/pages/chat/quick-reply-import.test.ts apps/web/test/pages/chat/workbench-service.test.ts apps/web/test/pages/chat/use-quick-replies.test.tsx apps/web/test/pages/chat/quick-reply-panel.test.tsx
```

Expected: all targeted tests pass.

- [ ] **Step 2: Run required builds**

Because this changes contracts, backend, and web, run:

```bash
pnpm contracts:build
pnpm backend:build
pnpm --filter @chatai/web build
```

Expected: all builds pass.

- [ ] **Step 3: Run repository whitespace check**

Run:

```bash
git diff --check
```

Expected: no output.

- [ ] **Step 4: Final commit**

If previous tasks were not committed individually, commit the remaining changes:

```bash
git add apps packages docs pnpm-lock.yaml
git commit -m "feat: support quick reply excel import"
```

## Self-Review

- Spec coverage: the plan covers strict `.xlsx` parsing, exact headers, blank-row errors, 10-character category names, frontend precheck, `200 + ok:false` business validation, non-concurrent ensure idempotency, existing write permissions, 100-item batches, progress, failure stop, and refresh.
- Placeholder scan: no task uses deferred or undefined follow-up work.
- Type consistency: DTO names are introduced in Task 1 and reused by backend, web service, hook, and parser tasks.
