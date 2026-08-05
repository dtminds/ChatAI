import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMockedApp } from "../../../helpers/build-mocked-app.js";
import { createKbReadDbMock } from "../../../helpers/create-kb-read-db-mock.js";

describe("user memory routes", () => {
  let app: Awaited<ReturnType<typeof buildMockedApp>> | undefined;
  afterEach(async () => { await app?.close(); app = undefined; });

  it("does not expose a create-run endpoint", async () => {
    app = await buildMockedApp();
    const token = app.jwt.sign({ roles: ["admin"], sessionId: "1", sessionVersion: 1, subUserId: "101", uid: 9001 });
    const response = await app.inject({ method: "POST", url: "/api/server/ai-hosting/user-memory/runs", headers: { authorization: `Bearer ${token}` } });
    expect(response.statusCode).toBe(404);
  });

  it("rejects viewer settings writes before database access", async () => {
    app = await buildMockedApp();
    app.db = createKbReadDbMock() as never;
    const token = app.jwt.sign({ roles: ["viewer"], sessionId: "1", sessionVersion: 1, subUserId: "101", uid: 9001 });
    const response = await app.inject({ method: "PUT", url: "/api/server/ai-hosting/user-memory/settings", headers: { authorization: `Bearer ${token}` }, payload: { enabled: true } });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: { code: "FORBIDDEN" }, success: false });
  });

  it("rejects extraction instructions longer than 500 characters before database access", async () => {
    app = await buildMockedApp();
    app.db = createKbReadDbMock() as never;
    const token = app.jwt.sign({ roles: ["admin"], sessionId: "1", sessionVersion: 1, subUserId: "101", uid: 9001 });
    const response = await app.inject({
      method: "PUT",
      url: "/api/server/ai-hosting/user-memory/settings",
      headers: { authorization: `Bearer ${token}` },
      payload: { extractionInstruction: "提".repeat(501) },
    });
    expect(response.statusCode).toBe(400);
  });

  it.each(["viewer", "operator"])("rejects %s run-detail reads before database access", async (role) => {
    app = await buildMockedApp();
    app.db = createKbReadDbMock() as never;
    const token = app.jwt.sign({ roles: [role], sessionId: "1", sessionVersion: 1, subUserId: "101", uid: 9001 });
    const response = await app.inject({ method: "GET", url: "/api/server/ai-hosting/user-memory/runs/1", headers: { authorization: `Bearer ${token}` } });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: { code: "FORBIDDEN" }, success: false });
  });

  it("protects cross-tenant observability with the shared observer allowlist", async () => {
    app = await buildMockedApp();
    app.db = createKbReadDbMock() as never;
    const token = app.jwt.sign({ roles: ["admin"], sessionId: "1", sessionVersion: 1, subUserId: "101", uid: 9001 });
    const response = await app.inject({ method: "GET", url: "/api/server/ai-hosting/user-memory/observability/summary", headers: { authorization: `Bearer ${token}` } });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: { code: "AGENT_USER_MEMORY_OBSERVABILITY_FORBIDDEN" }, success: false });

    const runsResponse = await app.inject({ method: "GET", url: "/api/server/ai-hosting/user-memory/observability/tenants/272/runs", headers: { authorization: `Bearer ${token}` } });
    expect(runsResponse.statusCode).toBe(403);
    expect(runsResponse.json()).toMatchObject({ error: { code: "AGENT_USER_MEMORY_OBSERVABILITY_FORBIDDEN" }, success: false });
  });

  it("exposes the observability tab capability to a configured observer", async () => {
    const previousSubjects = process.env.INSIGHTS_WORKER_OBSERVER_SUBJECTS;
    process.env.INSIGHTS_WORKER_OBSERVER_SUBJECTS = "9001:101";
    try {
      app = await buildMockedApp();
    } finally {
      if (previousSubjects === undefined) delete process.env.INSIGHTS_WORKER_OBSERVER_SUBJECTS;
      else process.env.INSIGHTS_WORKER_OBSERVER_SUBJECTS = previousSubjects;
    }
    app.db = createKbReadDbMock() as never;
    const token = app.jwt.sign({ roles: ["viewer"], sessionId: "1", sessionVersion: 1, subUserId: "101", uid: 9001 });
    const response = await app.inject({ method: "GET", url: "/api/server/ai-hosting/user-memory/overview", headers: { authorization: `Bearer ${token}` } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ data: { canViewWorkerObservability: true }, success: true });
  });

  it("authorizes customer detail through exact scoped lookup instead of paginated search", async () => {
    app = await buildMockedApp();
    app.db = createKbReadDbMock() as never;
    const getAccessibleCustomer = vi.fn().mockResolvedValue({
      avatar: "",
      bizStatus: 1,
      customerKey: "9001:5:external-target",
      gender: null,
      name: "目标客户",
      platform: 5,
      realName: "",
      relationCount: 0,
      seatRelations: [],
      thirdExternalUserId: "external-target",
      uid: 9001,
    });
    const getCustomers = vi.fn(() => {
      throw new Error("paginated customer search must not be used for authorization");
    });
    app.createWorkbenchService = () => ({ getAccessibleCustomer, getCustomers }) as never;
    const token = app.jwt.sign({ roles: ["viewer"], sessionId: "1", sessionVersion: 1, subUserId: "101", uid: 9001 });

    const response = await app.inject({
      method: "GET",
      url: "/api/server/ai-hosting/user-memory/customers/external-target",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(getAccessibleCustomer).toHaveBeenCalledWith("101", {
      scope: "mine",
      thirdExternalUserId: "external-target",
    });
    expect(getCustomers).not.toHaveBeenCalled();
  });

  it("allows an operator to maintain memory for an accessible customer", async () => {
    app = await buildMockedApp();
    const executeInsert = vi.fn().mockResolvedValue({});
    const query = {
      executeTakeFirst: vi.fn().mockResolvedValue(undefined),
      forUpdate: vi.fn(),
      selectAll: vi.fn(),
      where: vi.fn(),
    };
    query.forUpdate.mockReturnValue(query);
    query.selectAll.mockReturnValue(query);
    query.where.mockReturnValue(query);
    const insert = {
      execute: executeInsert,
      values: vi.fn(),
    };
    insert.values.mockReturnValue(insert);
    const trx = {
      insertInto: vi.fn().mockReturnValue(insert),
      selectFrom: vi.fn().mockReturnValue(query),
    };
    const db = createKbReadDbMock() as ReturnType<typeof createKbReadDbMock> & {
      transaction: () => {
        execute: (callback: (transaction: typeof trx) => unknown) => unknown;
      };
    };
    db.transaction = () => ({
      execute: (callback) => callback(trx),
    });
    app.db = db as never;
    const getAccessibleCustomer = vi.fn().mockResolvedValue({
      avatar: "",
      name: "目标客户",
      platform: 5,
      realName: "",
      thirdExternalUserId: "external-target",
    });
    app.createWorkbenchService = () => ({ getAccessibleCustomer }) as never;
    const token = app.jwt.sign({
      roles: ["operator"],
      sessionId: "1",
      sessionVersion: 1,
      subUserId: "101",
      uid: 9001,
    });

    const response = await app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: "POST",
      payload: {
        category: "preference",
        content: "优先下午联系",
        expectedVersion: 0,
        expiresAt: null,
      },
      url: "/api/server/ai-hosting/user-memory/customers/external-target/items",
    });

    expect(response.statusCode).toBe(200);
    expect(getAccessibleCustomer).toHaveBeenCalledWith("101", {
      scope: "mine",
      thirdExternalUserId: "external-target",
    });
    expect(executeInsert).toHaveBeenCalledTimes(1);
  });

  it("keeps viewer memory maintenance read-only", async () => {
    app = await buildMockedApp();
    app.db = createKbReadDbMock() as never;
    const getAccessibleCustomer = vi.fn();
    app.createWorkbenchService = () => ({ getAccessibleCustomer }) as never;
    const token = app.jwt.sign({
      roles: ["viewer"],
      sessionId: "1",
      sessionVersion: 1,
      subUserId: "101",
      uid: 9001,
    });

    const response = await app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: "POST",
      payload: {
        category: "preference",
        content: "优先下午联系",
        expectedVersion: 0,
        expiresAt: null,
      },
      url: "/api/server/ai-hosting/user-memory/customers/external-target/items",
    });

    expect(response.statusCode).toBe(403);
    expect(getAccessibleCustomer).not.toHaveBeenCalled();
  });
});
