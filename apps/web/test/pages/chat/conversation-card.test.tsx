import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConversationCard } from "@/pages/chat/components/conversation-card";
import type { Conversation } from "@/pages/chat/chat-types";

const conversation: Conversation = {
  accountId: "account-1",
  customerAvatarUrl: "https://example.com/customer.png",
  customerId: "customer-1",
  customerName: "测试客户",
  id: "conversation-1",
  mode: "single",
  preview: "请帮我看一下",
  priority: "medium",
  quietFor: "刚刚",
  unread: 3,
  updatedAt: "2026-05-07 09:00:00",
};

describe("ConversationCard", () => {
  it("keeps showing unread badges for active conversations until unread reaches zero", () => {
    render(
      <ConversationCard
        conversation={conversation}
        isActive
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("uses conversation state tokens for active conversations", () => {
    const { container } = render(
      <ConversationCard
        conversation={conversation}
        isActive
        onSelect={vi.fn()}
      />,
    );

    expect(container.firstElementChild).toHaveClass(
      "bg-conversation-active",
      "text-conversation-active-foreground",
    );
    expect(container.querySelector("[data-testid='conversation-preview']")).toHaveClass(
      "text-conversation-active-muted-foreground",
    );
    expect(container.querySelector("[data-testid='conversation-updated-at']")).toHaveClass(
      "text-conversation-active-muted-foreground",
    );
    const avatarFallback = container.querySelector(
      ".bg-conversation-active-foreground\\/20.text-conversation-active-foreground",
    );
    expect(avatarFallback).toBeInTheDocument();
    expect(avatarFallback).toHaveClass(
      "bg-conversation-active-foreground/20",
      "text-conversation-active-foreground",
    );
    expect(avatarFallback?.querySelector("svg")).toBeInTheDocument();
  });
});
