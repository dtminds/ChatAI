import { beforeEach, describe, expect, it } from "vitest";
import type { WorkbenchService } from "@/pages/chat/api/workbench-service";
import {
  bootstrapWorkbench,
  loadGroupMembers,
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

  it("unwraps sidebar items from the settings API envelope during bootstrap", async () => {
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async getSidebarItems() {
        return {
          data: {
            items: [
              {
                id: "1",
                name: "快捷回复",
                sort: 1,
                status: "active" as const,
                url: "https://example.com/replies",
              },
            ],
          },
          success: true,
        };
      },
    } as unknown as WorkbenchService);

    await expect(bootstrapWorkbench("single", {})).resolves.toMatchObject({
      sidebarItems: [
        {
          id: "1",
          name: "快捷回复",
        },
      ],
    });
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

  it("adapts group members from the workbench service", async () => {
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async getGroupMembers(conversationId) {
        expect(conversationId).toBe("conv-004");

        return {
          conversationId,
          groupSeatId: "group-seat-conv-004",
          thirdGroupId: "third-group-conv-004",
          items: [
            {
              avatarUrl: "/owner.png",
              displayName: "群主小可",
              thirdUserId: "owner-001",
              type: 2,
            },
          ],
        };
      },
    });

    await expect(loadGroupMembers("conv-004")).resolves.toEqual([
      {
        avatarUrl: "/owner.png",
        displayName: "群主小可",
        id: "owner-001",
        type: 2,
      },
    ]);
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
