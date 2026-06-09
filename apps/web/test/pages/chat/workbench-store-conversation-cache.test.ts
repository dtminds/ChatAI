import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkbenchService } from "@/pages/chat/api/workbench-service";
import {
  createMockWorkbenchService,
  resetWorkbenchService,
  setWorkbenchService,
} from "@/pages/chat/api/workbench-service";
import {
  CONVERSATION_MODE_CACHE_TTL_MS,
  CONVERSATION_MODE_LIMITS,
} from "@/pages/chat/api/workbench-gateway";
import { useWorkbenchStore } from "@/store/workbench-store";

describe("workbench store conversation mode cache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-15T08:00:00.000Z"));
    resetWorkbenchService();
    useWorkbenchStore.setState(useWorkbenchStore.getInitialState(), true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses fresh mode conversations when switching tabs and reloads after the cache expires", async () => {
    const observedConversationRequests: Array<{
      limit?: number;
      mode?: string;
      seatId: string;
    }> = [];
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async getConversations(seatId, options) {
        observedConversationRequests.push({
          limit: options?.limit,
          mode: options?.mode,
          seatId,
        });

        return baseService.getConversations(seatId, options);
      },
    } satisfies WorkbenchService);

    await useWorkbenchStore.getState().initializeWorkbench();

    expect(observedConversationRequests.map((request) => request.mode)).toEqual([
      "single",
      "group",
    ]);

    await useWorkbenchStore.getState().setActiveMode("group");

    expect(observedConversationRequests.map((request) => request.mode)).toEqual([
      "single",
      "group",
    ]);

    vi.setSystemTime(Date.now() + CONVERSATION_MODE_CACHE_TTL_MS + 1);
    await useWorkbenchStore.getState().setActiveMode("single");

    expect(observedConversationRequests.at(-1)).toEqual({
      limit: CONVERSATION_MODE_LIMITS.single,
      mode: "single",
      seatId: "drc",
    });
  });

  it("resets stale polling status when the workbench initializes again", async () => {
    const baseService = createMockWorkbenchService();
    const poll = vi.fn(baseService.poll);

    setWorkbenchService({
      ...baseService,
      poll,
    } satisfies WorkbenchService);

    useWorkbenchStore.setState((state) => ({
      pollState: {
        ...state.pollState,
        status: "polling",
      },
    }));

    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().pollWorkbench();

    expect(poll).toHaveBeenCalledTimes(1);
  });

});
