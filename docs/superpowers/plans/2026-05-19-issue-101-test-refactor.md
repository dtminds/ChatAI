# 前端测试分层重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `/chat` 相关前端测试从“整页 jsdom 大杂烩”重构为稳定的分层测试体系，降低 CI 随机超时并提升失败定位能力。

**Architecture:** 以测试金字塔重排现有覆盖面。`workbench-store` 负责纯逻辑与状态流转，组件测试负责可见行为与可访问语义，页面测试只保留关键工作流。对重复的页面级 setup 提取统一测试工具，减少 `ChatWorkbenchPage` 级别的全量 render 和 userEvent 链路。

**Tech Stack:** Vitest, Testing Library, jsdom, React, Zustand, Vite test config.

## 当前 PR 交付

本分支已经完成并验证的内容：

- 抽出 `apps/web/test/pages/chat/workbench-test-utils.tsx` 作为 chat 工作台测试底座
- 将整页测试里的高频重路径拆到独立文件：
  - `chat-workbench-composer.int.test.tsx`
  - `chat-workbench-downloads.int.test.tsx`
  - `chat-workbench-sidebar.int.test.tsx`
  - `chat-workbench-session.int.test.tsx`
- 保留 `chat-workbench-page.test.tsx` 作为轻量页面 smoke / 主流程补充
- 新增 `test:unit` / `test:integration`，并让 CI 分开跑轻量单测和重型页面流
- 为 integration 组单独放宽 Vitest 超时，避免 StrictMode / 下载轮询类 case 误伤

已跑验证：

- `pnpm --filter @chatai/web test:unit`
- `pnpm --filter @chatai/web test:integration`
- `pnpm --filter @chatai/web build`
- `git diff --check`

当前分支不包含的后续项：

- 把更多 page 级行为继续下沉到 store / 组件测试
- 进一步收缩 `chat-workbench-page.test.tsx`
- 按需继续拆分 `message-feed`、`message-text` 等更细层的行为测试

---

### Task 1: 提取 chat 工作台测试公共底座

**Files:**
- Create: `apps/web/test/pages/chat/workbench-test-utils.tsx`
- Modify: `apps/web/test/pages/chat/chat-workbench-page.test.tsx`
- Modify: `apps/web/test/pages/chat/workbench-scrollbar-policy.test.tsx`
- Modify: `apps/web/test/pages/chat/customer-side-panel.test.tsx`
- Modify: `apps/web/test/pages/chat/message-text.test.tsx`
- Modify: `apps/web/test/store/workbench-store.test.ts`

- [ ] **Step 1: Write the failing test**

在 `apps/web/test/pages/chat/chat-workbench-page.test.tsx` 中补一个只验证公共底座初始化的用例，要求能通过新工具渲染 `ChatWorkbenchPage` 并完成基础 setup：

```ts
it("boots chat workbench through the shared test harness", async () => {
  const { screen } = renderChatWorkbenchPage();
  await screen.findByRole("textbox", { name: "请输入消息……" });
  expect(screen.getByRole("button", { name: "发送消息" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @chatai/web test test/pages/chat/chat-workbench-page.test.tsx -t "boots chat workbench through the shared test harness" -v`

Expected: FAIL because `renderChatWorkbenchPage` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

在 `apps/web/test/pages/chat/workbench-test-utils.tsx` 提取：

```ts
export function renderChatWorkbenchPage() {
  return render(<ChatWorkbenchPage />);
}

export function resetChatWorkbenchTestState() {
  resetWorkbenchService();
  useWorkbenchStore.setState(useWorkbenchStore.getInitialState(), true);
  vi.clearAllMocks();
}
```

把 `MockAdapter`、`resolveImageSegmentsForSend`、`uploadWorkbenchFile`、`toast.warning`、`beforeEach` 的重复 setup 收敛到这个文件或同目录的一个 `installChatWorkbenchTestEnvironment()` helper，保证页面、组件、store 测试共享同一套初始状态。

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @chatai/web test test/pages/chat/chat-workbench-page.test.tsx -t "boots chat workbench through the shared test harness" -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/test/pages/chat/workbench-test-utils.tsx apps/web/test/pages/chat/chat-workbench-page.test.tsx apps/web/test/pages/chat/workbench-scrollbar-policy.test.tsx apps/web/test/pages/chat/customer-side-panel.test.tsx apps/web/test/pages/chat/message-text.test.tsx apps/web/test/store/workbench-store.test.ts
git commit -m "refactor: extract chat workbench test harness"
```

### Task 2: 把消息合并与撤回逻辑压到 store / 纯逻辑测试

**Files:**
- Modify: `apps/web/test/store/workbench-store.test.ts`
- Create: `apps/web/test/store/workbench-message-merge.test.ts`
- Create: `apps/web/test/store/workbench-revoke-state.test.ts`
- Modify: `apps/web/test/pages/chat/chat-workbench-page.test.tsx`

- [ ] **Step 1: Write the failing test**

新增纯 store 测试，直接验证消息合并与撤回状态，而不是通过页面断言：

```ts
it("merges optimistic and remote messages into one stable feed item", async () => {
  await useWorkbenchStore.getState().initializeWorkbench();
  // arrange optimistic message then reconcile with remote payload
  // assert final message list keeps one logical item and stable key semantics
});
```

```ts
it("keeps revoked messages revoked in the merged store state", async () => {
  await useWorkbenchStore.getState().initializeWorkbench();
  // arrange revoke poll signal
  // assert message list and related derived state reflect revoked status
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
`pnpm --filter @chatai/web test test/store/workbench-message-merge.test.ts test/store/workbench-revoke-state.test.ts -v`

Expected: FAIL because the new files and assertions do not exist yet.

- [ ] **Step 3: Write minimal implementation**

把 `chat-workbench-page.test.tsx` 中下列依赖页面 DOM 的用例迁走并改成 store 断言：
- optimistic / remote reconcile
- revoke 后 quote 禁用
- 同 batch revoke 信号合并
- 消息 key 稳定性

在新测试里直接使用 `useWorkbenchStore.getState()`、`createMockWorkbenchService()`、`setWorkbenchService()`、`seedMessages`，用 `messagesByConversationId`、`conversationListsByScope`、`messagePaginationByConversationId`、`historyStatusByConversationId` 做断言。

- [ ] **Step 4: Run test to verify it passes**

Run:
`pnpm --filter @chatai/web test test/store/workbench-message-merge.test.ts test/store/workbench-revoke-state.test.ts -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/test/store/workbench-message-merge.test.ts apps/web/test/store/workbench-revoke-state.test.ts apps/web/test/store/workbench-store.test.ts apps/web/test/pages/chat/chat-workbench-page.test.tsx
git commit -m "test: move chat merge rules into store coverage"
```

### Task 3: 把消息行与菜单行为收束到组件测试

**Files:**
- Modify: `apps/web/test/pages/chat/message-text.test.tsx`
- Create: `apps/web/test/pages/chat/message-feed.test.tsx`
- Modify: `apps/web/test/pages/chat/chat-workbench-page.test.tsx`

- [ ] **Step 1: Write the failing test**

新增 `message-feed.test.tsx`，直接测试消息行的可访问行为：

```ts
it("disables quote action for revoked messages at the row level", async () => {
  render(<MessageRow message={{ ...createTextMessage("已撤回原消息"), isRevoked: true }} />);
  await user.click(screen.getByRole("button", { name: "消息操作" }));
  expect(screen.getByRole("menuitem", { name: "引用消息" })).toHaveAttribute("data-disabled");
});
```

```ts
it("exposes mention only for group chat messages from other members", async () => {
  render(<MessageRow message={groupMessage} onMentionMessage={vi.fn()} onQuoteMessage={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: "消息操作" }));
  expect(screen.getByRole("menuitem", { name: "@Ta" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @chatai/web test test/pages/chat/message-feed.test.tsx -v`

Expected: FAIL because the new file and assertions do not exist yet.

- [ ] **Step 3: Write minimal implementation**

把 `message-text.test.tsx` 里偏页面语义的断言拆成更贴近 `MessageRow` / `TextMessageBubble` 的测试文件，保留：
- 文本气泡宽度与换行策略
- 系统消息分隔线样式
- 撤回态展示
- 菜单项可用性与 `@Ta` 暴露条件

把只是在 `ChatWorkbenchPage` 里间接验证的行为删除，避免页面测重复覆盖组件层。

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @chatai/web test test/pages/chat/message-feed.test.tsx test/pages/chat/message-text.test.tsx -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/test/pages/chat/message-feed.test.tsx apps/web/test/pages/chat/message-text.test.tsx apps/web/test/pages/chat/chat-workbench-page.test.tsx
git commit -m "test: cover chat message row behavior at component level"
```

### Task 4: 收缩整页 `ChatWorkbenchPage` 测试，只保留关键流程

**Files:**
- Modify: `apps/web/test/pages/chat/chat-workbench-page.test.tsx`
- Modify: `apps/web/test/pages/chat/workbench-scrollbar-policy.test.tsx`
- Modify: `apps/web/test/pages/chat/customer-side-panel.test.tsx`

- [ ] **Step 1: Write the failing test**

把页面测试重新定义为只保留少量关键工作流，至少保留：

保留 `chat-workbench-page.test.tsx` 里现有的三类页面级用例，并把它们收敛为以下语义：
- 发送消息流程
- 切换会话时的关键状态转移
- 启动失败后的错误提示和重试/恢复入口

同时把 `workbench-scrollbar-policy.test.tsx` 中纯布局断言保留，但从 `chat-workbench-page.test.tsx` 删除所有布局/滚动/样式间接验证。

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @chatai/web test test/pages/chat/chat-workbench-page.test.tsx -v`

Expected: FAIL until the file is trimmed to the new shape and the moved assertions exist in component or store tests.

- [ ] **Step 3: Write minimal implementation**

从 `chat-workbench-page.test.tsx` 删除以下类别的用例：
- quote / revoke / mention 菜单细节
- scrollbar policy
- sidebar iframe 属性
- 消息行渲染细节
- 纯 store 状态流转

只留下真正跨组件的主流程测试，保证页面文件短、慢路径少、失败定位清晰。

- [ ] **Step 4: Run test to verify it passes**

Run:
`pnpm --filter @chatai/web test test/pages/chat/chat-workbench-page.test.tsx test/pages/chat/workbench-scrollbar-policy.test.tsx test/pages/chat/customer-side-panel.test.tsx -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/test/pages/chat/chat-workbench-page.test.tsx apps/web/test/pages/chat/workbench-scrollbar-policy.test.tsx apps/web/test/pages/chat/customer-side-panel.test.tsx
git commit -m "test: narrow chat workbench page coverage"
```

### Task 5: 让 CI 更偏向轻量测试，降低重型页面并发压力

**Files:**
- Modify: `apps/web/vitest.config.ts`
- Modify: `apps/web/package.json`
- Create or modify: `apps/web/test/pages/chat/chat-workbench-page.int.test.tsx` if heavier page flows need独立归类

- [ ] **Step 1: Write the failing test**

新增一个只跑轻量测试集合的命令或文件分组约定，确认重型页面测试不会和普通单测混在同一组里：

```json
{
  "scripts": {
    "test:unit": "vitest run test/**/*.test.ts test/**/*.test.tsx --exclude test/pages/chat/**/*.int.test.tsx",
    "test:integration": "vitest run test/pages/chat/**/*.int.test.tsx"
  }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @chatai/web test:unit`

Expected: FAIL or be missing until scripts and file naming are aligned.

- [ ] **Step 3: Write minimal implementation**

如果页面级重型 case 仍然存在，把它们集中到 `*.int.test.tsx`，并让常规 `test` 或新增 `test:unit` 优先承载轻量稳定的单测集合。

如果仓库不想新增脚本，至少通过文件命名把重型页面测试单独分离，后续 CI workflow 可按 pattern 分组执行。

- [ ] **Step 4: Run test to verify it passes**

Run:
`pnpm --filter @chatai/web test:unit`

`pnpm --filter @chatai/web test:integration`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/vitest.config.ts apps/web/package.json apps/web/test/pages/chat/chat-workbench-page.int.test.tsx
git commit -m "ci: separate light and heavy web test groups"
```

### Task 6: 全量验证与收尾

**Files:**
- Modify: all files touched in Tasks 1-5

- [ ] **Step 1: Run the focused web tests**

Run:
`pnpm --filter @chatai/web test test/store/workbench-message-merge.test.ts test/store/workbench-revoke-state.test.ts test/pages/chat/message-feed.test.tsx test/pages/chat/message-text.test.tsx test/pages/chat/chat-workbench-page.test.tsx test/pages/chat/workbench-scrollbar-policy.test.tsx test/pages/chat/customer-side-panel.test.tsx -v`

Expected: PASS

- [ ] **Step 2: Run the web build required by repo policy**

Run: `pnpm --filter @chatai/web build`

Expected: PASS

- [ ] **Step 3: Run diff hygiene check**

Run: `git diff --check`

Expected: no output

- [ ] **Step 4: Review remaining risk**

Check that `chat-workbench-page.test.tsx` no longer owns component-level behavior, and that every moved assertion has a home in store or component tests. If any behavior still only exists in page tests, move it before merging.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: stabilize chat front-end test layers"
```
