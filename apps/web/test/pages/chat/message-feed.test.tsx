import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatMessageList, MessageRow, getMessageFeedItemKey } from "@/pages/chat/components/message-feed";
import type { ChatMessage } from "@/pages/chat/chat-types";

vi.mock("sonner", async (importOriginal) => {
  const actual = await importOriginal<typeof import("sonner")>();

  return {
    ...actual,
    toast: {
      ...actual.toast,
      success: vi.fn(),
      warning: vi.fn(),
    },
  };
});

describe("message feed row actions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("opens an avatar anchored action menu with quote and mention actions for group messages", async () => {
    const user = userEvent.setup();
    const onMentionMessage = vi.fn();
    const onQuoteMessage = vi.fn();
    const message = {
      ...createTextMessage("群消息"),
      isGroupConversation: true,
      isOwnMessage: false,
      role: "customer" as const,
      sender: {
        groupMemberId: "member-001",
        id: "member-001",
        name: "成员甲",
      },
      senderDisplayName: "成员甲",
    };

    render(
      <MessageRow
        message={message}
        onMentionMessage={onMentionMessage}
        onQuoteMessage={onQuoteMessage}
      />,
    );

    await user.click(screen.getByRole("button", { name: "消息操作" }));
    await user.click(screen.getByRole("menuitem", { name: "@Ta" }));

    expect(onMentionMessage).toHaveBeenCalledWith(message);

    await user.click(screen.getByRole("button", { name: "消息操作" }));
    await user.click(screen.getByRole("menuitem", { name: "引用" }));

    expect(onQuoteMessage).toHaveBeenCalledWith(message);
  });

  it("does not expose the mention action for single chat messages", async () => {
    const user = userEvent.setup();

    render(
      <MessageRow
        message={createTextMessage("单聊消息")}
        onMentionMessage={vi.fn()}
        onQuoteMessage={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "消息操作" }));

    expect(screen.getByRole("menuitem", { name: "引用" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "@Ta" })).not.toBeInTheDocument();
  });

  it("copies the remote message id from the action menu", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const message = {
      ...createTextMessage("可复制消息"),
      id: "local-message-id",
      remoteMessageId: " remote-message-id ",
    } satisfies ChatMessage;

    render(<MessageRow message={message} onQuoteMessage={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "消息操作" }));
    const menuItems = screen.getAllByRole("menuitem").map((item) => item.textContent);

    expect(menuItems).toEqual(["引用", "复制消息ID"]);

    await user.click(screen.getByRole("menuitem", { name: "复制消息ID" }));

    expect(writeText).toHaveBeenCalledWith("remote-message-id");
    expect(toast.success).toHaveBeenCalledWith("已复制消息ID");
  });

  it("keeps eligible message actions visible but disabled when actions are locked", async () => {
    const user = userEvent.setup();
    const onMentionMessage = vi.fn();
    const onQuoteMessage = vi.fn();
    const message = {
      ...createTextMessage("未接管群消息"),
      isGroupConversation: true,
      isOwnMessage: false,
      role: "customer" as const,
      sender: {
        groupMemberId: "member-001",
        id: "member-001",
        name: "成员甲",
      },
      senderDisplayName: "成员甲",
    };

    render(
      <MessageRow
        canUseMessageActions={false}
        message={message}
        onMentionMessage={onMentionMessage}
        onQuoteMessage={onQuoteMessage}
      />,
    );

    await user.click(screen.getByRole("button", { name: "消息操作" }));

    expect(screen.getByRole("menuitem", { name: "@Ta" })).toHaveAttribute(
      "data-disabled",
    );
    expect(screen.getByRole("menuitem", { name: "引用" })).toHaveAttribute(
      "data-disabled",
    );

    await user.click(screen.getByRole("menuitem", { name: "@Ta" }));
    await user.click(screen.getByRole("menuitem", { name: "引用" }));

    expect(onMentionMessage).not.toHaveBeenCalled();
    expect(onQuoteMessage).not.toHaveBeenCalled();
  });

  it("disables the quote action for revoked messages", async () => {
    const user = userEvent.setup();
    const onQuoteMessage = vi.fn();

    render(
      <MessageRow
        message={{ ...createTextMessage("已撤回原消息"), isRevoked: true }}
        onQuoteMessage={onQuoteMessage}
      />,
    );

    await user.click(screen.getByRole("button", { name: "消息操作" }));

    expect(screen.getByRole("menuitem", { name: "引用" })).toHaveAttribute(
      "data-disabled",
    );
    await user.click(screen.getByRole("menuitem", { name: "引用" }));

    expect(onQuoteMessage).not.toHaveBeenCalled();
  });

  it("disables the quote action for contact card messages", async () => {
    const user = userEvent.setup();
    const onQuoteMessage = vi.fn();

    render(
      <MessageRow
        message={{
          ...createTextMessage("名片消息"),
          content: {
            avatarUrl: "https://example.com/avatar.png",
            name: "客户甲",
            type: "contact-card",
          },
        }}
        onQuoteMessage={onQuoteMessage}
      />,
    );

    await user.click(screen.getByRole("button", { name: "消息操作" }));

    expect(screen.getByRole("menuitem", { name: "引用" })).toHaveAttribute(
      "data-disabled",
    );
    await user.click(screen.getByRole("menuitem", { name: "引用" }));

    expect(onQuoteMessage).not.toHaveBeenCalled();
  });

  it("shows smart reply recommendation as the first message action for customer messages without suggestions", async () => {
    const user = userEvent.setup();

    render(
      <MessageRow
        message={{
          content: { text: "客户想了解产品", type: "text" },
          conversationId: "conv-1",
          id: "msg-customer-1",
          role: "customer",
          sender: { id: "cus-1", name: "客户甲" },
          sentAt: "2026-05-25T10:00:00+08:00",
          author: "客户甲",
          status: "sent",
        } as ChatMessage}
      />,
    );

    expect(screen.queryByTestId("smart-reply-trigger-icon")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "消息操作" }));

    expect(
      screen.getByRole("menuitem", { name: "话术推荐" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "话术推荐",
      "复制消息ID",
    ]);
    expect(screen.queryByTestId("smart-reply-card")).not.toBeInTheDocument();
  });

  it("calls smart reply trigger handler when the recommendation action is selected", async () => {
    const user = userEvent.setup();
    const onTriggerSmartReply = vi.fn();
    const message = {
      content: { text: "客户想了解产品", type: "text" },
      conversationId: "conv-1",
      id: "msg-customer-1",
      role: "customer",
      sender: { id: "cus-1", name: "客户甲" },
      sentAt: "2026-05-25T10:00:00+08:00",
      seq: 12,
    } as ChatMessage;

    render(
      <MessageRow
        message={message}
        onTriggerSmartReply={onTriggerSmartReply}
      />,
    );

    expect(screen.queryByTestId("smart-reply-trigger-icon")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "消息操作" }));
    await user.click(screen.getByRole("menuitem", { name: "话术推荐" }));

    expect(onTriggerSmartReply).toHaveBeenCalledWith(message);
  });

  it("keeps smart reply recommendation visible but disabled when actions are locked", async () => {
    const user = userEvent.setup();
    const onTriggerSmartReply = vi.fn();
    const message = {
      content: { text: "客户想了解产品", type: "text" },
      conversationId: "conv-1",
      id: "msg-customer-1",
      role: "customer",
      sender: { id: "cus-1", name: "客户甲" },
      sentAt: "2026-05-25T10:00:00+08:00",
      seq: 12,
    } as ChatMessage;

    render(
      <MessageRow
        canUseMessageActions={false}
        message={message}
        onTriggerSmartReply={onTriggerSmartReply}
      />,
    );

    await user.click(screen.getByRole("button", { name: "消息操作" }));

    const smartReplyAction = screen.getByRole("menuitem", { name: "话术推荐" });

    expect(smartReplyAction).toHaveAttribute("data-disabled");

    await user.click(smartReplyAction);

    expect(onTriggerSmartReply).not.toHaveBeenCalled();
  });

  it("hides smart reply trigger icon when a ready suggestion card is shown", () => {
    render(
      <MessageRow
        message={{
          content: { text: "客户想了解产品", type: "text" },
          conversationId: "conv-1",
          id: "msg-customer-1",
          role: "customer",
          sender: { id: "cus-1", name: "客户甲" },
          sentAt: "2026-05-25T10:00:00+08:00",
          author: "客户甲",
          status: "sent",
        } as ChatMessage}
        smartReply={{
          assistantName: "护肤小助手",
          content: "建议先确认肤质",
          status: "ready",
        }}
      />,
    );

    expect(screen.queryByTestId("smart-reply-trigger-icon")).not.toBeInTheDocument();
    expect(screen.getByTestId("smart-reply-card")).toBeInTheDocument();
  });

  it("dismisses the smart reply card so the avatar recommendation action can be used again", async () => {
    const user = userEvent.setup();
    const onDismissSmartReply = vi.fn();
    const message = {
      content: { text: "客户想了解产品", type: "text" },
      conversationId: "conv-1",
      id: "msg-customer-1",
      role: "customer",
      sender: { id: "cus-1", name: "客户甲" },
      sentAt: "2026-05-25T10:00:00+08:00",
      seq: 12,
      status: "sent",
    } as ChatMessage;
    const { rerender } = render(
      <MessageRow
        message={message}
        onDismissSmartReply={onDismissSmartReply}
        smartReply={{
          assistantName: "护肤小助手",
          content: "建议先确认肤质",
          status: "ready",
        }}
      />,
    );

    expect(screen.getByTestId("smart-reply-card")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "收起" }));

    expect(onDismissSmartReply).toHaveBeenCalledWith(message);

    rerender(
      <MessageRow
        message={message}
        onDismissSmartReply={onDismissSmartReply}
      />,
    );

    expect(screen.queryByTestId("smart-reply-card")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "消息操作" }));

    expect(screen.getByRole("menuitem", { name: "话术推荐" })).toBeInTheDocument();
  });

  it("calls smart reply trigger handler when regenerate is selected", async () => {
    const user = userEvent.setup();
    const onTriggerSmartReply = vi.fn();
    const message = {
      content: { text: "客户想了解产品", type: "text" },
      conversationId: "conv-1",
      id: "msg-customer-1",
      role: "customer",
      sender: { id: "cus-1", name: "客户甲" },
      sentAt: "2026-05-25T10:00:00+08:00",
      seq: 12,
    } as ChatMessage;

    render(
      <MessageRow
        message={message}
        onTriggerSmartReply={onTriggerSmartReply}
        smartReply={{
          assistantName: "护肤小助手",
          content: "建议先确认肤质",
          status: "ready",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "更多智能回复操作" }));
    await user.click(screen.getByRole("menuitem", { name: "重新生成" }));

    expect(onTriggerSmartReply).toHaveBeenCalledWith(message, { force: true });
  });

  it("asks for confirmation before revoking own sent messages within 180 seconds", async () => {
    const user = userEvent.setup();
    const onRevokeMessage = vi.fn();
    vi.setSystemTime(new Date("2026-05-08T09:56:59").getTime());

    render(
      <MessageRow
        message={{
          ...createTextMessage("刚发送的客服消息"),
          isOwnMessage: true,
          seq: 42,
          sentAt: "2026-05-08 09:54:00",
        }}
        onRevokeMessage={onRevokeMessage}
        onQuoteMessage={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "消息操作" }));
    await user.click(screen.getByRole("menuitem", { name: "撤回消息" }));

    expect(onRevokeMessage).not.toHaveBeenCalled();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(
      screen.getByRole("alertdialog", { name: "确认要撤回该消息吗" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("客户将在微信中看到撤回提示"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "确认撤回" }));

    expect(onRevokeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "msg-text-layout",
        seq: 42,
      }),
    );
  });

  it("shows revoke action when the message sent time is slightly ahead of the local clock", async () => {
    const user = userEvent.setup();
    const onRevokeMessage = vi.fn();
    vi.setSystemTime(new Date("2026-05-08T09:55:00").getTime());

    render(
      <MessageRow
        message={{
          ...createTextMessage("本地时钟略慢的客服消息"),
          isOwnMessage: true,
          seq: 42,
          sentAt: "2026-05-08 09:55:02",
        }}
        onRevokeMessage={onRevokeMessage}
        onQuoteMessage={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "消息操作" }));

    expect(screen.getByRole("menuitem", { name: "撤回消息" })).toBeInTheDocument();
  });

  it("does not revoke when the confirmation dialog is cancelled", async () => {
    const user = userEvent.setup();
    const onRevokeMessage = vi.fn();
    vi.setSystemTime(new Date("2026-05-08T09:56:59").getTime());

    render(
      <MessageRow
        message={{
          ...createTextMessage("可取消撤回的客服消息"),
          isOwnMessage: true,
          seq: 42,
          sentAt: "2026-05-08 09:54:00",
        }}
        onRevokeMessage={onRevokeMessage}
        onQuoteMessage={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "消息操作" }));
    await user.click(screen.getByRole("menuitem", { name: "撤回消息" }));
    await user.click(screen.getByRole("button", { name: "取消" }));

    await waitFor(() => {
      expect(
        screen.queryByRole("alertdialog", { name: "确认要撤回该消息吗" }),
      ).not.toBeInTheDocument();
    });
    expect(onRevokeMessage).not.toHaveBeenCalled();
  });

  it("does not expose revoke action for customer messages or 180-second old own messages", async () => {
    const user = userEvent.setup();
    const onRevokeMessage = vi.fn();
    vi.setSystemTime(new Date("2026-05-08T09:57:00").getTime());

    const { rerender } = render(
      <MessageRow
        message={{
          ...createTextMessage("正好过期的客服消息"),
          isOwnMessage: true,
          seq: 42,
          sentAt: "2026-05-08 09:54:00",
        }}
        onRevokeMessage={onRevokeMessage}
        onQuoteMessage={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "消息操作" }));
    expect(screen.queryByRole("menuitem", { name: "撤回消息" })).not.toBeInTheDocument();

    rerender(
      <MessageRow
        message={{
          ...createTextMessage("客户消息"),
          isOwnMessage: false,
          role: "customer",
          seq: 43,
          sentAt: "2026-05-08 09:56:00",
        }}
        onRevokeMessage={onRevokeMessage}
        onQuoteMessage={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "消息操作" }));
    expect(screen.queryByRole("menuitem", { name: "撤回消息" })).not.toBeInTheDocument();
    expect(onRevokeMessage).not.toHaveBeenCalled();
  });

  it("shows revoke pending state and hides the revoke action", async () => {
    const user = userEvent.setup();
    const onRevokeMessage = vi.fn();
    vi.setSystemTime(new Date("2026-05-08T09:55:00").getTime());

    render(
      <MessageRow
        message={{
          ...createTextMessage("撤回中的客服消息"),
          isOwnMessage: true,
          revokePending: true,
          seq: 42,
          sentAt: "2026-05-08 09:54:00",
        }}
        onRevokeMessage={onRevokeMessage}
        onQuoteMessage={vi.fn()}
      />,
    );

    expect(screen.getByTestId("message-inline-status-slot")).toContainElement(
      screen.getByRole("status", { name: "撤回中" }),
    );

    await user.click(screen.getByRole("button", { name: "消息操作" }));
    expect(screen.queryByRole("menuitem", { name: "撤回消息" })).not.toBeInTheDocument();
  });

  it("keeps the feed item key stable after optimistic messages are reconciled", () => {
    const optimisticMessage = {
      ...createTextMessage("已确认消息"),
      clientMessageId: "local-001",
      id: "local-001",
      optNo: "opt-001",
      remoteMessageId: "opt-001",
      status: "accepted",
    } satisfies ChatMessage;
    const reconciledMessage = {
      ...optimisticMessage,
      id: "remote-001",
      remoteMessageId: "remote-001",
      status: "sent",
    } satisfies ChatMessage;

    expect(getMessageFeedItemKey(optimisticMessage)).toBe(
      getMessageFeedItemKey(reconciledMessage),
    );
  });

  it("adds directional entrance animation only to appended new messages", () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <ChatMessageList
        conversationId="conv-layout"
        messages={[
          {
            ...createTextMessage("历史消息"),
            id: "msg-1",
          },
        ]}
        showTimeDividers={false}
      />,
    );

    expect(screen.getByTestId("message-content-stack")).not.toHaveClass(
      "anim-pop-right",
    );
    expect(screen.getByTestId("message-content-stack")).not.toHaveClass(
      "anim-pop-left",
    );

    rerender(
      <ChatMessageList
        conversationId="conv-layout"
        messages={[
          {
            ...createTextMessage("历史消息"),
            id: "msg-1",
          },
          {
            ...createTextMessage("新客服消息"),
            id: "msg-2",
            isNew: true,
            isOwnMessage: true,
          },
          {
            ...createTextMessage("新客户消息"),
            id: "msg-3",
            isNew: true,
            role: "customer",
          },
        ]}
        showTimeDividers={false}
      />,
    );

    const appendedStacks = screen.getAllByTestId("message-content-stack");
    expect(appendedStacks[0]).not.toHaveClass("anim-pop-right");
    expect(appendedStacks[1]).toHaveClass("anim-pop-right");
    expect(appendedStacks[2]).toHaveClass("anim-pop-left");

    act(() => {
      vi.advanceTimersByTime(501);
    });

    rerender(
      <ChatMessageList
        conversationId="conv-layout"
        messages={[
          {
            ...createTextMessage("历史消息"),
            id: "msg-1",
          },
          {
            ...createTextMessage("新客服消息"),
            id: "msg-2",
            isNew: true,
            isOwnMessage: true,
          },
          {
            ...createTextMessage("新客户消息"),
            id: "msg-3",
            isNew: true,
            role: "customer",
          },
        ]}
        showTimeDividers={false}
      />,
    );

    for (const stack of screen.getAllByTestId("message-content-stack")) {
      expect(stack).not.toHaveClass("anim-pop-right");
      expect(stack).not.toHaveClass("anim-pop-left");
    }

    rerender(
      <ChatMessageList
        conversationId="conv-other"
        messages={[
          {
            ...createTextMessage("切换后的已有新消息"),
            conversationId: "conv-other",
            id: "msg-other-1",
            isNew: true,
            role: "customer",
          },
        ]}
        showTimeDividers={false}
      />,
    );

    expect(screen.getByTestId("message-content-stack")).not.toHaveClass(
      "anim-pop-left",
    );
    expect(screen.getByTestId("message-content-stack")).not.toHaveClass(
      "anim-pop-right",
    );
  });

  it("keeps the appended message entrance animation through message reconciliation", () => {
    const { rerender } = render(
      <ChatMessageList
        conversationId="conv-layout"
        messages={[
          {
            ...createTextMessage("历史消息"),
            id: "msg-1",
          },
        ]}
        showTimeDividers={false}
      />,
    );

    rerender(
      <ChatMessageList
        conversationId="conv-layout"
        messages={[
          {
            ...createTextMessage("历史消息"),
            id: "msg-1",
          },
          {
            ...createTextMessage("新客服消息"),
            clientMessageId: "local-001",
            id: "local-001",
            isNew: true,
            isOwnMessage: true,
            status: "accepted",
          },
        ]}
        showTimeDividers={false}
      />,
    );

    expect(screen.getAllByTestId("message-content-stack")[1]).toHaveClass(
      "anim-pop-right",
    );

    rerender(
      <ChatMessageList
        conversationId="conv-layout"
        messages={[
          {
            ...createTextMessage("历史消息"),
            id: "msg-1",
          },
          {
            ...createTextMessage("新客服消息"),
            clientMessageId: "local-001",
            id: "remote-001",
            isNew: true,
            isOwnMessage: true,
            remoteMessageId: "remote-001",
            status: "sent",
          },
        ]}
        showTimeDividers={false}
      />,
    );

    expect(screen.getAllByTestId("message-content-stack")[1]).toHaveClass(
      "anim-pop-right",
    );
  });

  it("clears the pending append animation timer when switching conversations", () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <ChatMessageList
        conversationId="conv-layout"
        messages={[
          {
            ...createTextMessage("历史消息"),
            id: "msg-1",
          },
        ]}
        showTimeDividers={false}
      />,
    );

    rerender(
      <ChatMessageList
        conversationId="conv-layout"
        messages={[
          {
            ...createTextMessage("历史消息"),
            id: "msg-1",
          },
          {
            ...createTextMessage("新客服消息"),
            id: "msg-2",
            isNew: true,
            isOwnMessage: true,
          },
        ]}
        showTimeDividers={false}
      />,
    );

    expect(vi.getTimerCount()).toBe(1);

    rerender(
      <ChatMessageList
        conversationId="conv-other"
        messages={[
          {
            ...createTextMessage("切换后的已有新消息"),
            conversationId: "conv-other",
            id: "msg-other-1",
            isNew: true,
            role: "customer",
          },
        ]}
        showTimeDividers={false}
      />,
    );

    expect(vi.getTimerCount()).toBe(0);
  });

  it("passes voice playback readiness with the source message", async () => {
    const user = userEvent.setup();
    const onVoicePlaybackReady = vi.fn();
    const audioInstances: AudioMockInstance[] = [];
    stubAudio({ instances: audioInstances });
    const message = {
      ...createTextMessage("语音"),
      content: {
        audioUrl: "https://b5.bokr.com.cn/s5/msg/20260525/272/voice.amr",
        durationLabel: "11\"",
        playbackUrl: "https://b5.bokr.com.cn/s5/playable-voice/20260525/272/voice.wav",
        transFileUrlPersisted: false,
        type: "voice" as const,
      },
      id: "voice-message-1",
      seq: 538,
    } satisfies ChatMessage;

    render(
      <MessageRow
        message={message}
        onVoicePlaybackReady={onVoicePlaybackReady}
      />,
    );

    await user.click(screen.getByRole("button", { name: "播放语音消息 11\"" }));
    audioInstances[0]!.duration = 11;
    audioInstances[0]!.dispatch("loadedmetadata");

    await waitFor(() => {
      expect(onVoicePlaybackReady).toHaveBeenCalledTimes(1);
    });
    expect(onVoicePlaybackReady).toHaveBeenCalledWith(message, {
      playbackUrl: "https://b5.bokr.com.cn/s5/playable-voice/20260525/272/voice.wav",
    });
  });
});

type AudioMockInstance = {
  addEventListener: ReturnType<typeof vi.fn>;
  currentTime: number;
  dispatch: (event: string) => void;
  duration: number;
  ended: boolean;
  load: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  paused: boolean;
  play: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  src: string;
};

function stubAudio({
  instances = [],
  play = vi.fn().mockResolvedValue(undefined),
}: {
  instances?: AudioMockInstance[];
  play?: ReturnType<typeof vi.fn>;
} = {}) {
  vi.stubGlobal("Audio", function AudioMock(this: AudioMockInstance, src: string) {
    const instanceListeners = new Map<string, EventListener[]>();
    this.addEventListener = vi.fn((event: string, listener: EventListener) => {
      instanceListeners.set(event, [...(instanceListeners.get(event) ?? []), listener]);
    });
    this.currentTime = 0;
    this.dispatch = (event: string) => {
      for (const listener of instanceListeners.get(event) ?? []) {
        listener(new Event(event));
      }
    };
    this.duration = 0;
    this.ended = false;
    this.load = vi.fn();
    this.pause = vi.fn();
    this.paused = true;
    this.play = play;
    this.removeEventListener = vi.fn();
    this.src = src;
    instances.push(this);
  });
}

function createTextMessage(text: string) {
  return {
    author: "客服",
    content: {
      text,
      type: "text" as const,
    },
    conversationId: "conv-layout",
    id: "msg-text-layout",
    role: "agent" as const,
    sender: {
      id: "agent-layout",
      name: "客服",
    },
    sentAt: "2026-05-08 09:54:00",
    status: "sent" as const,
  } satisfies ChatMessage;
}
