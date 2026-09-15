import type { ComponentProps } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import {
  checkSmartReplyTextModeration,
  listSmartReplyAttachments,
} from "@/pages/chat/api/workbench-gateway";
import { SmartReplySuggestionComposer } from "@/pages/chat/components/smart-reply-suggestion-composer";
import type { ChatMessage } from "@/pages/chat/chat-types";
import type { SmartReplyAssistantTurn } from "@/pages/chat/lib/smart-reply-assistant";
import { useAuthStore } from "@/store/auth-store";

vi.mock("sonner", async (importOriginal) => {
  const actual = await importOriginal<typeof import("sonner")>();

  return {
    ...actual,
    toast: {
      ...actual.toast,
      error: vi.fn(),
      warning: vi.fn(),
    },
  };
});

vi.mock("@/pages/chat/api/workbench-gateway", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/pages/chat/api/workbench-gateway")>();

  return {
    ...actual,
    checkSmartReplyTextModeration: vi.fn(),
    listSmartReplyAttachments: vi.fn(),
  };
});

const message = {
  author: "客户甲",
  content: { text: "这个产品适合敏感肌吗", type: "text" },
  conversationId: "conv-001",
  isOwnMessage: false,
  rawMsgtype: "text",
  role: "customer",
  sender: { id: "customer-1", name: "客户甲" },
  sentAt: "2026-09-15T10:00:00+08:00",
  seq: 12,
  status: "sent",
  uiMessageKey: "message-12",
} satisfies ChatMessage;

describe("SmartReplySuggestionComposer", () => {
  beforeEach(() => {
    useAuthStore.setState(useAuthStore.getInitialState(), true);
    useAuthStore.getState().setSession({
      accountType: "sub",
      displayName: "客服主管",
      permissions: ["chat.access", "chat.send", "chat.takeover"],
      role: "admin",
      subUserId: "101",
      uid: 1,
    });
    vi.mocked(listSmartReplyAttachments).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.mocked(checkSmartReplyTextModeration).mockReset();
    vi.mocked(listSmartReplyAttachments).mockReset();
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.warning).mockClear();
  });

  it("loads the suggestion into the composer and sends its current segments", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn(async () => ({ ok: true as const }));

    renderSuggestionComposer({ onSend });

    const editor = await screen.findByRole("textbox", { name: "编辑话术建议" });
    await waitFor(() => {
      expect(editor).toHaveTextContent("建议先少量试用，确认皮肤耐受情况");
      expect(screen.getByRole("button", { name: "采纳并发送" })).toBeEnabled();
    });

    await user.click(screen.getByRole("button", { name: "采纳并发送" }));

    expect(onSend).toHaveBeenCalledWith(
      message,
      expect.objectContaining({
        content: "建议先少量试用，确认皮肤耐受情况",
        segments: [
          {
            text: "建议先少量试用，确认皮肤耐受情况",
            type: "text",
          },
        ],
      }),
    );
  });

  it("keeps a violation result visible until the user dismisses it", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn(async () => ({ ok: true as const }));
    vi.mocked(checkSmartReplyTextModeration).mockResolvedValue({
      result: {
        categoryLabel: "广告法",
        words: ["绝对安全"],
      },
    });

    renderSuggestionComposer({
      content: "这款产品绝对安全",
      onSend,
    });

    const editor = await screen.findByRole("textbox", { name: "编辑话术建议" });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "违规词检测" })).toBeEnabled();
    });
    await user.click(screen.getByRole("button", { name: "违规词检测" }));

    expect(await screen.findByRole("status")).toHaveTextContent("绝对安全");
    expect(
      screen.queryByRole("button", { name: "微信表情" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "添加到FAQ" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "违规词检测" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "采纳并发送" }));
    expect(onSend).not.toHaveBeenCalled();
    expect(toast.warning).toHaveBeenCalledWith("请先修改违规内容");

    await user.click(editor);
    await user.keyboard("{Control>}a{/Control}建议先少量试用");

    expect(screen.getByRole("status")).toHaveTextContent("绝对安全");
    await user.click(screen.getByRole("button", { name: "关闭检测结果" }));

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "微信表情" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "添加到FAQ" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "违规词检测" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "采纳并发送" }));
    expect(onSend).toHaveBeenCalledWith(
      message,
      expect.objectContaining({
        content: "建议先少量试用",
        segments: [{ text: "建议先少量试用", type: "text" }],
      }),
    );
  });

  it("keeps the previous suggestion visible but read-only while regenerating", async () => {
    renderSuggestionComposer({ isComposerEditable: false, phase: "thinking" });

    const editor = await screen.findByRole("textbox", { name: "编辑话术建议" });
    await waitFor(() => {
      expect(editor).toHaveTextContent("建议先少量试用，确认皮肤耐受情况");
    });

    expect(editor).toHaveAttribute("contenteditable", "false");
    expect(screen.getByRole("button", { name: "添加到FAQ" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "违规词检测" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "采纳并发送" })).toBeDisabled();
  });

  it("preserves edits when newer conversation messages arrive", async () => {
    const user = userEvent.setup();
    const view = renderSuggestionComposer();
    const editor = await screen.findByRole("textbox", { name: "编辑话术建议" });

    await user.click(editor);
    await user.keyboard("{Control>}a{/Control}客服已编辑的话术");

    view.rerender(
      createSuggestionComposer({
        conversationMessages: [
          message,
          {
            ...message,
            content: { text: "补充一条新消息", type: "text" },
            seq: 13,
            uiMessageKey: "message-13",
          },
        ],
      }),
    );

    expect(editor).toHaveTextContent("客服已编辑的话术");
    expect(screen.queryByText("正在准备话术建议")).not.toBeInTheDocument();
  });
});

type RenderSuggestionComposerOptions = {
  content?: string;
  conversationMessages?: ChatMessage[];
  isComposerEditable?: boolean;
  onSend?: ComponentProps<typeof SmartReplySuggestionComposer>["onSend"];
  phase?: SmartReplyAssistantTurn["phase"];
};

function renderSuggestionComposer(options: RenderSuggestionComposerOptions = {}) {
  return render(createSuggestionComposer(options));
}

function createSuggestionComposer({
  content = "建议先少量试用，确认皮肤耐受情况",
  conversationMessages = [message],
  isComposerEditable = true,
  onSend,
  phase = "confirmation",
}: RenderSuggestionComposerOptions = {}) {
  const turn: SmartReplyAssistantTurn = {
    isComposerEditable,
    label: phase === "thinking" ? "正在生成话术推荐" : "已为你起草回复",
    lookupKey: "12",
    message,
    phase,
    showComposer: true,
    suggestion: {
      assistantName: "智能助手",
      content,
      generateStatus: 2,
      pollComplete: true,
      recordId: "record-12",
      status: "ready",
    },
  };

  return (
    <SmartReplySuggestionComposer
      composerProps={{
        canConfigureSeatAIHosting: false,
        canConfigureSeatSemiAuto: false,
        canToggleConversationAIHosting: false,
        shouldShowConversationAIHostingControl: false,
        conversationId: "conv-001",
        groupMembers: [],
        hasActiveFileUpload: false,
        inputEnterBehavior: "send",
        isEmojiPickerOpen: false,
        isGroupConversation: false,
        onChangeFullAuto: vi.fn(),
        onChangeSeatAgentMode: vi.fn(),
        onClearQuotedMessage: vi.fn(),
        onEmojiPickerOpenChange: vi.fn(),
        onEnterBehaviorChange: vi.fn(),
        onFileSelect: vi.fn(),
        onOpenMaterialLibrary: vi.fn(),
      }}
      conversationMessages={conversationMessages}
      isSending={false}
      onSend={onSend}
      turn={turn}
    />
  );
}
