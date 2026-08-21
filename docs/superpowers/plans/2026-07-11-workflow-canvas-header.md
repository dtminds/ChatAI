# Workflow Canvas Header Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open existing Workflows in the current tab and replace the floating canvas controls with a dedicated header that supports inline Workflow renaming.

**Architecture:** Keep route navigation in the list/editor pages, add rename persistence to the existing `useWorkflowDocument` state owner, and keep `WorkflowTopBar` presentation-focused through explicit props. Reuse the current repository, publish checks, version history, shadcn components, and Hugeicons without changing backend contracts.

**Tech Stack:** React 19, React Router v7, TypeScript, Tailwind CSS v4, shadcn/ui, Hugeicons, Vitest, Testing Library

## Global Constraints

- Use the existing `WorkflowDraftRepository.renameDocument(workflowId, name)` operation; do not add an API contract.
- Use existing components from `apps/web/src/components/ui` and Hugeicons only.
- Keep save, publish, publish-check, conflict reload, history preview, restore, and permission behavior intact.
- Do not assert Tailwind classes or ordinary UI copy in tests.
- Run package scripts through `corepack pnpm` and package-local Vitest with `apps/web/vitest.config.ts`.
- Do not change the new-Workflow link because the request only changes existing-item editing.

---

### Task 1: Current-tab Workflow editing

**Files:**
- Modify: `apps/web/src/pages/chat/workflow/workflow-list-components.tsx`
- Test: `apps/web/test/pages/chat/workflow/workflow-page.test.tsx`

**Interfaces:**
- Consumes: React Router `Link` with `to: string`
- Produces: the existing-item `编辑` link without `target` or `rel`

- [ ] **Step 1: Change the navigation assertion to require current-tab behavior**

Replace the existing new-window test with:

```tsx
it("opens workflow row edit actions in the current tab", async () => {
  renderWorkflowPage("/chat/workflows");
  const editLink = (await screen.findAllByRole("link", { name: "编辑" }))[0];

  expect(editLink).toHaveAttribute("href", "/chat/workflows/newcomer-conversion");
  expect(editLink).not.toHaveAttribute("target");
  expect(editLink).not.toHaveAttribute("rel");
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
cd apps/web && ./node_modules/.bin/vitest run --config vitest.config.ts test/pages/chat/workflow/workflow-page.test.tsx -t "current tab"
```

Expected: FAIL because the link still has `target="_blank"` and `rel="noopener noreferrer"`.

- [ ] **Step 3: Remove new-window attributes from the edit link**

```tsx
<Button asChild className="h-8 rounded-lg px-2.5 text-xs" variant="outline">
  <Link to={`/chat/workflows/${workflow.id}`}>编辑</Link>
</Button>
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run the Step 2 command again. Expected: PASS.

- [ ] **Step 5: Commit the navigation change**

```bash
git add apps/web/src/pages/chat/workflow/workflow-list-components.tsx apps/web/test/pages/chat/workflow/workflow-page.test.tsx
git commit -m "fix: open workflow editor in current tab"
```

---

### Task 2: Rename persistence owned by the Workflow document hook

**Files:**
- Modify: `apps/web/src/pages/chat/workflow/workflow-draft-service.ts`
- Test: `apps/web/test/pages/chat/workflow/workflow-draft-service.test.tsx`

**Interfaces:**
- Consumes: `WorkflowDraftRepository.renameDocument(workflowId: string, name: string): Promise<WorkflowDocument> | WorkflowDocument`
- Produces: `renameDocument(name: string): Promise<boolean>` and `renameState: "idle" | "renaming"` from `useWorkflowDocument`

- [ ] **Step 1: Add a hook test protecting local updates and duplicate-submit blocking**

Follow the file's existing hook render pattern and add:

```tsx
it("renames the active workflow document without reloading its draft", async () => {
  const baseRepository = createInMemoryWorkflowDraftRepository();
  const initialDocument = baseRepository.getDocument("newcomer-conversion");
  let resolveRename!: (document: WorkflowDocument) => void;
  const renameDocument = vi.fn(() => new Promise<WorkflowDocument>((resolve) => {
    resolveRename = resolve;
  }));
  const repository = { ...baseRepository, renameDocument };
  const { result } = renderHook(() => useWorkflowDocument(
    initialDocument.id,
    repository,
    initialDocument,
  ));

  let firstRename!: Promise<boolean>;
  await act(async () => {
    firstRename = result.current.renameDocument("新客首购旅程");
    expect(await result.current.renameDocument("重复提交")).toBe(false);
  });
  await act(async () => {
    resolveRename({ ...initialDocument, name: "新客首购旅程" });
    expect(await firstRename).toBe(true);
  });

  expect(renameDocument).toHaveBeenCalledOnce();
  expect(result.current.document.name).toBe("新客首购旅程");
  expect(result.current.document.draft).toEqual(initialDocument.draft);
  expect(result.current.renameState).toBe("idle");
});
```

- [ ] **Step 2: Run the rename hook test and verify it fails**

```bash
cd apps/web && ./node_modules/.bin/vitest run --config vitest.config.ts test/pages/chat/workflow/workflow-draft-service.test.tsx -t "renames the active workflow document"
```

Expected: FAIL because `renameDocument` and `renameState` are not returned by the hook.

- [ ] **Step 3: Implement rename state and persistence**

Inside `useWorkflowDocument`, add:

```tsx
const [renameState, setRenameState] = useState<"idle" | "renaming">("idle");
const renamingRef = useRef(false);

const renameDocument = useCallback(async (name: string) => {
  const normalizedName = name.trim();
  if (!normalizedName || renamingRef.current || normalizedName === document.name) {
    return false;
  }

  renamingRef.current = true;
  setRenameState("renaming");
  try {
    const renamedDocument = await Promise.resolve(
      repository.renameDocument(workflowIdRef.current, normalizedName),
    );
    setDocument((currentDocument) => ({
      ...currentDocument,
      name: renamedDocument.name,
      updatedAt: renamedDocument.updatedAt,
    }));
    return true;
  }
  finally {
    renamingRef.current = false;
    setRenameState("idle");
  }
}, [document.name, repository]);
```

Expose both values from the hook's final memo and dependency list.

- [ ] **Step 4: Run the full draft-service test file**

```bash
cd apps/web && ./node_modules/.bin/vitest run --config vitest.config.ts test/pages/chat/workflow/workflow-draft-service.test.tsx
```

Expected: all tests PASS.

- [ ] **Step 5: Commit rename persistence**

```bash
git add apps/web/src/pages/chat/workflow/workflow-draft-service.ts apps/web/test/pages/chat/workflow/workflow-draft-service.test.tsx
git commit -m "feat: support workflow document rename"
```

---

### Task 3: Dedicated header with inline rename and compact actions

**Files:**
- Modify: `apps/web/src/pages/chat/workflow/canvas/workflow-topbar.tsx`
- Modify: `apps/web/src/pages/chat/workflow/use-workflow-workspace.ts`
- Modify: `apps/web/src/pages/chat/workflow/workflow-editor-page.tsx`
- Test: `apps/web/test/pages/chat/workflow/workflow-topbar-lifecycle.test.tsx`
- Test: `apps/web/test/pages/chat/workflow/workflow-page.test.tsx`

**Interfaces:**
- Consumes: Task 2 `renameDocument(name: string): Promise<boolean>` and `renameState`
- Produces: `WorkflowTopBar` props `canRename`, `onBack`, `onRename`, `renaming`; retains all existing lifecycle callbacks

- [ ] **Step 1: Add top-bar behavior tests for the new action structure**

Add a local `renderTopBar(overrides)` helper with valid default props, then add:

```tsx
it("opens version history directly and publish checks from the overflow menu", async () => {
  const user = userEvent.setup();
  const onOpenVersionHistory = vi.fn();
  const onPublishCheck = vi.fn();
  renderTopBar({ onOpenVersionHistory, onPublishCheck });

  await user.click(screen.getByRole("button", { name: "版本历史" }));
  expect(onOpenVersionHistory).toHaveBeenCalledOnce();
  await user.click(screen.getByRole("button", { name: "更多操作" }));
  await user.click(screen.getByRole("menuitem", { name: /发布检查/ }));
  expect(onPublishCheck).toHaveBeenCalledOnce();
});

it("submits a trimmed workflow name from the inline editor", async () => {
  const user = userEvent.setup();
  const onRename = vi.fn().mockResolvedValue(true);
  renderTopBar({ canRename: true, onRename });

  await user.click(screen.getByRole("button", { name: "重命名 Workflow" }));
  const input = screen.getByRole("textbox", { name: "Workflow 名称" });
  await user.clear(input);
  await user.type(input, "  新客首购旅程{Enter}");
  expect(onRename).toHaveBeenCalledWith("新客首购旅程");
});
```

- [ ] **Step 2: Add page-level tests for back navigation and persisted rename**

```tsx
it("returns to the workflow list from the canvas header", async () => {
  const user = userEvent.setup();
  const { router } = renderWorkflowPage("/chat/workflows/newcomer-conversion");

  await screen.findByRole("application", { name: "营销 Workflow 画布" });
  await user.click(screen.getByRole("button", { name: "返回 Workflow 列表" }));
  await waitFor(() => expect(router.state.location.pathname).toBe("/chat/workflows"));
});

it("renames a workflow from the canvas header", async () => {
  const user = userEvent.setup();
  renderWorkflowPage("/chat/workflows/newcomer-conversion");

  await user.click(await screen.findByRole("button", { name: "重命名 Workflow" }));
  const input = screen.getByRole("textbox", { name: "Workflow 名称" });
  await user.clear(input);
  await user.type(input, "新客首购旅程{Enter}");

  expect(await screen.findByText("新客首购旅程")).toBeInTheDocument();
  expect(getWorkflowDocument("newcomer-conversion").name).toBe("新客首购旅程");
});
```

- [ ] **Step 3: Run the focused header and page tests and verify they fail**

```bash
cd apps/web && ./node_modules/.bin/vitest run --config vitest.config.ts test/pages/chat/workflow/workflow-topbar-lifecycle.test.tsx test/pages/chat/workflow/workflow-page.test.tsx
```

Expected: FAIL because the current header has no back or rename controls and publish checks remain a direct button.

- [ ] **Step 4: Connect rename through the workspace boundary**

Destructure Task 2 values from `useWorkflowDocument`, import `normalizeWorkflowRepositoryError`, and add the following keys to the existing `topBar` return object without removing its current keys:

```tsx
const renameWorkflow = useWorkflowStableCallback(async (name: string) => {
  try {
    return await renameDocument(name);
  }
  catch (error) {
    toast.error(normalizeWorkflowRepositoryError(error).message || "重命名失败");
    return false;
  }
});

topBar: {
  canRename: document.permissions.canEdit && !isPreviewingVersion,
  onRename: renameWorkflow,
  renaming: renameState === "renaming",
}
```

- [ ] **Step 5: Replace the floating top bar with the dedicated header**

In `WorkflowTopBar`:

- Import `ArrowLeft01Icon`, `Edit02Icon`, `MoreHorizontalIcon`, `Time02Icon`, and the existing status icons from Hugeicons.
- Import `Input` and existing `DropdownMenu` primitives.
- Render a normal-flow `<header>` with a stable minimum height, white background, and bottom border.
- Render an icon button named `返回 Workflow 列表` calling `onBack`.
- Render the Workflow name and `重命名 Workflow` icon button when `canRename`.
- Swap the name for an auto-focused `Input` while editing; Enter trims/submits, Escape cancels, and blur cancels.
- Keep version history as a named icon button and publish as the primary text button.
- Place publish checks and conflict reload in the `更多操作` dropdown.
- Preserve preview restore/exit controls and disable rename in preview mode.
- Show the save state and timestamp below the name.

Use state shaped as:

```tsx
const [editingName, setEditingName] = useState(false);
const [nameValue, setNameValue] = useState(workflowName);

useEffect(() => {
  if (!editingName) setNameValue(workflowName);
}, [editingName, workflowName]);
```

Close the editor only when `await onRename(nameValue.trim())` returns `true` or the normalized value equals the current name.

- [ ] **Step 6: Put the header above the canvas and connect routing**

In `WorkflowWorkspaceContent`, create `const navigate = useNavigate()` and pass:

```tsx
canRename={topBar.canRename}
onBack={() => navigate("/chat/workflows")}
onRename={topBar.onRename}
renaming={topBar.renaming}
```

The workspace root is already `flex flex-col`; removing `absolute` from the header makes `.workflow-editor-body` consume the remaining height and prevents overlap.

- [ ] **Step 7: Run the focused header and page tests**

Run the Step 3 command again. Expected: all tests PASS.

- [ ] **Step 8: Commit the dedicated header**

```bash
git add apps/web/src/pages/chat/workflow/canvas/workflow-topbar.tsx apps/web/src/pages/chat/workflow/use-workflow-workspace.ts apps/web/src/pages/chat/workflow/workflow-editor-page.tsx apps/web/test/pages/chat/workflow/workflow-topbar-lifecycle.test.tsx apps/web/test/pages/chat/workflow/workflow-page.test.tsx
git commit -m "feat: redesign workflow canvas header"
```

---

### Task 4: Full verification and review

**Files:**
- Review: all files modified in Tasks 1-3

**Interfaces:**
- Consumes: completed navigation, rename, and header behavior
- Produces: build-verified web implementation with a clean diff

- [ ] **Step 1: Run all affected Workflow tests**

```bash
cd apps/web && ./node_modules/.bin/vitest run --config vitest.config.ts test/pages/chat/workflow/workflow-page.test.tsx test/pages/chat/workflow/workflow-topbar-lifecycle.test.tsx test/pages/chat/workflow/workflow-draft-service.test.tsx test/pages/chat/workflow/workflow-workspace.test.tsx
```

Expected: all tests PASS.

- [ ] **Step 2: Run the required web build**

```bash
corepack pnpm --filter @chatai/web build
```

Expected: TypeScript and Vite build complete successfully.

- [ ] **Step 3: Inspect the final diff and whitespace**

```bash
git diff --check
git diff --stat
git status --short
```

Expected: no whitespace errors; only the planned Workflow implementation, tests, and plan document are changed.

- [ ] **Step 4: Review behavior against the design**

Confirm from code and tests that existing-item edit stays in the current tab, the header occupies normal layout space, rename updates the active document, back navigation uses React Router, publish checks remain reachable, preview actions remain available, and permission restrictions are respected.
