import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  MessageRow,
  MESSAGE_SENT_AT_HOVER_DELAY_MS,
} from "@/pages/chat/components/message-feed";
import { MiniAppMessageCard } from "@/pages/chat/components/message";
import type { ChatMessage } from "@/pages/chat/chat-types";

describe("MiniAppMessageCard", () => {
  it("uses the official mini program mark color and normalized glyph scale", () => {
    render(
      <MiniAppMessageCard
        content={{
          appName: "学好惊喜社",
          sourceLabel: "小程序",
          title: "预约直播抽秋天的第一杯奶茶",
          type: "mini-program",
        }}
      />,
    );

    expect(screen.getByTestId("mini-program-mark")).toHaveClass(
      "size-3.5",
      "text-mini-program-brand",
    );
    expect(screen.getByTestId("mini-program-mark")).toHaveAttribute(
      "viewBox",
      "0 0 1024 1024",
    );
    expect(screen.getByTestId("mini-program-mark").querySelector("g"))
      .toHaveAttribute(
        "transform",
        "translate(512 512) scale(1.5) translate(-512 -512)",
      );
  });

  it("truncates app name and supports single-line title mode", () => {
    render(
      <MiniAppMessageCard
        content={{
          appName: "这是一个很长很长的小程序名称",
          sourceLabel: "小程序",
          title: "这是一个很长很长的小程序卡片标题",
          type: "mini-program",
        }}
        titleLines={1}
      />,
    );

    expect(screen.getByTestId("mini-program-app-name"))
      .toHaveClass("truncate");
    expect(screen.getByText("这是一个很长很长的小程序卡片标题"))
      .toHaveClass("line-clamp-1");
  });

  it("uses an image-not-found fallback when the cover image URL is empty", () => {
    render(
      <MiniAppMessageCard
        content={{
          appName: "学好惊喜社",
          coverImageUrl: "   ",
          title: "预约直播抽秋天的第一杯奶茶",
          type: "mini-program",
        }}
      />,
    );

    expect(screen.getByRole("img", { name: "小程序封面不可用：预约直播抽秋天的第一杯奶茶" }))
      .toBeInTheDocument();
    expect(screen.getByTestId("mini-program-cover-fallback-icon")).toHaveAttribute(
      "data-icon-name",
      "image-not-found-01",
    );
    expect(screen.queryByRole("img", { name: "预约直播抽秋天的第一杯奶茶" }))
      .not.toBeInTheDocument();
  });

  it("uses an image-not-found fallback when the cover image fails to load", () => {
    render(
      <MiniAppMessageCard
        content={{
          appName: "学好惊喜社",
          coverImageUrl: "https://cdn.example.com/broken-miniapp-cover.png",
          title: "预约直播抽秋天的第一杯奶茶",
          type: "mini-program",
        }}
      />,
    );

    fireEvent.error(screen.getByRole("img", { name: "预约直播抽秋天的第一杯奶茶" }));

    expect(screen.getByRole("img", { name: "小程序封面不可用：预约直播抽秋天的第一杯奶茶" }))
      .toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "预约直播抽秋天的第一杯奶茶" }))
      .not.toBeInTheDocument();
  });

  it("shows sent time above the card after hovering the message row", () => {
    vi.useFakeTimers();

    try {
      render(<MessageRow message={createMiniProgramMessage()} />);

      const sentAt = screen.getByTestId("text-message-sent-at");
      const row = screen.getByTestId("message-row");

      expect(sentAt).toHaveClass("opacity-0");

      fireEvent.mouseEnter(row);
      act(() => {
        vi.advanceTimersByTime(MESSAGE_SENT_AT_HOVER_DELAY_MS);
      });

      expect(sentAt).toHaveClass("opacity-100");
      expect(sentAt).toHaveTextContent("6/11 13:22");
      expect(screen.getByTestId("text-message-sent-at-slot")).toHaveClass("ml-10");
    } finally {
      vi.useRealTimers();
    }
  });
});

function createMiniProgramMessage(): ChatMessage {
  return {
    id: "msg-mini-program-1",
    conversationId: "conv-mini-program",
    role: "customer",
    author: "客户",
    sender: {
      id: "customer-mini-program",
      name: "客户",
    },
    content: {
      appName: "学好惊喜社",
      sourceLabel: "小程序",
      title: "预约直播抽秋天的第一杯奶茶",
      type: "mini-program",
    },
    sentAt: "2026-06-11 13:22:45",
    status: "sent",
  };
}
