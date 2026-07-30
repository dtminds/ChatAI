import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/store/auth-store";
import {
  refreshTicketCounts,
  resetTicketCountStore,
  setTicketCountScope,
  setTicketReminderDisplayMode,
  syncAssignedToMeActiveCount,
  useTicketCountStore,
} from "@/pages/chat/tickets/ticket-count-store";
import { useTicketCountPolling } from "@/pages/chat/tickets/use-ticket-count-polling";

const api = vi.hoisted(() => ({
  getTicketCounts: vi.fn(),
}));

vi.mock("@/pages/chat/tickets/api/tickets-service", () => api);

beforeEach(() => {
  api.getTicketCounts.mockReset();
  window.localStorage.clear();
  resetTicketCountStore();
  useAuthStore.setState(useAuthStore.getInitialState(), true);
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ticket count store", () => {
  it("coalesces in-flight refreshes and performs one trailing refresh", async () => {
    let resolveFirst!: (value: { assignedToMeActive: number }) => void;
    api.getTicketCounts
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveFirst = resolve;
      }))
      .mockResolvedValueOnce({ assignedToMeActive: 2 });
    setTicketCountScope("1:101");

    const first = refreshTicketCounts();
    const second = refreshTicketCounts();

    expect(second).toBe(first);
    expect(api.getTicketCounts).toHaveBeenCalledTimes(1);
    resolveFirst({ assignedToMeActive: 1 });
    await first;

    expect(api.getTicketCounts).toHaveBeenCalledTimes(2);
    expect(useTicketCountStore.getState().counts).toEqual({ assignedToMeActive: 2 });
  });

  it("keeps the last successful counts during a failed silent refresh", async () => {
    api.getTicketCounts
      .mockResolvedValueOnce({ assignedToMeActive: 4 })
      .mockRejectedValueOnce(new Error("network"));
    setTicketCountScope("1:101");

    await refreshTicketCounts();
    const refresh = refreshTicketCounts();
    expect(useTicketCountStore.getState()).toMatchObject({
      counts: { assignedToMeActive: 4 },
      initialStatus: "ready",
      isRefreshing: true,
    });
    await refresh;

    expect(useTicketCountStore.getState()).toMatchObject({
      counts: { assignedToMeActive: 4 },
      initialStatus: "ready",
      isRefreshing: false,
    });
  });

  it("keeps the list total when an older count request finishes later", async () => {
    let resolveCount!: (value: { assignedToMeActive: number }) => void;
    api.getTicketCounts.mockImplementationOnce(() => new Promise((resolve) => {
      resolveCount = resolve;
    }));
    setTicketCountScope("1:101");

    const refresh = refreshTicketCounts();
    syncAssignedToMeActiveCount(3);
    resolveCount({ assignedToMeActive: 2 });
    await refresh;

    expect(useTicketCountStore.getState().counts).toEqual({
      assignedToMeActive: 3,
    });
  });

  it("polls only while the workbench hook is mounted and the page is visible", async () => {
    vi.useFakeTimers();
    api.getTicketCounts.mockResolvedValue({ assignedToMeActive: 1 });
    useAuthStore.getState().setSession({
      accountType: "sub",
      displayName: "客服甲",
      permissions: ["chat.access"],
      role: "operator",
      subUserId: "101",
      uid: 1,
    });

    const view = renderHook(() => useTicketCountPolling());
    await act(async () => {
      await Promise.resolve();
    });
    expect(api.getTicketCounts).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(api.getTicketCounts).toHaveBeenCalledTimes(2);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(api.getTicketCounts).toHaveBeenCalledTimes(2);

    view.unmount();
  });

  it("stops requesting ticket counts after menu reminders are hidden", async () => {
    vi.useFakeTimers();
    api.getTicketCounts.mockResolvedValue({ assignedToMeActive: 1 });
    useAuthStore.getState().setSession({
      accountType: "sub",
      displayName: "客服甲",
      permissions: ["chat.access"],
      role: "operator",
      subUserId: "101",
      uid: 1,
    });

    const view = renderHook(() => useTicketCountPolling());
    await act(async () => {
      await Promise.resolve();
    });
    expect(api.getTicketCounts).toHaveBeenCalledTimes(1);

    act(() => {
      setTicketReminderDisplayMode("hidden");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    await refreshTicketCounts();
    expect(api.getTicketCounts).toHaveBeenCalledTimes(1);
    view.unmount();
  });
});
