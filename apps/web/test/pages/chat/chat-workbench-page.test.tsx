import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import MockAdapter from "axios-mock-adapter";
import { GROUP_MEMBER_TYPE } from "@chatai/contracts";
import { requestInstance } from "@/lib/request";
import {
  createMockWorkbenchService,
  resetWorkbenchService,
  setWorkbenchService,
} from "@/pages/chat/api/workbench-service";
import { seedGroupMembersByConversationId } from "@/pages/chat/mock-data";
import { ChatWorkbenchPage } from "@/pages/chat/chat-workbench-page";
import { useWorkbenchStore } from "@/store/workbench-store";

const mock = new MockAdapter(requestInstance);

vi.mock("sonner", async (importOriginal) => {
  const actual = await importOriginal<typeof import("sonner")>();

  return {
    ...actual,
    toast: {
      ...actual.toast,
      warning: vi.fn(),
    },
  };
});

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

async function pasteIntoComposer(
  user: ReturnType<typeof userEvent.setup>,
  composer: HTMLElement,
  text: string,
) {
  await user.click(composer);
  await user.paste(text);
}

describe("ChatWorkbenchPage", () => {
  beforeEach(() => {
    mock.reset();
    vi.mocked(toast.warning).mockClear();
    resetWorkbenchService();
    useWorkbenchStore.setState(useWorkbenchStore.getInitialState(), true);
    window.localStorage.setItem("chatai.accessToken", "access-token-001");
    window.localStorage.setItem("chatai.refreshToken", "refresh-token-001");
  });

  it("sends a message from the composer", async () => {
    const user = userEvent.setup();

    render(<ChatWorkbenchPage />);

    const composer = await screen.findByRole("textbox", { name: "请输入消息……" });
    await pasteIntoComposer(user, composer, "收到，我来帮你确认");
    await user.click(screen.getByRole("button", { name: "发送消息" }));

    expect(composer).toHaveTextContent("");
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

  it("renders pasted WeChat emoji tokens as images while sending the original token", async () => {
    const user = userEvent.setup();

    render(<ChatWorkbenchPage />);

    const composer = await screen.findByRole("textbox", { name: "请输入消息……" });
    await pasteIntoComposer(user, composer, "好的[打脸]");

    expect(screen.getByRole("img", { name: "[打脸]" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "发送消息" }));

    expect(
      useWorkbenchStore.getState().messagesByConversationId["conv-001"].at(-1),
    ).toMatchObject({
      content: {
        text: "好的[打脸]",
        type: "text",
      },
      role: "agent",
      status: "sending",
    });
  });

  it("inserts a pasted clipboard image into the composer and sends it as an image segment", async () => {
    const clipboardImage = new File(["image-bytes"], "clipboard.png", {
      type: "image/png",
    });

    render(<ChatWorkbenchPage />);

    const composer = await screen.findByRole("textbox", { name: "请输入消息……" });
    await userEvent.click(composer);
    fireEvent.paste(composer, {
      clipboardData: {
        files: [clipboardImage],
      },
    });

    expect(await screen.findByRole("img", { name: "clipboard.png" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "发送消息" }));

    await waitFor(() => {
      expect(
        within(composer).queryByRole("img", { name: "clipboard.png" }),
      ).not.toBeInTheDocument();
    });
    expect(
      useWorkbenchStore.getState().messagesByConversationId["conv-001"].at(-1),
    ).toMatchObject({
      content: {
        imageUrl: expect.stringMatching(/^data:image\/png;base64,/),
        type: "image",
      },
      role: "agent",
      status: "sending",
    });
  });

  it("switches conversation mode and shows the matching conversation", async () => {
    const user = userEvent.setup();

    render(<ChatWorkbenchPage />);

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

  it("collapses and expands the account sidebar into a compact rail", async () => {
    const user = userEvent.setup();

    render(<ChatWorkbenchPage />);

    await screen.findByRole("textbox", { name: "请输入消息……" });
    expect(screen.getByRole("button", { name: "聊天" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "选择 德瑞可" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "折叠侧栏" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(window.localStorage.getItem("chatai.accountRailCollapsed")).toBeNull();

    await user.click(screen.getByRole("button", { name: "折叠侧栏" }));

    expect(screen.getByRole("button", { name: "工作台" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "聊天" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "客户" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "任务" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "选择 德瑞可" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开账号菜单" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "展开侧栏" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(window.localStorage.getItem("chatai.accountRailCollapsed")).toBe("true");

    await user.hover(screen.getByRole("button", { name: "客户" }));

    expect(await screen.findByRole("tooltip")).toHaveTextContent("客户");

    await user.click(screen.getByRole("button", { name: "展开侧栏" }));

    expect(screen.getByRole("button", { name: "聊天" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "选择 德瑞可" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "折叠侧栏" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(window.localStorage.getItem("chatai.accountRailCollapsed")).toBe("false");
  });

  it("restores the collapsed account sidebar from localStorage", async () => {
    window.localStorage.setItem("chatai.accountRailCollapsed", "true");

    render(<ChatWorkbenchPage />);

    await screen.findByRole("textbox", { name: "请输入消息……" });

    expect(screen.getByRole("button", { name: "展开侧栏" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "聊天" })).toBeInTheDocument();
  });

  it("resizes the expanded account sidebar and keeps the collapsed rail compact", async () => {
    const user = userEvent.setup();

    window.localStorage.removeItem("chatai.accountRailCollapsed");
    window.localStorage.removeItem("chatai.accountRailWidth");

    render(<ChatWorkbenchPage />);

    await screen.findByRole("textbox", { name: "请输入消息……" });
    const shell = screen.getByTestId("chat-workbench-shell");
    const resizeHandle = screen.getByRole("button", {
      name: "调整账号侧栏宽度",
    });

    expect(shell).toHaveStyle({
      gridTemplateColumns: "216px minmax(0, 1fr)",
    });
    expect(shell).toHaveClass("transition-[grid-template-columns]");

    fireEvent.pointerDown(resizeHandle, { clientX: 216 });
    expect(shell).not.toHaveClass("transition-[grid-template-columns]");

    fireEvent.pointerMove(window, { clientX: 300 });
    await waitFor(() => {
      expect(shell).toHaveStyle({
        gridTemplateColumns: "300px minmax(0, 1fr)",
      });
    });
    expect(window.localStorage.getItem("chatai.accountRailWidth")).toBeNull();

    fireEvent.pointerUp(window);

    expect(window.localStorage.getItem("chatai.accountRailWidth")).toBe("300");
    expect(shell).toHaveClass("transition-[grid-template-columns]");

    await user.click(screen.getByRole("button", { name: "折叠侧栏" }));

    expect(shell).toHaveStyle({
      gridTemplateColumns: "3.5rem minmax(0, 1fr)",
    });
    expect(
      screen.queryByRole("button", { name: "调整账号侧栏宽度" }),
    ).not.toBeInTheDocument();
  });

  it("does not open member mentions in single chats", async () => {
    const user = userEvent.setup();

    render(<ChatWorkbenchPage />);

    const composer = await screen.findByRole("textbox", { name: "请输入消息……" });
    await pasteIntoComposer(user, composer, "@");

    expect(screen.queryByRole("listbox", { name: "选择群成员" })).not.toBeInTheDocument();
    expect(composer).toHaveTextContent("@");
  });

  it("selects group members from @ input and sends mentions at the end", async () => {
    const user = userEvent.setup();

    render(<ChatWorkbenchPage />);

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await user.click(screen.getByRole("tab", { name: "群聊" }));

    const composer = await screen.findByRole("textbox", { name: "请输入消息……" });
    await pasteIntoComposer(user, composer, "@小");

    expect(screen.getByRole("listbox", { name: "选择群成员" })).toBeInTheDocument();
    const xiaolinOption = screen.getByRole("option", { name: "小林" });
    expect(xiaolinOption).toBeInTheDocument();
    expect(within(xiaolinOption).getByTestId("mention-member-avatar")).toHaveAttribute(
      "src",
      seedGroupMembersByConversationId["conv-004"][0].avatarUrl,
    );

    await user.keyboard("{Enter}");

    expect(composer).toHaveTextContent("");
    expect(screen.getByRole("button", { name: "查看已 @ 的 1 位群成员" })).toHaveTextContent(
      "小林",
    );
    expect(screen.queryByRole("button", { name: "移除 @小林" })).not.toBeInTheDocument();

    await pasteIntoComposer(user, composer, "今天统一看群公告");
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

  it("shows group members in the right sidebar grouped by member type", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();
    const groupMembersGate = createDeferred<Awaited<ReturnType<typeof baseService.getGroupMembers>>>();
    const baseGroupMembersResponse = await baseService.getGroupMembers("conv-004");

    setWorkbenchService({
      ...baseService,
      async getGroupMembers(conversationId) {
        expect(conversationId).toBe("conv-004");

        return groupMembersGate.promise;
      },
    });

    render(<ChatWorkbenchPage />);

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await user.click(screen.getByRole("tab", { name: "群聊" }));

    const sidePanel = await screen.findByRole("complementary", {
      name: "群成员信息栏",
    });

    expect(within(sidePanel).getByRole("tab", { name: "基础信息" })).toBeInTheDocument();
    expect(within(sidePanel).getByRole("heading", { name: "群成员 · 共 0 人" })).toBeInTheDocument();
    expect(within(sidePanel).getByTestId("dot-matrix-loader")).toBeInTheDocument();
    expect(within(sidePanel).queryByText("暂无群成员")).not.toBeInTheDocument();

    groupMembersGate.resolve({
      conversationId: "conv-004",
      groupSeatId: "group-seat-conv-004",
      items: [
        {
          avatarUrl: "",
          displayName: "👩‍💼小陈",
          nickname: undefined,
          thirdUserId: "member-emoji",
          type: GROUP_MEMBER_TYPE.NORMAL,
        },
        ...baseGroupMembersResponse.items,
      ],
      thirdGroupId: "third-group-conv-004",
    });

    await waitFor(() => {
      expect(within(sidePanel).queryByTestId("dot-matrix-loader")).not.toBeInTheDocument();
    });

    expect(within(sidePanel).getByRole("heading", { name: "群成员 · 共 7 人" })).toBeInTheDocument();
    expect(within(sidePanel).getByText("群主小可")).toBeInTheDocument();
    expect(within(sidePanel).getByText("群主")).toBeInTheDocument();
    expect(within(sidePanel).getByText("小林")).toBeInTheDocument();
    expect(within(sidePanel).getByText("👩‍💼")).toBeInTheDocument();
    expect(within(sidePanel).getByRole("heading", { name: "普通成员" })).toBeInTheDocument();
    expect(within(sidePanel).getByText("丹阳草莓")).toBeInTheDocument();
  });

  it("loads custom sidebar items during workbench bootstrap and reuses them across conversations", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();
    const getSidebarItems = vi.fn(async () => ({
      items: [
        {
          id: "sidebar-2",
          name: "客户详情",
          sort: 2,
          status: "active" as const,
          url: "https://example.com/customer",
        },
        {
          id: "sidebar-1",
          name: "快捷回复",
          sort: 1,
          status: "active" as const,
          url: "https://example.com/replies",
        },
        {
          id: "sidebar-3",
          name: "隐藏页面",
          sort: 3,
          status: "disabled" as const,
          url: "https://example.com/hidden",
        },
      ],
    }));

    setWorkbenchService({
      ...baseService,
      getSidebarItems,
    });

    render(<ChatWorkbenchPage />);

    const sidePanel = await screen.findByRole("complementary", {
      name: "客户信息栏",
    });

    expect(within(sidePanel).getByRole("tab", { name: "基础信息" })).toBeInTheDocument();
    expect(within(sidePanel).getByRole("tab", { name: "快捷回复" })).toBeInTheDocument();
    expect(within(sidePanel).getByRole("tab", { name: "客户详情" })).toBeInTheDocument();
    expect(within(sidePanel).queryByRole("tab", { name: "隐藏页面" })).not.toBeInTheDocument();
    expect(getSidebarItems).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("tab", { name: "群聊" }));

    await waitFor(() => {
      expect(useWorkbenchStore.getState().activeConversationId).toBe("conv-004");
    });
    expect(getSidebarItems).toHaveBeenCalledTimes(1);
  });

  it("refreshes cached group members from the sidebar button", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();
    let requestCount = 0;

    setWorkbenchService({
      ...baseService,
      async getGroupMembers(conversationId) {
        requestCount += 1;
        const response = await baseService.getGroupMembers(conversationId);

        return {
          ...response,
          items:
            requestCount === 2
              ? response.items.map((member) =>
                  member.displayName === "小林"
                    ? { ...member, displayName: "小林（刷新）" }
                    : member,
                )
              : response.items,
        };
      },
    });

    render(<ChatWorkbenchPage />);

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await user.click(screen.getByRole("tab", { name: "群聊" }));

    const sidePanel = await screen.findByRole("complementary", {
      name: "群成员信息栏",
    });

    await waitFor(() => {
      expect(within(sidePanel).getByText("小林")).toBeInTheDocument();
    });

    await user.click(within(sidePanel).getByRole("button", { name: "刷新群成员" }));

    await waitFor(() => {
      expect(within(sidePanel).getByText("小林（刷新）")).toBeInTheDocument();
    });

    expect(requestCount).toBe(2);
  });

  it("keeps showing loading while switching to a group conversation", async () => {
    const user = userEvent.setup();
    const deferred = createDeferred<Awaited<ReturnType<ReturnType<typeof createMockWorkbenchService>["getGroupMembers"]>>>();
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async getGroupMembers(conversationId) {
        expect(conversationId).toBe("conv-004");
        return deferred.promise;
      },
    });

    render(<ChatWorkbenchPage />);

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await user.click(screen.getByRole("tab", { name: "群聊" }));

    const sidePanel = await screen.findByRole("complementary", {
      name: "群成员信息栏",
    });

    expect(within(sidePanel).getByTestId("dot-matrix-loader")).toBeInTheDocument();
    expect(within(sidePanel).queryByText("暂无群成员")).not.toBeInTheDocument();

    deferred.resolve(await baseService.getGroupMembers("conv-004"));

    await waitFor(() => {
      expect(within(sidePanel).queryByTestId("dot-matrix-loader")).not.toBeInTheDocument();
    });
  });

  it("keeps member mentions available for backend group conversation ids", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async getConversations(seatId) {
        const conversations = await baseService.getConversations(seatId);

        return conversations.map((conversation) =>
          conversation.conversationId === "conv-004"
            ? {
                ...conversation,
                conversationId: "backend-group-001",
              }
            : conversation,
        );
      },
    });

    render(<ChatWorkbenchPage />);

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await user.click(screen.getByRole("tab", { name: "群聊" }));

    const composer = await screen.findByRole("textbox", { name: "请输入消息……" });
    await pasteIntoComposer(user, composer, "@小");

    expect(screen.getByRole("listbox", { name: "选择群成员" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "小林" })).toBeInTheDocument();
  });

  it("dismisses group member mentions with Escape until the query changes", async () => {
    const user = userEvent.setup();

    render(<ChatWorkbenchPage />);

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await user.click(screen.getByRole("tab", { name: "群聊" }));

    const composer = await screen.findByRole("textbox", { name: "请输入消息……" });
    await pasteIntoComposer(user, composer, "@小");

    expect(screen.getByRole("listbox", { name: "选择群成员" })).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("listbox", { name: "选择群成员" })).not.toBeInTheDocument();

    await pasteIntoComposer(user, composer, "林");

    expect(screen.getByRole("listbox", { name: "选择群成员" })).toBeInTheDocument();
  });

  it("removes selected group member mention tags from the hover menu", async () => {
    const user = userEvent.setup();

    render(<ChatWorkbenchPage />);

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await user.click(screen.getByRole("tab", { name: "群聊" }));

    const composer = await screen.findByRole("textbox", { name: "请输入消息……" });
    await pasteIntoComposer(user, composer, "@小");
    await user.click(screen.getByRole("option", { name: "小林" }));

    expect(screen.queryByRole("button", { name: "移除 @小林" })).not.toBeInTheDocument();
    await user.hover(screen.getByRole("button", { name: "查看已 @ 的 1 位群成员" }));

    await user.click(screen.getByRole("button", { name: "移除 @小林" }));

    expect(screen.queryByRole("button", { name: "查看已 @ 的 1 位群成员" })).not.toBeInTheDocument();
  });

  it("keeps the selected member menu open when removing one of several members", async () => {
    const user = userEvent.setup();

    render(<ChatWorkbenchPage />);

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await user.click(screen.getByRole("tab", { name: "群聊" }));

    const composer = await screen.findByRole("textbox", { name: "请输入消息……" });
    await pasteIntoComposer(user, composer, "@小");
    await user.click(screen.getByRole("option", { name: "小林" }));
    await pasteIntoComposer(user, composer, "@睿");
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

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await user.click(screen.getByRole("tab", { name: "群聊" }));

    const composer = await screen.findByRole("textbox", { name: "请输入消息……" });
    await pasteIntoComposer(user, composer, "@小");
    await user.click(screen.getByRole("option", { name: "小林" }));

    fireEvent.focus(screen.getByRole("button", { name: "查看已 @ 的 1 位群成员" }));

    expect(screen.getByRole("button", { name: "移除 @小林" })).toBeInTheDocument();
  });

  it("shows a retry icon before failed messages and retries on click", async () => {
    const user = userEvent.setup();

    render(<ChatWorkbenchPage />);

    const composer = await screen.findByRole("textbox", { name: "请输入消息……" });
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

    render(<ChatWorkbenchPage />);

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

    render(<ChatWorkbenchPage />);

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

  it("keeps the composer available while the active conversation is sending", async () => {
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

    render(<ChatWorkbenchPage />);

    const composer = await screen.findByRole("textbox", { name: "请输入消息……" });
    await pasteIntoComposer(user, composer, "第一段还在发送");
    await user.click(screen.getByRole("button", { name: "发送消息" }));

    await waitFor(() => {
      expect(
        useWorkbenchStore.getState().sendStatusByConversationId["conv-001"],
      ).toBe("sending");
    });
    expect(screen.getByRole("textbox", { name: "请输入消息……" })).not.toHaveAttribute(
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

    render(<ChatWorkbenchPage />);

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

  it("keeps Enter behavior help in the menu without a persistent footer hint", async () => {
    render(<ChatWorkbenchPage />);

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

  it("shows conversation row actions without high-priority labels", async () => {
    const user = userEvent.setup();

    render(<ChatWorkbenchPage />);

    await screen.findByRole("textbox", { name: "请输入消息……" });

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

    await screen.findByRole("textbox", { name: "请输入消息……" });

    const secondConversationMenuButton =
      screen.getAllByRole("button", { name: "会话操作" })[1];

    secondConversationMenuButton.focus();
    await user.keyboard("{Enter}");

    expect(screen.getByRole("menuitem", { name: "置顶" })).toBeInTheDocument();
    expect(useWorkbenchStore.getState().activeConversationId).toBe("conv-001");
  });

  it("pins conversations from the row action menu", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();
    const observedConversationIds: string[] = [];

    setWorkbenchService({
      ...baseService,
      async pinConversation(conversationId) {
        observedConversationIds.push(conversationId);

        return baseService.pinConversation(conversationId);
      },
    });

    render(<ChatWorkbenchPage />);

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await user.click(screen.getAllByRole("button", { name: "会话操作" })[1]);
    await user.click(screen.getByRole("menuitem", { name: "置顶" }));

    await waitFor(() => {
      expect(observedConversationIds).toEqual(["conv-002"]);
    });
  });

  it("unpins conversations from the row action menu", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();
    const observedConversationIds: string[] = [];

    setWorkbenchService({
      ...baseService,
      async unpinConversation(conversationId) {
        observedConversationIds.push(conversationId);

        return baseService.unpinConversation(conversationId);
      },
    });

    render(<ChatWorkbenchPage />);

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await user.click(screen.getAllByRole("button", { name: "会话操作" })[0]);
    await user.click(screen.getByRole("menuitem", { name: "取消置顶" }));

    await waitFor(() => {
      expect(observedConversationIds).toEqual(["conv-001"]);
    });
  });

  it("deletes conversations from the row action menu", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();
    const observedConversationIds: string[] = [];

    setWorkbenchService({
      ...baseService,
      async deleteConversation(conversationId) {
        observedConversationIds.push(conversationId);

        return baseService.deleteConversation(conversationId);
      },
    });

    render(<ChatWorkbenchPage />);

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await user.click(screen.getAllByRole("button", { name: "会话操作" })[1]);
    await user.click(screen.getByRole("menuitem", { name: "不显示" }));

    await waitFor(() => {
      expect(observedConversationIds).toEqual(["conv-002"]);
    });
    expect(screen.queryByText("睿白鸽")).not.toBeInTheDocument();
  });

  it("does not show removed chat header actions", async () => {
    render(<ChatWorkbenchPage />);

    await screen.findByRole("textbox", { name: "请输入消息……" });

    expect(screen.queryByRole("button", { name: "查看历史" })).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "选择主题模式" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "跟随系统" })).toBeInTheDocument();
  });

  it("does not show a history loader when the default message page covers all history", async () => {
    render(<ChatWorkbenchPage />);

    await screen.findByRole("textbox", { name: "请输入消息……" });

    expect(screen.getByText("预约直播抽秋天的第一杯奶茶")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "加载更早的对话" })).not.toBeInTheDocument();
  });

  it("does not auto-loop when older history only contains hidden revoke events", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();
    const calls: Array<{ beforeSeq?: number; conversationId: string }> = [];

    setWorkbenchService({
      ...baseService,
      async getMessages(conversationId, options) {
        calls.push({ beforeSeq: options?.beforeSeq, conversationId });

        if (conversationId === "conv-001" && options?.beforeSeq != null) {
          return {
            filteredCount: 50,
            hasMore: true,
            messages: [],
            nextBeforeSeq: Math.max(options.beforeSeq - 50, 1),
            scannedCount: 50,
          };
        }

        if (conversationId === "conv-001") {
          const page = await baseService.getMessages(conversationId, options);

          return {
            ...page,
            hasMore: true,
            nextBeforeSeq: page.nextBeforeSeq ?? 5,
          };
        }

        return baseService.getMessages(conversationId, options);
      },
    });

    render(<ChatWorkbenchPage />);

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await user.click(screen.getByRole("button", { name: "加载更早的对话" }));

    expect(
      await screen.findByRole("button", {
        name: "已跳过 50 条不可展示记录，继续加载更早消息",
      }),
    ).toBeInTheDocument();
    expect(calls.filter((call) => call.beforeSeq != null)).toHaveLength(1);
  });

  it("does not offer older history while a newly selected conversation is still loading", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();
    const conversationGate = createDeferred();

    setWorkbenchService({
      ...baseService,
      async getMessages(conversationId, options) {
        if (conversationId === "conv-002" && options?.beforeSeq == null) {
          await conversationGate.promise;
        }

        return baseService.getMessages(conversationId, options);
      },
    });

    render(<ChatWorkbenchPage />);

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await user.click(screen.getByRole("button", { name: /睿白鸽/ }));

    expect(
      screen.getByRole("status", { name: "正在加载会话" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("message-loading-overlay")).toHaveClass(
      "absolute",
      "inset-0",
      "items-center",
      "justify-center",
    );
    expect(screen.getByTestId("message-scroll-area")).not.toContainElement(
      screen.getByTestId("message-loading-overlay"),
    );
    expect(screen.getByTestId("message-content")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(screen.queryByText("正在刷新当前会话...")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "加载更早的对话" })).not.toBeInTheDocument();

    conversationGate.resolve();
  });

  it("keeps all seed messages visible after the initial 50-message request", async () => {
    render(<ChatWorkbenchPage />);

    await screen.findByRole("textbox", { name: "请输入消息……" });

    expect(screen.getByText("预约直播抽秋天的第一杯奶茶")).toBeInTheDocument();
    expect(screen.getAllByText("这是最新的权益清单截图，你帮我确认下。").length).toBeGreaterThan(0);
  });

  it("scrolls to a loaded original message when clicking a quote preview", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();
    const scrollIntoView = vi.fn();
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    setWorkbenchService({
      ...baseService,
      async getMessages(conversationId, options) {
        if (conversationId === "conv-001" && options?.beforeSeq == null) {
          return {
            filteredCount: 0,
            hasMore: false,
            messages: [
              {
                content: { text: "测试被引用" },
                contentType: "text",
                conversationId: "conv-001",
                createdAt: 1778240200000,
                customerId: "cust-001",
                messageId: "remote-original",
                seatId: "drc",
                senderType: "customer",
                seq: 538,
                status: "read",
              },
              {
                content: {
                  quoteMsgId: "538",
                  quotedMessage: {
                    contentType: "text",
                    senderName: "客户",
                    text: "测试被引用",
                  },
                  text: "正式引用消息",
                },
                contentType: "quote",
                conversationId: "conv-001",
                createdAt: 1778240300000,
                customerId: "cust-001",
                messageId: "remote-quote",
                seatId: "drc",
                senderType: "agent",
                seq: 539,
                status: "read",
              },
            ],
            scannedCount: 2,
          };
        }

        return baseService.getMessages(conversationId, options);
      },
    });

    try {
      render(<ChatWorkbenchPage />);

      await screen.findByRole("textbox", { name: "请输入消息……" });
      await user.click(screen.getByRole("button", { name: /测试被引用/ }));

      expect(scrollIntoView).toHaveBeenCalledWith({
        behavior: "smooth",
        block: "start",
      });
      expect(toast.warning).not.toHaveBeenCalledWith("当前未加载原始消息");
    } finally {
      HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
    }
  });

  it("shows a toast when a quote original message is not loaded", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async getMessages(conversationId, options) {
        if (conversationId === "conv-001" && options?.beforeSeq == null) {
          return {
            filteredCount: 0,
            hasMore: false,
            messages: [
              {
                content: {
                  quoteMsgId: "999",
                  quotedMessage: {
                    contentType: "text",
                    senderName: "客户",
                    text: "未加载原文",
                  },
                  text: "正式引用消息",
                },
                contentType: "quote",
                conversationId: "conv-001",
                createdAt: 1778240300000,
                customerId: "cust-001",
                messageId: "remote-quote",
                seatId: "drc",
                senderType: "agent",
                seq: 539,
                status: "read",
              },
            ],
            scannedCount: 1,
          };
        }

        return baseService.getMessages(conversationId, options);
      },
    });

    render(<ChatWorkbenchPage />);

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await user.click(screen.getByRole("button", { name: /未加载原文/ }));

    expect(toast.warning).toHaveBeenCalledWith("当前未加载原始消息");
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

  it("shows read receipt failures as a toast instead of a scope transition error", async () => {
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async markConversationRead(conversationId) {
        if (conversationId === "conv-002") {
          throw new Error("标记已读失败");
        }

        return baseService.markConversationRead(conversationId);
      },
    });

    render(<ChatWorkbenchPage />);

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await useWorkbenchStore.getState().setActiveConversation("conv-002");

    await waitFor(() => {
      expect(toast.warning).toHaveBeenCalledWith("标记已读失败");
    });
    expect(screen.queryByTestId("scope-transition-error")).not.toBeInTheDocument();
    expect(useWorkbenchStore.getState().readReceiptError).toBeUndefined();
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

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await user.click(screen.getByRole("button", { name: "打开账号菜单" }));
    await user.click(screen.getByRole("menuitem", { name: "退出登录" }));

    await waitFor(() => {
      expect(window.localStorage.getItem("chatai.accessToken")).toBeNull();
      expect(window.localStorage.getItem("chatai.refreshToken")).toBeNull();
    });
    expect(mock.history.post).toHaveLength(1);
    expect(mock.history.post[0]?.url).toBe("/auth/logout");
  });
});
