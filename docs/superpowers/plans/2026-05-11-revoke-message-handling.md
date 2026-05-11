# Revoke Message Handling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Support WeChat revoke semantics by showing "已撤回" under the original message first, then later upgrade message pagination so hidden `msgtype=revoke` event rows do not break loading.

**Architecture:** Treat revoke as message state plus event filtering, not as a renderable content type. Phase 1 maps `revoke_status=1` onto the original message DTO and renders a shared revoke indicator under any non-system message. Phase 2 changes the message page contract from a bare array to a cursor object so backend can filter `msgtype=revoke` event rows while advancing the raw MySQL scan cursor and frontend can avoid uncontrolled auto-loading.

**Tech Stack:** Fastify backend, Kysely MySQL repository, `@chatai/contracts`, React 19, TypeScript, Vitest, Testing Library.

---

## File Structure

### Phase 1: Original Message Revoked Indicator

- Modify `packages/contracts/src/chat/dto.ts`
  - Add optional `isRevoked?: boolean` to `WorkbenchMessageBaseDto`.
- Modify `apps/backend/src/modules/chat/workbench-mappers.ts`
  - Add `revoke_status` to `MessageRow`.
  - Map `revoke_status === 1` to `isRevoked: true`.
  - Keep content mapping unchanged so every existing message type can still render normally with the revoke hint below it.
- Modify `apps/backend/src/modules/chat/workbench-repository.ts`
  - Select `message.revoke_status as revoke_status` in message queries.
- Modify `apps/backend/test/modules/chat/workbench-mappers.test.ts`
  - Add a mapper test proving revoked image/file/location/etc. messages get `isRevoked: true`; one non-text type is enough because the flag is content-type independent.
- Modify `apps/web/src/pages/chat/chat-types.ts`
  - Add optional `isRevoked?: boolean` to `BaseMessage`.
- Modify `apps/web/src/pages/chat/api/workbench-adapter.ts`
  - Pass `dto.isRevoked` into the adapted frontend message.
- Modify `apps/web/src/pages/chat/components/message-feed.tsx`
  - Render a single shared "已撤回" label under any `ChatMessage` with `isRevoked`.
  - Do this outside `MessageContentRenderer`, so text, image, voice, video, file, h5, mini-program, contact-card, location, sphfeed, solitaire all behave consistently.
- Add or modify `apps/web/test/pages/chat/message-feed.test.tsx`
  - Add tests that a revoked text message and a revoked non-text message both show "已撤回".
  - Add a test that system messages do not use this indicator.

### Phase 2: Revoke Event Filtering and Cursor Pagination

- Modify `packages/contracts/src/chat/dto.ts`
  - Add `WorkbenchMessagePageDto`.
  - Keep compatibility plan explicit: either migrate all consumers in one change, or temporarily support both array and page object in the web adapter.
- Modify `apps/backend/src/modules/chat/workbench.service.ts`
  - Change `getMessages` to return page objects.
  - Hide `msgtype=revoke` event rows from display.
  - Use backend scan budget per request and expose raw cursor progress.
- Modify `apps/backend/src/modules/chat/workbench-repository.ts`
  - Add a raw page fetch method returning rows plus `nextBeforeSeq`, `hasMore`, `scannedCount`, `filteredCount`.
  - Do not add `msgtype != 'revoke'` SQL filtering unless an index or display timeline table exists.
- Modify `apps/backend/src/modules/chat/chat.routes.ts`
  - Return the page object from `/api/server/conversations/:conversationId/messages`.
- Modify `apps/web/src/pages/chat/api/workbench-service.ts` and `apps/web/src/pages/chat/api/workbench-adapter.ts`
  - Consume the page object and keep raw pagination cursor separately from rendered message seq.
- Modify the relevant store/page loading code under `apps/web/src/pages/chat` or `apps/web/src/store/workbench-store.ts`
  - Add bounded loading behavior for `messages=[] && hasMore=true`.
  - Never issue unlimited automatic requests.
  - Show an explicit lightweight "已跳过不可展示记录，继续加载更早消息" state or button when a user-triggered load only skipped hidden rows.
- Add backend and frontend tests for empty visible page with advanced cursor.

---

## Phase 1 Tasks

### Task 1: Add Revoke State to Backend Contract and Mapper

**Files:**
- Modify: `packages/contracts/src/chat/dto.ts`
- Modify: `apps/backend/src/modules/chat/workbench-mappers.ts`
- Test: `apps/backend/test/modules/chat/workbench-mappers.test.ts`

- [ ] **Step 1: Write the failing mapper test**

Add this test near the other `mapMessageRow` content/status tests in `apps/backend/test/modules/chat/workbench-mappers.test.ts`:

```ts
it("marks revoked original messages independently of content type", () => {
  const message = mapMessageRow(
    messageRow({
      content: JSON.stringify({
        fileName: "报价单.pdf",
        fileSizeLabel: "120 KB",
      }),
      msgtype: "file",
      revoke_status: 1,
    }),
  );

  expect(message.contentType).toBe("file");
  expect(message.isRevoked).toBe(true);
});
```

If `messageRow` currently rejects `revoke_status`, update its override type only after the failing test proves the production type does not support the field yet.

- [ ] **Step 2: Run the mapper test and verify it fails**

Run:

```bash
pnpm --filter @chatai/backend test test/modules/chat/workbench-mappers.test.ts
```

Expected: FAIL because `revoke_status` is not part of `MessageRow` and/or `isRevoked` is missing from the mapped DTO.

- [ ] **Step 3: Add the contract field**

In `packages/contracts/src/chat/dto.ts`, update `WorkbenchMessageBaseDto`:

```ts
export type WorkbenchMessageBaseDto = {
  messageId: string;
  conversationId: string;
  seatId: string;
  customerId: string;
  thirdUserId?: string;
  thirdExternalUserId?: string;
  thirdGroupId?: string;
  thirdFromId?: string;
  senderName?: string;
  senderAvatar?: string;
  senderType: "customer" | "agent" | "system";
  contentType: WorkbenchMessageContentType;
  status: WorkbenchMessageStatus;
  content: Record<string, unknown>;
  createdAt?: number;
  seq: number;
  clientMessageId?: string;
  failReason?: string;
  isRevoked?: boolean;
};
```

- [ ] **Step 4: Add backend row field and mapping**

In `apps/backend/src/modules/chat/workbench-mappers.ts`, add the row field:

```ts
export type MessageRow = {
  chat_type: number;
  content: string | null;
  conversation_external_id: string;
  conversation_group_id: string;
  conversation_id: number | string;
  from_type: number | null;
  id: number | string;
  msgid: string;
  msgtime: Date | number | string;
  msgtype: string;
  revoke_status?: number | string | null;
  seat_id: number | string;
  sender_avatar?: string;
  sender_name?: string;
  third_external_id: string;
  third_from_id: string;
  third_group_id: string;
  third_user_id: string;
};
```

In `mapMessageRow`, add `isRevoked` to the returned DTO:

```ts
return {
  content: parseMessageContent(row.msgtype, row.content),
  contentType: mapContentType(row.msgtype),
  conversationId: String(row.conversation_id),
  createdAt: toOptionalTimestamp(row.msgtime),
  customerId,
  isRevoked: toNumber(row.revoke_status) === 1 ? true : undefined,
  messageId: row.msgid,
  seatId: String(row.seat_id),
  senderAvatar: row.sender_avatar ?? "",
  senderName: row.sender_name,
  senderType: mapSenderType(row),
  seq: toNumber(row.id),
  status: "read",
  thirdExternalUserId,
  thirdFromId: row.third_from_id || undefined,
  thirdGroupId,
  thirdUserId: row.third_user_id,
};
```

- [ ] **Step 5: Run the mapper test and verify it passes**

Run:

```bash
pnpm --filter @chatai/backend test test/modules/chat/workbench-mappers.test.ts
```

Expected: PASS.

### Task 2: Select `revoke_status` From MySQL Message Rows

**Files:**
- Modify: `apps/backend/src/modules/chat/workbench-repository.ts`
- Test: `apps/backend/test/modules/chat/workbench-repository.test.ts`

- [ ] **Step 1: Write or update repository coverage**

If `apps/backend/test/modules/chat/workbench-repository.test.ts` already asserts selected fields or message mapping from DB rows, extend the relevant fixture to include:

```ts
revoke_status: 1,
```

and assert:

```ts
expect(messages[0]?.isRevoked).toBe(true);
```

If the repository test only verifies missing conversation behavior and cannot seed message rows cheaply, rely on the mapper test from Task 1 and the full backend route test from Task 3.

- [ ] **Step 2: Select the field in the repository query**

In `apps/backend/src/modules/chat/workbench-repository.ts`, update the message select list inside `listMessages`:

```ts
.select([
  "message.id as id",
  "message.msgid as msgid",
  "message.chat_type as chat_type",
  "message.from_type as from_type",
  "message.third_user_id as third_user_id",
  "message.third_external_id as third_external_id",
  "message.third_from_id as third_from_id",
  "message.third_group_id as third_group_id",
  "message.content as content",
  "message.msgtype as msgtype",
  "message.msgtime as msgtime",
  "message.revoke_status as revoke_status",
])
```

- [ ] **Step 3: Run backend tests**

Run:

```bash
pnpm --filter @chatai/backend test test/modules/chat/workbench-mappers.test.ts test/modules/chat/workbench-repository.test.ts
```

Expected: PASS.

### Task 3: Pass Revoke State Through the Web Adapter

**Files:**
- Modify: `apps/web/src/pages/chat/chat-types.ts`
- Modify: `apps/web/src/pages/chat/api/workbench-adapter.ts`
- Test: `apps/web/test/pages/chat/workbench-adapter.test.ts`

- [ ] **Step 1: Write the failing adapter test**

In `apps/web/test/pages/chat/workbench-adapter.test.ts`, add or extend a message adaptation test:

```ts
it("preserves revoked message state from backend messages", () => {
  const messages = adaptWorkbenchMessages([
    {
      content: { text: "这条已撤回", type: "text" },
      contentType: "text",
      conversationId: "conv-001",
      createdAt: 1715400000000,
      customerId: "cust-001",
      isRevoked: true,
      messageId: "msg-001",
      seatId: "seat-001",
      senderAvatar: "",
      senderName: "客户",
      senderType: "customer",
      seq: 1,
      status: "read",
    },
  ]);

  expect(messages[0]).toMatchObject({
    id: "msg-001",
    isRevoked: true,
  });
});
```

Use the existing helper/function name in that file if it differs from `adaptWorkbenchMessages`.

- [ ] **Step 2: Run the adapter test and verify it fails**

Run:

```bash
pnpm --filter @chatai/web test test/pages/chat/workbench-adapter.test.ts
```

Expected: FAIL because frontend `Message` does not expose `isRevoked` or adapter drops it.

- [ ] **Step 3: Add frontend message field**

In `apps/web/src/pages/chat/chat-types.ts`, update `BaseMessage`:

```ts
type BaseMessage = {
  id: string;
  conversationId: string;
  role: MessageRole;
  author: string;
  sentAt: string;
  status: MessageStatus;
  clientMessageId?: string;
  remoteMessageId?: string;
  seq?: number;
  failReason?: string;
  isRevoked?: boolean;
};
```

- [ ] **Step 4: Preserve the flag in the adapter**

In `apps/web/src/pages/chat/api/workbench-adapter.ts`, where a `WorkbenchMessageDto` becomes a frontend `Message`, add:

```ts
isRevoked: dto.isRevoked,
```

If the local variable is named `message`, `item`, or `dto`, use the existing name and keep the field next to `status`, `seq`, or other base message fields.

- [ ] **Step 5: Run the adapter test and verify it passes**

Run:

```bash
pnpm --filter @chatai/web test test/pages/chat/workbench-adapter.test.ts
```

Expected: PASS.

### Task 4: Render the Shared "已撤回" Indicator Under Any Message Type

**Files:**
- Modify: `apps/web/src/pages/chat/components/message-feed.tsx`
- Test: `apps/web/test/pages/chat/message-feed.test.tsx`

- [ ] **Step 1: Write failing render tests**

Create `apps/web/test/pages/chat/message-feed.test.tsx` if it does not exist. Add tests using `ChatMessageList`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChatMessageList } from "@/pages/chat/components/message-feed";
import type { Message } from "@/pages/chat/chat-types";

describe("ChatMessageList revoke indicator", () => {
  it("shows revoked state under a text message", () => {
    render(
      <ChatMessageList
        messages={[
          chatMessage({
            content: { text: "原始文本", type: "text" },
            id: "msg-text",
            isRevoked: true,
          }),
        ]}
      />,
    );

    expect(screen.getByText("原始文本")).toBeInTheDocument();
    expect(screen.getByText("已撤回")).toBeInTheDocument();
  });

  it("shows revoked state under a non-text message", () => {
    render(
      <ChatMessageList
        messages={[
          chatMessage({
            content: {
              alt: "图片",
              imageUrl: "https://example.com/image.png",
              type: "image",
            },
            id: "msg-image",
            isRevoked: true,
          }),
        ]}
      />,
    );

    expect(screen.getByText("已撤回")).toBeInTheDocument();
  });

  it("does not show revoked state for system messages", () => {
    render(
      <ChatMessageList
        messages={[
          {
            author: "系统",
            content: { text: "系统提示", type: "system" },
            conversationId: "conv-001",
            id: "sys-001",
            isRevoked: true,
            role: "system",
            sentAt: "2026-05-11 16:00",
            status: "sent",
          },
        ]}
      />,
    );

    expect(screen.getByText("系统提示")).toBeInTheDocument();
    expect(screen.queryByText("已撤回")).not.toBeInTheDocument();
  });
});

function chatMessage(overrides: Partial<Extract<Message, { role: "customer" | "agent" }>>): Extract<Message, { role: "customer" | "agent" }> {
  return {
    author: "客户",
    content: { text: "默认消息", type: "text" },
    conversationId: "conv-001",
    id: "msg-001",
    role: "customer",
    sender: {
      id: "customer-001",
      name: "客户",
    },
    sentAt: "2026-05-11 16:00",
    status: "read",
    ...overrides,
  };
}
```

- [ ] **Step 2: Run the render test and verify it fails**

Run:

```bash
pnpm --filter @chatai/web test test/pages/chat/message-feed.test.tsx
```

Expected: FAIL because no shared revoked indicator exists yet.

- [ ] **Step 3: Add the shared indicator**

In `apps/web/src/pages/chat/components/message-feed.tsx`, inside `MessageRow`, directly below `<MessageContentRenderer ... />`, add:

```tsx
              {message.isRevoked ? <MessageRevokedState /> : null}
```

The surrounding block should stay inside the existing `message-content-stack`, so alignment follows customer/agent direction.

Add this component near `MessageDeliveryState`:

```tsx
function MessageRevokedState() {
  return (
    <p className="px-1 text-[12px] leading-5 text-muted-foreground">
      已撤回
    </p>
  );
}
```

Do not add this inside any single content renderer, because all message content types can be revoked.

- [ ] **Step 4: Run the render test and verify it passes**

Run:

```bash
pnpm --filter @chatai/web test test/pages/chat/message-feed.test.tsx
```

Expected: PASS.

### Task 5: Phase 1 Integration Verification and Commit

**Files:**
- All files touched in Phase 1.

- [ ] **Step 1: Run targeted backend tests**

Run:

```bash
pnpm --filter @chatai/backend test test/modules/chat/workbench-mappers.test.ts test/modules/chat/workbench-repository.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run targeted web tests**

Run:

```bash
pnpm --filter @chatai/web test test/pages/chat/workbench-adapter.test.ts test/pages/chat/message-feed.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit Phase 1**

Run:

```bash
git add packages/contracts/src/chat/dto.ts apps/backend/src/modules/chat/workbench-mappers.ts apps/backend/src/modules/chat/workbench-repository.ts apps/backend/test/modules/chat/workbench-mappers.test.ts apps/backend/test/modules/chat/workbench-repository.test.ts apps/web/src/pages/chat/chat-types.ts apps/web/src/pages/chat/api/workbench-adapter.ts apps/web/src/pages/chat/components/message-feed.tsx apps/web/test/pages/chat/workbench-adapter.test.ts apps/web/test/pages/chat/message-feed.test.tsx
git commit -m "feat: show revoked state on original messages"
```

Expected: one focused commit for original-message revoke display.

---

## Phase 2 Tasks

### Task 6: Define Message Page Contract With Raw Cursor Progress

**Files:**
- Modify: `packages/contracts/src/chat/dto.ts`
- Test: existing typecheck.

- [ ] **Step 1: Add page DTO**

In `packages/contracts/src/chat/dto.ts`, add:

```ts
export type WorkbenchMessagePageDto = {
  messages: WorkbenchMessageDto[];
  nextBeforeSeq?: number;
  hasMore: boolean;
  scannedCount: number;
  filteredCount: number;
};
```

Semantics:

- `messages`: visible display messages only; excludes `msgtype=revoke` event rows.
- `nextBeforeSeq`: next raw `message.id` cursor to pass as `before_seq`; this is based on scanned raw rows, not returned visible rows.
- `hasMore`: true when older raw rows may exist.
- `scannedCount`: number of raw rows scanned for this request.
- `filteredCount`: number of scanned raw rows hidden from display, currently including `msgtype=revoke`.

- [ ] **Step 2: Run contracts/backend/web typecheck**

Run:

```bash
pnpm typecheck
```

Expected: FAIL until service return types are migrated in later tasks, or PASS if the new type is not yet referenced.

### Task 7: Return Cursor Pages From Backend Message Loading

**Files:**
- Modify: `apps/backend/src/modules/chat/workbench.service.ts`
- Modify: `apps/backend/src/modules/chat/workbench-repository.ts`
- Modify: `apps/backend/src/modules/chat/workbench-memory.service.ts`
- Modify: `apps/backend/src/modules/chat/chat.routes.ts`
- Test: `apps/backend/test/app.test.ts`
- Test: `apps/backend/test/modules/chat/workbench-repository.test.ts`

- [ ] **Step 1: Write backend route test for hidden revoke-only page**

Add a backend integration test that seeds or mocks a conversation where the first scanned page contains only `msgtype=revoke` rows. Assert the response shape:

```ts
expect(response.json()).toMatchObject({
  messages: [],
  hasMore: true,
  scannedCount: expect.any(Number),
  filteredCount: expect.any(Number),
});
expect(response.json().nextBeforeSeq).toBeLessThan(startBeforeSeq);
```

Use the existing test setup style in `apps/backend/test/app.test.ts`.

- [ ] **Step 2: Implement repository raw scan**

Add repository method or update `listMessages` to scan raw rows using existing indexed filters and `message.id < beforeSeq`. Do not add `message.msgtype != "revoke"` to SQL.

Implementation rules:

```ts
const scanLimit = Math.min(Math.max(options.scanLimit ?? options.limit, options.limit), 1000);
```

Filter in memory:

```ts
const visibleRows = messageRows.filter((row) => row.msgtype !== "revoke");
const pageRows = visibleRows.slice(-options.limit);
const lastScannedRow = messageRows[0] /* if rows are reversed ascending */ ?? undefined;
```

Set:

```ts
nextBeforeSeq: oldestRawScannedSeq,
hasMore: rows.length === scanLimit,
scannedCount: rows.length,
filteredCount: rows.length - visibleRows.length,
```

Keep exact ordering consistent with the current UI: returned `messages` must be ascending by seq.

- [ ] **Step 3: Update service and route return types**

Change `WorkbenchService.getMessages` and `MysqlWorkbenchService.getMessages` to return `WorkbenchMessagePageDto`.

Poll code must use:

```ts
const activeConversationMessagePage = await this.getMessages(...);
const activeConversationMessages = activeConversationMessagePage.messages.filter(
  (message) => message.seq > (request.activeMessageSeq ?? 0),
);
```

- [ ] **Step 4: Update memory service**

Return a page object from mock service:

```ts
return {
  filteredCount: 0,
  hasMore: beforeSeq == null
    ? messages.length > visibleMessages.length
    : messages.some((message) => message.seq < (visibleMessages[0]?.seq ?? 0)),
  messages: clone(visibleMessages),
  nextBeforeSeq: visibleMessages[0]?.seq,
  scannedCount: visibleMessages.length,
};
```

- [ ] **Step 5: Run backend tests**

Run:

```bash
pnpm --filter @chatai/backend test test/app.test.ts test/modules/chat/workbench-repository.test.ts
```

Expected: PASS.

### Task 8: Migrate Web API Adapter and Store to Message Pages

**Files:**
- Modify: `apps/web/src/pages/chat/api/workbench-service.ts`
- Modify: `apps/web/src/pages/chat/api/workbench-adapter.ts`
- Modify: `apps/web/src/store/workbench-store.ts` or current chat page loading code.
- Test: `apps/web/test/pages/chat/workbench-adapter.test.ts`
- Test: relevant store/page tests under `apps/web/test/pages/chat`.

- [ ] **Step 1: Write frontend adapter test for page object**

Add test:

```ts
const page = adaptWorkbenchMessagePage({
  filteredCount: 3,
  hasMore: true,
  messages: [backendMessage],
  nextBeforeSeq: 1000,
  scannedCount: 4,
});

expect(page.messages).toHaveLength(1);
expect(page.nextBeforeSeq).toBe(1000);
expect(page.hasMore).toBe(true);
expect(page.filteredCount).toBe(3);
```

- [ ] **Step 2: Update web service response type**

Change message fetcher to expect:

```ts
type WorkbenchMessagePageDto = {
  messages: WorkbenchMessageDto[];
  nextBeforeSeq?: number;
  hasMore: boolean;
  scannedCount: number;
  filteredCount: number;
};
```

Prefer importing from `@chatai/contracts` instead of redefining locally.

- [ ] **Step 3: Update state shape**

Track per conversation:

```ts
messagePaginationByConversationId: Record<string, {
  hasMore: boolean;
  isLoading: boolean;
  nextBeforeSeq?: number;
  skippedHiddenCount: number;
}>;
```

Do not derive the next cursor from the oldest rendered message after this migration.

- [ ] **Step 4: Run frontend tests**

Run:

```bash
pnpm --filter @chatai/web test test/pages/chat/workbench-adapter.test.ts
```

Expected: PASS after all call sites consume page objects.

### Task 9: Add Bounded Frontend Interaction for Hidden-Only Pages

**Files:**
- Modify: message loading UI under `apps/web/src/pages/chat`.
- Test: relevant chat page/message panel tests.

- [ ] **Step 1: Write UI behavior test**

Test the user-visible rule:

- When load-more returns `messages=[]`, `hasMore=true`, `filteredCount>0`, frontend does not immediately loop.
- It updates cursor.
- It shows text such as `已跳过不可展示记录，继续加载更早消息`.
- User action triggers the next request.

Use existing chat page test helpers where possible.

- [ ] **Step 2: Implement no-unlimited-auto-load rule**

Rules:

- Initial conversation open may auto-retry at most once if the first page has no visible messages and `hasMore=true`.
- User-triggered load more never recursively retries.
- If `nextBeforeSeq` is missing or not smaller than the previous cursor while `hasMore=true`, stop loading and show a non-blocking error/loading-stop state.

- [ ] **Step 3: Run UI tests**

Run:

```bash
pnpm --filter @chatai/web test test/pages/chat
```

Expected: PASS.

### Task 10: Phase 2 Full Verification and Commit

**Files:**
- All files touched in Phase 2.

- [ ] **Step 1: Run targeted backend tests**

Run:

```bash
pnpm --filter @chatai/backend test test/app.test.ts test/modules/chat/workbench-repository.test.ts test/modules/chat/workbench-mappers.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run targeted web tests**

Run:

```bash
pnpm --filter @chatai/web test test/pages/chat
```

Expected: PASS.

- [ ] **Step 3: Run full typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit Phase 2**

Run:

```bash
git add packages/contracts/src/chat/dto.ts apps/backend/src/modules/chat apps/backend/test apps/web/src/pages/chat apps/web/src/store apps/web/test/pages/chat
git commit -m "feat: paginate messages with hidden revoke events"
```

Expected: one focused commit for message page cursor and frontend interaction behavior.

---

## Self-Review

- Phase 1 covers the user's requested first step: original messages with `revoke_status=1` display "已撤回".
- Phase 1 explicitly renders the revoke indicator outside content-specific components, so all message types are covered.
- Phase 1 does not hide or filter `msgtype=revoke`; that is deliberately deferred.
- Phase 2 covers the user's pagination concern: hidden `msgtype=revoke` rows do not break cursor progression.
- Phase 2 includes frontend interaction safeguards so extreme revoke-only history does not cause unlimited automatic requests.
- The plan avoids MySQL `msgtype` filtering because `msgtype` is not indexed.
