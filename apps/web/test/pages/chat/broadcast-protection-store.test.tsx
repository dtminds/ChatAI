import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/store/auth-store";
import {
  BROADCAST_PROTECTION_POLL_INTERVAL_MS,
  refreshBroadcastProtection,
  resetBroadcastProtectionStore,
  useBroadcastProtectionPolling,
  useBroadcastProtectionStore,
} from "@/pages/chat/broadcast-protection/broadcast-protection-store";

const api = vi.hoisted(() => ({
  getBroadcastProtectionStatus: vi.fn(),
}));

vi.mock("@/pages/chat/api/broadcast-protection-service", () => api);

const activeStatus = {
  degradeCallbackCnt: 1800,
  degradeCallbackRate: 120,
  normalCallbackCnt: 8,
  normalCallbackRate: 600,
};

function authenticate(uid = 9001) {
  useAuthStore.getState().setSession({
    accountType: "sub",
    displayName: "客服甲",
    permissions: ["chat.access"],
    role: "operator",
    subUserId: "101",
    uid,
  });
}

beforeEach(() => {
  api.getBroadcastProtectionStatus.mockReset();
  resetBroadcastProtectionStore();
  useAuthStore.setState(useAuthStore.getInitialState(), true);
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("broadcast protection polling", () => {
  it("polls immediately and every minute only while the workbench is visible", async () => {
    vi.useFakeTimers();
    api.getBroadcastProtectionStatus.mockResolvedValue(activeStatus);
    authenticate();

    const view = renderHook(() => useBroadcastProtectionPolling());
    await act(async () => {
      await Promise.resolve();
    });
    expect(api.getBroadcastProtectionStatus).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(BROADCAST_PROTECTION_POLL_INTERVAL_MS);
    });
    expect(api.getBroadcastProtectionStatus).toHaveBeenCalledTimes(2);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(BROADCAST_PROTECTION_POLL_INTERVAL_MS);
    });
    expect(api.getBroadcastProtectionStatus).toHaveBeenCalledTimes(2);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });
    expect(api.getBroadcastProtectionStatus).toHaveBeenCalledTimes(3);

    view.unmount();
  });

  it("only activates after a successful positive backlog response", async () => {
    api.getBroadcastProtectionStatus
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ ...activeStatus, degradeCallbackCnt: 0 })
      .mockResolvedValueOnce(activeStatus);
    authenticate();
    const view = renderHook(() => useBroadcastProtectionPolling());

    await act(async () => {
      await Promise.resolve();
    });
    expect(useBroadcastProtectionStore.getState().status).toBeUndefined();

    await act(async () => {
      await refreshBroadcastProtection();
    });
    expect(useBroadcastProtectionStore.getState().status).toBeUndefined();

    await act(async () => {
      await refreshBroadcastProtection();
    });
    expect(useBroadcastProtectionStore.getState().status).toEqual(activeStatus);

    view.unmount();
  });

  it("keeps an active notice for two failures and hides it on the third", async () => {
    api.getBroadcastProtectionStatus
      .mockResolvedValueOnce(activeStatus)
      .mockRejectedValue(new Error("network"));
    authenticate();
    const view = renderHook(() => useBroadcastProtectionPolling());
    await act(async () => {
      await Promise.resolve();
    });

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      await act(async () => {
        await refreshBroadcastProtection();
      });
      expect(useBroadcastProtectionStore.getState()).toMatchObject({
        consecutiveFailureCount: attempt,
        status: activeStatus,
      });
    }

    await act(async () => {
      await refreshBroadcastProtection();
    });
    expect(useBroadcastProtectionStore.getState()).toMatchObject({
      consecutiveFailureCount: 3,
      status: undefined,
    });

    view.unmount();
  });

  it("clears failures after any successful response and deactivates immediately on zero", async () => {
    api.getBroadcastProtectionStatus
      .mockResolvedValueOnce(activeStatus)
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(activeStatus)
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ ...activeStatus, degradeCallbackCnt: 0 });
    authenticate();
    const view = renderHook(() => useBroadcastProtectionPolling());
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await refreshBroadcastProtection();
      await refreshBroadcastProtection();
    });
    expect(useBroadcastProtectionStore.getState()).toMatchObject({
      consecutiveFailureCount: 0,
      status: activeStatus,
    });

    await act(async () => {
      await refreshBroadcastProtection();
      await refreshBroadcastProtection();
    });
    expect(useBroadcastProtectionStore.getState()).toMatchObject({
      consecutiveFailureCount: 0,
      status: undefined,
    });

    view.unmount();
  });
});
