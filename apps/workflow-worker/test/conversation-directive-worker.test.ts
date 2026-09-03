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
      concurrency: 8,
      timeoutMs: 5_000,
    });

    expect(claim).toHaveBeenCalledWith({
      leaseExpiresAt: new Date("2026-08-30T08:00:30.000Z"),
      leaseOwner: "directive-worker-1",
      limit: 8,
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
      concurrency: 8,
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

  it("limits concurrent directive disables across a claimed batch", async () => {
    const releases: Array<() => void> = [];
    let active = 0;
    let maximumActive = 0;
    const disable = vi.fn(async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise<void>(resolve => releases.push(resolve));
      active -= 1;
    });
    const claim = vi.fn()
      .mockResolvedValueOnce([
        directiveState({ bizId: "9:31:1", taskId: "task-1" }),
        directiveState({ bizId: "9:31:2", taskId: "task-2" }),
      ])
      .mockResolvedValueOnce([]);
    const complete = vi.fn().mockResolvedValue(true);
    const run = processWorkflowConversationDirectiveDisableBatch({
      leaseDurationMs: 30_000,
      leaseOwner: "directive-worker-1",
      limit: 25,
      maxRetryDelayMs: 60_000,
      now: () => now,
      port: { disable } as never,
      repository: {
        claimAiCollectDirectiveDisableBatch: claim,
        completeAiCollectDirectiveDisable: complete,
        retryAiCollectDirectiveDisable: vi.fn(),
      } as never,
      retryDelayMs: 1_000,
      concurrency: 2,
      timeoutMs: 5_000,
    });

    await vi.waitFor(() => expect(disable).toHaveBeenCalledTimes(2));
    expect(claim).toHaveBeenCalledWith({
      leaseExpiresAt: new Date("2026-08-30T08:00:30.000Z"),
      leaseOwner: "directive-worker-1",
      limit: 2,
      now,
    });
    expect(maximumActive).toBe(2);

    releases.splice(0).forEach(release => release());

    await expect(run).resolves.toEqual({ claimed: 2, disabled: 2, retried: 0 });
    expect(maximumActive).toBe(2);
  });

  it("leaves later windows for the next invocation", async () => {
    const disable = vi.fn(async () => {
      return undefined;
    });
    const firstWindow = [
      directiveState({ bizId: "9:31:1", taskId: "task-1" }),
      directiveState({ bizId: "9:31:2", taskId: "task-2" }),
    ];
    const secondWindow = [
      directiveState({ bizId: "9:31:3", taskId: "task-3" }),
      directiveState({ bizId: "9:31:4", taskId: "task-4" }),
    ];
    const claim = vi.fn()
      .mockResolvedValueOnce(firstWindow)
      .mockResolvedValueOnce(secondWindow);
    const complete = vi.fn().mockResolvedValue(true);
    const run = processWorkflowConversationDirectiveDisableBatch({
      leaseDurationMs: 30_000,
      leaseOwner: "directive-worker-1",
      limit: 4,
      maxRetryDelayMs: 60_000,
      now: () => now,
      port: { disable } as never,
      repository: {
        claimAiCollectDirectiveDisableBatch: claim,
        completeAiCollectDirectiveDisable: complete,
        retryAiCollectDirectiveDisable: vi.fn(),
      } as never,
      retryDelayMs: 1_000,
      concurrency: 2,
      timeoutMs: 5_000,
    });

    await expect(run).resolves.toEqual({ claimed: 2, disabled: 2, retried: 0 });
    expect(claim).toHaveBeenNthCalledWith(1, expect.objectContaining({ limit: 2 }));
    expect(claim).toHaveBeenCalledTimes(1);

    const nextRun = processWorkflowConversationDirectiveDisableBatch({
      leaseDurationMs: 30_000,
      leaseOwner: "directive-worker-1",
      limit: 4,
      maxRetryDelayMs: 60_000,
      now: () => now,
      port: { disable } as never,
      repository: {
        claimAiCollectDirectiveDisableBatch: claim,
        completeAiCollectDirectiveDisable: complete,
        retryAiCollectDirectiveDisable: vi.fn(),
      } as never,
      retryDelayMs: 1_000,
      concurrency: 2,
      timeoutMs: 5_000,
    });

    await expect(nextRun).resolves.toEqual({ claimed: 2, disabled: 2, retried: 0 });
    expect(claim).toHaveBeenNthCalledWith(2, expect.objectContaining({ limit: 2 }));
    expect(claim).toHaveBeenCalledTimes(2);
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
