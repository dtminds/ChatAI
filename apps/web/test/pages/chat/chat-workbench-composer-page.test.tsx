import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useWorkbenchStore } from "@/store/workbench-store";
import type { ChatMessage } from "@/pages/chat/chat-types";
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

function createFailedAgentMessage(uiMessageKey: string, text: string): ChatMessage {
  return {
    author: "客服一号",
    content: {
      text,
      type: "text",
    },
    conversationId: "conv-001",
    failReason: "模拟发送失败",
    uiMessageKey,
    role: "agent",
    sender: {
      id: "agent-001",
      name: "客服一号",
    },
    sentAt: "2026-05-20 10:00:00",
    status: "failed",
  };
}

function injectFailedAgentMessage(message: ChatMessage) {
  useWorkbenchStore.setState((state) => ({
    messagesByConversationId: {
      ...state.messagesByConversationId,
      "conv-001": [...(state.messagesByConversationId["conv-001"] ?? []), message],
    },
  }));
}

async function stubMessageViewportScroll() {
  const viewport = await screen.findByTestId("message-viewport");
  const scrollTo = vi.fn();
  Object.defineProperty(viewport, "scrollTo", {
    configurable: true,
    value: scrollTo,
  });
  return scrollTo;
}

describe("ChatWorkbenchPage composer retry wiring", () => {
  beforeEach(() => {
    vi.useRealTimers();
    window.localStorage.clear();
    resetChatWorkbenchTestState();
    installChatWorkbenchTestEnvironment();
  });

  it("scrolls the current conversation after a successful retry", async () => {
    const user = userEvent.setup();
    const retryFailedMessage = vi.fn(async () => ({ ok: true as const }));

    renderChatWorkbenchPage();
    await screen.findByRole("textbox", { name: "请输入消息……" });
    useWorkbenchStore.setState((state) => ({
      ...state,
      retryFailedMessage,
    }));
    injectFailedAgentMessage(
      createFailedAgentMessage("failed-message-retry-success", "重试后滚到底"),
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "重试发送" })).toBeInTheDocument();
    });
    const scrollTo = await stubMessageViewportScroll();
    await user.click(screen.getByRole("button", { name: "重试发送" }));

    await waitFor(() => {
      expect(retryFailedMessage).toHaveBeenCalledWith("failed-message-retry-success");
    });
    expect(scrollTo).toHaveBeenCalledWith({
      top: 0,
      behavior: "smooth",
    });
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
    injectFailedAgentMessage(
      createFailedAgentMessage("failed-message-switch-success", "切走后重试成功"),
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "重试发送" })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "重试发送" }));
    const scrollTo = await stubMessageViewportScroll();

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
    injectFailedAgentMessage(
      createFailedAgentMessage("failed-message-switch-error", "切走后重试失败"),
    );

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
    injectFailedAgentMessage(
      createFailedAgentMessage(
        "failed-message-without-error-message",
        "重试失败但没有错误消息",
      ),
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "重试发送" })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "重试发送" }));

    await waitFor(() => {
      expect(retryFailedMessage).toHaveBeenCalledWith("failed-message-without-error-message");
    });
    expect(workbenchToastWarningMock).toHaveBeenCalledWith("重试失败，请稍后重试");
  });
});
