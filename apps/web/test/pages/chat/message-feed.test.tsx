import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ChatMessageList,
  MessageRow,
  MESSAGE_SENT_AT_HOVER_DELAY_MS,
} from "@/pages/chat/components/message-feed";
import type { ChatMessage } from "@/pages/chat/chat-types";
import { getMessageFeedItemKey } from "@/pages/chat/lib/message-feed-key";

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

  it("copies the message seq from the action menu", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const message = {
      ...createTextMessage("可复制消息"),
      msgid: " remote-message-id ",
      uiMessageKey: "local-message-id",
      seq: 1088,
      sender: {
        id: "sender-customer-id",
        name: "客户甲",
        userId: "customer-user-id",
      },
    } satisfies ChatMessage;

    render(<MessageRow message={message} onQuoteMessage={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "消息操作" }));
    const menuItems = screen.getAllByRole("menuitem").map((item) => item.textContent);

    expect(menuItems).toEqual(["引用", "复制消息ID", "复制用户ID"]);

    await user.click(screen.getByRole("menuitem", { name: "复制消息ID" }));

    expect(writeText).toHaveBeenCalledWith("1088");
    expect(toast.success).toHaveBeenCalledWith("已复制消息ID");
  });

  it("disables copying the message id when seq is unavailable", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(
      <MessageRow
        message={{
          ...createTextMessage("本地待落库消息"),
          seq: undefined,
        }}
        onQuoteMessage={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "消息操作" }));

    const copyMessageIdItem = screen.getByRole("menuitem", { name: "复制消息ID" });
    expect(copyMessageIdItem).toHaveAttribute("data-disabled");

    await user.click(copyMessageIdItem);

    expect(writeText).not.toHaveBeenCalled();
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it("disables copying the message id when seq is invalid", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(
      <MessageRow
        message={{
          ...createTextMessage("异常落库消息"),
          seq: 0,
        }}
        onQuoteMessage={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "消息操作" }));

    const copyMessageIdItem = screen.getByRole("menuitem", { name: "复制消息ID" });
    expect(copyMessageIdItem).toHaveAttribute("data-disabled");

    await user.click(copyMessageIdItem);

    expect(writeText).not.toHaveBeenCalled();
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it("disables the quote action when seq is unavailable", async () => {
    const user = userEvent.setup();
    const onQuoteMessage = vi.fn();

    render(
      <MessageRow
        message={{
          ...createTextMessage("本地待落库消息"),
          seq: undefined,
        }}
        onQuoteMessage={onQuoteMessage}
      />,
    );

    await user.click(screen.getByRole("button", { name: "消息操作" }));

    const quoteItem = screen.getByRole("menuitem", { name: "引用" });
    expect(quoteItem).toHaveAttribute("data-disabled");

    await user.click(quoteItem);

    expect(onQuoteMessage).not.toHaveBeenCalled();
  });

  it("disables the quote action when seq is invalid", async () => {
    const user = userEvent.setup();
    const onQuoteMessage = vi.fn();

    render(
      <MessageRow
        message={{
          ...createTextMessage("异常落库消息"),
          seq: 0,
        }}
        onQuoteMessage={onQuoteMessage}
      />,
    );

    await user.click(screen.getByRole("button", { name: "消息操作" }));

    const quoteItem = screen.getByRole("menuitem", { name: "引用" });
    expect(quoteItem).toHaveAttribute("data-disabled");

    await user.click(quoteItem);

    expect(onQuoteMessage).not.toHaveBeenCalled();
  });

  it("copies the sender user id from the action menu", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const message = {
      ...createTextMessage("可复制用户"),
      sender: {
        id: "sender-customer-id",
        name: "客户甲",
        userId: " customer-user-id ",
      },
    } satisfies ChatMessage;

    render(<MessageRow message={message} onQuoteMessage={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "消息操作" }));
    await user.click(screen.getByRole("menuitem", { name: "复制用户ID" }));

    expect(writeText).toHaveBeenCalledWith("customer-user-id");
    expect(toast.success).toHaveBeenCalledWith("已复制用户ID");
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

  it.each([
    [
      "表情",
      {
        alt: "表情",
        imageUrl: "https://example.com/emotion.gif",
        type: "image" as const,
        variant: "emotion" as const,
      },
    ],
    [
      "普通图片",
      {
        alt: "商品图",
        downloadStatus: "finished" as const,
        imageUrl: "https://example.com/image.png",
        type: "image" as const,
      },
    ],
    [
      "文件",
      {
        extension: "pdf",
        fileName: "报价单.pdf",
        type: "file" as const,
      },
    ],
    [
      "小程序",
      {
        appName: "学好惊喜社",
        title: "预约直播",
        type: "mini-program" as const,
      },
    ],
    [
      "H5",
      {
        description: "活动说明",
        title: "活动页",
        type: "h5" as const,
      },
    ],
  ])("shows collection action for %s messages", async (_label, content) => {
    const user = userEvent.setup();
    const onCollectMaterial = vi.fn();
    const message = {
      ...createTextMessage("可收录"),
      content,
      role: "customer" as const,
    } satisfies ChatMessage;

    render(
      <MessageRow
        message={message}
        onCollectMaterial={onCollectMaterial}
      />,
    );

    await user.click(screen.getByRole("button", { name: "消息操作" }));
    await user.click(screen.getByRole("menuitem", { name: "收录" }));

    expect(onCollectMaterial).toHaveBeenCalledWith(message);
  });

  it("does not show collection action for video channel messages when collection is disabled", async () => {
    const user = userEvent.setup();

    render(
      <MessageRow
        message={{
          ...createTextMessage("视频号"),
          content: {
            description: "视频号内容",
            imageUrl: "https://example.com/sphfeed.jpg",
            sourceLabel: "视频号",
            title: "视频号标题",
            type: "sphfeed",
            url: "https://channels.weixin.qq.com/web/pages/feed?eid=export",
          },
          role: "customer",
        }}
        onCollectMaterial={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "消息操作" }));

    expect(screen.queryByRole("menuitem", { name: "收录" })).not.toBeInTheDocument();
  });

  it.each([
    [
      "文本",
      {
        text: "普通文本",
        type: "text" as const,
      },
    ],
    [
      "名片",
      {
        name: "客户甲",
        type: "contact-card" as const,
      },
    ],
  ])("does not show collection action for %s messages", async (_label, content) => {
    const user = userEvent.setup();

    render(
      <MessageRow
        message={{
          ...createTextMessage("不可收录"),
          content,
          role: "customer",
        } as ChatMessage}
        onCollectMaterial={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "消息操作" }));

    expect(screen.queryByRole("menuitem", { name: "收录" })).not.toBeInTheDocument();
  });

  it.each([
    [
      "下载中的普通图片",
      {
        alt: "下载中图片",
        downloadStatus: "ing",
        imageUrl: "https://example.com/image.png",
        type: "image" as const,
      },
    ],
    [
      "未取得地址的普通图片",
      {
        alt: "无地址图片",
        downloadStatus: "finished",
        imageUrl: "",
        type: "image" as const,
      },
    ],
  ])("does not show collection action for %s", async (_label, content) => {
    const user = userEvent.setup();

    render(
      <MessageRow
        message={{
          ...createTextMessage("不可收录图片"),
          content,
          role: "customer",
        } as ChatMessage}
        onCollectMaterial={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "消息操作" }));

    expect(screen.queryByRole("menuitem", { name: "收录" })).not.toBeInTheDocument();
  });

  it("only shows collection action for finished agent video messages", async () => {
    const user = userEvent.setup();
    const onCollectMaterial = vi.fn();
    const message = {
      ...createTextMessage("可收录视频"),
      content: {
        alt: "视频",
        coverImageUrl: "https://example.com/video-cover.jpg",
        downloadStatus: "finished" as const,
        durationLabel: "",
        type: "video" as const,
        videoUrl: "https://example.com/video.mp4",
      },
      role: "agent" as const,
    } satisfies ChatMessage;

    render(
      <MessageRow
        message={message}
        onCollectMaterial={onCollectMaterial}
      />,
    );

    await user.click(screen.getByRole("button", { name: "消息操作" }));
    await user.click(screen.getByRole("menuitem", { name: "收录" }));

    expect(onCollectMaterial).toHaveBeenCalledWith(message);
  });

  it.each([
    [
      "客户发送的视频",
      {
        coverImageUrl: "https://example.com/video-cover.jpg",
        role: "customer" as const,
        downloadStatus: "finished" as const,
        videoUrl: "https://example.com/video.mp4",
      },
    ],
    [
      "下载中的视频",
      {
        coverImageUrl: "https://example.com/video-cover.jpg",
        role: "agent" as const,
        downloadStatus: "ing" as const,
        videoUrl: "https://example.com/video.mp4",
      },
    ],
    [
      "未取得地址的视频",
      {
        coverImageUrl: "https://example.com/video-cover.jpg",
        role: "agent" as const,
        downloadStatus: "finished" as const,
        videoUrl: "",
      },
    ],
    [
      "未取得封面的视频",
      {
        coverImageUrl: "",
        role: "agent" as const,
        downloadStatus: "finished" as const,
        videoUrl: "https://example.com/video.mp4",
      },
    ],
  ])("does not show collection action for %s", async (_label, input) => {
    const user = userEvent.setup();

    render(
      <MessageRow
        message={{
          ...createTextMessage("不可收录视频"),
          content: {
            alt: "视频",
            coverImageUrl: input.coverImageUrl,
            downloadStatus: input.downloadStatus,
            durationLabel: "",
            type: "video",
            videoUrl: input.videoUrl,
          },
          role: input.role,
        } satisfies ChatMessage}
        onCollectMaterial={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "消息操作" }));

    expect(screen.queryByRole("menuitem", { name: "收录" })).not.toBeInTheDocument();
  });

  it("allows collection when message send actions are locked", async () => {
    const user = userEvent.setup();
    const onCollectMaterial = vi.fn();
    const message = {
      ...createTextMessage("文件"),
      content: {
        extension: "pdf",
        fileName: "报价单.pdf",
        type: "file" as const,
      },
      role: "customer" as const,
    } satisfies ChatMessage;

    render(
      <MessageRow
        canUseMessageActions={false}
        message={message}
        onCollectMaterial={onCollectMaterial}
      />,
    );

    await user.click(screen.getByRole("button", { name: "消息操作" }));
    await user.click(screen.getByRole("menuitem", { name: "收录" }));

    expect(onCollectMaterial).toHaveBeenCalledWith(message);
  });

  it("keeps collection action disabled for readonly users", async () => {
    const user = userEvent.setup();
    const onCollectMaterial = vi.fn();
    const message = {
      ...createTextMessage("文件"),
      content: {
        extension: "pdf",
        fileName: "报价单.pdf",
        type: "file" as const,
      },
      role: "customer" as const,
    } satisfies ChatMessage;

    render(
      <MessageRow
        canCollectMaterialActions={false}
        message={message}
        onCollectMaterial={onCollectMaterial}
      />,
    );

    await user.click(screen.getByRole("button", { name: "消息操作" }));

    expect(screen.getByRole("menuitem", { name: "收录" })).toHaveAttribute(
      "data-disabled",
    );
    await user.click(screen.getByRole("menuitem", { name: "收录" }));

    expect(onCollectMaterial).not.toHaveBeenCalled();
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
          uiMessageKey: "msg-customer-1",
          rawMsgtype: "text",
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
      uiMessageKey: "msg-customer-1",
      rawMsgtype: "text",
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
      uiMessageKey: "msg-customer-1",
      rawMsgtype: "text",
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
          uiMessageKey: "msg-customer-1",
          rawMsgtype: "text",
          role: "customer",
          sender: { id: "cus-1", name: "客户甲" },
          sentAt: "2026-05-25T10:00:00+08:00",
          author: "客户甲",
          status: "sent",
        } as ChatMessage}
        smartReply={{
          assistantName: "护肤小助手",
          content: "建议先确认肤质",
          generateStatus: 2,
          status: "ready",
        }}
      />,
    );

    expect(screen.queryByTestId("smart-reply-trigger-icon")).not.toBeInTheDocument();
    expect(screen.getByTestId("smart-reply-card")).toBeInTheDocument();
  });

  it("shows a compact inline spinner instead of a card while auto smart reply is being previewed", () => {
    render(
      <MessageRow
        isSmartReplyAutoPending
        message={{
          content: { text: "客户想了解产品", type: "text" },
          conversationId: "conv-1",
          uiMessageKey: "msg-customer-1",
          rawMsgtype: "text",
          role: "customer",
          sender: { id: "cus-1", name: "客户甲" },
          sentAt: "2026-05-25T10:00:00+08:00",
          seq: 12,
          status: "sent",
        } as ChatMessage}
      />,
    );

    expect(screen.getByTestId("smart-reply-inline-processing")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("正在生成话术推荐");
    expect(screen.queryByTestId("smart-reply-card")).not.toBeInTheDocument();
  });

  it("shows a compact inline spinner instead of a card while manual smart reply is pending", () => {
    render(
      <MessageRow
        isSmartReplyPending
        message={{
          content: { text: "客户想了解产品", type: "text" },
          conversationId: "conv-1",
          uiMessageKey: "msg-customer-1",
          rawMsgtype: "text",
          role: "customer",
          sender: { id: "cus-1", name: "客户甲" },
          sentAt: "2026-05-25T10:00:00+08:00",
          seq: 12,
          status: "sent",
        } as ChatMessage}
      />,
    );

    expect(screen.getByTestId("smart-reply-inline-processing")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("正在生成话术推荐");
    expect(screen.queryByTestId("smart-reply-card")).not.toBeInTheDocument();
  });

  it.each([
    { expectedLabel: "正在生成话术推荐", generateStatus: 0, status: "thinking" as const },
    { expectedLabel: "正在生成话术推荐", generateStatus: 1, status: "processing" as const },
    { expectedLabel: "生成失败：model_error", failReason: "model_error", generateStatus: 3 },
    {
      expectedLabel: "已跳过话术推荐：命中人工处理规则",
      failReason: "命中人工处理规则",
      generateStatus: 4,
      status: "ready" as const,
    },
    {
      createdAt: Date.now() - 10_000,
      expectedLabel: "客户可能还没说完",
      failReason: "客户可能还没说完",
      generateStatus: 5,
      status: "processing" as const,
    },
    {
      createdAt: Date.now() - 21_000,
      expectedLabel: "语义不完整，已跳过话术推荐",
      generateStatus: 5,
      status: "processing" as const,
    },
  ])(
    "shows inline smart reply state instead of a card for gen_status $generateStatus",
    ({ createdAt, expectedLabel, failReason, generateStatus, status }) => {
      render(
        <MessageRow
          message={{
            content: { text: "客户想了解产品", type: "text" },
            conversationId: "conv-1",
            uiMessageKey: "msg-customer-1",
            rawMsgtype: "text",
            role: "customer",
            sender: { id: "cus-1", name: "客户甲" },
            sentAt: "2026-05-25T10:00:00+08:00",
            seq: 12,
            status: "sent",
          } as ChatMessage}
          smartReply={{
            assistantName: "护肤小助手",
            content: generateStatus === 4 ? "转人工原因" : "",
            createdAt,
            failReason,
            generateStatus,
            pollComplete: generateStatus === 3 || generateStatus === 4,
            status,
          }}
        />,
      );

      expect(screen.getByTestId("smart-reply-inline-processing")).toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent(expectedLabel);
      expect(screen.queryByTestId("smart-reply-card")).not.toBeInTheDocument();
    },
  );

  it("regenerates failed inline smart replies from the refresh action", async () => {
    const user = userEvent.setup();
    const onTriggerSmartReply = vi.fn();
    const message = {
      content: { text: "客户想了解产品", type: "text" },
      conversationId: "conv-1",
      uiMessageKey: "msg-customer-1",
      rawMsgtype: "text",
      role: "customer",
      sender: { id: "cus-1", name: "客户甲" },
      sentAt: "2026-05-25T10:00:00+08:00",
      seq: 12,
      status: "sent",
    } as ChatMessage;

    render(
      <MessageRow
        message={message}
        onTriggerSmartReply={onTriggerSmartReply}
        smartReply={{
          assistantName: "护肤小助手",
          content: "",
          failReason: "model_error",
          generateStatus: 3,
          pollComplete: true,
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "重新生成" }));

    expect(onTriggerSmartReply).toHaveBeenCalledWith(message, { force: true });
  });

  it("dismisses expired semantic-wait inline smart replies without offering regeneration", async () => {
    const user = userEvent.setup();
    const onDismissSmartReply = vi.fn();
    const onTriggerSmartReply = vi.fn();
    const message = {
      content: { text: "客户想了解产品", type: "text" },
      conversationId: "conv-1",
      uiMessageKey: "msg-customer-1",
      rawMsgtype: "text",
      role: "customer",
      sender: { id: "cus-1", name: "客户甲" },
      sentAt: "2026-05-25T10:00:00+08:00",
      seq: 12,
      status: "sent",
    } as ChatMessage;

    render(
      <MessageRow
        message={message}
        onDismissSmartReply={onDismissSmartReply}
        onTriggerSmartReply={onTriggerSmartReply}
        smartReply={{
          assistantName: "护肤小助手",
          content: "",
          createdAt: Date.now() - 21_000,
          generateStatus: 5,
          pollComplete: false,
          status: "processing",
        }}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "语义不完整，已跳过话术推荐",
    );
    expect(screen.queryByRole("button", { name: "重新生成" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "收起" }));

    expect(onDismissSmartReply).toHaveBeenCalledWith(message);
    expect(onTriggerSmartReply).not.toHaveBeenCalled();
  });

  it("dismisses the smart reply card so the avatar recommendation action can be used again", async () => {
    const user = userEvent.setup();
    const onDismissSmartReply = vi.fn();
    const message = {
      content: { text: "客户想了解产品", type: "text" },
      conversationId: "conv-1",
      uiMessageKey: "msg-customer-1",
      rawMsgtype: "text",
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
          generateStatus: 2,
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
      uiMessageKey: "msg-customer-1",
      rawMsgtype: "text",
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
          generateStatus: 2,
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
        uiMessageKey: "msg-text-layout",
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

  it("does not expose revoke action when seq is invalid", async () => {
    const user = userEvent.setup();
    const onRevokeMessage = vi.fn();
    vi.setSystemTime(new Date("2026-05-08T09:56:59").getTime());

    render(
      <MessageRow
        message={{
          ...createTextMessage("异常落库客服消息"),
          isOwnMessage: true,
          seq: 0,
          sentAt: "2026-05-08 09:54:00",
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

  it("delegates retry for failed messages without a seq to the page handler", async () => {
    const user = userEvent.setup();
    const onRetryMessage = vi.fn();

    render(
      <MessageRow
        message={{
          ...createTextMessage("尚未落库失败"),
          msgid: undefined,
          seq: undefined,
          status: "failed",
        }}
        onRetryMessage={onRetryMessage}
      />,
    );

    const retryButton = screen.getByRole("button", { name: "重试发送" });
    expect(retryButton).toBeEnabled();

    await user.click(retryButton);
    expect(onRetryMessage).toHaveBeenCalledWith(expect.any(String));
  });

  it("delegates retry for failed messages with invalid seq to the page handler", async () => {
    const user = userEvent.setup();
    const onRetryMessage = vi.fn();

    render(
      <MessageRow
        message={{
          ...createTextMessage("异常序号失败"),
          seq: 0,
          status: "failed",
        }}
        onRetryMessage={onRetryMessage}
      />,
    );

    const retryButton = screen.getByRole("button", { name: "重试发送" });
    expect(retryButton).toBeEnabled();

    await user.click(retryButton);
    expect(onRetryMessage).toHaveBeenCalledWith(expect.any(String));
  });

  it("delegates retry for unsupported failed message content to the page handler", async () => {
    const user = userEvent.setup();
    const onRetryMessage = vi.fn();

    render(
      <MessageRow
        message={{
          ...createTextMessage("语音失败"),
          content: {
            audioUrl: "https://cdn.example.com/voice.amr",
            durationLabel: "0:05",
            type: "voice",
          },
          rawMsgtype: "voice",
          status: "failed",
        }}
        onRetryMessage={onRetryMessage}
      />,
    );

    const retryButton = screen.getByRole("button", { name: "重试发送" });
    expect(retryButton).toBeEnabled();

    await user.click(retryButton);
    expect(onRetryMessage).toHaveBeenCalledWith(expect.any(String));
  });

  it("keeps the feed item key stable after optimistic messages are reconciled", () => {
    const optimisticMessage = {
      ...createTextMessage("已确认消息"),
      uiMessageKey: "opt-001",
      optNo: "opt-001",
      status: "accepted",
    } satisfies ChatMessage;
    const reconciledMessage = {
      ...optimisticMessage,
      uiMessageKey: "remote-001",
      msgid: "remote-001",
      status: "sent",
    } satisfies ChatMessage;

    expect(getMessageFeedItemKey(optimisticMessage)).toBe(
      getMessageFeedItemKey(reconciledMessage),
    );
  });

  it("marks agent-hosted outbound messages on the avatar", () => {
    render(
      <MessageRow
        message={{
          ...createTextMessage("Agent 自动回复"),
          isAgentMessage: true,
        }}
      />,
    );

    expect(screen.getByLabelText("AI托管")).toBeInTheDocument();
  });

  it("does not mark regular outbound messages as agent-hosted", () => {
    render(<MessageRow message={createTextMessage("人工回复")} />);

    expect(screen.queryByLabelText("AI托管")).not.toBeInTheDocument();
  });

  it("adds directional entrance animation only to appended new messages", () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <ChatMessageList
        conversationId="conv-layout"
        messages={[
          {
            ...createTextMessage("历史消息"),
            uiMessageKey: "msg-1",
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
            uiMessageKey: "msg-1",
          },
          {
            ...createTextMessage("新客服消息"),
            uiMessageKey: "msg-2",
            isNew: true,
            isOwnMessage: true,
          },
          {
            ...createTextMessage("新客户消息"),
            uiMessageKey: "msg-3",
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
            uiMessageKey: "msg-1",
          },
          {
            ...createTextMessage("新客服消息"),
            uiMessageKey: "msg-2",
            isNew: true,
            isOwnMessage: true,
          },
          {
            ...createTextMessage("新客户消息"),
            uiMessageKey: "msg-3",
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
            uiMessageKey: "msg-other-1",
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
            uiMessageKey: "msg-1",
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
            uiMessageKey: "msg-1",
          },
          {
            ...createTextMessage("新客服消息"),
            optNo: "opt-001",
            uiMessageKey: "opt-001",
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
            uiMessageKey: "msg-1",
          },
          {
            ...createTextMessage("新客服消息"),
            optNo: "opt-001",
            uiMessageKey: "remote-001",
            isNew: true,
            isOwnMessage: true,
            msgid: "remote-001",
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
            uiMessageKey: "msg-1",
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
            uiMessageKey: "msg-1",
          },
          {
            ...createTextMessage("新客服消息"),
            uiMessageKey: "msg-2",
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
            uiMessageKey: "msg-other-1",
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
      uiMessageKey: "voice-message-1",
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

describe("message sent time preview", () => {
  it("shows sent time after hovering any message type", () => {
    vi.useFakeTimers();

    try {
      render(
        <MessageRow
          message={{
            ...createTextMessage("图片"),
            content: {
              alt: "图片",
              imageUrl: "https://example.com/image.png",
              type: "image",
            },
            role: "customer",
          }}
        />,
      );

      const sentAt = screen.getByTestId("text-message-sent-at");
      const row = screen.getByTestId("message-row");

      expect(sentAt).toHaveClass("opacity-0");

      fireEvent.mouseEnter(row);
      act(() => {
        vi.advanceTimersByTime(MESSAGE_SENT_AT_HOVER_DELAY_MS);
      });

      expect(sentAt).toHaveClass("opacity-100");
      expect(sentAt).toHaveTextContent("5/8 09:54");
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not reserve hover sent-time slot when inline timestamp is enabled", () => {
    render(
      <MessageRow
        message={createTextMessage("已有底部时间")}
        showTimestamp
      />,
    );

    expect(screen.queryByTestId("text-message-sent-at-slot")).not.toBeInTheDocument();
    expect(screen.getByText("2026-05-08 09:54:00")).toBeInTheDocument();
  });

  it("shows hover sent time after the sender name in group customer messages", () => {
    vi.useFakeTimers();

    try {
      render(
        <MessageRow
          message={{
            ...createTextMessage("群消息"),
            isGroupConversation: true,
            isOwnMessage: false,
            role: "customer",
            sender: {
              groupMemberId: "member-001",
              id: "member-001",
              name: "成员甲",
            },
            senderDisplayName: "成员甲",
          }}
        />,
      );

      expect(screen.queryByTestId("text-message-sent-at-slot")).not.toBeInTheDocument();
      expect(screen.getByText("成员甲")).toBeInTheDocument();

      const sentAt = screen.getByTestId("text-message-sent-at");
      const row = screen.getByTestId("message-row");

      expect(sentAt).toHaveClass("opacity-0");

      fireEvent.mouseEnter(row);
      act(() => {
        vi.advanceTimersByTime(MESSAGE_SENT_AT_HOVER_DELAY_MS);
      });

      expect(sentAt).toHaveClass("opacity-100");
      expect(sentAt).toHaveTextContent("5/8 09:54");
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows forward and multi-select actions when message forward is enabled", async () => {
    const user = userEvent.setup();
    const onEnterMultiSelectMode = vi.fn();
    const onForwardMessage = vi.fn();
    const message = {
      ...createTextMessage("可转发消息"),
      seq: 1001,
    };

    render(
      <MessageRow
        canUseMessageForward
        message={message}
        onEnterMultiSelectMode={onEnterMultiSelectMode}
        onForwardMessage={onForwardMessage}
      />,
    );

    await user.click(screen.getByRole("button", { name: "消息操作" }));
    await user.click(screen.getByRole("menuitem", { name: "转发" }));

    expect(onForwardMessage).toHaveBeenCalledWith(message);

    await user.click(screen.getByRole("button", { name: "消息操作" }));
    await user.click(screen.getByRole("menuitem", { name: "多选" }));

    expect(onEnterMultiSelectMode).toHaveBeenCalledTimes(1);
  });

  it("hides forward and multi-select actions for failed messages", async () => {
    const user = userEvent.setup();

    render(
      <MessageRow
        canUseMessageForward
        message={{
          ...createTextMessage("发送失败"),
          status: "failed",
        }}
        onEnterMultiSelectMode={vi.fn()}
        onForwardMessage={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "消息操作" }));

    expect(screen.queryByRole("menuitem", { name: "转发" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "多选" })).not.toBeInTheDocument();
  });

  it("renders multi-select checkbox when multi-select mode is active", () => {
    render(
      <MessageRow
        canUseMessageForward
        isMessageSelected
        message={createTextMessage("多选消息")}
        multiSelectMode
        onToggleMessageSelection={vi.fn()}
      />,
    );

    expect(screen.getByRole("checkbox", { name: "选择消息" })).toBeChecked();
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
    msgid: "msg-text-layout",
    rawMsgtype: "text",
    role: "agent" as const,
    sender: {
      id: "agent-layout",
      name: "客服",
    },
    sentAt: "2026-05-08 09:54:00",
    seq: 1088,
    status: "sent" as const,
    uiMessageKey: "msg-text-layout",
  } satisfies ChatMessage;
}
