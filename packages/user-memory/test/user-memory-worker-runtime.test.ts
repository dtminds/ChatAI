import { describe, expect, it } from "vitest";
import { parseUserMemoryWorkerRuntimeConfig } from "../src/user-memory-worker-runtime.js";

describe("user memory worker runtime config", () => {
  it("defaults to disabled", () => {
    expect(parseUserMemoryWorkerRuntimeConfig({})).toEqual({ enabled: false });
  });

  it("enables the worker explicitly", () => {
    expect(parseUserMemoryWorkerRuntimeConfig({
      AGENT_USER_MEMORY_WORKER_ENABLED: "true",
    })).toEqual({ enabled: true });
  });
});
