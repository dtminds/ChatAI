# Quote Message Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render `msgtype=quote` messages as a normal text bubble plus a preview of the referenced audit message.

**Architecture:** The backend normalizes quote messages and hydrates quoted audit rows in batches during message pagination. Contracts expose a compact quote preview model, while the web adapter and renderer only display normalized fields.

**Tech Stack:** pnpm workspace, TypeScript, Fastify/Kysely backend, React 19 frontend, Hugeicons, Vitest.

---

### Task 1: Contracts and Backend Mapper

**Files:**
- Modify: `packages/contracts/src/chat/dto.ts`
- Modify: `apps/backend/src/modules/chat/workbench-mappers.ts`
- Test: `apps/backend/test/modules/chat/workbench-mappers.test.ts`

- [ ] Add failing mapper tests for `msgtype=quote` parsing:
  - Quote content maps to `contentType: "quote"`.
  - `content.content` becomes the outgoing quote bubble text.
  - `content.quoteMsgId` is preserved as a string.
  - Missing referenced preview leaves `quotedMessage` undefined.

- [ ] Extend `WorkbenchMessageContentType` with `"quote"`.

- [ ] Add a normalized quote content shape in mapper output:
  - `{ text, quoteMsgId, quotedMessage? }`

- [ ] Keep unsupported or malformed quote payloads safe by falling back to empty text and missing preview.

### Task 2: Backend Batch Quote Hydration

**Files:**
- Modify: `apps/backend/src/modules/chat/workbench-repository.ts`
- Modify: `apps/backend/src/modules/chat/workbench-mappers.ts`
- Test: `apps/backend/test/modules/chat/workbench-repository.test.ts`

- [ ] Add failing repository tests proving:
  - A quoted row already present in the current page is reused.
  - Missing quoted rows are fetched in a single `where id in (...)` query.
  - Mixed text, image, and card-like quoted rows produce compact previews.

- [ ] After visible rows are known, collect quote ids from current page rows.

- [ ] Build a current-page row map by audit `id`, then fetch only unresolved ids.

- [ ] Scope quote lookup by the current conversation tenant and counterpart fields:
  - Always `uid`, `platform`, `third_user_id`.
  - For group chats, `third_group_id`.
  - For single chats, `third_external_id`.

- [ ] Hydrate senders for both display rows and quoted rows before mapping.

- [ ] Build `quotedMessage` previews:
  - Text: sender name plus text.
  - Image/emotion: sender name plus square thumbnail URL.
  - Other types: sender name, content type, readable title, optional main image URL.
  - Missing rows: `fallbackText: "引用消息不可用"`.

### Task 3: Web Adapter and Renderer

**Files:**
- Modify: `apps/web/src/pages/chat/chat-types.ts`
- Modify: `apps/web/src/pages/chat/api/workbench-adapter.ts`
- Modify: `apps/web/src/pages/chat/components/message/renderer.tsx`
- Create: `apps/web/src/pages/chat/components/message/quote.tsx`
- Test: `apps/web/test/pages/chat/workbench-adapter.test.ts`
- Test: `apps/web/test/pages/chat/message-quote.test.tsx`

- [ ] Add failing adapter test for quote DTO conversion.

- [ ] Add failing render tests for:
  - Main quote text uses the normal text bubble.
  - Text quote preview shows sender name and text.
  - Image quote preview renders a square thumbnail.
  - Other quote preview shows sender, type icon/title, and optional image.

- [ ] Extend local `MessageContent` with quote content and quoted preview types.

- [ ] Implement adapter conversion from backend quote content to local quote content.

- [ ] Implement `QuoteMessageContent` by composing `TextMessageBubble` and `QuoteMessagePreview`.

- [ ] Use Hugeicons for type icons and existing surface/text tokens for styling.

### Task 4: Verification

**Files:**
- All changed files.

- [ ] Run focused backend tests:
  - `pnpm --filter @chatai/backend test apps/backend/test/modules/chat/workbench-mappers.test.ts apps/backend/test/modules/chat/workbench-repository.test.ts`

- [ ] Run focused web tests:
  - `pnpm --filter @chatai/web test apps/web/test/pages/chat/workbench-adapter.test.ts apps/web/test/pages/chat/message-quote.test.tsx`

- [ ] Run required builds:
  - `pnpm --filter @chatai/contracts build`
  - `pnpm --filter @chatai/backend build`
  - `pnpm --filter @chatai/web build`

- [ ] Run final diff check:
  - `git diff --check`
