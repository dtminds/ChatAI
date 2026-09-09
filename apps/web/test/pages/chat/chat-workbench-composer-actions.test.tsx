import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LexicalEditor } from "lexical";
import {
  createMockWorkbenchService,
  setWorkbenchService,
} from "@/pages/chat/api/workbench-service";
import type {
  ChatMessage,
  FileUploadQueueItem,
  QuotedMessagePreviewContent,
} from "@/pages/chat/chat-types";
import { FileUploadQueueBar } from "@/pages/chat/components/file-upload-queue-bar";
import {
  INSERT_COMPOSER_MENTION_COMMAND,
  RESTORE_COMPOSER_COMMAND,
} from "@/pages/chat/components/composer/lexical-commands";
import { FILE_UPLOAD_SWITCH_BLOCKED_MESSAGE } from "@/pages/chat/lib/composer-file-files";
import type { ComposerSegment } from "@/pages/chat/lib/composer-segments";
import { getOversizedComposerFileDialogCopy } from "@/pages/chat/lib/send-failure-dialog-copy";
import { useWorkbenchStore } from "@/store/workbench-store";
import {
  installChatWorkbenchTestEnvironment,
  mediaUploadMocks,
  renderChatWorkbenchPage,
  resetChatWorkbenchTestState,
} from "./workbench-test-utils";

const conversationListHarness = vi.hoisted(() => ({
  onSelectConversation: undefined as
    | ((conversationId: string) => boolean | void | Promise<boolean | void>)
    | undefined,
}));

const composerHarness = vi.hoisted(() => ({
  dispatchCommand: vi.fn(),
  focus: vi.fn(),
  isSendingDraft: false,
  onCancelFileUpload: undefined as ((uploadId: string) => void) | undefined,
  onComposerSegmentsChange: undefined as
    | ((segments: ComposerSegment[]) => void)
    | undefined,
  onDraftChange: undefined as ((draft: string) => void) | undefined,
  onFileSelect: undefined as
    | ((files: FileList | File[] | null) => void)
    | undefined,
  onMentionMessage: undefined as ((message: ChatMessage) => void) | undefined,
  onQuoteMessage: undefined as ((message: ChatMessage) => void) | undefined,
  onSendDraft: undefined as ((segments: ComposerSegment[]) => void) | undefined,
  quotedMessage: null as QuotedMessagePreviewContent | null,
  rootElement: null as HTMLElement | null,
}));

vi.mock("@/pages/chat/components/chat-panel", () => ({
  ChatPanel: (props: {
    composerRef?: { current: LexicalEditor | null };
    fileUploadQueue?: FileUploadQueueItem[];
    isSendingDraft?: boolean;
    onCancelFileUpload?: (uploadId: string) => void;
    onComposerSegmentsChange?: (segments: ComposerSegment[]) => void;
    onDraftChange?: (draft: string) => void;
    onFileSelect?: (files: FileList | File[] | null) => void;
    onMentionMessage?: (message: ChatMessage) => void;
    onQuoteMessage?: (message: ChatMessage) => void;
    onSendDraft?: (segments: ComposerSegment[]) => void;
    quotedMessage?: QuotedMessagePreviewContent | null;
    scopeTransitionError?: string;
  }) => {
    composerHarness.isSendingDraft = props.isSendingDraft ?? false;
    composerHarness.onCancelFileUpload = props.onCancelFileUpload;
    composerHarness.onComposerSegmentsChange = props.onComposerSegmentsChange;
    composerHarness.onDraftChange = props.onDraftChange;
    composerHarness.onFileSelect = props.onFileSelect;
    composerHarness.onMentionMessage = props.onMentionMessage;
    composerHarness.onQuoteMessage = props.onQuoteMessage;
    composerHarness.onSendDraft = props.onSendDraft;
    composerHarness.quotedMessage = props.quotedMessage ?? null;
    if (props.composerRef) {
      props.composerRef.current = {
        dispatchCommand: composerHarness.dispatchCommand,
        focus: composerHarness.focus,
        getRootElement: () => composerHarness.rootElement,
      } as unknown as LexicalEditor;
    }

    return (
      <div data-testid="mock-chat-panel">
        {props.fileUploadQueue && props.fileUploadQueue.length > 0 && props.onCancelFileUpload ? (
          <FileUploadQueueBar
            items={props.fileUploadQueue}
            onCancelFileUpload={props.onCancelFileUpload}
          />
        ) : null}
        {props.scopeTransitionError ? (
          <div data-testid="scope-transition-error" role="status">
            {props.scopeTransitionError}
          </div>
        ) : null}
        {props.quotedMessage ? (
          <div data-testid="composer-quote-preview">{props.quotedMessage.text}</div>
        ) : null}
      </div>
    );
  },
}));

vi.mock("@/pages/chat/components/conversation-list-panel", () => ({
  ConversationListPanel: ({
    onSelectConversation,
  }: {
    onSelectConversation: (
      conversationId: string,
    ) => boolean | void | Promise<boolean | void>;
  }) => {
    conversationListHarness.onSelectConversation = onSelectConversation;
    return <div data-testid="mock-conversation-list-panel" />;
  },
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

function createQuoteMessage(): ChatMessage {
  return {
    author: "客户",
    content: {
      text: "请确认这个版本",
      type: "text",
    },
    conversationId: "conv-001",
    role: "customer",
    sender: {
      id: "customer-001",
      name: "客户",
    },
    sentAt: "2026-05-20 10:00:00",
    seq: 5,
    status: "sent",
    uiMessageKey: "5",
  };
}

function createStaleGroupMentionMessage(): ChatMessage {
  return {
    author: "缪勇飞 群昵称111",
    content: {
      text: "你好",
      type: "text",
    },
    conversationId: "conv-004",
    isGroupConversation: true,
    isOwnMessage: false,
    role: "customer",
    sender: {
      groupMemberId: "member-006",
      id: "member-006",
      name: "缪勇飞 群昵称111",
    },
    senderDisplayName: "缪勇飞 群昵称111",
    sentAt: "2026-05-20 10:00:00",
    seq: 12,
    status: "sent",
    uiMessageKey: "12",
  };
}

async function waitForComposerHarness() {
  await waitFor(() => {
    expect(useWorkbenchStore.getState().bootstrapStatus).toBe("ready");
    expect(composerHarness.onSendDraft).toBeDefined();
    expect(conversationListHarness.onSelectConversation).toBeDefined();
  });
}

describe("ChatWorkbenchPage composer actions", () => {
  beforeEach(() => {
    vi.useRealTimers();
    resetChatWorkbenchTestState();
    installChatWorkbenchTestEnvironment();
    conversationListHarness.onSelectConversation = undefined;
    composerHarness.dispatchCommand.mockReset();
    composerHarness.focus.mockReset();
    composerHarness.isSendingDraft = false;
    composerHarness.onCancelFileUpload = undefined;
    composerHarness.onComposerSegmentsChange = undefined;
    composerHarness.onDraftChange = undefined;
    composerHarness.onFileSelect = undefined;
    composerHarness.onMentionMessage = undefined;
    composerHarness.onQuoteMessage = undefined;
    composerHarness.onSendDraft = undefined;
    composerHarness.quotedMessage = null;
    composerHarness.rootElement = document.createElement("div");
  });

  it("sends composed text through the workbench send path", async () => {
    renderChatWorkbenchPage();
    await waitForComposerHarness();

    composerHarness.onSendDraft?.([
      {
        text: "收到，我来帮你确认",
        type: "text",
      },
    ]);

    await waitFor(() => {
      expect(
        useWorkbenchStore.getState().messagesByConversationId["conv-001"].at(-1),
      ).toMatchObject({
        content: {
          text: "收到，我来帮你确认",
          type: "text",
        },
        role: "agent",
        status: "accepted",
      });
    });
  });

  it("sends a quoted draft and clears the quote preview", async () => {
    renderChatWorkbenchPage();
    await waitForComposerHarness();

    composerHarness.onQuoteMessage?.(createQuoteMessage());
    await waitFor(() => {
      expect(screen.getByTestId("composer-quote-preview")).toHaveTextContent(
        "请确认这个版本",
      );
    });

    composerHarness.onSendDraft?.([
      {
        text: "收到，我按这个版本处理",
        type: "text",
      },
    ]);

    await waitFor(() => {
      expect(
        useWorkbenchStore.getState().messagesByConversationId["conv-001"].at(-1),
      ).toMatchObject({
        content: {
          quoteMsgId: "5",
          text: "收到，我按这个版本处理",
          type: "quote",
        },
      });
    });
    expect(screen.queryByTestId("composer-quote-preview")).not.toBeInTheDocument();
  });

  it("ignores a second send while the first send is still pending", async () => {
    const baseService = createMockWorkbenchService();
    const sendMessageGate =
      createDeferred<Awaited<ReturnType<typeof baseService.sendMessage>>>();
    const sendMessage = vi.fn(() => sendMessageGate.promise);

    setWorkbenchService({
      ...baseService,
      sendMessage,
    });

    renderChatWorkbenchPage();
    await waitForComposerHarness();

    const segments: ComposerSegment[] = [
      {
        text: "发送中不要重复",
        type: "text",
      },
    ];
    composerHarness.onSendDraft?.(segments);
    composerHarness.onSendDraft?.(segments);

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledTimes(1);
      expect(composerHarness.isSendingDraft).toBe(true);
    });

    sendMessageGate.resolve({
      messages: [
        {
          optNo: "opt-msg-test",
          status: "accepted",
        },
      ],
      optNo: "opt-msg-test",
      status: "accepted",
    });

    await waitFor(() => {
      expect(composerHarness.isSendingDraft).toBe(false);
    });
  });

  it("blocks oversized selected files without uploading", async () => {
    const user = userEvent.setup();
    const file = new File(["file-bytes"], "超大报价单.pdf", {
      type: "application/pdf",
    });
    Object.defineProperty(file, "size", { value: 10 * 1024 * 1024 + 1 });

    renderChatWorkbenchPage();
    await waitForComposerHarness();

    composerHarness.onFileSelect?.([file]);

    const copy = getOversizedComposerFileDialogCopy();
    const dialog = await screen.findByRole("alertdialog", { name: copy.title });
    expect(dialog).toHaveAccessibleDescription(copy.description);
    expect(mediaUploadMocks.uploadWorkbenchFile).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "知道了" }));
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
  });

  it("uploads a selected file, then aborts it from the queue", async () => {
    const user = userEvent.setup();
    const upload =
      createDeferred<Awaited<ReturnType<typeof mediaUploadMocks.uploadWorkbenchFile>>>();
    const file = new File(["file-bytes"], "报价单.pdf", {
      type: "application/pdf",
    });
    vi.mocked(mediaUploadMocks.uploadWorkbenchFile).mockReturnValue(upload.promise);

    renderChatWorkbenchPage();
    await waitForComposerHarness();

    composerHarness.onFileSelect?.([file]);

    await waitFor(() => {
      expect(mediaUploadMocks.uploadWorkbenchFile).toHaveBeenCalledWith(
        "conv-001",
        file,
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        }),
      );
    });
    expect(screen.getByText("报价单.pdf")).toBeInTheDocument();

    const uploadOptions = vi.mocked(mediaUploadMocks.uploadWorkbenchFile).mock.calls.at(-1)?.[2];
    await user.click(screen.getByRole("button", { name: "取消上传 报价单.pdf" }));
    expect(uploadOptions?.signal?.aborted).toBe(true);
    expect(screen.queryByText("报价单.pdf")).not.toBeInTheDocument();
  });

  it("uploads a selected file and sends it as a file message", async () => {
    const upload =
      createDeferred<Awaited<ReturnType<typeof mediaUploadMocks.uploadWorkbenchFile>>>();
    const file = new File(["file-bytes"], "报价单.pdf", {
      type: "application/pdf",
    });
    vi.mocked(mediaUploadMocks.uploadWorkbenchFile).mockReturnValue(upload.promise);

    renderChatWorkbenchPage();
    await waitForComposerHarness();

    composerHarness.onFileSelect?.([file]);
    await waitFor(() => {
      expect(mediaUploadMocks.uploadWorkbenchFile).toHaveBeenCalled();
    });

    upload.resolve({
      extension: "pdf",
      fileId: "chat-files/conv-001/报价单.pdf",
      fileName: "报价单.pdf",
      fileSize: file.size,
      fileSizeLabel: `${file.size} B`,
      type: "file",
      url: "https://b5.bokr.com.cn/chat-files/conv-001/quote.pdf",
    });

    await waitFor(() => {
      expect(
        useWorkbenchStore.getState().messagesByConversationId["conv-001"].at(-1),
      ).toMatchObject({
        content: {
          fileName: "报价单.pdf",
          type: "file",
        },
        role: "agent",
      });
    });
  });

  it("blocks conversation switching while a file is uploading", async () => {
    const upload =
      createDeferred<Awaited<ReturnType<typeof mediaUploadMocks.uploadWorkbenchFile>>>();
    const file = new File(["file-bytes"], "报价单.pdf", {
      type: "application/pdf",
    });
    vi.mocked(mediaUploadMocks.uploadWorkbenchFile).mockReturnValue(upload.promise);

    renderChatWorkbenchPage();
    await waitForComposerHarness();

    composerHarness.onFileSelect?.([file]);
    await waitFor(() => {
      expect(screen.getByText("报价单.pdf")).toBeInTheDocument();
    });

    await conversationListHarness.onSelectConversation?.("conv-002");

    expect(useWorkbenchStore.getState().activeConversationId).toBe("conv-001");
    await waitFor(() => {
      expect(screen.getByTestId("scope-transition-error")).toHaveTextContent(
        FILE_UPLOAD_SWITCH_BLOCKED_MESSAGE,
      );
    });
  });

  it("persists composer drafts when switching conversations and restores them on return", async () => {
    renderChatWorkbenchPage();
    await waitForComposerHarness();

    composerHarness.onDraftChange?.("未发送内容");
    composerHarness.onComposerSegmentsChange?.([
      {
        text: "未发送内容",
        type: "text",
      },
    ]);
    composerHarness.onQuoteMessage?.(createQuoteMessage());

    await conversationListHarness.onSelectConversation?.("conv-002");
    await waitFor(() => {
      expect(useWorkbenchStore.getState().activeConversationId).toBe("conv-002");
      expect(
        useWorkbenchStore.getState().composerDraftsByConversationId["conv-001"],
      ).toMatchObject({
        draft: "未发送内容",
        quotedMessage: {
          text: "请确认这个版本",
        },
      });
    });
    expect(screen.queryByRole("alertdialog", { name: "切换会话？" })).not.toBeInTheDocument();

    composerHarness.dispatchCommand.mockClear();
    await conversationListHarness.onSelectConversation?.("conv-001");
    await waitFor(() => {
      expect(useWorkbenchStore.getState().activeConversationId).toBe("conv-001");
      expect(composerHarness.dispatchCommand).toHaveBeenCalledWith(
        RESTORE_COMPOSER_COMMAND,
        {
          segments: [
            {
              text: "未发送内容",
              type: "text",
            },
          ],
        },
      );
    });
    expect(screen.getByTestId("composer-quote-preview")).toHaveTextContent(
      "请确认这个版本",
    );
  });

  it("does not persist a composer draft after the conversation is deleted", async () => {
    renderChatWorkbenchPage();
    await waitForComposerHarness();

    composerHarness.onDraftChange?.("删除后不应保存");
    composerHarness.onComposerSegmentsChange?.([
      {
        text: "删除后不应保存",
        type: "text",
      },
    ]);

    await useWorkbenchStore.getState().deleteConversation("conv-001");
    await waitFor(() => {
      expect(useWorkbenchStore.getState().activeConversationId).toBe("conv-002");
    });
    expect(
      useWorkbenchStore.getState().composerDraftsByConversationId["conv-001"],
    ).toBeUndefined();
  });

  it("does not restore composer focus after switching conversations while sending", async () => {
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
    await waitForComposerHarness();

    composerHarness.onSendDraft?.([
      {
        text: "旧会话发送中",
        type: "text",
      },
    ]);
    await waitFor(() => {
      expect(composerHarness.isSendingDraft).toBe(true);
    });

    await conversationListHarness.onSelectConversation?.("conv-002");
    await waitFor(() => {
      expect(useWorkbenchStore.getState().activeConversationId).toBe("conv-002");
    });
    composerHarness.focus.mockClear();

    sendMessageGate.resolve({
      messages: [
        {
          optNo: "opt-msg-test",
          status: "accepted",
        },
      ],
      optNo: "opt-msg-test",
      status: "accepted",
    });

    await waitFor(() => {
      expect(composerHarness.isSendingDraft).toBe(false);
    });
    expect(composerHarness.focus).not.toHaveBeenCalled();
  });

  it("inserts a mention after refreshing a missing group member", async () => {
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
      ...firstGroupMembers,
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
    await waitForComposerHarness();
    await useWorkbenchStore.getState().setActiveMode("group");
    await waitFor(() => {
      expect(useWorkbenchStore.getState().activeConversationId).toBe("conv-004");
    });
    await waitFor(() => {
      expect(
        useWorkbenchStore.getState().groupMembersByConversationId["conv-004"],
      ).toEqual([
        expect.objectContaining({
          id: "member-001",
        }),
      ]);
    });

    composerHarness.onMentionMessage?.(createStaleGroupMentionMessage());
    expect(
      await screen.findByRole("dialog", {
        name: "该成员已退群或群成员数据未更新",
      }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "刷新群成员并重试" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(composerHarness.dispatchCommand).toHaveBeenCalledWith(
        INSERT_COMPOSER_MENTION_COMMAND,
        {
          displayName: "缪勇飞 群昵称111",
          memberId: "member-006",
        },
      );
    });
  });

  it("keeps the mention retry dialog when the member is still missing", async () => {
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
              type: 0 as const,
            },
          ],
          thirdGroupId: "third-group-conv-004",
        };
      },
    });

    renderChatWorkbenchPage();
    await waitForComposerHarness();
    await useWorkbenchStore.getState().setActiveMode("group");
    await waitFor(() => {
      expect(useWorkbenchStore.getState().activeConversationId).toBe("conv-004");
    });
    await waitFor(() => {
      expect(
        useWorkbenchStore.getState().groupMembersByConversationId["conv-004"]?.some(
          (member) => member.id === "member-006",
        ),
      ).toBe(false);
    });

    composerHarness.onMentionMessage?.(createStaleGroupMentionMessage());
    const dialog = await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: "刷新群成员并重试" }));

    expect(
      await screen.findByRole("dialog", { name: "刷新后仍未找到该成员" }),
    ).toBeInTheDocument();
    expect(dialog).toBeInTheDocument();
  });
});
