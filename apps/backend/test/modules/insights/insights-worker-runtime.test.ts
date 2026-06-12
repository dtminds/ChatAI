import { describe, expect, it } from "vitest";
import {
  createInsightsWorkerRuntime,
  getInitialInsightWorkerCursor,
  parseInsightsWorkerRuntimeConfig,
} from "../../../src/modules/insights/insights-worker-runtime";

describe("insights worker runtime config", () => {
  it("defaults to a disabled standalone worker with a three-day cursor lookback", () => {
    expect(parseInsightsWorkerRuntimeConfig({})).toEqual({
      batchSize: 200,
      enabled: false,
      intervalMs: 3_000,
      modelEnabled: false,
      startLookbackDays: 3,
    });
  });

  it("parses worker switches and numeric limits from env", () => {
    expect(
      parseInsightsWorkerRuntimeConfig({
        INSIGHTS_WORKER_BATCH_SIZE: "500",
        INSIGHTS_WORKER_ENABLED: "true",
        INSIGHTS_WORKER_INTERVAL_MS: "10000",
        INSIGHTS_WORKER_MODEL_ENABLED: "true",
        INSIGHTS_WORKER_START_LOOKBACK_DAYS: "7",
        VOLCENGINE_ARK_LITE_MAX_TOKENS: "1024",
        VOLCENGINE_ARK_LITE_MODEL: "ep-lite",
      }),
    ).toEqual({
      batchSize: 500,
      enabled: true,
      intervalMs: 10_000,
      modelEnabled: true,
      startLookbackDays: 7,
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
  });

  it("creates an initial cursor from the configured lookback window", () => {
    expect(
      getInitialInsightWorkerCursor({
        now: new Date("2026-06-02T00:00:00.000Z"),
        startLookbackDays: 3,
      }),
    ).toEqual({
      cursorAuditId: 0,
      cursorMsgtime: Date.parse("2026-05-30T00:00:00.000Z"),
    });
  });

  it("does not start the standalone worker when disabled", () => {
    const runtime = createInsightsWorkerRuntime({
      db: {} as never,
      env: { INSIGHTS_WORKER_ENABLED: "false" },
      logger: {
        error() {},
        info() {},
      },
    });

    expect(runtime).toBeUndefined();
  });
});
