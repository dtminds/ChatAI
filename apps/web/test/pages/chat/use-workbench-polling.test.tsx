import { act, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  WORKBENCH_MAX_BACKGROUND_ELAPSED_MS,
  WORKBENCH_MAX_SYNC_GAP_MS,
  WORKBENCH_POLL_HIDDEN_INTERVAL_MS,
  WORKBENCH_SEAT_SUMMARY_REFRESH_INTERVAL_MS,
  useWorkbenchPolling,
} from "@/pages/chat/hooks/use-workbench-polling";

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return {
    promise,
    resolve,
  };
}

function PollingHarness({
  activeAccountId = "acct-001",
  currentUserId = "sub-user-001",
  intervalMs = 3000,
  jitterMs = 0,
  onPollingPaused,
  refreshSeatSummaries,
  pollWorkbench,
}: {
  activeAccountId?: string;
  currentUserId?: string;
  intervalMs?: number;
  jitterMs?: number;
  onPollingPaused?: (reason: "sync-gap" | "background-timeout" | "other-tab") => void;
  refreshSeatSummaries?: () => Promise<void>;
  pollWorkbench: () => Promise<boolean | void>;
}) {
  useWorkbenchPolling({
    activeAccountId,
    bootstrapStatus: "ready",
    currentUserId,
    intervalMs,
    jitterMs,
    onPollingPaused,
    refreshSeatSummaries,
    pollWorkbench,
  });

  return null;
}

function PausingPollingHarness({
  pollWorkbench,
}: {
  pollWorkbench: () => Promise<boolean | void>;
}) {
  const [isPaused, setIsPaused] = useState(false);

  useWorkbenchPolling({
    activeAccountId: "acct-001",
    bootstrapStatus: "ready",
    currentUserId: "sub-user-001",
    intervalMs: 3000,
    jitterMs: 0,
    onPollingPaused: () => {
      setIsPaused(true);
    },
    pollWorkbench,
  });

  return <div>{isPaused ? "paused" : "running"}</div>;
}

function setVisibilityState(visibilityState: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: visibilityState,
  });
}

describe("useWorkbenchPolling", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    setVisibilityState("visible");
    Object.defineProperty(document, "hasFocus", {
      configurable: true,
      value: vi.fn(() => true),
    });
    window.localStorage.clear();
  });

  it("keeps hidden tabs polling unless successful syncs stop for 30 minutes", () => {
    expect(WORKBENCH_MAX_SYNC_GAP_MS).toBe(30 * 60 * 1000);
  });

  it("pauses hidden tabs after 4 hours in the background even when sync succeeds", () => {
    expect(WORKBENCH_MAX_BACKGROUND_ELAPSED_MS).toBe(4 * 60 * 60 * 1000);
  });

  it("polls immediately when the visible workbench becomes ready", async () => {
    vi.useFakeTimers();
    setVisibilityState("visible");
    const pollWorkbench = vi.fn().mockResolvedValue(undefined);

    render(<PollingHarness pollWorkbench={pollWorkbench} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(pollWorkbench).toHaveBeenCalledTimes(1);
  });

  it("restores the normal poll cadence when the document becomes visible again", async () => {
    vi.useFakeTimers();
    setVisibilityState("hidden");
    const pollWorkbench = vi.fn().mockResolvedValue(undefined);

    render(<PollingHarness pollWorkbench={pollWorkbench} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(WORKBENCH_POLL_HIDDEN_INTERVAL_MS - 1);
    });
    expect(pollWorkbench).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(pollWorkbench).toHaveBeenCalledTimes(1);

    setVisibilityState("visible");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(pollWorkbench).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(pollWorkbench).toHaveBeenCalledTimes(3);
  });

  it("uses the slower hidden poll cadence without pausing after 30 minutes when polls succeed", async () => {
    vi.useFakeTimers();
    setVisibilityState("hidden");
    const pollWorkbench = vi.fn().mockResolvedValue(undefined);
    const onPollingPaused = vi.fn();

    render(
      <PollingHarness
        onPollingPaused={onPollingPaused}
        pollWorkbench={pollWorkbench}
      />,
    );
    pollWorkbench.mockClear();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(WORKBENCH_MAX_SYNC_GAP_MS + 1);
    });

    expect(pollWorkbench.mock.calls.length).toBeGreaterThan(1);
    expect(onPollingPaused).not.toHaveBeenCalled();
  });

  it("deduplicates immediate polls when visibility changes rapidly", async () => {
    vi.useFakeTimers();
    setVisibilityState("visible");
    const pollGate = createDeferred();
    const pollWorkbench = vi.fn(() => pollGate.promise);

    render(<PollingHarness pollWorkbench={pollWorkbench} />);

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(pollWorkbench).toHaveBeenCalledTimes(1);

    await act(async () => {
      pollGate.resolve();
      await pollGate.promise;
    });
  });

  it("stops polling when another workbench tab claims the polling lease", async () => {
    vi.useFakeTimers();
    const pollWorkbench = vi.fn().mockResolvedValue(undefined);
    const onPollingPaused = vi.fn();

    render(
      <PollingHarness
        onPollingPaused={onPollingPaused}
        pollWorkbench={pollWorkbench}
      />,
    );
    pollWorkbench.mockClear();

    await act(async () => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "chatai.workbench.pollOwner",
          newValue: JSON.stringify({
            ownerTabId: "newer-tab",
            ownerUserId: "sub-user-001",
            expiresAt: Date.now() + 15000,
            updatedAt: Date.now(),
          }),
        }),
      );
    });

    expect(onPollingPaused).toHaveBeenCalledWith("other-tab");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(pollWorkbench).not.toHaveBeenCalled();
  });

  it("does not restart polling after the paused state rerenders the owner hook", async () => {
    vi.useFakeTimers();
    const pollWorkbench = vi.fn().mockResolvedValue(undefined);

    render(<PausingPollingHarness pollWorkbench={pollWorkbench} />);
    pollWorkbench.mockClear();

    await act(async () => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "chatai.workbench.pollOwner",
          newValue: JSON.stringify({
            ownerTabId: "newer-tab",
            ownerUserId: "sub-user-001",
            expiresAt: Date.now() + 15000,
            updatedAt: Date.now(),
          }),
        }),
      );
    });

    expect(screen.getByText("paused")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(pollWorkbench).not.toHaveBeenCalled();
  });

  it("pauses on lease renewal if this tab missed the storage ownership event", async () => {
    vi.useFakeTimers();
    const pollWorkbench = vi.fn().mockResolvedValue(undefined);
    const onPollingPaused = vi.fn();

    render(
      <PollingHarness
        onPollingPaused={onPollingPaused}
        pollWorkbench={pollWorkbench}
      />,
    );
    pollWorkbench.mockClear();

    window.localStorage.setItem(
      "chatai.workbench.pollOwner",
      JSON.stringify({
        ownerTabId: "newer-tab",
        ownerUserId: "sub-user-001",
        expiresAt: Date.now() + 15000,
        updatedAt: Date.now(),
      }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(onPollingPaused).toHaveBeenCalledWith("other-tab");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(pollWorkbench).not.toHaveBeenCalled();
  });

  it("reclaims a stale same-tab polling lease when returning to chat", async () => {
    vi.useFakeTimers();
    const firstPollWorkbench = vi.fn().mockResolvedValue(undefined);
    const secondPollWorkbench = vi.fn().mockResolvedValue(undefined);
    const onPollingPaused = vi.fn();

    const { unmount } = render(
      <PollingHarness pollWorkbench={firstPollWorkbench} />,
    );

    expect(window.localStorage.getItem("chatai.workbench.pollOwner")).not.toBeNull();

    unmount();

    render(
      <PollingHarness
        onPollingPaused={onPollingPaused}
        pollWorkbench={secondPollWorkbench}
      />,
    );
    secondPollWorkbench.mockClear();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(onPollingPaused).not.toHaveBeenCalled();
    expect(secondPollWorkbench).toHaveBeenCalledTimes(1);
  });

  it("does not pause immediately when the tab becomes hidden", async () => {
    vi.useFakeTimers();
    setVisibilityState("visible");
    const pollWorkbench = vi.fn().mockResolvedValue(undefined);
    const onPollingPaused = vi.fn();

    render(
      <PollingHarness
        onPollingPaused={onPollingPaused}
        pollWorkbench={pollWorkbench}
      />,
    );
    pollWorkbench.mockClear();

    setVisibilityState("hidden");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(onPollingPaused).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(WORKBENCH_POLL_HIDDEN_INTERVAL_MS);
    });

    expect(pollWorkbench).toHaveBeenCalledTimes(1);
  });

  it("pauses when successful syncs stop for 30 minutes", async () => {
    vi.useFakeTimers();
    setVisibilityState("hidden");
    const pollWorkbench = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockImplementation(() => new Promise<void>(() => {}));
    const onPollingPaused = vi.fn();

    render(
      <PollingHarness
        onPollingPaused={onPollingPaused}
        pollWorkbench={pollWorkbench}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(WORKBENCH_POLL_HIDDEN_INTERVAL_MS);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(WORKBENCH_POLL_HIDDEN_INTERVAL_MS);
    });

    expect(pollWorkbench).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(WORKBENCH_MAX_SYNC_GAP_MS - 1);
    });

    expect(onPollingPaused).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2);
    });

    expect(onPollingPaused).toHaveBeenCalledWith("sync-gap");

    const callCountAfterPause = pollWorkbench.mock.calls.length;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });

    expect(pollWorkbench).toHaveBeenCalledTimes(callCountAfterPause);
  });

  it("does not refresh the sync gap timer when poll reports failure", async () => {
    vi.useFakeTimers();
    setVisibilityState("hidden");
    const pollWorkbench = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValue(false);
    const onPollingPaused = vi.fn();

    render(
      <PollingHarness
        onPollingPaused={onPollingPaused}
        pollWorkbench={pollWorkbench}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(WORKBENCH_POLL_HIDDEN_INTERVAL_MS);
      await vi.advanceTimersByTimeAsync(WORKBENCH_POLL_HIDDEN_INTERVAL_MS);
    });

    expect(pollWorkbench).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(
        WORKBENCH_MAX_SYNC_GAP_MS - WORKBENCH_POLL_HIDDEN_INTERVAL_MS - 1,
      );
    });

    expect(onPollingPaused).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2);
    });

    expect(onPollingPaused).toHaveBeenCalledWith("sync-gap");
  });

  it("reschedules the sync gap timer if it fires before the threshold", async () => {
    vi.useFakeTimers();
    setVisibilityState("visible");
    const pollWorkbench = vi.fn().mockResolvedValue(false);
    const onPollingPaused = vi.fn();
    const startedAt = Date.now();
    const nowSpy = vi.spyOn(Date, "now");

    render(
      <PollingHarness
        intervalMs={WORKBENCH_MAX_SYNC_GAP_MS * 2}
        onPollingPaused={onPollingPaused}
        pollWorkbench={pollWorkbench}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    nowSpy.mockReturnValue(startedAt + WORKBENCH_MAX_SYNC_GAP_MS - 1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(WORKBENCH_MAX_SYNC_GAP_MS);
    });

    expect(onPollingPaused).not.toHaveBeenCalled();

    nowSpy.mockReturnValue(startedAt + WORKBENCH_MAX_SYNC_GAP_MS);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(onPollingPaused).toHaveBeenCalledWith("sync-gap");
  });

  it("keeps the sync gap timer across polling effect remounts", async () => {
    vi.useFakeTimers();
    setVisibilityState("visible");
    const pollWorkbench = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValue(false);
    const onPollingPaused = vi.fn();
    const { rerender } = render(
      <PollingHarness
        intervalMs={WORKBENCH_MAX_SYNC_GAP_MS * 2}
        onPollingPaused={onPollingPaused}
        pollWorkbench={pollWorkbench}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(WORKBENCH_MAX_SYNC_GAP_MS - 1);
    });

    expect(onPollingPaused).not.toHaveBeenCalled();

    rerender(
      <PollingHarness
        intervalMs={WORKBENCH_MAX_SYNC_GAP_MS * 2 + 1}
        onPollingPaused={onPollingPaused}
        pollWorkbench={pollWorkbench}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(onPollingPaused).toHaveBeenCalledWith("sync-gap");
  });

  it("resets the sync gap timer when the active account changes", async () => {
    vi.useFakeTimers();
    setVisibilityState("visible");
    const pollWorkbench = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValue(false);
    const onPollingPaused = vi.fn();
    const { rerender } = render(
      <PollingHarness
        activeAccountId="acct-001"
        intervalMs={WORKBENCH_MAX_SYNC_GAP_MS * 2}
        onPollingPaused={onPollingPaused}
        pollWorkbench={pollWorkbench}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(WORKBENCH_MAX_SYNC_GAP_MS - 1);
    });

    rerender(
      <PollingHarness
        activeAccountId="acct-002"
        intervalMs={WORKBENCH_MAX_SYNC_GAP_MS * 2}
        onPollingPaused={onPollingPaused}
        pollWorkbench={pollWorkbench}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(onPollingPaused).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(WORKBENCH_MAX_SYNC_GAP_MS - 1);
    });

    expect(onPollingPaused).toHaveBeenCalledWith("sync-gap");
  });

  it("pauses after the background timeout elapses even when hidden polls succeed", async () => {
    vi.useFakeTimers();
    setVisibilityState("hidden");
    const pollWorkbench = vi.fn().mockResolvedValue(undefined);
    const onPollingPaused = vi.fn();

    render(
      <PollingHarness
        onPollingPaused={onPollingPaused}
        pollWorkbench={pollWorkbench}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(WORKBENCH_MAX_BACKGROUND_ELAPSED_MS - 1);
    });

    expect(onPollingPaused).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2);
    });

    expect(onPollingPaused).toHaveBeenCalledWith("background-timeout");

    const callCountAfterPause = pollWorkbench.mock.calls.length;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });

    expect(pollWorkbench).toHaveBeenCalledTimes(callCountAfterPause);
  });

  it("reschedules the background timer if it fires before the threshold", async () => {
    vi.useFakeTimers();
    setVisibilityState("hidden");
    const onPollingPaused = vi.fn();
    const startedAt = Date.now();
    const pollWorkbench = vi.fn().mockResolvedValue(undefined);

    render(
      <PollingHarness
        onPollingPaused={onPollingPaused}
        pollWorkbench={pollWorkbench}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(WORKBENCH_MAX_BACKGROUND_ELAPSED_MS - 1);
    });

    expect(onPollingPaused).not.toHaveBeenCalled();

    const nowSpy = vi
      .spyOn(Date, "now")
      .mockReturnValue(startedAt + WORKBENCH_MAX_BACKGROUND_ELAPSED_MS - 1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(onPollingPaused).not.toHaveBeenCalled();

    nowSpy.mockRestore();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(onPollingPaused).toHaveBeenCalledWith("background-timeout");
  });

  it("runs seat summary refresh on a slower cadence than active polling", async () => {
    vi.useFakeTimers();
    setVisibilityState("visible");
    const pollWorkbench = vi.fn().mockResolvedValue(undefined);
    const refreshSeatSummaries = vi.fn().mockResolvedValue(undefined);

    render(
      <PollingHarness
        pollWorkbench={pollWorkbench}
        refreshSeatSummaries={refreshSeatSummaries}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(WORKBENCH_SEAT_SUMMARY_REFRESH_INTERVAL_MS - 1);
    });

    expect(pollWorkbench).toHaveBeenCalled();
    expect(refreshSeatSummaries).toHaveBeenCalledTimes(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(refreshSeatSummaries).toHaveBeenCalledTimes(1);
  });
});
