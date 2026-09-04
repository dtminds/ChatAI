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
      getExecutionLog: vi.fn(async () => ({
        completedAt: "2026-07-12T09:00:01.000Z",
        errorCode: null,
        errorMessage: null,
        executionId: "123",
        inputAvailable: true,
        inputSnapshot: { subjectId: "customer-1" },
        nodeId: "message-query-1",
        nodeKind: "message-query",
        output: { messages: [] },
        sequence: 2,
        sourceOutletId: null,
        startedAt: "2026-07-12T09:00:00.000Z",
        status: "completed",
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
    expect((await app.inject({ method: "GET", url: "/api/server/workflows/12/records/31/executions/2" })).json().data)
      .toMatchObject({ nodeId: "message-query-1", sequence: 2 });

    expect(dataService.listRecords).toHaveBeenCalledWith(expect.objectContaining({ uid: 9 }), expect.objectContaining({
      cursor: "40",
      limit: 20,
      nodeId: "wait-1",
      workflowId: "12",
    }));
    expect(dataService.getExecutionLog).toHaveBeenCalledWith(expect.objectContaining({ uid: 9 }), "12", "31", 2);
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
      canViewWorkflowObservability: false,
      recentFailedRunCount: 231,
      recentSuccessRatePercent: 98.2,
      todayRunCount: 12_847,
      todayRunCountChangePercent: 12,
      totalWorkflowCount: 38,
    });
    expect(dataService.getTenantOverview).toHaveBeenCalledWith(expect.objectContaining({ uid: 9 }));
  });

  it("keeps Workflow observability on the ChatAI Surface", async () => {
    const dataService = {
      getTenantOverview: vi.fn(async () => ({ totalWorkflowCount: 1 })),
    };
    const app = await createApp(dataService, ["owner"], new Set(["9:17"]));

    const [chatResponse, embedResponse] = await Promise.all([
      app.inject({ method: "GET", url: "/api/server/workflows/overview" }),
      app.inject({ method: "GET", url: "/api/server/embed/workflows/overview" }),
    ]);

    expect(chatResponse.json().data.canViewWorkflowObservability).toBe(true);
    expect(embedResponse.json().data.canViewWorkflowObservability).toBe(false);
    expect(dataService.getTenantOverview).toHaveBeenCalledWith(
      expect.objectContaining({ surface: "chatai", uid: 9 }),
    );
    expect(dataService.getTenantOverview).toHaveBeenCalledWith(
      expect.objectContaining({ surface: "sop_embed", uid: 9 }),
    );
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

  it("only requests execution input for subjects on the observer whitelist", async () => {
    const reader = {
      getExecutionLog: vi.fn(async () => ({})),
    };
    const scope = { roles: ["owner"], subUserId: "17", uid: 9 } as const;
    const observer = new WorkflowDataService(reader as never, {
      observerSubjects: new Set(["9:17"]),
    });
    const regular = new WorkflowDataService(reader as never);

    await observer.getExecutionLog(scope, "12", "31", 1);
    await regular.getExecutionLog(scope, "12", "31", 1);

    expect(reader.getExecutionLog).toHaveBeenNthCalledWith(1, {
      includeInput: true,
      recordId: "31",
      sequence: 1,
      uid: 9,
      workflowId: "12",
    });
    expect(reader.getExecutionLog).toHaveBeenNthCalledWith(2, {
      includeInput: false,
      recordId: "31",
      sequence: 1,
      uid: 9,
      workflowId: "12",
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

  it("scopes the tenant overview metrics to the requested Workflow types", async () => {
    const db = createTenantOverviewDbMock();
    const reader = new MysqlWorkflowDataReader(db as never);

    await expect(reader.getTenantOverview({
      today: "2026-08-25",
      uid: 9,
      windowStart: "2026-08-19",
      workflowTypes: ["wecom_sop"],
      yesterday: "2026-08-24",
    })).resolves.toMatchObject({
      recentCompletedRunCount: 9_800,
      totalWorkflowCount: 38,
    });

    expect(db.joins).toEqual([[
      "xy_wap_embed_workflow_daily_metric as metric",
      "xy_wap_embed_workflow_definition as definition",
    ]]);
    expect(db.wheres).toContainEqual([
      "xy_wap_embed_workflow_daily_metric as metric",
      "metric.uid",
      "=",
      9,
    ]);
    expect(db.wheres).toContainEqual([
      "xy_wap_embed_workflow_daily_metric as metric",
      "definition.workflow_type",
      "in",
      [2],
    ]);
    expect(db.wheres).toContainEqual([
      "xy_wap_embed_workflow_definition",
      "workflow_type",
      "in",
      [2],
    ]);
    expect(db.selectCounts.get("xy_wap_embed_workflow_daily_metric as metric")).toBe(1);
  });

  it("fails closed when a data repository is given no visible Workflow types", async () => {
    const db = createFailClosedDbMock();
    const reader = new MysqlWorkflowDataReader(db as never);
    const emptyTenantOverview = {
      activeWorkflowCount: 0,
      recentCompletedRunCount: 0,
      recentFailedRunCount: 0,
      todayRunCount: 0,
      totalWorkflowCount: 0,
      yesterdayRunCount: 0,
    };

    await expect(reader.getTenantOverview({
      today: "2026-08-25",
      uid: 9,
      windowStart: "2026-08-19",
      workflowTypes: [],
      yesterday: "2026-08-24",
    })).resolves.toEqual(emptyTenantOverview);
    await expect(reader.getOverview({ uid: 9, workflowId: "12", workflowTypes: [] }))
      .rejects.toMatchObject({ code: "WORKFLOW_NOT_FOUND", statusCode: 404 });
    await expect(reader.listRecords({ limit: 20, uid: 9, workflowId: "12", workflowTypes: [] }))
      .rejects.toMatchObject({ code: "WORKFLOW_NOT_FOUND", statusCode: 404 });
    await expect(reader.getRecord({
      recordId: "31",
      uid: 9,
      workflowId: "12",
      workflowTypes: [],
    })).rejects.toMatchObject({ code: "WORKFLOW_NOT_FOUND", statusCode: 404 });
    expect(db.selectFrom).not.toHaveBeenCalled();
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

  it("keeps the terminal current node in an incomplete trajectory", async () => {
    const reader = new MysqlWorkflowDataReader(createRecordDbMock({
      draftJson: JSON.stringify({
        nodes: [
          { data: { kind: "start", title: "开始" }, id: "start" },
          { data: { kind: "message", title: "消息发送" }, id: "message-1" },
          { data: { kind: "wait-event", title: "等待事件" }, id: "wait-event-1" },
        ],
      }),
      executionRows: [
        { nodeId: "start", nodeKind: "start" },
        { nodeId: "message-1", nodeKind: "message" },
      ],
      runCurrentNodeId: "wait-event-1",
      runStatus: "cancelled",
      terminalReason: "workflow_stopped",
    }) as never);

    const detail = await reader.getRecord({ recordId: "31", uid: 9, workflowId: "12" });

    expect(detail.steps).toEqual([
      expect.objectContaining({ nodeId: "start", status: "completed" }),
      expect.objectContaining({ nodeId: "message-1", status: "completed" }),
      expect.objectContaining({
        nodeId: "wait-event-1",
        nodeKind: "wait-event",
        status: "failed",
        title: "等待事件",
        description: "流程已停止运行",
      }),
    ]);
  });

  it("aggregates metrics by node in MySQL across revisions while returning only current graph nodes", async () => {
    const db = createOverviewDbMock();
    const reader = new MysqlWorkflowDataReader(db as never);

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
    expect(overview.calculatedAt).toBe("2026-07-12T10:00:00.000Z");
    expect(db.metricExecuteCount).toBe(1);
    expect(db.metricGroupBy).toBe("node_id");
    expect(db.metricNodeIds).toEqual(["start", "wait-1", "end"]);
    expect(db.metricUnionAll).toBe(true);
  });

  it("returns zero metrics for a published Workflow before its first metric event", async () => {
    const reader = new MysqlWorkflowDataReader(createOverviewDbMock({ emptyMetrics: true }) as never);

    const overview = await reader.getOverview({ uid: 9, workflowId: "12" });

    expect(overview.nodes).toEqual([]);
    expect(overview.summary).toEqual({ completed: 0, current: 0, entered: 0, incomplete: 0 });
    expect(Number.isNaN(Date.parse(overview.calculatedAt))).toBe(false);
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
          ["completed", "failed", "retrying", "running"],
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

  it("hydrates WeCom record customers from the Java contact list in one page batch", async () => {
    const directory = {
      listByExternalUserIds: vi.fn(async () => new Map([
        [3267, { avatar: "https://cdn.example.com/a.png", name: "张三" }],
        [3268, { avatar: null, name: "李四" }],
      ])),
    };
    const reader = new MysqlWorkflowDataReader(createWecomRecordListDbMock([
      { id: "41", subjectId: "3267", subjectType: 2 },
      { id: "40", subjectId: "3268", subjectType: 2 },
      { id: "39", subjectId: "3267", subjectType: 2 },
    ]) as never, { wecomContactDirectory: directory });

    const page = await reader.listRecords({ limit: 50, uid: 9, workflowId: "12" });

    expect(directory.listByExternalUserIds).toHaveBeenCalledTimes(1);
    expect(directory.listByExternalUserIds).toHaveBeenCalledWith({
      externalUserIds: [3267, 3268],
      uid: 9,
    });
    expect(page.items.map(item => item.customer)).toEqual([
      { avatar: "https://cdn.example.com/a.png", name: "张三" },
      { avatar: null, name: "李四" },
      { avatar: "https://cdn.example.com/a.png", name: "张三" },
    ]);
  });

  it("keeps one Java contact lookup at the records page bound", async () => {
    const directory = {
      listByExternalUserIds: vi.fn(async (input: { externalUserIds: number[] }) =>
        new Map(input.externalUserIds.map(id => [id, { avatar: null, name: `客户${id}` }]))),
    };
    const reader = new MysqlWorkflowDataReader(createWecomRecordListDbMock(
      Array.from({ length: 100 }, (_, index) => ({
        id: String(200 - index),
        subjectId: String(3000 + index),
        subjectType: 2,
      })),
    ) as never, { wecomContactDirectory: directory });

    const page = await reader.listRecords({ limit: 100, uid: 9, workflowId: "12" });

    expect(directory.listByExternalUserIds).toHaveBeenCalledTimes(1);
    expect(directory.listByExternalUserIds.mock.calls[0]?.[0].externalUserIds).toHaveLength(100);
    expect(page.items).toHaveLength(100);
    expect(page.items[0]?.customer.name).toBe("客户3000");
    expect(page.items[99]?.customer.name).toBe("客户3099");
  });

  it("does not query Java for ChatAI record customers", async () => {
    const directory = { listByExternalUserIds: vi.fn() };
    const reader = new MysqlWorkflowDataReader(createRecordDbMock() as never, {
      wecomContactDirectory: directory,
    });

    await reader.getRecord({ recordId: "31", uid: 9, workflowId: "12" });

    expect(directory.listByExternalUserIds).not.toHaveBeenCalled();
  });

  it("hydrates a ChatAI record with its managed account name from the trigger seatId", async () => {
    const managedAccountReader = {
      findByIds: vi.fn(async () => new Map([[101, { avatarUrl: "", id: 101, name: "托管账号A" }]])),
    };
    const reader = new MysqlWorkflowDataReader(createRecordDbMock({
      contextJson: JSON.stringify({ trigger: { projection: { seatId: 101 } } }),
    }) as never, { managedAccountReader });

    const detail = await reader.getRecord({ recordId: "31", uid: 9, workflowId: "12" });

    expect(detail.memberName).toBe("托管账号A");
    expect(managedAccountReader.findByIds).toHaveBeenCalledWith(9, [101]);
  });

  it("hydrates a WeCom record with its member name from the trigger workUserId", async () => {
    const wecomMemberReader = {
      findByIds: vi.fn(async () => new Map([[201, { avatarUrl: "", id: 201, name: "企微成员A" }]])),
    };
    const reader = new MysqlWorkflowDataReader(createRecordDbMock({
      contextJson: JSON.stringify({ trigger: { projection: { workUserId: 201 } } }),
      subjectType: 2,
    }) as never, { wecomMemberReader });

    const detail = await reader.getRecord({ recordId: "31", uid: 9, workflowId: "12" });

    expect(detail.memberName).toBe("企微成员A");
    expect(wecomMemberReader.findByIds).toHaveBeenCalledWith(9, [201]);
  });

  it("keeps execution JSON out of the trajectory query and reads one requested log", async () => {
    const db = createRecordDbMock({
      executionLog: {
        completedAt: new Date("2026-07-12T09:00:01.000Z"),
        errorCode: null,
        errorMessage: null,
        id: "123",
        inputSnapshotJson: JSON.stringify({ subjectId: "customer-1" }),
        nodeId: "message-query-1",
        nodeKind: "message-query",
        outputJson: JSON.stringify({ messages: [] }),
        sequence: 2,
        sourceOutletId: "default",
        startedAt: new Date("2026-07-12T09:00:00.000Z"),
        status: "completed",
      },
    });
    const reader = new MysqlWorkflowDataReader(db as never);

    await reader.getRecord({ recordId: "31", uid: 9, workflowId: "12" });
    expect(db.selectedColumns.find(item => item.table === "xy_wap_embed_workflow_node_execution")?.columns)
      .not.toEqual(expect.arrayContaining(["input_snapshot_json", "output_json"]));

    await expect(reader.getExecutionLog({ includeInput: true, recordId: "31", sequence: 2, uid: 9, workflowId: "12" }))
      .resolves.toMatchObject({
        executionId: "123",
        inputAvailable: true,
        inputSnapshot: { subjectId: "customer-1" },
        nodeId: "message-query-1",
        output: { messages: [] },
        sequence: 2,
        sourceOutletId: "default",
      });
    await expect(reader.getExecutionLog({ includeInput: false, recordId: "31", sequence: 2, uid: 9, workflowId: "12" }))
      .resolves.toMatchObject({
        executionId: "123",
        inputAvailable: false,
        inputSnapshot: {},
        output: { messages: [] },
      });
    expect(db.wheres).toContainEqual(["xy_wap_embed_workflow_node_execution", "sequence", "=", 2]);
    const executionSelections = db.selectedColumns
      .filter(item => item.table === "xy_wap_embed_workflow_node_execution")
      .map(item => item.columns);
    expect(executionSelections.find(columns => Array.isArray(columns) && columns.includes("input_snapshot_json")))
      .toEqual(expect.arrayContaining(["input_snapshot_json", "output_json"]));
    expect(executionSelections.findLast(columns => Array.isArray(columns) && columns.includes("output_json")))
      .not.toEqual(expect.arrayContaining(["input_snapshot_json"]));
  });

  it("keeps WeCom records available when Java contact lookup fails", async () => {
    const directory = {
      listByExternalUserIds: vi.fn(async () => {
        throw new Error("java unavailable");
      }),
    };
    const reader = new MysqlWorkflowDataReader(createRecordDbMock({
      subjectId: "3267",
      subjectType: 2,
    }) as never, { wecomContactDirectory: directory });

    const detail = await reader.getRecord({ recordId: "31", uid: 9, workflowId: "12" });

    expect(detail.customer).toEqual({ avatar: null, name: "未知客户" });
    expect(detail.recordId).toBe("31");
  });

  it("rejects data access for users without workflow administration permission", async () => {
    const reader = {
      getCapacityUsage: vi.fn(),
      getOverview: vi.fn(),
      getTenantOverview: vi.fn(),
      getRecord: vi.fn(),
      getExecutionLog: vi.fn(),
      listRecords: vi.fn(),
    };
    const app = await createApp(new WorkflowDataService(reader as never), ["viewer"]);

    const [dataResponse, capacityResponse, overviewResponse, logResponse] = await Promise.all([
      app.inject({ method: "GET", url: "/api/server/workflows/12/data" }),
      app.inject({ method: "GET", url: "/api/server/workflows/capacity" }),
      app.inject({ method: "GET", url: "/api/server/workflows/overview" }),
      app.inject({ method: "GET", url: "/api/server/workflows/12/records/31/executions/1" }),
    ]);

    expect(dataResponse.statusCode).toBe(403);
    expect(capacityResponse.statusCode).toBe(403);
    expect(overviewResponse.statusCode).toBe(403);
    expect(logResponse.statusCode).toBe(403);
    expect(capacityResponse.json()).toMatchObject({
      error: { code: "WORKFLOW_ACCESS_FORBIDDEN" },
    });
    expect(reader.getCapacityUsage).not.toHaveBeenCalled();
    expect(reader.getOverview).not.toHaveBeenCalled();
    expect(reader.getTenantOverview).not.toHaveBeenCalled();
    expect(reader.getExecutionLog).not.toHaveBeenCalled();
  });

  async function createApp(
    dataService: object,
    roles = ["owner"],
    observerSubjects: ReadonlySet<string> = new Set(),
  ) {
    const app = Fastify({ logger: false });
    apps.push(app);
    await registerErrorHandler(app);
    app.decorate("authenticate", async (request) => {
      request.user = { roles, sessionId: "session-1", sessionVersion: 1, subUserId: "17", uid: 9 } as never;
    });
    await registerWorkflowRoutes(app, {
      dataService: dataService as never,
      observerSubjects,
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
    joins: [] as string[][],
    selectCounts: new Map<string, number>(),
    selectedTables: [] as string[],
    wheres: [] as unknown[][],
    selectFrom(table: string) {
      db.selectedTables.push(table);
      const builder = {
        innerJoin(joinedTable: string, on: (join: { onRef: () => unknown }) => unknown) {
          db.joins.push([table, joinedTable]);
          const join = {
            onRef() { return join; },
          };
          on(join);
          return builder;
        },
        select() {
          db.selectCounts.set(table, (db.selectCounts.get(table) ?? 0) + 1);
          return builder;
        },
        where(...args: unknown[]) {
          db.wheres.push([table, ...args]);
          return builder;
        },
        async executeTakeFirst() {
          if (table.startsWith("xy_wap_embed_workflow_daily_metric")) {
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

function createFailClosedDbMock() {
  return {
    selectFrom: vi.fn(() => {
      throw new Error("empty Workflow visibility must not query MySQL");
    }),
  };
}

function createOverviewDbMock(options: { emptyMetrics?: boolean } = {}) {
  const updatedAt = new Date("2026-07-12T10:00:00.000Z");
  const db = {
    metricExecuteCount: 0,
    metricGroupBy: null as string | null,
    metricNodeIds: null as string[] | null,
    metricUnionAll: false,
    selectFrom(table: string) {
      const builder = {
        groupBy(column: string) {
          if (table === "xy_wap_embed_workflow_node_metric") db.metricGroupBy = column;
          return builder;
        },
        unionAll() {
          if (table === "xy_wap_embed_workflow_node_metric") db.metricUnionAll = true;
          return builder;
        },
        select() { return builder; },
        where(column: string, operator: string, value: unknown) {
          if (table === "xy_wap_embed_workflow_node_metric"
            && column === "node_id"
            && operator === "in") {
            db.metricNodeIds = value as string[];
          }
          return builder;
        },
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
          db.metricExecuteCount += 1;
          const summary = {
            ...metricRow("summary", options.emptyMetrics ? {} : {
              completed: 96,
              current: 20,
              entered: 120,
              incomplete: 6,
            }, updatedAt),
            node_id: null,
            row_kind: "summary",
            update_time: options.emptyMetrics ? null : updatedAt,
          };
          if (options.emptyMetrics) return [summary];
          return [
            summary,
            { ...metricRow("start", { entered: 120 }, updatedAt), row_kind: "node", update_time: null },
            { ...metricRow("wait-1", { current: 18, passed: 96 }, updatedAt), row_kind: "node", update_time: null },
            { ...metricRow("end", { completed: 96 }, updatedAt), row_kind: "node", update_time: null },
          ];
        },
      };
      return builder;
    },
  };
  return db;
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
  contextJson?: unknown;
  draftJson?: unknown;
  executionKind?: string;
  executionLog?: {
    completedAt: Date;
    errorCode: string | null;
    errorMessage: string | null;
    id: string;
    inputSnapshotJson: string;
    nodeId: string;
    nodeKind: string;
    outputJson: string;
    sequence: number;
    sourceOutletId: string | null;
    startedAt: Date;
    status: string;
  };
  executionStatus?: string;
  executionRows?: Array<{ nodeId: string; nodeKind: string }>;
  nextExecuteAt?: Date | null;
  runCurrentNodeId?: string;
  runStatus?: string;
  subjectId?: string;
  subjectType?: number;
  terminalReason?: string | null;
} = {}) {
  const draftJson = options.draftJson ?? JSON.stringify({
    nodes: [{ data: { kind: "wait", title: "等待一天" }, id: "wait-1" }],
  });
  const now = new Date("2026-07-12T10:00:00.000Z");
  const db = {
    retentionConditions: [] as unknown[][],
    selectedColumns: [] as Array<{ columns: unknown; table: string }>,
    wheres: [] as unknown[][],
    selectFrom(table: string) {
      const builder = {
        orderBy() { return builder; },
        select(columns: unknown) {
          db.selectedColumns.push({ columns, table });
          return builder;
        },
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
            return (options.executionRows ?? [{
              nodeId: options.runCurrentNodeId ?? "wait-1",
              nodeKind: options.executionKind ?? "wait",
            }]).map(row => ({
              completed_at: now,
              create_time: now,
              error_message: null,
              node_id: row.nodeId,
              node_kind: row.nodeKind,
              revision: 3,
              sequence: 1,
              source_outlet_id: null,
              status: options.executionStatus ?? "completed",
            }));
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
              subject_id: options.subjectId ?? "customer-1",
              subject_type: options.subjectType ?? 1,
              terminal_reason: options.terminalReason ?? null,
              context_json: options.contextJson ?? JSON.stringify({ trigger: {} }),
              sequence: 1,
              update_time: now,
            };
          }
          if (table === "xy_wap_embed_workflow_node_execution" && options.executionLog) {
            return {
              completed_at: options.executionLog.completedAt,
              error_code: options.executionLog.errorCode,
              error_message: options.executionLog.errorMessage,
              id: options.executionLog.id,
              input_snapshot_json: options.executionLog.inputSnapshotJson,
              node_id: options.executionLog.nodeId,
              node_kind: options.executionLog.nodeKind,
              output_json: options.executionLog.outputJson,
              sequence: options.executionLog.sequence,
              source_outlet_id: options.executionLog.sourceOutletId,
              started_at: options.executionLog.startedAt,
              status: options.executionLog.status,
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

function createWecomRecordListDbMock(runs: Array<{
  id: string;
  subjectId: string;
  subjectType: number;
}>) {
  const now = new Date("2026-07-12T10:00:00.000Z");
  return {
    selectFrom(table: string) {
      const builder = {
        limit() { return builder; },
        orderBy() { return builder; },
        select() { return builder; },
        where() { return builder; },
        async execute() {
          if (table !== "xy_wap_embed_workflow_run") return [];
          return runs.map(run => ({
            create_time: now,
            current_node_id: "wait-1",
            id: run.id,
            next_execute_at: null,
            revision: 3,
            status: "waiting",
            subject_id: run.subjectId,
            subject_type: run.subjectType,
            update_time: now,
          }));
        },
      };
      return builder;
    },
  };
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
