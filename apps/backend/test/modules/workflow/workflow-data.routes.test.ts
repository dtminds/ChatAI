import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerErrorHandler } from "../../../src/plugins/error-handler.js";
import { registerWorkflowRoutes } from "../../../src/modules/workflow/workflow.routes.js";
import { MysqlWorkflowDataReader } from "../../../src/modules/workflow/workflow-data-mysql.repository.js";
import { WorkflowDataService } from "../../../src/modules/workflow/workflow-data.service.js";
import { CURRENT_WORKBENCH_PLATFORM } from "../../../src/modules/workbench-platform-scope.js";

describe("workflow data routes", () => {
  const apps: Array<ReturnType<typeof Fastify>> = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map(app => app.close()));
  });

  it("serves node metrics, cursor-paged entry records, and one record trajectory", async () => {
    const dataService = {
      getOverview: vi.fn(async () => ({ calculatedAt: "2026-07-12T10:00:00.000Z", nodes: [], revision: 3 })),
      getRecord: vi.fn(async () => ({
        createdAt: "2026-07-12T09:00:00.000Z",
        customer: { avatar: null, name: "张三" },
        recordId: "31",
        revision: 3,
        status: "waiting",
        steps: [],
      })),
      listRecords: vi.fn(async () => ({ items: [], nextCursor: "29" })),
    };
    const app = await createApp(dataService);

    expect((await app.inject({ method: "GET", url: "/api/server/workflows/12/data?revision=3" })).json().data)
      .toMatchObject({ revision: 3 });
    expect((await app.inject({ method: "GET", url: "/api/server/workflows/12/records?revision=3&nodeId=wait-1&cursor=40&limit=20" })).json().data)
      .toMatchObject({ nextCursor: "29" });
    expect((await app.inject({ method: "GET", url: "/api/server/workflows/12/records/31" })).json().data)
      .toMatchObject({ customer: { name: "张三" }, recordId: "31" });

    expect(dataService.listRecords).toHaveBeenCalledWith(expect.objectContaining({ uid: 9 }), expect.objectContaining({
      cursor: "40",
      limit: 20,
      nodeId: "wait-1",
      revision: 3,
      workflowId: "12",
    }));
  });

  it("shows a waiting node once as the current trajectory step", async () => {
    const reader = new MysqlWorkflowDataReader(createRecordDbMock() as never);

    const detail = await reader.getRecord({ recordId: "31", uid: 9, workflowId: "12" });

    expect(detail.steps).toEqual([expect.objectContaining({
      nodeId: "wait-1",
      status: "current",
      title: "等待一天",
    })]);
  });

  it("lists active runs and only terminal runs inside the 180-day record window", async () => {
    const listDb = createRecordListDbMock();
    const detailDb = createRecordDbMock({ runStatus: "completed" });
    const listReader = new MysqlWorkflowDataReader(listDb as never);
    const detailReader = new MysqlWorkflowDataReader(detailDb as never);

    await listReader.listRecords({ limit: 20, revision: 3, uid: 9, workflowId: "12" });
    await detailReader.getRecord({ recordId: "31", uid: 9, workflowId: "12" });

    expect(listDb.retentionConditions).toEqual([
      ["status", "in", ["queued", "running", "waiting"]],
      ["completed_at", ">=", expect.anything()],
    ]);
    expect(detailDb.retentionConditions).toEqual([
      ["status", "in", ["queued", "running", "waiting"]],
      ["completed_at", ">=", expect.anything()],
    ]);
  });

  it.each(["running", "retrying"])(
    "does not present a non-terminal %s action ledger as a completed trajectory step",
    async (executionStatus) => {
      const db = createRecordDbMock({
        executionKind: "message",
        executionStatus,
        runCurrentNodeId: "message-1",
        runStatus: "running",
      });
      const reader = new MysqlWorkflowDataReader(db as never);

      const detail = await reader.getRecord({ recordId: "31", uid: 9, workflowId: "12" });

      expect(detail.steps).toEqual([expect.objectContaining({
        nodeId: "message-1",
        status: "current",
      })]);
      expect(db.wheres).toContainEqual([
          "xy_wap_embed_workflow_node_execution",
          "status",
          "in",
          ["completed", "failed"],
        ]);
    },
  );

  it("falls back to default node titles when a revision snapshot cannot be parsed", async () => {
    const reader = new MysqlWorkflowDataReader(createRecordDbMock({ draftJson: "{not-json" }) as never);

    const detail = await reader.getRecord({ recordId: "31", uid: 9, workflowId: "12" });

    expect(detail.steps).toEqual([expect.objectContaining({
      nodeId: "wait-1",
      status: "current",
      title: "等待",
    })]);
  });

  it.each([
    ["agent", "转 Agent"],
    ["ai-collect", "资料收集"],
    ["ai-intent", "意图识别"],
    ["customer-update", "修改客户资料"],
    ["llm", "大模型"],
    ["order-query", "订单查询"],
    ["tag-query", "标签查询"],
  ])("falls back to the product title for %s records", async (nodeKind, title) => {
    const reader = new MysqlWorkflowDataReader(createRecordDbMock({
      draftJson: "{not-json",
      executionKind: nodeKind,
      runCurrentNodeId: `${nodeKind}-1`,
    }) as never);

    const detail = await reader.getRecord({ recordId: "31", uid: 9, workflowId: "12" });

    expect(detail.steps).toEqual([expect.objectContaining({
      nodeKind,
      title,
    })]);
  });

  it("preserves titles and returns an unknown kind for unrecognized revision and ledger nodes", async () => {
    const reader = new MysqlWorkflowDataReader(createRecordDbMock({
      draftJson: JSON.stringify({
        nodes: [{ data: { kind: "future-action", title: "未来动作" }, id: "wait-1" }],
      }),
      executionKind: "future-action",
    }) as never);

    const detail = await reader.getRecord({ recordId: "31", uid: 9, workflowId: "12" });

    expect(detail.steps).toEqual([expect.objectContaining({
      nodeId: "wait-1",
      nodeKind: "unknown",
      status: "current",
      title: "未来动作",
    })]);
  });

  it("hydrates workflow customers within the current workbench platform", async () => {
    const db = createRecordDbMock();
    const reader = new MysqlWorkflowDataReader(db as never);

    await reader.getRecord({ recordId: "31", uid: 9, workflowId: "12" });

    expect(db.wheres).toContainEqual([
      "xy_wap_embed_contact",
      "platform",
      "=",
      CURRENT_WORKBENCH_PLATFORM,
    ]);
  });

  it("rejects data access for users without workflow administration permission", async () => {
    const reader = {
      getOverview: vi.fn(),
      getRecord: vi.fn(),
      listRecords: vi.fn(),
    };
    const app = await createApp(new WorkflowDataService(reader as never), ["viewer"]);

    const response = await app.inject({ method: "GET", url: "/api/server/workflows/12/data?revision=3" });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: { code: "WORKFLOW_ACCESS_FORBIDDEN" } });
    expect(reader.getOverview).not.toHaveBeenCalled();
  });

  async function createApp(dataService: object, roles = ["owner"]) {
    const app = Fastify({ logger: false });
    apps.push(app);
    await registerErrorHandler(app);
    app.decorate("authenticate", async (request) => {
      request.user = { roles, sessionId: "session-1", sessionVersion: 1, subUserId: "17", uid: 9 } as never;
    });
    await registerWorkflowRoutes(app, {
      dataService: dataService as never,
      service: {} as never,
    });
    return app;
  }
});

function createRecordDbMock(options: {
  draftJson?: unknown;
  executionKind?: string;
  executionStatus?: string;
  runCurrentNodeId?: string;
  runStatus?: string;
} = {}) {
  const draftJson = options.draftJson ?? JSON.stringify({
    nodes: [{ data: { kind: "wait", title: "等待一天" }, id: "wait-1" }],
  });
  const now = new Date("2026-07-12T10:00:00.000Z");
  const db = {
    retentionConditions: [] as unknown[][],
    wheres: [] as unknown[][],
    selectFrom(table: string) {
      const builder = {
        orderBy() { return builder; },
        select() { return builder; },
        where(...args: unknown[]) {
          if (table === "xy_wap_embed_workflow_run" && typeof args[0] === "function") {
            const eb = Object.assign(
              (...expression: unknown[]) => {
                db.retentionConditions.push(expression);
                return expression;
              },
              { or: (expressions: unknown[]) => expressions },
            );
            (args[0] as (expressionBuilder: typeof eb) => unknown)(eb);
          }
          db.wheres.push([table, ...args]);
          return builder;
        },
        async execute() {
          if (table === "xy_wap_embed_workflow_node_execution") {
            return [{
              completed_at: now,
              create_time: now,
              error_message: null,
              node_id: options.runCurrentNodeId ?? "wait-1",
              node_kind: options.executionKind ?? "wait",
              status: options.executionStatus ?? "completed",
            }];
          }
          return [];
        },
        async executeTakeFirst() {
          if (table === "xy_wap_embed_workflow_run") {
            return {
              create_time: now,
              current_node_id: options.runCurrentNodeId ?? "wait-1",
              id: "31",
              revision: 3,
              status: options.runStatus ?? "waiting",
              subject_id: "customer-1",
              update_time: now,
            };
          }
          return {
            draft_json: draftJson,
          };
        },
      };
      return builder;
    },
  };
  return db;
}

function createRecordListDbMock() {
  const db = {
    retentionConditions: [] as unknown[][],
    selectFrom(table: string) {
      const builder = {
        limit() { return builder; },
        orderBy() { return builder; },
        select() { return builder; },
        where(...args: unknown[]) {
          if (table === "xy_wap_embed_workflow_run" && typeof args[0] === "function") {
            const eb = Object.assign(
              (...expression: unknown[]) => {
                db.retentionConditions.push(expression);
                return expression;
              },
              { or: (expressions: unknown[]) => expressions },
            );
            (args[0] as (expressionBuilder: typeof eb) => unknown)(eb);
          }
          return builder;
        },
        async execute() { return []; },
      };
      return builder;
    },
  };
  return db;
}
