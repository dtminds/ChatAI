import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConversationCard } from "@/pages/chat/components/conversation-card";
import type { Conversation } from "@/pages/chat/chat-types";

const conversation: Conversation = {
  accountId: "account-1",
  conversationAIHostingSwitch: false,
  handoffMsgId: 0,
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
  it("defers offscreen avatar loading and falls back after an image error", () => {
    render(
      <ConversationCard
        conversation={conversation}
        isActive={false}
        onSelect={vi.fn()}
      />,
    );

    const avatar = screen.getByRole("img", {
      name: conversation.customerName,
    });
    expect(avatar).toHaveAttribute("loading", "lazy");
    expect(avatar).toHaveAttribute("decoding", "async");

    fireEvent.error(avatar);

    expect(
      screen.queryByRole("img", { name: conversation.customerName }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("conversation-avatar-fallback")).toBeInTheDocument();
  });

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

  it("caps numeric unread badges at 99+", () => {
    render(
      <ConversationCard
        conversation={{ ...conversation, unread: 120 }}
        isActive
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText("99+")).toBeInTheDocument();
    expect(screen.queryByText("120")).not.toBeInTheDocument();
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

  it("shows an AI badge on hosted conversations", () => {
    const { container } = render(
      <ConversationCard
        conversation={conversation}
        isActive={false}
        isAIHostingEnabled
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("AI托管")).toBeInTheDocument();
    expect(container.querySelector("[aria-label='AI托管'] svg")).toBeInTheDocument();
    expect(
      container.querySelector("[aria-label='AI托管'] [class*='mask-image']"),
    ).not.toBeInTheDocument();
  });

  it("shows a takeover reminder prefix when handoffMsgId is positive", () => {
    render(
      <ConversationCard
        conversation={{
          ...conversation,
          mode: "group",
          preview:
            "Agent 转人工处理：客户明确要求转人工，同时存在不满情绪，符合handoff规则",
          handoffMsgId: 9001,
        }}
        isActive={false}
        onSelect={vi.fn()}
      />,
    );

    expect(
      screen.getByTestId("conversation-handoff-takeover-prefix"),
    ).toHaveTextContent("[接管提醒]");
    expect(screen.getByTestId("conversation-preview")).toHaveTextContent(
      "[接管提醒]客户明确要求转人工，同时存在不满情绪，符合handoff规则",
    );
  });

  it("hides takeover reminder prefix when handoffMsgId is zero", () => {
    render(
      <ConversationCard
        conversation={{
          ...conversation,
          preview: "Agent 转人工处理：客户明确要求转人工",
          handoffMsgId: 0,
        }}
        isActive={false}
        onSelect={vi.fn()}
      />,
    );

    expect(
      screen.queryByTestId("conversation-handoff-takeover-prefix"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("conversation-preview")).toHaveTextContent(
      "Agent 转人工处理：客户明确要求转人工",
    );
  });

  it("prefers draft preview over the takeover reminder", () => {
    render(
      <ConversationCard
        composerDraft={{
          draft: "还没发出去",
          quotedMessage: null,
          segments: [{ text: "还没发出去", type: "text" }],
        }}
        conversation={{
          ...conversation,
          preview: "Agent 转人工处理：客户明确要求转人工",
          handoffMsgId: 9001,
        }}
        isActive={false}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByTestId("conversation-draft-prefix")).toHaveTextContent(
      "[草稿]",
    );
    expect(
      screen.queryByTestId("conversation-handoff-takeover-prefix"),
    ).not.toBeInTheDocument();
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

  it("opens the same conversation actions on right click without selecting the conversation", async () => {
    const user = userEvent.setup();
    const handlePin = vi.fn();
    const handleSelect = vi.fn();

    render(
      <ConversationCard
        conversation={conversation}
        isActive={false}
        onPin={handlePin}
        onSelect={handleSelect}
      />,
    );

    fireEvent.contextMenu(
      screen.getByTestId(`conversation-card-${conversation.id}`),
    );

    expect(
      await screen.findByRole("menuitem", { name: /置顶/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /标记已读/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /不显示/ }),
    ).toBeInTheDocument();
    expect(handleSelect).not.toHaveBeenCalled();

    await user.click(screen.getByRole("menuitem", { name: /置顶/ }));

    expect(handlePin).toHaveBeenCalledWith(conversation.id);
    expect(handleSelect).not.toHaveBeenCalled();
  });

  it("disables right-click conversation actions when actions are unavailable", async () => {
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

    fireEvent.contextMenu(
      screen.getByTestId(`conversation-card-${conversation.id}`),
    );

    const pinItem = await screen.findByRole("menuitem", { name: /置顶/ });
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
