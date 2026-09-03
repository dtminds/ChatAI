import { describe, expect, it, vi } from "vitest";
import { startRoleLoop } from "../src/role-loop.js";

describe("workflow worker role loop", () => {
  it("does not overlap a slow invocation and stops through abort", async () => {
    vi.useFakeTimers();
    const releases: Array<() => void> = [];
    const run = vi.fn(() => new Promise<void>((resolve) => { releases.push(resolve); }));
    const loop = startRoleLoop({ intervalMs: 10, role: "scheduler", run });

    await vi.advanceTimersByTimeAsync(50);
    expect(run).toHaveBeenCalledTimes(1);

    releases.shift()?.();
    await vi.advanceTimersByTimeAsync(10);
    expect(run).toHaveBeenCalledTimes(2);

    const closing = loop.close();
    releases.shift()?.();
    await closing;
    await vi.advanceTimersByTimeAsync(100);
    expect(run).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("reports the iteration result and duration on heartbeat", async () => {
    vi.useFakeTimers();
    const onHeartbeat = vi.fn();
    const loop = startRoleLoop({
      intervalMs: 10_000,
      now: vi.fn()
        .mockReturnValueOnce(new Date("2026-07-11T00:00:00.000Z"))
        .mockReturnValueOnce(new Date("2026-07-11T00:00:00.025Z")),
      onHeartbeat,
      role: "outbox",
      run: vi.fn(async () => ({ claimed: 2, sent: 2 })),
    });

    await vi.waitFor(() => expect(onHeartbeat).toHaveBeenCalledOnce());
    expect(onHeartbeat).toHaveBeenCalledWith({
      completedAt: new Date("2026-07-11T00:00:00.025Z"),
      durationMs: 25,
      result: { claimed: 2, sent: 2 },
    });

    await loop.close();
    vi.useRealTimers();
  });
});
