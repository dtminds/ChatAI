import { beforeEach, describe, expect, it } from "vitest";
import type { WorkbenchService } from "@/pages/chat/api/workbench-service";
import {
  bootstrapWorkbench,
  loadAccountScope,
} from "@/pages/chat/api/workbench-gateway";
import {
  createMockWorkbenchService,
  resetWorkbenchService,
  setWorkbenchService,
} from "@/pages/chat/api/workbench-service";

describe("workbench gateway message paging", () => {
  beforeEach(() => {
    resetWorkbenchService();
  });

  it("loads the initial conversation with 50 messages by default", async () => {
    const observedLimits: Array<number | undefined> = [];
    const service = createObservedMessageService(observedLimits);

    setWorkbenchService(service);

    await bootstrapWorkbench("single", {});

    expect(observedLimits).toEqual([50]);
  });

  it("loads account scope conversations with 50 messages by default", async () => {
    const observedLimits: Array<number | undefined> = [];
    const service = createObservedMessageService(observedLimits);
    const accounts = await service.getSeats();
    const me = await service.getMe();

    setWorkbenchService(service);

    await loadAccountScope("drc", "single", {
      accounts: accounts.map((account) => ({
        id: account.seatId,
        name: account.name,
        avatarUrl: account.avatar,
        operator: account.operatorName,
        description: account.description,
        phone: account.phone,
        metrics: {
          totalCustomers: 0,
          activeCustomers: 0,
          agents: 0,
          stores: 0,
        },
        tone: "",
      })),
      customerProfilesById: {},
      me: {
        id: me.subUserId,
        displayName: me.displayName,
      },
    });

    expect(observedLimits).toEqual([50]);
  });
});

function createObservedMessageService(observedLimits: Array<number | undefined>) {
  const baseService = createMockWorkbenchService();

  return {
    ...baseService,
    async getMessages(conversationId, options) {
      observedLimits.push(options?.limit);

      return baseService.getMessages(conversationId, options);
    },
  } satisfies WorkbenchService;
}
