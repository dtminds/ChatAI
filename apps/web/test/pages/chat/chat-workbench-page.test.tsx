import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { StrictMode } from "react";
import type { SettingsSidebarBindType } from "@chatai/contracts";
import { createMockWorkbenchService, setWorkbenchService } from "@/pages/chat/api/workbench-service";
import { ChatWorkbenchPage } from "@/pages/chat/chat-workbench-page";
import { useWorkbenchStore } from "@/store/workbench-store";
import {
  installChatWorkbenchTestEnvironment,
  renderChatWorkbenchPage,
  resetChatWorkbenchTestState,
  workbenchHttpMock,
} from "./workbench-test-utils";

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
    vi.useRealTimers();
    resetChatWorkbenchTestState();
    installChatWorkbenchTestEnvironment();
  });

  it("boots chat workbench through the shared test harness", async () => {
    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    expect(screen.getByRole("button", { name: "发送消息" })).toBeInTheDocument();
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

  it("loads custom sidebar items during workbench bootstrap and reuses them across conversations", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();
    const getSidebarItems = vi.fn(async () => ({
      items: [
        {
          bindTypes: ["1", "2"] as SettingsSidebarBindType[],
          id: "sidebar-2",
          name: "客户详情",
          sort: 2,
          status: "active" as const,
          url: "https://example.com/customer",
        },
        {
          bindTypes: ["1", "2"] as SettingsSidebarBindType[],
          id: "sidebar-1",
          name: "快捷回复",
          sort: 1,
          status: "active" as const,
          url: "https://example.com/replies",
        },
        {
          bindTypes: ["1", "2"] as SettingsSidebarBindType[],
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

    renderChatWorkbenchPage();

    const sidePanel = await screen.findByRole("complementary", {
      name: "客户信息栏",
    });

    expect(within(sidePanel).queryByRole("tab", { name: "基础信息" })).not.toBeInTheDocument();
    expect(within(sidePanel).getByRole("tab", { name: "快捷回复" })).toBeInTheDocument();
    expect(within(sidePanel).getByRole("tab", { name: "客户详情" })).toBeInTheDocument();
    expect(within(sidePanel).queryByRole("tab", { name: "隐藏页面" })).not.toBeInTheDocument();
    expect(getSidebarItems).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("tab", { name: "群聊" }));

    await waitFor(() => {
      expect(useWorkbenchStore.getState().activeConversationId).toBe("conv-004");
    });
    expect(
      within(screen.getByRole("complementary", { name: "群成员信息栏" })).getByRole("tab", {
        name: "基础信息",
        selected: true,
      }),
    ).toBeInTheDocument();
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

    renderChatWorkbenchPage();

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

    renderChatWorkbenchPage();

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

  it("shows a retry icon before failed messages and retries on click", async () => {
    const user = userEvent.setup();

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

    await user.click(screen.getByRole("button", { name: "重试发送" }));

    await waitFor(() => {
      const latestMessage =
        useWorkbenchStore.getState().messagesByConversationId["conv-001"].at(-1);

      expect(latestMessage).toMatchObject({
        status: "accepted",
      });
      expect(latestMessage?.id).not.toBe(beforeRetryId);
    });
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

  it("does not show a history loader when the default message page covers all history", async () => {
    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });

    expect(screen.getByText("预约直播抽秋天的第一杯奶茶")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "加载更早的对话" })).not.toBeInTheDocument();
  });

  it("keeps all seed messages visible after the initial 50-message request", async () => {
    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });

    expect(screen.getByText("预约直播抽秋天的第一杯奶茶")).toBeInTheDocument();
    expect(screen.getAllByText("这是最新的权益清单截图，你帮我确认下。").length).toBeGreaterThan(0);
  });

  it("restarts video transfer instead of opening an expired finished video URL", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();
    const downloadMessageFile = vi.fn(baseService.downloadMessageFile);
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    setWorkbenchService({
      ...baseService,
      downloadMessageFile,
      async getMessages(conversationId, options) {
        if (conversationId === "conv-001" && options?.beforeSeq == null) {
          return {
            filteredCount: 0,
            hasMore: false,
            messages: [
              {
                content: {
                  alt: "已过期视频",
                  coverImageUrl: "/covers/stage.jpg",
                  downloadStatus: "finished",
                  durationLabel: "1:01",
                  fileSerialNo: "serial-video-001",
                  fileUrlExpireTime: Date.now() - 1000,
                  videoUrl: "https://b5.bokr.com.cn/chat-videos/expired.mp4",
                },
                contentType: "video",
                conversationId: "conv-001",
                createdAt: 1778240300000,
                customerId: "cust-001",
                messageId: "remote-expired-video",
                seatId: "drc",
                senderType: "customer",
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

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await user.click(screen.getByRole("button", { name: "下载视频：已过期视频" }));

    expect(downloadMessageFile).toHaveBeenCalledWith({
      conversationId: "conv-001",
      messageId: "remote-expired-video",
      messageSeq: 539,
    });
    expect(openSpy).not.toHaveBeenCalled();
  });

  it("does not update download UI after unmounting during a transfer request", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();
    const transferGate = createDeferred<Awaited<ReturnType<typeof baseService.downloadMessageFile>>>();

    setWorkbenchService({
      ...baseService,
      async downloadMessageFile() {
        return transferGate.promise;
      },
      async getMessages(conversationId, options) {
        if (conversationId === "conv-001" && options?.beforeSeq == null) {
          return {
            filteredCount: 0,
            hasMore: false,
            messages: [
              {
                content: {
                  alt: "待转存视频",
                  coverImageUrl: "/covers/stage.jpg",
                  downloadStatus: "failed",
                  durationLabel: "1:01",
                  fileSerialNo: "serial-video-001",
                  videoUrl: "",
                },
                contentType: "video",
                conversationId: "conv-001",
                createdAt: 1778240300000,
                customerId: "cust-001",
                messageId: "remote-pending-video",
                seatId: "drc",
                senderType: "customer",
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

    const { unmount } = renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await user.click(screen.getByRole("button", { name: "下载视频：待转存视频" }));

    unmount();
    transferGate.reject(new Error("transfer failed after unmount"));
    await expect(transferGate.promise).rejects.toThrow("transfer failed after unmount");

    expect(toast.warning).not.toHaveBeenCalledWith("下载失败，请稍后重试");
  });

  it("keeps clicked video downloads in loading state and starts polling after StrictMode remount", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();
    const downloadMessageFile = vi.fn(async () => ({
      messageId: "remote-pending-video",
      status: "accepted" as const,
    }));
    const getMessageFileDownloadStatus = vi.fn(
      async (input: { conversationId: string; messageSeq: number }) => ({
        downloadStatus: "ing" as const,
        fileSerialNo: `serial-${input.messageSeq}`,
      }),
    );

    setWorkbenchService({
      ...baseService,
      downloadMessageFile,
      getMessageFileDownloadStatus,
      async getMessages(conversationId, options) {
        if (conversationId === "conv-001" && options?.beforeSeq == null) {
          return {
            filteredCount: 0,
            hasMore: false,
            messages: [
              {
                content: {
                  alt: "待转存视频",
                  coverImageUrl: "/covers/stage.jpg",
                  downloadStatus: "failed",
                  durationLabel: "1:01",
                  fileSerialNo: "serial-video-001",
                  videoUrl: "",
                },
                contentType: "video",
                conversationId: "conv-001",
                createdAt: 1778240300000,
                customerId: "cust-001",
                messageId: "remote-pending-video",
                seatId: "drc",
                senderType: "customer",
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

    render(
      <StrictMode>
        <ChatWorkbenchPage />
      </StrictMode>,
    );

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await user.click(screen.getByRole("button", { name: "下载视频：待转存视频" }));

    expect(downloadMessageFile).toHaveBeenCalledWith({
      conversationId: "conv-001",
      messageId: "remote-pending-video",
      messageSeq: 539,
    });
    expect(screen.getByRole("status", { name: "视频下载中" })).toBeInTheDocument();

    await waitFor(() => {
      expect(getMessageFileDownloadStatus).toHaveBeenCalledWith({
        conversationId: "conv-001",
        messageSeq: 539,
      });
    }, { timeout: 3500 });
  });

  it("restores polling for the latest three in-progress downloads", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();
    const getMessageFileDownloadStatus = vi.fn(
      async (input: { conversationId: string; messageSeq: number }) => ({
        downloadStatus: "ing" as const,
        fileSerialNo: `serial-${input.messageSeq}`,
      }),
    );

    setWorkbenchService({
      ...baseService,
      getMessageFileDownloadStatus,
      async getMessages(conversationId, options) {
        if (conversationId === "conv-001" && options?.beforeSeq == null) {
          return {
            filteredCount: 0,
            hasMore: false,
            messages: [
              createInProgressVideoDto({
                alt: "最旧视频",
                createdAt: 1778240000000,
                messageId: "remote-old-video",
                seq: 536,
              }),
              createInProgressFileDto({
                createdAt: 1778240100000,
                fileName: "第三新文件.pdf",
                messageId: "remote-third-file",
                seq: 537,
              }),
              createInProgressVideoDto({
                alt: "第二新视频",
                createdAt: 1778240200000,
                messageId: "remote-second-video",
                seq: 538,
              }),
              createInProgressFileDto({
                createdAt: 1778240300000,
                fileName: "最新文件.pdf",
                messageId: "remote-new-file",
                seq: 539,
              }),
            ],
            scannedCount: 4,
          };
        }

        return baseService.getMessages(conversationId, options);
      },
    });

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    expect(screen.getByRole("button", { name: "下载视频：最旧视频" }))
      .toBeInTheDocument();
    expect(screen.getByRole("status", { name: "视频下载中" })).toBeInTheDocument();
    expect(screen.getAllByRole("status", { name: "文件下载中" })).toHaveLength(2);

    await waitFor(() => {
      expect(getMessageFileDownloadStatus).toHaveBeenCalledTimes(3);
    }, { timeout: 3500 });
    expect(getMessageFileDownloadStatus).toHaveBeenCalledWith({
      conversationId: "conv-001",
      messageSeq: 537,
    });
    expect(getMessageFileDownloadStatus).toHaveBeenCalledWith({
      conversationId: "conv-001",
      messageSeq: 538,
    });
    expect(getMessageFileDownloadStatus).toHaveBeenCalledWith({
      conversationId: "conv-001",
      messageSeq: 539,
    });
    expect(getMessageFileDownloadStatus).not.toHaveBeenCalledWith({
      conversationId: "conv-001",
      messageSeq: 536,
    });

    await user.click(screen.getByRole("button", { name: "下载视频：最旧视频" }));

    expect(toast.warning).toHaveBeenCalledWith("下载队列已满，请稍后");
  });

  it("restores in-progress download polling after StrictMode remount", async () => {
    const baseService = createMockWorkbenchService();
    const getMessageFileDownloadStatus = vi.fn(
      async (input: { conversationId: string; messageSeq: number }) => ({
        downloadStatus: "ing" as const,
        fileSerialNo: `serial-${input.messageSeq}`,
      }),
    );

    setWorkbenchService({
      ...baseService,
      getMessageFileDownloadStatus,
      async getMessages(conversationId, options) {
        if (conversationId === "conv-001" && options?.beforeSeq == null) {
          return {
            filteredCount: 0,
            hasMore: false,
            messages: [
              createInProgressVideoDto({
                alt: "转存中视频",
                createdAt: 1778240300000,
                messageId: "remote-strict-video",
                seq: 539,
              }),
            ],
            scannedCount: 1,
          };
        }

        return baseService.getMessages(conversationId, options);
      },
    });

    render(
      <StrictMode>
        <ChatWorkbenchPage />
      </StrictMode>,
    );

    await screen.findByRole("textbox", { name: "请输入消息……" });
    expect(screen.getByRole("status", { name: "视频下载中" })).toBeInTheDocument();

    await waitFor(() => {
      expect(getMessageFileDownloadStatus).toHaveBeenCalledWith({
        conversationId: "conv-001",
        messageSeq: 539,
      });
    }, { timeout: 3500 });
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

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await useWorkbenchStore.getState().setActiveConversation("conv-002");

    await waitFor(() => {
    expect(vi.mocked(toast.warning)).toHaveBeenCalledWith("标记已读失败");
    });
    expect(screen.queryByTestId("scope-transition-error")).not.toBeInTheDocument();
    expect(useWorkbenchStore.getState().readReceiptError).toBeUndefined();
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

function createInProgressVideoDto({
  alt,
  createdAt,
  downloadStatus = "ing",
  fileSerialNo,
  messageId,
  seq,
}: {
  alt: string;
  createdAt: number;
  downloadStatus?: "ing" | "finished" | "failed";
  fileSerialNo?: string;
  messageId: string;
  seq: number;
}) {
  const resolvedFileSerialNo = fileSerialNo ?? `serial-${seq}`;

  return {
    content: {
      alt,
      coverImageUrl: "/covers/stage.jpg",
      downloadStatus,
      durationLabel: "1:01",
      ...(resolvedFileSerialNo === undefined ? {} : { fileSerialNo: resolvedFileSerialNo }),
      videoUrl: "",
    },
    contentType: "video" as const,
    conversationId: "conv-001",
    createdAt,
    customerId: "cust-001",
    messageId,
    seatId: "drc",
    senderType: "customer" as const,
    seq,
    status: "read" as const,
  };
}

function createInProgressFileDto({
  createdAt,
  fileName,
  messageId,
  seq,
}: {
  createdAt: number;
  fileName: string;
  messageId: string;
  seq: number;
}) {
  return {
    content: {
      downloadStatus: "ing",
      extension: "pdf",
      fileName,
      fileSerialNo: `serial-${seq}`,
      fileSizeLabel: "2 KB",
      fileUrl: "",
    },
    contentType: "file" as const,
    conversationId: "conv-001",
    createdAt,
    customerId: "cust-001",
    messageId,
    seatId: "drc",
    senderType: "customer" as const,
    seq,
    status: "read" as const,
  };
}
