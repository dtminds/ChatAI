import { describe, expect, it, vi } from "vitest";
import { reconcileWorkflowRuntime } from "../src/reconciler.js";

describe("workflow reconciler", () => {
  it("recovers task and outbox leases and advances workflow cancellation", async () => {
    const reconciler = {
      cancelUnavailableRuns: vi.fn(async () => ({ cancelled: 4, done: false, nextCursor: "88" })),
      recoverExpiredLeases: vi.fn(async () => 2),
      recoverExpiredOutboxLeases: vi.fn(async () => 3),
    };

    await expect(reconcileWorkflowRuntime({
      afterRunId: "50",
      limit: 100,
      now: new Date("2026-07-11T00:00:00.000Z"),
      reconciler,
    })).resolves.toEqual({
      cancelled: 4,
      nextCursor: "88",
      outboxLeasesRecovered: 3,
      taskLeasesRecovered: 2,
    });
  });
});
