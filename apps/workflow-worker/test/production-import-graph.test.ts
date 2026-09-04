import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const verifier = fileURLToPath(new URL("../scripts/verify-production-import-graph.mjs", import.meta.url));

describe("Workflow Worker production import graph", () => {
  it("accepts the production entry graph", () => {
    const result = spawnSync(process.execPath, [verifier], { encoding: "utf8" });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });

  it("rejects a transitive import from test support", () => {
    const result = spawnSync(process.execPath, [
      verifier,
      "--entry",
      "test/fixtures/production-import-graph-entry.ts",
    ], { encoding: "utf8" });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("test/support/fake-workflow-broker.ts");
  });
});
