import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMockWorkbenchService, setWorkbenchService } from "@/pages/chat/api/workbench-service";
import { getFirstUnreadCustomerMessageKey } from "@/pages/chat/hooks/use-visible-unread-conversation-read";
import type { Message } from "@/pages/chat/chat-types";
import { useWorkbenchStore } from "@/store/workbench-store";
import {
  MATERIAL_COLLECTION_BIZ_TYPE,
  type WorkbenchMessageDto,
} from "@chatai/contracts";
import {
  installChatWorkbenchTestEnvironment,
  renderChatWorkbenchPage,
  resetChatWorkbenchTestState,
  workbenchToastSuccessMock,
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

type IntersectionObserverEntryInit = {
  isIntersecting: boolean;
  target: Element;
};

type IntersectionObserverInstance = {
  callback: IntersectionObserverCallback;
  disconnect: ReturnType<typeof vi.fn>;
  observe: ReturnType<typeof vi.fn>;
  options?: IntersectionObserverInit;
  unobserve: ReturnType<typeof vi.fn>;
};

async function pasteIntoComposer(
  user: ReturnType<typeof userEvent.setup>,
  composer: HTMLElement,
  text: string,
) {
  await user.click(composer);
  await user.paste(text);
}

function installIntersectionObserverMock() {
  const instances: IntersectionObserverInstance[] = [];

  class IntersectionObserverMock {
    readonly callback: IntersectionObserverCallback;
    readonly disconnect = vi.fn();
    readonly observe = vi.fn();
    readonly options: IntersectionObserverInit | undefined;
    readonly unobserve = vi.fn();

    constructor(
      callback: IntersectionObserverCallback,
      options?: IntersectionObserverInit,
    ) {
      this.callback = callback;
      this.options = options;
      instances.push(this);
    }
  }

  Object.defineProperty(window, "IntersectionObserver", {
    configurable: true,
    value: IntersectionObserverMock,
  });
  Object.defineProperty(globalThis, "IntersectionObserver", {
    configurable: true,
    value: IntersectionObserverMock,
  });

  return {
    emit(entries: IntersectionObserverEntryInit[]) {
      for (const instance of instances) {
        instance.callback(entries as IntersectionObserverEntry[], instance as unknown as IntersectionObserver);
      }
    },
    instances,
  };
}

function mockScrolledAwayMessageViewport() {
  const viewport = screen.getByTestId("message-viewport");
  const scrollTo = vi.fn();

  Object.defineProperty(viewport, "scrollTo", {
    configurable: true,
    value: scrollTo,
  });
  viewport.scrollTop = -160;

  return {
    scrollTo,
    viewport,
  };
}

function getIntersectionObserverObserveCallCount(
  instances: IntersectionObserverInstance[],
) {
  return instances.reduce(
    (count, instance) => count + instance.observe.mock.calls.length,
    0,
  );
}

function createSmartReplyTextMessageDto({
  id,
  senderType = "customer",
  seq,
  text,
}: {
  id: string;
  senderType?: "customer" | "agent";
  seq: number;
  text: string;
}): WorkbenchMessageDto {
  return {
    content: { text },
    contentType: "text",
    conversationId: "conv-001",
    createdAt: 1_778_400_000_000 + seq * 1_000,
    customerId: "cust-001",
    msgid: id,
    rawMsgtype: "text",
    seatId: "drc",
    senderType,
    seq,
    status: "sent",
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

  it("selects the first visible conversation after changing the active view", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async getSeats() {
        const seats = await baseService.getSeats();

        return seats.map((seat) => ({
          ...seat,
          fullAutoSwitch: seat.seatId === "drc",
          seatAIHostingAuth: seat.seatId === "drc",
        }));
      },
      async getConversations(seatId, options) {
        const response = await baseService.getConversations(seatId, options);

        return {
          ...response,
          items: response.items.map((conversation) => ({
            ...conversation,
            conversationAIHostingSwitch: conversation.conversationId === "conv-002",
          })),
        };
      },
    });

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    expect(useWorkbenchStore.getState().activeConversationId).toBe("conv-001");

    await user.click(screen.getByRole("tab", { name: "单聊视图" }));
    await user.click(screen.getByRole("menuitemradio", { name: "AI托管" }));

    await waitFor(() => {
      expect(useWorkbenchStore.getState().activeConversationId).toBe("conv-002");
    });
  });

  it("keeps the active conversation empty when the selected view has no conversations", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async getSeats() {
        const seats = await baseService.getSeats();

        return seats.map((seat) => ({
          ...seat,
          fullAutoSwitch: seat.seatId === "drc",
          seatAIHostingAuth: seat.seatId === "drc",
        }));
      },
      async getConversations(seatId, options) {
        const response = await baseService.getConversations(seatId, options);

        return {
          ...response,
          items: response.items.map((conversation) => ({
            ...conversation,
            conversationAIHostingSwitch: false,
          })),
        };
      },
    });

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    expect(useWorkbenchStore.getState().activeConversationId).toBe("conv-001");

    await user.click(screen.getByRole("tab", { name: "单聊视图" }));
    await user.click(screen.getByRole("menuitemradio", { name: "AI托管" }));

    await waitFor(() => {
      expect(useWorkbenchStore.getState().activeConversationId).toBe("");
    });
    expect(screen.getByRole("status", { name: "暂无数据" })).toBeVisible();
  });

  it("keeps conversations visible in the current unread view after they become read while adding new unread matches", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();

    setWorkbenchService(baseService);
    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });

    act(() => {
      useWorkbenchStore.setState((state) => {
        const conversations = state.conversationListsByScope.drc ?? [];
        const firstConversation = conversations.find(
          (conversation) => conversation.id === "conv-001",
        );

        if (!firstConversation) {
          return {};
        }

        return {
          conversationListsByScope: {
            ...state.conversationListsByScope,
            drc: [
              ...conversations.map((conversation) =>
                conversation.id === "conv-001"
                  ? {
                      ...conversation,
                      unread: 2,
                    }
                  : {
                      ...conversation,
                      unread: 0,
                    },
              ),
              {
                ...firstConversation,
                customerId: "cust-new-unread",
                customerName: "新未读客户",
                id: "conv-new-unread",
                unread: 0,
                updatedAt: "2026-06-24 10:30:00",
              },
            ],
          },
        };
      });
    });

    await user.click(screen.getByRole("tab", { name: "单聊视图" }));
    await user.click(screen.getByRole("menuitemradio", { name: /^未读/ }));

    act(() => {
      useWorkbenchStore.setState((state) => ({
        conversationListsByScope: {
          ...state.conversationListsByScope,
          drc: (state.conversationListsByScope.drc ?? []).map((conversation) =>
            conversation.id === "conv-001"
              ? {
                  ...conversation,
                  unread: 0,
                }
              : conversation,
          ),
        },
      }));
    });

    const retainedConversationName = useWorkbenchStore
      .getState()
      .conversationListsByScope.drc?.find(
        (conversation) => conversation.id === "conv-001",
      )?.customerName;

    expect(retainedConversationName).toBeDefined();
    const conversationList = screen.getByTestId("conversation-list-scroll-area");

    expect(
      await within(conversationList).findByText(retainedConversationName ?? ""),
    ).toBeVisible();
    expect(
      within(conversationList).queryByText("新未读客户"),
    ).not.toBeInTheDocument();

    expect(
      within(conversationList).getByText(retainedConversationName ?? ""),
    ).toBeVisible();
    expect(
      within(conversationList).queryByText("新未读客户"),
    ).not.toBeInTheDocument();

    act(() => {
      useWorkbenchStore.setState((state) => ({
        conversationListsByScope: {
          ...state.conversationListsByScope,
          drc: (state.conversationListsByScope.drc ?? []).map((conversation) =>
            conversation.id === "conv-new-unread"
              ? {
                  ...conversation,
                  unread: 3,
                  updatedAt: "2026-06-24 10:31:00",
                }
              : conversation,
          ),
        },
      }));
    });

    expect(
      within(conversationList).getByText(retainedConversationName ?? ""),
    ).toBeVisible();
    expect(within(conversationList).getByText("新未读客户")).toBeVisible();
  });

  it("does not switch to and mark read a conversation that is marked unread inside the unread view", async () => {
    const user = userEvent.setup();
    const intersectionObserver = installIntersectionObserverMock();
    const baseService = createMockWorkbenchService();
    const markConversationRead = vi.fn(baseService.markConversationRead);
    const markConversationUnread = vi.fn(baseService.markConversationUnread);

    setWorkbenchService({
      ...baseService,
      markConversationRead,
      markConversationUnread,
    });
    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });

    act(() => {
      useWorkbenchStore.setState((state) => ({
        accounts: state.accounts.map((account) =>
          account.id === "drc"
            ? {
                ...account,
                unreadCount: 1,
              }
            : account,
        ),
        conversationListsByScope: {
          ...state.conversationListsByScope,
          drc: (state.conversationListsByScope.drc ?? []).map((conversation) =>
            conversation.id === "conv-002"
              ? {
                  ...conversation,
                  unread: 1,
                }
              : {
                  ...conversation,
                  unread: 0,
                }
          ),
        },
      }));
    });

    await waitFor(() => {
      expect(useWorkbenchStore.getState().activeConversationId).toBe("conv-001");
    });

    await user.click(screen.getByRole("tab", { name: "单聊视图" }));
    await user.click(screen.getByRole("menuitemradio", { name: /^未读/ }));

    await waitFor(() => {
      expect(useWorkbenchStore.getState().activeConversationId).toBe("conv-002");
    });

    act(() => {
      useWorkbenchStore.setState((state) => ({
        accounts: state.accounts.map((account) =>
          account.id === "drc"
            ? {
                ...account,
                unreadCount: 0,
              }
            : account,
        ),
        conversationListsByScope: {
          ...state.conversationListsByScope,
          drc: (state.conversationListsByScope.drc ?? []).map((conversation) =>
            conversation.id === "conv-002"
              ? {
                  ...conversation,
                  unread: 0,
                }
              : conversation,
          ),
        },
      }));
    });

    const conversationList = screen.getByTestId("conversation-list-scroll-area");

    expect(within(conversationList).getByText("睿白鸽")).toBeVisible();

    markConversationRead.mockClear();
    markConversationUnread.mockClear();

    await user.click(screen.getByRole("button", { name: "会话操作" }));
    await user.click(screen.getByRole("menuitem", { name: /标记未读/ }));

    await waitFor(() => {
      expect(markConversationUnread).toHaveBeenCalledWith("conv-002");
    });

    act(() => {
      for (const instance of intersectionObserver.instances) {
        const target = instance.observe.mock.calls.at(-1)?.[0];

        if (target) {
          intersectionObserver.emit([
            {
              isIntersecting: true,
              target,
            },
          ]);
        }
      }
    });

    expect(useWorkbenchStore.getState().activeConversationId).toBe("conv-002");
    expect(markConversationRead).not.toHaveBeenCalled();

    const messageViewport = screen.getByTestId("message-viewport");
    const firstUnreadMessage = intersectionObserver.instances
      .at(-1)
      ?.observe.mock.calls.at(-1)?.[0] as Element | undefined;

    expect(firstUnreadMessage).toBeDefined();

    vi.spyOn(messageViewport, "getBoundingClientRect").mockReturnValue({
      bottom: 240,
      height: 200,
      left: 0,
      right: 360,
      toJSON: () => ({}),
      top: 40,
      width: 360,
      x: 0,
      y: 40,
    } as DOMRect);
    vi.spyOn(
      firstUnreadMessage ?? document.body,
      "getBoundingClientRect",
    ).mockReturnValue({
      bottom: 320,
      height: 40,
      left: 0,
      right: 360,
      toJSON: () => ({}),
      top: 280,
      width: 360,
      x: 0,
      y: 280,
    } as DOMRect);

    fireEvent.scroll(messageViewport);

    expect(markConversationRead).not.toHaveBeenCalled();

    vi.spyOn(
      firstUnreadMessage ?? document.body,
      "getBoundingClientRect",
    ).mockReturnValue({
      bottom: 160,
      height: 40,
      left: 0,
      right: 360,
      toJSON: () => ({}),
      top: 120,
      width: 360,
      x: 0,
      y: 120,
    } as DOMRect);

    fireEvent.scroll(messageViewport);

    await waitFor(() => {
      expect(markConversationRead).toHaveBeenCalledWith("conv-002");
    });
  });

  it("marks a manually unread active conversation read after sending a reply", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();
    const markConversationRead = vi.fn(baseService.markConversationRead);
    const markConversationUnread = vi.fn(baseService.markConversationUnread);

    setWorkbenchService({
      ...baseService,
      markConversationRead,
      markConversationUnread,
    });
    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });

    act(() => {
      useWorkbenchStore.setState((state) => ({
        accounts: state.accounts.map((account) =>
          account.id === "drc"
            ? {
                ...account,
                unreadCount: 1,
              }
            : account,
        ),
        conversationListsByScope: {
          ...state.conversationListsByScope,
          drc: (state.conversationListsByScope.drc ?? []).map((conversation) =>
            conversation.id === "conv-002"
              ? {
                  ...conversation,
                  unread: 1,
                }
              : {
                  ...conversation,
                  unread: 0,
                }
          ),
        },
      }));
    });

    await user.click(screen.getByRole("tab", { name: "单聊视图" }));
    await user.click(screen.getByRole("menuitemradio", { name: /^未读/ }));

    await waitFor(() => {
      expect(useWorkbenchStore.getState().activeConversationId).toBe("conv-002");
    });

    act(() => {
      useWorkbenchStore.setState((state) => ({
        accounts: state.accounts.map((account) =>
          account.id === "drc"
            ? {
                ...account,
                unreadCount: 0,
              }
            : account,
        ),
        conversationListsByScope: {
          ...state.conversationListsByScope,
          drc: (state.conversationListsByScope.drc ?? []).map((conversation) =>
            conversation.id === "conv-002"
              ? {
                  ...conversation,
                  unread: 0,
                }
              : conversation,
          ),
        },
      }));
    });

    markConversationRead.mockClear();
    markConversationUnread.mockClear();

    await user.click(screen.getByRole("button", { name: "会话操作" }));
    await user.click(screen.getByRole("menuitem", { name: /标记未读/ }));

    await waitFor(() => {
      expect(markConversationUnread).toHaveBeenCalledWith("conv-002");
    });

    const composer = screen.getByRole("textbox", { name: "请输入消息……" });

    await pasteIntoComposer(user, composer, "这条先保留未读，我已经处理");
    await user.click(screen.getByRole("button", { name: "发送消息" }));

    await waitFor(() => {
      expect(markConversationRead).toHaveBeenCalledWith("conv-002");
    });
  });

  it("skips empty message slots when finding the first unread customer message", () => {
    const messages = new Array<Message>(2);
    messages[1] = {
      author: "丹阳草莓，得利市大樱桃",
      content: {
        text: "新消息",
        type: "text",
      },
      conversationId: "conv-001",
      uiMessageKey: "sparse-customer-message",
      role: "customer",
      sender: {
        id: "sender-cust-001",
        name: "丹阳草莓，得利市大樱桃",
      },
      sentAt: "2026-04-14 19:18:50",
      status: "sent",
    };

    expect(getFirstUnreadCustomerMessageKey(messages, 2)).toBe(
      "sparse-customer-message",
    );
  });

  it("marks the active conversation read when the first unread customer message enters the viewport", async () => {
    const intersectionObserver = installIntersectionObserverMock();
    const baseService = createMockWorkbenchService();
    const markConversationRead = vi.fn(baseService.markConversationRead);

    setWorkbenchService({
      ...baseService,
      markConversationRead,
    });

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    markConversationRead.mockClear();

    act(() => {
      useWorkbenchStore.setState((state) => ({
        accounts: state.accounts.map((account) =>
          account.id === "drc"
            ? {
                ...account,
                unreadCount: 2,
              }
            : account,
        ),
        conversationListsByScope: {
          ...state.conversationListsByScope,
          drc: (state.conversationListsByScope.drc ?? []).map((conversation) =>
            conversation.id === "conv-001"
              ? {
                  ...conversation,
                  unread: 2,
                }
              : conversation,
          ),
        },
      }));
    });

    await waitFor(() => {
      expect(intersectionObserver.instances.at(-1)?.observe).toHaveBeenCalled();
    });

    const observedTarget = intersectionObserver.instances.at(-1)?.observe.mock
      .calls.at(-1)?.[0] as Element;

    expect(observedTarget).toHaveAttribute("data-ui-message-key", "8");
    expect(intersectionObserver.instances.at(-1)?.options).toMatchObject({
      threshold: 0,
    });

    act(() => {
      intersectionObserver.emit([
        {
          isIntersecting: true,
          target: observedTarget,
        },
      ]);
    });

    await waitFor(() => {
      expect(markConversationRead).toHaveBeenCalledTimes(1);
    });
    expect(markConversationRead).toHaveBeenCalledWith("conv-001");
  });

  it("shows the smart reply failure reason in the card when generation fails", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async getMessages(conversationId, options) {
        const page = await baseService.getMessages(conversationId, options);

        if (conversationId !== "conv-001") {
          return page;
        }

        return {
          ...page,
          messages: [
            createSmartReplyTextMessageDto({
              id: "msg-customer-7",
              seq: 7,
              text: "客户想了解活动权益",
            }),
            createSmartReplyTextMessageDto({
              id: "msg-agent-8",
              senderType: "agent",
              seq: 8,
              text: "客服已回复",
            }),
          ],
          smartReplies: [],
        };
      },
      async requestSmartReplyGeneralAnswer() {
        throw new Error("当前未配置可用AI助手");
      },
    });

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await user.click(screen.getAllByRole("button", { name: "消息操作" })[0]);
    await user.click(screen.getByRole("menuitem", { name: "话术推荐" }));

    expect(
      await screen.findByText("生成失败：当前未配置可用AI助手"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("smart-reply-card")).not.toBeInTheDocument();
    expect(workbenchToastWarningMock).not.toHaveBeenCalledWith(
      "当前未配置可用AI助手",
    );
  });

  it("fills the composer from a smart reply without sending it", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();
    const sendMessage = vi.fn(baseService.sendMessage);

    setWorkbenchService({
      ...baseService,
      async getMessages(conversationId, options) {
        const page = await baseService.getMessages(conversationId, options);

        if (conversationId !== "conv-001") {
          return page;
        }

        return {
          ...page,
          messages: [
            createSmartReplyTextMessageDto({
              id: "msg-customer-7",
              seq: 7,
              text: "客户想了解活动权益",
            }),
            createSmartReplyTextMessageDto({
              id: "msg-agent-8",
              senderType: "agent",
              seq: 8,
              text: "客服已回复",
            }),
          ],
          smartReplies: [],
        };
      },
      async requestSmartReplyGeneralAnswer() {
        return {
          suggestion: {
            assistantName: "护肤小助手",
            content: "建议先确认权益清单口径",
            generateStatus: 2,
            messageId: "10",
            pollComplete: true,
            recordId: "smart-reply-001",
            status: "ready",
          },
        };
      },
      sendMessage,
    });

    renderChatWorkbenchPage();

    const composer = await screen.findByRole("textbox", { name: "请输入消息……" });
    await user.click(screen.getAllByRole("button", { name: "消息操作" })[0]);
    await user.click(screen.getByRole("menuitem", { name: "话术推荐" }));
    expect(await screen.findByTestId("smart-reply-card")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "填入输入框" }));

    expect(composer).toHaveTextContent("建议先确认权益清单口径");
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("scrolls to the visual bottom after sending a composer message", async () => {
    const user = userEvent.setup();

    renderChatWorkbenchPage();

    const composer = await screen.findByRole("textbox", { name: "请输入消息……" });
    const { scrollTo } = mockScrolledAwayMessageViewport();

    await pasteIntoComposer(user, composer, "我来确认一下权益清单");
    await user.click(screen.getByRole("button", { name: "发送消息" }));

    await waitFor(() => {
      expect(scrollTo).toHaveBeenCalledWith({
        behavior: "smooth",
        top: 0,
      });
    });
  });

  it("scrolls to the visual bottom after sending a smart reply", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async getMessages(conversationId, options) {
        const page = await baseService.getMessages(conversationId, options);

        if (conversationId !== "conv-001") {
          return page;
        }

        return {
          ...page,
          messages: [
            createSmartReplyTextMessageDto({
              id: "msg-customer-9",
              seq: 9,
              text: "客户想了解活动权益",
            }),
          ],
          smartReplies: [
            {
              assistantName: "护肤小助手",
              content: "建议先确认权益清单口径",
              generateStatus: 2,
              messageId: "9",
              pollComplete: true,
              recordId: "smart-reply-001",
              status: "ready",
            },
          ],
        };
      },
    });

    renderChatWorkbenchPage();

    await screen.findByText("建议先确认权益清单口径");
    const { scrollTo } = mockScrolledAwayMessageViewport();

    await user.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => {
      expect(scrollTo).toHaveBeenCalledWith({
        behavior: "smooth",
        top: 0,
      });
    });
  });

  it("regenerates from the smart reply card even when a local suggestion exists", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();
    const requestSmartReplyGeneralAnswer = vi.fn(
      async (request: { msgId: number }) => ({
        suggestion: {
          assistantName: "护肤小助手",
          content: `重新生成话术 ${request.msgId}`,
          generateStatus: 2,
          messageId: String(request.msgId),
          pollComplete: true,
          recordId: "smart-reply-regenerated",
          status: "ready" as const,
        },
      }),
    );

    setWorkbenchService({
      ...baseService,
      async getMessages(conversationId, options) {
        const page = await baseService.getMessages(conversationId, options);

        if (conversationId !== "conv-001") {
          return page;
        }

        return {
          ...page,
          messages: [
            createSmartReplyTextMessageDto({
              id: "msg-customer-9",
              seq: 9,
              text: "客户想了解活动权益",
            }),
          ],
          smartReplies: [
            {
              assistantName: "护肤小助手",
              content: "已有推荐话术",
              generateStatus: 2,
              messageId: "9",
              pollComplete: true,
              recordId: "smart-reply-existing",
              status: "ready",
            },
          ],
        };
      },
      requestSmartReplyGeneralAnswer,
    });

    renderChatWorkbenchPage();

    await screen.findByText("已有推荐话术");

    await user.click(screen.getByRole("button", { name: "更多智能回复操作" }));
    await user.click(screen.getByRole("menuitem", { name: "重新生成" }));

    expect(requestSmartReplyGeneralAnswer).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "conv-001",
        msgId: 9,
      }),
    );
    expect(await screen.findByText("重新生成话术 9")).toBeInTheDocument();
    expect(screen.queryByText("已有推荐话术")).not.toBeInTheDocument();
  });

  it("hides answered page smart replies until the recommendation action is selected", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();
    const observedSmartReplyRequests: Array<{ conversationId: string; msgIds: number[] }> = [];
    const observedGeneralAnswerRequests: Array<{ conversationId: string; msgId: number }> = [];

    setWorkbenchService({
      ...baseService,
      async getMessages(conversationId, options) {
        const page = await baseService.getMessages(conversationId, options);

        if (conversationId !== "conv-001") {
          return page;
        }

        return {
          ...page,
          messages: [
            createSmartReplyTextMessageDto({
              id: "msg-customer-7",
              seq: 7,
              text: "客户想了解活动权益",
            }),
            createSmartReplyTextMessageDto({
              id: "msg-agent-8",
              senderType: "agent",
              seq: 8,
              text: "客服已回复",
            }),
            createSmartReplyTextMessageDto({
              id: "msg-customer-9",
              seq: 9,
              text: "最新客户问题",
            }),
          ],
          smartReplies: [
            {
              assistantName: "智能助手",
              content: "旧问题推荐话术",
              generateStatus: 2,
              messageId: "7",
              pollComplete: true,
              status: "ready",
            },
            {
              assistantName: "智能助手",
              content: "最新问题推荐话术",
              generateStatus: 2,
              messageId: "9",
              pollComplete: true,
              status: "ready",
            },
          ],
        };
      },
      async pollSmartReplies(request) {
        observedSmartReplyRequests.push(request);

        return { suggestions: [] };
      },
      async requestSmartReplyGeneralAnswer(request) {
        observedGeneralAnswerRequests.push(request);

        return { suggestion: null };
      },
    });

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    expect(screen.queryByText("旧问题推荐话术")).not.toBeInTheDocument();
    expect(screen.getByText("最新问题推荐话术")).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "消息操作" })[0]);
    await user.click(screen.getByRole("menuitem", { name: "话术推荐" }));

    expect(screen.getByText("旧问题推荐话术")).toBeInTheDocument();
    expect(observedSmartReplyRequests).toEqual([]);
    expect(observedGeneralAnswerRequests).toEqual([]);
  });

  it("observes the first unread customer message within the unread tail", async () => {
    const intersectionObserver = installIntersectionObserverMock();
    const baseService = createMockWorkbenchService();
    const markConversationRead = vi.fn(baseService.markConversationRead);

    setWorkbenchService({
      ...baseService,
      markConversationRead,
    });

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    markConversationRead.mockClear();

    act(() => {
      useWorkbenchStore.setState((state) => ({
        accounts: state.accounts.map((account) =>
          account.id === "drc"
            ? {
                ...account,
                unreadCount: 2,
              }
            : account,
        ),
        conversationListsByScope: {
          ...state.conversationListsByScope,
          drc: (state.conversationListsByScope.drc ?? []).map((conversation) =>
            conversation.id === "conv-001"
              ? {
                  ...conversation,
                  unread: 2,
                }
              : conversation,
          ),
        },
        messagesByConversationId: {
          ...state.messagesByConversationId,
          "conv-001": [
            ...(state.messagesByConversationId["conv-001"] ?? []),
            {
              author: "德瑞可-小可",
              content: {
                text: "系统提示",
                type: "system",
              },
              conversationId: "conv-001",
              uiMessageKey: "system-unread-tail",
              role: "system",
              sentAt: "2026-04-14 19:18:40",
              status: "sent",
            },
          ],
        },
      }));
    });

    await waitFor(() => {
      expect(intersectionObserver.instances.at(-1)?.observe).toHaveBeenCalled();
    });

    const observedTarget = intersectionObserver.instances.at(-1)?.observe.mock
      .calls.at(-1)?.[0] as Element;

    expect(observedTarget).toHaveAttribute("data-ui-message-key", "9");
  });

  it("waits until conversation loading finishes before observing unread messages", async () => {
    const intersectionObserver = installIntersectionObserverMock();
    const baseService = createMockWorkbenchService();
    const markConversationRead = vi.fn(baseService.markConversationRead);

    setWorkbenchService({
      ...baseService,
      markConversationRead,
    });

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    markConversationRead.mockClear();
    const observeCallCountBeforeLoading = getIntersectionObserverObserveCallCount(
      intersectionObserver.instances,
    );

    act(() => {
      useWorkbenchStore.setState((state) => ({
        accounts: state.accounts.map((account) =>
          account.id === "drc"
            ? {
                ...account,
                unreadCount: 2,
              }
            : account,
        ),
        conversationListsByScope: {
          ...state.conversationListsByScope,
          drc: (state.conversationListsByScope.drc ?? []).map((conversation) =>
            conversation.id === "conv-001"
              ? {
                  ...conversation,
                  unread: 2,
                }
              : conversation,
          ),
        },
        isConversationLoading: true,
      }));
    });

    expect(getIntersectionObserverObserveCallCount(intersectionObserver.instances)).toBe(
      observeCallCountBeforeLoading,
    );

    act(() => {
      useWorkbenchStore.setState({
        isConversationLoading: false,
      });
    });

    await waitFor(() => {
      expect(getIntersectionObserverObserveCallCount(intersectionObserver.instances)).toBe(
        observeCallCountBeforeLoading + 1,
      );
    });
  });

  it("rebinds the unread observer when messages remount with the same first unread id", async () => {
    const intersectionObserver = installIntersectionObserverMock();
    const baseService = createMockWorkbenchService();
    const markConversationRead = vi.fn(baseService.markConversationRead);

    setWorkbenchService({
      ...baseService,
      markConversationRead,
    });

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    markConversationRead.mockClear();

    act(() => {
      useWorkbenchStore.setState((state) => ({
        accounts: state.accounts.map((account) =>
          account.id === "drc"
            ? {
                ...account,
                unreadCount: 2,
              }
            : account,
        ),
        conversationListsByScope: {
          ...state.conversationListsByScope,
          drc: (state.conversationListsByScope.drc ?? []).map((conversation) =>
            conversation.id === "conv-001"
              ? {
                  ...conversation,
                  unread: 2,
                }
              : conversation,
          ),
        },
      }));
    });

    await waitFor(() => {
      expect(intersectionObserver.instances.at(-1)?.observe).toHaveBeenCalled();
    });

    const firstObservedTarget = intersectionObserver.instances.at(-1)?.observe.mock
      .calls.at(-1)?.[0] as Element;

    expect(firstObservedTarget).toHaveAttribute("data-ui-message-key", "8");
    const observeCallCountBeforeMessageUpdate =
      getIntersectionObserverObserveCallCount(intersectionObserver.instances);

    act(() => {
      useWorkbenchStore.setState((state) => ({
        messagesByConversationId: {
          ...state.messagesByConversationId,
          "conv-001": (state.messagesByConversationId["conv-001"] ?? []).map(
            (message) =>
              message.uiMessageKey === "8"
                ? {
                    ...message,
                    optNo: "opt-remounted-msg-009",
                  }
                : message,
          ),
        },
      }));
    });

    await waitFor(() => {
      expect(getIntersectionObserverObserveCallCount(intersectionObserver.instances)).toBe(
        observeCallCountBeforeMessageUpdate + 1,
      );
    });

    const nextObservedTarget = intersectionObserver.instances.at(-1)?.observe.mock
      .calls.at(-1)?.[0] as Element;
    const currentUnreadElement = document.querySelector('[data-ui-message-key="8"]');

    expect(nextObservedTarget).toHaveAttribute("data-ui-message-key", "8");
    expect(nextObservedTarget).toBe(currentUnreadElement);
  });

  it("throttles visible unread read requests for the same active conversation", async () => {
    const intersectionObserver = installIntersectionObserverMock();
    const baseService = createMockWorkbenchService();
    const markConversationRead = vi.fn(baseService.markConversationRead);

    setWorkbenchService({
      ...baseService,
      markConversationRead,
    });

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    markConversationRead.mockClear();

    act(() => {
      useWorkbenchStore.setState((state) => ({
        accounts: state.accounts.map((account) =>
          account.id === "drc"
            ? {
                ...account,
                unreadCount: 2,
              }
            : account,
        ),
        conversationListsByScope: {
          ...state.conversationListsByScope,
          drc: (state.conversationListsByScope.drc ?? []).map((conversation) =>
            conversation.id === "conv-001"
              ? {
                  ...conversation,
                  unread: 2,
                }
              : conversation,
          ),
        },
      }));
    });

    await waitFor(() => {
      expect(intersectionObserver.instances.at(-1)?.observe).toHaveBeenCalled();
    });

    const observedTarget = intersectionObserver.instances.at(-1)?.observe.mock
      .calls.at(-1)?.[0] as Element;

    act(() => {
      intersectionObserver.emit([
        {
          isIntersecting: true,
          target: observedTarget,
        },
      ]);
    });

    await waitFor(() => {
      expect(markConversationRead).toHaveBeenCalledTimes(1);
    });

    act(() => {
      useWorkbenchStore.setState((state) => ({
        accounts: state.accounts.map((account) =>
          account.id === "drc"
            ? {
                ...account,
                unreadCount: 2,
              }
            : account,
        ),
        conversationListsByScope: {
          ...state.conversationListsByScope,
          drc: (state.conversationListsByScope.drc ?? []).map((conversation) =>
            conversation.id === "conv-001"
              ? {
                  ...conversation,
                  unread: 2,
                }
              : conversation,
          ),
        },
      }));
    });

    act(() => {
      intersectionObserver.emit([
        {
          isIntersecting: true,
          target: observedTarget,
        },
      ]);
    });

    expect(markConversationRead).toHaveBeenCalledTimes(1);
  });

  it("marks the active conversation read after sending a reply while unread remains", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();
    const markConversationRead = vi.fn(baseService.markConversationRead);

    setWorkbenchService({
      ...baseService,
      markConversationRead,
    });

    renderChatWorkbenchPage();

    const composer = await screen.findByRole("textbox", { name: "请输入消息……" });
    markConversationRead.mockClear();

    act(() => {
      useWorkbenchStore.setState((state) => ({
        accounts: state.accounts.map((account) =>
          account.id === "drc"
            ? {
                ...account,
                unreadCount: 2,
              }
            : account,
        ),
        conversationListsByScope: {
          ...state.conversationListsByScope,
          drc: (state.conversationListsByScope.drc ?? []).map((conversation) =>
            conversation.id === "conv-001"
              ? {
                  ...conversation,
                  unread: 2,
                }
              : conversation,
          ),
        },
      }));
    });

    await pasteIntoComposer(user, composer, "我来确认一下权益清单");
    await user.click(screen.getByRole("button", { name: "发送消息" }));

    await waitFor(() => {
      expect(markConversationRead).toHaveBeenCalledTimes(1);
    });
    expect(markConversationRead).toHaveBeenCalledWith("conv-001");
  });

  it("switches conversation mode and shows the matching conversation", async () => {
    const user = userEvent.setup();

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await user.click(screen.getByRole("tab", { name: "群聊" }));

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "群聊视图", selected: true })).toBeInTheDocument();
      expect(useWorkbenchStore.getState()).toMatchObject({
        activeConversationId: "conv-004",
        activeMode: "group",
      });
    });
  });

  it("shows a retry icon before failed messages and retries on click", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();
    const retrySendGate = createDeferred<Awaited<ReturnType<typeof baseService.sendMessage>>>();
    let sendCount = 0;

    setWorkbenchService({
      ...baseService,
      async sendMessage(payload) {
        sendCount += 1;

        if (sendCount === 2) {
          return retrySendGate.promise;
        }

        return baseService.sendMessage(payload);
      },
    });

    renderChatWorkbenchPage();

    const composer = await screen.findByRole("textbox", { name: "请输入消息……" });
    await user.click(composer);
    await user.paste("这条消息 [fail]");
    await user.click(screen.getByRole("button", { name: "发送消息" }));

    await waitFor(() => {
      const latestMessage =
        useWorkbenchStore.getState().messagesByConversationId["conv-001"].at(-1);

      expect(latestMessage).toMatchObject({
        optNo: expect.any(String),
        status: "accepted",
      });
      expect(latestMessage?.msgid).toBeUndefined();
    });

    await useWorkbenchStore.getState().pollWorkbench();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "重试发送" })).toBeInTheDocument();
    });

    const beforeRetryId =
      useWorkbenchStore.getState().messagesByConversationId["conv-001"].at(-1)?.uiMessageKey;
    const viewport = screen.getByTestId("message-viewport");
    const scrollTo = vi.fn();
    Object.defineProperty(viewport, "scrollTo", {
      configurable: true,
      value: scrollTo,
    });
    viewport.scrollTop = -160;

    await user.click(screen.getByRole("button", { name: "重试发送" }));

    const retryingButton = await screen.findByRole("button", {
      name: "正在重试发送",
    });

    expect(retryingButton).toBeDisabled();
    expect(retryingButton).toHaveAttribute("aria-busy", "true");

    retrySendGate.resolve({
      optNo: "retry-opt-001",
      status: "accepted",
    });

    await waitFor(() => {
      const latestMessage =
        useWorkbenchStore.getState().messagesByConversationId["conv-001"].at(-1);

      expect(latestMessage).toMatchObject({
        status: "accepted",
      });
      expect(latestMessage?.uiMessageKey).not.toBe(beforeRetryId);
    });
    expect(scrollTo).toHaveBeenCalledWith({
      top: 0,
      behavior: "smooth",
    });
  });

  it("warns when retrying an unsupported failed message type", async () => {
    const user = userEvent.setup();

    renderChatWorkbenchPage();
    await screen.findByRole("textbox", { name: "请输入消息……" });

    useWorkbenchStore.setState((state) => ({
      messagesByConversationId: {
        ...state.messagesByConversationId,
        "conv-001": [
          ...(state.messagesByConversationId["conv-001"] ?? []),
          {
            author: "客服一号",
            content: {
              audioUrl: "https://cdn.example.com/voice.amr",
              durationLabel: "0:05",
              type: "voice",
            },
            conversationId: "conv-001",
            failReason: "模拟发送失败",
            uiMessageKey: "unsupported-failed-message",
            role: "agent",
            sender: {
              id: "agent-001",
              name: "客服一号",
            },
            sentAt: "2026-05-20 10:00:00",
            status: "failed",
          },
        ],
      },
    }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "重试发送" })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "重试发送" }));

    expect(workbenchToastWarningMock).toHaveBeenCalledWith("暂不支持重发该消息");
  });

  it("shows a fallback warning when retry fails without an error message", async () => {
    const user = userEvent.setup();
    const retryFailedMessage = vi.fn(async () => ({
      errorCode: "UNSUPPORTED_RETRY_MESSAGE",
      reason: "unavailable" as const,
      ok: false as const,
    }));

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    useWorkbenchStore.setState((state) => ({
      ...state,
      retryFailedMessage,
    }));

    useWorkbenchStore.setState((state) => ({
      messagesByConversationId: {
        ...state.messagesByConversationId,
        "conv-001": [
          ...(state.messagesByConversationId["conv-001"] ?? []),
          {
            author: "客服一号",
            content: {
              text: "重试失败但没有错误消息",
              type: "text",
            },
            conversationId: "conv-001",
            failReason: "模拟发送失败",
            uiMessageKey: "failed-message-without-error-message",
            role: "agent",
            sender: {
              id: "agent-001",
              name: "客服一号",
            },
            sentAt: "2026-05-20 10:00:00",
            status: "failed",
          },
        ],
      },
    }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "重试发送" })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "重试发送" }));

    expect(retryFailedMessage).toHaveBeenCalledWith("failed-message-without-error-message");
    expect(workbenchToastWarningMock).toHaveBeenCalledWith("重试失败，请稍后重试");
  });

  it("does not scroll the current conversation when retry succeeds after switching away", async () => {
    const user = userEvent.setup();
    const retryGate = createDeferred<{
      ok: true;
    }>();
    const retryFailedMessage = vi.fn(() => retryGate.promise);

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    useWorkbenchStore.setState((state) => ({
      ...state,
      retryFailedMessage,
    }));
    useWorkbenchStore.setState((state) => ({
      messagesByConversationId: {
        ...state.messagesByConversationId,
        "conv-001": [
          ...(state.messagesByConversationId["conv-001"] ?? []),
          {
            author: "客服一号",
            content: {
              text: "切走后重试成功",
              type: "text",
            },
            conversationId: "conv-001",
            failReason: "模拟发送失败",
            uiMessageKey: "failed-message-switch-success",
            role: "agent",
            sender: {
              id: "agent-001",
              name: "客服一号",
            },
            sentAt: "2026-05-20 10:00:00",
            status: "failed",
          },
        ],
      },
    }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "重试发送" })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "重试发送" }));
    const viewport = screen.getByTestId("message-viewport");
    const scrollTo = vi.fn();
    Object.defineProperty(viewport, "scrollTo", {
      configurable: true,
      value: scrollTo,
    });

    await act(async () => {
      await useWorkbenchStore.getState().setActiveConversation("conv-002");
    });
    retryGate.resolve({
      ok: true,
    });

    await waitFor(() => {
      expect(retryFailedMessage).toHaveBeenCalledWith("failed-message-switch-success");
    });
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("does not show retry warnings after switching away from the retried conversation", async () => {
    const user = userEvent.setup();
    const retryGate = createDeferred<{
      errorCode: string;
      errorMessage: string;
      reason: "send";
      ok: false;
    }>();
    const retryFailedMessage = vi.fn(() => retryGate.promise);

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    useWorkbenchStore.setState((state) => ({
      ...state,
      retryFailedMessage,
    }));
    useWorkbenchStore.setState((state) => ({
      messagesByConversationId: {
        ...state.messagesByConversationId,
        "conv-001": [
          ...(state.messagesByConversationId["conv-001"] ?? []),
          {
            author: "客服一号",
            content: {
              text: "切走后重试失败",
              type: "text",
            },
            conversationId: "conv-001",
            failReason: "模拟发送失败",
            uiMessageKey: "failed-message-switch-error",
            role: "agent",
            sender: {
              id: "agent-001",
              name: "客服一号",
            },
            sentAt: "2026-05-20 10:00:00",
            status: "failed",
          },
        ],
      },
    }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "重试发送" })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "重试发送" }));

    await act(async () => {
      await useWorkbenchStore.getState().setActiveConversation("conv-002");
    });
    retryGate.resolve({
      errorCode: "RETRY_FAILED",
      errorMessage: "旧会话重试失败",
      reason: "send",
      ok: false,
    });

    await waitFor(() => {
      expect(retryFailedMessage).toHaveBeenCalledWith("failed-message-switch-error");
    });
    expect(workbenchToastWarningMock).not.toHaveBeenCalledWith("旧会话重试失败");
  });

  it("disables the composer while the active conversation send request is pending", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();
    const sendGate = createDeferred();

    setWorkbenchService({
      ...baseService,
      async sendMessage(payload) {
        await sendGate.promise;

        return baseService.sendMessage(payload);
      },
    });

    renderChatWorkbenchPage();

    const composer = await screen.findByRole("textbox", { name: "请输入消息……" });
    await pasteIntoComposer(user, composer, "第一段还在发送");
    await user.click(screen.getByRole("button", { name: "发送消息" }));

    await waitFor(() => {
      expect(
        useWorkbenchStore.getState().sendStatusByConversationId["conv-001"],
      ).toBe("sending");
    });
    expect(screen.getByRole("textbox", { name: "请输入消息……" })).toHaveAttribute(
      "aria-readonly",
      "true",
    );
    expect(screen.queryByText("当前会话暂不可发送消息")).not.toBeInTheDocument();

    sendGate.resolve();
    await waitFor(() => {
      expect(
        useWorkbenchStore.getState().sendStatusByConversationId["conv-001"],
      ).toBe("idle");
    });
    expect(screen.getByRole("textbox", { name: "请输入消息……" })).not.toHaveAttribute(
      "aria-readonly",
      "true",
    );
  });

  it("keeps Enter behavior help in the menu without a persistent footer hint", async () => {
    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });

    expect(screen.queryByText("Enter 发送，Shift + Enter 换行。")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "选择 Enter 键行为" })).toHaveTextContent(
      "Enter 发送",
    );

    fireEvent.keyDown(screen.getByRole("combobox", { name: "选择 Enter 键行为" }), {
      key: "ArrowDown",
    });

    expect(screen.getByText("Enter 发送，Shift + Enter 换行")).toBeInTheDocument();
    expect(screen.getByText("Enter 换行，Shift + Enter 发送")).toBeInTheDocument();
  });

  it("does not send when using the newline shortcut", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();
    const sendMessage = vi.fn(baseService.sendMessage);

    setWorkbenchService({
      ...baseService,
      sendMessage,
    });

    renderChatWorkbenchPage();

    const composer = await screen.findByRole("textbox", { name: "请输入消息……" });
    await pasteIntoComposer(user, composer, "第一行");
    const wasPrevented = !fireEvent.keyDown(composer, {
      key: "Enter",
      shiftKey: true,
    });

    expect(wasPrevented).toBe(true);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("shows the API error message instead of the error code when send fails", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async sendMessage() {
        throw {
          code: "SEAT_NOT_TAKEN_OVER",
          message: "当前账号尚未由你接管，无法发送消息",
          status: 403,
        };
      },
    });

    renderChatWorkbenchPage();

    const composer = await screen.findByRole("textbox", { name: "请输入消息……" });
    await pasteIntoComposer(user, composer, "这条消息会触发失败");
    await user.click(screen.getByRole("button", { name: "发送消息" }));

    await screen.findByRole("alertdialog", { name: "发送失败，请稍后重试" });

    expect(
      screen.getByText("当前账号尚未由你接管，无法发送消息"),
    ).toBeInTheDocument();
    expect(screen.queryByText("ErrorCode: SEAT_NOT_TAKEN_OVER")).not.toBeInTheDocument();
  });

  it("falls back to the error code when send fails without an API message", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async sendMessage() {
        throw {
          code: "SEND_RATE_LIMITED",
          status: 429,
        };
      },
    });

    renderChatWorkbenchPage();

    const composer = await screen.findByRole("textbox", { name: "请输入消息……" });
    await pasteIntoComposer(user, composer, "这条消息没有接口文案");
    await user.click(screen.getByRole("button", { name: "发送消息" }));

    await screen.findByRole("alertdialog", { name: "发送失败，请稍后重试" });

    expect(screen.getByText("错误码：SEND_RATE_LIMITED")).toBeInTheDocument();
  });

  it("shows the API error message when account takeover fails", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();

    const takeOverSeat = vi.fn(async () => {
      throw {
        code: "FORBIDDEN",
        message: "无权限访问",
        status: 403,
      };
    });

    setWorkbenchService({
      ...baseService,
      takeOverSeat,
    });

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await user.hover(screen.getByRole("button", { name: "选择 念都堂" }));
    await user.click(screen.getByRole("button", { name: "接管账号" }));
    await screen.findByRole("alertdialog", {
      name: "是否确认接管：念都堂",
    });
    await user.click(screen.getByRole("button", { name: "确认接管" }));

    await waitFor(() => {
      expect(takeOverSeat).toHaveBeenCalledWith("ndt");
    });
    await waitFor(() => {
      expect(workbenchToastWarningMock).toHaveBeenCalledWith("无权限访问");
    });
    expect(workbenchToastWarningMock).not.toHaveBeenCalledWith("接管失败，请稍后重试");
  });

  it("does not show a history loader when the default message page covers all history", async () => {
    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });

    expect(screen.getByText("预约直播抽秋天的第一杯奶茶")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "加载更早的对话" })).not.toBeInTheDocument();
  });

  it("toggles the history panel from the composer history button", async () => {
    const user = userEvent.setup();

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    const historyButton = screen.getByRole("button", { name: "历史记录" });

    expect(historyButton).toHaveAttribute("aria-pressed", "false");
    expect(historyButton).not.toHaveClass("bg-accent", "text-accent-foreground");

    await user.click(historyButton);

    expect(
      await screen.findByRole("complementary", { name: "聊天记录" }),
    ).toBeInTheDocument();
    expect(historyButton).toHaveAttribute("aria-pressed", "true");
    expect(historyButton).toHaveClass("bg-accent", "text-accent-foreground");

    await user.click(historyButton);

    await waitFor(() => {
      expect(
        screen.queryByRole("complementary", { name: "聊天记录" }),
      ).not.toBeInTheDocument();
    });
    expect(historyButton).toHaveAttribute("aria-pressed", "false");
    expect(historyButton).not.toHaveClass("bg-accent", "text-accent-foreground");
  });

  it("keeps all seed messages visible after the initial 50-message request", async () => {
    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });

    expect(screen.getByText("预约直播抽秋天的第一杯奶茶")).toBeInTheDocument();
    expect(screen.getAllByText("这是最新的权益清单截图，你帮我确认下。").length).toBeGreaterThan(0);
  });

  it("keeps the right side blank when no conversation is active", async () => {
    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    const state = useWorkbenchStore.getState();
    useWorkbenchStore.setState(
      {
        activeConversationId: "",
        conversationListsByScope: {
          ...state.conversationListsByScope,
          [state.activeAccountId]: [],
        },
      },
      false,
    );

    await waitFor(() => {
      expect(screen.getByText("请选择会话")).toBeInTheDocument();
      expect(screen.queryByTestId("chat-composer-editor")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "历史记录" })).not.toBeInTheDocument();
      expect(
        screen.queryByRole("complementary", { name: "聊天记录" }),
      ).not.toBeInTheDocument();
    });
  });

  it("collects expression messages directly from the message action menu", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();
    const collectMaterial = vi.fn(baseService.collectMaterial);

    setWorkbenchService({
      ...baseService,
      collectMaterial,
      async getMessages(conversationId, options) {
        const page = await baseService.getMessages(conversationId, options);

        if (conversationId !== "conv-001") {
          return page;
        }

        return {
          ...page,
          messages: [
            {
              ...page.messages[0],
              content: {
                alt: "收藏表情",
                fileUrl: "https://example.com/emotion.gif",
              },
              contentType: "emotion",
              msgid: "msg-emotion-collect-001",
            },
          ],
        };
      },
    });

    renderChatWorkbenchPage();

    await screen.findByRole("img", { name: "收藏表情" });
    await user.click(screen.getByRole("button", { name: "消息操作" }));
    await user.click(screen.getByRole("menuitem", { name: "收录" }));

    await waitFor(() => {
      expect(collectMaterial).toHaveBeenCalledWith({
        bizType: 1,
        groupId: 0,
        msgInfoId: "1",
      });
    });
    expect(workbenchToastSuccessMock).toHaveBeenCalledWith("已收录");
  });

  it("collects file messages after choosing a material group", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();
    const collectMaterial = vi.fn(baseService.collectMaterial);
    const listMaterialGroups = vi.fn(baseService.listMaterialGroups);

    setWorkbenchService({
      ...baseService,
      collectMaterial,
      listMaterialGroups,
    });

    renderChatWorkbenchPage();

    const targetMessage = await screen.findByText("求未 AI 智能营销系统.pdf");
    const targetRow = targetMessage.closest('[data-testid="message-row"]');
    expect(targetRow).not.toBeNull();

    await user.click(
      within(targetRow as HTMLElement).getByRole("button", { name: "消息操作" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "收录" }));

    expect(await screen.findByRole("dialog", { name: "收录文件" })).toBeInTheDocument();
    expect(listMaterialGroups).toHaveBeenCalledWith({ bizType: 2 });
    await user.click(screen.getByRole("combobox", { name: "选择分组" }));
    await user.click(await screen.findByRole("option", { name: "常用文件" }));
    await user.click(screen.getByRole("button", { name: "收录" }));

    await waitFor(() => {
      expect(collectMaterial).toHaveBeenCalledWith(
        expect.objectContaining({
          bizType: 2,
          fileName: "求未 AI 智能营销系统.pdf",
          groupId: "mock-material-group-file",
          msgInfoId: "3",
        }),
      );
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "收录文件" })).not.toBeInTheDocument();
    });
    expect(workbenchToastSuccessMock).toHaveBeenCalledWith("已收录");
  });

  it("collects image messages after choosing a material group", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();
    const collectMaterial = vi.fn(async () => ({ success: true as const }));
    const listMaterialGroups = vi.fn(baseService.listMaterialGroups);

    setWorkbenchService({
      ...baseService,
      async getMessages(conversationId, options) {
        const page = await baseService.getMessages(conversationId, options);

        if (conversationId !== "conv-001") {
          return page;
        }

        return {
          ...page,
          messages: [
            {
              ...page.messages[0],
              content: {
                alt: "商品图",
                downloadStatus: "finished",
                fileUrl: "https://example.com/product.png",
              },
              contentType: "image",
              msgid: "msg-image-collect-001",
            },
          ],
        };
      },
      collectMaterial,
      listMaterialGroups,
    });

    renderChatWorkbenchPage();

    const targetImage = await screen.findByRole("img", { name: "商品图" });
    const targetRow = targetImage.closest('[data-testid="message-row"]');
    expect(targetRow).not.toBeNull();

    await user.click(
      within(targetRow as HTMLElement).getByRole("button", { name: "消息操作" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "收录" }));

    expect(await screen.findByRole("dialog", { name: "收录图片" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "文件名称" })).not.toBeInTheDocument();
    expect(listMaterialGroups).toHaveBeenCalledWith({
      bizType: MATERIAL_COLLECTION_BIZ_TYPE.IMAGE,
    });
    await user.click(screen.getByRole("combobox", { name: "选择分组" }));
    await user.click(await screen.findByRole("option", { name: "常用图片" }));
    await user.click(screen.getByRole("button", { name: "收录" }));

    await waitFor(() => {
      expect(collectMaterial).toHaveBeenCalledWith({
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.IMAGE,
        groupId: "mock-material-group-image",
        msgInfoId: "1",
      });
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "收录图片" })).not.toBeInTheDocument();
    });
    expect(workbenchToastSuccessMock).toHaveBeenCalledWith("已收录");
  });

  it("creates a material group before collecting file messages", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();
    const collectMaterial = vi.fn(baseService.collectMaterial);
    const createMaterialGroup = vi.fn(async () => ({
      bizType: 2 as const,
      id: "group-created",
      sort: 1_781_244_000_000,
      title: "售后文件",
    }));
    const listMaterialGroups = vi.fn(async (request) => {
      const response = await baseService.listMaterialGroups(request);
      return {
        ...response,
        groups: [],
      };
    });

    setWorkbenchService({
      ...baseService,
      collectMaterial,
      createMaterialGroup,
      listMaterialGroups,
    });

    renderChatWorkbenchPage();

    const targetMessage = await screen.findByText("求未 AI 智能营销系统.pdf");
    const targetRow = targetMessage.closest('[data-testid="message-row"]');
    expect(targetRow).not.toBeNull();

    await user.click(
      within(targetRow as HTMLElement).getByRole("button", { name: "消息操作" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "收录" }));
    await user.click(await screen.findByRole("combobox", { name: "选择分组" }));
    await user.click(await screen.findByRole("option", { name: "新建分组" }));
    expect(screen.getByRole("dialog", { name: "新建分组" })).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "分组名称" }), "售后文件");
    await user.click(screen.getByRole("button", { name: "新建" }));
    await user.click(screen.getByRole("button", { name: "收录" }));

    expect(createMaterialGroup).toHaveBeenCalledWith({
      bizType: 2,
      title: "售后文件",
    });
    await waitFor(() => {
      expect(collectMaterial).toHaveBeenCalledWith(
        expect.objectContaining({
          bizType: 2,
          fileName: "求未 AI 智能营销系统.pdf",
          groupId: "group-created",
          msgInfoId: "3",
        }),
      );
    });
  });

});
