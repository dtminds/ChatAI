import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMockedApp } from "../../helpers/build-mocked-app";

const serviceMocks = vi.hoisted(() => ({
  getSummary: vi.fn(async () => ({
    analysisJobs: {
      expiredLease: 0,
      failedLast24h: 0,
      pending: 0,
      retrying: 0,
      running: 0,
    },
    discovery: { hasBacklog: false },
    observedAt: 1_784_800_000_000,
    observedUids: {
      blocked: 0,
      error: 0,
      idle: 0,
      processing: 0,
      queued: 0,
      retrying: 0,
      total: 0,
    },
    pipelines: [],
    sessionizationJobs: {
      expiredLease: 0,
      pending: 0,
      retrying: 0,
      running: 0,
    },
    sessions: { open: 0, overdue: 0 },
  })),
  getUidDetail: vi.fn(),
  listUids: vi.fn(async () => ({
    items: [],
    observedAt: 1_784_800_000_000,
    page: 1,
    pageSize: 50,
    total: 0,
    totalPages: 1,
  })),
}));

vi.mock(
  "../../../src/modules/insights/insights-worker-observability.service",
  () => ({
    InsightsWorkerObservabilityService: class {
      getSummary = serviceMocks.getSummary;
      getUidDetail = serviceMocks.getUidDetail;
      listUids = serviceMocks.listUids;
    },
  }),
);

describe("insights worker observability routes", () => {
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
      url: "/api/server/insights/worker-observability/summary",
    });
    const token = createToken(app, "other-user");
    const unauthorized = await app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: "GET",
      url: "/api/server/insights/worker-observability/summary",
    });

    expect(unauthenticated.statusCode).toBe(401);
    expect(unauthenticated.headers["cache-control"]).toBe("no-store");
    expect(unauthorized.statusCode).toBe(403);
    expect(unauthorized.headers["cache-control"]).toBe("no-store");
    expect(serviceMocks.getSummary).not.toHaveBeenCalled();

  });

  it("allows an exact observer pair to read cross-tenant endpoints", async () => {
    process.env.INSIGHTS_WORKER_OBSERVER_SUBJECTS = "9001:observer";
    const app = await buildMockedApp();
    app.db = createAuthDb() as never;
    const token = createToken(app, "observer");

    const response = await app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: "GET",
      url: "/api/server/insights/worker-observability/summary",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json()).toMatchObject({
      data: {
        observedAt: 1_784_800_000_000,
      },
      success: true,
    });
    expect(serviceMocks.getSummary).toHaveBeenCalledTimes(1);

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
      url: "/api/server/insights/worker-observability/uids/0",
    });
    const invalid = await app.inject({
      headers: { authorization: `Bearer ${observerToken}` },
      method: "GET",
      url: "/api/server/insights/worker-observability/uids/0",
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
      url: "/api/server/insights/worker-observability/summary",
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
