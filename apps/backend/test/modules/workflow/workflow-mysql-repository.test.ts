import { describe, expect, it } from "vitest";
import { MysqlWorkflowRepository } from "../../../src/modules/workflow/workflow-mysql.repository.js";

describe("MysqlWorkflowRepository", () => {
  it("updates workflow metadata without changing the draft", async () => {
    const db = createWorkflowDbMock();
    const repository = new MysqlWorkflowRepository(db as never);

    await repository.updateDefinitionMetadata({
      description: "引导新客完成首购",
      name: "新客首购旅程",
      opSubUserId: "19",
      uid: 8,
      workflowId: "42",
    });

    expect(db.updateBuilders[0].sets).toEqual({
      description: "引导新客完成首购",
      name: "新客首购旅程",
      op_sub_uid: "19",
    });
  });

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

  it("replaces trigger bindings in the revision publication transaction", async () => {
    const db = createPublicationDbMock();
    const repository = new MysqlWorkflowRepository(db as never);

    const result = await repository.enable({
      draft: createDraft(),
      executionSpec: {
        edges: [{ id: "edge-start-end", source: "start", sourceOutletId: "default", target: "end" }],
        entryNodeId: "start",
        nodes: [
          { config: startConfig(), id: "start", kind: "start", nodeSchemaVersion: 1 },
          { config: {}, id: "end", kind: "end", nodeSchemaVersion: 1 },
        ],
        revision: 1,
        schemaVersion: 1,
        terminalNodeId: "end",
        workflowId: "42",
      },
      expectedDraftVersion: 4,
      opSubUserId: "19",
      specHash: "a".repeat(64),
      triggerBindings: [
        { eventType: "contact.friend_added", filter: startConfig() },
        {
          eventType: "message.received",
          filter: { ...startConfig(), triggers: [{ match: "any", type: "message.received" }] },
        },
      ],
      uid: 8,
      workflowId: "42",
    });

    expect(result.kind).toBe("success");
    expect(db.transactionCount).toBe(1);
    expect(db.triggerBindingStatusUpdate).toMatchObject({ status: 0 });
    expect(db.triggerBindingInsert).toEqual([
      expect.objectContaining({ event_type: "contact.friend_added", revision: 1, status: 1 }),
      expect.objectContaining({ event_type: "message.received", revision: 1, status: 1 }),
    ]);
    expect(db.definitionUpdate).toMatchObject({ published_revision: 1, runtime_status: "active" });
  });
});

function createWorkflowDbMock(options: { numUpdatedRows?: bigint } = {}) {
  const row = {
    biz_status: 1,
    create_time: new Date("2026-07-10T00:00:00.000Z"),
    description: "",
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

function createPublicationDbMock() {
  const now = new Date("2026-07-10T00:00:00.000Z");
  const definition = {
    biz_status: 1,
    create_time: now,
    description: "",
    draft_json: JSON.stringify(createDraft()),
    draft_schema_version: 1,
    draft_version: 4,
    id: 42,
    name: "新客培育",
    op_sub_uid: 19,
    published_revision: null,
    runtime_status: "inactive",
    uid: 8,
    update_time: now,
    validated_draft_version: 4,
  };
  const db = {
    definitionUpdate: {} as Record<string, unknown>,
    transactionCount: 0,
    triggerBindingInsert: [] as Array<Record<string, unknown>>,
    triggerBindingStatusUpdate: {} as Record<string, unknown>,
    insertInto(table: string) {
      const builder = {
        values(values: Record<string, unknown> | Array<Record<string, unknown>>) {
          if (table === "xy_wap_embed_workflow_trigger_binding") {
            db.triggerBindingInsert = values as Array<Record<string, unknown>>;
          }
          return builder;
        },
        async executeTakeFirstOrThrow() {
          return { insertId: table === "xy_wap_embed_workflow_revision" ? "11" : "12" };
        },
      };
      return builder;
    },
    selectFrom() {
      const builder = {
        forUpdate() { return builder; },
        selectAll() { return builder; },
        where() { return builder; },
        async executeTakeFirst() { return definition; },
      };
      return builder;
    },
    transaction() {
      db.transactionCount += 1;
      return { execute: (operation: (transaction: typeof db) => unknown) => operation(db) };
    },
    updateTable(table: string) {
      const builder = {
        set(values: Record<string, unknown>) {
          if (table === "xy_wap_embed_workflow_definition") db.definitionUpdate = values;
          if (table === "xy_wap_embed_workflow_trigger_binding") db.triggerBindingStatusUpdate = values;
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

function startConfig() {
  return {
    accountIds: ["account-a"],
    entryPolicy: { mode: "never" as const },
    triggers: [{ type: "contact.friend_added" as const }],
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
      title: kind,
    },
    id: kind,
    position: { x: 0, y: 0 },
  };
}
