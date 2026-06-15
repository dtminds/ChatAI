import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MATERIAL_COLLECTION_BIZ_TYPE } from "@chatai/contracts";
import { createMockWorkbenchService, setWorkbenchService } from "@/pages/chat/api/workbench-service";
import { useWorkbenchStore } from "@/store/workbench-store";
import {
  installChatWorkbenchTestEnvironment,
  mediaUploadMocks,
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

async function pasteIntoComposer(
  user: ReturnType<typeof userEvent.setup>,
  composer: HTMLElement,
  text: string,
) {
  await user.click(composer);
  await user.paste(text);
}

function placeContentEditableCaretAtTextOffset(element: HTMLElement, offset: number) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let remainingOffset = Math.max(0, offset);
  let currentNode = walker.nextNode();

  while (currentNode) {
    const textLength = currentNode.textContent?.length ?? 0;

    if (remainingOffset <= textLength) {
      const range = document.createRange();
      range.setStart(currentNode, remainingOffset);
      range.collapse(true);

      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      element.focus();
      return;
    }

    remainingOffset -= textLength;
    currentNode = walker.nextNode();
  }

  element.focus();
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

async function expectSentConversationMessage(
  conversationId: string,
  sendMessage: ReturnType<typeof vi.fn>,
  expectedMessage: object,
) {
  let sentMessage:
    | NonNullable<
        ReturnType<typeof useWorkbenchStore.getState>["messagesByConversationId"][string]
      >[number]
    | undefined;

  await waitFor(async () => {
    const sendResult = await sendMessage.mock.results[0]?.value;
    const messageId = sendResult?.messageId;

    expect(messageId).toBeTruthy();
    sentMessage = useWorkbenchStore
      .getState()
      .messagesByConversationId[conversationId]
      .find((message) => message.remoteMessageId === messageId);
    expect(
      sentMessage,
    ).toMatchObject(expectedMessage);
  });

  return sentMessage;
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
    await user.click(screen.getByRole("menuitem", { name: "引用" }));
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

  it("pads a selected mention when @ is typed immediately after text", async () => {
    const user = userEvent.setup();

    renderChatWorkbenchPage();

    await user.click(await screen.findByRole("tab", { name: "群聊" }));
    await waitFor(() => {
      expect(useWorkbenchStore.getState().activeConversationId).toBe("conv-004");
    });

    const composer = await screen.findByRole("textbox", { name: "请输入消息……" });
    await pasteIntoComposer(user, composer, "请@");

    const listbox = await screen.findByRole("listbox", { name: "选择群成员" });
    await user.click(within(listbox).getByRole("option", { name: "所有人（6人）" }));

    expect(composer).toHaveTextContent("请 @所有人");
  });

  it("inserts a selected mention at a middle caret position", async () => {
    const user = userEvent.setup();

    renderChatWorkbenchPage();

    await user.click(await screen.findByRole("tab", { name: "群聊" }));
    await waitFor(() => {
      expect(useWorkbenchStore.getState().activeConversationId).toBe("conv-004");
    });

    const composer = await screen.findByRole("textbox", { name: "请输入消息……" });
    await pasteIntoComposer(user, composer, "1  @帅庆 @帅庆");
    placeContentEditableCaretAtTextOffset(composer, 1);
    await user.keyboard("@");

    const listbox = await screen.findByRole("listbox", { name: "选择群成员" });
    await user.click(within(listbox).getByRole("option", { name: "所有人（6人）" }));

    expect(composer.textContent).toBe("1 @所有人   @帅庆 @帅庆");
  });

  it("opens the group mention picker when @ is typed at a middle caret position", async () => {
    const user = userEvent.setup();

    renderChatWorkbenchPage();

    await user.click(await screen.findByRole("tab", { name: "群聊" }));
    await waitFor(() => {
      expect(useWorkbenchStore.getState().activeConversationId).toBe("conv-004");
    });

    const composer = await screen.findByRole("textbox", { name: "请输入消息……" });
    await pasteIntoComposer(user, composer, "1  @帅庆 @帅庆");
    placeContentEditableCaretAtTextOffset(composer, 1);
    await user.keyboard("@");

    const listbox = await screen.findByRole("listbox", { name: "选择群成员" });
    expect(within(listbox).getByRole("option", { name: "所有人（6人）" })).toBeInTheDocument();
    expect(composer.textContent).toBe("1@  @帅庆 @帅庆");
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

  it("switches to collected expressions from the WeChat emoji picker footer and sends the selected expression", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();
    const listMaterialCollections = vi.fn(async (request) => {
      if (request.bizType !== MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION) {
        return baseService.listMaterialCollections(request);
      }

      return {
        items: [
          {
            bizType: MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION,
            content: {
              alt: "贴贴表情",
              fileUrl: "https://example.com/expression.gif",
            },
            contentType: "emotion" as const,
            groupId: 0 as const,
            id: "material-expression-001",
            messageId: "msg-expression-001",
            sort: 1_781_244_000_000,
            title: "贴贴表情",
          },
        ],
        pagination: {
          hasMore: false,
          page: 1,
          pageSize: 100,
          total: 1,
        },
      };
    });
    const sendGate = createDeferred<Awaited<ReturnType<typeof baseService.sendMessage>>>();
    const sendMessage = vi.fn(() => sendGate.promise);

    setWorkbenchService({
      ...baseService,
      listMaterialCollections,
      sendMessage,
    });

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    expect(listMaterialCollections).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "微信表情" }));

    expect(await screen.findByRole("button", { name: "微笑" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "发送收藏表情 贴贴表情" }),
    ).not.toBeInTheDocument();
    expect(listMaterialCollections).not.toHaveBeenCalled();

    await user.click(screen.getByRole("tab", { name: "自定义表情" }));

    expect(screen.queryByRole("button", { name: "微笑" })).not.toBeInTheDocument();
    expect(listMaterialCollections).toHaveBeenCalledWith({
      bizType: MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION,
      groupId: 0,
      page: 1,
      pageSize: 100,
    });
    expect(listMaterialCollections).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("tab", { name: "微信表情" }));
    await user.click(screen.getByRole("tab", { name: "自定义表情" }));

    expect(listMaterialCollections).toHaveBeenCalledTimes(2);
    expect(listMaterialCollections).toHaveBeenLastCalledWith({
      bizType: MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION,
      groupId: 0,
      page: 1,
      pageSize: 100,
    });
    const expressionButton = await screen.findByRole("button", {
      name: "发送收藏表情 贴贴表情",
    });
    await user.click(expressionButton);

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: "conv-001",
          seatId: "drc",
          segment: {
            materialCollectionId: "material-expression-001",
            type: "emotion",
          },
        }),
      );
    });
    expect(expressionButton).toBeDisabled();
    expect(
      within(expressionButton).getByRole("status", { name: "发送中" }),
    ).toBeInTheDocument();

    sendGate.resolve({
      clientMessageId: "local-expression-001",
      messageId: "msg-expression-sent-001",
      status: "accepted",
    });

    expect(workbenchToastWarningMock).not.toHaveBeenCalledWith(
      "自定义表情发送功能内测中，即将开放",
    );
    await expectLatestConversationMessage("conv-001", {
      content: {
        imageUrl: "https://example.com/expression.gif",
        type: "image",
        variant: "emotion",
      },
      role: "agent",
      status: "accepted",
    });
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "发送收藏表情 贴贴表情" }),
      ).not.toBeInTheDocument();
    });
  });

  it("manages collected expressions from the custom emoji context menu", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();
    const topMaterialCollection = vi.fn().mockResolvedValue({ ok: true });
    const deleteMaterialCollection = vi.fn().mockResolvedValue({ ok: true });
    const listMaterialCollections = vi.fn(async (request) => {
      if (request.bizType !== MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION) {
        return baseService.listMaterialCollections(request);
      }

      return {
        items: [
          {
            bizType: MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION,
            content: {
              alt: "贴贴表情",
              fileUrl: "https://example.com/expression.gif",
            },
            contentType: "emotion" as const,
            groupId: 0 as const,
            id: "material-expression-001",
            messageId: "msg-expression-001",
            sort: 1_781_244_000_000,
            title: "贴贴表情",
          },
        ],
        pagination: {
          hasMore: false,
          page: 1,
          pageSize: 100,
          total: 1,
        },
      };
    });

    setWorkbenchService({
      ...baseService,
      deleteMaterialCollection,
      listMaterialCollections,
      topMaterialCollection,
    });

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await user.click(screen.getByRole("button", { name: "微信表情" }));
    await user.click(screen.getByRole("tab", { name: "自定义表情" }));

    const expressionButton = await screen.findByRole("button", {
      name: "发送收藏表情 贴贴表情",
    });

    fireEvent.contextMenu(expressionButton);
    await user.click(await screen.findByRole("menuitem", { name: "移到最前" }));

    await waitFor(() => {
      expect(topMaterialCollection).toHaveBeenCalledWith("material-expression-001");
    });

    fireEvent.contextMenu(expressionButton);
    await user.click(await screen.findByRole("menuitem", { name: "删除" }));

    await waitFor(() => {
      expect(deleteMaterialCollection).toHaveBeenCalledWith("material-expression-001");
    });
    expect(listMaterialCollections).toHaveBeenCalledWith({
      bizType: MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION,
      groupId: 0,
      page: 1,
      pageSize: 100,
    });
  });

  it("loads more collected expressions from the custom emoji panel", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();
    const listMaterialCollections = vi.fn(async (request) => {
      if (request.bizType !== MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION) {
        return baseService.listMaterialCollections(request);
      }

      const page = request.page ?? 1;

      return {
        items: [
          {
            bizType: MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION,
            content: {
              alt: `贴贴表情${page}`,
              fileUrl: `https://example.com/expression-${page}.gif`,
            },
            contentType: "emotion" as const,
            groupId: 0 as const,
            id: `material-expression-00${page}`,
            messageId: `msg-expression-00${page}`,
            sort: 1_781_244_000_000 - page,
            title: `贴贴表情${page}`,
          },
        ],
        pagination: {
          hasMore: page === 1,
          page,
          pageSize: 100,
          total: 2,
        },
      };
    });

    setWorkbenchService({
      ...baseService,
      listMaterialCollections,
    });

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await user.click(screen.getByRole("button", { name: "微信表情" }));
    await user.click(screen.getByRole("tab", { name: "自定义表情" }));

    expect(
      await screen.findByRole("button", { name: "发送收藏表情 贴贴表情1" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "加载更多" }));

    expect(
      await screen.findByRole("button", { name: "发送收藏表情 贴贴表情2" }),
    ).toBeInTheDocument();
    expect(listMaterialCollections).toHaveBeenCalledWith({
      bizType: MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION,
      groupId: 0,
      page: 2,
      pageSize: 100,
    });
  });

  it.each([
    ["收藏文件", "收录的文件"],
    ["收藏小程序", "收录的小程序"],
    ["收藏H5", "收录的H5"],
  ])("opens the %s material library from the composer", async (buttonName, dialogName) => {
    const user = userEvent.setup();

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await user.click(screen.getByRole("button", { name: buttonName }));

    expect(
      await screen.findByRole("dialog", { name: dialogName }),
    ).toBeInTheDocument();
  });

  it("does not expose the collected sphfeed material library entry in the composer", async () => {
    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });

    expect(screen.queryByRole("button", { name: "收藏视频号" })).not.toBeInTheDocument();
  });

  it("keeps the latest material library request when switching material types quickly", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();
    const fileRequest = createDeferred<Awaited<ReturnType<typeof baseService.listMaterialGroups>>>();
    const miniProgramRequest =
      createDeferred<Awaited<ReturnType<typeof baseService.listMaterialGroups>>>();
    const listMaterialGroups = vi.fn((request) => {
      if (request.bizType === MATERIAL_COLLECTION_BIZ_TYPE.FILE) {
        return fileRequest.promise;
      }

      if (request.bizType === MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM) {
        return miniProgramRequest.promise;
      }

      return baseService.listMaterialGroups(request);
    });
    const listMaterialCollections = vi.fn((request) => {
      if (request.bizType === MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM) {
        return Promise.resolve({
          items: [
            {
              bizType: MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM,
              content: {
                appName: "企微助手",
                title: "小程序",
              },
              contentType: "mini-program" as const,
              groupId: "group-mini",
              id: "material-mini-001",
              messageId: "msg-mini-001",
              sort: 1,
              title: "企微助手",
            },
          ],
          pagination: {
            hasMore: false,
            page: 1,
            pageSize: 100,
            total: 1,
          },
        });
      }

      return baseService.listMaterialCollections(request);
    });

    setWorkbenchService({
      ...baseService,
      listMaterialCollections,
      listMaterialGroups,
    });

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await user.click(screen.getByRole("button", { name: "收藏文件" }));
    await user.click(screen.getByRole("button", { name: "关闭" }));
    await user.click(screen.getByRole("button", { name: "收藏小程序" }));

    miniProgramRequest.resolve({
      groups: [
        {
          bizType: MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM,
          id: "group-mini",
          sort: 1,
          title: "小程序分组",
        },
      ],
    });

    expect(
      await screen.findByRole("dialog", { name: "收录的小程序" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("小程序分组")).toBeInTheDocument();

    fileRequest.resolve({
      groups: [
        {
          bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
          id: "group-file",
          sort: 1,
          title: "文件分组",
        },
      ],
    });

    await waitFor(() => {
      expect(screen.queryByText("文件分组")).not.toBeInTheDocument();
    });
    expect(screen.getByText("小程序分组")).toBeInTheDocument();
  });

  it("sends a collected mini-program material as a source-message forward", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();
    const sendMessage = vi.fn(baseService.sendMessage);
    const listMaterialGroups = vi.fn(async (request) => {
      if (request.bizType !== MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM) {
        return baseService.listMaterialGroups(request);
      }

      return {
        groups: [
          {
            bizType: MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM,
            id: "group-mini",
            sort: 100,
            title: "小程序分组",
          },
        ],
      };
    });
    const listMaterialCollections = vi.fn(async (request) => {
      if (request.bizType !== MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM) {
        return baseService.listMaterialCollections(request);
      }

      return {
        items: [
          {
            bizType: MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM,
            content: {
              appName: "企微助手",
              title: "客户跟进小程序",
            },
            contentType: "mini-program" as const,
            groupId: "group-mini",
            id: "material-mini-001",
            messageId: "msg-mini-001",
            sort: 1,
            title: "客户跟进小程序",
          },
        ],
        pagination: {
          hasMore: false,
          page: request.page ?? 1,
          pageSize: 100,
          total: 1,
        },
      };
    });

    setWorkbenchService({
      ...baseService,
      listMaterialCollections,
      listMaterialGroups,
      sendMessage,
    });

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await user.click(screen.getByRole("button", { name: "收藏小程序" }));
    await user.click(
      await screen.findByRole("button", { name: /选择素材 客户跟进小程序/ }),
    );
    await user.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: "conv-001",
          seatId: "drc",
          segment: expect.objectContaining({
            materialCollectionId: "material-mini-001",
            type: "weapp",
          }),
        }),
      );
    });
    expect(sendMessage.mock.calls[0]?.[0].segment).not.toHaveProperty("href");
    expect(sendMessage.mock.calls[0]?.[0].segment).not.toHaveProperty("url");
    await expectSentConversationMessage("conv-001", sendMessage, {
      content: {
        appName: "企微助手",
        title: "客户跟进小程序",
        type: "mini-program",
      },
      role: "agent",
    });
  });

  it("sends a collected file material as a file segment", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();
    const sendMessage = vi.fn(baseService.sendMessage);
    const listMaterialGroups = vi.fn(async (request) => {
      if (request.bizType !== MATERIAL_COLLECTION_BIZ_TYPE.FILE) {
        return baseService.listMaterialGroups(request);
      }

      return {
        groups: [
          {
            bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
            id: "group-file",
            sort: 100,
            title: "文件分组",
          },
        ],
      };
    });
    const listMaterialCollections = vi.fn(async (request) => {
      if (request.bizType !== MATERIAL_COLLECTION_BIZ_TYPE.FILE) {
        return baseService.listMaterialCollections(request);
      }

      return {
        items: [
          {
            bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
            content: {
              extension: "pdf",
              fileName: "报价单.pdf",
              fileSizeLabel: "128 KB",
              fileUrl: "https://example.com/files/quote.pdf",
            },
            contentType: "file" as const,
            groupId: "group-file",
            id: "material-file-001",
            messageId: "msg-file-001",
            sort: 1,
            title: "报价单.pdf",
          },
        ],
        pagination: {
          hasMore: false,
          page: request.page ?? 1,
          pageSize: 100,
          total: 1,
        },
      };
    });

    setWorkbenchService({
      ...baseService,
      listMaterialCollections,
      listMaterialGroups,
      sendMessage,
    });

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await user.click(screen.getByRole("button", { name: "收藏文件" }));
    await user.click(
      await screen.findByRole("button", {
        name: "选择 报价单.pdf",
      }),
    );
    await user.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: "conv-001",
          seatId: "drc",
          segment: {
            materialCollectionId: "material-file-001",
            type: "file",
          },
        }),
      );
    });
    expect(sendMessage.mock.calls[0]?.[0].segment).not.toHaveProperty("href");
    expect(sendMessage.mock.calls[0]?.[0].segment).not.toHaveProperty("url");
    const sentMessage = await expectSentConversationMessage("conv-001", sendMessage, {
      content: {
        extension: "pdf",
        fileName: "报价单.pdf",
        fileSizeLabel: "128 KB",
        sourceLabel: "文件",
        type: "file",
      },
      role: "agent",
    });
    expect(sentMessage?.status === "accepted" || sentMessage?.status === "sent").toBe(true);
  });

  it("sends a collected H5 material as an h5 segment", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();
    const sendMessage = vi.fn(baseService.sendMessage);
    const listMaterialGroups = vi.fn(async (request) => {
      if (request.bizType !== MATERIAL_COLLECTION_BIZ_TYPE.H5) {
        return baseService.listMaterialGroups(request);
      }

      return {
        groups: [
          {
            bizType: MATERIAL_COLLECTION_BIZ_TYPE.H5,
            id: "group-h5",
            sort: 100,
            title: "H5分组",
          },
        ],
      };
    });
    const listMaterialCollections = vi.fn(async (request) => {
      if (request.bizType !== MATERIAL_COLLECTION_BIZ_TYPE.H5) {
        return baseService.listMaterialCollections(request);
      }

      return {
        items: [
          {
            bizType: MATERIAL_COLLECTION_BIZ_TYPE.H5,
            content: {
              coverUrl: "https://example.com/redpacket.png",
              desc: "恭喜发财，大吉大利",
              href: "https://example.com/redpacket",
              title: "红包来啦",
            },
            contentType: "h5" as const,
            groupId: "group-h5",
            id: "material-h5-001",
            messageId: "msg-h5-001",
            sort: 1,
            title: "红包来啦",
          },
        ],
        pagination: {
          hasMore: false,
          page: request.page ?? 1,
          pageSize: 100,
          total: 1,
        },
      };
    });

    setWorkbenchService({
      ...baseService,
      listMaterialCollections,
      listMaterialGroups,
      sendMessage,
    });

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await user.click(screen.getByRole("button", { name: "收藏H5" }));
    await user.click(await screen.findByRole("button", { name: /选择素材 红包来啦/ }));
    await user.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: "conv-001",
          seatId: "drc",
          segment: {
            materialCollectionId: "material-h5-001",
            type: "h5",
          },
        }),
      );
    });
    await expectSentConversationMessage("conv-001", sendMessage, {
      content: {
        description: "恭喜发财，大吉大利",
        previewImageUrl: "https://example.com/redpacket.png",
        title: "红包来啦",
        type: "h5",
        url: "https://example.com/redpacket",
      },
      role: "agent",
    });
  });

  it("sends a collected H5 material stored with legacy linkUrl field", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();
    const sendMessage = vi.fn(baseService.sendMessage);
    const listMaterialGroups = vi.fn(async (request) => {
      if (request.bizType !== MATERIAL_COLLECTION_BIZ_TYPE.H5) {
        return baseService.listMaterialGroups(request);
      }

      return {
        groups: [
          {
            bizType: MATERIAL_COLLECTION_BIZ_TYPE.H5,
            id: "group-h5",
            sort: 100,
            title: "H5分组",
          },
        ],
      };
    });
    const listMaterialCollections = vi.fn(async (request) => {
      if (request.bizType !== MATERIAL_COLLECTION_BIZ_TYPE.H5) {
        return baseService.listMaterialCollections(request);
      }

      return {
        items: [
          {
            bizType: MATERIAL_COLLECTION_BIZ_TYPE.H5,
            content: {
              description: "活动说明",
              linkUrl: "https://example.com/legacy-page",
              title: "活动页",
            },
            contentType: "h5" as const,
            groupId: "group-h5",
            id: "material-h5-link-url",
            messageId: "msg-h5-link-url",
            sort: 1,
            title: "活动页",
          },
        ],
        pagination: {
          hasMore: false,
          page: request.page ?? 1,
          pageSize: 100,
          total: 1,
        },
      };
    });

    setWorkbenchService({
      ...baseService,
      listMaterialCollections,
      listMaterialGroups,
      sendMessage,
    });

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await user.click(screen.getByRole("button", { name: "收藏H5" }));
    await user.click(await screen.findByRole("button", { name: /选择素材 活动页/ }));
    await user.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: "conv-001",
          seatId: "drc",
          segment: {
            materialCollectionId: "material-h5-link-url",
            type: "h5",
          },
        }),
      );
    });
    await expectSentConversationMessage("conv-001", sendMessage, {
      content: {
        description: "活动说明",
        title: "活动页",
        type: "h5",
        url: "https://example.com/legacy-page",
      },
      role: "agent",
    });
  });

  it("keeps the selected material group after managing an item", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();
    const deleteMaterialCollection = vi.fn().mockResolvedValue({ ok: true });
    const listMaterialGroups = vi.fn(async (request) => {
      if (request.bizType !== MATERIAL_COLLECTION_BIZ_TYPE.FILE) {
        return baseService.listMaterialGroups(request);
      }

      return {
        groups: [
          {
            bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
            id: "group-first",
            sort: 300,
            title: "第一分组",
          },
          {
            bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
            id: "group-second",
            sort: 200,
            title: "第二分组",
          },
        ],
      };
    });
    const listMaterialCollections = vi.fn(async (request) => {
      if (request.bizType !== MATERIAL_COLLECTION_BIZ_TYPE.FILE) {
        return baseService.listMaterialCollections(request);
      }

      return {
        items:
          request.groupId === "group-second"
            ? [
                {
                  bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
                  content: {
                    extension: "pdf",
                    fileName: "第二分组文件.pdf",
                    fileSizeLabel: "2 KB",
                    sourceLabel: "文件",
                  },
                  contentType: "file" as const,
                  groupId: "group-second",
                  id: "material-file-second",
                  messageId: "msg-file-second",
                  sort: 1,
                  title: "第二分组文件.pdf",
                },
              ]
            : [],
        pagination: {
          hasMore: false,
          page: request.page ?? 1,
          pageSize: 100,
          total: request.groupId === "group-second" ? 1 : 0,
        },
      };
    });

    setWorkbenchService({
      ...baseService,
      deleteMaterialCollection,
      listMaterialCollections,
      listMaterialGroups,
    });

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await user.click(screen.getByRole("button", { name: "收藏文件" }));
    await user.click(await screen.findByRole("button", { name: "第二分组" }));

    const materialRow = await screen.findByRole("row", {
      name: /第二分组文件\.pdf/,
    });
    const listMaterialGroupsCallsAfterOpen = listMaterialGroups.mock.calls.length;
    const listMaterialCollectionsCallsAfterSelect =
      listMaterialCollections.mock.calls.length;

    fireEvent.contextMenu(materialRow);
    await user.click(await screen.findByRole("menuitem", { name: "删除" }));

    await waitFor(() => {
      expect(deleteMaterialCollection).toHaveBeenCalledWith("material-file-second");
    });
    expect(
      screen.getByRole("row", { name: /第二分组文件\.pdf/ }),
    ).toBeInTheDocument();
    expect(listMaterialGroups.mock.calls.length).toBe(
      listMaterialGroupsCallsAfterOpen,
    );
    expect(listMaterialCollections.mock.calls.length).toBe(
      listMaterialCollectionsCallsAfterSelect + 1,
    );
    expect(listMaterialCollections).toHaveBeenLastCalledWith({
      bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
      groupId: "group-second",
      page: 1,
      pageSize: 100,
    });
  });

  it("reloads only material groups after topping a group", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();
    const topMaterialGroup = vi.fn().mockResolvedValue({ ok: true });
    const listMaterialGroups = vi.fn(async (request) => {
      if (request.bizType !== MATERIAL_COLLECTION_BIZ_TYPE.FILE) {
        return baseService.listMaterialGroups(request);
      }

      return {
        groups: [
          {
            bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
            id: "group-first",
            sort: 300,
            title: "第一分组",
          },
          {
            bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
            id: "group-second",
            sort: 400,
            title: "第二分组",
          },
        ],
      };
    });
    const listMaterialCollections = vi.fn(async (request) => {
      if (request.bizType !== MATERIAL_COLLECTION_BIZ_TYPE.FILE) {
        return baseService.listMaterialCollections(request);
      }

      return {
        items:
          request.groupId === "group-second"
            ? [
                {
                  bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
                  content: {
                    extension: "pdf",
                    fileName: "第二分组文件.pdf",
                    fileSizeLabel: "2 KB",
                    sourceLabel: "文件",
                  },
                  contentType: "file" as const,
                  groupId: "group-second",
                  id: "material-file-second",
                  messageId: "msg-file-second",
                  sort: 1,
                  title: "第二分组文件.pdf",
                },
              ]
            : [],
        pagination: {
          hasMore: false,
          page: request.page ?? 1,
          pageSize: 100,
          total: request.groupId === "group-second" ? 1 : 0,
        },
      };
    });

    setWorkbenchService({
      ...baseService,
      listMaterialCollections,
      listMaterialGroups,
      topMaterialGroup,
    });

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await user.click(screen.getByRole("button", { name: "收藏文件" }));
    await user.click(await screen.findByRole("button", { name: "第二分组" }));
    await screen.findByRole("row", {
      name: /第二分组文件\.pdf/,
    });

    const listMaterialGroupsCallsAfterOpen = listMaterialGroups.mock.calls.length;
    const listMaterialCollectionsCallsAfterSelect =
      listMaterialCollections.mock.calls.length;

    await user.click(
      screen.getByRole("button", { name: "打开 第二分组 操作菜单" }),
    );
    await user.click(await screen.findByRole("menuitem", { name: "移到最前" }));

    await waitFor(() => {
      expect(topMaterialGroup).toHaveBeenCalledWith(
        "group-second",
        MATERIAL_COLLECTION_BIZ_TYPE.FILE,
      );
    });
    expect(listMaterialGroups.mock.calls.length).toBe(
      listMaterialGroupsCallsAfterOpen + 1,
    );
    expect(listMaterialCollections.mock.calls.length).toBe(
      listMaterialCollectionsCallsAfterSelect,
    );
    expect(
      screen.getByRole("row", { name: /第二分组文件\.pdf/ }),
    ).toBeInTheDocument();
  });

  it("selects the first group and loads items after creating from an empty library", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();
    let listMaterialGroupsCallCount = 0;
    const createMaterialGroup = vi.fn(async () => ({
      bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
      id: "group-first",
      sort: 400,
      title: "第一分组",
    }));
    const listMaterialGroups = vi.fn(async (request) => {
      if (request.bizType !== MATERIAL_COLLECTION_BIZ_TYPE.FILE) {
        return baseService.listMaterialGroups(request);
      }

      listMaterialGroupsCallCount += 1;

      if (listMaterialGroupsCallCount === 1) {
        return { groups: [] };
      }

      return {
        groups: [
          {
            bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
            id: "group-first",
            sort: 400,
            title: "第一分组",
          },
        ],
      };
    });
    const listMaterialCollections = vi.fn(async (request) => {
      if (request.bizType !== MATERIAL_COLLECTION_BIZ_TYPE.FILE) {
        return baseService.listMaterialCollections(request);
      }

      return {
        items: [],
        pagination: {
          hasMore: false,
          page: 1,
          pageSize: 100,
          total: 0,
        },
      };
    });

    setWorkbenchService({
      ...baseService,
      createMaterialGroup,
      listMaterialCollections,
      listMaterialGroups,
    });

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await user.click(screen.getByRole("button", { name: "收藏文件" }));
    expect(await screen.findByText("暂无分组")).toBeInTheDocument();
    expect(listMaterialCollections).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "新建分组" }));
    await user.type(screen.getByRole("textbox", { name: "分组名称" }), "第一分组");
    await user.click(screen.getByRole("button", { name: "新建" }));

    await waitFor(() => {
      expect(createMaterialGroup).toHaveBeenCalledWith({
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
        title: "第一分组",
      });
    });
    expect(screen.queryByText("暂无分组")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "第一分组" })).toBeInTheDocument();
    await waitFor(() => {
      expect(listMaterialCollections).toHaveBeenCalledWith({
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
        groupId: "group-first",
        page: 1,
        pageSize: 100,
      });
    });
    expect(await screen.findByText("暂无数据")).toBeInTheDocument();
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
    expect(workbenchToastWarningMock).not.toHaveBeenCalledWith("文件大小不能超过 10 MB");
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
      expect(composer).toHaveFocus();
    });
  });

  it("saves composer draft when switching conversations without a confirmation dialog", async () => {
    const user = userEvent.setup();

    renderChatWorkbenchPage();

    const composer = await screen.findByRole("textbox", { name: "请输入消息……" });
    await pasteIntoComposer(user, composer, "未发送内容");
    await user.click(screen.getByRole("button", { name: /睿白鸽/ }));

    await waitFor(() => {
      expect(useWorkbenchStore.getState().activeConversationId).toBe("conv-002");
    });
    expect(
      screen.queryByRole("alertdialog", { name: "切换会话？" }),
    ).not.toBeInTheDocument();
    expect(composer).toHaveTextContent("");
    expect(
      useWorkbenchStore.getState().composerDraftsByConversationId["conv-001"]?.draft,
    ).toBe("未发送内容");
    const conv001Card = screen.getByRole("button", { name: /丹阳草莓/ });
    expect(
      within(conv001Card).getByTestId("conversation-preview"),
    ).toHaveTextContent("[草稿]未发送内容");
  });

  it("restores saved composer draft when switching back to the conversation", async () => {
    const user = userEvent.setup();

    renderChatWorkbenchPage();

    const composer = await screen.findByRole("textbox", { name: "请输入消息……" });
    await pasteIntoComposer(user, composer, "切换后恢复");
    await user.click(screen.getByRole("button", { name: /睿白鸽/ }));

    await waitFor(() => {
      expect(useWorkbenchStore.getState().activeConversationId).toBe("conv-002");
    });

    await user.click(screen.getByRole("button", { name: /丹阳草莓/ }));

    await waitFor(() => {
      expect(useWorkbenchStore.getState().activeConversationId).toBe("conv-001");
    });
    expect(composer).toHaveTextContent("切换后恢复");
  });

  it("does not restore composer focus after switching conversations while sending", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();
    const sendMessageGate =
      createDeferred<Awaited<ReturnType<typeof baseService.sendMessage>>>();

    setWorkbenchService({
      ...baseService,
      sendMessage() {
        return sendMessageGate.promise;
      },
    });

    renderChatWorkbenchPage();

    const composer = await screen.findByRole("textbox", { name: "请输入消息……" });
    await pasteIntoComposer(user, composer, "旧会话发送中");
    await user.click(screen.getByRole("button", { name: "发送消息" }));
    await waitFor(() => {
      expect(composer).toHaveAttribute("contenteditable", "false");
    });

    await user.click(screen.getByRole("button", { name: /睿白鸽/ }));
    await waitFor(() => {
      expect(useWorkbenchStore.getState().activeConversationId).toBe("conv-002");
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
      expect(composer).toHaveAttribute("contenteditable", "true");
    });
    expect(composer).not.toHaveFocus();
  });

  it("does not persist composer draft for a conversation that was deleted during switch", async () => {
    const user = userEvent.setup();

    renderChatWorkbenchPage();

    const composer = await screen.findByRole("textbox", { name: "请输入消息……" });
    await pasteIntoComposer(user, composer, "删除后不应保存");

    await useWorkbenchStore.getState().deleteConversation("conv-001");

    await waitFor(() => {
      expect(useWorkbenchStore.getState().activeConversationId).toBe("conv-002");
    });
    expect(
      useWorkbenchStore.getState().composerDraftsByConversationId["conv-001"],
    ).toBeUndefined();
  });

  it("saves quoted composer draft when switching conversations", async () => {
    const user = userEvent.setup();

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    const targetMessage = await screen.findByText("我先截了个竖图版本给你看。");
    const targetRow = targetMessage.closest('[data-testid="message-row"]');
    expect(targetRow).not.toBeNull();

    await user.click(within(targetRow as HTMLElement).getByRole("button", { name: "消息操作" }));
    await user.click(screen.getByRole("menuitem", { name: "引用" }));
    await user.click(screen.getByRole("button", { name: /睿白鸽/ }));

    await waitFor(() => {
      expect(useWorkbenchStore.getState().activeConversationId).toBe("conv-002");
    });
    expect(
      screen.queryByRole("alertdialog", { name: "切换会话？" }),
    ).not.toBeInTheDocument();
    expect(
      useWorkbenchStore.getState().composerDraftsByConversationId["conv-001"]
        ?.quotedMessage,
    ).toBeTruthy();
  });
});
