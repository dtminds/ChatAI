import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useVisiblePolling } from "@/pages/chat/insights/use-visible-polling";

type VisiblePollingLoad = Parameters<typeof useVisiblePolling>[0]["load"];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("useVisiblePolling", () => {
  it("resumes when visible without overlapping an in-flight load", async () => {
    vi.useFakeTimers();
    let visibilityState: DocumentVisibilityState = "hidden";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(
      () => visibilityState,
    );
    const firstLoad = createDeferred();
    const load = vi
      .fn<VisiblePollingLoad>()
      .mockImplementationOnce(() => firstLoad.promise)
      .mockResolvedValue(undefined);

    renderHook(() =>
      useVisiblePolling({
        enabled: true,
        intervalMs: 1_000,
        load,
      }),
    );

    expect(load).not.toHaveBeenCalled();

    act(() => {
      visibilityState = "visible";
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith({
      showLoading: false,
      signal: expect.any(AbortSignal),
    });

    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
      vi.advanceTimersByTime(1_000);
    });
    expect(load).toHaveBeenCalledTimes(1);

    await act(async () => {
      firstLoad.resolve();
      await firstLoad.promise;
    });
    act(() => {
      vi.advanceTimersByTime(1_000);
    });

    expect(load).toHaveBeenCalledTimes(2);
  });

  it("aborts and stops scheduling when disabled", async () => {
    vi.useFakeTimers();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const activeLoad = createDeferred();
    const load = vi.fn<VisiblePollingLoad>(() => activeLoad.promise);
    const view = renderHook(
      ({ enabled }) =>
        useVisiblePolling({
          enabled,
          intervalMs: 1_000,
          load,
        }),
      { initialProps: { enabled: true } },
    );
    const signal = load.mock.calls[0]?.[0].signal;

    if (!signal) {
      throw new Error("Expected the initial polling load to receive a signal");
    }

    expect(load).toHaveBeenCalledWith({
      showLoading: true,
      signal: expect.any(AbortSignal),
    });
    expect(signal.aborted).toBe(false);

    view.rerender({ enabled: false });

    expect(signal.aborted).toBe(true);
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
      vi.advanceTimersByTime(1_000);
    });
    expect(load).toHaveBeenCalledTimes(1);

    await act(async () => {
      activeLoad.resolve();
      await activeLoad.promise;
    });
  });
});

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((nextResolve) => {
    resolve = nextResolve;
  });

  return { promise, resolve };
}
