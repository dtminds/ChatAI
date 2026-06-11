import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  MessageRow,
  MESSAGE_SENT_AT_HOVER_DELAY_MS,
} from "@/pages/chat/components/message-feed";
import { MiniAppMessageCard } from "@/pages/chat/components/message";
import type { ChatMessage } from "@/pages/chat/chat-types";

describe("MiniAppMessageCard", () => {
  it("uses the official mini program mark color", () => {
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
      "text-mini-program-brand",
    );
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

      expect(sentAt).toHaveClass("invisible");

      fireEvent.mouseEnter(row);
      act(() => {
        vi.advanceTimersByTime(MESSAGE_SENT_AT_HOVER_DELAY_MS);
      });

      expect(sentAt).not.toHaveClass("invisible");
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
