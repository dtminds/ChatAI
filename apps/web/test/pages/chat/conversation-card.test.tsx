import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConversationCard } from "@/pages/chat/components/conversation-card";
import type { Conversation } from "@/pages/chat/chat-types";

const conversation: Conversation = {
  accountId: "account-1",
  agentMode: "semi",
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
  it("shows draft preview for saved composer drafts", () => {
    render(
      <ConversationCard
        composerDraft={{
          draft: "还没发出去",
          quotedMessage: null,
          segments: [{ text: "还没发出去", type: "text" }],
        }}
        conversation={conversation}
        isActive={false}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByTestId("conversation-preview")).toHaveTextContent(
      "[草稿]还没发出去",
    );
    expect(screen.getByTestId("conversation-draft-prefix")).toHaveClass(
      "text-destructive",
    );
  });

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

  it("does not render an epoch date when a conversation has no message time", () => {
    render(
      <ConversationCard
        conversation={{
          ...conversation,
          preview: "",
          updatedAt: "",
          updatedAtMs: undefined,
        }}
        isActive
        onSelect={vi.fn()}
      />,
    );

    expect(screen.queryByText("1970/01/01")).not.toBeInTheDocument();
    expect(screen.getByTestId("conversation-updated-at")).toBeEmptyDOMElement();
  });

  it("does not render a group badge on group conversation cards", () => {
    render(
      <ConversationCard
        conversation={{
          ...conversation,
          customerName: "测试群002",
          mode: "group",
          unread: 0,
        }}
        isActive
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText("测试群002")).toBeInTheDocument();
    expect(screen.queryByText("群")).not.toBeInTheDocument();
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

  it("uses the standard customer fallback icon instead of initials", () => {
    const { container } = render(
      <ConversationCard
        conversation={{
          ...conversation,
          customerAvatarUrl: "",
          customerName: "测试客户",
        }}
        isActive={false}
        onSelect={vi.fn()}
      />,
    );

    const avatarFallback = container.querySelector("[data-testid='conversation-avatar-fallback']");
    expect(avatarFallback).toBeInTheDocument();
    expect(avatarFallback).toHaveTextContent("");
    expect(avatarFallback?.querySelector("svg")).toBeInTheDocument();
  });

  it("shows mark-read for unread conversations and mark-unread for read conversations", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <ConversationCard
        conversation={conversation}
        isActive
        onMarkRead={vi.fn()}
        onMarkUnread={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "会话操作" }));

    expect(screen.getByRole("menuitem", { name: /标记已读/ })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /标记未读/ })).not.toBeInTheDocument();

    await user.keyboard("{Escape}");
    rerender(
      <ConversationCard
        conversation={{ ...conversation, unread: 0 }}
        isActive
        onMarkRead={vi.fn()}
        onMarkUnread={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "会话操作" }));

    expect(screen.getByRole("menuitem", { name: /标记未读/ })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /标记已读/ })).not.toBeInTheDocument();
  });

  it("disables conversation action items when actions are unavailable", async () => {
    const user = userEvent.setup();
    const handleDelete = vi.fn();
    const handleMarkRead = vi.fn();
    const handlePin = vi.fn();

    render(
      <ConversationCard
        conversation={conversation}
        isActionDisabled
        isActive
        onDelete={handleDelete}
        onMarkRead={handleMarkRead}
        onPin={handlePin}
        onSelect={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "会话操作" }));

    const pinItem = screen.getByRole("menuitem", { name: /置顶/ });
    const markReadItem = screen.getByRole("menuitem", { name: /标记已读/ });
    const deleteItem = screen.getByRole("menuitem", { name: /不显示/ });

    expect(pinItem).toHaveAttribute("aria-disabled", "true");
    expect(markReadItem).toHaveAttribute("aria-disabled", "true");
    expect(deleteItem).toHaveAttribute("aria-disabled", "true");

    await user.click(pinItem);
    await user.click(markReadItem);
    await user.click(deleteItem);

    expect(handlePin).not.toHaveBeenCalled();
    expect(handleMarkRead).not.toHaveBeenCalled();
    expect(handleDelete).not.toHaveBeenCalled();
  });
});
