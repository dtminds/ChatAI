import { createRef } from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChatPanel } from "@/pages/chat/components/chat-panel";
import type { Conversation } from "@/pages/chat/chat-types";

describe("ChatPanel", () => {
  it("keeps the customer side panel shell in the main layout width", () => {
    render(
      <ChatPanel
        activeConversation={createConversation()}
        activeHistoryStatus="idle"
        canSendMessage
        composerPlaceholder="输入消息"
        customerPanelWidth={375}
        draft=""
        fileUploadQueue={[]}
        groupMembers={[]}
        hasMoreHistory={false}
        historyPanel={{ activeHistoryFilters: { scope: "all" }, activeHistoryLoading: false, isOpen: false }}
        inputEnterBehavior="send"
        isHistoryPanelOpen={false}
        isConversationLoading={false}
        isEmojiPickerOpen={false}
        isGroupMembersLoading={false}
        isResizingCustomerPanel={false}
        isSendingDraft={false}
        messages={[]}
        quotedMessage={null}
        sidebarItems={[]}
        composerRef={createRef()}
        messageViewportRef={createRef()}
        workbenchBodyRef={createRef()}
        onCancelFileUpload={vi.fn()}
        onClearQuotedMessage={vi.fn()}
        onComposerSegmentsChange={vi.fn()}
        onCustomerPanelResizeStart={vi.fn()}
        onDismissScopeTransitionError={vi.fn()}
        onDraftChange={vi.fn()}
        onEmojiPickerOpenChange={vi.fn()}
        onEnterBehaviorChange={vi.fn()}
        onFileSelect={vi.fn()}
        onHistoryClose={vi.fn()}
        onHistoryLoadMoreNext={vi.fn()}
        onHistoryLoadMorePrev={vi.fn()}
        onHistoryRefresh={vi.fn()}
        onHistorySetDay={vi.fn()}
        onHistorySetScope={vi.fn()}
        onHistorySetSenderId={vi.fn()}
        onLoadOlderMessages={vi.fn()}
        onMessageViewportScroll={vi.fn()}
        onOpenHistory={vi.fn()}
        onRefreshGroupMembers={vi.fn()}
        onRetryMessage={vi.fn()}
        onSendDraft={vi.fn()}
      />,
    );

    expect(screen.getByTestId("customer-side-panel-shell")).toHaveStyle({
      width: "379px",
    });
    expect(
      screen.getByRole("button", { name: "调整客户信息栏宽度" }),
    ).toBeInTheDocument();
  });

  it("preserves the customer side panel flex layout while history is closed", () => {
    render(
      <ChatPanel
        activeConversation={createConversation()}
        activeHistoryStatus="idle"
        canSendMessage
        composerPlaceholder="输入消息"
        customerPanelWidth={375}
        draft=""
        fileUploadQueue={[]}
        groupMembers={[]}
        hasMoreHistory={false}
        historyPanel={{ activeHistoryFilters: { scope: "all" }, activeHistoryLoading: false, isOpen: false }}
        inputEnterBehavior="send"
        isHistoryPanelOpen={false}
        isConversationLoading={false}
        isEmojiPickerOpen={false}
        isGroupMembersLoading={false}
        isResizingCustomerPanel={false}
        isSendingDraft={false}
        messages={[]}
        quotedMessage={null}
        sidebarItems={[
          {
            bindTypes: ["1", "2"],
            id: "assets",
            name: "素材中心",
            sort: 1,
            status: "active",
            url: "https://example.com/assets",
          },
        ]}
        composerRef={createRef()}
        messageViewportRef={createRef()}
        workbenchBodyRef={createRef()}
        onCancelFileUpload={vi.fn()}
        onClearQuotedMessage={vi.fn()}
        onComposerSegmentsChange={vi.fn()}
        onCustomerPanelResizeStart={vi.fn()}
        onDismissScopeTransitionError={vi.fn()}
        onDraftChange={vi.fn()}
        onEmojiPickerOpenChange={vi.fn()}
        onEnterBehaviorChange={vi.fn()}
        onFileSelect={vi.fn()}
        onHistoryClose={vi.fn()}
        onHistoryLoadMoreNext={vi.fn()}
        onHistoryLoadMorePrev={vi.fn()}
        onHistoryRefresh={vi.fn()}
        onHistorySetDay={vi.fn()}
        onHistorySetScope={vi.fn()}
        onHistorySetSenderId={vi.fn()}
        onLoadOlderMessages={vi.fn()}
        onMessageViewportScroll={vi.fn()}
        onOpenHistory={vi.fn()}
        onRefreshGroupMembers={vi.fn()}
        onRetryMessage={vi.fn()}
        onSendDraft={vi.fn()}
      />,
    );

    const shell = screen.getByTestId("customer-side-panel-shell");
    const preservedLayout = within(shell).getByTestId("customer-side-panel-layout");

    expect(preservedLayout).toHaveClass("flex", "h-full", "min-h-0", "shrink-0");
    expect(
      within(preservedLayout).getByRole("button", { name: "调整客户信息栏宽度" }),
    ).toBeInTheDocument();
    expect(within(preservedLayout).getByRole("complementary", { name: "客户信息栏" })).toHaveStyle({
      width: "375px",
    });
    expect(screen.getByTitle("素材中心扩展页").parentElement).toHaveClass("h-full");
  });

  it("renders history in the current customer side panel slot", () => {
    render(
      <ChatPanel
        activeConversation={createConversation()}
        activeHistoryStatus="idle"
        canSendMessage
        composerPlaceholder="输入消息"
        customerPanelWidth={375}
        draft=""
        fileUploadQueue={[]}
        groupMembers={[]}
        hasMoreHistory={false}
        historyPanel={{
          activeHistory: { hasNext: false, hasPrev: false, messages: [] },
          activeHistoryFilters: { scope: "all" },
          activeHistoryLoading: false,
          isOpen: true,
        }}
        inputEnterBehavior="send"
        isHistoryPanelOpen
        isConversationLoading={false}
        isEmojiPickerOpen={false}
        isGroupMembersLoading={false}
        isResizingCustomerPanel={false}
        isSendingDraft={false}
        messages={[]}
        quotedMessage={null}
        sidebarItems={[]}
        composerRef={createRef()}
        messageViewportRef={createRef()}
        workbenchBodyRef={createRef()}
        onCancelFileUpload={vi.fn()}
        onClearQuotedMessage={vi.fn()}
        onComposerSegmentsChange={vi.fn()}
        onCustomerPanelResizeStart={vi.fn()}
        onDismissScopeTransitionError={vi.fn()}
        onDraftChange={vi.fn()}
        onEmojiPickerOpenChange={vi.fn()}
        onEnterBehaviorChange={vi.fn()}
        onFileSelect={vi.fn()}
        onHistoryClose={vi.fn()}
        onHistoryLoadMoreNext={vi.fn()}
        onHistoryLoadMorePrev={vi.fn()}
        onHistoryRefresh={vi.fn()}
        onHistorySetDay={vi.fn()}
        onHistorySetScope={vi.fn()}
        onHistorySetSenderId={vi.fn()}
        onLoadOlderMessages={vi.fn()}
        onMessageViewportScroll={vi.fn()}
        onOpenHistory={vi.fn()}
        onRefreshGroupMembers={vi.fn()}
        onRetryMessage={vi.fn()}
        onSendDraft={vi.fn()}
      />,
    );

    const shell = screen.getByTestId("customer-side-panel-shell");
    const historyPanel = within(shell).getByRole("complementary", { name: "聊天记录" });

    expect(shell).toHaveStyle({ width: "379px" });
    expect(historyPanel).toHaveClass("absolute", "inset-0", "w-full");
    expect(historyPanel).not.toHaveClass("w-[420px]");
    expect(historyPanel.className).not.toContain("shadow");
  });
});

function createConversation(): Conversation {
  return {
    accountId: "seat-1",
    customerAvatarUrl: "",
    customerId: "customer-1",
    customerName: "客户",
    id: "conversation-1",
    mode: "single",
    preview: "",
    priority: "medium",
    quietFor: "刚刚",
    unread: 0,
    updatedAt: "刚刚",
  };
}
