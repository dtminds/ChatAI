import { describe, expect, it, vi } from "vitest";
import {
  createInsightsWorkerRuntime,
  parseInsightsWorkerRuntimeConfig,
} from "../../../src/modules/insights/insights-worker-runtime";

describe("insights worker runtime config", () => {
  it("defaults to a disabled standalone worker", () => {
    expect(parseInsightsWorkerRuntimeConfig({})).toEqual({
      batchSize: 200,
      discoveryBatchSize: 1_000,
      discoveryMaxBatchesPerTick: 20,
      enabled: false,
      intervalMs: 3_000,
      modelEnabled: false,
      traceUids: new Set(),
    });
  });

  it("parses worker switches and numeric limits from env", () => {
    expect(
      parseInsightsWorkerRuntimeConfig({
        INSIGHTS_WORKER_BATCH_SIZE: "500",
        INSIGHTS_WORKER_DISCOVERY_BATCH_SIZE: "2000",
        INSIGHTS_WORKER_DISCOVERY_MAX_BATCHES_PER_TICK: "12",
        INSIGHTS_WORKER_ENABLED: "true",
        INSIGHTS_WORKER_INTERVAL_MS: "10000",
        INSIGHTS_WORKER_MODEL_ENABLED: "true",
        INSIGHTS_WORKER_TRACE_UID_ALLOWLIST: "9001,9002",
        VOLCENGINE_ARK_LITE_MAX_TOKENS: "1024",
        VOLCENGINE_ARK_LITE_MODEL: "ep-lite",
      }),
    ).toEqual({
      batchSize: 500,
      discoveryBatchSize: 2_000,
      discoveryMaxBatchesPerTick: 12,
      enabled: true,
      intervalMs: 10_000,
      modelEnabled: true,
      traceUids: new Set([9001, 9002]),
    });
  });

  it("rejects invalid worker intervals and batch sizes", () => {
    expect(() =>
      parseInsightsWorkerRuntimeConfig({
        INSIGHTS_WORKER_BATCH_SIZE: "0",
      }),
    ).toThrow("INSIGHTS_WORKER_BATCH_SIZE must be a positive integer");

    expect(() =>
      parseInsightsWorkerRuntimeConfig({
        INSIGHTS_WORKER_INTERVAL_MS: "100",
      }),
    ).toThrow("INSIGHTS_WORKER_INTERVAL_MS must be at least 1000");

    expect(() =>
      parseInsightsWorkerRuntimeConfig({
        INSIGHTS_WORKER_DISCOVERY_MAX_BATCHES_PER_TICK: "0",
      }),
    ).toThrow(
      "INSIGHTS_WORKER_DISCOVERY_MAX_BATCHES_PER_TICK must be a positive integer",
    );

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
