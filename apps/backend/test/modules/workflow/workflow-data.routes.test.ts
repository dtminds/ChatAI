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

  it("falls back to default node titles when a revision snapshot cannot be parsed", async () => {
    const reader = new MysqlWorkflowDataReader(createRecordDbMock({ draftJson: "{not-json" }) as never);

    const detail = await reader.getRecord({ recordId: "31", uid: 9, workflowId: "12" });

    expect(detail.steps).toEqual([expect.objectContaining({
      nodeId: "wait-1",
      status: "current",
      title: "等待",
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

function createRecordDbMock(options: { draftJson?: unknown; executionKind?: string } = {}) {
  const draftJson = options.draftJson ?? JSON.stringify({
    nodes: [{ data: { kind: "wait", title: "等待一天" }, id: "wait-1" }],
  });
  const now = new Date("2026-07-12T10:00:00.000Z");
  const db = {
    wheres: [] as unknown[][],
    selectFrom(table: string) {
      const builder = {
        orderBy() { return builder; },
        select() { return builder; },
        where(...args: unknown[]) {
          db.wheres.push([table, ...args]);
          return builder;
        },
        async execute() {
          if (table === "xy_wap_embed_workflow_node_execution") {
            return [{
              completed_at: now,
              create_time: now,
              error_message: null,
              node_id: "wait-1",
              node_kind: options.executionKind ?? "wait",
              status: "completed",
            }];
          }
          return [];
        },
        async executeTakeFirst() {
          if (table === "xy_wap_embed_workflow_run") {
            return {
              create_time: now,
              current_node_id: "wait-1",
              id: "31",
              revision: 3,
              status: "waiting",
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
