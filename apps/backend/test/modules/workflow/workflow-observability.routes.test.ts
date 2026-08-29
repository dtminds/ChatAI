import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMockedApp } from "../../helpers/build-mocked-app";

const serviceMocks = vi.hoisted(() => ({
  getSummary: vi.fn(async () => ({
    deadTransitionCount: 0,
    inference: { expiredLease: 0, pending: 0, retryWait: 0 },
    observedAt: 1_784_800_000_000,
    outbox: { pending: 0 },
    tasks: {
      dispatched: 0,
      dueBacklog: 0,
      expiredLease: 0,
      pending: 0,
      running: 0,
      stalledDispatched: 0,
      suspended: 0,
    },
    transitions: { dead: 0, leased: 0, pending: 0 },
    workers: [],
  })),
  getWorkflowDetail: vi.fn(),
  listWorkflows: vi.fn(async () => ({
    items: [],
    observedAt: 1_784_800_000_000,
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 1,
  })),
}));

vi.mock(
  "../../../src/modules/workflow/workflow-observability.service",
  () => ({
    WorkflowObservabilityService: class {
      getSummary = serviceMocks.getSummary;
      getWorkflowDetail = serviceMocks.getWorkflowDetail;
      listWorkflows = serviceMocks.listWorkflows;
    },
  }),
);

describe("workflow observability routes", () => {
  const previousSubjects = process.env.INSIGHTS_WORKER_OBSERVER_SUBJECTS;

  afterEach(() => {
    if (previousSubjects == null) {
      delete process.env.INSIGHTS_WORKER_OBSERVER_SUBJECTS;
    } else {
      process.env.INSIGHTS_WORKER_OBSERVER_SUBJECTS = previousSubjects;
    }
    vi.clearAllMocks();
  });

  it("returns no-store for unauthenticated and unauthorized requests", async () => {
    process.env.INSIGHTS_WORKER_OBSERVER_SUBJECTS = "9001:observer";
    const app = await buildMockedApp();
    app.db = createAuthDb() as never;

    const unauthenticated = await app.inject({
      method: "GET",
      url: "/api/server/workflows/observability/summary",
    });
    const token = createToken(app, "other-user");
    const unauthorized = await app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: "GET",
      url: "/api/server/workflows/observability/summary",
    });

    expect(unauthenticated.statusCode).toBe(401);
    expect(unauthenticated.headers["cache-control"]).toBe("no-store");
    expect(unauthorized.statusCode).toBe(403);
    expect(unauthorized.headers["cache-control"]).toBe("no-store");
    expect(serviceMocks.getSummary).not.toHaveBeenCalled();
  });

  it("serves summary, paged workflows, and detail for observers", async () => {
    process.env.INSIGHTS_WORKER_OBSERVER_SUBJECTS = "9001:observer";
    serviceMocks.getWorkflowDetail.mockResolvedValue({
      activeRunCount: 1,
      dueBacklogCount: 0,
      name: "新客旅程",
      observedAt: 1_784_800_000_000,
      runtimeStatus: "active",
      taskDistribution: {
        cancelled: 0,
        completed: 0,
        dead: 0,
        dispatched: 0,
        leased: 0,
        pending: 1,
        running: 0,
        suspended: 0,
        waiting_external: 0,
      },
      uid: 9,
      workflowId: "12",
    });
    const app = await buildMockedApp();
    app.db = createAuthDb() as never;
    const token = createToken(app, "observer");

    const summary = await app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: "GET",
      url: "/api/server/workflows/observability/summary",
    });
    const list = await app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: "GET",
      url: "/api/server/workflows/observability/workflows?state=dead&page=2&pageSize=20",
    });
    const detail = await app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: "GET",
      url: "/api/server/workflows/observability/workflows/12",
    });

    expect(summary.statusCode).toBe(200);
    expect(summary.headers["cache-control"]).toBe("no-store");
    expect(list.statusCode).toBe(200);
    expect(serviceMocks.listWorkflows).toHaveBeenCalledWith({
      page: 2,
      pageSize: 20,
      state: "dead",
      uid: undefined,
      workflowId: undefined,
    });
    expect(detail.statusCode).toBe(200);
    expect(serviceMocks.getWorkflowDetail).toHaveBeenCalledWith("12");
  });

  it("applies observer authorization before parameter validation", async () => {
    process.env.INSIGHTS_WORKER_OBSERVER_SUBJECTS = "9001:observer";
    const app = await buildMockedApp();
    app.db = createAuthDb() as never;
    const unauthorizedToken = createToken(app, "other-user");
    const observerToken = createToken(app, "observer");

    const forbidden = await app.inject({
      headers: { authorization: `Bearer ${unauthorizedToken}` },
      method: "GET",
      url: "/api/server/workflows/observability/workflows/0",
    });
    const invalid = await app.inject({
      headers: { authorization: `Bearer ${observerToken}` },
      method: "GET",
      url: "/api/server/workflows/observability/workflows/0",
    });

    expect(forbidden.statusCode).toBe(403);
    expect(invalid.statusCode).toBe(400);
    expect(forbidden.headers["cache-control"]).toBe("no-store");
    expect(invalid.headers["cache-control"]).toBe("no-store");
  });

  it("keeps no-store on handler failures", async () => {
    process.env.INSIGHTS_WORKER_OBSERVER_SUBJECTS = "9001:observer";
    serviceMocks.getSummary.mockRejectedValueOnce(new Error("query failed"));
    const app = await buildMockedApp();
    app.db = createAuthDb() as never;
    const token = createToken(app, "observer");

    const response = await app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: "GET",
      url: "/api/server/workflows/observability/summary",
    });

    expect(response.statusCode).toBe(500);
    expect(response.headers["cache-control"]).toBe("no-store");
  });
});

function createToken(
  app: Awaited<ReturnType<typeof buildMockedApp>>,
  subUserId: string,
) {
  return app.jwt.sign({
    roles: ["viewer"],
    sessionId: "501",
    sessionVersion: 1,
    subUserId,
    uid: 9001,
  });
}

function createAuthDb() {
  return {
    selectFrom(table: string) {
      if (table !== "xy_wap_embed_sub_user_session") {
        throw new Error(`Unexpected auth table: ${table}`);
      }
      const builder = {
        executeTakeFirst: async () => ({
          expires_at: new Date(Date.now() + 60_000),
          id: 501,
        }),
        select: () => builder,
        where: () => builder,
      };
      return builder;
    },
  };
}
