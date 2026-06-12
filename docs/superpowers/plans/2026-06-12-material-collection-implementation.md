# Material Collection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real collection, grouping, and management for expression, file, mini-program, and H5 materials in the ChatAI workbench, while keeping composer material sending as an alert-only interim behavior.

**Architecture:** Add shared material collection contracts, backend DB/repository/service/routes under the existing chat workbench boundary, and frontend service/UI components that reuse existing message card renderers. The backend stores original `xy_wap_embed_msg_audit_info.content` and exposes normalized content DTOs for existing web renderers.

**Tech Stack:** pnpm workspace, TypeScript, TypeBox contracts, Fastify 5, Kysely/MySQL, React 19, React Router v7, Vitest, Testing Library, shadcn/ui, Hugeicons, Zustand/workbench page state.

---

## Scope

In scope:

- Collection from message avatar `...` menu for expression, file, mini-program, and H5 messages.
- Real DB-backed collection records and custom groups.
- Personal expression materials with `sub_uid = current sub user id`.
- Shared enterprise file, mini-program, and H5 materials with `sub_uid = 0`.
- Default group represented by `group_id = 0`, without a group table row.
- Group create, rename, top, and delete with non-empty delete rejection.
- Material delete, top, and move to another group.
- Composer toolbar material entry points.
- Expression collection merged into the existing WeChat emoji panel.
- File, mini-program, and H5 material modal.
- Clicking collected materials shows an alert and does not call the send-message API.

Out of scope:

- Custom expression upload.
- Drag sorting or arbitrary insert positioning.
- Real sending for collected materials.
- New role or permission model beyond existing chat send/write access.

## Existing Context

- Design spec: `docs/superpowers/specs/2026-06-12-material-collection-design.md`
- Current generated DB types already include `xy_wap_embed_material_collection.msgid: string` and `sort` on both new tables.
- `docs/db/schema.sql` currently has new table DDL in the worktree; implementation should inspect and preserve the user's DDL changes.
- `apps/backend/scripts/codegen-db.config.json` already includes both new tables in the worktree.
- `apps/backend/src/db/writable-tables.ts` still needs both new tables added before backend writes.
- All business URLs must stay under `/api/server/*`; web calls must go through `apps/web/src/pages/chat/api/workbench-service.ts`.

## Planned Commits

1. `docs: align material collection design and plan`
2. `feat(contracts): add material collection contracts`
3. `feat(backend): add material collection repository`
4. `feat(backend): add material collection service and routes`
5. `feat(web): add material collection API adapter`
6. `feat(web): add material collection picker components`
7. `feat(web): wire material collection into chat workbench`
8. `test: verify material collection flows`

## File Structure

Contracts:

- Modify `packages/contracts/src/chat/enums.ts` for `MATERIAL_COLLECTION_BIZ_TYPE` constants and TypeBox schema.
- Modify `packages/contracts/src/chat/dto.ts` for request/response DTOs.
- Modify `packages/contracts/test/chat-material-collection-dto.test.ts` for contract shape tests.

Backend:

- Modify `apps/backend/src/db/writable-tables.ts` to allow writes to the two new application tables.
- Keep the user's existing changes in `apps/backend/scripts/codegen-db.config.json`, `apps/backend/src/db/schema.ts`, and `docs/db/schema.sql`.
- Create `apps/backend/src/modules/chat/material-collection-mappers.ts` for biz-type mapping, message content normalization, title extraction, and row-to-DTO mapping.
- Modify `apps/backend/src/modules/chat/workbench-repository.ts` to add material collection reads/writes.
- Modify `apps/backend/src/modules/chat/workbench.service.ts` to add service methods and permission-scoped business validation.
- Modify `apps/backend/src/modules/chat/chat.routes.ts` to expose `/api/server/material-collections/*`.
- Modify `apps/backend/test/modules/chat/material-collection-mappers.test.ts`.
- Modify `apps/backend/test/modules/chat/workbench-repository.test.ts`.
- Modify `apps/backend/test/modules/chat/workbench.service.test.ts`.
- Modify `apps/backend/test/app.test.ts` and `apps/backend/test/fixtures/workbench-memory.service.ts` for route tests.

Web API and state:

- Modify `apps/web/src/pages/chat/api/workbench-service.ts` for HTTP and mock material methods.
- Modify `apps/web/src/pages/chat/api/workbench-gateway.ts` only if the page should call gateway wrappers rather than service methods directly.
- Modify `apps/web/test/pages/chat/workbench-service.test.ts`.

Web UI:

- Create `apps/web/src/pages/chat/components/material-collection/material-types.ts`.
- Create `apps/web/src/pages/chat/components/material-collection/material-card.tsx`.
- Create `apps/web/src/pages/chat/components/material-collection/material-group-select-dialog.tsx`.
- Create `apps/web/src/pages/chat/components/material-collection/material-library-dialog.tsx`.
- Create `apps/web/src/pages/chat/components/material-collection/material-expression-section.tsx`.
- Modify `apps/web/src/pages/chat/components/wechat-emoji-picker.tsx`.
- Modify `apps/web/src/pages/chat/components/chat-composer.tsx`.
- Modify `apps/web/src/pages/chat/components/message-feed.tsx`.
- Modify `apps/web/src/pages/chat/components/chat-panel.tsx`.
- Modify `apps/web/src/pages/chat/chat-workbench-page.tsx`.
- Add focused tests under `apps/web/test/pages/chat/material-collection*.test.tsx` and extend `message-feed.test.tsx`, `chat-workbench-composer.int.test.tsx`, and `workbench-service.test.ts`.

---

## Task 1: Align Schema Boundary And Design Doc

**Files:**

- Modify: `docs/superpowers/specs/2026-06-12-material-collection-design.md`
- Modify: `apps/backend/src/db/writable-tables.ts`
- Inspect only: `docs/db/schema.sql`
- Inspect only: `apps/backend/src/db/schema.ts`
- Inspect only: `apps/backend/scripts/codegen-db.config.json`

- [ ] **Step 1: Confirm design doc uses `msgid`**

Run:

```bash
rg -n "msg_id|msgid" docs/superpowers/specs/2026-06-12-material-collection-design.md
```

Expected: only `msgid` appears for material collection fields and uniqueness text.

- [ ] **Step 2: Add writable table entries**

In `apps/backend/src/db/writable-tables.ts`, add the two new tables near other application-owned `xy_wap_embed_*` writes:

```ts
  "xy_wap_embed_material_collection",
  "xy_wap_embed_material_collection_group",
```

Do not remove any existing entries.

- [ ] **Step 3: Check schema DDL for hidden whitespace and table style**

Run:

```bash
python3 - <<'PY'
from pathlib import Path
p = Path("docs/db/schema.sql")
text = p.read_text()
for i, line in enumerate(text.splitlines(), 1):
    if "\u00a0" in line:
        print(f"NBSP at line {i}: {line!r}")
PY
```

Expected: no output. If output shows the blank line between the new material tables contains NBSP, replace it with a normal blank line.

- [ ] **Step 4: Verify generated schema matches required fields**

Run:

```bash
rg -n "XyWapEmbedMaterialCollection|msgid|sort|XyWapEmbedMaterialCollectionGroup" apps/backend/src/db/schema.ts
```

Expected: material collection has `msgid: Generated<string>` and `sort: Generated<number>`; group has `sort: Generated<number>`.

- [ ] **Step 5: Run diff checks**

Run:

```bash
git diff --check
```

Expected: no output.

- [ ] **Step 6: Commit schema boundary and doc alignment**

Stage only the design doc, writable table change, and the schema/codegen/schema.sql files that are intentionally part of the user's current schema update:

```bash
git status --short
git add docs/superpowers/specs/2026-06-12-material-collection-design.md \
  docs/superpowers/plans/2026-06-12-material-collection-implementation.md \
  apps/backend/src/db/writable-tables.ts \
  apps/backend/scripts/codegen-db.config.json \
  apps/backend/src/db/schema.ts \
  docs/db/schema.sql
git diff --cached --check
git commit -m "docs: align material collection design and schema"
```

Expected: commit contains no unrelated files.

---

## Task 2: Contracts

**Files:**

- Modify: `packages/contracts/src/chat/enums.ts`
- Modify: `packages/contracts/src/chat/dto.ts`
- Create: `packages/contracts/test/chat-material-collection-dto.test.ts`

- [ ] **Step 1: Write failing contract tests**

Create `packages/contracts/test/chat-material-collection-dto.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  MATERIAL_COLLECTION_BIZ_TYPE,
  type MaterialCollectionBizType,
  type WorkbenchMaterialCollectionItemDto,
  type WorkbenchMaterialCollectionListResponse,
  type WorkbenchMaterialCollectionCreateRequest,
  type WorkbenchMaterialCollectionGroupDto,
} from "../src/index";

describe("material collection contracts", () => {
  it("defines stable biz type values", () => {
    expect(MATERIAL_COLLECTION_BIZ_TYPE).toEqual({
      EXPRESSION: 1,
      FILE: 2,
      MINI_PROGRAM: 3,
      H5: 4,
    });
  });

  it("types material list items with normalized content", () => {
    const item: WorkbenchMaterialCollectionItemDto = {
      bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
      content: {
        extension: "pdf",
        fileName: "报价单.pdf",
        fileSizeLabel: "1.2M",
        sourceLabel: "文件",
      },
      contentType: "file",
      createdAt: 1_781_244_000_000,
      groupId: 0,
      id: "1001",
      messageId: "msg-file-001",
      sort: 1_781_244_000_000,
      title: "报价单.pdf",
      updatedAt: 1_781_244_000_000,
    };
    const response: WorkbenchMaterialCollectionListResponse = {
      groups: [],
      items: [item],
    };

    expect(response.items[0]?.messageId).toBe("msg-file-001");
  });

  it("types group and create requests", () => {
    const bizType: MaterialCollectionBizType = MATERIAL_COLLECTION_BIZ_TYPE.H5;
    const group: WorkbenchMaterialCollectionGroupDto = {
      bizType,
      id: "12",
      sort: 1_781_244_000_000,
      title: "售后链接",
    };
    const request: WorkbenchMaterialCollectionCreateRequest = {
      bizType,
      groupId: group.id,
      messageId: "msg-link-001",
    };

    expect(request.groupId).toBe("12");
  });
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
pnpm --filter @chatai/contracts test packages/contracts/test/chat-material-collection-dto.test.ts
```

Expected: fail because the new exports are missing.

- [ ] **Step 3: Add enums**

In `packages/contracts/src/chat/enums.ts`, add:

```ts
export const MATERIAL_COLLECTION_BIZ_TYPE = {
  EXPRESSION: 1,
  FILE: 2,
  MINI_PROGRAM: 3,
  H5: 4,
} as const;

export const MaterialCollectionBizTypeSchema = Type.Union([
  Type.Literal(MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION),
  Type.Literal(MATERIAL_COLLECTION_BIZ_TYPE.FILE),
  Type.Literal(MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM),
  Type.Literal(MATERIAL_COLLECTION_BIZ_TYPE.H5),
]);

export type MaterialCollectionBizType =
  Static<typeof MaterialCollectionBizTypeSchema>;
```

- [ ] **Step 4: Add DTO types**

In `packages/contracts/src/chat/dto.ts`, import `MaterialCollectionBizType` and add:

```ts
export type WorkbenchMaterialCollectionGroupDto = {
  bizType: MaterialCollectionBizType;
  id: string;
  sort: number;
  title: string;
};

export type WorkbenchMaterialCollectionItemDto = {
  bizType: MaterialCollectionBizType;
  content: Record<string, unknown>;
  contentType: Extract<
    WorkbenchMessageContentType,
    "emotion" | "file" | "h5" | "mini-program"
  >;
  createdAt?: number;
  groupId: string | 0;
  id: string;
  messageId: string;
  sort: number;
  title: string;
  updatedAt?: number;
};

export type WorkbenchMaterialCollectionListRequest = {
  bizType: MaterialCollectionBizType;
  groupId?: string | 0;
};

export type WorkbenchMaterialCollectionListResponse = {
  groups: WorkbenchMaterialCollectionGroupDto[];
  items: WorkbenchMaterialCollectionItemDto[];
};

export type WorkbenchMaterialCollectionCreateRequest = {
  bizType: MaterialCollectionBizType;
  groupId?: string | 0;
  messageId: string;
};

export type WorkbenchMaterialCollectionCreateResponse = {
  duplicated?: boolean;
  item: WorkbenchMaterialCollectionItemDto;
};

export type WorkbenchMaterialCollectionGroupCreateRequest = {
  bizType: Exclude<MaterialCollectionBizType, 1>;
  title: string;
};

export type WorkbenchMaterialCollectionGroupUpdateRequest = {
  title: string;
};

export type WorkbenchMaterialCollectionMoveRequest = {
  groupId: string | 0;
};

export type WorkbenchMaterialCollectionOkResponse = {
  ok: true;
};
```

- [ ] **Step 5: Run contract tests and build**

Run:

```bash
pnpm --filter @chatai/contracts test packages/contracts/test/chat-material-collection-dto.test.ts
pnpm --filter @chatai/contracts build
```

Expected: both pass.

- [ ] **Step 6: Commit contracts**

```bash
git add packages/contracts/src/chat/enums.ts packages/contracts/src/chat/dto.ts packages/contracts/test/chat-material-collection-dto.test.ts
git diff --cached --check
git commit -m "feat(contracts): add material collection contracts"
```

---

## Task 3: Backend Mapper Utilities

**Files:**

- Create: `apps/backend/src/modules/chat/material-collection-mappers.ts`
- Create: `apps/backend/test/modules/chat/material-collection-mappers.test.ts`

- [ ] **Step 1: Write failing mapper tests**

Create `apps/backend/test/modules/chat/material-collection-mappers.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { MATERIAL_COLLECTION_BIZ_TYPE } from "@chatai/contracts";
import {
  getMaterialBizTypeForMessageContentType,
  getMaterialContentTypeForBizType,
  mapMaterialCollectionItem,
} from "../../../src/modules/chat/material-collection-mappers.js";

describe("material collection mappers", () => {
  it("maps supported content types to biz types", () => {
    expect(getMaterialBizTypeForMessageContentType("emotion")).toBe(
      MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION,
    );
    expect(getMaterialBizTypeForMessageContentType("file")).toBe(
      MATERIAL_COLLECTION_BIZ_TYPE.FILE,
    );
    expect(getMaterialBizTypeForMessageContentType("mini-program")).toBe(
      MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM,
    );
    expect(getMaterialBizTypeForMessageContentType("h5")).toBe(
      MATERIAL_COLLECTION_BIZ_TYPE.H5,
    );
    expect(getMaterialBizTypeForMessageContentType("text")).toBeUndefined();
  });

  it("maps biz type to content type", () => {
    expect(getMaterialContentTypeForBizType(MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION)).toBe("emotion");
    expect(getMaterialContentTypeForBizType(MATERIAL_COLLECTION_BIZ_TYPE.FILE)).toBe("file");
    expect(getMaterialContentTypeForBizType(MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM)).toBe("mini-program");
    expect(getMaterialContentTypeForBizType(MATERIAL_COLLECTION_BIZ_TYPE.H5)).toBe("h5");
  });

  it("normalizes file collection content from raw message content", () => {
    expect(
      mapMaterialCollectionItem({
        biz_status: 1,
        biz_type: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
        content: JSON.stringify({
          fileExt: "pdf",
          fileName: "报价单.pdf",
          fileSize: 1048576,
          fileUrl: "docs/quote.pdf",
        }),
        create_time: new Date("2026-06-12T01:00:00.000Z"),
        group_id: 0,
        id: 1001,
        msgid: "msg-file-001",
        op_sub_uid: 101,
        sort: 1781240000000,
        sub_uid: 0,
        title: "报价单.pdf",
        uid: 9001,
        update_time: new Date("2026-06-12T02:00:00.000Z"),
      }),
    ).toMatchObject({
      bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
      contentType: "file",
      groupId: 0,
      id: "1001",
      messageId: "msg-file-001",
      title: "报价单.pdf",
      content: {
        extension: "pdf",
        fileName: "报价单.pdf",
        sourceLabel: "文件",
      },
    });
  });
});
```

- [ ] **Step 2: Run failing mapper test**

```bash
pnpm --filter @chatai/backend test apps/backend/test/modules/chat/material-collection-mappers.test.ts
```

Expected: fail because the mapper file is missing.

- [ ] **Step 3: Implement mapper utilities**

Create `apps/backend/src/modules/chat/material-collection-mappers.ts` with:

```ts
import {
  MATERIAL_COLLECTION_BIZ_TYPE,
  type MaterialCollectionBizType,
  type WorkbenchMaterialCollectionItemDto,
  type WorkbenchMessageContentType,
} from "@chatai/contracts";
import type { Selectable } from "kysely";
import type { XyWapEmbedMaterialCollection } from "../../db/schema.js";
import { parseJsonRecord } from "./workbench-content-utils.js";
import { mapMessageRow } from "./workbench-mappers.js";

export type MaterialCollectionRow = Selectable<XyWapEmbedMaterialCollection>;

const CONTENT_TYPE_BY_BIZ_TYPE = {
  [MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION]: "emotion",
  [MATERIAL_COLLECTION_BIZ_TYPE.FILE]: "file",
  [MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM]: "mini-program",
  [MATERIAL_COLLECTION_BIZ_TYPE.H5]: "h5",
} as const satisfies Record<MaterialCollectionBizType, WorkbenchMessageContentType>;

export function getMaterialContentTypeForBizType(
  bizType: MaterialCollectionBizType,
) {
  return CONTENT_TYPE_BY_BIZ_TYPE[bizType];
}

export function getMaterialBizTypeForMessageContentType(
  contentType: WorkbenchMessageContentType,
) {
  switch (contentType) {
    case "emotion":
      return MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION;
    case "file":
      return MATERIAL_COLLECTION_BIZ_TYPE.FILE;
    case "mini-program":
      return MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM;
    case "h5":
      return MATERIAL_COLLECTION_BIZ_TYPE.H5;
    default:
      return undefined;
  }
}

export function mapMaterialCollectionItem(
  row: MaterialCollectionRow,
): WorkbenchMaterialCollectionItemDto {
  const contentType = getMaterialContentTypeForBizType(row.biz_type as MaterialCollectionBizType);
  const normalized = mapMessageRow({
    chat_type: 1,
    content: row.content,
    conversation_external_id: "",
    conversation_group_id: "",
    conversation_id: 0,
    from_type: 1,
    id: 0,
    msgid: row.msgid,
    msgtime: row.create_time,
    msgtype: reverseMaterialMessageType(contentType),
    opt_no: null,
    platform: 0,
    revoke_status: 0,
    seat_id: 0,
    status: 1,
    third_external_id: "",
    third_from_id: "",
    third_group_id: "",
    third_user_id: "",
    uid: row.uid,
  }).content;

  return {
    bizType: row.biz_type as MaterialCollectionBizType,
    content: normalized as unknown as Record<string, unknown>,
    contentType,
    createdAt: toTimestamp(row.create_time),
    groupId: row.group_id === 0 ? 0 : String(row.group_id),
    id: String(row.id),
    messageId: row.msgid,
    sort: Number(row.sort),
    title: row.title,
    updatedAt: toTimestamp(row.update_time),
  };
}

export function readMaterialTitle(input: {
  bizType: MaterialCollectionBizType;
  content: string | null;
}) {
  const parsed = parseJsonRecord(input.content);
  if (input.bizType === MATERIAL_COLLECTION_BIZ_TYPE.FILE) {
    return readString(parsed.fileName) || "文件";
  }
  if (input.bizType === MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM) {
    return readString(parsed.description) || readString(parsed.title) || "小程序";
  }
  if (input.bizType === MATERIAL_COLLECTION_BIZ_TYPE.H5) {
    return readString(parsed.title) || "H5链接";
  }
  return "表情";
}

function reverseMaterialMessageType(contentType: WorkbenchMessageContentType) {
  if (contentType === "mini-program") {
    return "weapp";
  }
  if (contentType === "h5") {
    return "link";
  }
  return contentType;
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function toTimestamp(value: Date | number | string | null | undefined) {
  if (value instanceof Date) {
    return value.getTime();
  }
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : undefined;
}
```

If `mapMessageRow` requires extra row fields in the current tree, add the smallest missing defaults in this mapper rather than duplicating content parsing.

- [ ] **Step 4: Run mapper tests**

```bash
pnpm --filter @chatai/backend test apps/backend/test/modules/chat/material-collection-mappers.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit mapper**

```bash
git add apps/backend/src/modules/chat/material-collection-mappers.ts apps/backend/test/modules/chat/material-collection-mappers.test.ts
git diff --cached --check
git commit -m "feat(backend): add material collection mappers"
```

---

## Task 4: Backend Repository

**Files:**

- Modify: `apps/backend/src/modules/chat/workbench-repository.ts`
- Modify: `apps/backend/test/modules/chat/workbench-repository.test.ts`

- [ ] **Step 1: Write failing repository tests**

Append tests to `apps/backend/test/modules/chat/workbench-repository.test.ts` for:

```ts
it("lists material groups by tenant, biz type, and shared visibility", async () => {
  const db = createMaterialDb({
    groups: [
      { id: 3, uid: 9001, sub_uid: 0, biz_type: 2, title: "文件组", sort: 200, biz_status: 1 },
    ],
  });
  const repository = new WorkbenchRepository(db as never);

  await expect(repository.listMaterialGroups({
    bizType: 2,
    subUserId: "101",
    uid: 9001,
  })).resolves.toEqual([
    { bizType: 2, id: "3", sort: 200, title: "文件组" },
  ]);
});

it("rejects deleting non-empty material groups", async () => {
  const db = createMaterialDb({ materialCount: 1 });
  const repository = new WorkbenchRepository(db as never);

  await expect(repository.isMaterialGroupEmpty({
    bizType: 2,
    groupId: "3",
    uid: 9001,
  })).resolves.toBe(false);
});
```

Add a small `createMaterialDb()` helper near existing DB helpers. It must record selected tables, wheres, inserts, and updates like existing query-builder tests.

- [ ] **Step 2: Run failing repository tests**

```bash
pnpm --filter @chatai/backend test apps/backend/test/modules/chat/workbench-repository.test.ts -t "material"
```

Expected: fail because repository methods are missing.

- [ ] **Step 3: Add repository types**

In `apps/backend/src/modules/chat/workbench-repository.ts`, import material contract types and add method input types:

```ts
type MaterialVisibilityScope = {
  bizType: number;
  subUserId: string;
  uid: number;
};

type MaterialCollectionWriteScope = {
  bizType: number;
  subUid: number;
  uid: number;
};
```

- [ ] **Step 4: Implement repository reads**

Add methods:

```ts
async listMaterialGroups(input: MaterialVisibilityScope) { ... }
async listMaterialCollections(input: MaterialVisibilityScope & { groupId?: string | 0 }) { ... }
async findMaterialMessage(input: { msgid: string; uid: number }) { ... }
async findMaterialCollectionByMessage(input: MaterialCollectionWriteScope & { msgid: string }) { ... }
async isMaterialGroupEmpty(input: { bizType: number; groupId: string; uid: number }) { ... }
```

Rules:

- Groups are `biz_status = 1`, `uid`, `biz_type`, `sub_uid in [0, current sub user id]`, sorted by `sort desc, id desc`.
- Collections are `biz_status = 1`, `uid`, `biz_type`, visible `sub_uid`, optional `group_id`, sorted by `sort desc, id desc`.
- Default group is `group_id = 0`; do not query a default group row.
- Message lookup reads `xy_wap_embed_msg_audit_info` by `msgid` and `uid`.

- [ ] **Step 5: Implement repository writes**

Add methods:

```ts
async createMaterialCollection(input: { ... }) { ... }
async restoreMaterialCollection(input: { id: string; groupId: string | 0; opSubUserId: string; sort: number; title: string; content: string | null }) { ... }
async deleteMaterialCollection(input: { id: string; uid: number }) { ... }
async topMaterialCollection(input: { id: string; sort: number; uid: number }) { ... }
async moveMaterialCollection(input: { groupId: string | 0; id: string; sort: number; uid: number }) { ... }
async createMaterialGroup(input: { bizType: number; sort: number; subUid: number; title: string; uid: number }) { ... }
async renameMaterialGroup(input: { groupId: string; title: string; uid: number }) { ... }
async topMaterialGroup(input: { groupId: string; sort: number; uid: number }) { ... }
async deleteMaterialGroup(input: { groupId: string; uid: number }) { ... }
```

Use `parseMySqlId()` for numeric IDs. Invalid IDs should return undefined or no-op consistently with existing repository methods.

- [ ] **Step 6: Run repository tests**

```bash
pnpm --filter @chatai/backend test apps/backend/test/modules/chat/workbench-repository.test.ts -t "material"
```

Expected: pass.

- [ ] **Step 7: Commit repository**

```bash
git add apps/backend/src/modules/chat/workbench-repository.ts apps/backend/test/modules/chat/workbench-repository.test.ts
git diff --cached --check
git commit -m "feat(backend): add material collection repository"
```

---

## Task 5: Backend Service And Routes

**Files:**

- Modify: `apps/backend/src/modules/chat/workbench.service.ts`
- Modify: `apps/backend/src/modules/chat/chat.routes.ts`
- Modify: `apps/backend/test/modules/chat/workbench.service.test.ts`
- Modify: `apps/backend/test/app.test.ts`
- Modify: `apps/backend/test/fixtures/workbench-memory.service.ts`

- [ ] **Step 1: Extend service interface and memory fixture**

Add material methods to `WorkbenchService` in `workbench.service.ts` and implement simple in-memory versions in `apps/backend/test/fixtures/workbench-memory.service.ts`:

```ts
listMaterialCollections(subUserId, request)
collectMaterial(subUserId, request)
createMaterialGroup(subUserId, request)
renameMaterialGroup(subUserId, groupId, request)
topMaterialGroup(subUserId, groupId)
deleteMaterialGroup(subUserId, groupId)
deleteMaterialCollection(subUserId, collectionId)
topMaterialCollection(subUserId, collectionId)
moveMaterialCollection(subUserId, collectionId, request)
```

Memory implementation can use arrays and the same visibility rules. It must not call real DB.

- [ ] **Step 2: Write failing service tests**

Add tests to `apps/backend/test/modules/chat/workbench.service.test.ts`:

- collects expression with `subUid = current sub user id`, `groupId = 0`.
- collects file with `subUid = 0`, selected group ID, and `opSubUid = current sub user id`.
- returns duplicated response when an active collection already exists.
- restores deleted collection.
- throws `MATERIAL_GROUP_NOT_EMPTY` when deleting a non-empty group.
- rejects expression group creation.
- rejects collecting unsupported message types.

Use repository mocks with explicit method spies.

- [ ] **Step 3: Run failing service tests**

```bash
pnpm --filter @chatai/backend test apps/backend/test/modules/chat/workbench.service.test.ts -t "material"
```

Expected: fail because service methods are missing.

- [ ] **Step 4: Implement service logic**

In `MysqlWorkbenchService`:

- Use `getMe(subUserId)` or repository `getSubUser()` to derive `uid` and numeric current sub user id.
- Compute material visibility:
  - expression: `subUid = current sub user id`
  - file/mini-program/H5: `subUid = 0`
- Use `Date.now()` for `sort`.
- Use `readMaterialTitle()` from mapper.
- Validate content type mapping before insert:
  - `emotion` for expression
  - `file` for file
  - `weapp`/mapped mini-program for mini-program
  - `link`/mapped H5 for H5
- Throw `BadRequestError("UNSUPPORTED_MATERIAL_MESSAGE", "该消息类型不支持收录")` for unsupported or mismatched content.
- Throw `BadRequestError("MATERIAL_GROUP_NOT_EMPTY", "请先移走或删除分组内素材")` for non-empty group delete.

- [ ] **Step 5: Add route schemas**

In `chat.routes.ts`, add TypeBox schemas for:

- `MaterialCollectionListQuerySchema`: `biz_type`, optional `group_id`
- `MaterialCollectionCreateBodySchema`: `bizType`, `messageId`, optional `groupId`
- `MaterialGroupCreateBodySchema`: `bizType`, `title`
- `MaterialGroupUpdateBodySchema`: `title`
- `MaterialCollectionMoveBodySchema`: `groupId`

Use public paths:

```txt
GET    /api/server/material-collections
POST   /api/server/material-collections
DELETE /api/server/material-collections/:collectionId
POST   /api/server/material-collections/:collectionId/top
POST   /api/server/material-collections/:collectionId/move
POST   /api/server/material-collections/groups
PATCH  /api/server/material-collections/groups/:groupId
DELETE /api/server/material-collections/groups/:groupId
POST   /api/server/material-collections/groups/:groupId/top
```

Routes that mutate state must call `assertChatWriteAccess(request)` or `assertChatSendAccess(request)` consistently with current send/write behavior. Listing requires normal auth.

- [ ] **Step 6: Write route tests**

In `apps/backend/test/app.test.ts`, add tests using `createAuthenticatedApp()`:

- listing calls memory workbench service and returns groups/items.
- collecting expression is accepted for operator.
- viewer cannot mutate if existing chat write gates reject viewer.
- deleting non-empty group returns `MATERIAL_GROUP_NOT_EMPTY`.

- [ ] **Step 7: Run backend tests**

```bash
pnpm --filter @chatai/backend test apps/backend/test/modules/chat/workbench.service.test.ts -t "material"
pnpm --filter @chatai/backend test apps/backend/test/app.test.ts -t "material"
pnpm --filter @chatai/backend build
```

Expected: all pass.

- [ ] **Step 8: Commit service and routes**

```bash
git add apps/backend/src/modules/chat/workbench.service.ts \
  apps/backend/src/modules/chat/chat.routes.ts \
  apps/backend/test/modules/chat/workbench.service.test.ts \
  apps/backend/test/app.test.ts \
  apps/backend/test/fixtures/workbench-memory.service.ts
git diff --cached --check
git commit -m "feat(backend): add material collection APIs"
```

---

## Task 6: Web API Adapter And Mock Service

**Files:**

- Modify: `apps/web/src/pages/chat/api/workbench-service.ts`
- Modify: `apps/web/test/pages/chat/workbench-service.test.ts`

- [ ] **Step 1: Write failing HTTP adapter tests**

In `apps/web/test/pages/chat/workbench-service.test.ts`, add tests:

```ts
it("lists material collections with biz type and group params", async () => {
  const service = createHttpWorkbenchService();
  mock.onGet("/server/material-collections").reply((config) => [
    200,
    { groups: [], items: [], receivedParams: config.params },
  ]);

  await expect(
    service.listMaterialCollections({ bizType: 2, groupId: "9" }),
  ).resolves.toMatchObject({
    receivedParams: { biz_type: 2, group_id: "9" },
  });
});

it("collects material messages", async () => {
  const service = createHttpWorkbenchService();
  mock.onPost("/server/material-collections").reply((config) => [
    200,
    { item: { id: "1" }, receivedBody: JSON.parse(config.data) },
  ]);

  await expect(
    service.collectMaterial({ bizType: 2, groupId: "9", messageId: "msg-file-001" }),
  ).resolves.toMatchObject({
    receivedBody: { bizType: 2, groupId: "9", messageId: "msg-file-001" },
  });
});
```

- [ ] **Step 2: Run failing web adapter tests**

```bash
pnpm --filter @chatai/web test apps/web/test/pages/chat/workbench-service.test.ts -t "material"
```

Expected: fail because methods are missing.

- [ ] **Step 3: Add service methods**

Extend `WorkbenchService` type in `workbench-service.ts` with the backend material methods from contracts.

In `createHttpWorkbenchService()`, implement:

```ts
listMaterialCollections(request) {
  return http.get<WorkbenchMaterialCollectionListResponse>("/server/material-collections", {
    params: {
      biz_type: request.bizType,
      group_id: request.groupId,
    },
  });
},
collectMaterial(request) {
  return http.post<WorkbenchMaterialCollectionCreateResponse, WorkbenchMaterialCollectionCreateRequest>(
    "/server/material-collections",
    request,
  );
},
```

Add the rest of group/material mutate methods with the paths from Task 5.

- [ ] **Step 4: Add mock service data**

In `createMockWorkbenchService()`, add in-memory material groups and items:

- expression item using image/emotion content.
- file item.
- mini-program item.
- H5 item.

Implement list/create/delete/top/move operations with the same visible behavior. Use `Date.now()` for new `sort`.

- [ ] **Step 5: Run web adapter tests**

```bash
pnpm --filter @chatai/web test apps/web/test/pages/chat/workbench-service.test.ts -t "material"
```

Expected: pass.

- [ ] **Step 6: Commit web API adapter**

```bash
git add apps/web/src/pages/chat/api/workbench-service.ts apps/web/test/pages/chat/workbench-service.test.ts
git diff --cached --check
git commit -m "feat(web): add material collection API adapter"
```

---

## Task 7: Material Collection UI Components

**Files:**

- Create: `apps/web/src/pages/chat/components/material-collection/material-types.ts`
- Create: `apps/web/src/pages/chat/components/material-collection/material-card.tsx`
- Create: `apps/web/src/pages/chat/components/material-collection/material-group-select-dialog.tsx`
- Create: `apps/web/src/pages/chat/components/material-collection/material-library-dialog.tsx`
- Create: `apps/web/src/pages/chat/components/material-collection/material-expression-section.tsx`
- Create: `apps/web/test/pages/chat/material-collection-components.test.tsx`

- [ ] **Step 1: Write failing component tests**

Create `apps/web/test/pages/chat/material-collection-components.test.tsx` covering:

- group select dialog renders default group and custom groups.
- material card renders file/H5/mini-program/expression through existing card components.
- library dialog calls `onSelectMaterial` and produces alert-only callback via caller-provided callback.
- management mode exposes delete/top/move controls.

- [ ] **Step 2: Run failing component tests**

```bash
pnpm --filter @chatai/web test apps/web/test/pages/chat/material-collection-components.test.tsx
```

Expected: fail because components are missing.

- [ ] **Step 3: Implement `material-types.ts`**

Add local helper types that narrow contract DTOs for UI:

```ts
import type {
  WorkbenchMaterialCollectionGroupDto,
  WorkbenchMaterialCollectionItemDto,
} from "@chatai/contracts";

export type MaterialCollectionGroup = WorkbenchMaterialCollectionGroupDto;
export type MaterialCollectionItem = WorkbenchMaterialCollectionItemDto;
export type MaterialCollectionMode = "browse" | "manage";
```

- [ ] **Step 4: Implement `material-card.tsx`**

Use existing message cards:

- `ImageMessageCard` for `contentType === "emotion"`.
- `FileMessageCard` with `showDownloadAction={false}`.
- `MiniAppMessageCard`.
- `LinkMessageCard`.

Wrap each card in a button for selection. Do not nest cards inside cards.

- [ ] **Step 5: Implement group select dialog**

Use `Dialog`, `Button`, and existing form controls. It must:

- show `默认分组` with value `0`.
- list custom groups.
- submit selected group.
- disable submit while saving.

- [ ] **Step 6: Implement library dialog**

Use a left sidebar and right list:

- sidebar: `所有分组`, `默认分组`, custom groups, `新建分组`.
- right toolbar: `管理` toggle or `删除/取消` in management mode.
- material actions: select in browse mode, delete/top/move in management mode.
- group actions: rename/top/delete.
- empty state: `暂无数据`.

- [ ] **Step 7: Implement expression section**

Display collected expression items in a compact grid for insertion into the existing emoji picker.

- [ ] **Step 8: Run component tests**

```bash
pnpm --filter @chatai/web test apps/web/test/pages/chat/material-collection-components.test.tsx
```

Expected: pass.

- [ ] **Step 9: Commit UI components**

```bash
git add apps/web/src/pages/chat/components/material-collection apps/web/test/pages/chat/material-collection-components.test.tsx
git diff --cached --check
git commit -m "feat(web): add material collection components"
```

---

## Task 8: Wire Message Collection Actions

**Files:**

- Modify: `apps/web/src/pages/chat/components/message-feed.tsx`
- Modify: `apps/web/src/pages/chat/chat-workbench-page.tsx`
- Modify: `apps/web/src/pages/chat/components/chat-panel.tsx`
- Modify: `apps/web/test/pages/chat/message-feed.test.tsx`
- Modify: `apps/web/test/pages/chat/chat-workbench-page.test.tsx`

- [ ] **Step 1: Write failing message action tests**

In `message-feed.test.tsx`, add tests:

- expression/file/mini-program/H5 messages show `收录内容`.
- text/contact/image(non-emotion) messages do not show `收录内容`.
- clicking `收录内容` calls `onCollectMaterial(message)`.
- action is disabled when `canUseMessageActions={false}`.

- [ ] **Step 2: Add callback props**

In `message-feed.tsx`, add `onCollectMaterial?: (message: ChatMessage) => void` to `ChatMessageList`, `MessageRow`, and `MessageActionAvatar`.

Add helper:

```ts
function canCollectMaterial(message: ChatMessage) {
  return (
    (message.content.type === "image" && message.content.variant === "emotion") ||
    message.content.type === "file" ||
    message.content.type === "mini-program" ||
    message.content.type === "h5"
  );
}
```

Render a `DropdownMenuItem` labeled `收录内容` only when `canCollectMaterial(message)` is true.

- [ ] **Step 3: Wire through `ChatPanel`**

Add `onCollectMaterial` prop to `ChatPanel` and pass it to `ChatMessagePanel`/`ChatMessageList` according to the existing prop path.

- [ ] **Step 4: Implement collection dialogs in page**

In `chat-workbench-page.tsx`:

- hold `pendingCollectionMessage`.
- if expression, call `collectMaterial({ bizType: 1, groupId: 0, messageId })` directly.
- if file/mini-program/H5, open `MaterialGroupSelectDialog`.
- resolve message id using `message.remoteMessageId ?? message.id`.
- on success show `toast.success("已收录")`.
- on duplicated success also show `toast.success("已收录")`.

- [ ] **Step 5: Run message action tests**

```bash
pnpm --filter @chatai/web test apps/web/test/pages/chat/message-feed.test.tsx -t "收录"
```

Expected: pass.

- [ ] **Step 6: Commit message action wiring**

```bash
git add apps/web/src/pages/chat/components/message-feed.tsx \
  apps/web/src/pages/chat/components/chat-panel.tsx \
  apps/web/src/pages/chat/chat-workbench-page.tsx \
  apps/web/test/pages/chat/message-feed.test.tsx \
  apps/web/test/pages/chat/chat-workbench-page.test.tsx
git diff --cached --check
git commit -m "feat(web): add material collection message actions"
```

---

## Task 9: Wire Composer Material Entry Points

**Files:**

- Modify: `apps/web/src/pages/chat/components/wechat-emoji-picker.tsx`
- Modify: `apps/web/src/pages/chat/components/chat-composer.tsx`
- Modify: `apps/web/src/pages/chat/chat-workbench-page.tsx`
- Modify: `apps/web/test/pages/chat/chat-workbench-composer.int.test.tsx`
- Modify: `apps/web/test/pages/chat/material-collection-components.test.tsx`

- [ ] **Step 1: Write failing composer tests**

Add tests that:

- emoji picker shows `收藏的表情` when expression materials exist.
- clicking a collected expression calls alert.
- composer toolbar has buttons labeled `收藏文件`, `收藏小程序`, `收藏H5`.
- clicking each opens the library dialog.
- clicking a material item calls `window.alert` and does not call `sendMessage`.

- [ ] **Step 2: Extend emoji picker props**

In `wechat-emoji-picker.tsx`, add props:

```ts
collectedExpressions?: WorkbenchMaterialCollectionItemDto[];
onSelectCollectedExpression?: (item: WorkbenchMaterialCollectionItemDto) => void;
```

Render a `收藏的表情` section above or below existing WeChat emoji grid. Keep existing WeChat emoji behavior unchanged.

- [ ] **Step 3: Add composer toolbar buttons**

In `chat-composer.tsx`:

- Add Hugeicons buttons for material file, mini-program, and H5.
- Use existing `Button` icon size and toolbar classes.
- Add props:

```ts
onOpenMaterialLibrary: (bizType: 2 | 3 | 4) => void;
collectedExpressions?: WorkbenchMaterialCollectionItemDto[];
onSelectCollectedExpression?: (item: WorkbenchMaterialCollectionItemDto) => void;
```

- [ ] **Step 4: Wire page library state**

In `chat-workbench-page.tsx`:

- maintain active library biz type.
- load list via `listMaterialCollections`.
- pass groups/items/actions into `MaterialLibraryDialog`.
- implement management callbacks through workbench service.
- `onSelectMaterial` calls:

```ts
window.alert("后续接入发送接口");
```

Do not dispatch send-message, do not update local messages.

- [ ] **Step 5: Run composer tests**

```bash
pnpm --filter @chatai/web test apps/web/test/pages/chat/chat-workbench-composer.int.test.tsx -t "素材"
```

Expected: pass.

- [ ] **Step 6: Commit composer wiring**

```bash
git add apps/web/src/pages/chat/components/wechat-emoji-picker.tsx \
  apps/web/src/pages/chat/components/chat-composer.tsx \
  apps/web/src/pages/chat/chat-workbench-page.tsx \
  apps/web/test/pages/chat/chat-workbench-composer.int.test.tsx \
  apps/web/test/pages/chat/material-collection-components.test.tsx
git diff --cached --check
git commit -m "feat(web): add composer material library"
```

---

## Task 10: Full Verification

**Files:** No source edits expected unless verification fails.

- [ ] **Step 1: Run contract tests/build**

```bash
pnpm --filter @chatai/contracts test packages/contracts/test/chat-material-collection-dto.test.ts
pnpm --filter @chatai/contracts build
```

Expected: pass.

- [ ] **Step 2: Run backend focused tests/build**

```bash
pnpm --filter @chatai/backend test apps/backend/test/modules/chat/material-collection-mappers.test.ts
pnpm --filter @chatai/backend test apps/backend/test/modules/chat/workbench-repository.test.ts -t "material"
pnpm --filter @chatai/backend test apps/backend/test/modules/chat/workbench.service.test.ts -t "material"
pnpm --filter @chatai/backend test apps/backend/test/app.test.ts -t "material"
pnpm --filter @chatai/backend build
```

Expected: pass.

- [ ] **Step 3: Run web focused tests/build**

```bash
pnpm --filter @chatai/web test apps/web/test/pages/chat/workbench-service.test.ts -t "material"
pnpm --filter @chatai/web test apps/web/test/pages/chat/material-collection-components.test.tsx
pnpm --filter @chatai/web test apps/web/test/pages/chat/message-feed.test.tsx -t "收录"
pnpm --filter @chatai/web test apps/web/test/pages/chat/chat-workbench-composer.int.test.tsx -t "素材"
pnpm --filter @chatai/web build
```

Expected: pass.

- [ ] **Step 4: Run final diff checks**

```bash
git diff --check
git diff --cached --check
```

Expected: no output.

- [ ] **Step 5: Final status**

```bash
git status --short
```

Expected: only intentional uncommitted files, or clean worktree if every planned commit was made.
