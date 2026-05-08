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
});
