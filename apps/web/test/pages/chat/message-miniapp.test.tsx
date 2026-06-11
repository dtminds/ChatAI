import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MessageRow } from "@/pages/chat/components/message-feed";
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

  it("shows sent time above the card when activated by keyboard", async () => {
    const user = userEvent.setup();

    render(<MessageRow message={createMiniProgramMessage()} />);

    const sentAt = screen.getByTestId("text-message-sent-at");
    const card = screen.getByRole("button", { name: "查看发送时间" });

    expect(sentAt).toHaveClass("invisible");

    card.focus();
    await user.keyboard("{Enter}");

    expect(sentAt).not.toHaveClass("invisible");
  });

  it("supports keyboard activation for clickable mini program cards", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    render(
      <MiniAppMessageCard
        content={{
          appName: "学好惊喜社",
          sourceLabel: "小程序",
          title: "预约直播抽秋天的第一杯奶茶",
          type: "mini-program",
        }}
        onClick={onClick}
      />,
    );

    const card = screen.getByRole("button", { name: "查看发送时间" });

    expect(card).toHaveAttribute("tabindex", "0");

    card.focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");

    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("shows sent time above the card on click", async () => {
    const user = userEvent.setup();

    render(<MessageRow message={createMiniProgramMessage()} />);

    const sentAt = screen.getByTestId("text-message-sent-at");

    expect(sentAt).toHaveClass("invisible");

    await user.click(screen.getByTestId("mini-program-message-card"));

    expect(sentAt).not.toHaveClass("invisible");
    expect(sentAt).toHaveTextContent("6/11 13:22");
    expect(screen.getByTestId("text-message-sent-at-slot")).toHaveClass("ml-10");
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
