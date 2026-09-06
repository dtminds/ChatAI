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
  installChatWorkbenchTestEnvironment,
  renderChatWorkbenchPage,
  resetChatWorkbenchTestState,
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
        instance.callback(
          entries as IntersectionObserverEntry[],
          instance as unknown as IntersectionObserver,
        );
      }
    },
    instances,
  };
}

describe("ChatWorkbenchPage unread view", () => {
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
});
