import { createRef } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  it("preserves the customer side panel flex layout while history is closed", async () => {
    const user = userEvent.setup();

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
    await user.click(within(preservedLayout).getByRole("tab", { name: "素材中心" }));
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

  it("shows a blank work area when no conversation is active", () => {
    render(
      <ChatPanel
        activeConversation={undefined}
        activeHistoryStatus="idle"
        canSendMessage={false}
        composerPlaceholder="输入消息"
        customerPanelWidth={375}
        draft=""
        fileUploadQueue={[]}
        groupMembers={[]}
        hasMoreHistory={false}
        historyPanel={undefined}
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

    expect(screen.getByText("请选择会话")).toBeInTheDocument();
    expect(screen.queryByTestId("chat-composer-editor")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "历史记录" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("customer-side-panel-shell")).not.toBeInTheDocument();
  });

  it("hides composer placeholder without blocking non-send composer actions in full custody", async () => {
    const user = userEvent.setup();
    const onCancelCustody = vi.fn();
    const onOpenHistory = vi.fn();

    render(
      <ChatPanel
        activeConversation={{
          ...createConversation(),
          custodyHostingStatus: "thinking",
          custodyMode: "full",
        }}
        activeHistoryStatus="idle"
        canSendMessage={false}
        isFullAutoActive
        composerPlaceholder="请输入消息……"
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
        onCancelCustody={onCancelCustody}
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
        onOpenHistory={onOpenHistory}
        onRefreshGroupMembers={vi.fn()}
        onRetryMessage={vi.fn()}
        onSendDraft={vi.fn()}
      />,
    );

    expect(screen.getByTestId("chat-custody-status-bar")).toHaveClass(
      "rounded-full",
    );
    expect(screen.getByTestId("chat-custody-status-bar-anchor")).toHaveClass(
      "absolute",
      "left-1/2",
      "bottom-12",
      "z-30",
      "w-4/5",
      "max-w-[520px]",
      "-translate-x-1/2",
    );
    expect(screen.getByTestId("chat-custody-status-bar-content")).toHaveClass(
      "relative",
      "z-10",
    );
    expect(screen.queryByTestId("chat-custody-composer-shell")).not.toBeInTheDocument();
    expect(screen.queryByTestId("chat-custody-composer-mask")).not.toBeInTheDocument();
    expect(screen.getByTestId("chat-composer-editor").closest(".px-4")).toHaveClass(
      "pt-3",
    );
    expect(screen.getByText(/正在思考/)).toBeInTheDocument();
    expect(screen.getByLabelText("请输入消息……")).toBeInTheDocument();
    expect(screen.queryByText("请输入消息……")).not.toBeInTheDocument();
    expect(screen.getByTestId("message-content").closest(".pb-12")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "选择 Enter 键行为" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "历史记录" }));
    await user.click(screen.getByRole("button", { name: "取消托管" }));

    expect(onOpenHistory).toHaveBeenCalledTimes(1);
    expect(onCancelCustody).toHaveBeenCalledTimes(1);
  });

  it("hides custody status bar for exited custody conversations", () => {
    render(
      <ChatPanel
        activeConversation={{
          ...createConversation(),
          custodyHostingStatus: "exited",
          custodyMode: "full",
        }}
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

    expect(screen.queryByTestId("chat-custody-status-bar-anchor")).not.toBeInTheDocument();
    expect(screen.queryByTestId("chat-custody-status-bar")).not.toBeInTheDocument();
  });

  it("shows the real full-auto button and removes the dev preview menu", () => {
    render(
      <ChatPanel
        activeConversation={{
          ...createConversation(),
          custodyMode: "full",
        }}
        activeHistoryStatus="idle"
        canEnableFullAuto
        canSendMessage
        isFullAutoActive
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
        onChangeFullAuto={vi.fn()}
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

    expect(screen.queryByRole("button", { name: "托管状态预览" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "AI托管" })).toBeEnabled();
  });

  it("keeps the full-auto button visible but disabled when full-auto cannot be enabled", () => {
    render(
      <ChatPanel
        activeConversation={createConversation()}
        activeHistoryStatus="idle"
        canEnableFullAuto={false}
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
        onChangeFullAuto={vi.fn()}
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

    expect(screen.getByRole("button", { name: "AI托管" })).toBeDisabled();
  });

  it("requests full-auto enable from the composer AI button", async () => {
    const user = userEvent.setup();
    const onChangeFullAuto = vi.fn();

    render(
      <ChatPanel
        activeConversation={createConversation()}
        activeHistoryStatus="idle"
        canEnableFullAuto
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
        onChangeFullAuto={onChangeFullAuto}
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

    await user.click(screen.getByRole("button", { name: "AI托管" }));

    expect(onChangeFullAuto).toHaveBeenCalledWith(true);
  });
});

function createConversation(): Conversation {
  return {
    accountId: "seat-1",
    customerAvatarUrl: "",
    customerId: "customer-1",
    customerName: "客户",
    id: "conversation-1",
    custodyMode: "semi",
    mode: "single",
    preview: "",
    priority: "medium",
    quietFor: "刚刚",
    unread: 0,
    updatedAt: "刚刚",
  };
}
