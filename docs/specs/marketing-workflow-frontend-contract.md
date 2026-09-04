# Marketing Workflow Frontend Contract

## Context

The marketing workflow canvas is a product frontend module, not a disposable demo. The Node control plane, persistence model, compiler and Runtime kernel now exist; node execution support is declared by node maturity, while Java business events are exposed only after the Worker Event Catalog supports them.

The workflow module lives at:

```text
apps/web/src/pages/chat/workflow
```

The current frontend scope covers:

- workflow list and full-screen canvas entry
- graph editing with nodes, edges, handles, selection, history, auto layout, and validation
- node definitions, visual metadata, default Draft data, settings schema, and per-kind UI bindings
- draft save/publish/version-preview state through the Workflow repository interface and Backend control plane
- import/export DSL and backend-facing execution graph projection

The canvas infrastructure and the first marketing node catalog are represented by production-oriented contracts. Placeholder node data must never be inferred as a backend execution payload.

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

The first product catalog is implemented as:

```ts
type MarketingWorkflowNodeKind =
  | "start"
  | "wait"
  | "wait-event"
  | "branch"
  | "message"
  | "message-query"
  | "tag"
  | "coupon"
  | "handoff"
  | "agent"
  | "llm"
  | "order-query"
  | "tag-query"
  | "customer-update"
  | "ai-collect"
  | "ai-intent"
  | "end";
```

`start` and `end` are structural nodes and are excluded from every insertion surface. The effective insertion list is further restricted by the selected Workflow Capability Profile.

Confirmed graph semantics:

- every new canvas starts with exactly one `start` and one `end`
- `start` and `end` are globally unique, cannot be added, and cannot be deleted
- `start` has no incoming edge
- except for `start`, nodes generally support multiple incoming edges
- multiple incoming edges use OR-merge semantics: arrival from any upstream path activates the node according to runtime entry rules
- `end` supports multiple incoming edges and has no outgoing edge
- branch fan-out is represented by branch-specific source handles
- disconnected, cyclic, or otherwise invalid topology remains representable for diagnostics, but cannot be published

All 17 kinds are accepted by Draft, DSL, and clipboard boundaries. Their implementation completeness is explicit through `placeholder`, `draft-ready`, and `runtime-ready`; editor visibility never implies Runtime Support.

Every node kind is registered through `WorkflowNodeDefinition<TKind>` and must provide:

- `kind`
- visual metadata for card and picker rendering
- layout metrics
- default persisted data
- settings schema or custom settings UI binding
- source/target handle definitions
- connection capability metadata
- optional data migration and sanitization
- optional validation and output variables

Draft/Execution Schema、当前 Draft Schema Version、持久化字段白名单和成熟度统一由 `packages/contracts/src/workflow/node-contract.ts` 管理。Draft 到 Execution 的唯一投影位于 `packages/workflow-engine/src/node-contract-registry.ts`，Web 节点 Definition 不生成 Execution Config。完整协议见 `docs/superpowers/specs/2026-08-11-workflow-node-contract-registry-design.md`。

Persisted node data always includes `kind` and `schemaVersion`. Runtime-only fields such as selection state, callbacks, hover state, insert menu state, and render z-index are stripped by hydration/export boundaries.

Adding a new node kind requires updating:

- `types.ts` for kind-specific data and config patch typing
- `packages/contracts/src/workflow/node-contract.ts` for shared Draft/Execution contracts
- `packages/workflow-engine/src/node-contract-registry.ts` when the kind can be projected
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

The import boundary accepts only `chatai-workflow`, schema version `1`, and `workflow.draft`. Unsupported product kinds, schema versions, and payload formats are rejected rather than converted through unreleased compatibility code.

`workflow.executionGraph` is an export and diagnostic representation. Backend publish receives the sanitized Draft and independently compiles it through `@chatai/workflow-engine`; it must not trust a client-supplied execution graph.

Current execution graph shape:

```ts
type WorkflowExecutionGraph = {
  diagnostics: WorkflowGraphValidationIssue[];
  edges: WorkflowExecutionEdge[];
  entryNodeId: string | null;
  incoming: Record<string, string[]>;
  nodes: WorkflowExecutionNode[];
  outgoing: Record<string, string[]>;
  terminalNodeIds: string[];
  topologicalNodeIds: string[];
};

type WorkflowExecutionNode = {
  config: Record<string, unknown> | null;
  id: string;
  incomingMode: "any" | "none";
  kind: WorkflowNodeKind;
  maturity: "placeholder" | "draft-ready" | "runtime-ready";
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
- placeholder nodes expose `config: null` instead of a misleading empty execution config
- every node exposes its registered maturity
- `incomingMode` is `none` for `start` and `any` for other nodes, explicitly encoding OR-merge execution semantics
- node positions, labels, summaries, metrics, UI status, and callbacks are excluded from `config`
- `edges` contains source/target ids, handles, and resolved source outlet metadata
- `entryNodeId` is derived from the registered entry-role node
- `terminalNodeIds` is derived from registered terminal-role nodes
- `incoming` and `outgoing` index edge ids by node id for backend traversal
- `topologicalNodeIds` provides stable node ordering and always contains every execution node id
- `diagnostics` exposes graph validation issues such as cycles, disconnected nodes, and invalid connections
- invalid, cyclic, or disconnected topology is preserved in `edges` for diagnosis, but publish checks should block it before real backend execution

Schema v1 is the first public contract and already includes the first marketing kind catalog, execution topology, diagnostics, and explicit incoming merge semantics. Future schema versions should add migrations only after a released or persisted contract creates a real compatibility requirement.

Execution Config examples and validation are generated from the shared registry. Placeholder kinds do not receive fabricated `{}` configs.

## Variable Contract

Workflow variables are typed definitions with stable selectors. Display labels and node titles are not part of the persisted reference.

Variable scopes are:

- `system.*`: fixed runtime context such as the current employee
- `subject.*`: current Workflow Subject context
- `trigger.*`: data supplied by the event that entered the journey
- `node.<nodeId>.<outputKey>`: an output declared by a preceding node

Each node kind may declare typed outputs through `getOutputVariables`. No generic `result` or `journey.next` output is synthesized. Kinds without a confirmed business output expose no node output until that contract is defined.

Only outputs from nodes that dominate the current node are selectable. An output produced only on one branch is therefore unavailable after branches merge, until an explicit optional-value contract is introduced.

Variable selection is embedded in configuration fields that support references instead of being exposed through a generic inspector tab. Message content is the first consumer and persists text and variable references as structured segments:

```ts
type WorkflowMessageContentSegment =
  | { type: "text"; value: string }
  | { type: "variable"; selector: string[] };
```

The Lexical editor is an editing adapter only. Draft and execution config store these segments, never Lexical JSON. Missing or no-longer-reachable selectors are reported as node configuration issues and block publishing.

## Validation And Publish Gate

Frontend publish checks currently validate:

- missing or duplicate start/end nodes
- unreachable end
- disconnected nodes
- graph cycles
- graph depth limit
- invalid connection policy
- unsupported outgoing cardinality
- source/target handle occupancy
- unconnected source handles and branch paths
- node config schema issues
- node-definition validation issues

Multiple incoming edges are valid for every node except `start`. The frontend does not treat them as graph errors.

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
- draft hydration sanitizes external data and drops unsupported kinds
- runtime-only fields are stripped at save/export/import boundaries
- publish checks block invalid graphs before publish
- DSL export exposes `executionGraph` with node config, edge handles, entry/terminal ids, incoming/outgoing indexes, and stable node ordering
- read-only states still allow viewport navigation but block graph mutation
- save/publish/version-preview behavior is covered by tests
- frontend docs describe the backend contract and backend revalidation responsibilities
- the catalog is `start`, `wait`, `branch`, `message`, `tag`, `coupon`, `handoff`, and `end`
- every new draft guarantees one non-addable, non-deletable `start` and one non-addable, non-deletable `end`
- connection policy, validation, hydration, import/export, and execution projection implement multi-input OR-merge semantics

The structural catalog implementation is complete. Remaining frontend work depends on product decisions:

- exact field semantics for each node kind
- required-field and validation rules for each action kind
- real account/tag/filter selector components for start configuration
- real action parameter forms once marketing action types are finalized

Backend persistence and execution contracts can bind to the confirmed kind union and graph semantics, but concrete per-kind `config` payloads should wait until business fields are finalized.

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
