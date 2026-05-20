# Remove Download Polling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the dedicated download-status polling flow and rely on `poll`-delivered message update events to keep file and video download state current.

**Architecture:** Download clicks will still trigger the server-side download request, but the client will stop polling `/messages/download-status`. The message object becomes the source of truth for download state, and the existing poll pipeline will patch refreshed message data into both the active conversation message list and the open history panel list. History media/file views will render from the same download fields so they stay consistent with the main chat timeline.

**Tech Stack:** React 19, Zustand, TypeScript, Fastify API contracts, Vitest, Testing Library

---

### Task 1: Add regression coverage for poll-driven download state updates

**Files:**
- Modify: `apps/web/src/pages/chat/chat-workbench-page.tsx`
- Modify: `apps/web/src/pages/chat/components/message/video.tsx`
- Modify: `apps/web/src/pages/chat/components/message/file.tsx`
- Modify: `apps/web/src/pages/chat/components/message-history-side-panel.tsx`
- Modify: `apps/web/src/store/workbench-store.ts`
- Test: `apps/web/test/chat-workbench-page-download.test.tsx` or the closest existing chat workbench test file

- [ ] **Step 1: Write the failing test**

Add a test that clicks a file/video download button, asserts the message becomes `downloadStatus: "ing"`, and then simulates a poll message-update refresh that changes the same message to `downloadStatus: "finished"` with a usable URL. Assert the UI stops showing the loading indicator and renders the finished-state action from the updated message content.

```ts
test("download state follows poll-updated message content", async () => {
  // render workbench with a file or video message
  // click the download action
  // assert loading state
  // inject a refreshed message update with downloadStatus: "finished"
  // assert the loading state disappears and the updated action is visible
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @chatai/web test apps/web/test/chat-workbench-page-download.test.tsx`
Expected: FAIL because the UI still depends on the old download-status polling flow.

- [ ] **Step 3: Write minimal implementation**

No code yet. This task exists to pin the desired behavior before the refactor starts.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @chatai/web test apps/web/test/chat-workbench-page-download.test.tsx`
Expected: PASS after the store and render path are updated.

- [ ] **Step 5: Commit**

```bash
git add apps/web/test/chat-workbench-page-download.test.tsx
git commit -m "test: cover poll-driven download state updates"
```

### Task 2: Remove the download-status polling path from the chat workbench page

**Files:**
- Modify: `apps/web/src/pages/chat/chat-workbench-page.tsx`
- Modify: `apps/web/src/pages/chat/api/workbench-gateway.ts`
- Modify: `apps/web/src/pages/chat/api/workbench-service.ts`
- Modify: `apps/web/src/pages/chat/lib/message-download.ts`
- Modify: `apps/web/src/pages/chat/components/message/video.tsx`
- Modify: `apps/web/src/pages/chat/components/message/file.tsx`

- [ ] **Step 1: Write the failing test**

Use the regression test from Task 1 to prove the old polling-specific paths are still present before removal.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @chatai/web test apps/web/test/chat-workbench-page-download.test.tsx`
Expected: FAIL against the pre-refactor code.

- [ ] **Step 3: Write minimal implementation**

Remove `downloadTransferStates`, `downloadPollingTimeoutsRef`, `downloadPollingMessageIdsRef`, `downloadPollingConversationRef`, `MAX_ACTIVE_DOWNLOAD_TRANSFERS`, `DOWNLOAD_STATUS_POLL_INTERVAL_MS`, and `MAX_DOWNLOAD_STATUS_POLL_COUNT` from `chat-workbench-page.tsx`. Keep the click handler, but after `downloadMessageFile(...)` resolves, only mark the message `downloadStatus: "ing"` and rely on the next poll cycle to refresh the message. Remove `getMessageFileDownloadStatus` usage and delete the `startMessageDownloadPolling`, `stopMessageDownloadPolling`, and `pollMessageDownloadStatus` helpers.

Update `VideoMessageCard` and `FileMessageCard` to derive their loading state directly from `content.downloadStatus === "ing"` and remove the external `transferState` prop.

Remove the unused `getMessageFileDownloadStatus` export from `workbench-gateway.ts` and the service implementations from `workbench-service.ts`.

```ts
// video/file cards read directly from message content
const isDownloading = content.downloadStatus === "ing";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @chatai/web test apps/web/test/chat-workbench-page-download.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/chat/chat-workbench-page.tsx apps/web/src/pages/chat/api/workbench-gateway.ts apps/web/src/pages/chat/api/workbench-service.ts apps/web/src/pages/chat/lib/message-download.ts apps/web/src/pages/chat/components/message/video.tsx apps/web/src/pages/chat/components/message/file.tsx
git commit -m "refactor: remove download status polling"
```

### Task 3: Patch history panel message lists from poll updates

**Files:**
- Modify: `apps/web/src/store/workbench-store.ts`
- Modify: `apps/web/src/pages/chat/components/message-history-side-panel.tsx`

- [ ] **Step 1: Write the failing test**

Add a store-level test or the nearest existing workbench store test that seeds a file/video message into both the active conversation list and the history panel list, then applies a poll response containing a `message-update` event plus refreshed message payload. Assert both lists receive the same updated download fields.

```ts
test("poll refresh patches active and history message lists", async () => {
  // seed current and history lists with the same downloadable message
  // apply a poll response with messageUpdateEvents + refreshedMessagesByConversationId
  // assert both stores show updated downloadStatus/fileUrl/fileUrlExpireTime
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @chatai/web test <target-test-file>`
Expected: FAIL before the patch helper is shared with history panel state.

- [ ] **Step 3: Write minimal implementation**

Extract a small helper that patches a message list by message ID and reuse it for:
- `messagesByConversationId`
- `historyPanelByConversationId[conversationId].messages`

Use the already-fetched refreshed messages from `poll` to update both lists. Keep the current `patchExistingMessageList` logic for poll refreshes, but apply it to the history panel state when the panel is open and the conversation matches.

If the history panel currently reuses the same message objects by reference in a path, keep the helper generic and avoid special casing file/video in the panel component itself. The panel should just render the updated message content.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @chatai/web test <target-test-file>`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/store/workbench-store.ts apps/web/src/pages/chat/components/message-history-side-panel.tsx
git commit -m "fix: sync history downloads from poll updates"
```

### Task 4: Verify the workspace and build outputs

**Files:**
- All modified files from Tasks 1-3

- [ ] **Step 1: Run the web build**

Run: `pnpm --filter @chatai/web build`
Expected: PASS.

- [ ] **Step 2: Run focused web tests**

Run: `pnpm --filter @chatai/web test <updated-chat-test-file>`
Expected: PASS.

- [ ] **Step 3: Check diff hygiene**

Run: `git diff --check`
Expected: no whitespace or patch formatting errors.

- [ ] **Step 4: Commit any remaining cleanup**

```bash
git add -A
git commit -m "refactor: drive downloads from poll updates"
```
