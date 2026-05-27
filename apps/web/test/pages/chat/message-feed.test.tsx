import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MessageRow, getMessageFeedItemKey } from "@/pages/chat/components/message-feed";
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
    await user.click(screen.getByRole("menuitem", { name: "引用消息" }));

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

    expect(screen.getByRole("menuitem", { name: "引用消息" })).toBeInTheDocument();
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

    expect(menuItems).toEqual(["引用消息", "复制消息ID"]);

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
    expect(screen.getByRole("menuitem", { name: "引用消息" })).toHaveAttribute(
      "data-disabled",
    );

    await user.click(screen.getByRole("menuitem", { name: "@Ta" }));
    await user.click(screen.getByRole("menuitem", { name: "引用消息" }));

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

    expect(screen.getByRole("menuitem", { name: "引用消息" })).toHaveAttribute(
      "data-disabled",
    );
    await user.click(screen.getByRole("menuitem", { name: "引用消息" }));

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

    expect(screen.getByRole("menuitem", { name: "引用消息" })).toHaveAttribute(
      "data-disabled",
    );
    await user.click(screen.getByRole("menuitem", { name: "引用消息" }));

    expect(onQuoteMessage).not.toHaveBeenCalled();
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
