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
import { getFirstUnreadCustomerMessageKey } from "@/pages/chat/hooks/use-visible-unread-conversation-read";
import type { Message } from "@/pages/chat/chat-types";
import { useWorkbenchStore } from "@/store/workbench-store";
import {
  type WorkbenchConversationSummaryDto,
  type WorkbenchMessageDto,
} from "@chatai/contracts";
import {
  installChatWorkbenchTestEnvironment,
  renderChatWorkbenchPage,
  renderChatWorkbenchRoutePage,
  resetChatWorkbenchTestState,
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

  it("loads unread conversations for the next account when the unread view is active", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();
    const ndtSingleBaselineGate = createDeferred();
    const getConversations = vi.fn(async (seatId, options) => {
      if (
        seatId === "ndt" &&
        options?.mode === "single" &&
        !options.unreadOnly
      ) {
        await ndtSingleBaselineGate.promise;
      }

      return baseService.getConversations(seatId, options);
    });

    window.localStorage.setItem(
      "chatai.conversationView",
      JSON.stringify({ group: "all", single: "unread" }),
    );
    setWorkbenchService({
      ...baseService,
      getConversations,
    });

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await waitFor(() => {
      expect(getConversations).toHaveBeenCalledWith(
        "drc",
        expect.objectContaining({
          limit: 500,
          mode: "single",
          unreadOnly: true,
        }),
      );
    });

    await user.click(screen.getByTestId("account-sidebar-item-ndt"));

    await waitFor(() => {
      expect(getConversations).toHaveBeenCalledWith(
        "ndt",
        expect.objectContaining({
          limit: 1000,
          mode: "single",
        }),
      );
    });
    expect(getConversations).not.toHaveBeenCalledWith(
      "ndt",
      expect.objectContaining({
        limit: 500,
        mode: "single",
        unreadOnly: true,
      }),
    );

    ndtSingleBaselineGate.resolve();

    await waitFor(() => {
      expect(getConversations).toHaveBeenCalledWith(
        "ndt",
        expect.objectContaining({
          limit: 500,
          mode: "single",
          unreadOnly: true,
        }),
      );
    });
  });

  it("does not reload unread conversations after switching conversations", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();
    const staleUnreadResponseGate = createDeferred();
    const markConversationRead = vi.fn(baseService.markConversationRead);
    let unreadRequestCount = 0;
    const getConversations = vi.fn(async (seatId, options) => {
      const response = await baseService.getConversations(
        seatId,
        options?.unreadOnly
          ? {
              ...options,
              unreadOnly: false,
            }
          : options,
      );

      if (seatId !== "drc" || options?.mode !== "single") {
        return response;
      }

      const items = response.items.map((conversation) => ({
        ...conversation,
        unreadCount: 1,
      }));

      if (options.unreadOnly) {
        unreadRequestCount += 1;

        if (unreadRequestCount > 1) {
          await staleUnreadResponseGate.promise;
        }
      }

      return {
        ...response,
        items,
        unreadSummary: options.unreadOnly
          ? {
              group: 0,
              single: items.length,
              total: items.length,
            }
          : response.unreadSummary,
      };
    });

    window.localStorage.setItem(
      "chatai.conversationView",
      JSON.stringify({ group: "all", single: "unread" }),
    );
    setWorkbenchService({
      ...baseService,
      getConversations,
      markConversationRead,
    });

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await waitFor(() => {
      expect(unreadRequestCount).toBe(1);
    });

    await user.click(screen.getByRole("button", { name: /睿白鸽/ }));

    await waitFor(() => {
      expect(markConversationRead).toHaveBeenCalledWith("conv-002");
    });
    staleUnreadResponseGate.resolve();

    expect(unreadRequestCount).toBe(1);
    expect(
      useWorkbenchStore
        .getState()
        .conversationListsByScope.drc?.find(
          (conversation) => conversation.id === "conv-002",
        )?.unread,
    ).toBe(0);
  });

  it("preserves the default conversation read state when entering the unread view", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();
    const staleUnreadResponseGate = createDeferred();
    const markConversationRead = vi.fn(baseService.markConversationRead);
    const getConversations = vi.fn(async (seatId, options) => {
      const response = await baseService.getConversations(
        seatId,
        options?.unreadOnly
          ? {
              ...options,
              unreadOnly: false,
            }
          : options,
      );

      if (seatId !== "drc" || options?.mode !== "single") {
        return response;
      }

      const items = response.items.map((conversation) => ({
        ...conversation,
        unreadCount: conversation.conversationId === "conv-002" ? 1 : 0,
      }));

      if (options.unreadOnly) {
        await staleUnreadResponseGate.promise;
      }

      return {
        ...response,
        hasMore: options.unreadOnly ? true : response.hasMore,
        items,
        unreadSummary: options.unreadOnly
          ? {
              group: 0,
              single: 1,
              total: 1,
            }
          : response.unreadSummary,
      };
    });

    setWorkbenchService({
      ...baseService,
      getConversations,
      markConversationRead,
    });

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    markConversationRead.mockClear();

    await user.click(screen.getByRole("tab", { name: "单聊视图" }));
    await user.click(screen.getByRole("menuitemradio", { name: /^未读/ }));

    await waitFor(() => {
      expect(markConversationRead).toHaveBeenCalledWith("conv-002");
      expect(
        useWorkbenchStore
          .getState()
          .conversationListsByScope.drc?.find(
            (conversation) => conversation.id === "conv-002",
          )?.unread,
      ).toBe(0);
    });
    const activeAccountAfterRead = useWorkbenchStore
      .getState()
      .accounts.find((account) => account.id === "drc");

    staleUnreadResponseGate.resolve();

    await waitFor(() => {
      expect(useWorkbenchStore.getState().hasMoreUnreadByScope.drc?.single).toBe(
        true,
      );
    });
    expect(
      useWorkbenchStore
        .getState()
        .conversationListsByScope.drc?.find(
          (conversation) => conversation.id === "conv-002",
        )?.unread,
    ).toBe(0);
    expect(
      useWorkbenchStore.getState().accounts.find((account) => account.id === "drc"),
    ).toBe(activeAccountAfterRead);
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

  it("filters read-unreplied conversations locally and keeps the current result set stable", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();

    setWorkbenchService(baseService);
    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });

    act(() => {
      useWorkbenchStore.setState((state) => {
        const singleConversations = (state.conversationListsByScope.drc ?? []).filter(
          (conversation) => conversation.mode === "single",
        );
        const [matching, applicationMessage, noMessage, newMatch] =
          singleConversations;

        if (!matching || !applicationMessage || !noMessage || !newMatch) {
          return {};
        }

        return {
          conversationListsByScope: {
            ...state.conversationListsByScope,
            drc: (state.conversationListsByScope.drc ?? []).map((conversation) => {
              if (conversation.id === matching.id) {
                return {
                  ...conversation,
                  customerBindType: 1,
                  customerName: "已读未回复客户",
                  lastMessageId: 1001,
                  replied: false,
                  unread: 0,
                };
              }

              if (conversation.id === applicationMessage.id) {
                return {
                  ...conversation,
                  customerBindType: 2,
                  customerName: "应用消息会话",
                  lastMessageId: 1002,
                  replied: false,
                  unread: 0,
                };
              }

              if (conversation.id === noMessage.id) {
                return {
                  ...conversation,
                  customerBindType: 1,
                  customerName: "空会话",
                  lastMessageId: undefined,
                  replied: false,
                  unread: 0,
                };
              }

              if (conversation.id === newMatch.id) {
                return {
                  ...conversation,
                  customerBindType: 1,
                  customerName: "稍后成为未回复",
                  lastMessageId: 1004,
                  replied: true,
                  unread: 0,
                };
              }

              return {
                ...conversation,
                replied: true,
              };
            }),
          },
        };
      });
    });

    await user.click(screen.getByRole("tab", { name: "单聊视图" }));
    await user.click(
      screen.getByRole("menuitemradio", { name: "已读未回" }),
    );

    const conversationList = screen.getByTestId("conversation-list-scroll-area");

    expect(within(conversationList).getByText("已读未回复客户")).toBeVisible();
    expect(
      within(conversationList).queryByText("应用消息会话"),
    ).not.toBeInTheDocument();
    expect(within(conversationList).queryByText("空会话")).not.toBeInTheDocument();
    expect(
      within(conversationList).queryByText("稍后成为未回复"),
    ).not.toBeInTheDocument();

    act(() => {
      useWorkbenchStore.setState((state) => ({
        conversationListsByScope: {
          ...state.conversationListsByScope,
          drc: (state.conversationListsByScope.drc ?? []).map((conversation) =>
            conversation.customerName === "已读未回复客户"
              ? {
                  ...conversation,
                  replied: true,
                }
              : conversation.customerName === "稍后成为未回复"
                ? {
                    ...conversation,
                    replied: false,
                  }
                : conversation,
          ),
        },
      }));
    });

    expect(within(conversationList).getByText("已读未回复客户")).toBeVisible();
    expect(within(conversationList).getByText("稍后成为未回复")).toBeVisible();

    await user.click(screen.getByRole("tab", { name: "单聊视图" }));
    await user.click(screen.getByRole("menuitemradio", { name: "全部" }));
    await user.click(screen.getByRole("tab", { name: "单聊视图" }));
    await user.click(
      screen.getByRole("menuitemradio", { name: "已读未回" }),
    );

    expect(
      within(conversationList).queryByText("已读未回复客户"),
    ).not.toBeInTheDocument();
    expect(within(conversationList).getByText("稍后成为未回复")).toBeVisible();
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

    await user.click(
      within(screen.getByTestId("conversation-card-conv-002")).getByRole(
        "button",
        { name: "会话操作" },
      ),
    );
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

    await user.click(
      within(screen.getByTestId("conversation-card-conv-002")).getByRole(
        "button",
        { name: "会话操作" },
      ),
    );
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

  it("opens a visible-seat customer conversation from a group member", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();
    const target: WorkbenchConversationSummaryDto = {
      conversationAIHostingSwitch: false,
      conversationId: "conv-group-member-customer",
      customerAvatar: "",
      customerId: "member-003",
      customerName: "丹阳草莓",
      handoffMsgId: 0,
      lastMessage: "最近单聊消息",
      lastMessageTime: 1_779_600_000_000,
      mode: "single",
      priority: "medium",
      replied: true,
      seatId: "drc",
      thirdExternalUserId: "member-003",
      thirdUserId: "third-user-drc",
      unreadCount: 0,
    };
    const getCustomerSeatRelations = vi.fn().mockResolvedValue({
      items: [
        {
          bindId: "bind-member-003",
          bindStatus: 1,
          bindType: 1,
          lastMessageTime: target.lastMessageTime,
          seatAvatar: "",
          seatId: "drc",
          seatName: "德瑞可",
          thirdUserId: "third-user-drc",
        },
      ],
    });
    const getOrCreateConversation = vi.fn().mockResolvedValue(target);
    const targetMessagePage =
      createDeferred<Awaited<ReturnType<typeof baseService.getMessages>>>();

    setWorkbenchService({
      ...baseService,
      getCustomerSeatRelations,
      getOrCreateConversation,
      async getMessages(conversationId, options) {
        if (conversationId === target.conversationId) {
          return targetMessagePage.promise;
        }

        return baseService.getMessages(conversationId, options);
      },
    });

    const { router } = renderChatWorkbenchRoutePage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await user.click(screen.getByRole("tab", { name: "群聊" }));
    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "群聊视图", selected: true })).toBeInTheDocument();
    });

    // Advance the relation lookup delay without spending real CI wall time.
    vi.useFakeTimers();
    fireEvent.click(
      screen.getByRole("button", { name: "查看 丹阳草莓 的好友关系" }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(
      screen.getByRole("button", { name: "向 德瑞可 继续会话" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "向 德瑞可 继续会话" }));

    await act(async () => {
      await Promise.resolve();
    });
    expect(router.state.location.pathname).toBe("/chat");
    expect(useWorkbenchStore.getState().activeConversationId).toBe(
      "conv-group-member-customer",
    );
    expect(useWorkbenchStore.getState().isConversationLoading).toBe(true);
    expect(screen.getByTestId("message-loading-overlay")).toBeInTheDocument();
    expect(getCustomerSeatRelations).toHaveBeenCalledWith("member-003");
    expect(getOrCreateConversation).toHaveBeenCalledWith({
      chatType: 1,
      seatId: "drc",
      thirdExternalUserId: "member-003",
      thirdGroupId: undefined,
    });

    await act(async () => {
      targetMessagePage.resolve({
        filteredCount: 0,
        hasMore: false,
        messages: [],
        scannedCount: 0,
      });
      await Promise.resolve();
    });
    vi.useRealTimers();
  });


});
