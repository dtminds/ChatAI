import { afterEach, describe, expect, it } from "vitest";
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
});
