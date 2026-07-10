# Marketing Workflow Frontend Contract

## Context

The marketing workflow canvas is now treated as a product frontend module, not a disposable demo. Backend execution, database persistence, scheduling, and delivery engines are still mocked, but the frontend must expose a stable graph contract before backend work starts.

The workflow module lives at:

```text
apps/web/src/pages/chat/workflow
```

The current frontend scope covers:

- workflow list and full-screen canvas entry
- graph editing with nodes, edges, handles, selection, history, auto layout, and validation
- node definitions, visual metadata, default data, execution config, settings schema, and per-kind UI bindings
- draft save/publish/version-preview state over an in-memory repository
- import/export DSL and backend-facing execution graph projection

The final marketing node catalog and exact node parameter semantics are not fully decided. That should not block backend contract work, because node extension is already centralized by node `kind`.

## Module Boundary

Workflow is a first-class chat module beside `insights` and `ai-hosting`.

Primary files:

- page shell: `apps/web/src/pages/chat/workflow/workflow-page.tsx`
- canvas: `apps/web/src/pages/chat/workflow/canvas/workflow-canvas.tsx`
- workspace orchestration: `apps/web/src/pages/chat/workflow/use-workflow-workspace.ts`
- graph controller: `apps/web/src/pages/chat/workflow/use-workflow-controller.ts`
- draft repository service: `apps/web/src/pages/chat/workflow/workflow-draft-service.ts`
- DSL/export contract: `apps/web/src/pages/chat/workflow/workflow-dsl.ts`
- node definitions: `apps/web/src/pages/chat/workflow/nodes/**`
- validation and publish checks: `apps/web/src/pages/chat/workflow/validation/**`, `apps/web/src/pages/chat/workflow/checks/publish-checks.ts`

## Node Contract

Current node kinds:

```ts
type WorkflowNodeKind = "trigger" | "wait" | "branch" | "action" | "ai" | "goal";
```

Current insertable node kinds exclude entry and terminal nodes:

```ts
type InsertableWorkflowNodeKind = "wait" | "branch" | "action" | "ai";
```

Every node kind is registered through `WorkflowNodeDefinition<TKind>` and must provide:

- `kind`
- `schemaVersion`
- visual metadata for card and picker rendering
- layout metrics
- default persisted data
- settings schema or custom settings UI binding
- source/target handle definitions
- connection capability metadata
- execution config projection through `createExecutionConfig`
- optional data migration and sanitization
- optional validation and output variables

Persisted node data always includes `kind` and `schemaVersion`. Runtime-only fields such as selection state, callbacks, hover state, insert menu state, and render z-index are stripped by hydration/export boundaries.

Adding a new node kind requires updating:

- `types.ts` for kind-specific data and config patch typing
- `nodes/<kind>/definition.ts`
- `nodes/<kind>/ui.ts(x)` only when specialized card/settings UI is needed
- `nodes/registry.ts`
- config schema if the settings can be schema-driven
- connection policy or validation only when the graph rules change
- targeted tests for definition contract, migration/default data, config behavior, and graph rules

## Draft Contract

The editable draft shape is:

```ts
type WorkflowDraft = {
  edges: WorkflowEdge[];
  nodes: WorkflowNode[];
  viewport: Viewport;
};
```

`viewport` is editor view state. It is included in draft snapshots for UI restore, but viewport changes are not graph edits:

- panning and zooming do not mark the draft dirty
- panning and zooming do not enter undo/redo history
- panning and zooming remain allowed in read-only version preview and publishing states

Graph edits include:

- add/delete/duplicate/insert node
- connect/delete edge
- node drag stop
- node config changes
- auto layout

Graph edits must be undoable and must mark the draft dirty. Transient drag movement updates the canvas while dragging but is only committed when the drag finishes.

## Execution DSL

The frontend exports a versioned DSL document through `createWorkflowDslDocument` / `exportWorkflowDsl`.

Stable top-level fields:

```ts
type WorkflowDslDocument = {
  exportedAt: string;
  kind: "chatai-workflow";
  meta: {
    producer: "ChatAI";
    supportedSchemaVersions: readonly number[];
  };
  schemaVersion: 1;
  workflow: {
    draft: WorkflowDraft;
    executionGraph: WorkflowExecutionGraph;
    id?: string;
    name: string;
    revision?: number;
  };
};
```

The legacy kind `chatai-marketing-workflow` is accepted only for import compatibility and is normalized back to `chatai-workflow`.

Backend execution should consume `workflow.executionGraph`, not raw React Flow render nodes.

Current execution graph shape:

```ts
type WorkflowExecutionGraph = {
  edges: WorkflowExecutionEdge[];
  entryNodeId: string | null;
  incoming: Record<string, string[]>;
  nodes: WorkflowExecutionNode[];
  outgoing: Record<string, string[]>;
  terminalNodeIds: string[];
  topologicalNodeIds: string[];
};

type WorkflowExecutionNode = {
  config: Record<string, unknown>;
  id: string;
  kind: WorkflowNodeKind;
};

type WorkflowExecutionEdge = {
  id: string;
  source: string;
  sourceHandle: string | null;
  sourceOutlet: WorkflowSourceOutletDefinition | null;
  target: string;
  targetHandle: string | null;
};
```

Execution graph guarantees:

- `nodes` contains persisted node ids, kinds, and runtime-facing config only
- node positions, labels, summaries, metrics, UI status, and callbacks are excluded from `config`
- `edges` contains source/target ids, handles, and resolved source outlet metadata
- `entryNodeId` is derived from the registered entry-role node
- `terminalNodeIds` is derived from registered terminal-role nodes
- `incoming` and `outgoing` index edge ids by node id for backend traversal
- `topologicalNodeIds` provides stable node ordering and always contains every execution node id
- invalid, cyclic, or disconnected graphs are still represented for diagnosis, but publish checks should block them before real backend execution

Current execution config examples:

```json
{
  "trigger": {
    "audience": "近 30 天新入会且未首购客户",
    "repeatEntryEnabled": true
  },
  "wait": {
    "delayDays": 2
  },
  "branch": {
    "branchPaths": [],
    "branchRule": "最近 7 天浏览活动页 >= 2 次，或咨询过商品功效"
  },
  "action": {
    "actionType": "message"
  },
  "ai": {
    "agentName": "护肤小助理",
    "handoffRule": "客户要求人工、投诉升级、识别到价格异议"
  },
  "goal": {
    "conversion": 18.4
  }
}
```

These values are mock product semantics. The important stable contract is that each node definition owns its own `createExecutionConfig` output.

## Validation And Publish Gate

Frontend publish checks already validate:

- missing trigger or goal node
- unreachable goal
- disconnected nodes
- graph cycles
- graph depth limit
- invalid connection policy
- multiple incoming/outgoing violations
- source/target handle occupancy
- unconnected source handles and branch paths
- node config schema issues
- node-definition validation issues

Frontend publish checks are UX gates, not security or consistency boundaries. Backend must revalidate every published workflow with the same or stricter rules before storing or activating execution.

Backend must not trust:

- hidden form state
- client-side read-only locks
- client-side revision values without server comparison
- client-side DSL payloads without sanitization

## Save, Publish, And Concurrency

The in-memory frontend repository currently models the desired API behavior:

- unknown workflow ids are rejected instead of falling back to the first workflow
- save and publish keep `document.draft` synchronized with the persisted draft
- publish locks editing in the UI while in progress
- repository-level publish uses expected draft hash validation to reject stale publish requests
- published drafts and version snapshots are cloned so later edits do not mutate history
- version preview is read-only but still allows canvas viewport navigation

Backend API should preserve these invariants:

- `GET /workflows/:id` returns the persisted draft, revision, draft hash, publish state, and version history metadata
- `PATCH/PUT /workflows/:id/draft` persists a sanitized draft and returns a new revision/hash
- `POST /workflows/:id/publish` accepts the draft or draft hash plus expected base hash/revision and rejects stale requests
- `POST /workflows/:id/versions/:versionId/restore` restores a snapshot into editable draft state without mutating the original version snapshot

Exact route names can differ, but the consistency semantics should not.

## Frontend Completion Line Before Backend

Frontend can be considered ready for backend integration when these are true:

- workflow graph editing remains covered by the workflow test suite
- node definitions are kind-aware and centralized
- node config patches cannot mutate `kind` or `schemaVersion`
- draft hydration/migration normalizes legacy or external data
- runtime-only fields are stripped at save/export/import boundaries
- publish checks block invalid graphs before publish
- DSL export exposes `executionGraph` with node config, edge handles, entry/terminal ids, incoming/outgoing indexes, and stable node ordering
- read-only states still allow viewport navigation but block graph mutation
- save/publish/version-preview behavior is covered by tests
- frontend docs describe the backend contract and backend revalidation responsibilities

The remaining frontend work before backend should be limited to product decisions:

- final node catalog
- exact field semantics for each node kind
- real account/tag/filter selector components for trigger/start configuration
- real action parameter forms once marketing action types are finalized

These product decisions can proceed in parallel with backend API and execution-engine design because the frontend extension model is already centered on node definitions.

## Verification Commands

Run workflow tests from `apps/web`:

```bash
./node_modules/.bin/vitest run --config vitest.config.ts test/pages/chat/workflow
```

Run web build from repo root:

```bash
corepack pnpm --filter @chatai/web build
```

Run whitespace diff check from repo root:

```bash
git diff --check
```
