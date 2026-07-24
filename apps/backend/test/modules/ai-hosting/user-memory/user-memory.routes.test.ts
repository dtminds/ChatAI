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
      url: "/api/server/ai-hosting/user-memory/customers/external-target?platform=5",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(getAccessibleCustomer).toHaveBeenCalledWith("101", {
      scope: "mine",
      thirdExternalUserId: "external-target",
    });
    expect(getCustomers).not.toHaveBeenCalled();
  });
});
