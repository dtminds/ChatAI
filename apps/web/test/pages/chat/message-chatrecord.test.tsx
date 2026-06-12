import { render, screen, waitFor, within } from "@testing-library/react";
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

  it("renders loading chat record cards without opening detail", async () => {
    const user = userEvent.setup();
    const loadChatRecordDetail = vi.fn();

    render(
      <ChatRecordMessageCard
        content={{
          msgContent: ["数据加载中"],
          msgTitle: "聊天记录",
          type: "chatrecord",
          viewState: "loading",
        }}
        conversationId="conversation-1"
        loadChatRecordDetail={loadChatRecordDetail}
        messageId="parent-chatrecord-msgid"
      />,
    );

    expect(screen.getByTestId("chat-record-card")).toBeInTheDocument();
    expect(screen.getByText("数据加载中")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "聊天记录加载中：聊天记录" }));

    expect(loadChatRecordDetail).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("ignores malformed runtime values in chat record summaries", () => {
    render(
      <ChatRecordMessageCard
        content={{
          msgContent: [null, 123, " 范双飞：123 "] as unknown as string[],
          msgTitle: null as unknown as string,
          type: "chatrecord",
        }}
        conversationId="conversation-1"
        messageId="parent-chatrecord-msgid"
      />,
    );

    expect(screen.getByRole("button", { name: "查看聊天记录：聊天记录" }))
      .toBeInTheDocument();
    expect(screen.getByText("范双飞：123")).toBeInTheDocument();
    expect(screen.queryByText("123")).not.toBeInTheDocument();
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

  it("reloads detail when the previous successful response was empty", async () => {
    const user = userEvent.setup();
    const loadChatRecordDetail = vi.fn()
      .mockResolvedValueOnce({
        messageId: "parent-chatrecord-msgid",
        messages: [],
      })
      .mockResolvedValueOnce({
        messageId: "parent-chatrecord-msgid",
        messages: [
          createTextMessage({
            id: "chatrecord:parent-chatrecord-msgid:22",
            text: "后续入库的详情",
          }),
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

    const firstDialog = await screen.findByRole("dialog", {
      name: "缪勇飞和范双飞的聊天记录",
    });
    expect(within(firstDialog).getByText("暂无聊天记录")).toBeInTheDocument();
    expect(within(firstDialog).getByRole("button", { name: "刷新聊天记录" }))
      .toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog", {
        name: "缪勇飞和范双飞的聊天记录",
      })).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "查看聊天记录：缪勇飞和范双飞的聊天记录" }));

    const secondDialog = await screen.findByRole("dialog", {
      name: "缪勇飞和范双飞的聊天记录",
    });
    expect(await within(secondDialog).findByText("后续入库的详情")).toBeInTheDocument();
    expect(loadChatRecordDetail).toHaveBeenCalledTimes(2);
  });

  it("ignores stale detail responses after the message context changes", async () => {
    const user = userEvent.setup();
    const initialRequest = createDeferred<{
      messageId: string;
      messages: ChatMessage[];
    }>();
    const nextContextRequest = createDeferred<{
      messageId: string;
      messages: ChatMessage[];
    }>();
    const loadChatRecordDetail = vi.fn()
      .mockReturnValueOnce(initialRequest.promise)
      .mockReturnValueOnce(nextContextRequest.promise);

    const { rerender } = render(
      <ChatRecordMessageCard
        content={createChatRecordContent()}
        conversationId="conversation-1"
        loadChatRecordDetail={loadChatRecordDetail}
        messageId="parent-chatrecord-msgid"
      />,
    );

    await user.click(screen.getByRole("button", { name: "查看聊天记录：缪勇飞和范双飞的聊天记录" }));

    rerender(
      <ChatRecordMessageCard
        content={createChatRecordContent()}
        conversationId="conversation-2"
        loadChatRecordDetail={loadChatRecordDetail}
        messageId="next-chatrecord-msgid"
      />,
    );

    await waitFor(() => {
      expect(loadChatRecordDetail).toHaveBeenCalledWith({
        conversationId: "conversation-2",
        messageId: "next-chatrecord-msgid",
      });
    });

    nextContextRequest.resolve({
      messageId: "next-chatrecord-msgid",
      messages: [
        createTextMessage({
          id: "chatrecord:next-chatrecord-msgid:new",
          text: "新的详情",
        }),
      ],
    });

    const dialog = await screen.findByRole("dialog", {
      name: "缪勇飞和范双飞的聊天记录",
    });
    expect(await within(dialog).findByText("新的详情")).toBeInTheDocument();

    initialRequest.resolve({
      messageId: "parent-chatrecord-msgid",
      messages: [
        createTextMessage({
          id: "chatrecord:parent-chatrecord-msgid:old",
          text: "旧的详情",
        }),
      ],
    });

    await waitFor(() => {
      expect(within(dialog).queryByText("旧的详情")).not.toBeInTheDocument();
    });
    expect(loadChatRecordDetail).toHaveBeenCalledTimes(2);
  });
});

function createDeferred<T>() {
  let resolve!: (value: T) => void;
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
