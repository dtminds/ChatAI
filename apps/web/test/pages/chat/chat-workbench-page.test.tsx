import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMockWorkbenchService, setWorkbenchService } from "@/pages/chat/api/workbench-service";
import { useWorkbenchStore } from "@/store/workbench-store";
import {
  installChatWorkbenchTestEnvironment,
  renderChatWorkbenchPage,
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
    readonly unobserve = vi.fn();

    constructor(callback: IntersectionObserverCallback) {
      this.callback = callback;
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

function getIntersectionObserverObserveCallCount(
  instances: IntersectionObserverInstance[],
) {
  return instances.reduce(
    (count, instance) => count + instance.observe.mock.calls.length,
    0,
  );
}

describe("ChatWorkbenchPage", () => {
  beforeEach(() => {
    vi.useRealTimers();
    resetChatWorkbenchTestState();
    installChatWorkbenchTestEnvironment();
  });

  it("boots chat workbench through the shared test harness", async () => {
    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    expect(screen.getByRole("button", { name: "发送消息" })).toBeInTheDocument();
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

    expect(observedTarget).toHaveAttribute("data-message-id", "msg-009");

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
      expect(screen.getByRole("tab", { name: "群聊", selected: true })).toBeInTheDocument();
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
        remoteMessageId: expect.any(String),
        status: "accepted",
      });
    });

    await useWorkbenchStore.getState().pollWorkbench();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "重试发送" })).toBeInTheDocument();
    });

    const beforeRetryId =
      useWorkbenchStore.getState().messagesByConversationId["conv-001"].at(-1)?.id;
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
      clientMessageId: "retry-local-001",
      messageId: "retry-opt-001",
      optNo: "retry-opt-001",
      status: "accepted",
    });

    await waitFor(() => {
      const latestMessage =
        useWorkbenchStore.getState().messagesByConversationId["conv-001"].at(-1);

      expect(latestMessage).toMatchObject({
        status: "accepted",
      });
      expect(latestMessage?.id).not.toBe(beforeRetryId);
    });
    expect(scrollTo).toHaveBeenCalledWith({
      top: 0,
      behavior: "smooth",
    });
    expect(viewport.scrollTop).toBe(-160);
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
            id: "unsupported-failed-message",
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
            id: "failed-message-without-error-message",
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

  it("shows a warning when revoke pending times out", async () => {
    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    act(() => {
      useWorkbenchStore.setState({ revokeMessageError: "撤回失败，请稍后重试" });
    });

    expect(workbenchToastWarningMock).toHaveBeenCalledWith("撤回失败，请稍后重试");
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
            id: "failed-message-switch-success",
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
            id: "failed-message-switch-error",
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

    expect(screen.getByText("ErrorCode: SEND_RATE_LIMITED")).toBeInTheDocument();
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

});
