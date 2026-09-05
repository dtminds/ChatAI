import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";

it("resolves built package exports in Node without test aliases", () => {
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import assert from "node:assert/strict";
    for (const [name, factory] of [
      ["insights", "createInsightsWorkerRuntime"],
      ["user-memory", "createUserMemoryWorkerRuntime"],
    ]) {
      const root = await import("@chatai/" + name);
      const http = await import("@chatai/" + name + "/http");
      const worker = await import("@chatai/" + name + "/worker");
      assert.equal(factory in root, false);
      assert.equal(factory in http, false);
      assert.equal(typeof worker[factory], "function");
    }
    const http = await import("@chatai/insights/http");
    for (const name of ["InsightsWorkerObservability", "readCurrentAnalysisOutput", "parseWorkerFeatureConfigRow"]) {
      assert.equal(name in http, false);
    }
  `], { encoding: "utf8" });
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
});
