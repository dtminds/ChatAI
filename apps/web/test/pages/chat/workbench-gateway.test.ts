import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkbenchService } from "@/pages/chat/api/workbench-service";
import {
  bootstrapWorkbench,
  CONVERSATION_MODE_LIMITS,
  getVisibleConversations,
  loadGroupMembers,
  loadAccountConversations,
  loadAccountScope,
  confirmVoicePlaybackReady,
  transcribeVoiceMessage,
  pollWorkbench,
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

  it("forwards voice playback confirmation to the active service", async () => {
    const baseService = createMockWorkbenchService();
    const confirmVoicePlayback = {
      conversationId: "conv-001",
      messageSeq: 538,
      playbackUrl: "https://b5.bokr.com.cn/s5/playable-voice/20260525/272/voice.wav",
    };
    const confirmVoicePlaybackReadySpy = vi.fn(async () => ({
      messageSeq: confirmVoicePlayback.messageSeq,
      playbackUrl: confirmVoicePlayback.playbackUrl,
      transFileUrlPersisted: true as const,
    }));

    setWorkbenchService({
      ...baseService,
      confirmVoicePlaybackReady: confirmVoicePlaybackReadySpy,
    });

    await expect(confirmVoicePlaybackReady(confirmVoicePlayback)).resolves.toEqual({
      messageSeq: 538,
      playbackUrl: "https://b5.bokr.com.cn/s5/playable-voice/20260525/272/voice.wav",
      transFileUrlPersisted: true,
    });
    expect(confirmVoicePlaybackReadySpy).toHaveBeenCalledWith(confirmVoicePlayback);
  });

  it("forwards voice transcription to the active service", async () => {
    const baseService = createMockWorkbenchService();
    const request = {
      conversationId: "conv-001",
      messageSeq: 538,
    };
    const transcribeVoiceMessageSpy = vi.fn(async () => ({
      messageSeq: request.messageSeq,
      transVoiceText: "识别文本",
      transVoiceTextPersisted: true as const,
    }));

    setWorkbenchService({
      ...baseService,
      transcribeVoiceMessage: transcribeVoiceMessageSpy,
    });

    await expect(transcribeVoiceMessage(request)).resolves.toEqual({
      messageSeq: 538,
      transVoiceText: "识别文本",
      transVoiceTextPersisted: true,
    });
    expect(transcribeVoiceMessageSpy).toHaveBeenCalledWith(request);
  });

  it("loads single and group conversations separately during bootstrap", async () => {
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
    });

    await bootstrapWorkbench("single", {});

    expect(observedConversationRequests).toEqual([
      {
        limit: CONVERSATION_MODE_LIMITS.single,
        mode: "single",
        seatId: "drc",
      },
      {
        limit: CONVERSATION_MODE_LIMITS.group,
        mode: "group",
        seatId: "drc",
      },
    ]);
  });

  it("uses the earliest conversation snapshot as the bootstrap poll baseline", async () => {
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async getConversations(seatId, options) {
        const response = await baseService.getConversations(seatId, options);

        return {
          ...response,
          snapshotAt: options?.mode === "single" ? 1_778_840_010_000 : 1_778_840_020_000,
        };
      },
    });

    await expect(bootstrapWorkbench("single", {})).resolves.toMatchObject({
      pollBaseline: 1_778_840_010_000,
    });
  });

  it("maps the active account id to the backend poll seat id", async () => {
    const baseService = createMockWorkbenchService();
    const observedPollRequests: Parameters<WorkbenchService["poll"]>[0][] = [];

    setWorkbenchService({
      ...baseService,
      async poll(request) {
        observedPollRequests.push(request);

        return {
          activeConversationMessages: [],
          conversationChanges: [],
          nextVersion: request.sinceVersion + 1,
          seatChanges: [],
        };
      },
    });

    await pollWorkbench(
      {
        activeConversationId: "conv-001",
        activeMessageSeq: 9,
        currentAccountId: "drc",
        freshBaseline: true,
        messageUpdateCursor: 1_778_840_020_000,
        seatUpdateCursor: 1_778_840_030_000,
        sinceVersion: 1_778_840_010_000,
      },
      {
        accounts: [],
        customerProfilesById: {},
      },
    );

    expect(observedPollRequests[0]).toMatchObject({
      activeConversationId: "conv-001",
      activeMessageSeq: 9,
      currentSeatId: "drc",
      freshBaseline: true,
      messageUpdateCursor: 1_778_840_020_000,
      seatUpdateCursor: 1_778_840_030_000,
      sinceVersion: 1_778_840_010_000,
    });
  });

  it("keeps message update events as seq-only poll metadata", async () => {
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async poll(request) {
        return {
          activeConversationMessages: [],
          conversationChanges: [],
          messageUpdateEvents: [
            {
              conversationId: request.activeConversationId ?? "",
              eventId: 4,
              messageSeq: 829,
            },
          ],
          nextMessageUpdateCursor: 1_778_840_010_000,
          nextSeatUpdateCursor: 1_778_840_020_000,
          nextVersion: request.sinceVersion + 1,
          seatChanges: [],
        };
      },
    });

    const result = await pollWorkbench(
      {
        activeConversationId: "conv-001",
        activeMessageSeq: 9,
        currentAccountId: "drc",
        freshBaseline: true,
        sinceVersion: 1_778_840_010_000,
      },
      {
        accounts: [],
        customerProfilesById: {},
      },
    );

    expect(result.messageUpdateEvents).toEqual([
      {
        conversationId: "conv-001",
        eventId: 4,
        messageSeq: 829,
      },
    ]);
    expect(result.nextSeatUpdateCursor).toBe(1_778_840_020_000);
  });

  it("keeps seat takeover changes in poll account metadata", async () => {
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async poll(request) {
        return {
          activeConversationMessages: [],
          conversationChanges: [],
          nextVersion: request.sinceVersion + 1,
          seatChanges: [
            {
              hostSubUserId: "202",
              lastMessageTime: 1_778_840_020_000,
              seatId: "drc",
              unreadCount: 3,
            },
          ],
        };
      },
    });

    const result = await pollWorkbench(
      {
        activeConversationId: "conv-001",
        activeMessageSeq: 9,
        currentAccountId: "drc",
        sinceVersion: 1_778_840_010_000,
      },
      {
        accounts: [],
        customerProfilesById: {},
      },
    );

    expect(result.accountChanges).toEqual([
      {
        accountId: "drc",
        hostSubUserId: "202",
        lastMessageTime: 1_778_840_020_000,
        seatId: "drc",
        unreadCount: 3,
      },
    ]);
  });

  it("keeps pinned conversations first when merging mode-specific lists", async () => {
    const baseService = createMockWorkbenchService();
    const now = new Date("2026-05-15T08:00:00.000Z").getTime();

    setWorkbenchService({
      ...baseService,
      async getConversations(_seatId, options) {
        if (options?.mode === "single") {
          return {
            hasMore: false,
            items: [
              {
                conversationId: "recent-unpinned",
                custodyMode: "semi",
                customerAvatar: "",
                customerId: "customer-recent",
                customerName: "最近未置顶",
                lastMessage: "recent",
                lastMessageTime: now,
                mode: "single",
                priority: "medium",
                seatId: "drc",
                unreadCount: 0,
              },
            ],
            snapshotAt: now,
          };
        }

        return {
          hasMore: false,
          items: [
            {
              conversationId: "old-pinned",
              custodyMode: "semi",
              customerAvatar: "",
              customerId: "customer-pinned",
              customerName: "较早置顶",
              isPinned: true,
              lastMessage: "pinned",
              lastMessageTime: now - 60_000,
              mode: "group",
              priority: "medium",
              seatId: "drc",
              unreadCount: 0,
            },
          ],
          snapshotAt: now,
        };
      },
    });

    await expect(loadAccountConversations("drc")).resolves.toMatchObject([
      {
        id: "old-pinned",
        isPinned: true,
      },
      {
        id: "recent-unpinned",
      },
    ]);
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
                bindTypes: ["1", "2"],
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

  it("selects the first currently visible conversation during bootstrap", async () => {
    const baseService = createMockWorkbenchService();
    const now = new Date("2026-05-15T08:00:00.000Z").getTime();

    setWorkbenchService({
      ...baseService,
      async getConversations(seatId, options) {
        const response = await baseService.getConversations(seatId, options);

        return {
          ...response,
          items: [
            {
              ...response.items[0],
              conversationId: "pending-new-customer",
              createdAt: now,
              customerName: "识别中的客户",
              verified: false,
            },
            ...response.items,
          ],
        };
      },
    });

    await expect(bootstrapWorkbench("single", {}, 50, now)).resolves.toMatchObject({
      activeConversationId: "conv-001",
    });
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

describe("temporary conversation visibility", () => {
  it("keeps recently unverified conversations hidden until the delay expires", () => {
    const now = new Date("2026-05-15T08:00:00.000Z").getTime();
    const conversations = [
      {
        accountId: "drc",
        createdAtMs: now - 60_000,
        custodyMode: "semi" as const,
        customerAvatarUrl: "",
        customerId: "customer-pending",
        customerName: "识别中的客户",
        id: "pending-new-customer",
        isVerified: false,
        mode: "single" as const,
        preview: "刚刚发来消息",
        priority: "medium" as const,
        quietFor: "",
        unread: 1,
        updatedAt: "",
        updatedAtMs: now - 60_000,
      },
      {
        accountId: "drc",
        createdAtMs: now - 181_000,
        custodyMode: "semi" as const,
        customerAvatarUrl: "",
        customerId: "customer-expired",
        customerName: "超过等待窗口的客户",
        id: "expired-pending-customer",
        isVerified: false,
        mode: "single" as const,
        preview: "三分钟前发来消息",
        priority: "medium" as const,
        quietFor: "",
        unread: 1,
        updatedAt: "",
        updatedAtMs: now - 181_000,
      },
      {
        accountId: "drc",
        createdAtMs: now - 30_000,
        custodyMode: "semi" as const,
        customerAvatarUrl: "",
        customerId: "customer-verified",
        customerName: "已识别客户",
        id: "verified-customer",
        isVerified: true,
        mode: "single" as const,
        preview: "已识别消息",
        priority: "medium" as const,
        quietFor: "",
        unread: 0,
        updatedAt: "",
        updatedAtMs: now - 30_000,
      },
    ];

    expect(getVisibleConversations(conversations, now).map((item) => item.id)).toEqual([
      "expired-pending-customer",
      "verified-customer",
    ]);

    expect(getVisibleConversations(conversations, now + 120_001).map((item) => item.id)).toEqual([
      "pending-new-customer",
      "expired-pending-customer",
      "verified-customer",
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
