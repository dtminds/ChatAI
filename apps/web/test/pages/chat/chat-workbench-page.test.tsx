import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { StrictMode } from "react";
import {
  GROUP_MEMBER_TYPE,
  type SettingsSidebarBindType,
} from "@chatai/contracts";
import {
  createMockWorkbenchService,
  setWorkbenchService,
} from "@/pages/chat/api/workbench-service";
import { uploadWorkbenchFile } from "@/pages/chat/api/media-upload-service";
import { seedGroupMembersByConversationId } from "@/pages/chat/mock-data";
import { ChatWorkbenchPage } from "@/pages/chat/chat-workbench-page";
import type { ComposerSegment } from "@/pages/chat/lib/composer-segments";
import { resolveImageSegmentsForSend } from "@/pages/chat/api/media-upload-service";
import { useWorkbenchStore } from "@/store/workbench-store";
import {
  render,
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

vi.mock("@/pages/chat/api/media-upload-service", () => ({
  resolveImageSegmentsForSend: vi.fn(async (_conversationId, segments) =>
    segments.map((segment: ComposerSegment) =>
      segment.type === "image"
        ? {
            alt: segment.alt,
            fileId: "chat-images/conv-001/mock-image.png",
            height: segment.height,
            type: "image",
            url: "https://mock-bucket.cos.ap-guangzhou.myqcloud.com/chat-images/conv-001/mock-image.png",
            width: segment.width,
          }
        : segment,
    ),
  ),
  uploadWorkbenchFile: vi.fn(async (_conversationId, file: File) => ({
    extension: file.name.split(".").pop() ?? "",
    fileId: `chat-files/conv-001/${file.name}`,
    fileName: file.name,
    fileSize: file.size,
    fileSizeLabel: `${file.size} B`,
    type: "file",
    url: `https://b5.bokr.com.cn/chat-files/conv-001/${file.name}`,
  })),
}));

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

describe("ChatWorkbenchPage", () => {
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

  it("inserts an @ mention from a group message action menu", async () => {
    const user = userEvent.setup();

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await user.click(screen.getByRole("tab", { name: "群聊" }));
    const groupMessage = await screen.findByText("#接龙", { exact: false });
    const targetRow = groupMessage.closest('[data-testid="message-row"]');
    expect(targetRow).not.toBeNull();

    await user.click(within(targetRow as HTMLElement).getByRole("button", { name: "消息操作" }));
    await user.click(screen.getByRole("menuitem", { name: "@Ta" }));

    const composer = screen.getByRole("textbox", { name: "请输入消息……" });

    expect(composer.textContent).toBe("@缪勇飞 群昵称111 ");
    expect(screen.queryByRole("listbox", { name: "选择群成员" })).not.toBeInTheDocument();
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

  it("inserts a pasted clipboard image into the composer and sends it as an image segment", async () => {
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

    await userEvent.click(screen.getByRole("button", { name: "发送消息" }));

    await waitFor(() => {
      expect(
        within(composer).queryByRole("img", { name: "clipboard.png" }),
      ).not.toBeInTheDocument();
    });
    await expectLatestConversationMessage("conv-001", {
      content: {
        imageUrl:
          "https://mock-bucket.cos.ap-guangzhou.myqcloud.com/chat-images/conv-001/mock-image.png",
        type: "image",
      },
      role: "agent",
      status: "accepted",
    });
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
    const user = userEvent.setup();
    const upload = createDeferred<Awaited<ReturnType<typeof uploadWorkbenchFile>>>();
    const file = new File(["file-bytes"], "报价单.pdf", {
      type: "application/pdf",
    });
    vi.mocked(uploadWorkbenchFile).mockReturnValue(upload.promise);

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await user.upload(screen.getByLabelText("选择文件"), file);

    expect(screen.getByText("报价单.pdf")).toBeInTheDocument();
    expect(screen.getByText(/正在准备发送/)).toBeInTheDocument();
    await waitFor(() => {
    expect(uploadWorkbenchFile).toHaveBeenCalledWith(
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
    const user = userEvent.setup({ applyAccept: false });
    const unsupportedFile = new File(["file-bytes"], "archive.zip", {
      type: "application/zip",
    });

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await user.upload(screen.getByLabelText("选择文件"), unsupportedFile);

    expect(uploadWorkbenchFile).not.toHaveBeenCalled();
    expect(vi.mocked(toast.warning)).toHaveBeenCalledWith("仅支持 PDF、Excel、Word、TXT、PPT 文件");
  });

  it("rejects oversized selected files with a blocking dialog", async () => {
    const user = userEvent.setup();
    const oversizedFile = new File(["file-bytes"], "大文件.pdf", {
      type: "application/pdf",
    });
    Object.defineProperty(oversizedFile, "size", {
      configurable: true,
      value: 10 * 1024 * 1024 + 1,
    });

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await user.upload(screen.getByLabelText("选择文件"), oversizedFile);

    expect(uploadWorkbenchFile).not.toHaveBeenCalled();
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
    const upload = createDeferred<Awaited<ReturnType<typeof uploadWorkbenchFile>>>();
    const file = new File(["file-bytes"], "报价单.pdf", {
      type: "application/pdf",
    });
    vi.mocked(uploadWorkbenchFile).mockReturnValue(upload.promise);

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await user.upload(screen.getByLabelText("选择文件"), file);
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
    const upload = createDeferred<Awaited<ReturnType<typeof uploadWorkbenchFile>>>();
    const file = new File(["file-bytes"], "报价单.pdf", {
      type: "application/pdf",
    });
    vi.mocked(uploadWorkbenchFile).mockReturnValue(upload.promise);

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await user.upload(screen.getByLabelText("选择文件"), file);
    await waitFor(() => {
      expect(uploadWorkbenchFile).toHaveBeenCalledWith(
        "conv-001",
        file,
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        }),
      );
    });

    const uploadOptions = vi.mocked(uploadWorkbenchFile).mock.calls.at(-1)?.[2];

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
    expect(vi.mocked(toast.warning)).toHaveBeenCalledWith("单次发送图片限制为5张");
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

  it("collapses and expands the account sidebar into a compact rail", async () => {
    const user = userEvent.setup();

    renderChatWorkbenchPage();

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

    renderChatWorkbenchPage();

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

    renderChatWorkbenchPage();

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

    renderChatWorkbenchPage();

    const composer = await screen.findByRole("textbox", { name: "请输入消息……" });
    await pasteIntoComposer(user, composer, "@");

    expect(screen.queryByRole("listbox", { name: "选择群成员" })).not.toBeInTheDocument();
    expect(composer).toHaveTextContent("@");
  });

  it("selects group members from @ input and sends inline mentions", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();
    const sendMessage = vi.fn(baseService.sendMessage);

    setWorkbenchService({
      ...baseService,
      sendMessage,
    });

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await user.click(screen.getByRole("tab", { name: "群聊" }));

    const composer = await screen.findByRole("textbox", { name: "请输入消息……" });
    await pasteIntoComposer(user, composer, "@小");

    expect(screen.getByRole("listbox", { name: "选择群成员" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "所有人（7人）" })).not.toBeInTheDocument();
    const xiaolinOption = screen.getByRole("option", { name: "小林" });
    expect(xiaolinOption).toBeInTheDocument();
    expect(within(xiaolinOption).getByTestId("mention-member-avatar")).toHaveAttribute(
      "src",
      seedGroupMembersByConversationId["conv-004"][0].avatarUrl,
    );

    await user.keyboard("{Enter}");

    expect(composer).toHaveTextContent("@小林");
    expect(screen.queryByRole("listbox", { name: "选择群成员" })).not.toBeInTheDocument();

    await user.click(composer);
    await pasteIntoComposer(user, composer, "今天统一看群公告");
    await user.click(screen.getByRole("button", { name: "发送消息" }));

    await waitFor(() => {
      expect(
        useWorkbenchStore.getState().messagesByConversationId["conv-004"].at(-1),
      ).toMatchObject({
        content: {
          text: "@小林 今天统一看群公告",
          type: "text",
        },
      });
    });
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        mention: {
          location: "start",
          memberIds: ["member-001"],
        },
        segment: {
          text: "@小林 今天统一看群公告",
          type: "text",
        },
      }),
    );
  });

  it("selects all members from @ input and sends mention-all", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();
    const sendMessage = vi.fn(baseService.sendMessage);

    setWorkbenchService({
      ...baseService,
      sendMessage,
    });

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await user.click(screen.getByRole("tab", { name: "群聊" }));

    const composer = await screen.findByRole("textbox", { name: "请输入消息……" });
    await pasteIntoComposer(user, composer, "@所");
    const allOption = screen.getByRole("option", { name: "所有人（7人）" });

    expect(within(allOption).queryByTestId("mention-member-avatar")).not.toBeInTheDocument();

    await user.click(allOption);

    expect(composer).toHaveTextContent("@所有人");
    expect(screen.queryByRole("listbox", { name: "选择群成员" })).not.toBeInTheDocument();

    await user.click(composer);
    await pasteIntoComposer(user, composer, "今天统一看群公告");
    await user.click(screen.getByRole("button", { name: "发送消息" }));

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          mention: {
            all: true,
            location: "start",
            memberIds: [],
          },
          segment: {
            text: "@所有人 今天统一看群公告",
            type: "text",
          },
        }),
      );
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

    renderChatWorkbenchPage();

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

    expect(within(sidePanel).getByRole("heading", { name: "群成员 · 共 8 人" })).toBeInTheDocument();
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

  it("keeps member mentions available for backend group conversation ids", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async getConversations(seatId, options) {
        const response = await baseService.getConversations(seatId, options);

        return {
          ...response,
          items: response.items.map((conversation) =>
            conversation.conversationId === "conv-004"
              ? {
                  ...conversation,
                  conversationId: "backend-group-001",
                }
              : conversation,
          ),
        };
      },
    });

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await user.click(screen.getByRole("tab", { name: "群聊" }));

    const composer = await screen.findByRole("textbox", { name: "请输入消息……" });
    await pasteIntoComposer(user, composer, "@小");

    expect(screen.getByRole("listbox", { name: "选择群成员" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "小林" })).toBeInTheDocument();
  });

  it("does not render fallback avatars in the mention picker", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async getGroupMembers(conversationId) {
        const response = await baseService.getGroupMembers(conversationId);

        return {
          ...response,
          items: [
            {
              avatarUrl: "",
              displayName: "无头像成员",
              nickname: undefined,
              thirdUserId: "member-no-avatar",
              type: GROUP_MEMBER_TYPE.NORMAL,
            },
            ...response.items,
          ],
        };
      },
    });

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await user.click(screen.getByRole("tab", { name: "群聊" }));

    const composer = await screen.findByRole("textbox", { name: "请输入消息……" });
    await pasteIntoComposer(user, composer, "@无");

    const option = screen.getByRole("option", { name: "无头像成员" });

    expect(within(option).queryByTestId("mention-member-avatar")).not.toBeInTheDocument();
    expect(within(option).queryByText("无")).not.toBeInTheDocument();
  });

  it("dismisses group member mentions with Escape until the query changes", async () => {
    const user = userEvent.setup();

    renderChatWorkbenchPage();

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

  it("keeps inline mentions as a single send segment", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();
    const sendMessage = vi.fn(baseService.sendMessage);

    setWorkbenchService({
      ...baseService,
      sendMessage,
    });

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await user.click(screen.getByRole("tab", { name: "群聊" }));

    const composer = await screen.findByRole("textbox", { name: "请输入消息……" });
    await pasteIntoComposer(user, composer, "@小");
    await user.click(screen.getByRole("option", { name: "小林" }));

    expect(composer).toHaveTextContent("@小林");
    expect(screen.queryByRole("listbox", { name: "选择群成员" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "发送消息" }));

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          segment: {
            text: "@小林",
            type: "text",
          },
        }),
      );
    });
  });

  it("deduplicates mentioned member ids when sending repeated inline mentions", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();
    const sendMessage = vi.fn(baseService.sendMessage);

    setWorkbenchService({
      ...baseService,
      sendMessage,
    });

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await user.click(screen.getByRole("tab", { name: "群聊" }));

    const composer = await screen.findByRole("textbox", { name: "请输入消息……" });
    await pasteIntoComposer(user, composer, "@小");
    await user.click(screen.getByRole("option", { name: "小林" }));
    await user.click(composer);
    await pasteIntoComposer(user, composer, "@小");
    await user.click(screen.getByRole("option", { name: "小林" }));
    await user.click(composer);
    await pasteIntoComposer(user, composer, " 收到");
    await user.click(screen.getByRole("button", { name: "发送消息" }));

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          mention: {
            location: "start",
            memberIds: ["member-001"],
          },
        }),
      );
    });
  });

  it("selects active mention options with keyboard focus", async () => {
    const user = userEvent.setup();

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await user.click(screen.getByRole("tab", { name: "群聊" }));

    const composer = await screen.findByRole("textbox", { name: "请输入消息……" });
    await pasteIntoComposer(user, composer, "@小");
    await user.keyboard("{Enter}");

    expect(composer).toHaveTextContent("@小林");
    expect(screen.queryByRole("listbox", { name: "选择群成员" })).not.toBeInTheDocument();
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

  it("shows conversation row actions without high-priority labels", async () => {
    const user = userEvent.setup();

    renderChatWorkbenchPage();

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

    renderChatWorkbenchPage();

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

    renderChatWorkbenchPage();

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

    renderChatWorkbenchPage();

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

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await user.click(screen.getAllByRole("button", { name: "会话操作" })[1]);
    await user.click(screen.getByRole("menuitem", { name: "不显示" }));

    await waitFor(() => {
      expect(observedConversationIds).toEqual(["conv-002"]);
    });
    expect(screen.queryByText("睿白鸽")).not.toBeInTheDocument();
  });

  it("does not show removed chat header actions", async () => {
    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });

    expect(screen.queryByRole("button", { name: "查看历史" })).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "选择主题模式" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "跟随系统" })).toBeInTheDocument();
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
