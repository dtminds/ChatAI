import { StrictMode } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { toast } from "sonner";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { routerConfig } from "@/router";
import {
  createMockWorkbenchService,
  resetWorkbenchService,
  setWorkbenchService,
  type WorkbenchService,
} from "@/pages/chat/api/workbench-service";
import { useAuthStore } from "@/store/auth-store";
import { useWorkbenchStore } from "@/store/workbench-store";

vi.mock("sonner", async (importOriginal) => {
  const actual = await importOriginal<typeof import("sonner")>();

  return {
    ...actual,
    toast: {
      ...actual.toast,
      error: vi.fn(),
    },
  };
});

const customerResponse = {
  hasMore: false,
  items: [
    {
      avatar: "",
      bizStatus: 0,
      customerKey: "9001:5:external-a",
      gender: 1,
      name: "客户A",
      platform: 5,
      realName: "张三",
      relationCount: 2,
      seatRelations: [
        {
          bindId: "301",
          bindStatus: 1,
          bindType: 1,
          description: "重点客户",
          lastMessageTime: 1_779_600_000_000,
          seatAvatar: "",
          seatId: "drc",
          seatName: "销售一号",
          thirdUserId: "seat-user-drc",
        },
        {
          bindId: "302",
          bindStatus: 0,
          bindType: 2,
          seatAvatar: "",
          seatId: "support",
          seatName: "销售二号",
          thirdUserId: "seat-user-support",
        },
      ],
      thirdExternalUserId: "external-a",
      uid: 9001,
    },
  ],
  total: 1,
};

const nextCustomerResponse = {
  hasMore: false,
  items: [
    {
      avatar: "",
      bizStatus: 1,
      customerKey: "9001:5:external-b",
      gender: null,
      name: "客户B",
      platform: 5,
      realName: "李四",
      relationCount: 1,
      seatRelations: [
        {
          bindId: "303",
          bindStatus: 1,
          bindType: 1,
          seatAvatar: "",
          seatId: "drc",
          seatName: "销售一号",
          thirdUserId: "seat-user-drc",
        },
      ],
      thirdExternalUserId: "external-b",
      uid: 9001,
    },
  ],
  total: 1,
};

const emptyValueCustomerResponse = {
  hasMore: false,
  items: [
    {
      avatar: "",
      bizStatus: 1,
      customerKey: "9001:5:external-empty",
      gender: null,
      name: "空值客户",
      platform: 5,
      realName: "",
      relationCount: 0,
      seatRelations: [],
      thirdExternalUserId: "external-empty",
      uid: 9001,
    },
  ],
  total: 1,
};

function createCustomerPageService() {
  const baseService = createMockWorkbenchService();

  return {
    ...baseService,
    getCustomerLastConversation: vi.fn().mockResolvedValue({
      lastConversation: {
        conversationId: "conv-001",
        lastMessageTime: 1_779_600_000_000,
        seatAvatar: "",
        seatId: "drc",
        seatName: "销售一号",
      },
    }),
    getCustomerRelationConversations: vi.fn().mockResolvedValue({
      items: [
        {
          lastMessageTime: 1_779_600_000_000,
          thirdUserId: "seat-user-drc",
        },
      ],
    }),
    getMessages: vi.fn(baseService.getMessages),
    getCustomers: vi.fn().mockResolvedValue(customerResponse),
    poll: vi.fn(baseService.poll),
  } as WorkbenchService;
}

describe("CustomerPage", () => {
  beforeAll(async () => {
    await Promise.all([
      import("@/pages/chat/chat-workbench-page"),
      import("@/pages/chat/settings/chat-settings-page"),
    ]);
  });

  beforeEach(() => {
    vi.useFakeTimers({
      shouldAdvanceTime: true,
      toFake: ["Date"],
    });
    vi.setSystemTime(new Date("2026-05-26T10:00:00+08:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
    resetWorkbenchService();
    useAuthStore.setState(useAuthStore.getInitialState(), true);
    vi.clearAllMocks();
  });

  it("defaults to my customers without loading the all-managed-account list", async () => {
    const service = createCustomerPageService();
    setWorkbenchService(service);

    renderRoute("/chat/customers");

    expect(await screen.findByRole("heading", { name: "客户" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "我的客户" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByLabelText("席位筛选")).toBeInTheDocument();
    expect(service.getCustomers).not.toHaveBeenCalled();
    expect(
      screen.getByText("搜索 或 选择一个托管账号来查看客户"),
    ).toBeInTheDocument();
  });

  it("keeps filters outside the customer list scroll area", async () => {
    const service = createCustomerPageService();
    setWorkbenchService(service);

    renderRoute("/chat/customers");

    expect(await screen.findByRole("heading", { name: "客户" })).toBeInTheDocument();

    const scrollViewport = screen
      .getByText("搜索 或 选择一个托管账号来查看客户")
      .closest("[data-slot='scroll-area-viewport']");

    expect(scrollViewport).toBeInTheDocument();
    expect(scrollViewport).not.toContainElement(screen.getByLabelText("席位筛选"));
    expect(scrollViewport).not.toContainElement(screen.getByLabelText("搜索客户"));
    expect(scrollViewport?.parentElement).toHaveClass("flex-1", "min-h-0");
  });

  it("searches all managed accounts and expands seat relations", async () => {
    const user = userEvent.setup();
    const service = createCustomerPageService();
    setWorkbenchService(service);

    renderRoute("/chat/customers");

    await screen.findByRole("heading", { name: "客户" });
    await user.type(screen.getByLabelText("搜索客户"), "客户A");
    expect(service.getCustomers).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "查询" }));

    expect(await screen.findAllByText("客户A（张三）")).not.toHaveLength(0);
    expect(screen.queryByText("客户实名")).not.toBeInTheDocument();
    expect(screen.getByText("最近会话时间")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "刷新 客户A（张三） 的最近会话时间" })).toBeInTheDocument();
    expect(screen.queryByText("5月24日 13:20")).not.toBeInTheDocument();
    expect(screen.queryByText("2026-05-24 13:20")).not.toBeInTheDocument();
    expect(screen.queryByText("external-a")).not.toBeInTheDocument();
    expect(screen.getByText("好友关系")).toBeInTheDocument();
    expect(service.getCustomers).toHaveBeenCalledWith({
      keyword: "客户A",
      limit: 50,
      scope: "mine",
      seatIds: undefined,
    });

    const relatedSeatsButton = screen.getByRole("button", {
      name: "查看 客户A（张三） 的好友关系",
    });
    expect(screen.queryByRole("dialog", { name: "客户详情" })).not.toBeInTheDocument();

    await user.hover(relatedSeatsButton);

    expect(await screen.findByText("好友关系 · 2")).toBeInTheDocument();
    expect(service.getCustomerRelationConversations).toHaveBeenCalledWith(
      "external-a",
      ["seat-user-drc", "seat-user-support"],
    );
    expect(screen.getByText("销售一号")).toBeInTheDocument();
    expect(screen.getByText("销售二号")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "向 销售一号 继续会话" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "销售二号 不可发起会话" })).toBeDisabled();
  });

  it("loads recent messages only after hovering the recent conversation", async () => {
    const user = userEvent.setup();
    const service = createCustomerPageService();
    const observedMessageRequests: Array<{ conversationId: string; limit?: number }> = [];
    const animationFrameSpy = vi.spyOn(window, "requestAnimationFrame");
    vi.mocked(service.getMessages).mockImplementation(async (conversationId, options) => {
      observedMessageRequests.push({ conversationId, limit: options?.limit });

      return {
        filteredCount: 0,
        hasMore: false,
        messages: [
          {
            content: { text: "最近一句客户消息" },
            contentType: "text",
            conversationId,
            createdAt: 1_779_600_000_000,
            customerId: "cust-001",
            msgid: "msg-recent-1",
            rawMsgtype: "text",
            seatId: "drc",
            senderName: "客户A",
            senderType: "customer",
            seq: 101,
            status: "sent",
          },
        ],
        scannedCount: 1,
      };
    });
    setWorkbenchService(service);

    renderRoute("/chat/customers");

    await screen.findByRole("heading", { name: "客户" });
    await user.type(screen.getByLabelText("搜索客户"), "客户A");
    await user.click(screen.getByRole("button", { name: "查询" }));

    const recentConversationButton = await screen.findByRole("button", {
      name: "刷新 客户A（张三） 的最近会话时间",
    });
    observedMessageRequests.length = 0;
    expect(observedMessageRequests).toEqual([]);

    await user.click(recentConversationButton);

    expect(service.getCustomerLastConversation).toHaveBeenCalledWith("external-a");
    const refreshedRecentConversationButton = await screen.findByRole("button", {
      name: "查看 客户A（张三） 的最近会话记录",
    });

    await user.hover(refreshedRecentConversationButton);

    expect(await screen.findByTestId("history-message-text")).toHaveTextContent(
      "最近一句客户消息",
    );
    expect(screen.getByText("最近会话")).toBeInTheDocument();
    expect(screen.queryByText("销售一号")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "继续聊天" })).toBeEnabled();
    expect(observedMessageRequests).toEqual([
      {
        conversationId: "conv-001",
        limit: 10,
      },
    ]);
    expect(animationFrameSpy).not.toHaveBeenCalled();
  });

  it("keeps the recent conversation popover open when the trigger is clicked", async () => {
    const user = userEvent.setup();
    const service = createCustomerPageService();
    setWorkbenchService(service);

    renderRoute("/chat/customers");

    await screen.findByRole("heading", { name: "客户" });
    await user.type(screen.getByLabelText("搜索客户"), "客户A");
    await user.click(screen.getByRole("button", { name: "查询" }));
    await user.click(
      await screen.findByRole("button", {
        name: "刷新 客户A（张三） 的最近会话时间",
      }),
    );

    const recentConversationButton = await screen.findByRole("button", {
      name: "查看 客户A（张三） 的最近会话记录",
    });

    await user.hover(recentConversationButton);
    expect(await screen.findByText("最近会话")).toBeInTheDocument();

    await user.click(recentConversationButton);

    expect(screen.getByText("最近会话")).toBeInTheDocument();
  });

  it("retries recent message preview after a transient failure", async () => {
    const user = userEvent.setup();
    const service = createCustomerPageService();
    let shouldLoadMessages = false;
    vi.mocked(service.getMessages).mockImplementation(async (conversationId) => {
      if (!shouldLoadMessages) {
        throw new Error("最近消息加载失败");
      }

      return {
        filteredCount: 0,
        hasMore: false,
        messages: [
          {
            content: { text: "重试后消息" },
            contentType: "text",
            conversationId,
            createdAt: 1_779_600_000_000,
            customerId: "cust-001",
            msgid: "msg-retry-1",
            rawMsgtype: "text",
            seatId: "drc",
            senderName: "客户A",
            senderType: "customer",
            seq: 102,
            status: "sent",
          },
        ],
        scannedCount: 1,
      };
    });
    setWorkbenchService(service);

    renderRoute("/chat/customers");

    await screen.findByRole("heading", { name: "客户" });
    await user.type(screen.getByLabelText("搜索客户"), "客户A");
    await user.click(screen.getByRole("button", { name: "查询" }));
    await user.click(
      await screen.findByRole("button", {
        name: "刷新 客户A（张三） 的最近会话时间",
      }),
    );

    const recentConversationButton = await screen.findByRole("button", {
      name: "查看 客户A（张三） 的最近会话记录",
    });

    await user.hover(recentConversationButton);
    expect(await screen.findByText("最近会话加载失败")).toBeInTheDocument();
    const failedRequestCount = vi.mocked(service.getMessages).mock.calls.length;
    shouldLoadMessages = true;
    await waitFor(() => {
      expect(failedRequestCount).toBeGreaterThan(0);
    });
    await user.unhover(recentConversationButton);
    await vi.advanceTimersByTimeAsync(150);

    await user.hover(recentConversationButton);

    expect(await screen.findByText("重试后消息")).toBeInTheDocument();
    expect(service.getMessages).toHaveBeenCalledTimes(failedRequestCount + 1);
  });

  it("disables recent conversation continue chat when the seat is not operable", async () => {
    const user = userEvent.setup();
    const service = createCustomerPageService();
    vi.mocked(service.getCustomerLastConversation).mockResolvedValue({
      lastConversation: {
        conversationId: "conv-001",
        lastMessageTime: 1_779_600_000_000,
        seatAvatar: "",
        seatId: "support",
        seatName: "销售二号",
      },
    });
    setWorkbenchService(service);

    renderRoute("/chat/customers");

    await screen.findByRole("heading", { name: "客户" });
    await user.type(screen.getByLabelText("搜索客户"), "客户A");
    await user.click(screen.getByRole("button", { name: "查询" }));
    await user.click(
      await screen.findByRole("button", {
        name: "刷新 客户A（张三） 的最近会话时间",
      }),
    );
    await user.hover(
      await screen.findByRole("button", {
        name: "查看 客户A（张三） 的最近会话记录",
      }),
    );

    expect(await screen.findByRole("button", { name: "继续聊天" })).toBeDisabled();
  });

  it("starts a chat from a managed account relation", async () => {
    const user = userEvent.setup();
    const service = createCustomerPageService();
    setWorkbenchService(service);

    const router = renderRoute("/chat/customers");

    await screen.findByRole("heading", { name: "客户" });
    await user.type(screen.getByLabelText("搜索客户"), "客户A");
    await user.click(screen.getByRole("button", { name: "查询" }));
    await user.hover(
      await screen.findByRole("button", { name: "查看 客户A（张三） 的好友关系" }),
    );
    await user.click(await screen.findByRole("button", { name: "向 销售一号 继续会话" }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/chat");
    });
  });

  it("retries relation conversation timestamps after a transient failure", async () => {
    const user = userEvent.setup();
    const service = createCustomerPageService();
    let shouldLoadRelationConversations = false;
    vi.mocked(service.getCustomerRelationConversations).mockImplementation(async () => {
      if (!shouldLoadRelationConversations) {
        throw new Error("好友关系加载失败");
      }

      return {
        items: [
          {
            lastMessageTime: 1_779_600_000_000,
            thirdUserId: "seat-user-drc",
          },
        ],
      };
    });
    setWorkbenchService(service);

    renderRoute("/chat/customers");

    await screen.findByRole("heading", { name: "客户" });
    await user.type(screen.getByLabelText("搜索客户"), "客户A");
    await user.click(screen.getByRole("button", { name: "查询" }));

    const relatedSeatsButton = await screen.findByRole("button", {
      name: "查看 客户A（张三） 的好友关系",
    });
    await user.hover(relatedSeatsButton);

    expect(await screen.findAllByText("加载失败")).not.toHaveLength(0);
    const failedRequestCount = vi.mocked(
      service.getCustomerRelationConversations,
    ).mock.calls.length;
    shouldLoadRelationConversations = true;
    expect(failedRequestCount).toBeGreaterThan(0);
    await user.unhover(relatedSeatsButton);
    await vi.advanceTimersByTimeAsync(150);
    await waitFor(() => {
      expect(screen.queryByText("好友关系 · 2")).not.toBeInTheDocument();
    });

    await user.hover(relatedSeatsButton);

    await waitFor(() => {
      expect(service.getCustomerRelationConversations).toHaveBeenCalledTimes(
        failedRequestCount + 1,
      );
    });
    expect(screen.queryByText("加载失败")).not.toBeInTheDocument();
    expect(screen.getByText(/^5月24日 \d{2}:\d{2}$/)).toBeInTheDocument();
  });

  it("does not match customers by hidden external user id", async () => {
    const user = userEvent.setup();
    const service = createCustomerPageService();
    vi.mocked(service.getCustomers).mockResolvedValue({
      hasMore: false,
      items: [],
      total: 0,
    });
    setWorkbenchService(service);

    renderRoute("/chat/customers");

    await screen.findByRole("heading", { name: "客户" });
    await user.type(screen.getByLabelText("搜索客户"), "external-a");
    expect(service.getCustomers).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "查询" }));

    expect(screen.queryByText("客户A")).not.toBeInTheDocument();
    expect(screen.getByText("暂无客户")).toBeInTheDocument();
    expect(service.getCustomers).toHaveBeenCalledWith({
      keyword: "external-a",
      limit: 50,
      scope: "mine",
      seatIds: undefined,
    });
  });

  it("uses a single dash for empty table values", async () => {
    const user = userEvent.setup();
    const service = createCustomerPageService();
    vi.mocked(service.getCustomers).mockResolvedValue(emptyValueCustomerResponse);
    vi.mocked(service.getCustomerLastConversation).mockResolvedValue({});
    setWorkbenchService(service);

    renderRoute("/chat/customers");

    await screen.findByRole("heading", { name: "客户" });
    await user.type(screen.getByLabelText("搜索客户"), "空值客户");
    await user.click(screen.getByRole("button", { name: "查询" }));

    expect(await screen.findByText("空值客户")).toBeInTheDocument();
    const refreshButton = screen.getByRole("button", {
      name: "刷新 空值客户 的最近会话时间",
    });
    expect(refreshButton).toBeInTheDocument();

    await user.click(refreshButton);

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "刷新 空值客户 的最近会话时间" }),
      ).not.toBeInTheDocument();
    });
    expect(screen.getAllByText("-")).not.toHaveLength(0);
    expect(screen.queryByRole("button", { name: "查看 空值客户 的最近会话记录" })).not.toBeInTheDocument();
    expect(screen.queryByText("--")).not.toBeInTheDocument();
  });

  it("falls back to unknown customer instead of identifiers when customer names are empty", async () => {
    const user = userEvent.setup();
    const service = createCustomerPageService();
    vi.mocked(service.getCustomers).mockResolvedValueOnce({
      hasMore: false,
      items: [
        {
          avatar: "",
          bizStatus: 1,
          customerKey: "9001:5:external-random-id",
          gender: null,
          name: "",
          platform: 5,
          realName: "",
          relationCount: 0,
          seatRelations: [],
          thirdExternalUserId: "external-random-id",
          uid: 9001,
        },
      ],
      total: 1,
    });
    setWorkbenchService(service);

    renderRoute("/chat/customers");

    await screen.findByRole("heading", { name: "客户" });
    await user.click(screen.getByRole("tab", { name: "全部客户" }));

    expect(await screen.findByText("未知客户")).toBeInTheDocument();
    expect(screen.queryByText("external-random-id")).not.toBeInTheDocument();
  });

  it("treats nullish customer names as unknown customer", async () => {
    const user = userEvent.setup();
    const service = createCustomerPageService();
    vi.mocked(service.getCustomers).mockResolvedValueOnce({
      hasMore: false,
      items: [
        {
          avatar: "",
          bizStatus: 1,
          customerKey: "9001:5:external-null-name",
          gender: null,
          name: null,
          platform: 5,
          realName: "客户实名",
          relationCount: 0,
          seatRelations: [],
          thirdExternalUserId: "external-null-name",
          uid: 9001,
        } as never,
      ],
      total: 1,
    });
    setWorkbenchService(service);

    renderRoute("/chat/customers");

    await screen.findByRole("heading", { name: "客户" });
    await user.click(screen.getByRole("tab", { name: "全部客户" }));

    expect(await screen.findByText("未知客户")).toBeInTheDocument();
    expect(screen.queryByText("客户实名")).not.toBeInTheDocument();
  });

  it("hides the seat filter when all customers is selected", async () => {
    const user = userEvent.setup();
    const service = createCustomerPageService();
    setWorkbenchService(service);

    renderRoute("/chat/customers");

    await screen.findByRole("heading", { name: "客户" });
    await user.click(screen.getByRole("tab", { name: "全部客户" }));

    await waitFor(() => {
      expect(service.getCustomers).toHaveBeenLastCalledWith({
        limit: 50,
        scope: "all",
        seatIds: undefined,
      });
    });
    expect(screen.queryByLabelText("席位筛选")).not.toBeInTheDocument();
  });

  it("loads the next customer page with the returned cursor", async () => {
    const user = userEvent.setup();
    const service = createCustomerPageService();
    vi.mocked(service.getCustomers)
      .mockResolvedValueOnce({
        ...customerResponse,
        hasMore: true,
        nextCursor: "cursor-2",
      })
      .mockResolvedValueOnce(nextCustomerResponse);
    setWorkbenchService(service);

    renderRoute("/chat/customers");

    await screen.findByRole("heading", { name: "客户" });
    await user.click(screen.getByRole("tab", { name: "全部客户" }));
    await user.click(await screen.findByRole("button", { name: "加载更多客户" }));

    expect(service.getCustomers).toHaveBeenLastCalledWith({
      cursor: "cursor-2",
      limit: 50,
      scope: "all",
      seatIds: undefined,
    });
    expect(await screen.findByText("客户B（李四）")).toBeInTheDocument();
    expect(screen.getByText("客户A（张三）")).toBeInTheDocument();
  });

  it("shows a spinning icon while loading more customers", async () => {
    const user = userEvent.setup();
    const service = createCustomerPageService();
    let resolveNextPage: ((value: typeof nextCustomerResponse) => void) | undefined;
    vi.mocked(service.getCustomers)
      .mockResolvedValueOnce({
        ...customerResponse,
        hasMore: true,
        nextCursor: "cursor-2",
      })
      .mockImplementationOnce(
        () =>
          new Promise<typeof nextCustomerResponse>((resolve) => {
            resolveNextPage = resolve;
          }),
      );
    setWorkbenchService(service);

    renderRoute("/chat/customers");

    await screen.findByRole("heading", { name: "客户" });
    await user.click(screen.getByRole("tab", { name: "全部客户" }));

    await user.click(await screen.findByRole("button", { name: "加载更多客户" }));

    const loadMoreButton = screen.getByRole("button", { name: "加载更多客户" });
    expect(loadMoreButton).toBeDisabled();
    expect(loadMoreButton.querySelector("svg")).toHaveClass("animate-spin");

    resolveNextPage?.(nextCustomerResponse);
    expect(await screen.findByText("客户B（李四）")).toBeInTheDocument();
  });

  it("keeps loaded customers visible when loading the next page fails", async () => {
    const user = userEvent.setup();
    const service = createCustomerPageService();
    vi.mocked(service.getCustomers)
      .mockResolvedValueOnce({
        ...customerResponse,
        hasMore: true,
        nextCursor: "cursor-2",
      })
      .mockRejectedValueOnce(new Error("下一页加载失败"));
    setWorkbenchService(service);

    renderRoute("/chat/customers");

    await screen.findByRole("heading", { name: "客户" });
    await user.click(screen.getByRole("tab", { name: "全部客户" }));
    expect(await screen.findByText("客户A（张三）")).toBeInTheDocument();

    await user.click(await screen.findByRole("button", { name: "加载更多客户" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("下一页加载失败");
    });
    expect(screen.getByText("客户A（张三）")).toBeInTheDocument();
    expect(screen.queryByText("下一页加载失败")).not.toBeInTheDocument();
  });

  it("uses the standard customer fallback icon instead of initials", async () => {
    const user = userEvent.setup();
    const service = createCustomerPageService();
    vi.mocked(service.getCustomers).mockResolvedValue({
      hasMore: false,
      items: [
        {
          avatar: "",
          bizStatus: 1,
          customerKey: "9001:5:external-emoji",
          gender: null,
          name: "😀客户",
          platform: 5,
          realName: "",
          relationCount: 0,
          seatRelations: [],
          thirdExternalUserId: "external-emoji",
          uid: 9001,
        },
      ],
      total: 1,
    });
    setWorkbenchService(service);

    renderRoute("/chat/customers");

    await screen.findByRole("heading", { name: "客户" });
    await user.type(screen.getByLabelText("搜索客户"), "😀客户");
    await user.click(screen.getByRole("button", { name: "查询" }));

    expect(await screen.findByText("😀客户")).toBeInTheDocument();
    const avatarFallback = document.querySelector("[data-testid='customer-avatar-fallback']");
    expect(avatarFallback).toBeInTheDocument();
    expect(avatarFallback).toHaveTextContent("");
    expect(avatarFallback?.querySelector("svg")).toBeInTheDocument();
    expect(screen.queryByText("😀")).not.toBeInTheDocument();
  });

  it("falls back when a recent conversation timestamp is invalid", async () => {
    const user = userEvent.setup();
    const service = createCustomerPageService();
    vi.mocked(service.getCustomerLastConversation).mockResolvedValueOnce({
      lastConversation: {
        conversationId: "conv-invalid",
        lastMessageTime: Number.POSITIVE_INFINITY,
        seatAvatar: "",
        seatId: "drc",
        seatName: "销售一号",
      },
    });
    setWorkbenchService(service);

    renderRoute("/chat/customers");

    await screen.findByRole("heading", { name: "客户" });
    await user.type(screen.getByLabelText("搜索客户"), "客户A");
    await user.click(screen.getByRole("button", { name: "查询" }));
    await user.click(
      await screen.findByRole("button", {
        name: "刷新 客户A（张三） 的最近会话时间",
      }),
    );

    expect(await screen.findByText("-")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "查看 客户A（张三） 的最近会话记录" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Unexpected Application Error!")).not.toBeInTheDocument();
  });

  it("loads customer popover data after StrictMode remount", async () => {
    const user = userEvent.setup();
    const service = createCustomerPageService();
    setWorkbenchService(service);

    renderRoute("/chat/customers", { strictMode: true });

    await screen.findByRole("heading", { name: "客户" });
    await user.type(screen.getByLabelText("搜索客户"), "客户A");
    await user.click(screen.getByRole("button", { name: "查询" }));
    await user.click(
      await screen.findByRole("button", {
        name: "刷新 客户A（张三） 的最近会话时间",
      }),
    );

    expect(
      await screen.findByRole("button", { name: "查看 客户A（张三） 的最近会话记录" }),
    ).toBeInTheDocument();

    await user.hover(
      screen.getByRole("button", { name: "查看 客户A（张三） 的好友关系" }),
    );

    expect(await screen.findByRole("button", { name: "向 销售一号 继续会话" })).toBeInTheDocument();
    expect(service.getCustomerLastConversation).toHaveBeenCalledWith("external-a");
    expect(service.getCustomerRelationConversations).toHaveBeenCalledWith(
      "external-a",
      ["seat-user-drc", "seat-user-support"],
    );
  });

  it("navigates back to chat and settings from the account rail", async () => {
    const user = userEvent.setup();
    const service = createCustomerPageService();
    setWorkbenchService(service);

    const router = renderRoute("/chat/customers");

    await screen.findByRole("heading", { name: "客户" });
    await user.click(screen.getByRole("button", { name: "聊天" }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/chat");
    });

    cleanup();

    const settingsRouter = renderRoute("/chat/customers");
    await screen.findByRole("heading", { name: "客户" });
    await user.click(screen.getByRole("button", { name: "打开账号菜单" }));
    await user.click(screen.getByRole("menuitem", { name: "设置" }));
    await waitFor(() => {
      expect(settingsRouter.state.location.pathname).toBe("/chat/settings");
    });
    expect(screen.getByRole("navigation", { name: "设置菜单" })).toBeInTheDocument();
  });

  it("keeps the workbench rail alive and returns to chat when a seat is selected", async () => {
    const user = userEvent.setup();
    const service = createCustomerPageService();
    setWorkbenchService(service);

    const router = renderRoute("/chat/customers");

    expect(await screen.findByRole("heading", { name: "客户" })).toBeInTheDocument();
    expect(screen.getByTestId("chat-workbench-shell")).toBeInTheDocument();
    expect(screen.getByTestId("account-sidebar-item-drc")).not.toHaveClass(
      "bg-sidebar-accent",
    );

    await user.click(screen.getByRole("button", { name: "选择 念都堂" }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/chat");
    });
  });

  it("unbounds the active conversation while the customer page is open", async () => {
    const service = createCustomerPageService();
    setWorkbenchService(service);

    renderRoute("/chat/customers");

    expect(await screen.findByRole("heading", { name: "客户" })).toBeInTheDocument();
    await waitFor(() => {
      expect(useWorkbenchStore.getState().activeConversationId).toBe("");
    });
    expect(useWorkbenchStore.getState().activeMessageSeq).toBe(0);
  });
});

function renderRoute(path: string, options: { strictMode?: boolean } = {}) {
  useAuthStore.getState().setSession({
    accountType: "sub",
    displayName: "客服一号",
    permissions: ["chat.access", "chat.send", "chat.takeover"],
    role: "operator",
    subUserId: "101",
    uid: 1,
  });
  const router = createMemoryRouter(routerConfig, {
    initialEntries: [path],
  });

  render(
    options.strictMode ? (
      <StrictMode>
        <RouterProvider router={router} />
      </StrictMode>
    ) : (
      <RouterProvider router={router} />
    ),
  );

  return router;
}
