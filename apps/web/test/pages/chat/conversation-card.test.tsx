import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConversationCard } from "@/pages/chat/components/conversation-card";
import type { Conversation } from "@/pages/chat/chat-types";

const conversation: Conversation = {
  accountId: "account-1",
  conversationAIHostingSwitch: false,
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
  });

  it("renders takeover reminder previews with a separate label and body", () => {
    render(
      <ConversationCard
        conversation={{
          ...conversation,
          preview: "[接管提醒]请及时接管",
          previewParts: [
            {
              kind: "takeover-reminder",
              text: "[接管提醒]",
              tone: "danger",
            },
            {
              text: "请及时接管",
            },
          ],
        }}
        isActive={false}
        onSelect={vi.fn()}
      />,
    );

    const preview = screen.getByTestId("conversation-preview");

    expect(
      within(preview).getByTestId("conversation-preview-part-takeover-reminder"),
    ).toHaveTextContent("[接管提醒]");
    expect(
      within(preview).getByTestId("conversation-preview-part-1"),
    ).toHaveTextContent("请及时接管");
    expect(preview).toHaveTextContent("[接管提醒]请及时接管");
  });

  it("does not render takeover reminder labels without the preview marker", () => {
    render(
      <ConversationCard
        conversation={{
          ...conversation,
          preview: "[接管提醒]，请及时接管",
        }}
        isActive={false}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByTestId("conversation-preview")).toHaveTextContent(
      "[接管提醒]，请及时接管",
    );
    expect(
      screen.queryByTestId("conversation-preview-part-takeover-reminder"),
    ).not.toBeInTheDocument();
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

  it("shows a red takeover reminder prefix when waitManual is true", () => {
    render(
      <ConversationCard
        conversation={{
          ...conversation,
          mode: "group",
          preview:
            "Agent 转人工处理：客户明确要求转人工，同时存在不满情绪，符合handoff规则",
          waitManual: true,
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

  it("hides takeover reminder prefix when waitManual is false", () => {
    render(
      <ConversationCard
        conversation={{
          ...conversation,
          preview: "Agent 转人工处理：客户明确要求转人工",
          waitManual: false,
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

  it("prefers draft preview over waitManual takeover reminder", () => {
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
          waitManual: true,
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
