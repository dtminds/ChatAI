import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import {
  ChatMessageList,
  formatMessageDividerLabel,
} from "@/pages/chat/components/message-feed";
import type { ChatMessage } from "@/pages/chat/chat-types";

describe("formatMessageDividerLabel", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("formats today's divider with time only", () => {
    vi.setSystemTime(new Date("2026-05-09T16:00:00"));

    expect(formatMessageDividerLabel("2026-05-09 14:59:00")).toBe("14:59");
  });

  it("formats yesterday's divider with yesterday and time", () => {
    vi.setSystemTime(new Date("2026-05-09T16:00:00"));

    expect(formatMessageDividerLabel("2026-05-08 21:05:00")).toBe("昨天 21:05");
  });

  it("formats other days in the current week with weekday and time", () => {
    vi.setSystemTime(new Date("2026-05-09T16:00:00"));

    expect(formatMessageDividerLabel("2026-05-04 14:59:00")).toBe("周一 14:59");
  });

  it("omits the year for current-year dates outside this week", () => {
    vi.setSystemTime(new Date("2026-05-09T16:00:00"));

    expect(formatMessageDividerLabel("2026-04-19 10:12:00")).toBe("4月19日 10:12");
  });

  it("keeps the year for dates outside the current year", () => {
    vi.setSystemTime(new Date("2026-05-09T16:00:00"));

    expect(formatMessageDividerLabel("2025-12-31 23:40:00")).toBe(
      "2025年12月31日 23:40",
    );
  });

  it("keeps invalid dates unchanged", () => {
    vi.setSystemTime(new Date("2026-05-09T16:00:00"));

    expect(formatMessageDividerLabel("not-a-date")).toBe("not-a-date");
  });

  it("ignores invalid message timestamps when inserting dividers", () => {
    vi.setSystemTime(new Date("2026-05-09T16:00:00"));

    render(
      createElement(ChatMessageList, {
        messages: [
          createMessage("message-1", "第一条", "2026-05-09 14:00:00"),
          createMessage("message-2", "第二条", "2026-05-09 14:02:00"),
          createMessage("message-3", "无有效时间", ""),
          createMessage("message-4", "第四条", "2026-05-09 14:04:59"),
        ],
      }),
    );

    expect(screen.getByText("14:00")).toBeInTheDocument();
    expect(screen.queryByText(/1970/)).not.toBeInTheDocument();
    expect(screen.queryByText("14:04")).not.toBeInTheDocument();
  });

  it("inserts a divider when messages are at least five minutes apart", () => {
    vi.setSystemTime(new Date("2026-05-09T16:00:00"));

    render(
      createElement(ChatMessageList, {
        messages: [
          createMessage("message-1", "第一条", "2026-05-09 14:00:00"),
          createMessage("message-2", "第二条", "2026-05-09 14:04:00"),
          createMessage("message-3", "第三条", "2026-05-09 14:09:00"),
        ],
      }),
    );

    expect(screen.getByText("14:00")).toBeInTheDocument();
    expect(screen.queryByText("14:04")).not.toBeInTheDocument();
    expect(screen.getByText("14:09")).toBeInTheDocument();
  });

  it("renders file download state from message content", async () => {
    const handleDownloadMessageFile = vi.fn();

    render(
      createElement(ChatMessageList, {
        messages: [
          {
            ...createMessage("message-file", "", "2026-05-09 14:00:00"),
            content: {
              downloadStatus: "ing",
              extension: "pdf",
              fileName: "报价单.pdf",
              fileSerialNo: "serial-file-001",
              fileSizeLabel: "2 KB",
              type: "file",
            },
          },
        ],
        onDownloadMessageFile: handleDownloadMessageFile,
      }),
    );

    expect(screen.getByRole("status", { name: "文件下载中" })).toBeInTheDocument();
    expect(handleDownloadMessageFile).not.toHaveBeenCalled();
  });
});

function createMessage(id: string, text: string, sentAt: string): ChatMessage {
  return {
    author: "客户",
    content: {
      text,
      type: "text",
    },
    conversationId: "conversation-1",
    id,
    role: "customer",
    sender: {
      id: "customer-1",
      name: "客户",
    },
    sentAt,
    status: "read",
  };
}
