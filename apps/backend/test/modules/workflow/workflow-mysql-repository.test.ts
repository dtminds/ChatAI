import { describe, expect, it } from "vitest";
import { MysqlWorkflowRepository } from "../../../src/modules/workflow/workflow-mysql.repository.js";

describe("MysqlWorkflowRepository", () => {
  it("lists definitions by creation time without moving edited workflows", async () => {
    const db = createWorkflowDbMock();
    const repository = new MysqlWorkflowRepository(db as never);

    await repository.listDefinitions(8);

    expect(db.selectBuilders[0].orderBys).toEqual([
      ["create_time", "desc"],
      ["id", "desc"],
    ]);
  });

  it("rejects an idempotent create request bound to another Workflow type", async () => {
    const db = createWorkflowDbMock();
    const repository = new MysqlWorkflowRepository(db as never);

    const result = await repository.createDefinition({
      clientRequestId: "request-1",
      description: "",
      draft: createDraft(),
      name: "企微客户旅程",
      opSubUserId: "19",
      uid: 8,
      workflowType: "wecom_sop",
    });

    expect(result).toEqual({ kind: "idempotency-conflict" });
  });

  it("cancels active runtime state when entitlement loss stops workflows", async () => {
    const db = createEntitlementLossDbMock();
    const repository = new MysqlWorkflowRepository(db as never);

    await expect(repository.applyEntitlementLoss({
      opSubUserId: "19",
      transitionedAt: new Date("2026-07-10T00:00:00.000Z"),
      transition: "stop",
      uid: 8,
      workflowType: "chatai_sop",
    })).resolves.toEqual({ affectedDefinitions: 1 });

    const updates = Object.fromEntries(db.updates.map(update => [update.table, update.sets]));
    expect(updates.xy_wap_embed_workflow_definition).toMatchObject({
      runtime_status: "stopped",
      status_reason: "entitlement_revoked",
    });
    expect(updates.xy_wap_embed_workflow_run).toMatchObject({
      status: "cancelled",
      terminal_reason: "entitlement_revoked",
    });
    expect(updates.xy_wap_embed_workflow_task).toMatchObject({ status: "cancelled" });
    expect(updates.xy_wap_embed_workflow_node_execution).toMatchObject({
      error_code: "WORKFLOW_ENTITLEMENT_REVOKED",
      status: "failed",
    });
    expect(updates.xy_wap_embed_workflow_outbox).toMatchObject({ status: "dead" });
  });

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

  it("allows layout-only draft writes without requiring a non-stopped runtime status", async () => {
    const db = createWorkflowDbMock();
    const repository = new MysqlWorkflowRepository(db as never);

    const result = await repository.saveDraft({
      draft: createDraft(),
      expectedDraftVersion: 3,
      layoutOnly: true,
      opSubUserId: "19",
      uid: 8,
      workflowId: "42",
    });

    expect(result.kind).toBe("success");
    expect(db.updateBuilders[0].wheres).not.toContainEqual([
      "runtime_status",
      "!=",
      "stopped",
    ]);
    expect(db.updateBuilders[0].sets.validated_draft_version).not.toBeNull();
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
      statusReason: null,
      transitionedAt: new Date("2026-07-10T00:00:00.000Z"),
      uid: 8,
      workflowId: "42",
    });

    expect(result).toEqual({ kind: "invalid-status", status: "inactive" });
  });

  it("freezes active Inference Jobs in the Workflow pause transaction", async () => {
    const transitionedAt = new Date("2026-07-10T00:05:00.000Z");
    const db = createWorkflowDbMock({ runtimeStatus: "active" });
    const repository = new MysqlWorkflowRepository(db as never);

    const result = await repository.setRuntimeStatus({
      allowedCurrentStatuses: ["active"],
      opSubUserId: "19",
      status: "paused",
      statusReason: null,
      transitionedAt,
      uid: 8,
      workflowId: "42",
    });

    expect(result).toMatchObject({ kind: "success", value: { runtimeStatus: "paused" } });
    expect(db.updateBuilders.find(update =>
      update.table === "xy_wap_embed_workflow_inference_job")?.sets,
    ).toMatchObject({ paused_at: transitionedAt });
  });

  it("unfreezes Inference Jobs in the Workflow resume transaction", async () => {
    const db = createWorkflowDbMock({ runtimeStatus: "paused" });
    const repository = new MysqlWorkflowRepository(db as never);

    const result = await repository.setRuntimeStatus({
      allowedCurrentStatuses: ["paused"],
      opSubUserId: "19",
      status: "active",
      statusReason: null,
      transitionedAt: new Date("2026-07-10T00:30:00.000Z"),
      uid: 8,
      workflowId: "42",
    });

    expect(result).toMatchObject({ kind: "success", value: { runtimeStatus: "active" } });
    const inferenceUpdate = db.updateBuilders.find(update =>
      update.table === "xy_wap_embed_workflow_inference_job");
    expect(inferenceUpdate?.sets).toMatchObject({ paused_at: null });
    expect(inferenceUpdate?.sets.deadline_at).toBeDefined();
    expect(inferenceUpdate?.sets.next_attempt_at).toBeDefined();
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
          {
            config: startConfig(),
            id: "start",
            kind: "start",
            nodeSchemaVersion: 1,
            requiredCapabilities: [{
              capabilityKey: "event.contact.friend_added",
              contractVersion: 1,
            }],
          },
          {
            config: {},
            id: "end",
            kind: "end",
            nodeSchemaVersion: 1,
            requiredCapabilities: [],
          },
        ],
        requiredCapabilities: [{
          capabilityKey: "event.contact.friend_added",
          contractVersion: 1,
        }],
        revision: 1,
        schemaVersion: 2,
        terminalNodeId: "end",
        workflowId: "42",
      },
      expectedDraftVersion: 4,
      opSubUserId: "19",
      specHash: "a".repeat(64),
      triggerBindings: [
        {
          eventType: "contact.friend_added",
          filter: {
            entryPolicy: { mode: "never" },
            eventType: "contact.friend_added",
            workUserIds: [201],
          },
          subjectType: "chatai_contact",
        },
        {
          eventType: "message.received",
          filter: {
            entryPolicy: { mode: "never" },
            eventType: "message.received",
            match: "any",
            seatIds: [101],
          },
          subjectType: "chatai_contact",
        },
      ],
      subjectType: "chatai_contact",
      uid: 8,
      workflowId: "42",
      workflowType: "chatai_sop",
    });

    expect(result.kind).toBe("success");
    expect(db.transactionCount).toBe(1);
    expect(db.triggerBindingStatusUpdate).toMatchObject({ status: 0 });
    expect(db.triggerBindingInsert).toEqual([
      expect.objectContaining({ event_type: "contact.friend_added", revision: 1, status: 1 }),
      expect.objectContaining({ event_type: "message.received", revision: 1, status: 1 }),
    ]);
    expect(db.triggerBindingMatchInsert).toEqual([
      expect.objectContaining({ binding_id: "binding-1", match_kind: 1, match_value: 201 }),
      expect.objectContaining({ binding_id: "binding-2", match_kind: 2, match_value: 101 }),
    ]);
    expect(db.definitionUpdate).toMatchObject({ published_revision: 1, runtime_status: "active" });
  });
});

function createWorkflowDbMock(options: {
  numUpdatedRows?: bigint;
  runtimeStatus?: "active" | "inactive" | "paused" | "stopped";
} = {}) {
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
    runtime_status: options.runtimeStatus ?? "inactive",
    status_reason: null,
    uid: 8,
    update_time: new Date("2026-07-10T00:00:01.000Z"),
    validated_draft_version: null,
    workflow_type: 1,
  };
  const db = {
    deleteFromCalls: 0,
    selectBuilders: [] as Array<{ orderBys: unknown[][]; table: string; wheres: unknown[][] }>,
    updateBuilders: [] as Array<{ sets: Record<string, unknown>; table: string; wheres: unknown[][] }>,
    deleteFrom() {
      db.deleteFromCalls += 1;
      throw new Error("physical delete is forbidden");
    },
    selectFrom(table: string) {
      const state = { orderBys: [] as unknown[][], table, wheres: [] as unknown[][] };
      db.selectBuilders.push(state);
      const builder = {
        select() { return builder; },
        selectAll() { return builder; },
        where(...args: unknown[]) { state.wheres.push(args); return builder; },
        orderBy(...args: unknown[]) { state.orderBys.push(args); return builder; },
        limit() { return builder; },
        forUpdate() { return builder; },
        async execute() { return [row]; },
        async executeTakeFirst() { return row; },
        async executeTakeFirstOrThrow() { return row; },
      };
      return builder;
    },
    updateTable(table: string) {
      const state = { sets: {} as Record<string, unknown>, table, wheres: [] as unknown[][] };
      db.updateBuilders.push(state);
      const builder = {
        set(values: Record<string, unknown>) {
          state.sets = values;
          if (table === "xy_wap_embed_workflow_definition") Object.assign(row, values);
          return builder;
        },
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

function createEntitlementLossDbMock() {
  const updates: Array<{
    sets: Record<string, unknown>;
    table: string;
    wheres: unknown[][];
  }> = [];
  const db = {
    updates,
    selectFrom(table: string) {
      const builder = {
        forUpdate() { return builder; },
        select() { return builder; },
        where() { return builder; },
        async execute() {
          if (table === "xy_wap_embed_workflow_definition") return [{ id: "42" }];
          if (table === "xy_wap_embed_workflow_run") return [{ id: "101" }];
          return [];
        },
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
    updateTable(table: string) {
      const state = {
        sets: {} as Record<string, unknown>,
        table,
        wheres: [] as unknown[][],
      };
      updates.push(state);
      const builder = {
        set(values: Record<string, unknown>) {
          state.sets = values;
          return builder;
        },
        where(...args: unknown[]) {
          state.wheres.push(args);
          return builder;
        },
        async executeTakeFirstOrThrow() {
          return { numUpdatedRows: 1n };
        },
      };
      return builder;
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
    status_reason: null,
    uid: 8,
    update_time: now,
    validated_draft_version: 4,
    workflow_type: 1,
  };
  const db = {
    definitionUpdate: {} as Record<string, unknown>,
    transactionCount: 0,
    triggerBindingInsert: [] as Array<Record<string, unknown>>,
    triggerBindingMatchInsert: [] as Array<Record<string, unknown>>,
    triggerBindingStatusUpdate: {} as Record<string, unknown>,
    insertInto(table: string) {
      const builder = {
        values(values: Record<string, unknown> | Array<Record<string, unknown>>) {
          if (table === "xy_wap_embed_workflow_trigger_binding") {
            db.triggerBindingInsert.push(values as Record<string, unknown>);
          }
          if (table === "xy_wap_embed_workflow_trigger_binding_match") {
            db.triggerBindingMatchInsert.push(...values as Array<Record<string, unknown>>);
          }
          return builder;
        },
        async executeTakeFirstOrThrow() {
          if (table === "xy_wap_embed_workflow_revision") return { insertId: "11" };
          if (table === "xy_wap_embed_workflow_trigger_binding") {
            return { insertId: `binding-${db.triggerBindingInsert.length}` };
          }
          return { insertId: "12" };
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
    entryPolicy: { mode: "never" as const },
    seatIds: [101],
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
