import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ChatMessage, ChatRecordMessageContent } from "@/pages/chat/chat-types";
import { ChatRecordMessageCard } from "@/pages/chat/components/message";

describe("ChatRecordMessageCard", () => {
  it("renders a chat record summary card", () => {
    render(
      <ChatRecordMessageCard
        content={createChatRecordContent()}
        conversationId="conversation-1"
        messageId="parent-chatrecord-msgid"
      />,
    );

    expect(screen.getByText("缪勇飞和范双飞的聊天记录")).toBeInTheDocument();
    expect(screen.getByText("范双飞：123")).toBeInTheDocument();
    expect(screen.getByText("缪勇飞：123")).toBeInTheDocument();
    expect(screen.getByText("缪勇飞：[图片]")).toBeInTheDocument();
    expect(screen.getByText("聊天记录")).toBeInTheDocument();
    expect(screen.getByText("聊天记录").closest("div")?.querySelector("svg"))
      .not.toBeInTheDocument();
  });

  it("renders malformed chat records as plain text instead of a card", () => {
    render(
      <ChatRecordMessageCard
        content={{
          msgContent: ["[聊天记录]"],
          msgTitle: "聊天记录",
          type: "chatrecord",
        }}
        conversationId="conversation-1"
        messageId="parent-chatrecord-msgid"
      />,
    );

    expect(screen.getByTestId("text-message-bubble")).toHaveTextContent("[聊天记录]");
    expect(screen.queryByTestId("chat-record-card")).not.toBeInTheDocument();
  });

  it("opens detail dialog and renders detail messages", async () => {
    const user = userEvent.setup();
    const loadChatRecordDetail = vi.fn().mockResolvedValue({
      messageId: "parent-chatrecord-msgid",
      messages: [
        createTextMessage({
          id: "chatrecord:parent-chatrecord-msgid:18",
          text: "第一条详情",
        }),
        createFileMessage(),
        createVideoMessage(),
        createNestedChatRecordMessage(),
      ],
    });

    render(
      <ChatRecordMessageCard
        content={createChatRecordContent()}
        conversationId="conversation-1"
        loadChatRecordDetail={loadChatRecordDetail}
        messageId="parent-chatrecord-msgid"
      />,
    );

    await user.click(screen.getByRole("button", { name: "查看聊天记录：缪勇飞和范双飞的聊天记录" }));

    expect(loadChatRecordDetail).toHaveBeenCalledWith({
      conversationId: "conversation-1",
      messageId: "parent-chatrecord-msgid",
    });
    const dialog = await screen.findByRole("dialog", {
      name: "缪勇飞和范双飞的聊天记录",
    });
    const viewport = within(dialog).getByTestId("chat-record-detail-viewport");

    expect(dialog).toHaveClass("w-[min(26rem,calc(100vw-2rem))]", "max-w-none");
    expect(viewport).toHaveClass("h-[min(42rem,calc(100vh-6rem))]", "min-h-[34rem]");
    expect(within(dialog).getByText("第一条详情")).toBeInTheDocument();
    expect(within(dialog).getByText("报价单.pdf")).toBeInTheDocument();
    expect(within(dialog).getByRole("img", { name: "PDF 文件" }))
      .toHaveAttribute("src", "https://b5.bokr.com.cn/dist/pdf.png");
    expect(within(dialog).queryByRole("button", { name: "下载文件：报价单.pdf" }))
      .not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "下载视频：详情视频" }))
      .not.toBeInTheDocument();
    expect(within(dialog).getByText("群聊")).toBeInTheDocument();
    expect(within(dialog).getByText("该消息类型暂不能展示")).toBeInTheDocument();
  });
});

function createChatRecordContent(): ChatRecordMessageContent {
  return {
    msgContent: ["范双飞：123", "缪勇飞：123", "缪勇飞：[图片]"],
    msgTitle: "缪勇飞和范双飞的聊天记录",
    type: "chatrecord",
  };
}

function createTextMessage({
  id,
  text,
}: {
  id: string;
  text: string;
}): ChatMessage {
  return {
    author: "范双飞",
    content: {
      text,
      type: "text",
    },
    conversationId: "conversation-1",
    id,
    role: "customer",
    sender: {
      id: "customer-1",
      name: "范双飞",
    },
    sentAt: "2026-06-11 10:00:00",
    status: "sent",
  };
}

function createFileMessage(): ChatMessage {
  return {
    author: "范双飞",
    content: {
      extension: "pdf",
      fileName: "报价单.pdf",
      fileSizeLabel: "2 KB",
      sourceLabel: "文件",
      type: "file",
    },
    conversationId: "conversation-1",
    id: "chatrecord:parent-chatrecord-msgid:19",
    role: "customer",
    sender: {
      id: "customer-1",
      name: "范双飞",
    },
    sentAt: "2026-06-11 10:01:00",
    status: "sent",
  };
}

function createVideoMessage(): ChatMessage {
  return {
    author: "范双飞",
    content: {
      alt: "详情视频",
      coverImageUrl: "/covers/detail.jpg",
      durationLabel: "0:10",
      fileSerialNo: "serial-video-001",
      type: "video",
      videoUrl: "",
    },
    conversationId: "conversation-1",
    id: "chatrecord:parent-chatrecord-msgid:20",
    role: "customer",
    sender: {
      id: "customer-1",
      name: "范双飞",
    },
    sentAt: "2026-06-11 10:02:00",
    status: "sent",
  };
}

function createNestedChatRecordMessage(): ChatMessage {
  return {
    author: "范双飞",
    content: {
      msgContent: ["该消息类型暂不能展示"],
      msgTitle: "群聊",
      type: "chatrecord",
      unsupportedDisplayText: "该消息类型暂不能展示",
    },
    conversationId: "conversation-1",
    id: "chatrecord:parent-chatrecord-msgid:21",
    role: "customer",
    sender: {
      id: "customer-1",
      name: "范双飞",
    },
    sentAt: "2026-06-11 10:03:00",
    status: "sent",
  };
}
