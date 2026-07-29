import { afterEach, describe, expect, it, vi } from "vitest";
import type { InsightsWorkerObservabilityRepository } from "../../../src/modules/insights/insights-worker-observability.repository";
import { InsightsWorkerObservabilityService } from "../../../src/modules/insights/insights-worker-observability.service";

const OBSERVED_AT = 1_784_800_000_000;

function createRepository(
  overrides: Record<string, unknown> = {},
): InsightsWorkerObservabilityRepository {
  return {
    getGlobalCursor: vi.fn(async () => ({
      cursorAuditId: 100,
      cursorMsgtime: OBSERVED_AT - 1_000,
      uid: 0,
      updateTime: OBSERVED_AT - 1_000,
    })),
    getGlobalSourceHeadAuditId: vi.fn(async () => 105),
    getObservedAt: vi.fn(async () => OBSERVED_AT),
    getUidSourceHead: vi.fn(async () => undefined),
    hasPendingMessages: vi.fn(async () => false),
    listFailedArchiveJobs: vi.fn(async () => []),
    listHotJobs: vi.fn(async () => []),
    listObservedUids: vi.fn(async () => []),
    listRecentAnalysisRuns: vi.fn(async () => []),
    listRecentErrorJobs: vi.fn(async () => []),
    listRecentRescans: vi.fn(async () => []),
    listRecentSessions: vi.fn(async () => []),
    listRuntimeStates: vi.fn(async () => []),
    listSessionAggregates: vi.fn(async () => []),
    listUidCursors: vi.fn(async () => []),
    ...overrides,
  } as unknown as InsightsWorkerObservabilityRepository;
}

describe("insights worker observability service", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps old pending work queued and filters before pagination", async () => {
    const repository = createRepository({
      listHotJobs: vi.fn(async () => [
        {
          analysisScope: "all",
          attempt: 1,
          jobId: "11",
          jobType: "sessionize_uid",
          maxAttempts: 2,
          runAfter: OBSERVED_AT - 10 * 60_000,
          status: "pending",
          targetId: "9001",
          uid: 9001,
          updateTime: OBSERVED_AT - 10 * 60_000,
        },
        {
          analysisScope: "all",
          attempt: 1,
          jobId: "12",
          jobType: "analyze_session",
          maxAttempts: 2,
          runAfter: OBSERVED_AT - 10 * 60_000,
          status: "pending",
          targetId: "501",
          uid: 9001,
          updateTime: OBSERVED_AT - 10 * 60_000,
        },
        {
          analysisScope: "all",
          attempt: 1,
          jobId: "13",
          jobType: "sessionize_uid",
          leaseUntil: OBSERVED_AT - 1,
          maxAttempts: 2,
          runAfter: OBSERVED_AT - 1_000,
          status: "running",
          targetId: "9002",
          uid: 9002,
          updateTime: OBSERVED_AT - 1_000,
        },
      ]),
      listObservedUids: vi.fn(async () => [9001, 9002]),
    });
    const service = new InsightsWorkerObservabilityService(repository);

    const result = await service.listUids({
      page: 1,
      pageSize: 1,
      state: "queued",
    });

    expect(result).toMatchObject({
      items: [{
        analysis: {
          queueAgeMs: 10 * 60_000,
          state: "queued",
        },
        overallState: "queued",
        sessionization: {
          queueAgeMs: 10 * 60_000,
          state: "queued",
        },
        uid: 9001,
      }],
      page: 1,
      pageSize: 1,
      total: 1,
      totalPages: 1,
    });
  });

  it("derives heartbeat health only from the database observed time", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2099-01-01T00:00:00.000Z"));
    const repository = createRepository({
      listRuntimeStates: vi.fn(async () => [{
        lastStartedAt: OBSERVED_AT - 200,
        lastSuccessAt: OBSERVED_AT - 100,
        pipeline: "discovery",
        reportedAt: OBSERVED_AT - 50,
        reportedBy: "worker-a:1",
      }]),
    });
    const service = new InsightsWorkerObservabilityService(repository);

    const result = await service.getSummary();

    expect(result.pipelines).toContainEqual(expect.objectContaining({
      activity: "idle",
      health: "healthy",
      pipeline: "discovery",
    }));
    expect(result.discovery).toEqual({
      auditIdGap: 5,
      cursorAuditId: 100,
      hasBacklog: true,
      sourceHeadAuditId: 105,
    });
  });

  it("treats possibly stalled as a weak aggregate activity signal", async () => {
    const repository = createRepository({
      listRuntimeStates: vi.fn(async () => [{
        lastStartedAt: OBSERVED_AT - 16 * 60_000,
        lastSuccessAt: OBSERVED_AT - 20 * 60_000,
        pipeline: "analysis",
        reportedAt: OBSERVED_AT - 1_000,
        reportedBy: "worker-b:2",
      }]),
    });
    const service = new InsightsWorkerObservabilityService(repository);

    const result = await service.getSummary();

    expect(result.pipelines).toContainEqual(expect.objectContaining({
      activity: "possibly_stalled",
      health: "degraded",
      pipeline: "analysis",
      runningDurationMs: 16 * 60_000,
    }));
  });

  it("does not expose successful skip classifications as recent errors", async () => {
    const repository = createRepository({
      listHotJobs: vi.fn(async () => [{
        analysisScope: "all",
        attempt: 0,
        errorCode: "INSIGHT_DISABLED",
        jobId: "21",
        jobType: "analyze_session",
        maxAttempts: 2,
        runAfter: OBSERVED_AT - 1_000,
        status: "succeeded",
        targetId: "501",
        uid: 9001,
        updateTime: OBSERVED_AT - 500,
      }]),
      listObservedUids: vi.fn(async () => [9001]),
    });
    const service = new InsightsWorkerObservabilityService(repository);

    const result = await service.listUids({});

    expect(result.items[0]).toMatchObject({
      analysis: {
        failedLast24h: 0,
        state: "idle",
      },
      overallState: "idle",
      uid: 9001,
    });
    expect(result.items[0]).not.toHaveProperty("recentError");
  });
});
