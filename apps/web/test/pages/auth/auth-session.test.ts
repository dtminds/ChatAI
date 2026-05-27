import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getAuthSessionGeneration,
  getCachedAuthSubUser,
  resetAuthSessionSnapshot,
  subscribeAuthSessionSnapshot,
  syncAuthSession,
} from "@/pages/auth/auth-session";
import * as authService from "@/pages/auth/auth-service";

describe("auth session snapshot", () => {
  beforeEach(() => {
    resetAuthSessionSnapshot();
  });

  afterEach(() => {
    resetAuthSessionSnapshot();
    vi.restoreAllMocks();
  });

  it("reuses cached sub-user without refetching when not forced", async () => {
    const getAuthSession = vi.spyOn(authService, "getAuthSession").mockResolvedValue({
      data: {
        subUser: {
          accountType: "sub",
          displayName: "客服一号",
          permissions: ["chat.send"],
          role: "operator",
          subUserId: "101",
        },
      },
    });

    await syncAuthSession();
    await syncAuthSession();

    expect(getAuthSession).toHaveBeenCalledTimes(1);
    expect(getCachedAuthSubUser()?.subUserId).toBe("101");
  });

  it("ignores stale sync results after a newer sync starts", async () => {
    let resolveFirst: ((value: Awaited<ReturnType<typeof authService.getAuthSession>>) => void) | undefined;
    const firstPromise = new Promise<Awaited<ReturnType<typeof authService.getAuthSession>>>(
      (resolve) => {
        resolveFirst = resolve;
      },
    );

    vi.spyOn(authService, "getAuthSession")
      .mockImplementationOnce(() => firstPromise)
      .mockResolvedValueOnce({
        data: {
          subUser: {
            accountType: "sub",
            displayName: "客服二号",
            permissions: ["chat.send"],
            role: "operator",
            subUserId: "202",
          },
        },
      });

    const firstSync = syncAuthSession({ force: true });
    const secondSync = syncAuthSession({ force: true });

    resolveFirst?.({
      data: {
        subUser: {
          accountType: "sub",
          displayName: "过时客服",
          permissions: ["chat.send"],
          role: "operator",
          subUserId: "999",
        },
      },
    });

    await firstSync;
    await secondSync;

    expect(getCachedAuthSubUser()?.subUserId).toBe("202");
  });

  it("notifies subscribers with the current generation", () => {
    const listener = vi.fn();

    subscribeAuthSessionSnapshot(listener);
    resetAuthSessionSnapshot();

    expect(listener).toHaveBeenCalledWith(getAuthSessionGeneration());
  });
});
