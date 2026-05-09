import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MockAdapter from "axios-mock-adapter";
import { requestInstance } from "@/lib/request";
import {
  createMockWorkbenchService,
  resetWorkbenchService,
  setWorkbenchService,
} from "@/pages/chat/api/workbench-service";
import { ChatWorkbenchPage } from "@/pages/chat/chat-workbench-page";
import { useWorkbenchStore } from "@/store/workbench-store";

const mock = new MockAdapter(requestInstance);

describe("ChatWorkbenchPage", () => {
  beforeEach(() => {
    mock.reset();
    resetWorkbenchService();
    useWorkbenchStore.setState(useWorkbenchStore.getInitialState(), true);
    window.localStorage.setItem("chatai.accessToken", "access-token-001");
    window.localStorage.setItem("chatai.refreshToken", "refresh-token-001");
  });

  it("sends a message from the composer", async () => {
    const user = userEvent.setup();

    render(<ChatWorkbenchPage />);

    const composer = await screen.findByPlaceholderText("请输入消息……");
    await user.type(composer, "收到，我来帮你确认");
    await user.click(screen.getByRole("button", { name: "发送消息" }));

    expect(composer).toHaveValue("");
    expect(
      useWorkbenchStore.getState().messagesByConversationId["conv-001"].at(-1),
    ).toMatchObject({
      content: {
        text: "收到，我来帮你确认",
        type: "text",
      },
      role: "agent",
      status: "sending",
    });
  });

  it("switches conversation mode and shows the matching conversation", async () => {
    const user = userEvent.setup();

    render(<ChatWorkbenchPage />);

    await screen.findByPlaceholderText("请输入消息……");
    await user.click(screen.getByRole("tab", { name: "群聊" }));

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "群聊", selected: true })).toBeInTheDocument();
      expect(useWorkbenchStore.getState()).toMatchObject({
        activeConversationId: "conv-004",
        activeMode: "group",
      });
    });
  });

  it("does not open member mentions in single chats", async () => {
    const user = userEvent.setup();

    render(<ChatWorkbenchPage />);

    const composer = await screen.findByPlaceholderText("请输入消息……");
    await user.type(composer, "@");

    expect(screen.queryByRole("listbox", { name: "选择群成员" })).not.toBeInTheDocument();
    expect(composer).toHaveValue("@");
  });

  it("selects group members from @ input and sends mentions at the end", async () => {
    const user = userEvent.setup();

    render(<ChatWorkbenchPage />);

    await screen.findByPlaceholderText("请输入消息……");
    await user.click(screen.getByRole("tab", { name: "群聊" }));

    const composer = await screen.findByPlaceholderText("请输入消息……");
    await user.type(composer, "@小");

    expect(screen.getByRole("listbox", { name: "选择群成员" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "小林" })).toBeInTheDocument();

    await user.keyboard("{Enter}");

    expect(composer).toHaveValue("");
    expect(screen.getByRole("button", { name: "查看已 @ 的 1 位群成员" })).toHaveTextContent(
      "小林",
    );
    expect(screen.queryByRole("button", { name: "移除 @小林" })).not.toBeInTheDocument();

    await user.type(composer, "今天统一看群公告");
    fireEvent.keyDown(screen.getByRole("combobox", { name: "选择 @ 插入位置" }), {
      key: "ArrowDown",
    });
    await user.click(screen.getByRole("option", { name: "文尾" }));
    await user.click(screen.getByRole("button", { name: "发送消息" }));

    await waitFor(() => {
      expect(
        useWorkbenchStore.getState().messagesByConversationId["conv-004"].at(-1),
      ).toMatchObject({
        content: {
          text: "今天统一看群公告 @小林",
          type: "text",
        },
      });
    });
  });

  it("dismisses group member mentions with Escape until the query changes", async () => {
    const user = userEvent.setup();

    render(<ChatWorkbenchPage />);

    await screen.findByPlaceholderText("请输入消息……");
    await user.click(screen.getByRole("tab", { name: "群聊" }));

    const composer = await screen.findByPlaceholderText("请输入消息……");
    await user.type(composer, "@小");

    expect(screen.getByRole("listbox", { name: "选择群成员" })).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("listbox", { name: "选择群成员" })).not.toBeInTheDocument();

    await user.type(composer, "林");

    expect(screen.getByRole("listbox", { name: "选择群成员" })).toBeInTheDocument();
  });

  it("removes selected group member mention tags from the hover menu", async () => {
    const user = userEvent.setup();

    render(<ChatWorkbenchPage />);

    await screen.findByPlaceholderText("请输入消息……");
    await user.click(screen.getByRole("tab", { name: "群聊" }));

    const composer = await screen.findByPlaceholderText("请输入消息……");
    await user.type(composer, "@小");
    await user.click(screen.getByRole("option", { name: "小林" }));

    expect(screen.queryByRole("button", { name: "移除 @小林" })).not.toBeInTheDocument();
    await user.hover(screen.getByRole("button", { name: "查看已 @ 的 1 位群成员" }));

    await user.click(screen.getByRole("button", { name: "移除 @小林" }));

    expect(screen.queryByRole("button", { name: "查看已 @ 的 1 位群成员" })).not.toBeInTheDocument();
  });

  it("keeps the selected member menu open when removing one of several members", async () => {
    const user = userEvent.setup();

    render(<ChatWorkbenchPage />);

    await screen.findByPlaceholderText("请输入消息……");
    await user.click(screen.getByRole("tab", { name: "群聊" }));

    const composer = await screen.findByPlaceholderText("请输入消息……");
    await user.type(composer, "@小");
    await user.click(screen.getByRole("option", { name: "小林" }));
    await user.type(composer, "@睿");
    await user.click(screen.getByRole("option", { name: "睿白鸽" }));

    await user.hover(screen.getByRole("button", { name: "查看已 @ 的 2 位群成员" }));
    await user.click(screen.getByRole("button", { name: "移除 @小林" }));

    expect(screen.getByRole("button", { name: "移除 @睿白鸽" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看已 @ 的 1 位群成员" })).toHaveTextContent(
      "睿白鸽",
    );
  });

  it("opens the selected member menu from keyboard focus", async () => {
    const user = userEvent.setup();

    render(<ChatWorkbenchPage />);

    await screen.findByPlaceholderText("请输入消息……");
    await user.click(screen.getByRole("tab", { name: "群聊" }));

    const composer = await screen.findByPlaceholderText("请输入消息……");
    await user.type(composer, "@小");
    await user.click(screen.getByRole("option", { name: "小林" }));

    fireEvent.focus(screen.getByRole("button", { name: "查看已 @ 的 1 位群成员" }));

    expect(screen.getByRole("button", { name: "移除 @小林" })).toBeInTheDocument();
  });

  it("shows a retry icon before failed messages and retries on click", async () => {
    const user = userEvent.setup();

    render(<ChatWorkbenchPage />);

    const composer = await screen.findByPlaceholderText("请输入消息……");
    await user.click(composer);
    await user.paste("这条消息 [fail]");
    await user.click(screen.getByRole("button", { name: "发送消息" }));

    await waitFor(() => {
      const latestMessage =
        useWorkbenchStore.getState().messagesByConversationId["conv-001"].at(-1);

      expect(latestMessage).toMatchObject({
        remoteMessageId: expect.any(String),
        status: "sending",
      });
    });

    await useWorkbenchStore.getState().pollWorkbench();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "重试发送" })).toBeInTheDocument();
    });

    const beforeRetryId =
      useWorkbenchStore.getState().messagesByConversationId["conv-001"].at(-1)?.id;

    await user.click(screen.getByRole("button", { name: "重试发送" }));

    await waitFor(() => {
      const latestMessage =
        useWorkbenchStore.getState().messagesByConversationId["conv-001"].at(-1);

      expect(latestMessage).toMatchObject({
        status: "sending",
      });
      expect(latestMessage?.id).not.toBe(beforeRetryId);
    });
  });

  it("disables the composer when the active account is not taken over", async () => {
    const user = userEvent.setup();

    render(<ChatWorkbenchPage />);

    await screen.findByPlaceholderText("请输入消息……");
    await user.click(screen.getByRole("button", { name: "念都堂" }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText("当前账号未接管，暂时无法发送消息")).toBeDisabled();
      expect(screen.getByRole("button", { name: "发送消息" })).toBeDisabled();
      expect(
        screen.queryByText("当前账号未接管，暂时无法发送消息。"),
      ).not.toBeInTheDocument();
    });
  });

  it("keeps Enter behavior help in the menu without a persistent footer hint", async () => {
    render(<ChatWorkbenchPage />);

    await screen.findByPlaceholderText("请输入消息……");

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

  it("shows conversation row actions without high-priority labels", async () => {
    const user = userEvent.setup();

    render(<ChatWorkbenchPage />);

    await screen.findByPlaceholderText("请输入消息……");

    expect(screen.queryByText("高优先")).not.toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "会话操作" })[0]);

    expect(screen.getByRole("menuitem", { name: "取消置顶" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "置顶" })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "标记未读" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "不显示" })).toBeInTheDocument();
  });

  it("does not switch conversations when opening row actions from the keyboard", async () => {
    const user = userEvent.setup();

    render(<ChatWorkbenchPage />);

    await screen.findByPlaceholderText("请输入消息……");

    const secondConversationMenuButton =
      screen.getAllByRole("button", { name: "会话操作" })[1];

    secondConversationMenuButton.focus();
    await user.keyboard("{Enter}");

    expect(screen.getByRole("menuitem", { name: "置顶" })).toBeInTheDocument();
    expect(useWorkbenchStore.getState().activeConversationId).toBe("conv-001");
  });

  it("does not show removed chat header actions", async () => {
    render(<ChatWorkbenchPage />);

    await screen.findByPlaceholderText("请输入消息……");

    expect(screen.queryByRole("button", { name: "查看历史" })).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "选择主题模式" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "跟随系统" })).toBeInTheDocument();
  });

  it("does not show a history loader when the default message page covers all history", async () => {
    render(<ChatWorkbenchPage />);

    await screen.findByPlaceholderText("请输入消息……");

    expect(screen.getByText("预约直播抽秋天的第一杯奶茶")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "加载更早的对话" })).not.toBeInTheDocument();
  });

  it("keeps all seed messages visible after the initial 50-message request", async () => {
    render(<ChatWorkbenchPage />);

    await screen.findByPlaceholderText("请输入消息……");

    expect(screen.getByText("预约直播抽秋天的第一杯奶茶")).toBeInTheDocument();
    expect(screen.getAllByText("这是最新的权益清单截图，你帮我确认下。").length).toBeGreaterThan(0);
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

    render(<ChatWorkbenchPage />);

    await screen.findByPlaceholderText("请输入消息……");
    await useWorkbenchStore.getState().setActiveConversation("conv-002");

    await waitFor(() => {
      expect(screen.getByText("切换会话失败")).toBeInTheDocument();
    });
  });

  it("logs out from the account menu and clears stored auth tokens", async () => {
    const user = userEvent.setup();
    mock.onPost("/auth/logout").reply(200, {
      data: {
        revoked: true,
      },
      success: true,
    });

    render(<ChatWorkbenchPage />);

    await screen.findByPlaceholderText("请输入消息……");
    await user.click(screen.getByRole("button", { name: "打开账号设置" }));
    await user.click(screen.getByRole("menuitem", { name: "退出登录" }));

    await waitFor(() => {
      expect(window.localStorage.getItem("chatai.accessToken")).toBeNull();
      expect(window.localStorage.getItem("chatai.refreshToken")).toBeNull();
    });
    expect(mock.history.post).toHaveLength(1);
    expect(mock.history.post[0]?.url).toBe("/auth/logout");
  });
});
