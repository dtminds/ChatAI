# Quick Reply Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build快捷话术 for `/chat`: a sidebar entry that works in both single and group conversations, loads enterprise/personal quick replies, and fills the composer with editable text/images plus Lite cards for file/H5/小程序/视频号.

**Architecture:** Add a dedicated quick-reply domain instead of reusing material collection tables. Contracts define category/reply DTOs and attachment JSON shape; backend adds routes/service/repository methods for category and reply CRUD; web adds a side-panel tab and hook that loads, manages, and fills composer segments. Selecting a quick reply builds only the initial composer draft as text first, then attachments in `attachments` order. Existing Lexical behavior continues to handle text and image nodes; add Lite composer nodes for file/H5/weapp/sphfeed so later user edits live in the same composer document. Sending uses the current composer document exported at send time; it must not rebuild order from the original quick-reply payload.

**Hard Rules:**
- `msgid` is the send-path discriminator. A composer file/H5/weapp/sphfeed segment with `msgid` is a quick-reply snapshot send and must not use `materialCollectionId` lookup. Only segments without `msgid` may use the existing material-library lookup path.
- File attachment JSON stores `content.fileUrl` because that is the material content snapshot field, but outgoing composer/send file segments must continue to use the existing `url` field. Do not add a `fileUrl` send segment field.
- The quick-reply panel must expose both一级分类 and二级分类 creation. The top-level category row menu includes `新建子分类` and passes the parent category id into create.
- Search requests are debounced by 300ms. The v1 quick-reply list intentionally loads only `page: 1, pageSize: 50` and does not implement load more.

**Tech Stack:** pnpm workspace, TypeScript, TypeBox contracts, Fastify, Kysely, React 19, Zustand, shadcn/ui, Hugeicons, Vitest.

---

## File Structure

- Modify `docs/db/schema.sql`: add `xy_wap_embed_quick_reply_category` and `xy_wap_embed_quick_reply`.
- Modify `docs/db/change-log.md`: add schema migration SQL.
- Modify `apps/backend/src/db/writable-tables.ts`: whitelist the two quick-reply tables.
- Modify `apps/backend/scripts/codegen-db.config.json`: include the two quick-reply tables.
- Regenerate or update `apps/backend/src/db/schema.ts`: add Kysely table types.
- Modify `packages/contracts/src/chat/dto.ts`: add quick-reply DTO/request/response types.
- Modify `packages/contracts/src/chat/dto.ts`: extend outgoing `file/h5/weapp/sphfeed` send segments with optional `msgid` for quick-reply-originated sends.
- Modify `packages/contracts/src/index.ts`: export the new quick-reply content helpers if split into a new file.
- Create `packages/contracts/src/chat/quick-reply-content.ts`: validation and conversion helpers for attachment JSON.
- Create `packages/contracts/test/chat-quick-reply-dto.test.ts`: contract tests for DTO and validation behavior.
- Modify `apps/backend/src/modules/chat/workbench-repository.ts`: add quick-reply category/reply queries and writes.
- Modify `apps/backend/src/modules/chat/workbench.service.ts`: add quick-reply business validation, visibility, and CRUD methods.
- Modify `apps/backend/src/modules/chat/chat.routes.ts`: add `/api/server/quick-replies/*` routes.
- Create `apps/backend/test/modules/chat/quick-reply-content.test.ts`: backend-level validation tests where service-specific errors matter.
- Modify `apps/backend/test/modules/chat/workbench-repository.test.ts`: repository query/write coverage.
- Modify `apps/backend/test/modules/chat/workbench.service.test.ts`: service behavior coverage.
- Modify `apps/web/src/pages/chat/api/workbench-service.ts`: add HTTP and mock quick-reply methods.
- Create `apps/web/src/pages/chat/lib/quick-reply-segments.ts`: convert reply DTOs to `ComposerSegment[]`.
- Modify `apps/web/src/pages/chat/lib/composer-segments.ts`: add quick-reply `msgid` fields for file/H5/weapp/sphfeed segments and keep only the initial quick-reply fill conversion text-first with attachment-order preservation.
- Modify `apps/web/src/pages/chat/components/composer/lexical-nodes.tsx`: add Lite composer nodes for file/H5/weapp/sphfeed, reusing existing message-card visual language.
- Modify `apps/web/src/pages/chat/components/composer/lexical-utils.ts`: restore/export file/H5/weapp/sphfeed nodes in the user's current composer document order.
- Modify `apps/web/src/pages/chat/components/chat-composer.tsx`: register Lite attachment nodes and keep the current composer document export as the send source.
- Create `apps/web/src/pages/chat/components/quick-reply/quick-reply-panel.tsx`: sidebar panel UI.
- Create `apps/web/src/pages/chat/hooks/use-quick-replies.ts`: load scopes/categories/replies and expose fill/manage handlers.
- Modify `apps/web/src/pages/chat/components/customer-side-panel.tsx`: add fixed “快捷话术” tab for both single and group conversations.
- Modify `apps/web/src/pages/chat/components/chat-panel.tsx`: pass quick-reply props into `CustomerSidePanel`.
- Modify `apps/web/src/pages/chat/chat-workbench-page.tsx`: connect quick-reply fill behavior to composer state/ref.
- Create `apps/web/test/pages/chat/quick-reply-segments.test.ts`: conversion tests.
- Create `apps/web/test/pages/chat/quick-reply-panel.test.tsx`: panel behavior tests.
- Modify `apps/web/test/pages/chat/customer-side-panel.test.tsx`: verify the side-panel tab exists for single and group conversations.
- Modify `apps/web/test/pages/chat/chat-workbench-composer.int.test.tsx`: verify selecting quick reply fills composer.

---

## Task 1: Contracts And Content Validation

**Files:**
- Create: `packages/contracts/src/chat/quick-reply-content.ts`
- Modify: `packages/contracts/src/chat/dto.ts`
- Modify: `packages/contracts/src/index.ts`
- Test: `packages/contracts/test/chat-quick-reply-dto.test.ts`

- [ ] **Step 1: Write failing contract tests**

Add `packages/contracts/test/chat-quick-reply-dto.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  QUICK_REPLY_ATTACHMENT_MAX_COUNT,
  normalizeQuickReplyAttachments,
  validateQuickReplyPayload,
  type WorkbenchQuickReplyAttachment,
} from "../src/index.js";

describe("quick reply contracts", () => {
  it("accepts empty text when at least one valid attachment exists", () => {
    const attachments: WorkbenchQuickReplyAttachment[] = [
      {
        type: "h5",
        materialCollectionId: "12",
        msgid: "1025657",
        content: {
          href: "https://example.com",
          title: "活动链接",
        },
      },
    ];

    expect(validateQuickReplyPayload({ attachments, contentText: "" })).toEqual({
      ok: true,
    });
  });

  it("rejects empty quick replies", () => {
    expect(validateQuickReplyPayload({ attachments: [], contentText: "   " })).toEqual({
      errorMsg: "请填写话术内容或添加附件",
      ok: false,
    });
  });

  it("rejects more than five attachments", () => {
    const attachments = Array.from({ length: QUICK_REPLY_ATTACHMENT_MAX_COUNT + 1 }, () => ({
      type: "image" as const,
      content: { fileUrl: "https://example.com/image.png" },
    }));

    expect(validateQuickReplyPayload({ attachments, contentText: "" })).toEqual({
      errorMsg: "附件最多添加5个",
      ok: false,
    });
  });

  it("normalizes H5 attachment fields without adding bizType and keeps msgid", () => {
    const attachments = normalizeQuickReplyAttachments([
      {
        bizType: 4,
        type: "h5",
        materialCollectionId: "12",
        msgid: "1025657",
        content: {
          coverUrl: "",
          desc: "描述",
          href: "https://example.com",
          title: "标题",
        },
      },
    ]);

    expect(attachments).toEqual([
      {
        type: "h5",
        materialCollectionId: "12",
        msgid: "1025657",
        content: {
          desc: "描述",
          href: "https://example.com",
          title: "标题",
        },
      },
    ]);
  });
});
```

- [ ] **Step 2: Run the failing contracts test**

Run:

```bash
pnpm --filter @chatai/contracts test test/chat-quick-reply-dto.test.ts
```

Expected: fail because `quick-reply-content` exports do not exist.

- [ ] **Step 3: Add quick-reply content helpers**

Create `packages/contracts/src/chat/quick-reply-content.ts`:

```ts
export const QUICK_REPLY_ATTACHMENT_MAX_COUNT = 5;

export const QUICK_REPLY_SCOPE_TYPE = {
  ENTERPRISE: 1,
  PERSONAL: 2,
} as const;

export type QuickReplyScopeType =
  (typeof QUICK_REPLY_SCOPE_TYPE)[keyof typeof QUICK_REPLY_SCOPE_TYPE];

export type WorkbenchQuickReplyAttachmentType =
  | "image"
  | "file"
  | "h5"
  | "weapp"
  | "sphfeed";

export type WorkbenchQuickReplyAttachment = {
  type: WorkbenchQuickReplyAttachmentType;
  materialCollectionId?: string;
  msgid?: string;
  content: Record<string, unknown>;
};

export type QuickReplyValidationResult =
  | { ok: true }
  | { ok: false; errorMsg: string };

export function normalizeQuickReplyAttachments(
  attachments: unknown,
): WorkbenchQuickReplyAttachment[] {
  if (!Array.isArray(attachments)) {
    return [];
  }

  return attachments.flatMap((attachment) => {
    if (!isRecord(attachment)) {
      return [];
    }

    const type = readString(attachment.type);

    if (!isQuickReplyAttachmentType(type)) {
      return [];
    }

    const content = isRecord(attachment.content) ? compactRecord(attachment.content) : {};
    const materialCollectionId = readString(attachment.materialCollectionId);
    const msgid = readString(attachment.msgid);

    return [
      {
        type,
        ...(materialCollectionId ? { materialCollectionId } : {}),
        ...(msgid ? { msgid } : {}),
        content,
      },
    ];
  });
}

export function validateQuickReplyPayload(input: {
  attachments: unknown;
  contentText: string | null | undefined;
}): QuickReplyValidationResult {
  const contentText = input.contentText?.trim() ?? "";
  const attachments = normalizeQuickReplyAttachments(input.attachments);

  if (!contentText && attachments.length === 0) {
    return { ok: false, errorMsg: "请填写话术内容或添加附件" };
  }

  if (contentText.length > 1000) {
    return { ok: false, errorMsg: "话术内容不能超过1000字" };
  }

  if (attachments.length > QUICK_REPLY_ATTACHMENT_MAX_COUNT) {
    return { ok: false, errorMsg: "附件最多添加5个" };
  }

  for (const attachment of attachments) {
    const result = validateQuickReplyAttachment(attachment);

    if (!result.ok) {
      return result;
    }
  }

  return { ok: true };
}

export function validateQuickReplyAttachment(
  attachment: WorkbenchQuickReplyAttachment,
): QuickReplyValidationResult {
  if (attachment.type === "image") {
    return readString(attachment.content.fileUrl)
      ? { ok: true }
      : { ok: false, errorMsg: "图片附件数据异常" };
  }

  if (attachment.type === "file") {
    return attachment.materialCollectionId &&
      attachment.msgid &&
      readString(attachment.content.fileName) &&
      readString(attachment.content.fileUrl)
      ? { ok: true }
      : { ok: false, errorMsg: "文件附件数据异常" };
  }

  if (attachment.type === "h5") {
    return attachment.materialCollectionId &&
      attachment.msgid &&
      readString(attachment.content.title) &&
      readString(attachment.content.href)
      ? { ok: true }
      : { ok: false, errorMsg: "H5附件数据异常" };
  }

  if (attachment.type === "weapp") {
    return attachment.materialCollectionId && attachment.msgid
      ? { ok: true }
      : { ok: false, errorMsg: "小程序附件数据异常" };
  }

  if (attachment.type === "sphfeed") {
    return attachment.materialCollectionId && attachment.msgid
      ? { ok: true }
      : { ok: false, errorMsg: "视频号附件数据异常" };
  }

  return { ok: false, errorMsg: "附件类型不支持" };
}

function isQuickReplyAttachmentType(
  value: string,
): value is WorkbenchQuickReplyAttachmentType {
  return value === "image" || value === "file" || value === "h5" || value === "weapp" || value === "sphfeed";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function compactRecord(record: Record<string, unknown>) {
  const compacted: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(record)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }

    compacted[key] = value;
  }

  return compacted;
}
```

- [ ] **Step 4: Add quick-reply DTOs**

Append to `packages/contracts/src/chat/dto.ts` near material collection DTOs:

```ts
import type {
  QuickReplyScopeType,
  WorkbenchQuickReplyAttachment,
} from "./quick-reply-content.js";

export type WorkbenchQuickReplyCategoryDto = {
  id: string;
  parentId: string | 0;
  scopeType: QuickReplyScopeType;
  title: string;
  sort: number;
};

export type WorkbenchQuickReplyDto = {
  id: string;
  scopeType: QuickReplyScopeType;
  categoryId: string | 0;
  contentText: string;
  attachments: WorkbenchQuickReplyAttachment[];
  labelText: string;
  labelColor: string;
  sort: number;
  createdAt?: number;
  updatedAt?: number;
};

export type WorkbenchQuickReplyCategoryListRequest = {
  scopeType: QuickReplyScopeType;
};

export type WorkbenchQuickReplyCategoryListResponse = {
  categories: WorkbenchQuickReplyCategoryDto[];
};

export type WorkbenchQuickReplyCategoryCreateRequest = {
  scopeType: QuickReplyScopeType;
  parentId?: string | 0;
  title: string;
};

export type WorkbenchQuickReplyCategoryUpdateRequest = {
  title: string;
};

export type WorkbenchQuickReplyListRequest = {
  scopeType: QuickReplyScopeType;
  categoryId?: string | 0;
  keyword?: string;
  page?: number;
  pageSize?: number;
};

export type WorkbenchQuickReplyListResponse = {
  items: WorkbenchQuickReplyDto[];
  pagination: {
    hasMore: boolean;
    page: number;
    pageSize: number;
    total: number;
  };
};

export type WorkbenchQuickReplyCreateRequest = {
  scopeType: QuickReplyScopeType;
  categoryId?: string | 0;
  contentText?: string;
  attachments?: WorkbenchQuickReplyAttachment[];
  labelText?: string;
  labelColor?: string;
};

export type WorkbenchQuickReplyUpdateRequest = WorkbenchQuickReplyCreateRequest;

export type WorkbenchQuickReplyOkResponse = {
  ok: true;
};
```

Also update outgoing send segment DTOs in the same file:

```ts
export type WorkbenchOutgoingMessageFileSegment = {
  type: "file";
  fileName?: string;
  url?: string;
  materialCollectionId?: string;
  msgid?: string;
};

export type WorkbenchOutgoingMessageH5Segment = {
  type: "h5";
  coverUrl?: string;
  desc?: string;
  href?: string;
  materialCollectionId?: string;
  msgid?: string;
  title?: string;
};

export type WorkbenchOutgoingMessageMiniProgramSegment = {
  type: "weapp";
  materialCollectionId?: string;
  msgid?: string;
};

export type WorkbenchOutgoingMessageSphfeedSegment = {
  type: "sphfeed";
  materialCollectionId?: string;
  msgid?: string;
};
```

`materialCollectionId` remains supported as source-trace metadata. Do not add `fileUrl` to the outgoing file segment; the existing contract field is `url`, and backend send logic already reads `segment.url`.

Hard send-path rule: if a composer segment has `msgid`, treat it as a quick-reply snapshot segment and send from its inline fields plus `msgid`. Only when a segment has no `msgid` and has `materialCollectionId` should it use the material-library lookup/forward path. This is mandatory even when the quick-reply segment also carries `materialCollectionId`; `msgid` always wins.

If adding an import conflicts with existing top imports, merge it with the existing import block instead of creating a second block.

- [ ] **Step 5: Export helpers**

Modify `packages/contracts/src/index.ts`:

```ts
export * from "./chat/quick-reply-content.js";
```

- [ ] **Step 6: Run contracts tests**

Run:

```bash
pnpm --filter @chatai/contracts test test/chat-quick-reply-dto.test.ts
pnpm --filter @chatai/contracts build
```

Expected: both pass.

- [ ] **Step 7: Commit**

```bash
git add packages/contracts/src/chat/dto.ts packages/contracts/src/chat/quick-reply-content.ts packages/contracts/src/index.ts packages/contracts/test/chat-quick-reply-dto.test.ts
git commit -m "feat: add quick reply contracts"
```

---

## Task 2: Database Schema And Repository

**Files:**
- Modify: `docs/db/schema.sql`
- Modify: `docs/db/change-log.md`
- Modify: `apps/backend/src/db/writable-tables.ts`
- Modify: `apps/backend/scripts/codegen-db.config.json`
- Modify: `apps/backend/src/db/schema.ts`
- Modify: `apps/backend/src/modules/chat/workbench-repository.ts`
- Test: `apps/backend/test/modules/chat/workbench-repository.test.ts`

- [ ] **Step 1: Add schema tests first**

Append repository tests for creating/listing categories and replies in `apps/backend/test/modules/chat/workbench-repository.test.ts`. Use the existing fake DB pattern in that file and assert table names and where scopes:

```ts
it("lists enterprise quick reply categories by shared scope", async () => {
  const { repository, db } = createRepositoryHarness({
    xy_wap_embed_quick_reply_category: [
      {
        biz_status: 1,
        create_time: new Date("2026-06-15T00:00:00Z"),
        id: 11,
        op_sub_uid: 9,
        parent_id: 0,
        scope_type: 1,
        sort: 100,
        sub_uid: 0,
        title: "售前",
        uid: 10001,
        update_time: new Date("2026-06-15T00:00:00Z"),
      },
    ],
  });

  const categories = await repository.listQuickReplyCategories({
    scopeType: 1,
    subUserId: "9",
    uid: 10001,
  });

  expect(categories).toEqual([
    {
      id: "11",
      parentId: 0,
      scopeType: 1,
      sort: 100,
      title: "售前",
    },
  ]);
  expect(db.lastSelectFrom).toBe("xy_wap_embed_quick_reply_category");
});

it("lists quick replies with pagination and normalized attachments", async () => {
  const { repository } = createRepositoryHarness({
    xy_wap_embed_quick_reply: [
      {
        attachments: JSON.stringify([
          {
            type: "h5",
            content: { href: "https://example.com", title: "活动" },
          },
        ]),
        biz_status: 1,
        category_id: 11,
        content_text: "您好",
        create_time: new Date("2026-06-15T00:00:00Z"),
        id: 21,
        label_color: "orange",
        label_text: "售前",
        op_sub_uid: 9,
        scope_type: 1,
        sort: 100,
        sub_uid: 0,
        uid: 10001,
        update_time: new Date("2026-06-15T00:00:00Z"),
      },
    ],
  });

  const result = await repository.listQuickReplies({
    categoryId: "11",
    page: 1,
    pageSize: 50,
    scopeType: 1,
    subUserId: "9",
    uid: 10001,
  });

  expect(result.items[0]).toMatchObject({
    attachments: [
      {
        type: "h5",
        content: { href: "https://example.com", title: "活动" },
      },
    ],
    categoryId: "11",
    contentText: "您好",
    id: "21",
    labelColor: "orange",
    labelText: "售前",
  });
});
```

If the harness has different names, adapt only to existing helpers; keep the expected behavior.

- [ ] **Step 2: Run repository tests to verify failure**

```bash
pnpm --filter @chatai/backend test test/modules/chat/workbench-repository.test.ts
```

Expected: fail because quick-reply repository methods and schema types do not exist.

- [ ] **Step 3: Add DB schema SQL**

Append to `docs/db/schema.sql` after material collection tables:

```sql
CREATE TABLE `xy_wap_embed_quick_reply_category` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT 'id',
  `uid` bigint unsigned NOT NULL COMMENT '租户id',
  `scope_type` tinyint NOT NULL DEFAULT '1' COMMENT '话术范围：1企业话术，2个人话术',
  `sub_uid` bigint unsigned NOT NULL DEFAULT '0' COMMENT '控制可见性，0：全员可见，其他：对应子账号可见，xy_wap_embed_sub_user.id',
  `parent_id` bigint unsigned NOT NULL DEFAULT '0' COMMENT '父分类ID，0表示一级分类',
  `title` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL DEFAULT '' COMMENT '分类名称',
  `biz_status` tinyint NOT NULL DEFAULT '1' COMMENT '状态，0：已删除，1：正常',
  `op_sub_uid` bigint unsigned NOT NULL DEFAULT '0' COMMENT '操作人ID，xy_wap_embed_sub_user.id',
  `sort` bigint unsigned NOT NULL DEFAULT '0' COMMENT '排序值',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '插入时间',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_quick_reply_category_scope` (`uid`,`biz_status`,`scope_type`,`sub_uid`,`parent_id`,`sort`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='chatAI-快捷话术分类表';

CREATE TABLE `xy_wap_embed_quick_reply` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT 'id',
  `uid` bigint unsigned NOT NULL COMMENT '租户id',
  `scope_type` tinyint NOT NULL DEFAULT '1' COMMENT '话术范围：1企业话术，2个人话术',
  `sub_uid` bigint unsigned NOT NULL DEFAULT '0' COMMENT '控制可见性，0：全员可见，其他：对应子账号可见，xy_wap_embed_sub_user.id',
  `category_id` bigint unsigned NOT NULL DEFAULT '0' COMMENT '分类ID，0表示未分类',
  `content_text` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci COMMENT '主文本',
  `attachments` json DEFAULT NULL COMMENT '附件JSON，最多5个',
  `label_text` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL DEFAULT '' COMMENT '徽标文字',
  `label_color` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL DEFAULT '' COMMENT '徽标颜色key',
  `biz_status` tinyint NOT NULL DEFAULT '1' COMMENT '状态，0：已删除，1：正常',
  `op_sub_uid` bigint unsigned NOT NULL DEFAULT '0' COMMENT '操作人ID，xy_wap_embed_sub_user.id',
  `sort` bigint unsigned NOT NULL DEFAULT '0' COMMENT '排序值',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '插入时间',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_quick_reply_scope_category` (`uid`,`biz_status`,`scope_type`,`sub_uid`,`category_id`,`sort`),
  KEY `idx_quick_reply_scope_update` (`uid`,`biz_status`,`scope_type`,`sub_uid`,`update_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='chatAI-快捷话术表';
```

Add the same DDL to `docs/db/change-log.md` with a dated section for 2026-06-15.

- [ ] **Step 4: Whitelist and codegen config**

Modify `apps/backend/src/db/writable-tables.ts`:

```ts
  "xy_wap_embed_quick_reply",
  "xy_wap_embed_quick_reply_category",
```

Add both names to `apps/backend/scripts/codegen-db.config.json` table list.

- [ ] **Step 5: Regenerate DB types**

Run:

```bash
pnpm backend:db:codegen
```

If local DB codegen is unavailable, manually add `XyWapEmbedQuickReply` and `XyWapEmbedQuickReplyCategory` interfaces to `apps/backend/src/db/schema.ts` matching the SQL fields, and document the codegen failure in the PR.

- [ ] **Step 6: Implement repository methods**

In `apps/backend/src/modules/chat/workbench-repository.ts`, add row types near material collection rows:

```ts
type QuickReplyCategoryRow = {
  id: number | bigint | string;
  parent_id: number | bigint | string;
  scope_type: number;
  sort: number | bigint | string;
  title: string;
};

type QuickReplyRow = {
  attachments: string | Record<string, unknown>[] | null;
  category_id: number | bigint | string;
  content_text: string | null;
  create_time?: Date | string | null;
  id: number | bigint | string;
  label_color: string;
  label_text: string;
  scope_type: number;
  sort: number | bigint | string;
  update_time?: Date | string | null;
};
```

Add methods:

```ts
async listQuickReplyCategories(input: {
  scopeType: QuickReplyScopeType;
  subUserId: string;
  uid: number;
}): Promise<WorkbenchQuickReplyCategoryDto[]> {
  const subUid = getQuickReplySubUid(input.scopeType, input.subUserId);
  const rows = await this.db
    .selectFrom("xy_wap_embed_quick_reply_category")
    .select(["id", "parent_id", "scope_type", "sort", "title"])
    .where("uid", "=", input.uid)
    .where("biz_status", "=", BIZ_STATUS_ACTIVE)
    .where("scope_type", "=", input.scopeType)
    .where("sub_uid", "=", subUid)
    .orderBy("sort", "desc")
    .orderBy("id", "desc")
    .execute();

  return rows.map(mapQuickReplyCategoryRow);
}

async listQuickReplies(input: {
  categoryId?: string | 0;
  keyword?: string;
  page: number;
  pageSize: number;
  scopeType: QuickReplyScopeType;
  subUserId: string;
  uid: number;
}): Promise<{ items: WorkbenchQuickReplyDto[]; total: number }> {
  const subUid = getQuickReplySubUid(input.scopeType, input.subUserId);
  let listQuery = this.db
    .selectFrom("xy_wap_embed_quick_reply")
    .selectAll()
    .where("uid", "=", input.uid)
    .where("biz_status", "=", BIZ_STATUS_ACTIVE)
    .where("scope_type", "=", input.scopeType)
    .where("sub_uid", "=", subUid);
  let countQuery = this.db
    .selectFrom("xy_wap_embed_quick_reply")
    .select((eb) => eb.fn.countAll().as("count"))
    .where("uid", "=", input.uid)
    .where("biz_status", "=", BIZ_STATUS_ACTIVE)
    .where("scope_type", "=", input.scopeType)
    .where("sub_uid", "=", subUid);

  if (input.categoryId !== undefined) {
    const categoryId = parseQuickReplyId(input.categoryId);
    listQuery = listQuery.where("category_id", "=", categoryId);
    countQuery = countQuery.where("category_id", "=", categoryId);
  }

  if (input.keyword?.trim()) {
    const keyword = `%${input.keyword.trim()}%`;
    listQuery = listQuery.where((eb) =>
      eb.or([
        eb("content_text", "like", keyword),
        eb("label_text", "like", keyword),
      ]),
    );
    countQuery = countQuery.where((eb) =>
      eb.or([
        eb("content_text", "like", keyword),
        eb("label_text", "like", keyword),
      ]),
    );
  }

  const [rows, totalRow] = await Promise.all([
    listQuery
      .orderBy("sort", "desc")
      .orderBy("id", "desc")
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize)
      .execute(),
    countQuery.executeTakeFirst(),
  ]);

  return {
    items: rows.map((row) => mapQuickReplyRow(row as QuickReplyRow)),
    total: Number(totalRow?.count ?? 0),
  };
}
```

Add create/update/delete/top helpers in the same repository following the material collection soft-delete and `sort = Date.now()` style.

- [ ] **Step 7: Add mappers/helpers**

Add helper functions near repository helpers:

```ts
function getQuickReplySubUid(scopeType: QuickReplyScopeType, subUserId: string) {
  return scopeType === QUICK_REPLY_SCOPE_TYPE.ENTERPRISE ? 0 : parseMySqlId(subUserId);
}

function parseQuickReplyId(id: string | 0 | undefined) {
  if (id === undefined || id === 0 || id === "0") {
    return 0;
  }

  const parsed = parseMySqlId(id);

  if (parsed == null) {
    throw new BadRequestError("INVALID_QUICK_REPLY_ID", "快捷话术 ID 无效");
  }

  return parsed;
}

function mapQuickReplyCategoryRow(row: QuickReplyCategoryRow): WorkbenchQuickReplyCategoryDto {
  const parentId = Number(row.parent_id);

  return {
    id: String(row.id),
    parentId: parentId === 0 ? 0 : String(row.parent_id),
    scopeType: row.scope_type as QuickReplyScopeType,
    sort: Number(row.sort),
    title: row.title,
  };
}

function mapQuickReplyRow(row: QuickReplyRow): WorkbenchQuickReplyDto {
  const categoryId = Number(row.category_id);

  return {
    attachments: normalizeQuickReplyAttachments(row.attachments),
    categoryId: categoryId === 0 ? 0 : String(row.category_id),
    contentText: row.content_text ?? "",
    createdAt: toTimestamp(row.create_time),
    id: String(row.id),
    labelColor: row.label_color,
    labelText: row.label_text,
    scopeType: row.scope_type as QuickReplyScopeType,
    sort: Number(row.sort),
    updatedAt: toTimestamp(row.update_time),
  };
}
```

Use existing `parseMySqlId`, `BadRequestError`, `BIZ_STATUS_ACTIVE`, `toTimestamp` equivalents already present in the file. If helper names differ, reuse existing local helpers rather than duplicating.

- [ ] **Step 8: Run repository tests**

```bash
pnpm --filter @chatai/backend test test/modules/chat/workbench-repository.test.ts
```

Expected: pass.

- [ ] **Step 9: Commit**

```bash
git add docs/db/schema.sql docs/db/change-log.md apps/backend/src/db/writable-tables.ts apps/backend/scripts/codegen-db.config.json apps/backend/src/db/schema.ts apps/backend/src/modules/chat/workbench-repository.ts apps/backend/test/modules/chat/workbench-repository.test.ts
git commit -m "feat: add quick reply persistence"
```

---

## Task 3: Backend Routes And Service

**Files:**
- Modify: `apps/backend/src/modules/chat/chat.routes.ts`
- Modify: `apps/backend/src/modules/chat/workbench.service.ts`
- Test: `apps/backend/test/modules/chat/workbench.service.test.ts`

- [ ] **Step 1: Write service tests**

Add tests in `apps/backend/test/modules/chat/workbench.service.test.ts`:

```ts
it("rejects saving an empty quick reply", async () => {
  const { service } = createWorkbenchServiceHarness();

  await expect(
    service.createQuickReply("9", {
      attachments: [],
      contentText: " ",
      scopeType: 1,
    }),
  ).rejects.toMatchObject({
    code: "INVALID_QUICK_REPLY",
    message: "请填写话术内容或添加附件",
  });
});

it("lists personal quick replies in the current sub user scope", async () => {
  const { repository, service } = createWorkbenchServiceHarness();
  repository.listQuickReplies.mockResolvedValue({
    items: [],
    total: 0,
  });

  await service.listQuickReplies("9", {
    page: 1,
    pageSize: 50,
    scopeType: 2,
  });

  expect(repository.listQuickReplies).toHaveBeenCalledWith(
    expect.objectContaining({
      scopeType: 2,
      subUserId: "9",
    }),
  );
});

  it("rejects deleting a quick reply category that has child categories", async () => {
    const { repository, service } = createWorkbenchServiceHarness();
    repository.countChildQuickReplyCategories.mockResolvedValue(1);

    await expect(service.deleteQuickReplyCategory("9", "11")).rejects.toMatchObject({
      code: "QUICK_REPLY_CATEGORY_HAS_CHILDREN",
      message: "请先删除子分类",
    });
  });

  it("rejects deleting a non-empty quick reply category", async () => {
  const { repository, service } = createWorkbenchServiceHarness();
  repository.countChildQuickReplyCategories.mockResolvedValue(0);
  repository.countQuickRepliesInCategory.mockResolvedValue(1);

  await expect(service.deleteQuickReplyCategory("9", "11")).rejects.toMatchObject({
    code: "QUICK_REPLY_CATEGORY_NOT_EMPTY",
    message: "请先移走或删除分类下的话术",
  });
});
```

Adapt harness helper names to the existing test file.

- [ ] **Step 2: Run service tests to verify failure**

```bash
pnpm --filter @chatai/backend test test/modules/chat/workbench.service.test.ts
```

Expected: fail because service methods do not exist.

- [ ] **Step 3: Add route schemas**

In `apps/backend/src/modules/chat/chat.routes.ts`, add TypeBox schemas near material schemas:

```ts
const QuickReplyScopeQuerySchema = Type.Object({
  scope_type: Type.Number({ minimum: 1, maximum: 2 }),
});

const QuickReplyCategoryCreateBodySchema = Type.Object({
  parentId: Type.Optional(Type.Union([Type.String({ maxLength: 64 }), Type.Literal(0)])),
  scopeType: Type.Number({ minimum: 1, maximum: 2 }),
  title: Type.String({ minLength: 1, maxLength: 20 }),
});

const QuickReplyCategoryUpdateBodySchema = Type.Object({
  title: Type.String({ minLength: 1, maxLength: 20 }),
});

const QuickReplyCategoryParamsSchema = Type.Object({
  categoryId: Type.String({ minLength: 1, maxLength: 64 }),
});

const QuickReplyListQuerySchema = Type.Object({
  category_id: Type.Optional(Type.String({ maxLength: 64 })),
  keyword: Type.Optional(Type.String({ maxLength: 100 })),
  page: Type.Optional(Type.Number({ minimum: 1 })),
  page_size: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
  scope_type: Type.Number({ minimum: 1, maximum: 2 }),
});

const QuickReplyBodySchema = Type.Object({
  attachments: Type.Optional(Type.Array(Type.Any(), { maxItems: 5 })),
  categoryId: Type.Optional(Type.Union([Type.String({ maxLength: 64 }), Type.Literal(0)])),
  contentText: Type.Optional(Type.String({ maxLength: 1000 })),
  labelColor: Type.Optional(Type.Union([Type.Literal(""), Type.Literal("orange"), Type.Literal("green"), Type.Literal("blue")])),
  labelText: Type.Optional(Type.String({ maxLength: 10 })),
  scopeType: Type.Number({ minimum: 1, maximum: 2 }),
});

const QuickReplyParamsSchema = Type.Object({
  quickReplyId: Type.String({ minLength: 1, maxLength: 64 }),
});
```

- [ ] **Step 4: Add routes**

Register routes before poll routes:

```ts
app.get<{ Querystring: Static<typeof QuickReplyScopeQuerySchema> }>(
  "/api/server/quick-replies/categories",
  {
    preHandler: app.authenticate,
    schema: { querystring: QuickReplyScopeQuerySchema },
  },
  async (request) =>
    getWorkbenchService(app, request).listQuickReplyCategories(getSubUserId(request), {
      scopeType: request.query.scope_type,
    }),
);

app.post<{ Body: Static<typeof QuickReplyCategoryCreateBodySchema> }>(
  "/api/server/quick-replies/categories",
  {
    preHandler: app.authenticate,
    schema: { body: QuickReplyCategoryCreateBodySchema },
  },
  async (request) => {
    assertChatWriteAccess(request);
    return getWorkbenchService(app, request).createQuickReplyCategory(
      getSubUserId(request),
      request.body,
    );
  },
);

app.get<{ Querystring: Static<typeof QuickReplyListQuerySchema> }>(
  "/api/server/quick-replies",
  {
    preHandler: app.authenticate,
    schema: { querystring: QuickReplyListQuerySchema },
  },
  async (request) =>
    getWorkbenchService(app, request).listQuickReplies(getSubUserId(request), {
      categoryId: request.query.category_id,
      keyword: request.query.keyword,
      page: request.query.page ?? 1,
      pageSize: Math.min(request.query.page_size ?? 50, 100),
      scopeType: request.query.scope_type,
    }),
);
```

Add patch/delete/top routes for categories and replies using the same `assertChatWriteAccess` pattern as material management.
The route list must include:

- `PATCH /api/server/quick-replies/categories/:categoryId`
- `DELETE /api/server/quick-replies/categories/:categoryId`
- `POST /api/server/quick-replies/categories/:categoryId/top`
- `POST /api/server/quick-replies`
- `PATCH /api/server/quick-replies/:quickReplyId`
- `DELETE /api/server/quick-replies/:quickReplyId`
- `POST /api/server/quick-replies/:quickReplyId/top`

- [ ] **Step 5: Add service methods**

In `apps/backend/src/modules/chat/workbench.service.ts`, add methods:

```ts
async listQuickReplyCategories(
  subUserId: string,
  request: WorkbenchQuickReplyCategoryListRequest,
): Promise<WorkbenchQuickReplyCategoryListResponse> {
  const me = await this.requireSubUser(subUserId);
  return {
    categories: await this.repository.listQuickReplyCategories({
      scopeType: request.scopeType,
      subUserId,
      uid: me.uid,
    }),
  };
}

async listQuickReplies(
  subUserId: string,
  request: WorkbenchQuickReplyListRequest,
): Promise<WorkbenchQuickReplyListResponse> {
  const me = await this.requireSubUser(subUserId);
  const page = Math.max(1, request.page ?? 1);
  const pageSize = Math.min(Math.max(1, request.pageSize ?? 50), 100);
  const result = await this.repository.listQuickReplies({
    categoryId: request.categoryId,
    keyword: request.keyword,
    page,
    pageSize,
    scopeType: request.scopeType,
    subUserId,
    uid: me.uid,
  });

  return {
    items: result.items,
    pagination: {
      hasMore: page * pageSize < result.total,
      page,
      pageSize,
      total: result.total,
    },
  };
}

async createQuickReply(
  subUserId: string,
  request: WorkbenchQuickReplyCreateRequest,
): Promise<WorkbenchQuickReplyDto> {
  const me = await this.requireSubUser(subUserId);
  const attachments = normalizeQuickReplyAttachments(request.attachments ?? []);
  const validation = validateQuickReplyPayload({
    attachments,
    contentText: request.contentText ?? "",
  });

  if (!validation.ok) {
    throw new BadRequestError("INVALID_QUICK_REPLY", validation.errorMsg);
  }

  return this.repository.createQuickReply({
    attachments,
    categoryId: request.categoryId ?? 0,
    contentText: request.contentText?.trim() ?? "",
    labelColor: request.labelColor?.trim() ?? "",
    labelText: request.labelText?.trim() ?? "",
    opSubUid: parseMySqlId(subUserId) ?? 0,
    scopeType: request.scopeType,
    sort: Date.now(),
    subUserId,
    uid: me.uid,
  });
}
```

Add update/delete/top/category methods with the same validation and scope rules.

Also add service helpers before writing:

- `assertQuickReplyWriteAccess(request)` should use the same non-viewer rule as `assertChatWriteAccess`; do not introduce a new role gate in v1.
- `validateQuickReplyCategoryScope({ categoryId, scopeType, subUserId, uid })` must return success for `categoryId = 0`, and otherwise verify the category exists, is active, and belongs to the same `uid + scope_type + sub_uid`.
- `countChildQuickReplyCategories({ categoryId, scopeType, subUserId, uid })` must be checked before deleting a category.
- `countQuickRepliesInCategory({ categoryId, scopeType, subUserId, uid })` must be checked before deleting a category.
- `normalizeQuickReplyLabelColor(value)` must allow only `""`, `orange`, `green`, and `blue`.
- `contentText` must be trimmed and limited to 1000 characters in both route schema and service validation.
- `file/h5/weapp/sphfeed` attachments must have `materialCollectionId` and `msgid`; sending uses `msgid/content`, not a material collection lookup.
- The send branch must prioritize `msgid` over `materialCollectionId`. A segment with `msgid` is a quick-reply snapshot send, even if it also has `materialCollectionId`; a segment without `msgid` but with `materialCollectionId` is a material-library send.

Update `buildJavaSendMessageData()` / `buildJavaSendMessageData(uid, subUserId, payload, segment)` behavior by source:

- `emotion` still uses `materialCollectionId` lookup because custom expression sending is a material-library action.
- Quick-reply `file` segments send directly from segment `fileName/url`, even when `materialCollectionId/msgid` exists.
- Quick-reply `h5` segments send directly from segment `title/href/desc/coverUrl`, even when `materialCollectionId/msgid` exists.
- Quick-reply `weapp` segments must use `segment.msgid` and call `buildForwardJavaSendMessageData("weapp", segment.msgid)`.
- `sphfeed` sends remain blocked before the backend send call while video号 sending is unavailable.
- Material-library-originated sends can keep their current `materialCollectionId` lookup path. Do not use that fallback for quick-reply-originated segments, because quick replies intentionally duplicate the send data.

Add backend tests for both branches:

```ts
it("sends quick reply file snapshots from inline url when materialCollectionId is also present", async () => {
  await service.sendMessage({
    ...baseSendPayload,
    segment: {
      fileName: "报价单.pdf",
      materialCollectionId: "9",
      msgid: "1025657",
      type: "file",
      url: "https://example.com/file.pdf",
    },
  });

  expect(sendMessageToJava).toHaveBeenCalledWith(
    expect.objectContaining({
      msgData: expect.objectContaining({
        fileName: "报价单.pdf",
        fileUrl: "https://example.com/file.pdf",
        msgtype: "file",
      }),
    }),
  );
  expect(repository.findMaterialCollectionById).not.toHaveBeenCalled();
});

it("uses material lookup only when file segment has materialCollectionId without msgid", async () => {
  await service.sendMessage({
    ...baseSendPayload,
    segment: {
      materialCollectionId: "9",
      type: "file",
    },
  });

  expect(repository.findMaterialCollectionById).toHaveBeenCalledWith(
    expect.objectContaining({ id: "9" }),
  );
});
```

- [ ] **Step 6: Run backend service tests**

```bash
pnpm --filter @chatai/backend test test/modules/chat/workbench.service.test.ts
pnpm --filter @chatai/backend build
```

Expected: both pass.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/chat/chat.routes.ts apps/backend/src/modules/chat/workbench.service.ts apps/backend/test/modules/chat/workbench.service.test.ts
git commit -m "feat: add quick reply backend api"
```

---

## Task 4: Web Service Adapter And Segment Conversion

**Files:**
- Modify: `apps/web/src/pages/chat/api/workbench-service.ts`
- Modify: `apps/web/src/pages/chat/lib/composer-segments.ts`
- Create: `apps/web/src/pages/chat/lib/quick-reply-segments.ts`
- Test: `apps/web/test/pages/chat/quick-reply-segments.test.ts`
- Test: `apps/web/test/pages/chat/workbench-service.test.ts`

- [ ] **Step 1: Write segment conversion tests**

Create `apps/web/test/pages/chat/quick-reply-segments.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { WorkbenchQuickReplyDto } from "@chatai/contracts";
import { buildQuickReplyComposerSegments } from "@/pages/chat/lib/quick-reply-segments";

describe("buildQuickReplyComposerSegments", () => {
  it("converts main text and attachments to composer segments", () => {
    const quickReply: WorkbenchQuickReplyDto = {
      attachments: [
        {
          type: "h5",
          materialCollectionId: "8",
          msgid: "1025656",
          content: {
            coverUrl: "https://example.com/cover.png",
            desc: "描述",
            href: "https://example.com",
            title: "活动链接",
          },
        },
        {
          type: "file",
          materialCollectionId: "9",
          msgid: "1025657",
          content: {
            fileName: "报价单.pdf",
            fileSizeLabel: "12 KB",
            fileUrl: "https://example.com/file.pdf",
          },
        },
      ],
      categoryId: 0,
      contentText: "您好",
      id: "1",
      labelColor: "orange",
      labelText: "售前",
      scopeType: 1,
      sort: 100,
    };

    expect(buildQuickReplyComposerSegments(quickReply)).toEqual([
      { type: "text", text: "您好" },
      {
        type: "h5",
        coverUrl: "https://example.com/cover.png",
        desc: "描述",
        href: "https://example.com",
        materialCollectionId: "8",
        msgid: "1025656",
        title: "活动链接",
      },
      {
        type: "file",
        extension: "pdf",
        fileName: "报价单.pdf",
        fileSizeLabel: "12 KB",
        materialCollectionId: "9",
        msgid: "1025657",
        url: "https://example.com/file.pdf",
      },
    ]);
  });

  it("keeps sphfeed as a segment so send can show the unavailable message", () => {
    expect(
      buildQuickReplyComposerSegments({
        attachments: [
          {
            type: "sphfeed",
            materialCollectionId: "10",
            msgid: "1025658",
            content: { title: "视频号" },
          },
        ],
        categoryId: 0,
        contentText: "",
        id: "2",
        labelColor: "",
        labelText: "",
        scopeType: 1,
        sort: 100,
      }),
    ).toEqual([
      {
        type: "sphfeed",
        materialCollectionId: "10",
        msgid: "1025658",
        title: "视频号",
      },
    ]);
  });

  it("builds the initial composer draft as text first and keeps attachment order", () => {
    const quickReply: WorkbenchQuickReplyDto = {
      attachments: [
        {
          type: "h5",
          materialCollectionId: "8",
          msgid: "1025656",
          content: {
            href: "https://example.com",
            title: "活动链接",
          },
        },
        {
          type: "image",
          content: {
            fileUrl: "https://example.com/image.png",
          },
        },
        {
          type: "weapp",
          materialCollectionId: "9",
          msgid: "1025657",
          content: {
            title: "小程序",
          },
        },
      ],
      categoryId: 0,
      contentText: "您好",
      id: "3",
      labelColor: "",
      labelText: "",
      scopeType: 1,
      sort: 100,
    };

    expect(buildQuickReplyComposerSegments(quickReply).map((segment) => segment.type)).toEqual([
      "text",
      "h5",
      "image",
      "weapp",
    ]);
  });
});
```

- [ ] **Step 2: Run failing web tests**

```bash
pnpm --filter @chatai/web test test/pages/chat/quick-reply-segments.test.ts
```

Expected: fail because the conversion module does not exist.

- [ ] **Step 3: Extend composer segment types**

In `apps/web/src/pages/chat/lib/composer-segments.ts`, add optional `msgid` to file/H5/weapp/sphfeed segments:

```ts
export type ComposerFileSegment = {
  type: "file";
  extension: string;
  fileId?: string;
  fileName: string;
  materialCollectionId?: string;
  msgid?: string;
  fileSize?: number;
  fileSizeLabel?: string;
  url?: string;
};

export type ComposerH5Segment = {
  type: "h5";
  coverUrl?: string;
  desc?: string;
  href?: string;
  materialCollectionId?: string;
  msgid?: string;
  title: string;
};

export type ComposerMiniProgramSegment = {
  type: "weapp";
  materialCollectionId?: string;
  msgid?: string;
  appName?: string;
  coverImageUrl?: string;
  logoUrl?: string;
  sourceLabel?: string;
  title?: string;
};

export type ComposerSphfeedSegment = {
  type: "sphfeed";
  materialCollectionId?: string;
  msgid?: string;
  description?: string;
  imageUrl?: string;
  sourceLabel?: string;
  title?: string;
  url?: string;
};
```

- [ ] **Step 4: Implement conversion**

Create `apps/web/src/pages/chat/lib/quick-reply-segments.ts`:

```ts
import type { WorkbenchQuickReplyDto } from "@chatai/contracts";
import type { ComposerSegment } from "@/pages/chat/lib/composer-segments";

export function buildQuickReplyComposerSegments(
  quickReply: WorkbenchQuickReplyDto,
): ComposerSegment[] {
  const segments: ComposerSegment[] = [];
  const text = quickReply.contentText.trim();

  if (text) {
    segments.push({ type: "text", text });
  }

  for (const attachment of quickReply.attachments) {
    if (attachment.type === "image") {
      const fileUrl = readString(attachment.content.fileUrl);
      if (fileUrl) {
        segments.push({
          alt: readString(attachment.content.alt) || "图片",
          url: fileUrl,
          type: "image",
        });
      }
    }

    if (attachment.type === "file") {
      const fileName = readString(attachment.content.fileName);
      const fileUrl = readString(attachment.content.fileUrl);
      if (fileName && fileUrl) {
        segments.push({
          extension: resolveFileExtension(fileName),
          fileName,
          fileSize: readNumber(attachment.content.fileSize),
          fileSizeLabel: readString(attachment.content.fileSizeLabel) || undefined,
          materialCollectionId: attachment.materialCollectionId,
          msgid: attachment.msgid,
          type: "file",
          url: fileUrl,
        });
      }
    }

    if (attachment.type === "h5") {
      const title = readString(attachment.content.title);
      const href = readString(attachment.content.href);
      if (title && href) {
        segments.push({
          coverUrl: readString(attachment.content.coverUrl) || undefined,
          desc: readString(attachment.content.desc) || readString(attachment.content.description) || undefined,
          href,
          materialCollectionId: attachment.materialCollectionId,
          msgid: attachment.msgid,
          title,
          type: "h5",
        });
      }
    }

    if (attachment.type === "weapp" && attachment.materialCollectionId && attachment.msgid) {
      segments.push({
        appName: readString(attachment.content.appName) || undefined,
        coverImageUrl: readString(attachment.content.coverImageUrl) || undefined,
        logoUrl: readString(attachment.content.logoUrl) || undefined,
        materialCollectionId: attachment.materialCollectionId,
        msgid: attachment.msgid,
        sourceLabel: readString(attachment.content.sourceLabel) || undefined,
        title: readString(attachment.content.title) || undefined,
        type: "weapp",
      });
    }

    if (attachment.type === "sphfeed" && attachment.materialCollectionId && attachment.msgid) {
      segments.push({
        description: readString(attachment.content.description) || undefined,
        imageUrl: readString(attachment.content.imageUrl) || undefined,
        materialCollectionId: attachment.materialCollectionId,
        msgid: attachment.msgid,
        sourceLabel: readString(attachment.content.sourceLabel) || undefined,
        title: readString(attachment.content.title) || undefined,
        type: "sphfeed",
        url: readString(attachment.content.url) || undefined,
      });
    }
  }

  return segments;
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function resolveFileExtension(fileName: string) {
  const extension = fileName.split(".").pop()?.trim().toLowerCase();
  return extension && extension !== fileName.toLowerCase() ? extension : "";
}
```

- [ ] **Step 5: Add web service methods**

In `apps/web/src/pages/chat/api/workbench-service.ts`, import quick-reply request/response types and extend `WorkbenchService`:

```ts
listQuickReplyCategories: (
  request: WorkbenchQuickReplyCategoryListRequest,
) => Promise<WorkbenchQuickReplyCategoryListResponse>;
listQuickReplies: (
  request: WorkbenchQuickReplyListRequest,
) => Promise<WorkbenchQuickReplyListResponse>;
createQuickReply: (
  request: WorkbenchQuickReplyCreateRequest,
) => Promise<WorkbenchQuickReplyDto>;
updateQuickReply: (
  quickReplyId: string,
  request: WorkbenchQuickReplyUpdateRequest,
) => Promise<WorkbenchQuickReplyOkResponse>;
deleteQuickReply: (quickReplyId: string) => Promise<WorkbenchQuickReplyOkResponse>;
```

Add HTTP calls:

```ts
listQuickReplyCategories(request) {
  return http.get<WorkbenchQuickReplyCategoryListResponse>(
    "/server/quick-replies/categories",
    { params: { scope_type: request.scopeType } },
  );
},
listQuickReplies(request) {
  return http.get<WorkbenchQuickReplyListResponse>("/server/quick-replies", {
    params: {
      category_id: request.categoryId,
      keyword: request.keyword,
      page: request.page,
      page_size: request.pageSize,
      scope_type: request.scopeType,
    },
  });
},
```

Add mock implementations backed by arrays in `MockState`.

- [ ] **Step 6: Run web tests**

```bash
pnpm --filter @chatai/web test test/pages/chat/quick-reply-segments.test.ts test/pages/chat/workbench-service.test.ts
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/pages/chat/api/workbench-service.ts apps/web/src/pages/chat/lib/composer-segments.ts apps/web/src/pages/chat/lib/quick-reply-segments.ts apps/web/test/pages/chat/quick-reply-segments.test.ts apps/web/test/pages/chat/workbench-service.test.ts
git commit -m "feat: add quick reply web service"
```

---

## Task 5: Sidebar Quick Reply Panel

**Files:**
- Create: `apps/web/src/pages/chat/components/quick-reply/quick-reply-panel.tsx`
- Create: `apps/web/src/pages/chat/hooks/use-quick-replies.ts`
- Modify: `apps/web/src/pages/chat/components/customer-side-panel.tsx`
- Modify: `apps/web/src/pages/chat/components/chat-panel.tsx`
- Modify: `apps/web/src/pages/chat/chat-workbench-page.tsx`
- Test: `apps/web/test/pages/chat/customer-side-panel.test.tsx`
- Test: `apps/web/test/pages/chat/quick-reply-panel.test.tsx`

- [ ] **Step 1: Write side-panel tests**

Update `apps/web/test/pages/chat/customer-side-panel.test.tsx`:

```ts
it("shows quick reply tab for single and group conversations", () => {
  const { rerender } = renderCustomerSidePanel({ conversationMode: "single" });

  expect(screen.getByRole("tab", { name: "快捷话术" })).toBeInTheDocument();

  rerender(renderCustomerSidePanelElement({ conversationMode: "group" }));

  expect(screen.getByRole("tab", { name: "快捷话术" })).toBeInTheDocument();
});
```

Create `apps/web/test/pages/chat/quick-reply-panel.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { QuickReplyPanel } from "@/pages/chat/components/quick-reply/quick-reply-panel";

describe("QuickReplyPanel", () => {
  it("calls onSelectQuickReply when a reply is clicked", async () => {
    const onSelectQuickReply = vi.fn();

    render(
      <QuickReplyPanel
        activeCategoryId={0}
        activeScopeType={1}
        categories={[]}
        isLoading={false}
        keyword=""
        onCategoryChange={vi.fn()}
        onKeywordChange={vi.fn()}
        onScopeTypeChange={vi.fn()}
        onSelectQuickReply={onSelectQuickReply}
        quickReplies={[
          {
            attachments: [],
            categoryId: 0,
            contentText: "您好，请问有什么可以帮您",
            id: "1",
            labelColor: "orange",
            labelText: "售前",
            scopeType: 1,
            sort: 100,
          },
        ]}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /您好/ }));

    expect(onSelectQuickReply).toHaveBeenCalledWith(
      expect.objectContaining({ id: "1" }),
    );
  });

  it("filters by keyword and shows attachment type icons", async () => {
    const onKeywordChange = vi.fn();

    render(
      <QuickReplyPanel
        activeCategoryId={0}
        activeScopeType={1}
        categories={[]}
        isLoading={false}
        keyword=""
        onCategoryChange={vi.fn()}
        onKeywordChange={onKeywordChange}
        onScopeTypeChange={vi.fn()}
        onSelectQuickReply={vi.fn()}
        quickReplies={[
          {
            attachments: [
              {
                type: "h5",
                materialCollectionId: "8",
                msgid: "1025656",
                content: { href: "https://example.com", title: "活动" },
              },
            ],
            categoryId: 0,
            contentText: "活动说明",
            id: "1",
            labelColor: "orange",
            labelText: "售前",
            scopeType: 1,
            sort: 100,
          },
        ]}
      />,
    );

    await userEvent.type(screen.getByPlaceholderText("搜索话术"), "活动");

    expect(onKeywordChange).toHaveBeenCalled();
    expect(screen.getByLabelText("包含链接附件")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run failing tests**

```bash
pnpm --filter @chatai/web test test/pages/chat/customer-side-panel.test.tsx test/pages/chat/quick-reply-panel.test.tsx
```

Expected: fail because panel and side-tab props do not exist.

- [ ] **Step 3: Implement QuickReplyPanel**

Create `apps/web/src/pages/chat/components/quick-reply/quick-reply-panel.tsx`:

```tsx
import type {
  QuickReplyScopeType,
  WorkbenchQuickReplyAttachment,
  WorkbenchQuickReplyCategoryDto,
  WorkbenchQuickReplyDto,
} from "@chatai/contracts";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

type QuickReplyPanelProps = {
  activeCategoryId: string | 0;
  activeScopeType: QuickReplyScopeType;
  categories: WorkbenchQuickReplyCategoryDto[];
  isLoading: boolean;
  keyword: string;
  quickReplies: WorkbenchQuickReplyDto[];
  onCategoryChange: (categoryId: string | 0) => void;
  onKeywordChange: (keyword: string) => void;
  onScopeTypeChange: (scopeType: QuickReplyScopeType) => void;
  onSelectQuickReply: (quickReply: WorkbenchQuickReplyDto) => void;
};

export function QuickReplyPanel({
  activeCategoryId,
  activeScopeType,
  categories,
  isLoading,
  keyword,
  quickReplies,
  onCategoryChange,
  onKeywordChange,
  onScopeTypeChange,
  onSelectQuickReply,
}: QuickReplyPanelProps) {
  const topLevelCategories = categories.filter((category) => category.parentId === 0);
  const childCategoriesByParentId = new Map<string, WorkbenchQuickReplyCategoryDto[]>();

  for (const category of categories) {
    if (category.parentId === 0) {
      continue;
    }

    const parentId = String(category.parentId);
    childCategoriesByParentId.set(parentId, [
      ...(childCategoriesByParentId.get(parentId) ?? []),
      category,
    ]);
  }

  return (
    <section className="flex h-full min-h-0 flex-col bg-background">
      <div className="border-b border-divider px-4 py-3">
        <div className="grid grid-cols-2 rounded-md bg-muted p-1">
          <Button
            aria-pressed={activeScopeType === 1}
            className="h-8"
            onClick={() => onScopeTypeChange(1)}
            size="sm"
            type="button"
            variant={activeScopeType === 1 ? "secondary" : "ghost"}
          >
            企业话术
          </Button>
          <Button
            aria-pressed={activeScopeType === 2}
            className="h-8"
            onClick={() => onScopeTypeChange(2)}
            size="sm"
            type="button"
            variant={activeScopeType === 2 ? "secondary" : "ghost"}
          >
            个人话术
          </Button>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <input
            className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onChange={(event) => onKeywordChange(event.target.value)}
            placeholder="搜索话术"
            value={keyword}
          />
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="w-28 shrink-0 border-r border-divider p-3">
          <CategoryButton
            active={activeCategoryId === 0}
            label="未分类"
            onClick={() => onCategoryChange(0)}
          />
          {topLevelCategories.map((category) => (
            <div key={category.id}>
              <CategoryButton
                active={activeCategoryId === category.id}
                label={category.title}
                onClick={() => onCategoryChange(category.id)}
              />
              {(childCategoriesByParentId.get(category.id) ?? []).map((childCategory) => (
                <CategoryButton
                  active={activeCategoryId === childCategory.id}
                  key={childCategory.id}
                  label={childCategory.title}
                  level={2}
                  onClick={() => onCategoryChange(childCategory.id)}
                />
              ))}
            </div>
          ))}
        </aside>

        <div className="min-w-0 flex-1 overflow-y-auto p-3">
          {isLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Spinner className="size-5" />
            </div>
          ) : quickReplies.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
              暂无话术
            </div>
          ) : (
            <div className="space-y-2">
              {quickReplies.map((quickReply) => (
                <button
                  aria-label={quickReply.contentText || "附件话术"}
                  className="w-full rounded-md border border-border bg-card p-3 text-left text-sm hover:bg-muted"
                  key={quickReply.id}
                  onClick={() => onSelectQuickReply(quickReply)}
                  type="button"
                >
                  <div className="flex items-center gap-2">
                    {quickReply.labelText ? (
                      <span className={cn("rounded px-1.5 py-0.5 text-xs", getLabelClassName(quickReply.labelColor))}>
                        {quickReply.labelText}
                      </span>
                    ) : null}
                    <span className="truncate">
                      {quickReply.contentText || getAttachmentSummary(quickReply)}
                    </span>
                    <AttachmentTypeIcons quickReply={quickReply} />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function CategoryButton({
  active,
  label,
  level = 1,
  onClick,
}: {
  active: boolean;
  label: string;
  level?: 1 | 2;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "mb-1 h-8 w-full truncate rounded-md px-2 text-left text-sm",
        level === 2 && "pl-5 text-xs",
        active ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground" : "text-muted-foreground hover:bg-muted",
      )}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function getLabelClassName(color: string) {
  if (color === "green") {
    return "bg-green-100 text-green-700";
  }
  if (color === "blue") {
    return "bg-blue-100 text-blue-700";
  }
  return "bg-orange-100 text-orange-700";
}

function getAttachmentSummary(quickReply: WorkbenchQuickReplyDto) {
  if (quickReply.attachments.some((attachment) => attachment.type === "h5")) {
    return "[链接]";
  }
  if (quickReply.attachments.some((attachment) => attachment.type === "weapp")) {
    return "[小程序]";
  }
  if (quickReply.attachments.some((attachment) => attachment.type === "sphfeed")) {
    return "[视频号]";
  }
  if (quickReply.attachments.some((attachment) => attachment.type === "file")) {
    return "[文件]";
  }
  return "[图片]";
}

function getAttachmentTypeLabel(type: WorkbenchQuickReplyAttachment["type"]) {
  if (type === "h5") {
    return "包含链接附件";
  }
  if (type === "weapp") {
    return "包含小程序附件";
  }
  if (type === "sphfeed") {
    return "包含视频号附件";
  }
  if (type === "file") {
    return "包含文件附件";
  }
  return "包含图片附件";
}

function getAttachmentTypeShortLabel(type: WorkbenchQuickReplyAttachment["type"]) {
  if (type === "h5") {
    return "链";
  }
  if (type === "weapp") {
    return "小";
  }
  if (type === "sphfeed") {
    return "视";
  }
  if (type === "file") {
    return "文";
  }
  return "图";
}

function AttachmentTypeIcons({ quickReply }: { quickReply: WorkbenchQuickReplyDto }) {
  const types = Array.from(new Set(quickReply.attachments.map((attachment) => attachment.type)));

  return (
    <span className="ml-auto flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
      {types.map((type) => (
        <span aria-label={getAttachmentTypeLabel(type)} key={type}>
          {getAttachmentTypeShortLabel(type)}
        </span>
      ))}
    </span>
  );
}
```

Use Hugeicons in the real implementation for attachment icons. The plan snippet uses text labels only to keep the test focused on behavior, not icon library internals.

- [ ] **Step 4: Implement hook**

Create `apps/web/src/pages/chat/hooks/use-quick-replies.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import {
  QUICK_REPLY_SCOPE_TYPE,
  type QuickReplyScopeType,
  type WorkbenchQuickReplyCategoryDto,
  type WorkbenchQuickReplyDto,
} from "@chatai/contracts";
import { toast } from "sonner";
import { getWorkbenchService } from "@/pages/chat/api/workbench-service";

export function useQuickReplies() {
  const [activeScopeType, setActiveScopeType] = useState<QuickReplyScopeType>(
    QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
  );
  const [activeCategoryId, setActiveCategoryId] = useState<string | 0>(0);
  const [keywordInput, setKeywordInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [categories, setCategories] = useState<WorkbenchQuickReplyCategoryDto[]>([]);
  const [quickReplies, setQuickReplies] = useState<WorkbenchQuickReplyDto[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const requestSeqRef = useRef(0);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setKeyword(keywordInput.trim());
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [keywordInput]);

  const loadQuickReplies = useCallback(async () => {
    const requestSeq = requestSeqRef.current + 1;
    requestSeqRef.current = requestSeq;
    setIsLoading(true);

    try {
      const [categoryResponse, replyResponse] = await Promise.all([
        getWorkbenchService().listQuickReplyCategories({ scopeType: activeScopeType }),
        getWorkbenchService().listQuickReplies({
          categoryId: activeCategoryId,
          keyword,
          page: 1,
          pageSize: 50,
          scopeType: activeScopeType,
        }),
      ]);

      if (requestSeqRef.current !== requestSeq) {
        return;
      }

      setCategories(categoryResponse.categories);
      setQuickReplies(replyResponse.items);
    } catch (error) {
      if (requestSeqRef.current === requestSeq) {
        toast.warning("快捷话术加载失败");
      }
    } finally {
      if (requestSeqRef.current === requestSeq) {
        setIsLoading(false);
      }
    }
  }, [activeCategoryId, activeScopeType, keyword]);

  useEffect(() => {
    void loadQuickReplies();
  }, [loadQuickReplies]);

  return {
    activeCategoryId,
    activeScopeType,
    categories,
    isLoading,
    keyword: keywordInput,
    quickReplies,
    reload: loadQuickReplies,
    setActiveCategoryId,
    setKeyword: setKeywordInput,
    setActiveScopeType(nextScopeType: QuickReplyScopeType) {
      setActiveScopeType(nextScopeType);
      setActiveCategoryId(0);
      setKeywordInput("");
      setKeyword("");
    },
  };
}
```

The quick-reply list API is paginated, but v1 UI intentionally loads only `page: 1, pageSize: 50` and does not render a load-more control. Search input must debounce for 300ms before reloading. If product needs larger libraries, add pagination UI as a follow-up instead of silently fetching every page.

- [ ] **Step 5: Add fixed sidebar tab**

Modify `apps/web/src/pages/chat/components/customer-side-panel.tsx`:

Add props:

```ts
quickReplyPanel?: ReactNode;
```

Add a fixed entry before custom iframe entries:

```ts
const quickReplyEntry = {
  id: "quick-reply",
  kind: "quick-reply" as const,
  name: "快捷话术",
  value: "quick-reply",
};

const sidebarEntries = [
  ...(isGroupConversation ? [systemEntry] : []),
  quickReplyEntry,
  ...activeSidebarItems.map(...),
];
```

Render content:

```tsx
<TabsContent className="mt-0 min-h-0 flex-1 overflow-hidden" value="quick-reply">
  {quickReplyPanel}
</TabsContent>
```

For single conversations, `defaultSidebarValue` should become `"quick-reply"` when there are no custom sidebars.

- [ ] **Step 6: Wire page state and fill composer**

In `apps/web/src/pages/chat/chat-workbench-page.tsx`, use the hook:

```ts
const quickReplies = useQuickReplies();

const handleSelectQuickReply = (quickReply: WorkbenchQuickReplyDto) => {
  const nextSegments = buildQuickReplyComposerSegments(quickReply);

  if (nextSegments.length === 0) {
    toast.warning("话术数据异常");
    return;
  }

  setComposerSegments(nextSegments);
  composerRef.current?.dispatchCommand(RESTORE_COMPOSER_COMMAND, {
    segments: nextSegments,
  });
  composerRef.current?.focus();
};
```

Use the existing `RESTORE_COMPOSER_COMMAND`; do not add `SET_COMPOSER_SEGMENTS_COMMAND`. The quick-reply selection builds only the initial composer segments. `RESTORE_COMPOSER_COMMAND` should restore all composer-supported segment types into the editor document: existing `text/image` nodes plus the new Lite nodes for `file/h5/weapp/sphfeed`. After restore, normal composer editing owns the draft. Do not keep a separate quick-reply attachment array that can later override the user's edited order.

Pass:

```tsx
quickReplyPanel={
  <QuickReplyPanel
    activeCategoryId={quickReplies.activeCategoryId}
    activeScopeType={quickReplies.activeScopeType}
    categories={quickReplies.categories}
    isLoading={quickReplies.isLoading}
    keyword={quickReplies.keyword}
    onCategoryChange={quickReplies.setActiveCategoryId}
    onKeywordChange={quickReplies.setKeyword}
    onScopeTypeChange={quickReplies.setActiveScopeType}
    onSelectQuickReply={handleSelectQuickReply}
    quickReplies={quickReplies.quickReplies}
  />
}
```

- [ ] **Step 7: Run panel tests**

```bash
pnpm --filter @chatai/web test test/pages/chat/customer-side-panel.test.tsx test/pages/chat/quick-reply-panel.test.tsx
```

Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/pages/chat/components/quick-reply/quick-reply-panel.tsx apps/web/src/pages/chat/hooks/use-quick-replies.ts apps/web/src/pages/chat/components/customer-side-panel.tsx apps/web/src/pages/chat/components/chat-panel.tsx apps/web/src/pages/chat/chat-workbench-page.tsx apps/web/test/pages/chat/customer-side-panel.test.tsx apps/web/test/pages/chat/quick-reply-panel.test.tsx
git commit -m "feat: add quick reply sidebar panel"
```

---

## Task 6: Composer Draft Integration And Lite Attachment Cards

**Files:**
- Modify: `apps/web/src/pages/chat/components/composer/lexical-nodes.tsx`
- Modify: `apps/web/src/pages/chat/components/composer/lexical-utils.ts`
- Modify: `apps/web/src/pages/chat/components/composer/lexical-plugins.tsx`
- Modify: `apps/web/src/pages/chat/components/chat-composer.tsx`
- Modify: `apps/web/src/pages/chat/chat-workbench-page.tsx`
- Modify: `apps/web/src/pages/chat/lib/conversation-composer-draft.ts`
- Test: `apps/web/test/pages/chat/composer-lexical-utils.test.ts`
- Test: `apps/web/test/pages/chat/chat-workbench-composer.int.test.tsx`

- [ ] **Step 1: Write fill composer integration test**

Add to `apps/web/test/pages/chat/chat-workbench-composer.int.test.tsx`:

```tsx
it("fills composer from a quick reply with text and H5 attachment", async () => {
  const service = createMockWorkbenchService();
  vi.spyOn(service, "listQuickReplyCategories").mockResolvedValue({ categories: [] });
  vi.spyOn(service, "listQuickReplies").mockResolvedValue({
    items: [
      {
        attachments: [
          {
            type: "h5",
            materialCollectionId: "8",
            msgid: "1025656",
            content: {
              href: "https://example.com",
              title: "活动链接",
            },
          },
        ],
        categoryId: 0,
        contentText: "您好",
        id: "qr-1",
        labelColor: "orange",
        labelText: "售前",
        scopeType: 1,
        sort: 100,
      },
    ],
    pagination: { hasMore: false, page: 1, pageSize: 50, total: 1 },
  });
  setWorkbenchService(service);

  render(<ChatWorkbenchPage />);

  await userEvent.click(await screen.findByRole("tab", { name: "快捷话术" }));
  await userEvent.click(await screen.findByRole("button", { name: /您好/ }));

  expect(screen.getByRole("textbox")).toHaveTextContent("您好");
  expect(screen.getByText("活动链接")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run failing integration test**

```bash
pnpm --filter @chatai/web test test/pages/chat/chat-workbench-composer.int.test.tsx
```

Expected: fail until composer fill command and Lite cards are implemented.

- [ ] **Step 3: Add Lite attachment Lexical nodes**

Do not render file/H5/weapp/sphfeed in a separate external tray. They must be Lexical nodes in the same composer document flow as text and image, otherwise user edits cannot define what will be sent.

In `apps/web/src/pages/chat/components/composer/lexical-nodes.tsx`, add a `ComposerLiteAttachmentNode` or one focused node per attachment type. The node payload should store a `ComposerFileSegment | ComposerH5Segment | ComposerMiniProgramSegment | ComposerSphfeedSegment` and render a compact non-link card:

```ts
export type ComposerLiteAttachmentSegment =
  | ComposerFileSegment
  | ComposerH5Segment
  | ComposerMiniProgramSegment
  | ComposerSphfeedSegment;

export class ComposerLiteAttachmentNode extends DecoratorNode<ReactNode> {
  static getType() {
    return "composer-lite-attachment";
  }

  getSegment(): ComposerLiteAttachmentSegment {
    return this.__segment;
  }
}
```

The real implementation should follow the existing `ComposerImageNode` serialization/decorator patterns in that file. Use Hugeicons and existing message-card visual language. Do not render interactive `<a>` links inside the editor card.

- [ ] **Step 4: Restore and export Lite nodes in the edited document order**

In `apps/web/src/pages/chat/components/composer/lexical-utils.ts`, extend `$restoreComposerFromSegments()`:

```ts
if (isComposerLiteAttachmentSegment(segment)) {
  $insertComposerLiteAttachment(segment);
  continue;
}
```

Extend `collectSegmentsFromNode()`:

```ts
if ($isComposerLiteAttachmentNode(node)) {
  segments.push(node.getSegment());
  return;
}
```

This is the critical behavior: `$exportComposerSegments()` must return the user's current editor document order. The text-first plus attachment-order rule applies only when a quick reply is first restored into composer. After that, whatever the user edits in composer is what gets exported and sent. Do not rebuild order from the original quick-reply payload at send time.

- [ ] **Step 5: Register nodes and keep the editor export as the send source**

In `apps/web/src/pages/chat/components/chat-composer.tsx`, register the Lite node in the Lexical config:

```tsx
nodes: [
  ComposerEmojiNode,
  ComposerImageNode,
  ComposerLiteAttachmentNode,
  ComposerMentionNode,
],
```

Do not add page-level merge logic that appends Lite attachments after editor content. `ComposerRuntimePlugin` already calls `onSegmentsChange(normalizeComposerSegments($exportComposerSegments()))`; after Lite nodes are exported, `composerSegments` can continue to be the page-level snapshot of the current editor state, but it must not be recomputed from the original quick-reply attachments.

- [ ] **Step 6: Preserve draft persistence and send behavior**

Ensure `handleSendDraft` uses the current composer draft after user edits. Do not add a separate quick-reply send path, and do not sort/rebuild segments from the original quick-reply payload at send time. Existing `sendAgentMessageSegments` should send one message per current segment in the edited composer order.

`conversation-composer-draft.ts` already stores `segments`; add a regression test that a draft containing `text/image/h5/file/weapp/sphfeed` segments survives `buildConversationComposerDraft()` and `RESTORE_COMPOSER_COMMAND`, then exports in the same order.

Add a send adapter update in `apps/web/src/store/workbench-store.ts` and contracts/backend send DTO if needed:

- `file/h5/weapp/sphfeed` composer segments may include `msgid`.
- `toWorkbenchSendSegment()` must use `msgid` as the branch selector:
  - if `segment.msgid` exists, return the full segment so file/H5 keep inline `url/title/href/desc/coverUrl`, and weapp/sphfeed keep `msgid`
  - if `segment.msgid` does not exist and `segment.materialCollectionId` exists, return the existing minimal material-library segment
- backend `sendMessage()` should use `segment.msgid` for quick-reply-originated `weapp` forwarding and should not require a material collection lookup for that segment. Quick-reply-originated `sphfeed` keeps `msgid` in the segment for future enablement, but current backend send must reject it with “视频号发送功能暂未开放” before material lookup or Java send.
- backend `sendMessage()` should send quick-reply-originated `file/h5` directly from segment `url/fileName/title/href/desc/coverUrl`; it must not look up the material collection when `msgid` exists.
- material-library-originated sends outside the quick-reply flow may keep the existing `materialCollectionId` lookup path.

Add a web store test for `toWorkbenchSendSegment` through the public send flow:

```ts
it("keeps quick reply file snapshot fields when msgid is present", async () => {
  await store.getState().sendAgentMessageSegments([
    {
      fileName: "报价单.pdf",
      materialCollectionId: "9",
      msgid: "1025657",
      type: "file",
      url: "https://example.com/file.pdf",
    },
  ]);

  expect(service.sendMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      segment: expect.objectContaining({
        fileName: "报价单.pdf",
        materialCollectionId: "9",
        msgid: "1025657",
        type: "file",
        url: "https://example.com/file.pdf",
      }),
    }),
  );
});
```

- [ ] **Step 7: Block sphfeed send with friendly copy**

If current code already blocks `sphfeed`, keep it. If not, add a guard before `sendAgentMessageSegments`:

```ts
if (normalizedSegments.some((segment) => segment.type === "sphfeed")) {
  toast.warning("视频号发送功能暂未开放");
  return;
}
```

- [ ] **Step 8: Run composer tests**

```bash
pnpm --filter @chatai/web test test/pages/chat/composer-lexical-utils.test.ts test/pages/chat/chat-workbench-composer.int.test.tsx
```

Expected: pass.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/pages/chat/components/composer/lexical-nodes.tsx apps/web/src/pages/chat/components/composer/lexical-utils.ts apps/web/src/pages/chat/components/composer/lexical-plugins.tsx apps/web/src/pages/chat/components/chat-composer.tsx apps/web/test/pages/chat/composer-lexical-utils.test.ts apps/web/test/pages/chat/chat-workbench-composer.int.test.tsx
git commit -m "feat: fill composer from quick replies"
```

---

## Task 7: Quick Reply Management UI

**Files:**
- Modify: `apps/web/src/pages/chat/components/quick-reply/quick-reply-panel.tsx`
- Create: `apps/web/src/pages/chat/components/quick-reply/quick-reply-form-dialog.tsx`
- Create: `apps/web/src/pages/chat/components/quick-reply/quick-reply-category-dialog.tsx`
- Create: `apps/web/src/pages/chat/components/quick-reply/quick-reply-attachment-picker.tsx`
- Modify: `apps/web/src/pages/chat/hooks/use-quick-replies.ts`
- Test: `apps/web/test/pages/chat/quick-reply-panel.test.tsx`

- [ ] **Step 1: Add management tests**

Extend `apps/web/test/pages/chat/quick-reply-panel.test.tsx`:

```tsx
import { QuickReplyFormDialog } from "@/pages/chat/components/quick-reply/quick-reply-form-dialog";

it("exposes create actions from the panel", async () => {
  const onCreateCategory = vi.fn();
  const onCreateQuickReply = vi.fn();

  render(
    <QuickReplyPanel
      activeCategoryId={0}
      activeScopeType={1}
      categories={[]}
      isLoading={false}
      keyword=""
      onCategoryChange={vi.fn()}
      onCreateCategory={onCreateCategory}
      onCreateQuickReply={onCreateQuickReply}
      onDeleteCategory={vi.fn()}
      onDeleteQuickReply={vi.fn()}
      onEditCategory={vi.fn()}
      onEditQuickReply={vi.fn()}
      onKeywordChange={vi.fn()}
      onScopeTypeChange={vi.fn()}
      onSelectQuickReply={vi.fn()}
      onTopCategory={vi.fn()}
      onTopQuickReply={vi.fn()}
      quickReplies={[]}
    />,
  );

  await userEvent.click(screen.getByRole("button", { name: "新建分类" }));
  await userEvent.click(screen.getByRole("button", { name: "新建话术" }));

  expect(onCreateCategory).toHaveBeenCalledWith(0);
  expect(onCreateQuickReply).toHaveBeenCalled();
});

it("exposes child category creation from a top-level category menu", async () => {
  const onCreateCategory = vi.fn();

  render(
    <QuickReplyPanel
      activeCategoryId={0}
      activeScopeType={1}
      categories={[
        {
          id: "cat-1",
          parentId: 0,
          scopeType: 1,
          sort: 100,
          title: "售前",
        },
      ]}
      isLoading={false}
      keyword=""
      onCategoryChange={vi.fn()}
      onCreateCategory={onCreateCategory}
      onCreateQuickReply={vi.fn()}
      onDeleteCategory={vi.fn()}
      onDeleteQuickReply={vi.fn()}
      onEditCategory={vi.fn()}
      onEditQuickReply={vi.fn()}
      onKeywordChange={vi.fn()}
      onScopeTypeChange={vi.fn()}
      onSelectQuickReply={vi.fn()}
      onTopCategory={vi.fn()}
      onTopQuickReply={vi.fn()}
      quickReplies={[]}
    />,
  );

  await userEvent.click(screen.getByRole("button", { name: "售前分类操作" }));
  await userEvent.click(screen.getByRole("menuitem", { name: "新建子分类" }));

  expect(onCreateCategory).toHaveBeenCalledWith("cat-1");
});

it("validates empty quick reply in the form dialog", async () => {
  render(
    <QuickReplyFormDialog
      open
      onOpenChange={vi.fn()}
      onSubmit={vi.fn()}
    />,
  );

  await userEvent.click(screen.getByRole("button", { name: "保存" }));

  expect(screen.getByText("请填写话术内容或添加附件")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run failing test**

```bash
pnpm --filter @chatai/web test test/pages/chat/quick-reply-panel.test.tsx
```

Expected: fail because management UI does not exist.

- [ ] **Step 3: Add management actions to QuickReplyPanel**

Extend `QuickReplyPanelProps` in `apps/web/src/pages/chat/components/quick-reply/quick-reply-panel.tsx`:

```ts
  onCreateCategory: (parentId: string | 0) => void;
  onCreateQuickReply: () => void;
  onDeleteCategory: (category: WorkbenchQuickReplyCategoryDto) => void;
  onDeleteQuickReply: (quickReply: WorkbenchQuickReplyDto) => void;
  onEditCategory: (category: WorkbenchQuickReplyCategoryDto) => void;
  onEditQuickReply: (quickReply: WorkbenchQuickReplyDto) => void;
  onTopCategory: (category: WorkbenchQuickReplyCategoryDto) => void;
  onTopQuickReply: (quickReply: WorkbenchQuickReplyDto) => void;
```

Add the creation buttons:

```tsx
<Button className="h-8" onClick={onCreateQuickReply} size="sm" type="button">
  新建话术
</Button>
```

Add row menus for category and quick-reply items using the existing `DropdownMenu` component pattern in the chat UI:

- top-level category menu: `移到最前` -> `onTopCategory(category)`, `新建子分类` -> `onCreateCategory(category.id)`, `编辑` -> `onEditCategory(category)`, `删除` -> `onDeleteCategory(category)`
- child category menu: `移到最前` -> `onTopCategory(category)`, `编辑` -> `onEditCategory(category)`, `删除` -> `onDeleteCategory(category)`
- quick reply menu: `移到最前` -> `onTopQuickReply(quickReply)`, `编辑` -> `onEditQuickReply(quickReply)`, `删除` -> `onDeleteQuickReply(quickReply)`

Use `DropdownMenuTrigger` with an icon button that has an accessible label such as `${category.title}分类操作`; tests should use role/name rather than class assertions.

```tsx
<Button
  className="mt-2 h-8 w-full"
  onClick={() => onCreateCategory(0)}
  size="sm"
  type="button"
  variant="outline"
>
  新建分类
</Button>
```

Do not add hover-only hidden functionality without keyboard access; use `DropdownMenuTrigger` with a small icon button and Hugeicons.

- [ ] **Step 4: Create quick reply form dialog with attachment editing**

Create `apps/web/src/pages/chat/components/quick-reply/quick-reply-form-dialog.tsx`:

```tsx
import { useState } from "react";
import {
  normalizeQuickReplyAttachments,
  validateQuickReplyPayload,
  type WorkbenchQuickReplyAttachment,
} from "@chatai/contracts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { QuickReplyAttachmentPicker } from "@/pages/chat/components/quick-reply/quick-reply-attachment-picker";

type QuickReplyFormDialogProps = {
  initialValues?: {
    attachments: WorkbenchQuickReplyAttachment[];
    contentText: string;
    labelColor: string;
    labelText: string;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: {
    attachments: WorkbenchQuickReplyAttachment[];
    contentText: string;
    labelColor: string;
    labelText: string;
  }) => Promise<void> | void;
};

export function QuickReplyFormDialog({
  initialValues,
  open,
  onOpenChange,
  onSubmit,
}: QuickReplyFormDialogProps) {
  const [contentText, setContentText] = useState(initialValues?.contentText ?? "");
  const [labelText, setLabelText] = useState(initialValues?.labelText ?? "");
  const [labelColor, setLabelColor] = useState(initialValues?.labelColor ?? "orange");
  const [attachments, setAttachments] = useState<WorkbenchQuickReplyAttachment[]>(
    initialValues?.attachments ?? [],
  );
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    const normalizedAttachments = normalizeQuickReplyAttachments(attachments);
    const validation = validateQuickReplyPayload({
      attachments: normalizedAttachments,
      contentText,
    });

    if (!validation.ok) {
      setError(validation.errorMsg);
      return;
    }

    await onSubmit({
      attachments: normalizedAttachments,
      contentText,
      labelColor,
      labelText,
    });
    onOpenChange(false);
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建话术</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Input
            maxLength={10}
            onChange={(event) => setLabelText(event.target.value)}
            placeholder="徽标文字，10字以内"
            value={labelText}
          />
          <div className="flex gap-2">
            {["orange", "green", "blue"].map((color) => (
              <Button
                aria-pressed={labelColor === color}
                key={color}
                onClick={() => setLabelColor(color)}
                size="sm"
                type="button"
                variant={labelColor === color ? "secondary" : "outline"}
              >
                {color}
              </Button>
            ))}
          </div>
          <Textarea
            maxLength={1000}
            onChange={(event) => setContentText(event.target.value)}
            placeholder="请输入话术内容"
            value={contentText}
          />
          <QuickReplyAttachmentPicker
            attachments={attachments}
            maxCount={5}
            onChange={setAttachments}
          />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
            取消
          </Button>
          <Button onClick={handleSubmit} type="button">
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

Create `apps/web/src/pages/chat/components/quick-reply/quick-reply-attachment-picker.tsx`. It must let users add up to 5 attachments:

- image: upload/direct image content with `content.fileUrl`
- file/H5/weapp/sphfeed: choose from the existing material library only
- when choosing from material library, write `materialCollectionId`, `msgid`, and `content` into the attachment
- allow removing attachments
- keep attachment array order stable; no image-first reorder

- [ ] **Step 5: Create category dialog**

Create `apps/web/src/pages/chat/components/quick-reply/quick-reply-category-dialog.tsx`:

```tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type QuickReplyCategoryDialogProps = {
  initialTitle?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (title: string) => Promise<void> | void;
};

export function QuickReplyCategoryDialog({
  initialTitle = "",
  open,
  onOpenChange,
  onSubmit,
}: QuickReplyCategoryDialogProps) {
  const [title, setTitle] = useState(initialTitle);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    const normalizedTitle = title.trim();

    if (!normalizedTitle) {
      setError("请输入分类名称");
      return;
    }

    if (normalizedTitle.length > 20) {
      setError("分类名称不能超过20字");
      return;
    }

    await onSubmit(normalizedTitle);
    onOpenChange(false);
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initialTitle ? "编辑分类" : "新建分类"}</DialogTitle>
        </DialogHeader>
        <Input
          maxLength={20}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="请输入分类名称，20字以内"
          value={title}
        />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
            取消
          </Button>
          <Button onClick={handleSubmit} type="button">
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 6: Wire create/update/delete/top handlers**

In `use-quick-replies.ts`, add:

```ts
const createQuickReply = useCallback(
  async (values: {
    attachments: WorkbenchQuickReplyAttachment[];
    contentText: string;
    labelColor: string;
    labelText: string;
  }) => {
    await getWorkbenchService().createQuickReply({
      ...values,
      categoryId: activeCategoryId,
      scopeType: activeScopeType,
    });
    await loadQuickReplies();
  },
  [activeCategoryId, activeScopeType, loadQuickReplies],
);
```

Also add and expose:

- `updateQuickReply(quickReplyId, values)`
- `deleteQuickReply(quickReplyId)`
- `topQuickReply(quickReplyId)`
- `createCategory({ parentId, title })`
- `updateCategory(categoryId, title)`
- `deleteCategory(categoryId)`
- `topCategory(categoryId)`

Every successful mutation should refresh the current category/reply list without changing the current active category unless the active category was deleted.

- [ ] **Step 7: Mount management dialogs from the page**

In `apps/web/src/pages/chat/chat-workbench-page.tsx`, keep dialog state close to the quick-reply panel wiring:

```ts
const [quickReplyFormState, setQuickReplyFormState] = useState<
  | { mode: "create" }
  | { mode: "edit"; quickReply: WorkbenchQuickReplyDto }
  | null
>(null);
const [quickReplyCategoryFormState, setQuickReplyCategoryFormState] = useState<
  | { mode: "create"; parentId: string | 0 }
  | { mode: "edit"; category: WorkbenchQuickReplyCategoryDto }
  | null
>(null);
```

Pass panel handlers:

```tsx
onCreateCategory={(parentId) => setQuickReplyCategoryFormState({ mode: "create", parentId })}
onCreateQuickReply={() => setQuickReplyFormState({ mode: "create" })}
onDeleteCategory={quickReplies.deleteCategory}
onDeleteQuickReply={quickReplies.deleteQuickReply}
onEditCategory={(category) => setQuickReplyCategoryFormState({ mode: "edit", category })}
onEditQuickReply={(quickReply) => setQuickReplyFormState({ mode: "edit", quickReply })}
onTopCategory={quickReplies.topCategory}
onTopQuickReply={quickReplies.topQuickReply}
```

Render `QuickReplyFormDialog` and `QuickReplyCategoryDialog` next to the panel so users can actually create and edit data in v1:

```tsx
<QuickReplyFormDialog
  initialValues={
    quickReplyFormState?.mode === "edit"
      ? {
          attachments: quickReplyFormState.quickReply.attachments,
          contentText: quickReplyFormState.quickReply.contentText,
          labelColor: quickReplyFormState.quickReply.labelColor,
          labelText: quickReplyFormState.quickReply.labelText,
        }
      : undefined
  }
  open={quickReplyFormState !== null}
  onOpenChange={(open) => {
    if (!open) {
      setQuickReplyFormState(null);
    }
  }}
  onSubmit={(values) =>
    quickReplyFormState?.mode === "edit"
      ? quickReplies.updateQuickReply(quickReplyFormState.quickReply.id, values)
      : quickReplies.createQuickReply(values)
  }
/>
```

```tsx
<QuickReplyCategoryDialog
  initialTitle={
    quickReplyCategoryFormState?.mode === "edit"
      ? quickReplyCategoryFormState.category.title
      : ""
  }
  open={quickReplyCategoryFormState !== null}
  onOpenChange={(open) => {
    if (!open) {
      setQuickReplyCategoryFormState(null);
    }
  }}
  onSubmit={(title) =>
    quickReplyCategoryFormState?.mode === "edit"
      ? quickReplies.updateCategory(quickReplyCategoryFormState.category.id, title)
      : quickReplies.createCategory({
          parentId: quickReplyCategoryFormState?.parentId ?? 0,
          title,
        })
  }
/>
```

- [ ] **Step 8: Run panel tests**

```bash
pnpm --filter @chatai/web test test/pages/chat/quick-reply-panel.test.tsx
```

Expected: pass.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/pages/chat/components/quick-reply/quick-reply-panel.tsx apps/web/src/pages/chat/components/quick-reply/quick-reply-form-dialog.tsx apps/web/src/pages/chat/components/quick-reply/quick-reply-category-dialog.tsx apps/web/src/pages/chat/components/quick-reply/quick-reply-attachment-picker.tsx apps/web/src/pages/chat/hooks/use-quick-replies.ts apps/web/test/pages/chat/quick-reply-panel.test.tsx
git commit -m "feat: add quick reply management ui"
```

---

## Task 8: Verification And PR Readiness

**Files:**
- Modify only if previous tasks reveal a real issue.

- [ ] **Step 1: Run focused tests**

```bash
pnpm --filter @chatai/contracts test test/chat-quick-reply-dto.test.ts
pnpm --filter @chatai/backend test test/modules/chat/workbench-repository.test.ts test/modules/chat/workbench.service.test.ts
pnpm --filter @chatai/web test test/pages/chat/quick-reply-segments.test.ts test/pages/chat/quick-reply-panel.test.tsx test/pages/chat/customer-side-panel.test.tsx test/pages/chat/chat-workbench-composer.int.test.tsx
```

Expected: all pass.

- [ ] **Step 2: Run affected builds**

```bash
pnpm --filter @chatai/contracts build
pnpm --filter @chatai/backend build
pnpm --filter @chatai/web build
```

Expected: all pass.

- [ ] **Step 3: Run hygiene check**

```bash
git diff --check
git diff --cached --check
```

Expected: no output.

- [ ] **Step 4: Review branch diff**

```bash
git diff --stat origin/main...HEAD
git diff origin/main...HEAD -- docs/superpowers/specs/2026-06-15-quick-reply-design.md docs/superpowers/plans/2026-06-15-quick-reply-implementation.md
```

Expected: spec and plan match the implemented behavior: side-panel entry, single/group support, two quick-reply tables, JSON attachments, max 5 attachments.

- [ ] **Step 5: Final commit if needed**

If verification caused fixes:

```bash
git add <changed-files>
git commit -m "fix: harden quick reply flow"
```

Do not commit if there are no changes.

---

## Self-Review

- Spec coverage: The plan covers DB tables, JSON attachments, max 5 attachments, no title/summary, no tag table, sidebar placement, single/group availability, composer回填,完整管理 UI, and video号 send blocking.
- Scope control: Management UI is in v1: category create/edit/delete/top, quick reply create/edit/delete/top, search, two-level categories, attachment picker, and dialog-based editing.
- Type consistency: Contracts use `scopeType` in TypeScript and `scope_type` in HTTP query. Attachment JSON uses `type` only, never `bizType`.
- Test coverage: Includes contracts, repository/service, web adapter conversion, side-panel rendering, quick-reply panel selection, and composer fill integration.
