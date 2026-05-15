import { afterEach, describe, expect, it, vi } from "vitest";
import { openMessageDownloadUrl } from "@/pages/chat/lib/message-download";
import type { ChatMessage } from "@/pages/chat/chat-types";

describe("openMessageDownloadUrl", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens file downloads in a new browsing context so PDF previews do not replace the workbench", () => {
    const link = document.createElement("a");
    const click = vi.spyOn(link, "click").mockImplementation(() => undefined);
    const remove = vi.spyOn(link, "remove").mockImplementation(() => undefined);
    vi.spyOn(document, "createElement").mockReturnValue(link);

    openMessageDownloadUrl(createFileMessage(), "https://b5.bokr.com.cn/chat-files/quote.pdf");

    expect(link.href).toBe("https://b5.bokr.com.cn/chat-files/quote.pdf");
    expect(link.download).toBe("报价单.pdf");
    expect(link.target).toBe("_blank");
    expect(link.rel).toBe("noopener noreferrer");
    expect(click).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("opens videos in a new tab without creating a download anchor", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const createElement = vi.spyOn(document, "createElement");

    openMessageDownloadUrl(createVideoMessage(), "https://b5.bokr.com.cn/chat-videos/demo.mp4");

    expect(open).toHaveBeenCalledWith(
      "https://b5.bokr.com.cn/chat-videos/demo.mp4",
      "_blank",
      "noopener,noreferrer",
    );
    expect(createElement).not.toHaveBeenCalled();
  });
});

function createFileMessage(): ChatMessage {
  return {
    content: {
      extension: "pdf",
      fileName: "报价单.pdf",
      fileSizeLabel: "2 KB",
      type: "file",
    },
    author: "客户",
    conversationId: "conversation-1",
    id: "message-file",
    role: "customer",
    sender: {
      id: "customer-1",
      name: "客户",
    },
    sentAt: "2026-05-15 10:00:00",
    status: "sent",
  };
}

function createVideoMessage(): ChatMessage {
  return {
    content: {
      alt: "视频",
      coverImageUrl: "https://b5.bokr.com.cn/chat-videos/cover.jpg",
      durationLabel: "00:10",
      type: "video",
      videoUrl: "https://b5.bokr.com.cn/chat-videos/demo.mp4",
    },
    author: "客户",
    conversationId: "conversation-1",
    id: "message-video",
    role: "customer",
    sender: {
      id: "customer-1",
      name: "客户",
    },
    sentAt: "2026-05-15 10:00:00",
    status: "sent",
  };
}
