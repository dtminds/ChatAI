import { describe, expect, it } from "vitest";
import { MysqlWorkflowRuntimeRepository } from "../../../src/modules/workflow/workflow-runtime-mysql.repository.js";

describe("MysqlWorkflowRuntimeRepository", () => {
  it("checks the workflow boundary in the same transaction before creating a run", async () => {
    const db = createRunDbMock({ bizStatus: 1, runtimeStatus: "stopped" });
    const repository = new MysqlWorkflowRuntimeRepository(db as never);

    const result = await repository.createRunWithInitialTask({
      context: {},
      entryEventId: "event-1",
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
    expect(db.definitionReadLocked).toBe(true);
    expect(db.runInsertCount).toBe(0);
  });

  it("uses a locking definition read when claiming an execution task", async () => {
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
    expect(db.definitionReadLocked).toBe(true);
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
});

function createRunDbMock(input: { bizStatus: number; runtimeStatus: string }) {
  const db = {
    definitionReadLocked: false,
    runInsertCount: 0,
    insertInto(table: string) {
      if (table === "xy_wap_embed_workflow_run") db.runInsertCount += 1;
      throw new Error("Run insert must not occur for an unavailable workflow");
    },
    selectFrom(table: string) {
      const builder = {
        forUpdate() {
          if (table === "xy_wap_embed_workflow_definition") db.definitionReadLocked = true;
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

function createClaimDbMock() {
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
    definitionReadLocked: false,
    selectFrom(table: string) {
      const builder = {
        forUpdate() {
          if (table === "xy_wap_embed_workflow_definition") db.definitionReadLocked = true;
          return builder;
        },
        select() { return builder; },
        selectAll() { return builder; },
        where() { return builder; },
        async executeTakeFirst() {
          return table === "xy_wap_embed_workflow_task"
            ? task
            : { biz_status: 1, runtime_status: "active" };
        },
      };
      return builder;
    },
    transaction() {
      return {
        execute: async (operation: (transaction: typeof db) => unknown) => operation(db),
      };
    },
    updateTable() {
      const builder = {
        set() { return builder; },
        where() { return builder; },
        async executeTakeFirstOrThrow() { return { numUpdatedRows: 1n }; },
      };
      return builder;
    },
  };
  return db;
}

function createRuntimeDbMock() {
  const db = {
    runUpdateWheres: [] as unknown[][],
    selectFrom() {
      const builder = {
        forUpdate() { return builder; },
        limit() { return builder; },
        orderBy() { return builder; },
        select() { return builder; },
        where() { return builder; },
        async execute() { return [{ id: "1" }]; },
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
