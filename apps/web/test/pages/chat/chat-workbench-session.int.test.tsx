import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMockWorkbenchService, setWorkbenchService } from "@/pages/chat/api/workbench-service";
import { useAuthStore } from "@/store/auth-store";
import { useWorkbenchStore } from "@/store/workbench-store";
import {
  installChatWorkbenchTestEnvironment,
  renderChatWorkbenchPage,
  resetChatWorkbenchTestState,
  workbenchHttpMock,
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

describe("ChatWorkbenchPage session flows", () => {
  beforeEach(() => {
    vi.useRealTimers();
    resetChatWorkbenchTestState();
    installChatWorkbenchTestEnvironment();
  });

  it("disables the composer when the active account is not taken over", async () => {
    const user = userEvent.setup();

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await user.click(screen.getByRole("button", { name: "选择 念都堂" }));

    await waitFor(() => {
      expect(
        screen.getByRole("textbox", { name: "当前账号未接管，暂时无法发送消息" }),
      ).toHaveAttribute("aria-readonly", "true");
      expect(screen.getAllByText("当前账号未接管，暂时无法发送消息")).toHaveLength(1);
      expect(screen.getByRole("button", { name: "微信表情" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "发送消息" })).toBeDisabled();
      expect(
        screen.queryByText("当前账号未接管，暂时无法发送消息。"),
      ).not.toBeInTheDocument();
    });
  });

  it("disables the composer when the active conversation biz status is inactive", async () => {
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async getConversations(seatId, options) {
        const response = await baseService.getConversations(seatId, options);

        return {
          ...response,
          items: response.items.map((item, index) =>
            index === 0
              ? {
                  ...item,
                  bizStatus: 2,
                }
              : item,
          ),
        };
      },
    });

    renderChatWorkbenchPage();

    await waitFor(() => {
      expect(
        screen.getByRole("textbox", { name: "当前会话已失效，暂时无法发送消息" }),
      ).toHaveAttribute("aria-readonly", "true");
      expect(screen.getByRole("button", { name: "微信表情" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "发送消息" })).toBeDisabled();
    });
  });

  it("disables message avatar menu actions when the active account is not taken over", async () => {
    const user = userEvent.setup();

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await user.click(screen.getByRole("button", { name: "选择 念都堂" }));

    await screen.findByRole("textbox", {
      name: "当前账号未接管，暂时无法发送消息",
    });
    await user.click(screen.getByRole("button", { name: "消息操作" }));

    expect(screen.getByRole("menuitem", { name: "引用" })).toHaveAttribute(
      "data-disabled",
    );
  });

  it("disables conversation card actions when the active account is not taken over", async () => {
    const user = userEvent.setup();

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await user.click(screen.getByRole("button", { name: "选择 念都堂" }));

    await screen.findByRole("textbox", {
      name: "当前账号未接管，暂时无法发送消息",
    });
    await user.click(screen.getAllByRole("button", { name: "会话操作" })[0]);

    expect(screen.getByRole("menuitem", { name: /置顶/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("menuitem", { name: /标记已读/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("menuitem", { name: /不显示/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("enables the composer after taking over the active account", async () => {
    const user = userEvent.setup();

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await user.click(screen.getByRole("button", { name: "选择 念都堂" }));

    await screen.findByRole("textbox", {
      name: "当前账号未接管，暂时无法发送消息",
    });
    await user.hover(screen.getByRole("button", { name: "选择 念都堂" }));
    await user.click(screen.getByRole("button", { name: "接管账号" }));
    const confirmDialog = await screen.findByRole("alertdialog", {
      name: "是否确认接管：念都堂",
    });
    await user.click(
      within(confirmDialog).getByRole("button", { name: "确认接管" }),
    );

    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "请输入消息……" })).not.toHaveAttribute(
        "aria-readonly",
        "true",
      );
      expect(screen.getByRole("button", { name: "发送消息" })).toBeDisabled();
    });
  });

  it("keeps the composer disabled for read-only users after taking over the active account", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();
    const sendMessage = vi.fn(baseService.sendMessage);

    useAuthStore.getState().setSession({
      accountType: "sub",
      displayName: "客服（只读）",
      permissions: ["chat.access"],
      role: "viewer",
      subUserId: "sub-user-001",
    });
    setWorkbenchService({
      ...baseService,
      sendMessage,
    });

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", {
      name: "当前账号无发送权限，暂时无法发送消息",
    });
    await user.click(screen.getByRole("textbox", {
      name: "当前账号无发送权限，暂时无法发送消息",
    }));
    await user.paste("只读用户不能发送");
    await user.click(screen.getByRole("button", { name: "发送消息" }));

    expect(
      screen.getByRole("textbox", {
        name: "当前账号无发送权限，暂时无法发送消息",
      }),
    ).toHaveAttribute("aria-readonly", "true");
    expect(screen.getByRole("button", { name: "微信表情" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "发送消息" })).toBeDisabled();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("prioritizes not-taken-over copy over read-only role copy", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();

    useAuthStore.getState().setSession({
      accountType: "sub",
      displayName: "客服（只读）",
      permissions: ["chat.access"],
      role: "viewer",
      subUserId: "sub-user-001",
    });
    setWorkbenchService(baseService);

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", {
      name: "当前账号无发送权限，暂时无法发送消息",
    });
    await user.click(screen.getByRole("button", { name: "选择 念都堂" }));

    await screen.findByRole("textbox", {
      name: "当前账号未接管，暂时无法发送消息",
    });
  });

  it("does not auto mark active conversations read for read-only users", async () => {
    const baseService = createMockWorkbenchService();
    const markConversationRead = vi.fn(baseService.markConversationRead);

    useAuthStore.getState().setSession({
      accountType: "sub",
      displayName: "客服（只读）",
      permissions: ["chat.access"],
      role: "viewer",
      subUserId: "sub-user-001",
    });
    setWorkbenchService({ ...baseService, markConversationRead });

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", {
      name: "当前账号无发送权限，暂时无法发送消息",
    });

    await waitFor(() => {
      expect(markConversationRead).not.toHaveBeenCalled();
    });
  });

  it("disables failed message retry controls for read-only users", async () => {
    const baseService = createMockWorkbenchService();
    const sendMessage = vi.fn(baseService.sendMessage);

    useAuthStore.getState().setSession({
      accountType: "sub",
      displayName: "客服（只读）",
      permissions: ["chat.access"],
      role: "viewer",
      subUserId: "sub-user-001",
    });
    setWorkbenchService({
      ...baseService,
      sendMessage,
    });

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", {
      name: "当前账号无发送权限，暂时无法发送消息",
    });

    useWorkbenchStore.setState((state) => ({
      messagesByConversationId: {
        ...state.messagesByConversationId,
        "conv-001": [
          ...(state.messagesByConversationId["conv-001"] ?? []),
          {
            author: "客服一号",
            content: {
              text: "这条失败消息不能被只读用户重试",
              type: "text",
            },
            conversationId: "conv-001",
            failReason: "模拟发送失败",
            id: "readonly-failed-message",
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

    await screen.findByText("这条失败消息不能被只读用户重试");

    expect(screen.getByRole("button", { name: "重试发送" })).toBeDisabled();
    expect(screen.queryByText("模拟发送失败")).not.toBeInTheDocument();
    expect(screen.queryByText("发送失败")).not.toBeInTheDocument();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("keeps the composer available while refreshing existing workbench data", async () => {
    const baseService = createMockWorkbenchService();
    const refreshGate = createDeferred();
    let seatRequestCount = 0;

    setWorkbenchService({
      ...baseService,
      async getSeats() {
        seatRequestCount += 1;

        if (seatRequestCount > 1) {
          await refreshGate.promise;
        }

        return baseService.getSeats();
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();

    renderChatWorkbenchPage();

    await waitFor(() => {
      expect(useWorkbenchStore.getState().bootstrapStatus).toBe("loading");
    });
    expect(screen.getByRole("textbox", { name: "请输入消息……" })).not.toHaveAttribute(
      "aria-readonly",
      "true",
    );
    expect(screen.queryByText("当前会话暂不可发送消息")).not.toBeInTheDocument();

    refreshGate.resolve();
    await waitFor(() => {
      expect(useWorkbenchStore.getState().bootstrapStatus).toBe("ready");
    });
  });

  it("shows scope transition errors in the workbench", async () => {
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async getMessages(conversationId, options) {
        if (conversationId === "conv-002" && options?.beforeSeq == null) {
          throw new Error("切换会话失败");
        }

        return baseService.getMessages(conversationId, options);
      },
    });

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await useWorkbenchStore.getState().setActiveConversation("conv-002");

    await waitFor(() => {
      expect(screen.getByTestId("scope-transition-error")).toHaveTextContent(
        "切换会话失败",
      );
    });
    const errorBanner = screen.getByTestId("scope-transition-error");
    expect(errorBanner).toHaveClass(
      "absolute",
      "bottom-full",
      "left-0",
      "right-0",
      "mb-0",
      "bg-destructive/55",
    );
    expect(screen.getByTestId("message-content")).not.toContainElement(
      errorBanner,
    );
  });

  it("logs out from the account menu", async () => {
    const user = userEvent.setup();
    workbenchHttpMock.onPost("/auth/logout").reply(200, {
      data: {
        revoked: true,
      },
      success: true,
    });

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await user.click(screen.getByRole("button", { name: "打开账号菜单" }));
    await user.click(screen.getByRole("menuitem", { name: "退出登录" }));

    await waitFor(() => {
      expect(workbenchHttpMock.history.post[0]?.url).toBe("/auth/logout");
    });
    expect(workbenchHttpMock.history.post).toHaveLength(1);
    expect(workbenchHttpMock.history.post[0]?.url).toBe("/auth/logout");
  });

  it("shows a paused sync dialog when another workbench tab takes polling ownership", async () => {
    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });

    fireEvent(
      window,
      new StorageEvent("storage", {
        key: "chatai.workbench.pollOwner",
        newValue: JSON.stringify({
          ownerTabId: "newer-tab",
          ownerUserId: "sub-user-001",
          expiresAt: Date.now() + 15000,
          updatedAt: Date.now(),
        }),
      }),
    );

    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "刷新页面" })).toBeInTheDocument();
    expect(
      screen.getByTestId("polling-paused-illustration"),
    ).toHaveAttribute("src", "https://b5.bokr.com.cn/dist/pause_poll.png");
  });
});
