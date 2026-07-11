import { describe, expect, it } from "vitest";
import { MysqlWorkflowRepository } from "../../../src/modules/workflow/workflow-mysql.repository.js";

describe("MysqlWorkflowRepository", () => {
  it("saves a draft with tenant, logical-delete, and draft-version fencing", async () => {
    const db = createWorkflowDbMock();
    const repository = new MysqlWorkflowRepository(db as never);

    const result = await repository.saveDraft({
      draft: createDraft(),
      expectedDraftVersion: 3,
      opSubUserId: "19",
      uid: 8,
      workflowId: "42",
    });

    expect(result.kind).toBe("success");
    expect(db.updateBuilders).toHaveLength(1);
    expect(db.updateBuilders[0].wheres).toEqual(expect.arrayContaining([
      ["uid", "=", 8],
      ["id", "=", "42"],
      ["biz_status", "=", 1],
      ["draft_version", "=", 3],
    ]));
    expect(db.selectBuilders).toHaveLength(1);
  });

  it("uses an update for logical deletion and never exposes a physical delete path", async () => {
    const db = createWorkflowDbMock();
    const repository = new MysqlWorkflowRepository(db as never);

    const result = await repository.markDeleted({ opSubUserId: "19", uid: 8, workflowId: "42" });

    expect(result.kind).toBe("success");
    expect(db.deleteFromCalls).toBe(0);
    expect(db.updateBuilders[0].sets).toMatchObject({ biz_status: 0, client_request_id: null });
  });

  it("reports the current lifecycle status when a status transition is rejected", async () => {
    const db = createWorkflowDbMock({ numUpdatedRows: 0n });
    const repository = new MysqlWorkflowRepository(db as never);

    const result = await repository.setRuntimeStatus({
      allowedCurrentStatuses: ["active"],
      opSubUserId: "19",
      status: "paused",
      uid: 8,
      workflowId: "42",
    });

    expect(result).toEqual({ kind: "invalid-status", status: "inactive" });
  });
});

function createWorkflowDbMock(options: { numUpdatedRows?: bigint } = {}) {
  const row = {
    biz_status: 1,
    create_time: new Date("2026-07-10T00:00:00.000Z"),
    draft_json: JSON.stringify(createDraft()),
    draft_schema_version: 1,
    draft_version: 4,
    id: 42,
    name: "新客培育",
    op_sub_uid: 19,
    published_revision: null,
    runtime_status: "inactive",
    uid: 8,
    update_time: new Date("2026-07-10T00:00:01.000Z"),
    validated_draft_version: null,
  };
  const db = {
    deleteFromCalls: 0,
    selectBuilders: [] as Array<{ wheres: unknown[][] }>,
    updateBuilders: [] as Array<{ sets: Record<string, unknown>; wheres: unknown[][] }>,
    deleteFrom() {
      db.deleteFromCalls += 1;
      throw new Error("physical delete is forbidden");
    },
    selectFrom() {
      const state = { wheres: [] as unknown[][] };
      db.selectBuilders.push(state);
      const builder = {
        selectAll() { return builder; },
        where(...args: unknown[]) { state.wheres.push(args); return builder; },
        orderBy() { return builder; },
        limit() { return builder; },
        forUpdate() { return builder; },
        async execute() { return [row]; },
        async executeTakeFirst() { return row; },
      };
      return builder;
    },
    updateTable() {
      const state = { sets: {} as Record<string, unknown>, wheres: [] as unknown[][] };
      db.updateBuilders.push(state);
      const builder = {
        set(values: Record<string, unknown>) { state.sets = values; return builder; },
        where(...args: unknown[]) { state.wheres.push(args); return builder; },
        async executeTakeFirst() { return { numUpdatedRows: options.numUpdatedRows ?? 1n }; },
        async executeTakeFirstOrThrow() { return { numUpdatedRows: options.numUpdatedRows ?? 1n }; },
      };
      return builder;
    },
    transaction() {
      return {
        execute(operation: (transaction: typeof db) => unknown) {
          return operation(db);
        },
      };
    },
  };
  return db;
}

function createDraft() {
  return {
    edges: [{ id: "edge-start-end", source: "start", target: "end" }],
    nodes: [
      createNode("start"),
      createNode("end"),
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

function createNode(kind: "end" | "start") {
  return {
    data: {
      kind,
      label: kind,
      metric: "",
      schemaVersion: 1,
      status: "ready" as const,
      summary: "",
      title: kind,
    },
    id: kind,
    position: { x: 0, y: 0 },
  };
}
