# Smart Reply Poll Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Load existing smart replies with the latest message page, trigger asynchronous generation for the latest missing customer message, and keep smart reply polling bounded to the active conversation.

**Architecture:** Extend the shared contracts first, then implement backend message-page enrichment and auto-generation proxy, then update the web adapter/store to consume `smartReplies`, trigger `auto-general-answer`, and poll every second until terminal state or timeout. Smart reply state remains separate from message DTOs and pending runtime state is scoped to the active conversation.

**Tech Stack:** TypeScript, TypeBox, Fastify, Kysely, React/Zustand, Vitest.

---

### Task 1: Contracts And Backend Java Client

**Files:**
- Modify: `packages/contracts/src/chat/dto.ts`
- Modify: `apps/backend/src/modules/chat/workbench-java-client.ts`
- Modify: `apps/backend/src/modules/chat/chat.routes.ts`
- Test: `apps/backend/test/modules/chat/workbench.service.test.ts`

- [x] **Step 1: Write failing contract/backend tests**

Add tests that expect `WorkbenchMessagePageDto.smartReplies` to exist in the contract type and expect the service to expose an auto-generation flow that succeeds only when Java returns a positive id.

- [x] **Step 2: Run tests to verify failure**

Run: `pnpm --filter @chatai/backend test apps/backend/test/modules/chat/workbench.service.test.ts`

Expected: failure because the auto-generation service method/client method does not exist yet.

- [x] **Step 3: Add DTOs and Java client method**

Add:

```ts
smartReplies?: WorkbenchSmartReplySuggestionDto[];
```

to `WorkbenchMessagePageDto`.

Add:

```ts
export type WorkbenchSmartReplyAutoGeneralAnswerRequest = {
  conversationId: string;
  msgId: number;
};

export type WorkbenchSmartReplyAutoGeneralAnswerResponse = {
  id: number;
};
```

Add `requestAutoGeneralAnswer` to `WorkbenchJavaClient`, calling
`/third-internal/wap-embed-msg-audit-recommend-answer/auto-general-answer` and exposing Java business error messages.

- [x] **Step 4: Add backend route and service surface**

Add `POST /api/server/smart-reply/auto-general-answer` with body:

```ts
{
  conversationId: string;
  msgId: number;
}
```

The service method validates the conversation, seat access, single-chat scope, and positive `msgId`, then proxies the Java client. It treats `data.id > 0` as success.

- [x] **Step 5: Run backend test**

Run: `pnpm --filter @chatai/backend test apps/backend/test/modules/chat/workbench.service.test.ts`

Expected: tests pass.

### Task 2: Backend Message Page Smart Replies

**Files:**
- Modify: `apps/backend/src/modules/chat/workbench-repository.ts`
- Modify: `apps/backend/src/modules/chat/workbench.service.ts`
- Test: `apps/backend/test/modules/chat/workbench.service.test.ts`

- [x] **Step 1: Write failing tests**

Add tests for:

- latest single-chat page with `assistant_id > 0` calls Java history lookup with the last five customer message ids
- latest single-chat page with `assistant_id <= 0` does not call Java
- historical page with `beforeSeq` does not call Java
- agent replies do not change the backend candidate set

- [x] **Step 2: Run tests to verify failure**

Run: `pnpm --filter @chatai/backend test apps/backend/test/modules/chat/workbench.service.test.ts`

Expected: failure because message pages do not include `smartReplies`.

- [x] **Step 3: Include assistant enablement in message page query**

Select `seat.assistant_id as assistant_id` in the message-page query path only. Do not add it to `getConversationLookup`.

- [x] **Step 4: Enrich latest pages in service**

After `repository.listMessages`, if `beforeSeq == null`, the page is single chat, assistant is enabled, and there are customer messages, collect the last five customer message `seq` values and call `javaClient.listUserHistoryAnswers`. Return `{ ...page, smartReplies }`.

- [x] **Step 5: Run backend tests**

Run: `pnpm --filter @chatai/backend test apps/backend/test/modules/chat/workbench.service.test.ts`

Expected: tests pass.

### Task 3: Web API Adapter And Store State

**Files:**
- Modify: `apps/web/src/pages/chat/api/workbench-service.ts`
- Modify: `apps/web/src/pages/chat/api/workbench-gateway.ts`
- Modify: `apps/web/src/pages/chat/api/smart-reply-adapter.ts`
- Modify: `apps/web/src/store/workbench-store.ts`
- Test: `apps/web/test/pages/chat/smart-reply-adapter.test.ts`
- Test: `apps/web/test/store/workbench-store.test.ts`

- [x] **Step 1: Write failing frontend tests**

Add tests for:

- loading a latest page merges `smartReplies`
- non-terminal message-page smart replies are added to pending
- latest eligible customer message without a suggestion calls `auto-general-answer`
- poll result that omits a pending msgId keeps it pending
- terminal poll result removes pending
- switching conversations clears local pending/loading runtime state

- [x] **Step 2: Run tests to verify failure**

Run: `pnpm --filter @chatai/web test apps/web/test/pages/chat/smart-reply-adapter.test.ts apps/web/test/store/workbench-store.test.ts`

Expected: failure because the adapter/store do not consume `smartReplies` or auto-generation yet.

- [x] **Step 3: Add web service method**

Add `requestSmartReplyAutoGeneralAnswer` to the workbench service and gateway. It sends only `conversationId` and `msgId`.

- [x] **Step 4: Update adapter helpers**

Change `SMART_REPLY_POLL_INTERVAL_MS` to `1000`. Add helpers to merge page smart replies and derive pending from non-terminal suggestions. Change poll merge so missing Java items do not delete pending.

- [x] **Step 5: Update store load flows**

When loading the latest message page, merge `page.smartReplies`, derive pending, inspect the latest non-system message, and trigger `auto-general-answer` if it is an eligible customer message without a suggestion or pending entry.

- [x] **Step 6: Update active-conversation switching cleanup**

Clear active-conversation smart reply pending/loading runtime state when switching conversations. Reopened conversations derive pending from reloaded `smartReplies`.

- [x] **Step 7: Run frontend tests**

Run: `pnpm --filter @chatai/web test apps/web/test/pages/chat/smart-reply-adapter.test.ts apps/web/test/store/workbench-store.test.ts`

Expected: tests pass.

### Task 4: Verification

**Files:**
- No new source files expected.

- [x] **Step 1: Run contracts build**

Run: `pnpm --filter @chatai/contracts build`

Expected: success.

- [x] **Step 2: Run backend build and tests**

Run: `pnpm --filter @chatai/backend test apps/backend/test/modules/chat/workbench.service.test.ts`

Run: `pnpm --filter @chatai/backend build`

Expected: success.

- [x] **Step 3: Run web tests and build**

Run: `pnpm --filter @chatai/web test apps/web/test/pages/chat/smart-reply-adapter.test.ts apps/web/test/store/workbench-store.test.ts`

Run: `pnpm --filter @chatai/web build`

Expected: success.

- [x] **Step 4: Run diff check**

Run: `git diff --check`

Expected: success.
