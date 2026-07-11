import { request } from "node:http";
import { describe, expect, it } from "vitest";
import { startWorkflowHealthServer } from "../src/health.js";

describe("workflow worker health server", () => {
  it("separates liveness from dependency readiness", async () => {
    let databaseReady = false;
    const health = await startWorkflowHealthServer({
      getReadiness: () => ({ broker: true, database: databaseReady, roles: { entry: true } }),
      port: 0,
    });
    const address = health.server.address();
    if (!address || typeof address === "string") throw new Error("health server address unavailable");

    await expect(get(address.port, "/healthz")).resolves.toMatchObject({ statusCode: 200 });
    await expect(get(address.port, "/readyz")).resolves.toMatchObject({ statusCode: 503 });
    databaseReady = true;
    await expect(get(address.port, "/readyz")).resolves.toMatchObject({ statusCode: 200 });
    await health.close();
  });
});

function get(port: number, path: string) {
  return new Promise<{ body: string; statusCode: number | undefined }>((resolve, reject) => {
    const outgoing = request({ method: "GET", path, port }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", chunk => chunks.push(Buffer.from(chunk)));
      response.on("end", () => resolve({
        body: Buffer.concat(chunks).toString("utf8"),
        statusCode: response.statusCode,
      }));
    });
    outgoing.on("error", reject);
    outgoing.end();
  });
}
