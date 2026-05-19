import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMockWorkbenchService, setWorkbenchService } from "@/pages/chat/api/workbench-service";
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
      expect(screen.getByRole("button", { name: "发送消息" })).toBeDisabled();
      expect(
        screen.queryByText("当前账号未接管，暂时无法发送消息。"),
      ).not.toBeInTheDocument();
    });
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

    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "请输入消息……" })).not.toHaveAttribute(
        "aria-readonly",
        "true",
      );
      expect(screen.getByRole("button", { name: "发送消息" })).toBeDisabled();
    });
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
