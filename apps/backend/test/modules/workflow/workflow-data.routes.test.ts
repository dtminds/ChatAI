import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerErrorHandler } from "../../../src/plugins/error-handler.js";
import { registerWorkflowRoutes } from "../../../src/modules/workflow/workflow.routes.js";

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

  async function createApp(dataService: object) {
    const app = Fastify({ logger: false });
    apps.push(app);
    await registerErrorHandler(app);
    app.decorate("authenticate", async (request) => {
      request.user = { roles: ["owner"], sessionId: "session-1", sessionVersion: 1, subUserId: "17", uid: 9 };
    });
    await registerWorkflowRoutes(app, {
      dataService: dataService as never,
      service: {} as never,
    });
    return app;
  }
});
