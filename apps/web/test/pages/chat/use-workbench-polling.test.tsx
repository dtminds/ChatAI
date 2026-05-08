import { act, render } from "@testing-library/react";
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
  intervalMs = 3000,
  jitterMs = 0,
  pollWorkbench,
}: {
  activeAccountId?: string;
  intervalMs?: number;
  jitterMs?: number;
  pollWorkbench: () => Promise<void>;
}) {
  useWorkbenchPolling({
    activeAccountId,
    bootstrapStatus: "ready",
    intervalMs,
    jitterMs,
    pollWorkbench,
  });

  return null;
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
});
