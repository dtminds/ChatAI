import { describe, expect, it } from "vitest";
import { MysqlWorkflowRepository } from "../../../src/modules/workflow/workflow-mysql.repository.js";

describe("MysqlWorkflowRepository", () => {
  it("lists definitions by creation time for cursor pagination", async () => {
    const db = createWorkflowDbMock({ definitionTotal: 38 });
    const repository = new MysqlWorkflowRepository(db as never);

    const page = await repository.listDefinitions(8, { limit: 20, status: "all" });

    expect(db.selectBuilders[0].selectAll).toBe(false);
    expect(db.selectBuilders[0].selects.find(select => Array.isArray(select[0]))?.[0]).toEqual([
      "create_time",
      "description",
      "draft_json",
      "draft_semantic_hash",
      "id",
      "name",
      "published_revision",
      "published_semantic_hash",
      "runtime_status",
      "update_time",
      "workflow_type",
    ]);
    expect(db.selectBuilders[0].orderBys).toEqual([
      ["create_time", "desc"],
      ["id", "desc"],
    ]);
    expect(page.total).toBe(38);
  });

  it("searches definition names only", async () => {
    const db = createWorkflowDbMock();
    const repository = new MysqlWorkflowRepository(db as never);

    await repository.listDefinitions(8, {
      limit: 20,
      query: "会员",
      status: "all",
    });

    expect(db.selectBuilders[0].wheres).toContainEqual(["name", "like", "%会员%"]);
    expect(db.selectBuilders[0].wheres.some(where => where[0] === "description")).toBe(false);
  });

  it("derives current review state from the latest review attempt", async () => {
    const db = createWorkflowDbMock();
    const repository = new MysqlWorkflowRepository(db as never);

    await repository.findCurrentReview(8, "42");

    expect(db.selectBuilders[1]).toMatchObject({
      orderBys: [["id", "desc"]],
      wheres: [
        ["uid", "=", 8],
        ["workflow_id", "=", "42"],
        ["draft_semantic_hash", "=", "draft-hash"],
        ["status", "in", ["pending", "approved", "rejected", "withdrawn"]],
        ["base_published_revision", "is", null],
      ],
    });
  });

  it("rejects an idempotent create request bound to another Workflow type", async () => {
    const db = createWorkflowDbMock();
    const repository = new MysqlWorkflowRepository(db as never);

    const result = await repository.createDefinition({
      clientRequestId: "request-1",
      description: "",
      draft: createDraft(),
      draftSemanticHash: "draft-hash",
      name: "企微客户旅程",
      opSubUserId: "19",
      uid: 8,
      workflowType: "wecom_sop",
    });

    expect(result).toEqual({ kind: "idempotency-conflict" });
  });

  it("stops definitions without synchronously draining runtime state on entitlement loss", async () => {
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
    expect(db.executedSelectTables).not.toContain("xy_wap_embed_workflow_run");
    expect(db.updates.every(update => ![
      "xy_wap_embed_workflow_run",
      "xy_wap_embed_workflow_task",
      "xy_wap_embed_workflow_node_execution",
      "xy_wap_embed_workflow_outbox",
    ].includes(update.table))).toBe(true);
  });

  it("enqueues bounded Task suspension when entitlement loss pauses workflows", async () => {
    const db = createEntitlementLossDbMock();
    const repository = new MysqlWorkflowRepository(db as never);
    const transitionedAt = new Date("2026-07-10T00:00:00.000Z");

    await expect(repository.applyEntitlementLoss({
      opSubUserId: "19",
      transitionedAt,
      transition: "pause",
      uid: 8,
      workflowType: "chatai_sop",
    })).resolves.toEqual({ affectedDefinitions: 1 });

    expect(db.taskTransitionInserts).toEqual([expect.objectContaining({
      next_attempt_at: transitionedAt,
      status: "pending",
      target_status: "suspended",
      transition_version: 1,
      uid: 8,
      workflow_id: "42",
    })]);
    expect(db.updates.some(update => update.table === "xy_wap_embed_workflow_task")).toBe(false);
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
      draftSemanticHash: "next-draft-hash",
      expectedDraftVersion: 4,
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
      ["draft_version", "=", 4],
    ]));
    expect(db.selectBuilders[0]).toMatchObject({ forUpdate: true });
    expect(db.selectBuilders.at(-1)).toMatchObject({ forUpdate: false });
  });

  it("does not rewrite an approved review when the draft changes", async () => {
    const db = createWorkflowDbMock({ reviewStatus: "approved" });
    const repository = new MysqlWorkflowRepository(db as never);

    const result = await repository.saveDraft({
      draft: createDraft(),
      draftSemanticHash: "next-draft-hash",
      expectedDraftVersion: 4,
      opSubUserId: "19",
      uid: 8,
      workflowId: "42",
    });

    expect(result.kind).toBe("success");
    expect(db.updateBuilders).toHaveLength(1);
    expect(db.updateBuilders[0].table).toBe("xy_wap_embed_workflow_definition");
  });

  it("allows layout-only draft writes without requiring a non-stopped runtime status", async () => {
    const db = createWorkflowDbMock();
    const repository = new MysqlWorkflowRepository(db as never);

    const result = await repository.saveDraft({
      draft: createDraft(),
      draftSemanticHash: "next-layout-hash",
      expectedDraftVersion: 4,
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
    expect(db.updateBuilders[0].sets).toMatchObject({
      draft_semantic_hash: "next-layout-hash",
      draft_version: 5,
    });
  });

  it("uses an update for logical deletion and never exposes a physical delete path", async () => {
    const db = createWorkflowDbMock();
    const repository = new MysqlWorkflowRepository(db as never);

    const result = await repository.markDeleted({ opSubUserId: "19", uid: 8, workflowId: "42" });

    expect(result.kind).toBe("success");
    expect(db.deleteFromCalls).toBe(0);
    expect(db.transitionDeletes).toBe(1);
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
    expect(db.taskTransitionInserts).toEqual([expect.objectContaining({
      next_attempt_at: transitionedAt,
      target_status: "suspended",
      workflow_id: "42",
    })]);
    expect(db.updateBuilders.some(update => update.table === "xy_wap_embed_workflow_task")).toBe(false);
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
    expect(db.taskTransitionInserts).toEqual([expect.objectContaining({
      target_status: "pending",
      workflow_id: "42",
    })]);
    expect(db.updateBuilders.some(update => update.table === "xy_wap_embed_workflow_task")).toBe(false);
    expect(db.selectBuilders[0]).toMatchObject({
      forUpdate: true,
      wheres: [["uid", "=", 8], ["id", "=", "42"], ["biz_status", "=", 1]],
    });
    expect(db.selectBuilders[1]).toMatchObject({
      forUpdate: false,
      wheres: [["uid", "=", 8], ["biz_status", "=", 1], ["runtime_status", "=", "active"]],
    });
  });

  it("rejects resume when fifty other tenant Workflows are active", async () => {
    const db = createWorkflowDbMock({ activeDefinitionCount: 50, runtimeStatus: "paused" });
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

    expect(result).toEqual({ kind: "active-limit-exceeded" });
    expect(db.updateBuilders).toHaveLength(0);
  });

  it("inserts all revision trigger bindings without a Workflow-level upsert", async () => {
    const db = createPublicationDbMock();
    const repository = new MysqlWorkflowRepository(db as never);
    const input = {
      ...enableInput(),
      triggerBindings: [
        ...enableInput().triggerBindings,
        {
          eventType: "contact.tag_added" as const,
          filter: {
            entryPolicy: { mode: "never" as const },
            tagIds: [301],
            workUserIds: [201],
          },
          subjectType: "chatai_contact" as const,
        },
      ],
    };
    db.reviewRows = [createReviewRow(input)];

    const result = await repository.publishRevision({
      candidateHash: input.specHash,
      opSubUserId: "19",
      reviewId: "7",
      uid: 8,
      workflowId: "42",
    });

    expect(result.kind).toBe("success");
    expect(db.transactionCount).toBe(1);
    expect(db.triggerBindingInserts).toHaveLength(2);
    expect(db.triggerBindingInserts[0]).toMatchObject({
      event_type: "contact.friend_added",
      revision: 1,
      status: 1,
      uid: 8,
      workflow_id: "42",
    });
    expect(JSON.parse(String(db.triggerBindingInserts[0]?.filter_spec_json))).toEqual({
      entryPolicy: { mode: "never" },
      eventType: "contact.friend_added",
      sourceIds: ["qr-code-1"],
      workUserIds: [201],
    });
    expect(db.triggerBindingInserts[1]).toMatchObject({
      event_type: "contact.tag_added",
      revision: 1,
      status: 1,
      uid: 8,
      workflow_id: "42",
    });
    expect(db.selectBuilders[0]).toMatchObject({
      forUpdate: true,
      wheres: [["uid", "=", 8], ["id", "=", "42"], ["biz_status", "=", 1]],
    });
    expect(db.definitionUpdate).toMatchObject({ published_revision: 1 });
  });

  it("rejects publication when the approved review no longer matches the current draft semantics", async () => {
    const db = createPublicationDbMock({ draftSemanticHash: "changed-draft-hash" });
    const repository = new MysqlWorkflowRepository(db as never);
    const input = enableInput();
    db.reviewRows = [createReviewRow(input)];

    const result = await repository.publishRevision({
      candidateHash: input.specHash,
      opSubUserId: input.opSubUserId,
      reviewId: "7",
      uid: input.uid,
      workflowId: input.workflowId,
    });

    expect(result).toEqual({ kind: "conflict" });
    expect(db.triggerBindingInserts).toEqual([]);
    expect(db.definitionUpdate).toEqual({});
  });

  it("writes cleanup requests for wait nodes removed by a published revision", async () => {
    const previousSpec = executionSpecWithWait();
    const db = createPublicationDbMock({
      previousExecutionSpec: previousSpec,
      publishedRevision: 1,
    });
    const repository = new MysqlWorkflowRepository(db as never);
    const input = enableInput();
    db.reviewRows = [createReviewRow({
      ...input,
      executionSpec: { ...input.executionSpec, revision: 2 },
    }, 1)];

    const result = await repository.publishRevision({
      candidateHash: input.specHash,
      opSubUserId: input.opSubUserId,
      reviewId: "7",
      uid: input.uid,
      workflowId: input.workflowId,
    });

    expect(result.kind).toBe("success");
    expect(db.revisionCleanupInserts).toEqual([
      expect.objectContaining({
        node_id: "wait-1",
        node_kind: "wait",
        revision: 2,
        status: "pending",
        uid: 8,
        workflow_id: "42",
      }),
    ]);
    expect(db.definitionUpdate).toMatchObject({ published_revision: 2 });
  });

  it("rejects first enable when fifty tenant Workflows are already active", async () => {
    const db = createPublicationDbMock({
      activeDefinitionCount: 50,
      publishedRevision: 1,
      runtimeStatus: "inactive",
    });
    const repository = new MysqlWorkflowRepository(db as never);

    const result = await repository.enable({
      opSubUserId: "19",
      uid: 8,
      workflowId: "42",
    });

    expect(result).toEqual({ kind: "active-limit-exceeded" });
    expect(db.triggerBindingInserts).toEqual([]);
    expect(db.definitionUpdate).toEqual({});
  });
});

function createWorkflowDbMock(options: {
  activeDefinitionCount?: number;
  definitionTotal?: number;
  numUpdatedRows?: bigint;
  reviewStatus?: "approved" | "pending";
  runtimeStatus?: "active" | "inactive" | "paused" | "stopped";
} = {}) {
  const row = {
    biz_status: 1,
    create_time: new Date("2026-07-10T00:00:00.000Z"),
    description: "",
    draft_json: JSON.stringify(createDraft()),
    draft_schema_version: 1,
    draft_semantic_hash: "draft-hash",
    draft_version: 4,
    id: 42,
    name: "新客培育",
    op_sub_uid: 19,
    published_revision: null,
    published_semantic_hash: null,
    runtime_status: options.runtimeStatus ?? "inactive",
    status_reason: null,
    uid: 8,
    update_time: new Date("2026-07-10T00:00:01.000Z"),
    workflow_type: 1,
  };
  const db = {
    deleteFromCalls: 0,
    transitionDeletes: 0,
    taskTransitionInserts: [] as Array<Record<string, unknown>>,
    selectBuilders: [] as Array<{
      forUpdate: boolean;
      orderBys: unknown[][];
      selectAll: boolean;
      selects: unknown[][];
      table: string;
      wheres: unknown[][];
    }>,
    updateBuilders: [] as Array<{ sets: Record<string, unknown>; table: string; wheres: unknown[][] }>,
    deleteFrom(table: string) {
      if (table === "xy_wap_embed_workflow_task_transition") {
        db.transitionDeletes += 1;
        const builder = {
          where() { return builder; },
          async executeTakeFirst() { return { numDeletedRows: 1n }; },
        };
        return builder;
      }
      db.deleteFromCalls += 1;
      throw new Error("physical delete is forbidden");
    },
    insertInto(table: string) {
      const builder = {
        values(values: Record<string, unknown> | Array<Record<string, unknown>>) {
          if (table === "xy_wap_embed_workflow_task_transition") {
            db.taskTransitionInserts = Array.isArray(values) ? values : [values];
          }
          return builder;
        },
        onDuplicateKeyUpdate() { return builder; },
        async executeTakeFirstOrThrow() { return { numInsertedOrUpdatedRows: 1n }; },
      };
      return builder;
    },
    selectFrom(table: string) {
      const state = {
        forUpdate: false,
        orderBys: [] as unknown[][],
        selectAll: false,
        selects: [] as unknown[][],
        table,
        wheres: [] as unknown[][],
      };
      db.selectBuilders.push(state);
      const builder = {
        select(...args: unknown[]) { state.selects.push(args); return builder; },
        selectAll() { state.selectAll = true; return builder; },
        limit() { return builder; },
        where(...args: unknown[]) { state.wheres.push(args); return builder; },
        orderBy(...args: unknown[]) { state.orderBys.push(args); return builder; },
        forUpdate() { state.forUpdate = true; return builder; },
        async execute() {
          if (table === "xy_wap_embed_workflow_publish_review") return [];
          return state.wheres.some(where => where[0] === "runtime_status" && where[2] === "active")
            ? createActiveDefinitionRows(options.activeDefinitionCount ?? 0)
            : [row];
        },
        async executeTakeFirst() {
          if (table === "xy_wap_embed_workflow_publish_review") {
            const requestedStatus = state.wheres.find(where => where[0] === "status")?.[2];
            return options.reviewStatus === requestedStatus ? { id: 7, status: options.reviewStatus } : undefined;
          }
          if (state.selects.some(select => typeof select[0] === "function")) {
            return { total: options.definitionTotal ?? 1 };
          }
          return state.wheres.some(where => where[0] === "runtime_status" && where[2] === "active")
            ? { active_count: options.activeDefinitionCount ?? 0 }
            : row;
        },
        async executeTakeFirstOrThrow() {
          if (table === "xy_wap_embed_workflow_publish_review") {
            throw new Error("review row not configured");
          }
          return state.wheres.some(where => where[0] === "runtime_status" && where[2] === "active")
            ? { active_count: options.activeDefinitionCount ?? 0 }
            : row;
        },
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
  let runExecuteCount = 0;
  const db = {
    executedSelectTables: [] as string[],
    taskTransitionInserts: [] as Array<Record<string, unknown>>,
    updates,
    deleteFrom() {
      const builder = {
        where() { return builder; },
        async executeTakeFirst() { return { numDeletedRows: 1n }; },
      };
      return builder;
    },
    insertInto(table: string) {
      const builder = {
        values(values: Record<string, unknown> | Array<Record<string, unknown>>) {
          if (table === "xy_wap_embed_workflow_task_transition") {
            db.taskTransitionInserts = Array.isArray(values) ? values : [values];
          }
          return builder;
        },
        onDuplicateKeyUpdate() { return builder; },
        async executeTakeFirstOrThrow() { return { numInsertedOrUpdatedRows: 1n }; },
      };
      return builder;
    },
    selectFrom(table: string) {
      const builder = {
        distinct() { return builder; },
        forUpdate() { return builder; },
        limit() { return builder; },
        orderBy() { return builder; },
        select() { return builder; },
        skipLocked() { return builder; },
        where() { return builder; },
        async execute() {
          db.executedSelectTables.push(table);
          if (table === "xy_wap_embed_workflow_definition") return [{ id: "42" }];
          if (table === "xy_wap_embed_workflow_run") {
            runExecuteCount += 1;
            return runExecuteCount === 1 ? [{ id: "101", workflow_id: "42" }] : [];
          }
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
        async executeTakeFirst() {
          return { numUpdatedRows: 1n };
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

function createPublicationDbMock(options: {
  activeDefinitionCount?: number;
  draftSemanticHash?: string;
  draftVersion?: number;
  previousExecutionSpec?: ReturnType<typeof executionSpecWithWait>;
  publishedRevision?: number | null;
  runtimeStatus?: "active" | "inactive" | "paused" | "stopped";
} = {}) {
  const now = new Date("2026-07-10T00:00:00.000Z");
  const definition = {
    biz_status: 1,
    create_time: now,
    description: "",
    draft_json: JSON.stringify(createDraft()),
    draft_schema_version: 1,
    draft_semantic_hash: options.draftSemanticHash ?? "draft-hash",
    draft_version: options.draftVersion ?? 4,
    id: 42,
    name: "新客培育",
    op_sub_uid: 19,
    published_revision: options.publishedRevision ?? null,
    published_semantic_hash: options.publishedRevision ? "published-hash" : null,
    runtime_status: options.runtimeStatus ?? (options.publishedRevision ? "active" : "inactive"),
    status_reason: null,
    uid: 8,
    update_time: now,
    workflow_type: 1,
  };
  const db = {
    definitionUpdate: {} as Record<string, unknown>,
    selectBuilders: [] as Array<{
      forUpdate: boolean;
      orderBys: unknown[][];
      table: string;
      wheres: unknown[][];
    }>,
    transactionCount: 0,
    revisionCleanupInserts: [] as Array<Record<string, unknown>>,
    triggerBindingInserts: [] as Array<Record<string, unknown>>,
    reviewRows: [] as Array<Record<string, unknown>>,
    insertInto(table: string) {
      const builder = {
        values(values: Record<string, unknown> | Array<Record<string, unknown>>) {
          if (table === "xy_wap_embed_workflow_trigger_binding") {
            db.triggerBindingInserts = Array.isArray(values) ? values : [values];
          }
          if (table === "xy_wap_embed_workflow_revision_cleanup") {
            db.revisionCleanupInserts = Array.isArray(values) ? values : [values];
          }
          return builder;
        },
        async executeTakeFirstOrThrow() {
          if (table === "xy_wap_embed_workflow_revision") return { insertId: "11" };
          if (table === "xy_wap_embed_workflow_trigger_binding") return { insertId: "binding-1" };
          return { insertId: "12" };
        },
      };
      return builder;
    },
    selectFrom(table: string) {
      const state = {
        forUpdate: false,
        orderBys: [] as unknown[][],
        table,
        wheres: [] as unknown[][],
      };
      db.selectBuilders.push(state);
      const builder = {
        forUpdate() { state.forUpdate = true; return builder; },
        orderBy(...args: unknown[]) { state.orderBys.push(args); return builder; },
        select() { return builder; },
        selectAll() { return builder; },
        where(...args: unknown[]) { state.wheres.push(args); return builder; },
        async execute() {
          if (table === "xy_wap_embed_workflow_publish_review") return db.reviewRows;
          return createActiveDefinitionRows(options.activeDefinitionCount ?? 0);
        },
        async executeTakeFirst() {
          if (table === "xy_wap_embed_workflow_publish_review") return db.reviewRows[0];
          if (table === "xy_wap_embed_workflow_revision") {
            return options.previousExecutionSpec
              ? { execution_spec_json: JSON.stringify(options.previousExecutionSpec) }
              : undefined;
          }
          return state.wheres.some(where => where[0] === "runtime_status" && where[2] === "active")
            ? { active_count: options.activeDefinitionCount ?? 0 }
            : definition;
        },
        async executeTakeFirstOrThrow() {
          if (table === "xy_wap_embed_workflow_publish_review") {
            return db.reviewRows[0] ?? {
              ...createReviewRow(enableInput()),
              status: "approved",
            };
          }
          return state.wheres.some(where => where[0] === "runtime_status" && where[2] === "active")
            ? { active_count: options.activeDefinitionCount ?? 0 }
            : definition;
        },
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
    triggers: [{ sourceIds: ["qr-code-1"], type: "contact.friend_added" as const }],
  };
}

function enableInput() {
  return {
    draft: createDraft(),
    executionSpec: {
      edges: [{ id: "edge-start-end", source: "start", sourceOutletId: "default", target: "end" }],
      entryNodeId: "start",
      nodes: [
        {
          config: startConfig(),
          id: "start",
          kind: "start" as const,
          nodeSchemaVersion: 1,
        },
        {
          config: {},
          id: "end",
          kind: "end" as const,
          nodeSchemaVersion: 1,
        },
      ],
      revision: 1,
      schemaVersion: 3 as const,
      terminalNodeId: "end",
      workflowId: "42",
    },
    expectedDraftVersion: 4,
    opSubUserId: "19",
    specHash: "a".repeat(64),
    subjectType: "chatai_contact" as const,
    triggerBindings: [{
      eventType: "contact.friend_added" as const,
      filter: {
        entryPolicy: { mode: "never" as const },
        eventType: "contact.friend_added" as const,
        sourceIds: ["qr-code-1"],
        workUserIds: [201],
      },
      subjectType: "chatai_contact" as const,
    }],
    uid: 8,
    workflowId: "42",
    workflowType: "chatai_sop" as const,
  };
}

function createReviewRow(
  input: ReturnType<typeof enableInput>,
  basePublishedRevision: number | null = null,
) {
  const now = new Date("2026-07-10T00:00:00.000Z");
  return {
    base_published_revision: basePublishedRevision,
    candidate_hash: input.specHash,
    change_summary_json: JSON.stringify({
      addedNodes: [],
      changedNodes: [],
      firstPublication: basePublishedRevision === null,
      pathChanged: true,
      removedNodes: [],
      triggerChanged: true,
    }),
    checked_at: now,
    create_time: now,
    draft_json: JSON.stringify(input.draft),
    draft_semantic_hash: "draft-hash",
    execution_spec_json: JSON.stringify(input.executionSpec),
    id: 7,
    publish_sub_uid: null,
    publish_time: null,
    resulting_revision: null,
    review_comment: null,
    review_sub_uid: 20,
    review_time: now,
    source_draft_version: input.expectedDraftVersion,
    status: "approved",
    subject_type: 1,
    submit_sub_uid: 19,
    submit_time: now,
    trigger_bindings_json: JSON.stringify(input.triggerBindings),
    uid: input.uid,
    update_time: now,
    workflow_id: Number(input.workflowId),
    workflow_type: 1,
  };
}

function executionSpecWithWait() {
  const input = enableInput();
  return {
    ...input.executionSpec,
    edges: [
      { id: "edge-start-wait", source: "start", sourceOutletId: "default", target: "wait-1" },
      { id: "edge-wait-end", source: "wait-1", sourceOutletId: "default", target: "end" },
    ],
    nodes: [
      input.executionSpec.nodes[0]!,
      {
        config: { duration: 1, unit: "day" },
        id: "wait-1",
        kind: "wait" as const,
        nodeSchemaVersion: 1,
      },
      input.executionSpec.nodes[1]!,
    ],
  };
}

function createActiveDefinitionRows(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    biz_status: 1,
    id: 100 + index,
    runtime_status: "active",
  }));
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
