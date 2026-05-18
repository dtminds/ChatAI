import { act, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  WORKBENCH_POLL_HIDDEN_INTERVAL_MS,
  WORKBENCH_POLL_IDLE_TIMEOUT_MS,
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
  onPollingPaused?: (reason: "idle" | "other-tab") => void;
  refreshSeatSummaries?: () => Promise<void>;
  pollWorkbench: () => Promise<void>;
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
  pollWorkbench: () => Promise<void>;
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
    vi.useRealTimers();
    setVisibilityState("visible");
    Object.defineProperty(document, "hasFocus", {
      configurable: true,
      value: vi.fn(() => true),
    });
    window.localStorage.clear();
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

  it("uses the slower hidden poll cadence before the idle timeout", async () => {
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
      await vi.advanceTimersByTimeAsync(WORKBENCH_POLL_HIDDEN_INTERVAL_MS - 1);
    });
    expect(pollWorkbench).not.toHaveBeenCalled();
    expect(onPollingPaused).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(pollWorkbench).toHaveBeenCalledTimes(1);
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

  it("pauses after the hidden idle timeout elapses", async () => {
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
      await vi.advanceTimersByTimeAsync(WORKBENCH_POLL_IDLE_TIMEOUT_MS - 1);
    });

    expect(onPollingPaused).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2);
    });

    expect(onPollingPaused).toHaveBeenCalledWith("idle");

    const callCountAfterPause = pollWorkbench.mock.calls.length;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });

    expect(pollWorkbench).toHaveBeenCalledTimes(callCountAfterPause);
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
