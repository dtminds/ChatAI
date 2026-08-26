import { describe, expect, it, vi } from "vitest";
import {
  createInsightsWorkerRuntime,
  parseInsightsWorkerRuntimeConfig,
} from "../src/insights-worker-runtime";

describe("insights worker runtime config", () => {
  it("defaults to a disabled standalone worker", () => {
    expect(parseInsightsWorkerRuntimeConfig({})).toEqual({
      enabled: false,
      modelEnabled: false,
      traceUids: new Set(),
    });
  });

  it("parses worker switches and trace targets from env", () => {
    expect(
      parseInsightsWorkerRuntimeConfig({
        INSIGHTS_WORKER_ENABLED: "true",
        INSIGHTS_WORKER_MODEL_ENABLED: "true",
        INSIGHTS_WORKER_TRACE_UID_ALLOWLIST: "9001,9002",
      }),
    ).toEqual({
      enabled: true,
      modelEnabled: true,
      traceUids: new Set([9001, 9002]),
    });
  });

  it("rejects invalid trace targets", () => {
    expect(() =>
      parseInsightsWorkerRuntimeConfig({
        INSIGHTS_WORKER_TRACE_UID_ALLOWLIST: "9001,invalid",
      }),
    ).toThrow("INSIGHTS_WORKER_TRACE_UID_ALLOWLIST");
  });

  it("does not start the standalone worker when disabled", () => {
    const logger = {
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    };
    const runtime = createInsightsWorkerRuntime({
      db: {} as never,
      env: { INSIGHTS_WORKER_ENABLED: "false" },
      logger,
    });

    expect(runtime).toBeUndefined();
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCode: "insights_worker.disabled",
      }),
      expect.any(String),
    );
  });
});
