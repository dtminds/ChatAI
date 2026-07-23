import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getWorkerErrorCode,
  InsightsWorkerObservability,
  safeErrorPayload,
} from "../../../src/modules/insights/insights-worker-observability";
import { ServiceUnavailableError } from "../../../src/shared/errors";

function createHarness(input: {
  now?: () => number;
  traceUids?: ReadonlySet<number>;
} = {}) {
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  };
  const repository = {
    upsertWorkerPipelineRuntimeState: vi.fn(async () => undefined),
  };
  const observability = new InsightsWorkerObservability({
    flushIntervalMs: 60_000,
    logger,
    now: input.now,
    reportedBy: "worker-a:1",
    repository,
    traceUids: input.traceUids ?? new Set(),
  });

  return { logger, observability, repository };
}

describe("insights worker observability", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("writes all pipeline heartbeats at startup and emits one summary per pipeline", async () => {
    vi.useFakeTimers();
    const { logger, observability, repository } = createHarness();

    observability.start();
    for (let index = 0; index < 4; index += 1) {
      await Promise.resolve();
    }

    expect(repository.upsertWorkerPipelineRuntimeState).toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(60_000);

    const summaries = logger.info.mock.calls.filter(
      ([payload]) => payload.eventCode === "insights_worker.pipeline_summary",
    );
    expect(summaries).toHaveLength(3);
    expect(summaries.map(([payload]) => payload.pipeline)).toEqual([
      "discovery",
      "sessionization",
      "analysis",
    ]);
    expect(summaries[0]?.[0]).toMatchObject({
      discoveredMessages: 0,
      discoveredUids: 0,
      emptyBatches: 0,
      lockSkipped: 0,
    });
    expect(summaries[1]?.[0]).toMatchObject({
      jobsClaimed: 0,
      scannedMessages: 0,
      sessionizedMessages: 0,
    });
    expect(summaries[2]?.[0]).toMatchObject({
      jobsClaimed: 0,
      modelRequests: 0,
      snapshotsPublished: 0,
    });

    await observability.stop();
  });

  it("throttles repeated errors and reports recovery only after matching success", () => {
    let now = 1_000;
    const { logger, observability } = createHarness({ now: () => now });
    const input = {
      errorCode: "DB_UNAVAILABLE",
      eventCode: "insights_worker.pipeline_tick_failed",
      level: "warn" as const,
      message: "failed",
      pipeline: "discovery" as const,
      throttleKey: "pipeline:discovery",
    };

    observability.event(input);
    now += 1_000;
    observability.event(input);

    expect(logger.warn).toHaveBeenCalledTimes(1);

    observability.recover("pipeline:discovery", "discovery");

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCode: "insights_worker.pipeline_recovered",
        pipeline: "discovery",
      }),
      expect.any(String),
    );

    observability.event(input);
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });

  it("promotes ordinary diagnostic events to info only for trace UIDs", () => {
    const { logger, observability } = createHarness({
      traceUids: new Set([9001]),
    });

    observability.event({
      eventCode: "insights_worker.sessionization_uid_completed",
      level: "debug",
      message: "completed",
      pipeline: "sessionization",
      uid: 9001,
    });
    observability.event({
      eventCode: "insights_worker.sessionization_uid_completed",
      level: "debug",
      message: "completed",
      pipeline: "sessionization",
      uid: 9002,
    });

    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.debug).toHaveBeenCalledTimes(1);
  });

  it("uses stable application error metadata without exposing error details", () => {
    const error = new ServiceUnavailableError(
      "MODEL_PROVIDER_UNAVAILABLE",
      "provider body with customer content",
      { responseBody: "sensitive" },
    );

    expect(getWorkerErrorCode(error)).toBe("MODEL_PROVIDER_UNAVAILABLE");
    expect(safeErrorPayload(error)).toEqual({
      errorName: "Error",
      httpStatus: 503,
    });
    expect(JSON.stringify(safeErrorPayload(error))).not.toContain("sensitive");
  });
});
