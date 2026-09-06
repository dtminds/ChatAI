import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMockWorkbenchService, setWorkbenchService } from "@/pages/chat/api/workbench-service";
import { useWorkbenchStore } from "@/store/workbench-store";
import {
  type WorkbenchConversationSummaryDto,
} from "@chatai/contracts";
import {
  installChatWorkbenchTestEnvironment,
  renderChatWorkbenchPage,
  renderChatWorkbenchRoutePage,
  resetChatWorkbenchTestState,
  renderConversationOpenFromOutsideRoute,
  workbenchToastWarningMock,
} from "./workbench-test-utils";

function createDeferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return {
    promise,
    reject,
    resolve,
  };
}

describe("ChatWorkbenchPage", () => {
  beforeEach(() => {
    vi.useRealTimers();
    window.localStorage.clear();
    resetChatWorkbenchTestState();
    installChatWorkbenchTestEnvironment();
  });

  it("boots chat workbench through the shared test harness", async () => {
    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    expect(screen.getByRole("button", { name: "发送消息" })).toBeInTheDocument();
  });

  it("opens a routed conversation when navigating from the ticket view", async () => {
    const baseService = createMockWorkbenchService();
    const getConversation = vi.fn(baseService.getConversation);
    setWorkbenchService({
      ...baseService,
      getConversation,
    });
    const { router } = renderChatWorkbenchRoutePage("/chat/tickets");

    await waitFor(() => {
      expect(useWorkbenchStore.getState().bootstrapStatus).toBe("ready");
    });
    await waitFor(() => {
      expect(useWorkbenchStore.getState().activeConversationId).toBe("");
    });

    await act(async () => {
      await router.navigate("/chat/conversations/conv-002", {
        state: { openConversation: true },
      });
    });

    await waitFor(() => {
      expect(useWorkbenchStore.getState().activeConversationId).toBe("conv-002");
    });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/chat");
    });
    expect(router.state.location.state).toBeNull();
    expect(useWorkbenchStore.getState().conversationPromotion?.conversationId).toBe(
      "conv-002",
    );
    expect(getConversation).toHaveBeenCalledWith("conv-002");

    await act(async () => {
      await router.navigate(-1);
    });
    expect(router.state.location.pathname).toBe("/chat/tickets");

    await act(async () => {
      await router.navigate(1);
    });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/chat");
    });
    expect(getConversation).toHaveBeenCalledTimes(1);
  });

  it("cancels a pending routed open after leaving the conversation route", async () => {
    const baseService = createMockWorkbenchService();
    const target = await baseService.getConversation("conv-002");
    const targetDeferred = createDeferred<WorkbenchConversationSummaryDto>();
    const getConversation = vi.fn((conversationId: string) =>
      conversationId === "conv-002"
        ? targetDeferred.promise
        : baseService.getConversation(conversationId),
    );
    setWorkbenchService({
      ...baseService,
      getConversation,
    });
    const { router } = renderChatWorkbenchRoutePage("/chat/tickets");

    await waitFor(() => {
      expect(useWorkbenchStore.getState().bootstrapStatus).toBe("ready");
      expect(useWorkbenchStore.getState().activeConversationId).toBe("");
    });

    await act(async () => {
      await router.navigate("/chat/conversations/conv-002", {
        state: { openConversation: true },
      });
    });
    await waitFor(() => {
      expect(getConversation).toHaveBeenCalledWith("conv-002");
    });

    await act(async () => {
      await router.navigate("/chat/tickets");
    });
    targetDeferred.resolve(target);
    await act(async () => {
      await targetDeferred.promise;
      await Promise.resolve();
    });

    expect(useWorkbenchStore.getState().activeConversationId).toBe("");
    expect(useWorkbenchStore.getState().conversationPromotion).toBeUndefined();
    expect(useWorkbenchStore.getState().isConversationLoading).toBe(false);

    await act(async () => {
      await router.navigate("/chat");
    });
    await waitFor(() => {
      expect(useWorkbenchStore.getState().activeConversationId).toBe("conv-001");
    });
  });

  it("lets a newer routed conversation replace a pending routed open", async () => {
    const baseService = createMockWorkbenchService();
    const firstTarget = await baseService.getConversation("conv-002");
    const firstTargetDeferred =
      createDeferred<WorkbenchConversationSummaryDto>();
    const getConversation = vi.fn((conversationId: string) =>
      conversationId === "conv-002"
        ? firstTargetDeferred.promise
        : baseService.getConversation(conversationId),
    );
    setWorkbenchService({
      ...baseService,
      getConversation,
    });
    const { router } = renderChatWorkbenchRoutePage("/chat/tickets");

    await waitFor(() => {
      expect(useWorkbenchStore.getState().bootstrapStatus).toBe("ready");
      expect(useWorkbenchStore.getState().activeConversationId).toBe("");
    });

    await act(async () => {
      await router.navigate("/chat/conversations/conv-002", {
        state: { openConversation: true },
      });
    });
    await waitFor(() => {
      expect(getConversation).toHaveBeenCalledWith("conv-002");
    });

    await act(async () => {
      await router.navigate("/chat/conversations/conv-003", {
        state: { openConversation: true },
      });
    });

    await waitFor(() => {
      expect(useWorkbenchStore.getState().activeConversationId).toBe("conv-003");
      expect(router.state.location.pathname).toBe("/chat");
    });
    expect(useWorkbenchStore.getState().conversationPromotion?.conversationId).toBe(
      "conv-003",
    );

    firstTargetDeferred.resolve(firstTarget);
    await act(async () => {
      await firstTargetDeferred.promise;
      await Promise.resolve();
    });

    expect(useWorkbenchStore.getState().activeConversationId).toBe("conv-003");
    expect(useWorkbenchStore.getState().conversationPromotion?.conversationId).toBe(
      "conv-003",
    );
    expect(getConversation).toHaveBeenCalledWith("conv-003");
  });

  it("captures an in-place conversation route before automatic list selection", async () => {
    const baseService = createMockWorkbenchService();
    const targetConversation = await baseService.getConversation("conv-002");
    const conversationRequest = createDeferred<WorkbenchConversationSummaryDto>();
    const getConversation = vi.fn(() => conversationRequest.promise);
    setWorkbenchService({
      ...baseService,
      getConversation,
    });
    const { router } = renderChatWorkbenchRoutePage("/chat/tickets");

    await waitFor(() => {
      expect(useWorkbenchStore.getState().bootstrapStatus).toBe("ready");
      expect(useWorkbenchStore.getState().activeConversationId).toBe("");
    });

    await act(async () => {
      await router.navigate("/chat/conversations/conv-002", {
        state: { openConversation: true },
      });
    });

    await waitFor(() => {
      expect(getConversation).toHaveBeenCalledWith("conv-002");
    });
    expect(useWorkbenchStore.getState().activeConversationId).toBe("");
    expect(useWorkbenchStore.getState().activeConversationId).not.toBe(
      "conv-001",
    );
    expect(router.state.location.pathname).toBe(
      "/chat/conversations/conv-002",
    );

    conversationRequest.resolve(targetConversation);

    await waitFor(() => {
      expect(useWorkbenchStore.getState().activeConversationId).toBe("conv-002");
      expect(router.state.location.pathname).toBe("/chat");
    });
  });

  it("opens a routed conversation when navigating from outside the workbench route tree", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();
    const targetConversation = await baseService.getConversation("conv-002");
    const conversationRequest = createDeferred<WorkbenchConversationSummaryDto>();
    const getConversation = vi.fn(() => conversationRequest.promise);
    setWorkbenchService({
      ...baseService,
      getConversation,
    });
    const { router } = renderConversationOpenFromOutsideRoute("conv-002");

    await waitFor(() => {
      expect(useWorkbenchStore.getState().bootstrapStatus).toBe("ready");
    });
    await act(async () => {
      await router.navigate("/chat/insights");
    });

    await user.click(screen.getByRole("link", { name: "打开会话" }));

    await waitFor(() => {
      expect(getConversation).toHaveBeenCalledWith("conv-002");
    });
    expect(router.state.location.pathname).toBe(
      "/chat/conversations/conv-002",
    );
    expect(router.state.location.state).toEqual({ openConversation: true });
    expect(useWorkbenchStore.getState().conversationPromotion).toBeUndefined();

    conversationRequest.resolve(targetConversation);

    await waitFor(() => {
      expect(useWorkbenchStore.getState().activeConversationId).toBe("conv-002");
    });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/chat");
    });
    expect(useWorkbenchStore.getState().conversationPromotion?.conversationId).toBe(
      "conv-002",
    );
    expect(getConversation).toHaveBeenCalledWith("conv-002");
    const promotedCard = screen.getByTestId("conversation-card-conv-002");
    const naturallyFirstCard = screen.getByTestId("conversation-card-conv-001");
    expect(
      promotedCard.compareDocumentPosition(naturallyFirstCard) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("keeps the routed conversation intent when the first bootstrap is retried", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();
    const getConversation = vi.fn(baseService.getConversation);
    const getSeats = vi
      .fn(baseService.getSeats)
      .mockRejectedValueOnce(new Error("工作台暂时不可用"));
    setWorkbenchService({
      ...baseService,
      getConversation,
      getSeats,
    });
    const { router } = renderChatWorkbenchRoutePage({
      pathname: "/chat/conversations/conv-002",
      state: { openConversation: true },
    });

    expect(await screen.findByText("工作台初始化失败")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(
      "/chat/conversations/conv-002",
    );
    expect(router.state.location.state).toEqual({ openConversation: true });
    expect(getConversation).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "重新加载" }));

    await waitFor(() => {
      expect(useWorkbenchStore.getState().activeConversationId).toBe("conv-002");
    });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/chat");
    });
    expect(getSeats).toHaveBeenCalledTimes(2);
    expect(getConversation).toHaveBeenCalledWith("conv-002");
    expect(useWorkbenchStore.getState().conversationPromotion?.conversationId).toBe(
      "conv-002",
    );
  });

  it("retries a routed conversation after bootstrap falls back from a partial open failure", async () => {
    const baseService = createMockWorkbenchService();
    const getConversation = vi
      .fn(baseService.getConversation)
      .mockRejectedValueOnce(new Error("会话摘要暂时不可用"));
    setWorkbenchService({
      ...baseService,
      getConversation,
    });
    const { router } = renderChatWorkbenchRoutePage({
      pathname: "/chat/conversations/conv-002",
      state: { openConversation: true },
    });

    await waitFor(() => {
      expect(useWorkbenchStore.getState().activeConversationId).toBe("conv-002");
      expect(
        useWorkbenchStore.getState().conversationPromotion?.conversationId,
      ).toBe("conv-002");
    });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/chat");
    });
    expect(getConversation).toHaveBeenCalledTimes(2);
    expect(useWorkbenchStore.getState().conversationOpenError).toBeUndefined();
  });

  it("keeps a failed routed target and retries it before consuming the route", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();
    const getConversation = vi
      .fn(baseService.getConversation)
      .mockRejectedValueOnce(new Error("会话摘要暂时不可用"));
    setWorkbenchService({
      ...baseService,
      getConversation,
    });
    const { router } = renderChatWorkbenchRoutePage("/chat/tickets");

    await waitFor(() => {
      expect(useWorkbenchStore.getState().bootstrapStatus).toBe("ready");
      expect(useWorkbenchStore.getState().activeConversationId).toBe("");
    });

    await act(async () => {
      await router.navigate("/chat/conversations/conv-002", {
        state: { openConversation: true },
      });
    });

    const errorDialog = await screen.findByRole("alertdialog", {
      name: "开启会话失败",
    });
    expect(router.state.location.pathname).toBe(
      "/chat/conversations/conv-002",
    );
    expect(router.state.location.state).toEqual({ openConversation: true });
    expect(getConversation).toHaveBeenCalledTimes(1);

    await user.click(within(errorDialog).getByRole("button", { name: "重试" }));

    await waitFor(() => {
      expect(useWorkbenchStore.getState().activeConversationId).toBe("conv-002");
    });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/chat");
    });
    expect(getConversation).toHaveBeenCalledTimes(2);
    expect(useWorkbenchStore.getState().conversationOpenError).toBeUndefined();
  });

  it("consumes a failed routed target only after the operator cancels", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();
    const getConversation = vi.fn().mockRejectedValue(new Error("无权打开会话"));
    setWorkbenchService({
      ...baseService,
      getConversation,
    });
    const { router } = renderChatWorkbenchRoutePage("/chat/tickets");

    await waitFor(() => {
      expect(useWorkbenchStore.getState().bootstrapStatus).toBe("ready");
    });
    await act(async () => {
      await router.navigate("/chat/conversations/conv-002", {
        state: { openConversation: true },
      });
    });

    const errorDialog = await screen.findByRole("alertdialog", {
      name: "开启会话失败",
    });
    expect(router.state.location.pathname).toBe(
      "/chat/conversations/conv-002",
    );

    await user.click(within(errorDialog).getByRole("button", { name: "取消" }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/chat");
    });
    expect(router.state.location.state).toBeNull();
    expect(useWorkbenchStore.getState().conversationOpenError).toBeUndefined();
    expect(getConversation).toHaveBeenCalledTimes(1);
  });

  it("opens a state-free cold conversation route without promoting it", async () => {
    const baseService = createMockWorkbenchService();
    const getConversation = vi.fn(baseService.getConversation);
    setWorkbenchService({
      ...baseService,
      getConversation,
    });
    const { router } = renderChatWorkbenchRoutePage(
      "/chat/conversations/conv-002",
    );

    await waitFor(() => {
      expect(useWorkbenchStore.getState().bootstrapStatus).toBe("ready");
    });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/chat");
    });
    expect(router.state.location.state).toBeNull();
    expect(useWorkbenchStore.getState().activeConversationId).toBe("conv-002");
    expect(useWorkbenchStore.getState().conversationPromotion).toBeUndefined();
    expect(getConversation).toHaveBeenCalledWith("conv-002");
  });

  it("keeps the canonical chat URL after deleting an intentionally opened conversation", async () => {
    const user = userEvent.setup();
    const { router } = renderChatWorkbenchRoutePage(
      {
        pathname: "/chat/conversations/conv-002",
        state: { openConversation: true },
      },
    );

    await waitFor(() => {
      expect(useWorkbenchStore.getState().activeConversationId).toBe("conv-002");
    });
    expect(router.state.location.pathname).toBe("/chat");
    expect(useWorkbenchStore.getState().conversationPromotion?.conversationId).toBe(
      "conv-002",
    );

    const activeConversationCard = screen.getByTestId(
      "conversation-card-conv-002",
    );
    await user.click(
      within(activeConversationCard).getByRole("button", {
        name: "会话操作",
      }),
    );
    await user.click(await screen.findByRole("menuitem", { name: "不显示" }));

    await waitFor(() => {
      expect(useWorkbenchStore.getState().activeConversationId).not.toBe(
        "conv-002",
      );
      expect(router.state.location.pathname).toBe("/chat");
    });
  });

  it("locates the loaded handoff trigger message by its existing message seq", async () => {
    const user = userEvent.setup();

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    act(() => {
      useWorkbenchStore.setState((state) => ({
        conversationListsByScope: {
          ...state.conversationListsByScope,
          drc: (state.conversationListsByScope.drc ?? []).map((conversation) =>
            conversation.id === "conv-001"
              ? { ...conversation, handoffMsgId: 3 }
              : conversation,
          ),
        },
      }));
    });

    const targetAnchor = document.querySelector<HTMLElement>(
      '[data-scroll-anchor="3"]',
    );
    const messageViewport = screen.getByTestId("message-scroll-area");
    const scrollIntoView = vi.fn();
    expect(targetAnchor).not.toBeNull();
    Object.defineProperty(targetAnchor!, "scrollIntoView", {
      configurable: true,
      value: (...args: unknown[]) => {
        scrollIntoView(...args);
        fireEvent.scroll(messageViewport);
      },
    });

    await user.click(screen.getByRole("button", { name: "定位消息" }));

    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center",
    });
    expect(targetAnchor).not.toHaveAttribute("data-message-locate-highlight");
    await waitFor(() => {
      expect(targetAnchor).toHaveAttribute(
        "data-message-locate-highlight",
        "true",
      );
    });
    expect(workbenchToastWarningMock).not.toHaveBeenCalled();
  });

  it("keeps the view button available and warns when the trigger message is not loaded", async () => {
    const user = userEvent.setup();

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    act(() => {
      useWorkbenchStore.setState((state) => ({
        conversationListsByScope: {
          ...state.conversationListsByScope,
          drc: (state.conversationListsByScope.drc ?? []).map((conversation) =>
            conversation.id === "conv-001"
              ? { ...conversation, handoffMsgId: 9001 }
              : conversation,
          ),
        },
      }));
    });

    const viewMessageButton = screen.getByRole("button", {
      name: "定位消息",
    });
    expect(viewMessageButton).toBeEnabled();

    await user.click(viewMessageButton);

    expect(workbenchToastWarningMock).toHaveBeenCalledWith(
      "未找到触发消息，请向上加载更多消息后重试",
    );
  });

  it("exits full agent mode when cancel agent hosting is clicked", async () => {
    const user = userEvent.setup();

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });

    act(() => {
      useWorkbenchStore.setState((state) => ({
        accounts: state.accounts.map((account) =>
          account.id === "drc"
            ? {
                ...account,
                seatAIHostingAuth: true,
                seatAIHostingEnabled: true,
                fullAutoSwitch: true,
                takenOverEmployeeId: "sub-user-001",
              }
            : account,
        ),
        conversationListsByScope: {
          ...state.conversationListsByScope,
          drc: (state.conversationListsByScope.drc ?? []).map((conversation) =>
            conversation.id === "conv-001"
              ? {
                  ...conversation,
                  conversationAIHostingSwitch: true,
                  agentHostingStatus: "thinking",
                }
              : conversation,
          ),
        },
      }));
    });

    expect(screen.getByText(/Agent 正在查看消息/)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "请输入消息……" })).toHaveAttribute(
      "contenteditable",
      "false",
    );

    await user.click(screen.getByRole("button", { name: "取消托管" }));

    await waitFor(() => {
      expect(screen.queryByTestId("chat-agent-hosting-status-bar")).not.toBeInTheDocument();
    });
    expect(screen.getByRole("textbox", { name: "请输入消息……" })).toHaveAttribute(
      "contenteditable",
      "true",
    );
  });

  it("does not bootstrap again when the workbench store is already ready", () => {
    const baseService = createMockWorkbenchService();
    const getSeats = vi.fn(baseService.getSeats);

    setWorkbenchService({
      ...baseService,
      getSeats,
    });
    useWorkbenchStore.setState({
      accounts: [],
      activeAccountId: "",
      bootstrapStatus: "ready",
    });

    renderChatWorkbenchPage();

    expect(getSeats).not.toHaveBeenCalled();
  });

  it("does not retry bootstrap automatically after initialization errors", () => {
    const baseService = createMockWorkbenchService();
    const getSeats = vi.fn(baseService.getSeats);

    setWorkbenchService({
      ...baseService,
      getSeats,
    });
    useWorkbenchStore.setState({
      accounts: [],
      activeAccountId: "",
      bootstrapStatus: "error",
    });

    renderChatWorkbenchPage();

    expect(getSeats).not.toHaveBeenCalled();
  });

  it("falls back to all conversations when restored AI hosting view is unavailable", async () => {
    const baseService = createMockWorkbenchService();

    window.localStorage.setItem(
      "chatai.conversationView",
      JSON.stringify({ group: "all", single: "ai" }),
    );
    setWorkbenchService({
      ...baseService,
      async getSeats() {
        const seats = await baseService.getSeats();

        return seats.map((seat) => ({
          ...seat,
          seatAIHostingEnabled: false,
        }));
      },
      async getConversations(seatId, options) {
        const response = await baseService.getConversations(seatId, options);

        return {
          ...response,
          items: response.items.map((conversation, index) => ({
            ...conversation,
            conversationAIHostingSwitch: index === 0,
          })),
        };
      },
    });

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });

    expect(screen.getByRole("tab", { name: "单聊视图" })).toBeInTheDocument();
    expect(screen.queryByText("单聊 · AI托管")).not.toBeInTheDocument();
    expect(window.localStorage.getItem("chatai.conversationView")).toContain('"single":"all"');
  });

  it("resets only the opened chat type to all and temporarily shows the target first", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();
    const target: WorkbenchConversationSummaryDto = {
      conversationAIHostingSwitch: false,
      conversationId: "conv-search-opened",
      customerAvatar: "",
      customerId: "customer-search-opened",
      customerName: "搜索打开客户",
      handoffMsgId: 0,
      lastMessage: "较早消息",
      lastMessageTime: 1,
      mode: "single",
      priority: "medium",
      replied: true,
      seatId: "drc",
      thirdExternalUserId: "external-search-opened",
      thirdUserId: "third-user-drc",
      unreadCount: 0,
    };

    window.localStorage.setItem(
      "chatai.conversationView",
      JSON.stringify({ group: "unread", single: "unread" }),
    );
    setWorkbenchService({
      ...baseService,
      async getMessages(conversationId, options) {
        if (conversationId === target.conversationId) {
          return {
            filteredCount: 0,
            hasMore: false,
            messages: [],
            scannedCount: 0,
          };
        }

        return baseService.getMessages(conversationId, options);
      },
      async getOrCreateConversation() {
        return target;
      },
    });

    const { router } = renderChatWorkbenchRoutePage();
    await screen.findByRole("textbox", { name: "请输入消息……" });

    act(() => {
      useWorkbenchStore.setState({
        isSearchLoading: false,
        searchKeyword: "搜索打开客户",
        searchResults: {
          contacts: [
            {
              avatar: "",
              conversationId: target.conversationId,
              name: target.customerName,
              realName: target.customerName,
              thirdExternalUserId: target.thirdExternalUserId!,
            },
          ],
          groups: [],
        },
      });
    });

    const searchDialog = await screen.findByRole("dialog", {
      name: "搜索结果",
    });
    await user.click(
      within(searchDialog).getByRole("button", {
        name: /搜索打开客户/,
      }),
    );

    await waitFor(() => {
      expect(useWorkbenchStore.getState().activeConversationId).toBe(
        target.conversationId,
      );
    });
    expect(router.state.location.pathname).toBe("/chat");
    await waitFor(() => {
      expect(window.localStorage.getItem("chatai.conversationView")).toBe(
        JSON.stringify({ group: "unread", single: "all" }),
      );
    });

    const targetCard = screen.getByTestId(
      `conversation-card-${target.conversationId}`,
    );
    const previousFirstCard = screen.getByTestId("conversation-card-conv-001");

    expect(
      targetCard.compareDocumentPosition(previousFirstCard) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(useWorkbenchStore.getState().conversationPromotion?.conversationId).toBe(
      target.conversationId,
    );

    await user.click(
      within(previousFirstCard).getByRole("button", { name: /丹阳草莓/ }),
    );

    await waitFor(() => {
      expect(useWorkbenchStore.getState().activeConversationId).toBe("conv-001");
    });
    expect(router.state.location.pathname).toBe("/chat");
    expect(
      targetCard.compareDocumentPosition(previousFirstCard) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(useWorkbenchStore.getState().conversationPromotion?.conversationId).toBe(
      target.conversationId,
    );
  });

  it("keeps the current conversation and filter when opening a search result fails", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();

    window.localStorage.setItem(
      "chatai.conversationView",
      JSON.stringify({ group: "all", single: "unread" }),
    );
    setWorkbenchService({
      ...baseService,
      async getOrCreateConversation() {
        throw new Error("开启失败");
      },
    });

    renderChatWorkbenchPage();
    await screen.findByRole("textbox", { name: "请输入消息……" });
    const activeConversationId =
      useWorkbenchStore.getState().activeConversationId;

    act(() => {
      useWorkbenchStore.setState({
        isSearchLoading: false,
        searchKeyword: "失败客户",
        searchResults: {
          contacts: [
            {
              avatar: "",
              conversationId: "conv-search-failed",
              name: "失败客户",
              realName: "失败客户",
              thirdExternalUserId: "external-search-failed",
            },
          ],
          groups: [],
        },
      });
    });

    const searchDialog = await screen.findByRole("dialog", {
      name: "搜索结果",
    });
    await user.click(
      within(searchDialog).getByRole("button", { name: /失败客户/ }),
    );

    expect(
      await screen.findByRole("alertdialog", { name: "开启会话失败" }),
    ).toBeInTheDocument();
    expect(useWorkbenchStore.getState().activeConversationId).toBe(
      activeConversationId,
    );
    expect(useWorkbenchStore.getState().searchKeyword).toBe("失败客户");
    expect(window.localStorage.getItem("chatai.conversationView")).toBe(
      JSON.stringify({ group: "all", single: "unread" }),
    );
    expect(useWorkbenchStore.getState().conversationPromotion).toBeUndefined();
  });


});
