import { describe, expect, it, vi } from "vitest";
import { processWorkflowConversationDirectiveDisableBatch } from "../src/conversation-directive-worker.js";

const now = new Date("2026-08-30T08:00:00.000Z");

describe("processWorkflowConversationDirectiveDisableBatch", () => {
  it("completes a claimed disable only after Java accepts it", async () => {
    const disable = vi.fn().mockResolvedValue(undefined);
    const complete = vi.fn().mockResolvedValue(true);
    const claim = vi.fn().mockResolvedValue([directiveState({ disableReason: "completed" })]);
    const retry = vi.fn();

    const result = await processWorkflowConversationDirectiveDisableBatch({
      leaseDurationMs: 30_000,
      leaseOwner: "directive-worker-1",
      limit: 25,
      maxRetryDelayMs: 60_000,
      now: () => now,
      port: { disable } as never,
      repository: {
        claimAiCollectDirectiveDisableBatch: claim,
        completeAiCollectDirectiveDisable: complete,
        retryAiCollectDirectiveDisable: retry,
      } as never,
      retryDelayMs: 1_000,
      timeoutMs: 5_000,
    });

    expect(claim).toHaveBeenCalledWith({
      leaseExpiresAt: new Date("2026-08-30T08:00:30.000Z"),
      leaseOwner: "directive-worker-1",
      limit: 25,
      now,
    });
    expect(disable).toHaveBeenCalledWith(expect.objectContaining({
      bizId: "9:31:1",
      reason: "completed",
      type: "collect-fields",
      uid: 9,
    }));
    expect(complete).toHaveBeenCalledWith({
      leaseOwner: "directive-worker-1",
      now,
      taskId: "task-1",
      uid: 9,
    });
    expect(retry).not.toHaveBeenCalled();
    expect(result).toEqual({ claimed: 1, disabled: 1, retried: 0 });
  });

  it("releases a failed disable for capped exponential retry under the same lease owner", async () => {
    const disable = vi.fn().mockRejectedValue(new Error("Java unavailable"));
    const complete = vi.fn();
    const retry = vi.fn().mockResolvedValue(true);
    const claim = vi.fn().mockResolvedValue([directiveState({ directiveAttempt: 5 })]);

    const result = await processWorkflowConversationDirectiveDisableBatch({
      leaseDurationMs: 30_000,
      leaseOwner: "directive-worker-1",
      limit: 25,
      maxRetryDelayMs: 5_000,
      now: () => now,
      port: { disable } as never,
      repository: {
        claimAiCollectDirectiveDisableBatch: claim,
        completeAiCollectDirectiveDisable: complete,
        retryAiCollectDirectiveDisable: retry,
      } as never,
      retryDelayMs: 1_000,
      timeoutMs: 5_000,
    });

    expect(complete).not.toHaveBeenCalled();
    expect(retry).toHaveBeenCalledWith({
      leaseOwner: "directive-worker-1",
      nextAttemptAt: new Date("2026-08-30T08:00:05.000Z"),
      now,
      taskId: "task-1",
      uid: 9,
    });
    expect(result).toEqual({ claimed: 1, disabled: 0, retried: 1 });
  });
});

function directiveState(overrides: Record<string, unknown> = {}) {
  return {
    bizId: "9:31:1",
    directiveAttempt: 1,
    disableReason: null,
    taskId: "task-1",
    uid: 9,
    ...overrides,
  };
}
