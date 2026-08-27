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
      getOverview: vi.fn(async () => ({
        calculatedAt: "2026-07-12T10:00:00.000Z",
        nodes: [],
        publishedRevision: 3,
        summary: { completed: 0, current: 0, entered: 0, incomplete: 0 },
      })),
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

    expect((await app.inject({ method: "GET", url: "/api/server/workflows/12/data" })).json().data)
      .toMatchObject({ publishedRevision: 3 });
    expect((await app.inject({ method: "GET", url: "/api/server/workflows/12/records?nodeId=wait-1&cursor=40&limit=20" })).json().data)
      .toMatchObject({ nextCursor: "29" });
    expect((await app.inject({ method: "GET", url: "/api/server/workflows/12/records/31" })).json().data)
      .toMatchObject({ customer: { name: "张三" }, recordId: "31" });

    expect(dataService.listRecords).toHaveBeenCalledWith(expect.objectContaining({ uid: 9 }), expect.objectContaining({
      cursor: "40",
      limit: 20,
      nodeId: "wait-1",
      workflowId: "12",
    }));
  });

  it("serves one tenant-level capacity overview independently from the Workflow list", async () => {
    const dataService = {
      getCapacityOverview: vi.fn(async () => ({
        capacityRejectedCountToday: 12,
        status: "warning",
        usagePercent: 87,
      })),
    };
    const app = await createApp(dataService);

    const response = await app.inject({ method: "GET", url: "/api/server/workflows/capacity" });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual({
      capacityRejectedCountToday: 12,
      status: "warning",
      usagePercent: 87,
    });
    expect(dataService.getCapacityOverview).toHaveBeenCalledWith(expect.objectContaining({ uid: 9 }));
  });

  it("serves one tenant-level operating overview independently from the paged Workflow list", async () => {
    const dataService = {
      getTenantOverview: vi.fn(async () => ({
        activeWorkflowCount: 23,
        recentFailedRunCount: 231,
        recentSuccessRatePercent: 98.2,
        todayRunCount: 12_847,
        todayRunCountChangePercent: 12,
        totalWorkflowCount: 38,
      })),
    };
    const app = await createApp(dataService);

    const response = await app.inject({ method: "GET", url: "/api/server/workflows/overview" });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual({
      activeWorkflowCount: 23,
      recentFailedRunCount: 231,
      recentSuccessRatePercent: 98.2,
      todayRunCount: 12_847,
      todayRunCountChangePercent: 12,
      totalWorkflowCount: 38,
    });
    expect(dataService.getTenantOverview).toHaveBeenCalledWith(expect.objectContaining({ uid: 9 }));
  });

  it("combines tenant Run usage with one tenant-scoped capacity lookup", async () => {
    const reader = {
      getCapacityUsage: vi.fn(async () => ({
        activeRunCount: 25,
        capacityRejectedCountToday: 3,
      })),
    };
    const capacityPort = {
      getTenantCapacity: vi.fn(async () => ({
        activeRunLimit: 100,
      })),
    };
    const service = new WorkflowDataService(reader as never, {
      capacityPort,
      clock: () => new Date("2026-08-24T16:30:00.000Z"),
    });

    await expect(service.getCapacityOverview({ roles: ["owner"], subUserId: "17", uid: 9 }))
      .resolves.toEqual({
        capacityRejectedCountToday: 3,
        status: "normal",
        usagePercent: 25,
    });
    expect(reader.getCapacityUsage).toHaveBeenCalledTimes(1);
    expect(reader.getCapacityUsage).toHaveBeenCalledWith({ date: "2026-08-25", uid: 9 });
    expect(capacityPort.getTenantCapacity).toHaveBeenCalledTimes(1);
    expect(capacityPort.getTenantCapacity).toHaveBeenCalledWith({ uid: 9 });
  });

  it("derives the tenant operating overview from the current Shanghai day and recent seven days", async () => {
    const reader = {
      getTenantOverview: vi.fn(async () => ({
        activeWorkflowCount: 23,
        recentCompletedRunCount: 982,
        recentFailedRunCount: 18,
        todayRunCount: 125,
        totalWorkflowCount: 38,
        yesterdayRunCount: 100,
      })),
    };
    const service = new WorkflowDataService(reader as never, {
      clock: () => new Date("2026-08-24T16:30:00.000Z"),
    });

    await expect(service.getTenantOverview({ roles: ["owner"], subUserId: "17", uid: 9 }))
      .resolves.toEqual({
        activeWorkflowCount: 23,
        recentFailedRunCount: 18,
        recentSuccessRatePercent: 98.2,
        todayRunCount: 125,
        todayRunCountChangePercent: 25,
        totalWorkflowCount: 38,
      });
    expect(reader.getTenantOverview).toHaveBeenCalledWith({
      today: "2026-08-25",
      uid: 9,
      windowStart: "2026-08-19",
      yesterday: "2026-08-24",
    });
  });

  it("fails the capacity overview when the tenant capacity authority is unavailable", async () => {
    const service = new WorkflowDataService({
      getCapacityUsage: vi.fn(async () => ({
        activeRunCount: 25,
        capacityRejectedCountToday: 3,
      })),
    } as never, {
      capacityPort: {
        getTenantCapacity: vi.fn(async () => {
          throw new Error("Java unavailable");
        }),
      },
    });

    await expect(service.getCapacityOverview({ roles: ["owner"], subUserId: "17", uid: 9 }))
      .rejects.toMatchObject({ code: "WORKFLOW_CAPACITY_UNAVAILABLE", statusCode: 503 });
  });

  it("returns the persisted capacity counter and today's rejection metric without scanning Runs", async () => {
    const db = createCapacityUsageDbMock();
    const reader = new MysqlWorkflowDataReader(db as never);

    await expect(reader.getCapacityUsage({ date: "2026-08-24", uid: 9 })).resolves.toEqual({
      activeRunCount: 0,
      capacityRejectedCountToday: 0,
    });
    expect(db.selectedTables).toEqual([
      "xy_wap_embed_workflow_capacity_guard",
      "xy_wap_embed_workflow_capacity_daily_metric",
    ]);
    expect(db.wheres).toContainEqual(["xy_wap_embed_workflow_capacity_guard", "uid", "=", 9]);
    expect(db.wheres).toContainEqual([
      "xy_wap_embed_workflow_capacity_daily_metric",
      "uid",
      "=",
      9,
    ]);
    expect(db.wheres).toContainEqual([
      "xy_wap_embed_workflow_capacity_daily_metric",
      "metric_date",
      "=",
      new Date("2026-08-23T16:00:00.000Z"),
    ]);
  });

  it("aggregates the tenant overview from two summary tables without scanning Runs", async () => {
    const db = createTenantOverviewDbMock();
    const reader = new MysqlWorkflowDataReader(db as never);

    await expect(reader.getTenantOverview({
      today: "2026-08-25",
      uid: 9,
      windowStart: "2026-08-19",
      yesterday: "2026-08-24",
    })).resolves.toEqual({
      activeWorkflowCount: 23,
      recentCompletedRunCount: 9_800,
      recentFailedRunCount: 200,
      todayRunCount: 125,
      totalWorkflowCount: 38,
      yesterdayRunCount: 100,
    });
    expect(db.selectedTables).toEqual([
      "xy_wap_embed_workflow_daily_metric",
      "xy_wap_embed_workflow_definition",
    ]);
    expect(db.selectedTables).not.toContain("xy_wap_embed_workflow_run");
    expect(db.wheres).toContainEqual([
      "xy_wap_embed_workflow_daily_metric",
      "metric_date",
      ">=",
      new Date("2026-08-18T16:00:00.000Z"),
    ]);
  });

  it("shows a waiting node once as the waiting trajectory step", async () => {
    const reader = new MysqlWorkflowDataReader(createRecordDbMock() as never);

    const detail = await reader.getRecord({ recordId: "31", uid: 9, workflowId: "12" });

    expect(detail.steps).toEqual([expect.objectContaining({
      nodeId: "wait-1",
      status: "waiting",
      title: "等待一天",
    })]);
  });

  it("returns the next execution time for a deferred Message trajectory step", async () => {
    const nextExecuteAt = new Date("2026-07-13T01:00:00.000Z");
    const reader = new MysqlWorkflowDataReader(createRecordDbMock({
      executionKind: "message",
      nextExecuteAt,
      runCurrentNodeId: "message-1",
      runStatus: "waiting",
    }) as never);

    const detail = await reader.getRecord({ recordId: "31", uid: 9, workflowId: "12" });

    expect(detail.steps).toEqual([expect.objectContaining({
      nextExecuteAt: nextExecuteAt.toISOString(),
      nodeId: "message-1",
      nodeKind: "message",
      status: "waiting",
    })]);
  });

  it("aggregates metrics across revisions while returning only current graph nodes", async () => {
    const reader = new MysqlWorkflowDataReader(createOverviewDbMock() as never);

    const overview = await reader.getOverview({ uid: 9, workflowId: "12" });

    expect(overview).toMatchObject({
      publishedRevision: 3,
      summary: { completed: 96, current: 20, entered: 120, incomplete: 6 },
    });
    expect(overview.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ entered: 120, nodeId: "start" }),
      expect.objectContaining({ current: 18, nodeId: "wait-1" }),
    ]));
    expect(overview.nodes.some(node => node.nodeId === "removed-wait")).toBe(false);
  });

  it("returns a stable flow-change reason without exposing other terminal codes", async () => {
    const changedReader = new MysqlWorkflowDataReader(createRecordDbMock({
      runStatus: "cancelled",
      terminalReason: "flow_changed_outlet_deleted",
    }) as never);
    const failedReader = new MysqlWorkflowDataReader(createRecordDbMock({
      runStatus: "failed",
      terminalReason: "WORKFLOW_CAPABILITY_FAILED",
    }) as never);

    await expect(changedReader.getRecord({ recordId: "31", uid: 9, workflowId: "12" }))
      .resolves.toMatchObject({ terminalReason: "flow_changed_outlet_deleted" });
    await expect(failedReader.getRecord({ recordId: "31", uid: 9, workflowId: "12" }))
      .resolves.toMatchObject({ terminalReason: null });
  });

  it("lists active runs and only terminal runs inside the 180-day record window", async () => {
    const listDb = createRecordListDbMock();
    const detailDb = createRecordDbMock({ runStatus: "completed" });
    const listReader = new MysqlWorkflowDataReader(listDb as never);
    const detailReader = new MysqlWorkflowDataReader(detailDb as never);

    await listReader.listRecords({ limit: 20, uid: 9, workflowId: "12" });
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
      status: "waiting",
      title: "等待",
    })]);
  });

  it.each([
    ["agent", "转 Agent"],
    ["ai-collect", "资料收集"],
    ["ai-intent", "意图识别"],
    ["audience-filter", "人群筛选"],
    ["customer-update", "修改客户资料"],
    ["llm", "大模型"],
    ["order-bind", "关联订单"],
    ["order-query", "订单查询"],
    ["order-conversion", "代客转积分"],
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
      status: "waiting",
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
      getCapacityUsage: vi.fn(),
      getOverview: vi.fn(),
      getTenantOverview: vi.fn(),
      getRecord: vi.fn(),
      listRecords: vi.fn(),
    };
    const app = await createApp(new WorkflowDataService(reader as never), ["viewer"]);

    const [dataResponse, capacityResponse, overviewResponse] = await Promise.all([
      app.inject({ method: "GET", url: "/api/server/workflows/12/data" }),
      app.inject({ method: "GET", url: "/api/server/workflows/capacity" }),
      app.inject({ method: "GET", url: "/api/server/workflows/overview" }),
    ]);

    expect(dataResponse.statusCode).toBe(403);
    expect(capacityResponse.statusCode).toBe(403);
    expect(overviewResponse.statusCode).toBe(403);
    expect(capacityResponse.json()).toMatchObject({
      error: { code: "WORKFLOW_ACCESS_FORBIDDEN" },
    });
    expect(reader.getCapacityUsage).not.toHaveBeenCalled();
    expect(reader.getOverview).not.toHaveBeenCalled();
    expect(reader.getTenantOverview).not.toHaveBeenCalled();
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

function createCapacityUsageDbMock() {
  const db = {
    selectedTables: [] as string[],
    wheres: [] as unknown[][],
    selectFrom(table: string) {
      db.selectedTables.push(table);
      const builder = {
        select() { return builder; },
        where(...args: unknown[]) {
          db.wheres.push([table, ...args]);
          return builder;
        },
        async executeTakeFirst() {
          return table === "xy_wap_embed_workflow_capacity_guard"
            ? { active_run_count: 0 }
            : undefined;
        },
      };
      return builder;
    },
  };
  return db;
}

function createTenantOverviewDbMock() {
  const db = {
    selectedTables: [] as string[],
    wheres: [] as unknown[][],
    selectFrom(table: string) {
      db.selectedTables.push(table);
      const builder = {
        select() { return builder; },
        where(...args: unknown[]) {
          db.wheres.push([table, ...args]);
          return builder;
        },
        async executeTakeFirst() {
          if (table === "xy_wap_embed_workflow_daily_metric") {
            return {
              recent_completed_run_count: "9800",
              recent_failed_run_count: "200",
              today_run_count: "125",
              yesterday_run_count: "100",
            };
          }
          return {
            active_workflow_count: "23",
            total_workflow_count: "38",
          };
        },
      };
      return builder;
    },
  };
  return db;
}

function createOverviewDbMock() {
  const updatedAt = new Date("2026-07-12T10:00:00.000Z");
  return {
    selectFrom(table: string) {
      const builder = {
        select() { return builder; },
        where() { return builder; },
        async executeTakeFirst() {
          if (table === "xy_wap_embed_workflow_definition") return { published_revision: 3 };
          if (table === "xy_wap_embed_workflow_revision") {
            return {
              draft_json: JSON.stringify({
                nodes: [{ id: "start" }, { id: "wait-1" }, { id: "end" }],
              }),
            };
          }
          return undefined;
        },
        async execute() {
          if (table !== "xy_wap_embed_workflow_node_metric") return [];
          return [
            metricRow("start", { entered: 70 }, updatedAt),
            metricRow("start", { entered: 50 }, updatedAt),
            metricRow("wait-1", { current: 10, passed: 40 }, updatedAt),
            metricRow("wait-1", { current: 8, passed: 56 }, updatedAt),
            metricRow("end", { completed: 96 }, updatedAt),
            metricRow("removed-wait", { current: 2, incomplete: 6 }, updatedAt),
          ];
        },
      };
      return builder;
    },
  };
}

function metricRow(
  nodeId: string,
  values: Partial<{
    completed: number;
    current: number;
    entered: number;
    incomplete: number;
    passed: number;
  }>,
  updatedAt: Date,
) {
  return {
    completed_count: values.completed ?? 0,
    current_count: values.current ?? 0,
    entered_count: values.entered ?? 0,
    incomplete_count: values.incomplete ?? 0,
    node_id: nodeId,
    passed_count: values.passed ?? 0,
    update_time: updatedAt,
  };
}

function createRecordDbMock(options: {
  draftJson?: unknown;
  executionKind?: string;
  executionStatus?: string;
  nextExecuteAt?: Date | null;
  runCurrentNodeId?: string;
  runStatus?: string;
  terminalReason?: string | null;
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
              revision: 3,
              status: options.executionStatus ?? "completed",
            }];
          }
          if (table === "xy_wap_embed_workflow_revision") {
            return [{ draft_json: draftJson, revision: 3 }];
          }
          return [];
        },
        async executeTakeFirst() {
          if (table === "xy_wap_embed_workflow_run") {
            return {
              create_time: now,
              current_node_id: options.runCurrentNodeId ?? "wait-1",
              id: "31",
              next_execute_at: options.nextExecuteAt ?? null,
              revision: 3,
              status: options.runStatus ?? "waiting",
              subject_id: "customer-1",
              subject_type: 1,
              terminal_reason: options.terminalReason ?? null,
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
