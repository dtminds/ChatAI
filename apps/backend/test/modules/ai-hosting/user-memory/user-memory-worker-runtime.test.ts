import { describe, expect, it } from "vitest";
import { parseUserMemoryWorkerRuntimeConfig } from "../../../../src/modules/ai-hosting/user-memory/user-memory-worker-runtime.js";

describe("user memory worker runtime config", () => {
  it("defaults to disabled synchronous Shanghai scheduling", () => {
    expect(parseUserMemoryWorkerRuntimeConfig({})).toEqual({ enabled: false, executionMode: "sync", schedule: "02:00", timezone: "Asia/Shanghai" });
  });
  it("rejects unimplemented Batch mode and schedule drift", () => {
    expect(() => parseUserMemoryWorkerRuntimeConfig({ AGENT_USER_MEMORY_EXECUTION_MODE: "volcengine_batch" })).toThrow(/must be sync/);
    expect(() => parseUserMemoryWorkerRuntimeConfig({ AGENT_USER_MEMORY_DAILY_TIME: "03:00" })).toThrow(/must be 02:00/);
  });
});
