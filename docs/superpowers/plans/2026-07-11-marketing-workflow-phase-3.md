# Marketing Workflow Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the independent Workflow Worker, TDMQ Pulsar messaging path, Start admission, Wait scheduling, reconciliation, smoke tooling, and production-shaped Start/Wait configuration for Phase 3.

**Architecture:** MySQL remains authoritative. A shared `@chatai/workflow-runtime` package owns runtime persistence and application services used by both the Fastify control plane and the independent `apps/workflow-worker`; `@chatai/workflow-engine` remains deterministic and infrastructure-free. The worker talks to Pulsar through a narrow broker port with real and fake adapters, so CI never needs Tencent Cloud credentials.

**Tech Stack:** Node.js 24, TypeScript, Kysely, TypeBox, Vitest, Fastify-compatible structured logging, `pulsar-client`, React 19, Tailwind CSS v4, shadcn/ui.

## Global Constraints

- Work in the main workspace on `codex/workflow-iteration-3`; do not use a worktree.
- PR base is `codex/marketing-workflow-demo`.
- Use `corepack pnpm ...` for package scripts.
- Never commit a Pulsar token, database credential, or real customer payload.
- CI uses `FakeWorkflowBroker`; real TDMQ is exercised only by the explicit smoke command.
- Phase 3 can enable only `start`, `wait`, and `end` nodes.
- All database tables retain an auto-increment surrogate `id`, `create_time`, and `update_time`.
- Admission correctness must be atomic under concurrent entry events and cannot depend on Redis or process memory.
- User-visible frontend controls reuse existing project UI components and node-definition boundaries.

---

### Task 1: Shared Trigger And Wait Contracts

**Files:**
- Create: `packages/contracts/src/workflow/trigger.ts`
- Modify: `packages/contracts/src/workflow/execution.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/test/workflow-dto.test.ts`
- Modify: `packages/workflow-engine/src/compiler.ts`
- Create: `packages/workflow-engine/src/trigger.ts`
- Modify: `packages/workflow-engine/src/node-executor.ts`
- Modify: `packages/workflow-engine/src/index.ts`
- Create: `packages/workflow-engine/test/trigger.test.ts`
- Modify: `packages/workflow-engine/test/compiler.test.ts`
- Modify: `packages/workflow-engine/test/node-executor.test.ts`

**Interfaces:**
- Produces `WorkflowStartConfigSchema`, `WorkflowEntryPolicySchema`, `WorkflowEntryCommandSchema`, `WorkflowWaitConfigSchema`, and their TypeScript types.
- Produces `matchWorkflowTrigger(config, command)` and `getWorkflowTriggerBindings(config)` for control-plane publication and worker entry matching.

- [ ] **Step 1: Write failing contract and engine tests**

Cover the three standard event types, required `thirdUserId`, typed payloads, account/tag/keyword OR matching, literal keyword normalization, entry-policy validation, minute/hour/day waits, and unsupported-node capability errors.

```ts
expect(matchWorkflowTrigger(startConfig, messageCommand("SPECIAL offer"))).toBe(true);
expect(() => compileWorkflowDraft(draftWithNode("message"))).toThrowError(
  expect.objectContaining({ issues: expect.arrayContaining([
    expect.objectContaining({ code: "unsupported-runtime-node" }),
  ]) }),
);
```

- [ ] **Step 2: Run the focused tests and verify RED**

```bash
corepack pnpm --filter @chatai/contracts test
corepack pnpm --filter @chatai/workflow-engine test
```

Expected: failures for missing schemas, trigger matcher, wait unit calculation, and capability validation.

- [ ] **Step 3: Implement strict schemas and deterministic matching**

Use a discriminated command union and a start configuration shaped as:

```ts
type WorkflowStartConfig = {
  accountIds: string[];
  entryPolicy: WorkflowEntryPolicy;
  triggers: Array<
    | { type: "contact.friend_added" }
    | { tagIds: string[]; type: "customer.tag_added" }
    | { match: "any"; type: "message.received" }
    | { keywords: string[]; match: "keywords"; type: "message.received" }
  >;
};
```

Reject empty accounts, empty triggers, empty tag lists, empty normalized keyword lists, non-positive wait values, and every runtime node outside `start/wait/end`.

- [ ] **Step 4: Run tests and builds**

```bash
corepack pnpm --filter @chatai/contracts test
corepack pnpm --filter @chatai/contracts build
corepack pnpm --filter @chatai/workflow-engine test
corepack pnpm --filter @chatai/workflow-engine build
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts packages/workflow-engine
git commit -m "Define workflow entry contracts"
```

### Task 2: Shared Runtime Package And Atomic Entry Admission

**Files:**
- Create: `packages/workflow-runtime/package.json`
- Create: `packages/workflow-runtime/tsconfig.json`
- Create: `packages/workflow-runtime/vitest.config.ts`
- Move runtime ownership from: `apps/backend/src/modules/workflow/workflow-runtime-*.ts`
- Create: `packages/workflow-runtime/src/db.ts`
- Create: `packages/workflow-runtime/src/types.ts`
- Create: `packages/workflow-runtime/src/service.ts`
- Create: `packages/workflow-runtime/src/memory-repository.ts`
- Create: `packages/workflow-runtime/src/mysql-repository.ts`
- Create: `packages/workflow-runtime/src/reconciler.ts`
- Create: `packages/workflow-runtime/src/index.ts`
- Move/update tests from: `apps/backend/test/modules/workflow/workflow-runtime-*.test.ts`
- Create: `packages/workflow-runtime/test/entry-admission.test.ts`
- Modify: `apps/backend/src/modules/workflow/index.ts`
- Modify: `apps/backend/src/modules/workflow/workflow-db.ts`
- Modify: `apps/backend/src/modules/workflow/workflow-mysql.repository.ts`
- Modify: `apps/backend/src/modules/workflow/workflow-memory.repository.ts`
- Modify: `apps/backend/package.json`

**Interfaces:**
- Consumes execution contracts and pure engine functions from Task 1.
- Produces `WorkflowRuntimeRepository`, `WorkflowRuntimeService`, `WorkflowEntryService`, `WorkflowSchedulerRepository`, and `WorkflowOutboxRepository` without Fastify dependencies.

- [ ] **Step 1: Write failing atomic admission tests**

Protect event deduplication, `never`, lifetime M, rolling-window N/M based on repository/database time, all-status counting, cross-revision counting, and concurrent requests that must never exceed M.

```ts
const results = await Promise.all(Array.from({ length: 10 }, (_, index) =>
  service.admit({ ...entry, eventId: `event-${index}` }, binding),
));
expect(results.filter(result => result.kind === "started")).toHaveLength(2);
```

- [ ] **Step 2: Verify RED in the new package**

```bash
corepack pnpm --filter @chatai/workflow-runtime test
```

Expected: package or admission interfaces are missing.

- [ ] **Step 3: Introduce `workflow_entry_guard` and runtime package boundaries**

The guard row is unique on `(uid, workflow_id, subject_id)`, stores `total_entries`, and is locked before admission. Rolling windows count indexed Run rows after the database-derived cutoff while holding the guard lock. Duplicate `eventId + workflowId` returns the existing Run without incrementing the guard.

```ts
type WorkflowEntryAdmissionResult =
  | { kind: "started"; run: WorkflowRunRecord; task: WorkflowTaskRecord }
  | { kind: "deduplicated"; run: WorkflowRunRecord; task: WorkflowTaskRecord }
  | { kind: "entry-policy-rejected" }
  | { action: "cancel" | "defer"; kind: "workflow-unavailable" };
```

- [ ] **Step 4: Move existing runtime behavior without regressions**

Update backend imports to consume the shared package and retain claim fencing, commit transactions, pause/deletion boundaries, stable idempotency keys, and batch cancellation.

- [ ] **Step 5: Run runtime and backend tests**

```bash
corepack pnpm --filter @chatai/workflow-runtime test
corepack pnpm --filter @chatai/workflow-runtime build
corepack pnpm --filter @chatai/backend test
corepack pnpm --filter @chatai/backend build
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/workflow-runtime apps/backend pnpm-lock.yaml
git commit -m "Extract workflow runtime services"
```

### Task 3: Trigger Binding Publication

**Files:**
- Modify: `apps/backend/src/modules/workflow/workflow-repository-types.ts`
- Modify: `apps/backend/src/modules/workflow/workflow-memory.repository.ts`
- Modify: `apps/backend/src/modules/workflow/workflow-mysql.repository.ts`
- Modify: `apps/backend/src/modules/workflow/workflow.service.ts`
- Modify: `apps/backend/test/modules/workflow/workflow-service.test.ts`
- Modify: `apps/backend/test/modules/workflow/workflow-mysql-repository.test.ts`
- Modify: `docs/db/schema.sql`
- Modify: `apps/backend/src/db/writable-tables.ts`

**Interfaces:**
- Consumes `getWorkflowTriggerBindings(startConfig)` from Task 1.
- Produces immutable revision bindings and an active-binding reader for the Entry Consumer and smoke command.

- [ ] **Step 1: Write failing publication tests**

Assert that validation-only publication creates no binding, first enable writes bindings in the Revision transaction, republish deactivates old bindings and activates new bindings atomically, pause retains bindings but admission rejects, and stop/delete prevent matching.

- [ ] **Step 2: Verify RED**

```bash
cd apps/backend
./node_modules/.bin/vitest run test/modules/workflow/workflow-service.test.ts test/modules/workflow/workflow-mysql-repository.test.ts
```

- [ ] **Step 3: Implement binding persistence and active reads**

Store one canonical binding per `eventType` per Revision, with account IDs, event filters, and entry policy in `filter_spec_json`. Replace binding status in the same transaction that inserts the Revision and updates `published_revision`.

- [ ] **Step 4: Verify tests and build**

```bash
corepack pnpm --filter @chatai/backend test
corepack pnpm --filter @chatai/backend build
```

- [ ] **Step 5: Commit**

```bash
git add apps/backend docs/db/schema.sql
git commit -m "Persist workflow trigger bindings"
```

### Task 4: Broker Port And Independent Worker Shell

**Files:**
- Create: `apps/workflow-worker/package.json`
- Create: `apps/workflow-worker/tsconfig.json`
- Create: `apps/workflow-worker/vitest.config.ts`
- Create: `apps/workflow-worker/src/config.ts`
- Create: `apps/workflow-worker/src/broker/types.ts`
- Create: `apps/workflow-worker/src/broker/fake.ts`
- Create: `apps/workflow-worker/src/broker/pulsar.ts`
- Create: `apps/workflow-worker/src/health.ts`
- Create: `apps/workflow-worker/src/logger.ts`
- Create: `apps/workflow-worker/src/index.ts`
- Create: `apps/workflow-worker/test/config.test.ts`
- Create: `apps/workflow-worker/test/fake-broker.test.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Produces `WorkflowBroker.publish`, `WorkflowBroker.subscribe`, `WorkflowBroker.close`, and broker-neutral `ack`/`negativeAck` message handles.
- Produces validated environment configuration for dev/test01 topics and separate Entry/Task subscriptions.

- [ ] **Step 1: Write failing config and fake-broker tests**

Cover missing token/service URL, environment topic mapping, separate subscriptions, Shared mode, redelivery, DLQ after max redeliveries, graceful close, and no credential values in error messages.

- [ ] **Step 2: Verify RED**

```bash
corepack pnpm --filter @chatai/workflow-worker test
```

- [ ] **Step 3: Implement broker-neutral runtime and real Pulsar adapter**

Use `pulsar-client` only inside `broker/pulsar.ts`. Configure `AuthenticationToken`, Shared subscriptions, retry/DLQ policy, message keys, batching, and graceful producer/consumer/client shutdown. The fake adapter must model redelivery deterministically for CI.

- [ ] **Step 4: Add health and structured logging**

Expose `/healthz` for process liveness and `/readyz` for database/broker/role readiness. Logs include IDs but never trigger message text or customer payload.

- [ ] **Step 5: Run package tests and build**

```bash
corepack pnpm --filter @chatai/workflow-worker test
corepack pnpm --filter @chatai/workflow-worker build
```

- [ ] **Step 6: Commit**

```bash
git add apps/workflow-worker package.json pnpm-lock.yaml
git commit -m "Scaffold independent workflow worker"
```

### Task 5: Entry And Task Consumers

**Files:**
- Create: `apps/workflow-worker/src/entry-consumer.ts`
- Create: `apps/workflow-worker/src/task-consumer.ts`
- Create: `apps/workflow-worker/src/error-policy.ts`
- Modify: `apps/workflow-worker/src/index.ts`
- Create: `apps/workflow-worker/test/entry-consumer.test.ts`
- Create: `apps/workflow-worker/test/task-consumer.test.ts`

**Interfaces:**
- Consumes active Trigger Bindings and atomic admission from Tasks 2/3.
- Consumes `WorkflowRuntimeService.executeTask` and broker message handles.
- Produces ACK/NACK behavior with explicit terminal, stale, deferred, and retryable classifications.

- [ ] **Step 1: Write failing consumer tests**

Cover malformed entry DLQ, nonmatching ACK, one event fan-out to multiple workflows, per-workflow deduplication, entry-policy rejection ACK, task success ACK, paused/deleted task ACK after persistence, stale task ACK, and transient database failure NACK.

- [ ] **Step 2: Verify RED**

```bash
corepack pnpm --filter @chatai/workflow-worker test -- entry-consumer task-consumer
```

- [ ] **Step 3: Implement consumers with schema validation and error policy**

Validate before repository access. Do not place `workflowId` in Entry messages. ACK only after final database transactions; classify known state-boundary outcomes as consumed, and reserve NACK for transient infrastructure failures.

- [ ] **Step 4: Run worker and runtime tests**

```bash
corepack pnpm --filter @chatai/workflow-worker test
corepack pnpm --filter @chatai/workflow-runtime test
```

- [ ] **Step 5: Commit**

```bash
git add apps/workflow-worker packages/workflow-runtime
git commit -m "Consume workflow entry and task messages"
```

### Task 6: Scheduler, Outbox Publisher, And Reconciler

**Files:**
- Modify: `packages/workflow-runtime/src/db.ts`
- Modify: `packages/workflow-runtime/src/types.ts`
- Modify: `packages/workflow-runtime/src/mysql-repository.ts`
- Modify: `packages/workflow-runtime/src/memory-repository.ts`
- Modify: `packages/workflow-runtime/src/reconciler.ts`
- Create: `apps/workflow-worker/src/scheduler.ts`
- Create: `apps/workflow-worker/src/outbox-publisher.ts`
- Create: `apps/workflow-worker/src/reconciler.ts`
- Create: `apps/workflow-worker/src/role-loop.ts`
- Modify: `apps/workflow-worker/src/index.ts`
- Create: `apps/workflow-worker/test/scheduler.test.ts`
- Create: `apps/workflow-worker/test/outbox-publisher.test.ts`
- Create: `apps/workflow-worker/test/reconciler.test.ts`
- Modify: `docs/db/schema.sql`

**Interfaces:**
- Produces leased batch claims for due Tasks and pending Outbox rows.
- Produces recovery of expired execution/outbox leases and cursor-based cancellation of stopped/deleted workflows.

- [ ] **Step 1: Write failing multi-instance and crash-window tests**

Assert two Scheduler instances cannot dispatch the same task, two Publishers cannot own the same Outbox row, publish-success/mark-failure causes safe duplicate delivery, expired leases are recovered with version increments, paused workflows are not dispatched, and stop/delete batches converge.

- [ ] **Step 2: Verify RED**

```bash
corepack pnpm --filter @chatai/workflow-runtime test
corepack pnpm --filter @chatai/workflow-worker test
```

- [ ] **Step 3: Implement lease-backed batch repositories**

Add Outbox lease fields and batch APIs. Scheduler claims due tasks by shard and minute bucket, checks definition boundaries in batches, marks dispatch state and writes Outbox in one transaction. Publisher claims Outbox rows, publishes with `runId` message key, and marks sent only after broker success.

- [ ] **Step 4: Implement role loops and reconciliation**

Each loop has bounded batches, configurable intervals, overlap prevention, structured duration/count logs, abort-signal shutdown, and readiness heartbeat. Reconciler recovers leases and converges stop/delete cancellation without a synchronous HTTP fan-out.

- [ ] **Step 5: Run all runtime and worker tests**

```bash
corepack pnpm --filter @chatai/workflow-runtime test
corepack pnpm --filter @chatai/workflow-worker test
```

- [ ] **Step 6: Commit**

```bash
git add packages/workflow-runtime apps/workflow-worker docs/db/schema.sql
git commit -m "Schedule and reconcile workflow tasks"
```

### Task 7: Start/Wait Product Configuration And Smoke Producer

**Files:**
- Modify: `apps/web/src/pages/chat/workflow/types.ts`
- Modify: `apps/web/src/pages/chat/workflow/nodes/start/definition.ts`
- Modify: `apps/web/src/pages/chat/workflow/nodes/start/panel.tsx`
- Modify: `apps/web/src/pages/chat/workflow/nodes/start/ui.ts`
- Modify: `apps/web/src/pages/chat/workflow/nodes/wait/definition.ts`
- Modify: `apps/web/src/pages/chat/workflow/nodes/wait/ui.tsx`
- Create: `apps/web/src/pages/chat/workflow/nodes/start/fixture-options.ts`
- Modify: `apps/web/test/pages/chat/workflow/workflow-node-definitions.test.tsx`
- Create: `apps/web/test/pages/chat/workflow/workflow-start-config.test.tsx`
- Create: `apps/workflow-worker/src/smoke-entry.ts`
- Create: `apps/workflow-worker/test/smoke-entry.test.ts`
- Modify: `apps/workflow-worker/package.json`

**Interfaces:**
- Produces formal draft data that compiles to Task 1 contracts.
- Produces `workflow:smoke:entry --workflow-id --subject-id` that reads but never writes Workflow configuration.

- [ ] **Step 1: Write failing frontend and smoke tests**

Protect required selected accounts, OR trigger selection, tag/keyword fixtures, three entry-policy modes, default M=2, rolling hour/day controls, wait minute/hour/day controls, and smoke messages that omit `workflowId`.

- [ ] **Step 2: Verify RED**

```bash
cd apps/web
./node_modules/.bin/vitest run --config vitest.config.ts test/pages/chat/workflow/workflow-node-definitions.test.tsx test/pages/chat/workflow/workflow-start-config.test.tsx
cd ../workflow-worker
./node_modules/.bin/vitest run --config vitest.config.ts test/smoke-entry.test.ts
```

- [ ] **Step 3: Implement Start and Wait configuration**

Use the existing custom Start panel and project UI primitives. Fixture account/tag providers are available only outside production. Do not add raw ID text inputs. Remove contradictory unlimited/repeat copy and serialize only the formal execution fields.

- [ ] **Step 4: Implement read-only smoke event construction**

The command reads `DATABASE_URL`, resolves the active binding for the supplied Workflow, creates a matching standard event, publishes it to the configured Entry Topic, and prints only `eventId` plus non-sensitive identifiers.

- [ ] **Step 5: Run web/worker tests and builds**

```bash
corepack pnpm --filter @chatai/web test test/pages/chat/workflow
corepack pnpm --filter @chatai/web build
corepack pnpm --filter @chatai/workflow-worker test
corepack pnpm --filter @chatai/workflow-worker build
```

- [ ] **Step 6: Commit**

```bash
git add apps/web apps/workflow-worker
git commit -m "Configure workflow entry and wait nodes"
```

### Task 8: Deployment, CI, Verification, And PR

**Files:**
- Create: `deploy/workflow-worker.Dockerfile`
- Modify: `.github/workflows/backend-ci.yml`
- Modify: `.env.example`
- Modify: `apps/backend/.env.example`
- Modify: `docs/deployment/tencent-cloud-containers.md`
- Modify: `docs/superpowers/specs/2026-07-10-marketing-workflow-execution-engine-design.md`

**Interfaces:**
- Produces a Debian-based worker image compatible with the native Pulsar client.
- Produces CI gates for contracts, engine, runtime, worker, backend, and affected web behavior without external TDMQ access.

- [ ] **Step 1: Add deployment and CI artifacts**

Document every non-secret environment variable, dev/test01 topic/subscription mapping, role flags, health port, manual smoke command, and graceful shutdown. CI installs dependencies and runs runtime/worker tests and builds when either new package changes.

- [ ] **Step 2: Run the complete verification matrix**

```bash
corepack pnpm --filter @chatai/contracts test
corepack pnpm --filter @chatai/contracts build
corepack pnpm --filter @chatai/workflow-engine test
corepack pnpm --filter @chatai/workflow-engine build
corepack pnpm --filter @chatai/workflow-runtime test
corepack pnpm --filter @chatai/workflow-runtime build
corepack pnpm --filter @chatai/workflow-worker test
corepack pnpm --filter @chatai/workflow-worker build
corepack pnpm --filter @chatai/backend test
corepack pnpm --filter @chatai/backend build
corepack pnpm --filter @chatai/web test test/pages/chat/workflow
corepack pnpm --filter @chatai/web build
git diff --check
```

Expected: every command exits 0; Vite may retain the repository's existing chunk-size and `NODE_ENV` warnings.

- [ ] **Step 3: Perform adversarial self-review**

Review the complete diff against Phase 3 requirements and explicitly trace: duplicate Entry, concurrent quota admission, publish crash window, ACK crash window, stale Task, pause/resume, stop/delete, expired leases, malformed messages, secret handling, role shutdown, and dev/test topic isolation. Add or correct tests before proceeding when evidence is indirect.

- [ ] **Step 4: Commit final documentation and CI**

```bash
git add .github deploy .env.example apps/backend/.env.example docs package.json pnpm-lock.yaml
git commit -m "Document workflow worker deployment"
```

- [ ] **Step 5: Push and open the PR**

```bash
git push -u origin codex/workflow-iteration-3
gh pr create --base codex/marketing-workflow-demo --head codex/workflow-iteration-3 --title "Implement marketing workflow Phase 3" --body-file /tmp/workflow-phase-3-pr.md
```

Expected: PR base/head are exact and the working tree is clean.
