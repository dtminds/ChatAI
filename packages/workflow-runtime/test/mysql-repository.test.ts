import { describe, expect, it } from "vitest";
import { MysqlWorkflowRuntimeRepository } from "../src/index.js";

describe("MysqlWorkflowRuntimeRepository", () => {
  it("checks the workflow boundary in the same transaction before creating a run", async () => {
    const db = createRunDbMock({ bizStatus: 1, runtimeStatus: "stopped" });
    const repository = new MysqlWorkflowRuntimeRepository(db as never);

    const result = await repository.createRunWithInitialTask({
      context: {},
      entryEventId: "event-1",
      entryPolicy: { mode: "never" },
      initialNodeId: "start",
      initialNodeKind: "start",
      occurredAt: new Date("2026-07-10T00:00:00.000Z"),
      revision: 1,
      shardId: 1,
      subjectId: "customer-1",
      uid: 8,
      workflowId: "42",
    });

    expect(result).toEqual({ action: "cancel", kind: "workflow-unavailable" });
    expect(db.definitionReadShareLocked).toBe(true);
    expect(db.runInsertCount).toBe(0);
  });

  it("rechecks event deduplication after locking the subject admission guard", async () => {
    const db = createConcurrentDuplicateRunDbMock();
    const repository = new MysqlWorkflowRuntimeRepository(db as never);

    const result = await repository.createRunWithInitialTask({
      context: {},
      entryEventId: "event-1",
      entryPolicy: { mode: "never" },
      initialNodeId: "start",
      initialNodeKind: "start",
      occurredAt: new Date("2020-01-01T00:00:00.000Z"),
      revision: 1,
      shardId: 1,
      subjectId: "customer-1",
      uid: 8,
      workflowId: "42",
    });

    expect(result).toMatchObject({ deduplicated: true, kind: "success" });
    expect(db.runReadCount).toBe(2);
    expect(db.guardWriteLocked).toBe(true);
    expect(db.runInsertCount).toBe(0);
  });

  it("uses a shared definition lock when claiming an execution task", async () => {
    const db = createClaimDbMock();
    const repository = new MysqlWorkflowRuntimeRepository(db as never);

    const result = await repository.claimTask({
      expectedTaskVersion: 1,
      leaseExpiresAt: new Date("2026-07-10T00:01:00.000Z"),
      leaseOwner: "worker-1",
      taskId: "7",
      uid: 8,
    });

    expect(result.kind).toBe("success");
    expect(db.definitionReadShareLocked).toBe(true);
    expect(db.lockOrder).toEqual(["run", "task"]);
    expect(db.taskUpdate).toMatchObject({ attempt: 1 });
    expect(db.runUpdate).toMatchObject({ status: "running" });
  });

  it("locks the run before the task and rejects a claim after the run becomes terminal", async () => {
    const db = createClaimDbMock("active", "cancelled");
    const repository = new MysqlWorkflowRuntimeRepository(db as never);

    const result = await repository.claimTask({
      expectedTaskVersion: 1,
      leaseExpiresAt: new Date("2026-07-10T00:01:00.000Z"),
      leaseOwner: "worker-1",
      taskId: "7",
      uid: 8,
    });

    expect(result).toEqual({ kind: "conflict" });
    expect(db.lockOrder).toEqual(["run"]);
    expect(db.taskUpdate).toEqual({});
  });

  it("reads only active current-revision trigger bindings through the definition join", async () => {
    const db = createTriggerBindingDbMock();
    const repository = new MysqlWorkflowRuntimeRepository(db as never);

    const result = await repository.listActiveTriggerBindings(8, "contact.friend_added");

    expect(result).toMatchObject([{
      eventType: "contact.friend_added",
      filter: { accountIds: ["account-a"] },
      revision: 2,
      workflowId: "42",
    }]);
    expect(db.joinReferences).toEqual(expect.arrayContaining([
      ["definition.published_revision", "=", "binding.revision"],
    ]));
    expect(db.wheres).toEqual(expect.arrayContaining([
      ["binding.uid", "=", 8],
      ["binding.event_type", "=", "contact.friend_added"],
      ["binding.status", "=", 1],
      ["definition.biz_status", "=", 1],
      ["definition.runtime_status", "=", "active"],
    ]));
  });

  it("normalizes string BIGINT tenant ids at the runtime boundary", async () => {
    const db = createTriggerBindingDbMock({ uid: "8" });
    const repository = new MysqlWorkflowRuntimeRepository(db as never);

    const [binding] = await repository.listActiveTriggerBindings(8, "contact.friend_added");

    expect(binding?.uid).toBe(8);
  });

  it.each([
    { action: "defer", expectedStatus: "pending", runtimeStatus: "paused" },
    { action: "cancel", expectedStatus: "cancelled", runtimeStatus: "stopped" },
  ] as const)("persists $action at the task claim boundary", async ({
    action,
    expectedStatus,
    runtimeStatus,
  }) => {
    const db = createClaimDbMock(runtimeStatus);
    const repository = new MysqlWorkflowRuntimeRepository(db as never);

    const result = await repository.claimTask({
      expectedTaskVersion: 1,
      leaseExpiresAt: new Date("2026-07-10T00:01:00.000Z"),
      leaseOwner: "worker-1",
      taskId: "7",
      uid: 8,
    });

    expect(result).toEqual({ action, kind: "workflow-unavailable" });
    expect(db.taskUpdate).toMatchObject({ status: expectedStatus, task_version: 2 });
  });

  it("does not overwrite or count runs that become terminal before stop reconciliation", async () => {
    const db = createRuntimeDbMock();
    const repository = new MysqlWorkflowRuntimeRepository(db as never);

    const result = await repository.cancelWorkflowBatch({
      limit: 100,
      uid: 8,
      workflowId: "42",
    });

    expect(result).toMatchObject({ cancelled: 0, hasMore: false, lastRunId: "1" });
    expect(db.runUpdateWheres).toContainEqual([
      "status",
      "in",
      ["queued", "running", "waiting"],
    ]);
  });

  it("fails the matching dispatched task when its outbox attempts are exhausted", async () => {
    const db = createOutboxDeadDbMock();
    const repository = new MysqlWorkflowRuntimeRepository(db as never);
    const failedAt = new Date("2026-07-11T00:00:00.000Z");

    await expect(repository.markOutboxDead({
      failedAt,
      id: "11",
      leaseOwner: "publisher-1",
    })).resolves.toBe(true);

    expect(db.outboxUpdate).toMatchObject({ status: "dead" });
    expect(db.taskUpdate).toMatchObject({
      last_error_code: "WORKFLOW_OUTBOX_ATTEMPTS_EXHAUSTED",
      status: "dead",
      task_version: 3,
    });
    expect(db.runUpdate).toMatchObject({
      completed_at: failedAt,
      status: "failed",
      terminal_reason: "WORKFLOW_OUTBOX_ATTEMPTS_EXHAUSTED",
    });
  });
});

function createRunDbMock(input: { bizStatus: number; runtimeStatus: string }) {
  const db = {
    definitionReadShareLocked: false,
    runInsertCount: 0,
    insertInto(table: string) {
      if (table === "xy_wap_embed_workflow_run") db.runInsertCount += 1;
      throw new Error("Run insert must not occur for an unavailable workflow");
    },
    selectFrom(table: string) {
      const builder = {
        forShare() {
          if (table === "xy_wap_embed_workflow_definition") db.definitionReadShareLocked = true;
          return builder;
        },
        select() { return builder; },
        where() { return builder; },
        async executeTakeFirst() {
          return { biz_status: input.bizStatus, runtime_status: input.runtimeStatus };
        },
      };
      return builder;
    },
    transaction() {
      return {
        execute: async (operation: (transaction: typeof db) => unknown) => operation(db),
      };
    },
  };
  return db;
}

function createConcurrentDuplicateRunDbMock() {
  const admittedAt = new Date("2026-07-10T00:00:00.000Z");
  const run = {
    completed_at: null,
    context_json: "{}",
    create_time: admittedAt,
    current_node_id: "start",
    entry_event_id: "event-1",
    id: "5",
    lock_version: 1,
    next_execute_at: admittedAt,
    revision: 1,
    sequence: 1,
    shard_id: 1,
    status: "queued",
    subject_id: "customer-1",
    terminal_reason: null,
    uid: 8,
    update_time: admittedAt,
    workflow_id: "42",
  };
  const task = {
    attempt: 0,
    bucket_time: admittedAt,
    create_time: admittedAt,
    due_at: admittedAt,
    id: "7",
    last_error_code: null,
    lease_expires_at: null,
    lease_owner: null,
    node_id: "start",
    node_kind: "start",
    revision: 1,
    run_id: "5",
    sequence: 1,
    shard_id: 1,
    status: "dispatched",
    task_type: "execute",
    task_version: 1,
    uid: 8,
    update_time: admittedAt,
    workflow_id: "42",
  };
  const db = {
    guardWriteLocked: false,
    runInsertCount: 0,
    runReadCount: 0,
    insertInto(table: string) {
      if (table === "xy_wap_embed_workflow_run") db.runInsertCount += 1;
      const builder = {
        onDuplicateKeyUpdate() { return builder; },
        values() { return builder; },
        async executeTakeFirstOrThrow() { return { insertId: "1" }; },
      };
      return builder;
    },
    selectFrom(table: string) {
      const builder = {
        forShare() { return builder; },
        forUpdate() {
          if (table === "xy_wap_embed_workflow_entry_guard") db.guardWriteLocked = true;
          return builder;
        },
        limit() { return builder; },
        orderBy() { return builder; },
        select() { return builder; },
        selectAll() { return builder; },
        where() { return builder; },
        async executeTakeFirst() {
          if (table === "xy_wap_embed_workflow_definition") {
            return { biz_status: 1, published_revision: 1, runtime_status: "active" };
          }
          if (table === "xy_wap_embed_workflow_run") {
            db.runReadCount += 1;
            return db.runReadCount === 1 ? undefined : run;
          }
          if (table === "xy_wap_embed_workflow_task") return task;
          return undefined;
        },
        async executeTakeFirstOrThrow() {
          if (table === "xy_wap_embed_workflow_entry_guard") {
            return { id: "3", total_entries: 1 };
          }
          throw new Error(`Unexpected required read from ${table}`);
        },
      };
      return builder;
    },
    selectNoFrom() {
      return {
        async executeTakeFirstOrThrow() { return { now: admittedAt }; },
      };
    },
    transaction() {
      return {
        execute: async (operation: (transaction: typeof db) => unknown) => operation(db),
      };
    },
  };
  return db;
}

function createClaimDbMock(runtimeStatus = "active", runStatus = "waiting") {
  const task = {
    attempt: 0,
    bucket_time: new Date("2026-07-10T00:00:00.000Z"),
    create_time: new Date("2026-07-10T00:00:00.000Z"),
    due_at: new Date("2026-07-10T00:00:00.000Z"),
    id: "7",
    last_error_code: null,
    lease_expires_at: null,
    lease_owner: null,
    node_id: "start",
    node_kind: "start",
    revision: 1,
    run_id: "5",
    sequence: 1,
    shard_id: 1,
    status: "dispatched",
    task_type: "execute",
    task_version: 1,
    uid: 8,
    update_time: new Date("2026-07-10T00:00:00.000Z"),
    workflow_id: "42",
  };
  const db = {
    definitionReadShareLocked: false,
    lockOrder: [] as string[],
    runUpdate: {} as Record<string, unknown>,
    taskUpdate: {} as Record<string, unknown>,
    selectFrom(table: string) {
      const builder = {
        forUpdate() {
          db.lockOrder.push(table === "xy_wap_embed_workflow_run" ? "run" : "task");
          return builder;
        },
        forShare() {
          if (table === "xy_wap_embed_workflow_definition") db.definitionReadShareLocked = true;
          return builder;
        },
        select() { return builder; },
        selectAll() { return builder; },
        where() { return builder; },
        async executeTakeFirst() {
          if (table === "xy_wap_embed_workflow_task") return task;
          if (table === "xy_wap_embed_workflow_run") {
            return { current_node_id: "start", revision: 1, shard_id: 1, status: runStatus, workflow_id: "42" };
          }
          return { biz_status: 1, runtime_status: runtimeStatus };
        },
      };
      return builder;
    },
    transaction() {
      return {
        execute: async (operation: (transaction: typeof db) => unknown) => operation(db),
      };
    },
    updateTable(table: string) {
      const builder = {
        set(values: Record<string, unknown>) {
          if (table === "xy_wap_embed_workflow_task") db.taskUpdate = values;
          if (table === "xy_wap_embed_workflow_run") db.runUpdate = values;
          return builder;
        },
        where() { return builder; },
        async executeTakeFirst() { return { numUpdatedRows: 1n }; },
        async executeTakeFirstOrThrow() { return { numUpdatedRows: 1n }; },
      };
      return builder;
    },
  };
  return db;
}

function createTriggerBindingDbMock(options: { uid?: number | string } = {}) {
  const now = new Date("2026-07-10T00:00:00.000Z");
  const db = {
    joinReferences: [] as unknown[][],
    wheres: [] as unknown[][],
    selectFrom() {
      const builder = {
        innerJoin(_table: string, callback: (join: typeof joinBuilder) => unknown) {
          callback(joinBuilder);
          return builder;
        },
        select() { return builder; },
        where(...args: unknown[]) { db.wheres.push(args); return builder; },
        async execute() {
          return [{
            create_time: now,
            event_type: "contact.friend_added",
            filter_spec_json: JSON.stringify({
              accountIds: ["account-a"],
              entryPolicy: { mode: "never" },
              triggers: [{ type: "contact.friend_added" }],
            }),
            id: "9",
            revision: 2,
            status: 1,
            uid: options.uid ?? 8,
            update_time: now,
            workflow_id: "42",
          }];
        },
      };
      const joinBuilder = {
        onRef(...args: unknown[]) { db.joinReferences.push(args); return joinBuilder; },
      };
      return builder;
    },
  };
  return db;
}

function createRuntimeDbMock() {
  const db = {
    runUpdateWheres: [] as unknown[][],
    selectFrom(table: string) {
      const builder = {
        forUpdate() { return builder; },
        limit() { return builder; },
        orderBy() { return builder; },
        select() { return builder; },
        where() { return builder; },
        async execute() {
          return table === "xy_wap_embed_workflow_run"
            ? [{ current_node_id: "start", id: "1", revision: 1, shard_id: 1, workflow_id: "42" }]
            : [];
        },
      };
      return builder;
    },
    transaction() {
      return {
        execute: async (operation: (transaction: typeof db) => unknown) => operation(db),
      };
    },
    updateTable(table: string) {
      const builder = {
        set() { return builder; },
        where(...args: unknown[]) {
          if (table === "xy_wap_embed_workflow_run") db.runUpdateWheres.push(args);
          return builder;
        },
        async executeTakeFirst() {
          return { numUpdatedRows: table === "xy_wap_embed_workflow_run" ? 0n : 0n };
        },
      };
      return builder;
    },
  };
  return db;
}

function createOutboxDeadDbMock() {
  const outbox = {
    aggregate_id: "7",
    aggregate_type: "workflow_task",
    attempt: 5,
    create_time: new Date("2026-07-11T00:00:00.000Z"),
    event_type: "workflow.task.ready",
    id: "11",
    lease_expires_at: new Date("2026-07-11T00:01:00.000Z"),
    lease_owner: "publisher-1",
    next_attempt_at: new Date("2026-07-11T00:00:00.000Z"),
    payload_json: "{}",
    sent_at: null,
    status: "leased",
    task_version: 2,
    uid: 8,
    update_time: new Date("2026-07-11T00:00:00.000Z"),
  };
  const task = {
    id: "7",
    node_id: "start",
    node_kind: "start",
    revision: 1,
    run_id: "5",
    shard_id: 1,
    task_version: 2,
    workflow_id: "42",
  };
  const db = {
    outboxUpdate: {} as Record<string, unknown>,
    runUpdate: {} as Record<string, unknown>,
    taskUpdate: {} as Record<string, unknown>,
    selectFrom(table: string) {
      const builder = {
        forUpdate() { return builder; },
        select() { return builder; },
        selectAll() { return builder; },
        where() { return builder; },
        async executeTakeFirst() {
          if (table === "xy_wap_embed_workflow_outbox") return outbox;
          if (table === "xy_wap_embed_workflow_run") {
            return { current_node_id: "start", revision: 1, shard_id: 1, workflow_id: "42" };
          }
          return task;
        },
        limit() { return builder; },
        orderBy() { return builder; },
      };
      return builder;
    },
    transaction() {
      return {
        execute: async (operation: (transaction: typeof db) => unknown) => operation(db),
      };
    },
    updateTable(table: string) {
      const builder = {
        set(values: Record<string, unknown>) {
          if (table === "xy_wap_embed_workflow_outbox") db.outboxUpdate = values;
          if (table === "xy_wap_embed_workflow_task") db.taskUpdate = values;
          if (table === "xy_wap_embed_workflow_run") db.runUpdate = values;
          return builder;
        },
        where() { return builder; },
        async executeTakeFirstOrThrow() { return { numUpdatedRows: 1n }; },
      };
      return builder;
    },
  };
  return db;
}
