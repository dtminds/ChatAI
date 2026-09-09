import { StrictMode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMockWorkbenchService,
  resetWorkbenchService,
  setWorkbenchService,
  type WorkbenchService,
} from "@/pages/chat/api/workbench-service";
import type { Account, CustomerChatStartInput } from "@/pages/chat/chat-types";
import { CustomerPage } from "@/pages/chat/customer-page";

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

function createAccount(
  id: string,
  name: string,
  options: Partial<Account> = {},
): Account {
  return {
    avatarUrl: "",
    description: "",
    id,
    loginStatus: "online",
    metrics: {
      activeCustomers: 0,
      agents: 0,
      stores: 0,
      totalCustomers: 0,
    },
    name,
    operator: "",
    phone: "",
    tone: "",
    ...options,
  };
}

const CURRENT_EMPLOYEE_ID = "sub-user-001";

const customerPageAccounts: Account[] = [
  createAccount("drc", "销售一号", { takenOverEmployeeId: CURRENT_EMPLOYEE_ID }),
  createAccount("ndt", "念都堂"),
  createAccount("support", "销售二号"),
];

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
    vi.clearAllMocks();
  });

  it("defaults to my customers without loading the all-managed-account list", async () => {
    const service = createCustomerPageService();
    setWorkbenchService(service);

    renderCustomerPage();

    expect(await screen.findByRole("heading", { name: "客户" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "我的客户" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByLabelText("席位筛选")).toBeInTheDocument();
    expect(service.getCustomers).not.toHaveBeenCalled();
  });

  it("keeps filters outside the customer list scroll area", async () => {
    const service = createCustomerPageService();
    setWorkbenchService(service);

    renderCustomerPage();

    expect(await screen.findByRole("heading", { name: "客户" })).toBeInTheDocument();

    const scrollViewport = document.querySelector(
      "[data-slot='scroll-area-viewport']",
    );

    expect(scrollViewport).toBeInTheDocument();
    expect(scrollViewport).not.toContainElement(screen.getByLabelText("席位筛选"));
    expect(scrollViewport).not.toContainElement(screen.getByLabelText("搜索客户"));
  });

  it("searches all managed accounts and expands seat relations", async () => {
    const user = userEvent.setup();
    const service = createCustomerPageService();
    setWorkbenchService(service);

    renderCustomerPage();

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
            content: { text: "较晚的客户消息" },
            contentType: "text",
            conversationId,
            createdAt: 1_779_600_003_000,
            customerId: "cust-001",
            msgid: "msg-recent-late",
            rawMsgtype: "text",
            seatId: "drc",
            senderName: "客户A",
            senderType: "customer",
            seq: 101,
            status: "sent",
          },
          {
            content: { text: "较早的客户消息" },
            contentType: "text",
            conversationId,
            createdAt: 1_779_600_001_000,
            customerId: "cust-001",
            msgid: "msg-recent-early",
            rawMsgtype: "text",
            seatId: "drc",
            senderName: "客户A",
            senderType: "customer",
            seq: 102,
            status: "sent",
          },
        ],
        scannedCount: 2,
      };
    });
    setWorkbenchService(service);

    renderCustomerPage();

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

    const previewMessages = await screen.findAllByTestId("history-message-text");
    expect(previewMessages.map((item) => item.textContent)).toEqual([
      "较早的客户消息",
      "较晚的客户消息",
    ]);
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

    renderCustomerPage();

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

    renderCustomerPage();

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

    renderCustomerPage();

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
    const onStartChat = vi.fn();
    setWorkbenchService(service);

    renderCustomerPage({ onStartChat });

    await screen.findByRole("heading", { name: "客户" });
    await user.type(screen.getByLabelText("搜索客户"), "客户A");
    await user.click(screen.getByRole("button", { name: "查询" }));
    await user.hover(
      await screen.findByRole("button", { name: "查看 客户A（张三） 的好友关系" }),
    );
    await user.click(await screen.findByRole("button", { name: "向 销售一号 继续会话" }));

    expect(onStartChat).toHaveBeenCalledWith({
      conversationId: undefined,
      customerAvatar: "",
      customerName: "客户A",
      realName: "张三",
      seatId: "drc",
      thirdExternalUserId: "external-a",
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

    renderCustomerPage();

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

    renderCustomerPage();

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

    renderCustomerPage();

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

    renderCustomerPage();

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

    renderCustomerPage();

    await screen.findByRole("heading", { name: "客户" });
    await user.click(screen.getByRole("tab", { name: "全部客户" }));

    expect(await screen.findByText("未知客户")).toBeInTheDocument();
    expect(screen.queryByText("客户实名")).not.toBeInTheDocument();
  });

  it("hides the seat filter when all customers is selected", async () => {
    const user = userEvent.setup();
    const service = createCustomerPageService();
    setWorkbenchService(service);

    renderCustomerPage();

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

    renderCustomerPage();

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

    renderCustomerPage();

    await screen.findByRole("heading", { name: "客户" });
    await user.click(screen.getByRole("tab", { name: "全部客户" }));

    await user.click(await screen.findByRole("button", { name: "加载更多客户" }));

    const loadMoreButton = screen.getByRole("button", { name: "加载更多客户" });
    expect(loadMoreButton).toBeDisabled();

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

    renderCustomerPage();

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

    renderCustomerPage();

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

    renderCustomerPage();

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
  });

  it("loads customer popover data after StrictMode remount", async () => {
    const user = userEvent.setup();
    const service = createCustomerPageService();
    setWorkbenchService(service);

    renderCustomerPage({ strictMode: true });

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
});

function renderCustomerPage(
  options: {
    onStartChat?: (input: CustomerChatStartInput) => void | Promise<void>;
    strictMode?: boolean;
  } = {},
) {
  const page = (
    <CustomerPage
      accounts={customerPageAccounts}
      currentEmployeeId={CURRENT_EMPLOYEE_ID}
      onStartChat={options.onStartChat}
    />
  );

  render(options.strictMode ? <StrictMode>{page}</StrictMode> : page);
}
