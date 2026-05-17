import { act, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useWorkbenchPolling } from "@/pages/chat/hooks/use-workbench-polling";

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
  onPollingPausedByOtherTab,
  pollWorkbench,
}: {
  activeAccountId?: string;
  currentUserId?: string;
  intervalMs?: number;
  jitterMs?: number;
  onPollingPausedByOtherTab?: () => void;
  pollWorkbench: () => Promise<void>;
}) {
  useWorkbenchPolling({
    activeAccountId,
    bootstrapStatus: "ready",
    currentUserId,
    intervalMs,
    jitterMs,
    onPollingPausedByOtherTab,
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
    onPollingPausedByOtherTab: () => {
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
    window.localStorage.clear();
  });

  it("polls immediately when the document becomes visible again", async () => {
    vi.useFakeTimers();
    setVisibilityState("hidden");
    const pollWorkbench = vi.fn().mockResolvedValue(undefined);

    render(<PollingHarness pollWorkbench={pollWorkbench} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2999);
    });
    expect(pollWorkbench).not.toHaveBeenCalled();

    setVisibilityState("visible");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(pollWorkbench).toHaveBeenCalledTimes(1);
  });

  it("does not poll hidden documents more frequently than the configured interval", async () => {
    vi.useFakeTimers();
    setVisibilityState("hidden");
    const pollWorkbench = vi.fn().mockResolvedValue(undefined);

    render(<PollingHarness intervalMs={30000} pollWorkbench={pollWorkbench} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(pollWorkbench).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });
    expect(pollWorkbench).toHaveBeenCalledTimes(1);
  });

  it("deduplicates immediate polls when visibility changes rapidly", async () => {
    vi.useFakeTimers();
    setVisibilityState("hidden");
    const pollGate = createDeferred();
    const pollWorkbench = vi.fn(() => pollGate.promise);

    render(<PollingHarness pollWorkbench={pollWorkbench} />);

    setVisibilityState("visible");
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
    const onPollingPausedByOtherTab = vi.fn();

    render(
      <PollingHarness
        onPollingPausedByOtherTab={onPollingPausedByOtherTab}
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

    expect(onPollingPausedByOtherTab).toHaveBeenCalledTimes(1);

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
    const onPollingPausedByOtherTab = vi.fn();

    render(
      <PollingHarness
        onPollingPausedByOtherTab={onPollingPausedByOtherTab}
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

    expect(onPollingPausedByOtherTab).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(pollWorkbench).not.toHaveBeenCalled();
  });
});
