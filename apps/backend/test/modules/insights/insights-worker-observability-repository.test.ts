import { describe, expect, it, vi } from "vitest";
import { InsightsWorkerObservabilityRepository } from "../../../src/modules/insights/insights-worker-observability.repository";

const FAILED_SINCE = Date.parse("2026-07-22T04:00:00.000Z");

describe("insights worker observability repository", () => {
  it("reads only safe hot-job fields and maps dates for state derivation", async () => {
    const builder = createBuilder([{
      analysis_scope: "all",
      attempt_count: 1,
      error_code: "LEASE_EXPIRED",
      id: 12,
      job_type: "analyze_session",
      lease_until: new Date("2026-07-23T04:00:00.000Z"),
      max_attempts: 2,
      run_after: new Date("2026-07-23T03:00:00.000Z"),
      status: "running",
      target_id: "501",
      uid: 9001,
      update_time: new Date("2026-07-23T03:30:00.000Z"),
    }]);
    const db = {
      selectFrom: vi.fn(() => builder),
    };
    const repository = new InsightsWorkerObservabilityRepository(db as never);

    await expect(repository.listHotJobs(FAILED_SINCE)).resolves.toEqual([
      expect.objectContaining({
        errorCode: "LEASE_EXPIRED",
        jobId: "12",
        leaseUntil: Date.parse("2026-07-23T04:00:00.000Z"),
        uid: 9001,
      }),
    ]);

    const selected = builder.select.mock.calls.flatMap(([fields]) =>
      Array.isArray(fields) ? fields : [fields]
    );
    expect(selected).not.toContain("error_message");
    expect(selected).not.toContain("locked_by");
    expect(selected).not.toContain("idempotency_key");
  });

  it("uses the existing UID sync ordering for exact source-head probes", async () => {
    const builder = createBuilder([{
      id: 101,
      msgtime: 1_784_800_000_000,
    }]);
    const db = {
      selectFrom: vi.fn(() => builder),
    };
    const repository = new InsightsWorkerObservabilityRepository(db as never);

    await expect(repository.getUidSourceHead(9001)).resolves.toEqual({
      auditId: 101,
      msgtime: 1_784_800_000_000,
    });
    expect(builder.where).toHaveBeenCalledWith("uid", "=", 9001);
    expect(builder.orderBy.mock.calls).toEqual([
      ["msgtime", "desc"],
      ["id", "desc"],
    ]);
    expect(builder.limit).toHaveBeenCalledWith(1);
  });

  it("limits session aggregates to open sessions before grouping", async () => {
    const builder = createBuilder([{
      earliest_next_close_at: 1_784_800_000_000,
      open_count: 2,
      overdue_count: 1,
      uid: 9001,
    }]);
    const db = {
      selectFrom: vi.fn(() => builder),
    };
    const repository = new InsightsWorkerObservabilityRepository(db as never);

    await expect(
      repository.listSessionAggregates(1_784_800_100_000),
    ).resolves.toEqual([{
      earliestNextCloseAt: 1_784_800_000_000,
      open: 2,
      overdue: 1,
      uid: 9001,
    }]);
    expect(builder.where).toHaveBeenCalledWith("status", "=", "open");
  });

  it("excludes successful classification codes from recent errors", async () => {
    const builder = createBuilder([{
      analysis_scope: "all",
      attempt_count: 2,
      error_code: "ANALYSIS_FAILED",
      id: 12,
      job_type: "analyze_session",
      lease_until: null,
      max_attempts: 2,
      run_after: new Date("2026-07-23T03:00:00.000Z"),
      status: "failed",
      target_id: "501",
      uid: 9001,
      update_time: new Date("2026-07-23T03:30:00.000Z"),
    }]);
    const db = {
      selectFrom: vi.fn(() => builder),
    };
    const repository = new InsightsWorkerObservabilityRepository(db as never);

    await repository.listRecentErrorJobs(9001, 20);

    expect(
      builder.where.mock.calls.filter(
        ([column, operator, value]) =>
          column === "status" && operator === "!=" && value === "succeeded",
      ),
    ).toHaveLength(2);
  });
});

function createBuilder(rows: unknown[]) {
  const builder = {
    execute: vi.fn(async () => rows),
    executeTakeFirst: vi.fn(async () => rows[0]),
    groupBy: vi.fn(),
    limit: vi.fn(),
    orderBy: vi.fn(),
    select: vi.fn(),
    where: vi.fn(),
  };
  builder.groupBy.mockReturnValue(builder);
  builder.limit.mockReturnValue(builder);
  builder.orderBy.mockReturnValue(builder);
  builder.select.mockReturnValue(builder);
  builder.where.mockReturnValue(builder);

  return builder;
}
