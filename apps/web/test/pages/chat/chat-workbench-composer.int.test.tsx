import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { createMockWorkbenchService, setWorkbenchService } from "@/pages/chat/api/workbench-service";
import { useWorkbenchStore } from "@/store/workbench-store";
import {
  installChatWorkbenchTestEnvironment,
  mediaUploadMocks,
  renderChatWorkbenchPage,
  resetChatWorkbenchTestState,
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

async function expectLatestConversationMessage(
  conversationId: string,
  expectedMessage: object,
) {
  await waitFor(() => {
    expect(
      useWorkbenchStore.getState().messagesByConversationId[conversationId].at(-1),
    ).toMatchObject(expectedMessage);
  });
}

describe("ChatWorkbenchPage composer flows", () => {
  beforeEach(() => {
    vi.useRealTimers();
    resetChatWorkbenchTestState();
    installChatWorkbenchTestEnvironment();
  });

  it("sends a message from the composer", async () => {
    const user = userEvent.setup();

    renderChatWorkbenchPage();

    const composer = await screen.findByRole("textbox", { name: "请输入消息……" });
    await pasteIntoComposer(user, composer, "收到，我来帮你确认");
    await user.click(screen.getByRole("button", { name: "发送消息" }));

    expect(composer).toHaveTextContent("");
    await expectLatestConversationMessage("conv-001", {
      content: {
        text: "收到，我来帮你确认",
        type: "text",
      },
      role: "agent",
      status: "accepted",
    });
  });

  it("boots chat workbench through the shared test harness", async () => {
    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    expect(screen.getByRole("button", { name: "发送消息" })).toBeInTheDocument();
  });

  it("sends a selected quote with the composed text", async () => {
    const user = userEvent.setup();

    renderChatWorkbenchPage();

    const composer = await screen.findByRole("textbox", { name: "请输入消息……" });
    const targetMessage = await screen.findByText("我先截了个竖图版本给你看。");
    const targetRow = targetMessage.closest('[data-testid="message-row"]');
    expect(targetRow).not.toBeNull();

    await user.click(within(targetRow as HTMLElement).getByRole("button", { name: "消息操作" }));
    await user.click(screen.getByRole("menuitem", { name: "引用消息" }));
    await pasteIntoComposer(user, composer, "收到，我按这个版本处理");
    await user.click(screen.getByRole("button", { name: "发送消息" }));

    await waitFor(() => {
      expect(
        useWorkbenchStore.getState().messagesByConversationId["conv-001"].at(-1),
      ).toMatchObject({
        content: {
          quoteMsgId: "5",
          quotedMessageId: "msg-006",
          quotedMessage: {
            senderName: "丹阳草莓，得利市大樱桃",
            text: "我先截了个竖图版本给你看。",
          },
          text: "收到，我按这个版本处理",
          type: "quote",
        },
      });
    });
    expect(screen.queryByTestId("composer-quote-preview")).not.toBeInTheDocument();
  });

  it("opens a retry dialog when mentioning a stale group member and inserts the mention after refresh", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();
    const firstGroupMembers = [
      {
        avatarUrl: "https://example.com/avatar-1.png",
        displayName: "成员甲",
        thirdUserId: "member-001",
        type: 0 as const,
      },
    ];
    const refreshedGroupMembers = [
      {
        avatarUrl: "https://example.com/avatar-1.png",
        displayName: "成员甲",
        thirdUserId: "member-001",
        type: 0 as const,
      },
      {
        avatarUrl: "https://example.com/avatar-2.png",
        displayName: "缪勇飞 群昵称111",
        thirdUserId: "member-006",
        type: 0 as const,
      },
    ];
    let groupMemberRequestCount = 0;

    setWorkbenchService({
      ...baseService,
      async getGroupMembers(conversationId) {
        if (conversationId !== "conv-004") {
          return baseService.getGroupMembers(conversationId);
        }

        groupMemberRequestCount += 1;
        return {
          conversationId: "conv-004",
          groupSeatId: "group-seat-conv-004",
          items:
            groupMemberRequestCount === 1
              ? firstGroupMembers
              : refreshedGroupMembers,
          thirdGroupId: "third-group-conv-004",
        };
      },
    });

    renderChatWorkbenchPage();

    await user.click(await screen.findByRole("tab", { name: "群聊" }));
    await waitFor(() => {
      expect(useWorkbenchStore.getState().activeConversationId).toBe("conv-004");
    });

    await waitFor(() => {
      expect(
        useWorkbenchStore.getState().groupMembersByConversationId["conv-004"],
      ).toEqual([
        expect.objectContaining({
          displayName: "成员甲",
          id: "member-001",
        }),
      ]);
    });

    useWorkbenchStore.setState((state) => ({
      ...state,
      groupMembersByConversationId: {
        ...state.groupMembersByConversationId,
        "conv-004": [
          {
            avatarUrl: "https://example.com/avatar-1.png",
            displayName: "成员甲",
            id: "member-001",
            type: 0,
          },
        ],
      },
    }));
    expect(
      useWorkbenchStore
        .getState()
        .groupMembersByConversationId["conv-004"]?.some(
          (member) => member.id === "member-006",
        ),
    ).toBe(false);

    const targetRow = await waitFor(() => {
      const row = screen.getAllByTestId("message-row").find((item) =>
        item.textContent?.includes("缪勇飞 群昵称111"),
      );

      expect(row).toBeDefined();
      return row as HTMLElement;
    });

    await user.click(within(targetRow).getByRole("button", { name: "消息操作" }));
    await user.click(screen.getByRole("menuitem", { name: "@Ta" }));

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText("该成员已退群或群成员数据未更新"),
    ).toBeInTheDocument();
    expect(within(dialog).getByText(/暂不支持 @Ta/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "刷新群成员并重试" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: "请输入消息……" })).toHaveTextContent(
        "@缪勇飞 群昵称111",
      );
    });
  });

  it("excludes the current seat from the group mention picker", async () => {
    const user = userEvent.setup();

    renderChatWorkbenchPage();

    await user.click(await screen.findByRole("tab", { name: "群聊" }));
    await waitFor(() => {
      expect(useWorkbenchStore.getState().activeConversationId).toBe("conv-004");
    });

    const composer = await screen.findByRole("textbox", { name: "请输入消息……" });
    await pasteIntoComposer(user, composer, "@");

    const listbox = await screen.findByRole("listbox", { name: "选择群成员" });
    expect(within(listbox).getByRole("option", { name: "所有人（6人）" })).toBeInTheDocument();
    expect(
      within(listbox).queryByRole("option", { name: "德瑞可-小可" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the retry dialog open when refreshed group members still do not contain the mention target", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async getGroupMembers(conversationId) {
        if (conversationId !== "conv-004") {
          return baseService.getGroupMembers(conversationId);
        }

        return {
          conversationId: "conv-004",
          groupSeatId: "group-seat-conv-004",
          items: [
            {
              avatarUrl: "https://example.com/avatar-1.png",
              displayName: "成员甲",
              thirdUserId: "member-001",
              type: 0,
            },
          ],
          thirdGroupId: "third-group-conv-004",
        };
      },
    });

    renderChatWorkbenchPage();

    await user.click(await screen.findByRole("tab", { name: "群聊" }));
    await waitFor(() => {
      expect(useWorkbenchStore.getState().activeConversationId).toBe("conv-004");
    });

    const targetRow = await waitFor(() => {
      const row = screen.getAllByTestId("message-row").find((item) =>
        item.textContent?.includes("缪勇飞 群昵称111"),
      );

      expect(row).toBeDefined();
      return row as HTMLElement;
    });

    await user.click(within(targetRow).getByRole("button", { name: "消息操作" }));
    await user.click(screen.getByRole("menuitem", { name: "@Ta" }));

    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "刷新群成员并重试" }));

    expect(
      await within(dialog).findByText("刷新后仍未找到该成员"),
    ).toBeInTheDocument();
    expect(screen.queryByText("@缪勇飞 群昵称111")).not.toBeInTheDocument();
  });

  it("renders pasted WeChat emoji tokens as images while sending the original token", async () => {
    const user = userEvent.setup();

    renderChatWorkbenchPage();

    const composer = await screen.findByRole("textbox", { name: "请输入消息……" });
    await pasteIntoComposer(user, composer, "好的[打脸]");

    expect(screen.getByRole("img", { name: "[打脸]" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "发送消息" }));

    await expectLatestConversationMessage("conv-001", {
      content: {
        text: "好的[打脸]",
        type: "text",
      },
      role: "agent",
      status: "accepted",
    });
  });

  it("inserts a pasted clipboard image into the composer and enables sending", async () => {
    const clipboardImage = new File(["image-bytes"], "clipboard.png", {
      type: "image/png",
    });

    renderChatWorkbenchPage();

    const composer = await screen.findByRole("textbox", { name: "请输入消息……" });
    await userEvent.click(composer);
    fireEvent.paste(composer, {
      clipboardData: {
        files: [clipboardImage],
      },
    });

    expect(await screen.findByRole("img", { name: "clipboard.png" })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "发送消息" })).not.toBeDisabled();
    });

    expect(screen.getByRole("button", { name: "发送消息" })).not.toBeDisabled();
  });

  it("only accepts jpeg and png files from the composer image picker", async () => {
    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });

    expect(screen.getByLabelText("选择图片")).toHaveAttribute(
      "accept",
      "image/jpeg,image/png,.jpg,.jpeg,.png",
    );
  });

  it("uploads a selected file and sends it as a file message", async () => {
    const upload = createDeferred<Awaited<ReturnType<typeof mediaUploadMocks.uploadWorkbenchFile>>>();
    const file = new File(["file-bytes"], "报价单.pdf", {
      type: "application/pdf",
    });
    vi.mocked(mediaUploadMocks.uploadWorkbenchFile).mockReturnValue(upload.promise);

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    fireEvent.change(screen.getByLabelText("选择文件"), {
      target: {
        files: [file],
      },
    });

    expect(screen.getByText("报价单.pdf")).toBeInTheDocument();
    expect(screen.getByText(/正在准备发送/)).toBeInTheDocument();
    await waitFor(() => {
      expect(mediaUploadMocks.uploadWorkbenchFile).toHaveBeenCalledWith(
        "conv-001",
        file,
        expect.objectContaining({
          onProgress: expect.any(Function),
          signal: expect.any(AbortSignal),
        }),
      );
    });
    upload.resolve({
      extension: "pdf",
      fileId: "chat-files/conv-001/报价单.pdf",
      fileName: "报价单.pdf",
      fileSize: file.size,
      fileSizeLabel: `${file.size} B`,
      type: "file",
      url: "https://b5.bokr.com.cn/chat-files/conv-001/%E6%8A%A5%E4%BB%B7%E5%8D%95.pdf",
    });
    await waitFor(() => {
      expect(screen.queryByText("正在准备发送")).not.toBeInTheDocument();
    });
    await expectLatestConversationMessage("conv-001", {
      content: {
        extension: "pdf",
        fileName: "报价单.pdf",
        fileSizeLabel: expect.any(String),
        type: "file",
      },
      role: "agent",
      status: "accepted",
    });
  });

  it("rejects unsupported selected files with a toast", async () => {
    const unsupportedFile = new File(["file-bytes"], "archive.zip", {
      type: "application/zip",
    });

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    fireEvent.change(screen.getByLabelText("选择文件"), {
      target: {
        files: [unsupportedFile],
      },
    });

    expect(mediaUploadMocks.uploadWorkbenchFile).not.toHaveBeenCalled();
  });

  it("rejects oversized selected files with a blocking dialog", async () => {
    const oversizedFile = new File(["file-bytes"], "大文件.pdf", {
      type: "application/pdf",
    });
    Object.defineProperty(oversizedFile, "size", {
      configurable: true,
      value: 10 * 1024 * 1024 + 1,
    });

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    fireEvent.change(screen.getByLabelText("选择文件"), {
      target: {
        files: [oversizedFile],
      },
    });

    expect(mediaUploadMocks.uploadWorkbenchFile).not.toHaveBeenCalled();
    expect(
      await screen.findByRole("alertdialog", {
        name: "文件过大，无法发送",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("请选择不超过 10 MB 的文件")).toBeInTheDocument();
    expect(vi.mocked(toast.warning)).not.toHaveBeenCalledWith("文件大小不能超过 10 MB");
  });

  it("blocks conversation switching while a file is uploading", async () => {
    const user = userEvent.setup();
    const upload = createDeferred<Awaited<ReturnType<typeof mediaUploadMocks.uploadWorkbenchFile>>>();
    const file = new File(["file-bytes"], "报价单.pdf", {
      type: "application/pdf",
    });
    vi.mocked(mediaUploadMocks.uploadWorkbenchFile).mockReturnValue(upload.promise);

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    fireEvent.change(screen.getByLabelText("选择文件"), {
      target: {
        files: [file],
      },
    });
    await waitFor(() => {
      expect(screen.getByText(/正在准备发送/)).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /睿白鸽/ }));

    expect(screen.getByTestId("scope-transition-error")).toHaveTextContent(
      "文件上传中，暂不能切换会话",
    );
    expect(screen.getByRole("textbox", { name: "请输入消息……" })).toBeInTheDocument();
    upload.resolve({
      extension: "pdf",
      fileId: "chat-files/conv-001/报价单.pdf",
      fileName: "报价单.pdf",
      fileSize: file.size,
      fileSizeLabel: `${file.size} B`,
      type: "file",
      url: "https://b5.bokr.com.cn/chat-files/conv-001/%E6%8A%A5%E4%BB%B7%E5%8D%95.pdf",
    });
  });

  it("aborts the active file upload when the queued file is canceled", async () => {
    const user = userEvent.setup();
    const upload = createDeferred<Awaited<ReturnType<typeof mediaUploadMocks.uploadWorkbenchFile>>>();
    const file = new File(["file-bytes"], "报价单.pdf", {
      type: "application/pdf",
    });
    vi.mocked(mediaUploadMocks.uploadWorkbenchFile).mockReturnValue(upload.promise);

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    fireEvent.change(screen.getByLabelText("选择文件"), {
      target: {
        files: [file],
      },
    });
    await waitFor(() => {
      expect(mediaUploadMocks.uploadWorkbenchFile).toHaveBeenCalledWith(
        "conv-001",
        file,
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        }),
      );
    });

    const uploadOptions = vi.mocked(mediaUploadMocks.uploadWorkbenchFile).mock.calls.at(-1)?.[2];

    expect(uploadOptions?.signal?.aborted).toBe(false);
    await user.click(screen.getByRole("button", { name: "取消上传 报价单.pdf" }));
    expect(uploadOptions?.signal?.aborted).toBe(true);
    expect(screen.queryByText("报价单.pdf")).not.toBeInTheDocument();
  });

  it("ignores pasted clipboard images outside jpeg and png", async () => {
    const clipboardImage = new File(["image-bytes"], "clipboard.webp", {
      type: "image/webp",
    });

    renderChatWorkbenchPage();

    const composer = await screen.findByRole("textbox", { name: "请输入消息……" });
    await userEvent.click(composer);
    fireEvent.paste(composer, {
      clipboardData: {
        files: [clipboardImage],
      },
    });

    expect(
      within(composer).queryByRole("img", { name: "clipboard.webp" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发送消息" })).toBeDisabled();
  });

  it("limits composer images to five", async () => {
    const clipboardImages = Array.from(
      { length: 6 },
      (_, index) =>
        new File(["image-bytes"], `clipboard-${index + 1}.png`, {
          type: "image/png",
        }),
    );

    renderChatWorkbenchPage();

    const composer = await screen.findByRole("textbox", { name: "请输入消息……" });
    await userEvent.click(composer);
    fireEvent.paste(composer, {
      clipboardData: {
        files: clipboardImages,
      },
    });

    expect(await within(composer).findAllByRole("img")).toHaveLength(5);
    expect(
      within(composer).queryByRole("img", { name: "clipboard-6.png" }),
    ).not.toBeInTheDocument();
  });

  it("disables the composer image picker after five images", async () => {
    const clipboardImages = Array.from(
      { length: 5 },
      (_, index) =>
        new File(["image-bytes"], `clipboard-${index + 1}.png`, {
          type: "image/png",
        }),
    );

    renderChatWorkbenchPage();

    const composer = await screen.findByRole("textbox", { name: "请输入消息……" });
    await userEvent.click(composer);
    fireEvent.paste(composer, {
      clipboardData: {
        files: clipboardImages,
      },
    });

    expect(await within(composer).findAllByRole("img")).toHaveLength(5);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "发送图片" })).toBeDisabled();
    });
  });

  it("keeps consecutive pasted images inline without visible spacer text", async () => {
    const clipboardImages = [
      new File(["image-bytes"], "clipboard-1.png", {
        type: "image/png",
      }),
      new File(["image-bytes"], "clipboard-2.png", {
        type: "image/png",
      }),
    ];

    renderChatWorkbenchPage();

    const composer = await screen.findByRole("textbox", { name: "请输入消息……" });
    await userEvent.click(composer);
    fireEvent.paste(composer, {
      clipboardData: {
        files: clipboardImages,
      },
    });

    expect(await within(composer).findAllByRole("img")).toHaveLength(2);
    expect(composer.textContent?.replaceAll("\u200B", "")).toBe("");
  });

  it("keeps overflowing composer content scrollable inside the editor", async () => {
    renderChatWorkbenchPage();

    const composer = await screen.findByRole("textbox", { name: "请输入消息……" });

    expect(composer).toHaveClass("max-h-80", "overflow-y-auto");
  });

  it("scrolls the composer editor to the bottom after a pasted image loads", async () => {
    const clipboardImage = new File(["image-bytes"], "clipboard.png", {
      type: "image/png",
    });

    renderChatWorkbenchPage();

    const composer = await screen.findByRole("textbox", { name: "请输入消息……" });
    Object.defineProperty(composer, "scrollHeight", {
      configurable: true,
      value: 960,
    });
    composer.scrollTop = 120;

    await userEvent.click(composer);
    fireEvent.paste(composer, {
      clipboardData: {
        files: [clipboardImage],
      },
    });

    const image = await screen.findByRole("img", { name: "clipboard.png" });
    fireEvent.load(image);

    await waitFor(() => {
      expect(composer.scrollTop).toBe(960);
    });
  });

  it("removes a composer image from its close button", async () => {
    const clipboardImage = new File(["image-bytes"], "clipboard.png", {
      type: "image/png",
    });

    renderChatWorkbenchPage();

    const composer = await screen.findByRole("textbox", { name: "请输入消息……" });
    await userEvent.click(composer);
    fireEvent.paste(composer, {
      clipboardData: {
        files: [clipboardImage],
      },
    });

    expect(await screen.findByRole("img", { name: "clipboard.png" })).toBeInTheDocument();

    await userEvent.click(
      within(composer).getByRole("button", { name: "移除图片 clipboard.png" }),
    );

    await waitFor(() => {
      expect(
        within(composer).queryByRole("img", { name: "clipboard.png" }),
      ).not.toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "发送消息" })).toBeDisabled();
  });

  it("shows a sending state and prevents duplicate sends while waiting for the send API", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();
    const sendMessageGate =
      createDeferred<Awaited<ReturnType<typeof baseService.sendMessage>>>();
    const sendMessage = vi.fn((payload: Parameters<typeof baseService.sendMessage>[0]) => {
      void payload;
      return sendMessageGate.promise;
    });

    setWorkbenchService({
      ...baseService,
      sendMessage,
    });

    renderChatWorkbenchPage();

    const composer = await screen.findByRole("textbox", { name: "请输入消息……" });
    await pasteIntoComposer(user, composer, "发送中不要重复");

    const sendButton = screen.getByRole("button", { name: "发送消息" });
    await user.dblClick(sendButton);

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledTimes(1);
      expect(sendButton).toBeDisabled();
      expect(sendButton).toHaveAttribute("aria-busy", "true");
      expect(composer).toHaveAttribute("contenteditable", "false");
    });

    sendMessageGate.resolve({
      clientMessageId: "client-msg-test",
      messageId: "msg-server-test",
      messages: [
        {
          clientMessageId: "client-msg-test",
          messageId: "msg-server-test",
          status: "accepted",
        },
      ],
      status: "accepted",
    });

    await waitFor(() => {
      expect(composer).toHaveTextContent("");
      expect(sendButton).toHaveAttribute("aria-busy", "false");
    });
  });

  it("shows a dialog before switching conversations when the composer has unsent text", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm");

    renderChatWorkbenchPage();

    const composer = await screen.findByRole("textbox", { name: "请输入消息……" });
    await pasteIntoComposer(user, composer, "未发送内容");
    await user.click(screen.getByRole("button", { name: /睿白鸽/ }));

    expect(await screen.findByRole("alertdialog", { name: "切换会话？" }))
      .toBeInTheDocument();
    expect(
      screen.getByText("切换后，输入框中的未发送内容会被清空。"),
    ).toBeInTheDocument();
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(useWorkbenchStore.getState().activeConversationId).toBe("conv-001");
    expect(composer).toHaveTextContent("未发送内容");

    confirmSpy.mockRestore();
  });

  it("clears composer content after confirming a conversation switch", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm");

    renderChatWorkbenchPage();

    const composer = await screen.findByRole("textbox", { name: "请输入消息……" });
    await pasteIntoComposer(user, composer, "切换后清空");
    await user.click(screen.getByRole("button", { name: /睿白鸽/ }));
    await user.click(await screen.findByRole("button", { name: "确认切换" }));

    await waitFor(() => {
      expect(useWorkbenchStore.getState().activeConversationId).toBe("conv-002");
    });
    expect(composer).toHaveTextContent("");
    expect(confirmSpy).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  it("shows a dialog before switching conversations when a quote is selected", async () => {
    const user = userEvent.setup();

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    const targetMessage = await screen.findByText("我先截了个竖图版本给你看。");
    const targetRow = targetMessage.closest('[data-testid="message-row"]');
    expect(targetRow).not.toBeNull();

    await user.click(within(targetRow as HTMLElement).getByRole("button", { name: "消息操作" }));
    await user.click(screen.getByRole("menuitem", { name: "引用消息" }));
    await user.click(screen.getByRole("button", { name: /睿白鸽/ }));

    expect(await screen.findByRole("alertdialog", { name: "切换会话？" }))
      .toBeInTheDocument();
    expect(screen.getByTestId("composer-quote-preview")).toBeInTheDocument();
    expect(useWorkbenchStore.getState().activeConversationId).toBe("conv-001");
  });
});
