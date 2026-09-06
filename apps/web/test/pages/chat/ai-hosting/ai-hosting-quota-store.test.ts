// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiHostingQuotaOverview } from "@chatai/contracts";
import { getAiHostingQuota } from "@/pages/chat/ai-hosting/agent-service";
import {
  fetchAiHostingQuota,
  getCachedAiHostingQuota,
  resetAiHostingQuotaCacheForTest,
  subscribeAiHostingQuota,
} from "@/pages/chat/ai-hosting/ai-hosting-quota-store";
import { useAuthStore } from "@/store/auth-store";

vi.mock("@/pages/chat/ai-hosting/agent-service", () => ({
  getAiHostingQuota: vi.fn(),
}));

function createQuota(overrides?: {
  usedAgents?: number;
  usedKbDocs?: number;
  usedKbs?: number;
}): AiHostingQuotaOverview {
  return {
    agents: { limit: 20, used: overrides?.usedAgents ?? 2 },
    kbDocs: {
      limit: 1024 * 1024 * 1024,
      used: overrides?.usedKbDocs ?? 20 * 1024 * 1024,
    },
    kbs: { limit: 20, used: overrides?.usedKbs ?? 3 },
  };
}

function setOwner(subUserId: string) {
  useAuthStore.getState().setSession({
    accountType: "sub",
    displayName: "客服主管",
    permissions: ["chat.access", "chat.send", "chat.takeover"],
    role: "admin",
    subUserId,
    uid: 1,
  });
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, reject, resolve };
}

describe("AI hosting quota store", () => {
  beforeEach(() => {
    useAuthStore.setState(useAuthStore.getInitialState(), true);
    resetAiHostingQuotaCacheForTest();
    vi.mocked(getAiHostingQuota).mockReset();
    setOwner("101");
    getCachedAiHostingQuota();
  });

  it("reloads quota after the account owner changes and ignores the previous owner's cache", async () => {
    const firstOwnerQuota = createQuota();
    const secondOwnerQuota = createQuota({
      usedAgents: 7,
      usedKbDocs: 64 * 1024 * 1024,
      usedKbs: 9,
    });
    const seen: Array<AiHostingQuotaOverview | null> = [];
    const unsubscribe = subscribeAiHostingQuota((quota) => {
      seen.push(quota);
    });

    vi.mocked(getAiHostingQuota)
      .mockResolvedValueOnce(firstOwnerQuota)
      .mockResolvedValueOnce(secondOwnerQuota);

    await fetchAiHostingQuota();
    expect(getCachedAiHostingQuota()).toEqual(firstOwnerQuota);

    setOwner("202");
    expect(getCachedAiHostingQuota()).toBeNull();

    await fetchAiHostingQuota();
    unsubscribe();

    expect(getAiHostingQuota).toHaveBeenCalledTimes(2);
    expect(getCachedAiHostingQuota()).toEqual(secondOwnerQuota);
    expect(seen).toEqual([firstOwnerQuota, null, secondOwnerQuota]);
  });

  it("ignores a stale quota response after the account owner changes", async () => {
    const first = createDeferred<AiHostingQuotaOverview>();
    const second = createDeferred<AiHostingQuotaOverview>();
    const firstOwnerQuota = createQuota();
    const secondOwnerQuota = createQuota({
      usedAgents: 7,
      usedKbDocs: 64 * 1024 * 1024,
      usedKbs: 9,
    });

    vi.mocked(getAiHostingQuota)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const firstRequest = fetchAiHostingQuota();
    setOwner("202");
    const secondRequest = fetchAiHostingQuota();

    second.resolve(secondOwnerQuota);
    await secondRequest;
    expect(getCachedAiHostingQuota()).toEqual(secondOwnerQuota);

    first.resolve(firstOwnerQuota);
    await firstRequest;
    expect(getCachedAiHostingQuota()).toEqual(secondOwnerQuota);
  });

  it("ignores out-of-order force refreshes for the same account owner", async () => {
    const initialQuota = createQuota();
    const firstRefresh = createDeferred<AiHostingQuotaOverview>();
    const secondRefresh = createDeferred<AiHostingQuotaOverview>();
    const latestQuota = createQuota({
      usedAgents: 5,
      usedKbDocs: 50 * 1024 * 1024,
      usedKbs: 6,
    });

    vi.mocked(getAiHostingQuota)
      .mockResolvedValueOnce(initialQuota)
      .mockReturnValueOnce(firstRefresh.promise)
      .mockReturnValueOnce(secondRefresh.promise);

    await fetchAiHostingQuota();
    const firstForce = fetchAiHostingQuota({ force: true });
    const secondForce = fetchAiHostingQuota({ force: true });

    secondRefresh.resolve(latestQuota);
    await secondForce;
    expect(getCachedAiHostingQuota()).toEqual(latestQuota);

    firstRefresh.resolve(initialQuota);
    await firstForce;
    expect(getCachedAiHostingQuota()).toEqual(latestQuota);
  });

  it("keeps the cached quota when a force refresh fails", async () => {
    const cachedQuota = createQuota();
    vi.mocked(getAiHostingQuota)
      .mockResolvedValueOnce(cachedQuota)
      .mockRejectedValueOnce(new Error("quota failed"));

    await fetchAiHostingQuota();
    await expect(fetchAiHostingQuota({ force: true })).rejects.toThrow("quota failed");

    expect(getCachedAiHostingQuota()).toEqual(cachedQuota);
  });

  it("reuses the cached quota across later reads without refetching", async () => {
    const cachedQuota = createQuota();
    vi.mocked(getAiHostingQuota).mockResolvedValue(cachedQuota);

    await fetchAiHostingQuota();
    await fetchAiHostingQuota();

    expect(getAiHostingQuota).toHaveBeenCalledTimes(1);
    expect(getCachedAiHostingQuota()).toEqual(cachedQuota);
  });

  it("does not retry the initial quota load after a failure", async () => {
    vi.mocked(getAiHostingQuota).mockRejectedValueOnce(new Error("quota failed"));

    await expect(fetchAiHostingQuota()).rejects.toThrow("quota failed");
    await expect(fetchAiHostingQuota()).resolves.toBeNull();

    expect(getAiHostingQuota).toHaveBeenCalledTimes(1);
    expect(getCachedAiHostingQuota()).toBeNull();
  });
});
