import { createRef } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChatPanel } from "@/pages/chat/components/chat-panel";
import type { Account, Conversation } from "@/pages/chat/chat-types";

const account: Account = {
  avatarUrl: "https://example.com/seat.png",
  description: "",
  fullAutoSwitch: true,
  id: "seat-1",
  metrics: {
    activeCustomers: 0,
    agents: 0,
    stores: 0,
    totalCustomers: 0,
  },
  name: "测试席位",
  operator: "测试席位",
  phone: "",
  seatAIHostingAuth: true,
  seatAIHostingEnabled: true,
  semiAutoAuth: true,
  semiAutoSwitch: true,
  tone: "",
};

describe("ChatPanel", () => {
  it("renders the customer side panel resize handle", () => {
    render(
      <ChatPanel
        activeAccount={account}
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

    expect(
      screen.getByRole("button", { name: "调整客户信息栏宽度" }),
    ).toBeInTheDocument();
  });

  it("keeps the customer side panel available while history is closed", async () => {
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

    expect(
      within(preservedLayout).getByRole("button", { name: "调整客户信息栏宽度" }),
    ).toBeInTheDocument();
    expect(within(preservedLayout).getByRole("complementary", { name: "客户信息栏" })).toBeInTheDocument();
    await user.click(within(preservedLayout).getByRole("tab", { name: "素材中心" }));
    expect(screen.getByTitle("素材中心扩展页")).toBeInTheDocument();
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

    expect(shell).toContainElement(historyPanel);
  });

  it("renders mobile history as a chat-detail overlay without the customer side shell", () => {
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
        isMobileLayout
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

    expect(screen.queryByTestId("customer-side-panel-shell")).not.toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "聊天记录" })).toBeInTheDocument();
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

  it("hides composer placeholder without blocking non-send composer actions in full agent mode", async () => {
    const user = userEvent.setup();
    const onCancelAgentHosting = vi.fn();
    const onOpenHistory = vi.fn();

    render(
      <ChatPanel
        activeConversation={{
          ...createConversation(),
          agentHostingStatus: "thinking",
          conversationAIHostingSwitch: true,
        }}
        activeHistoryStatus="idle"
        canSendMessage={false}
        conversationAIHostingEnabled
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
        onCancelAgentHosting={onCancelAgentHosting}
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

    expect(screen.getByTestId("chat-agent-hosting-status-bar")).toBeInTheDocument();
    expect(screen.getByTestId("chat-agent-hosting-status-bar-anchor")).toBeInTheDocument();
    expect(screen.getByTestId("chat-agent-hosting-status-bar-content")).toBeInTheDocument();
    expect(screen.queryByTestId("chat-agent-hosting-composer-shell")).not.toBeInTheDocument();
    expect(screen.queryByTestId("chat-agent-hosting-composer-mask")).not.toBeInTheDocument();
    expect(screen.getByTestId("chat-composer-editor")).toBeInTheDocument();
    expect(screen.getByText(/Agent 正在查看消息/)).toBeInTheDocument();
    expect(screen.getByLabelText("请输入消息……")).toBeInTheDocument();
    expect(screen.queryByText("请输入消息……")).not.toBeInTheDocument();
    expect(screen.getByTestId("message-content").closest(".pb-12")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "选择 Enter 键行为" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "历史记录" }));
    await user.click(screen.getByRole("button", { name: "取消托管" }));

    expect(onOpenHistory).toHaveBeenCalledTimes(1);
    expect(onCancelAgentHosting).toHaveBeenCalledTimes(1);
  });

  it("hides agent hosting status bar for exited agent mode conversations", () => {
    render(
      <ChatPanel
        activeConversation={{
          ...createConversation(),
          agentHostingStatus: "exited",
          conversationAIHostingSwitch: true,
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

    expect(screen.queryByTestId("chat-agent-hosting-status-bar-anchor")).not.toBeInTheDocument();
    expect(screen.queryByTestId("chat-agent-hosting-status-bar")).not.toBeInTheDocument();
  });

  it("shows the AI dialog configuration popover and removes the dev preview menu", async () => {
    const user = userEvent.setup();
    const onChangeSeatAgentMode = vi.fn();

    render(
      <ChatPanel
        activeAccount={account}
        activeConversation={{
          ...createConversation(),
          conversationAIHostingSwitch: true,
        }}
        activeHistoryStatus="idle"
        canConfigureSeatAIHosting
        canToggleConversationAIHosting
        canConfigureSeatSemiAuto
        canSendMessage
        seatAIHostingEnabled
        conversationAIHostingConfigured
        conversationAIHostingEnabled
        shouldShowConversationAIHostingControl
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
        onChangeSeatAgentMode={onChangeSeatAgentMode}
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
    const aiDialogButton = screen.getByRole("button", { name: "AI 对话" });
    expect(aiDialogButton).toBeEnabled();

    await user.click(aiDialogButton);

    expect(screen.getByText("测试席位")).toBeInTheDocument();
    expect(screen.getByText("切换 AI 模式")).toBeInTheDocument();
    expect(screen.getByText("会话托管")).toBeInTheDocument();
    expect(screen.getByText("仅影响此会话，开启后 Agent 将自动回复客户")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "切换 AI 模式" })).toBeInTheDocument();
    expect(screen.getByText("自动回复")).toBeInTheDocument();
    expect(screen.getByText("Agent 自动生成并发送消息，仅在必要时转人工")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "关闭当前会话托管" })).toBeEnabled();

    await user.click(screen.getByRole("combobox", { name: "切换 AI 模式" }));
    expect(screen.getByRole("option", { name: /关闭/ })).toHaveTextContent(
      "由人工客服独立承接，不开启 AI 辅助",
    );
    expect(screen.getByRole("option", { name: /话术推荐/ })).toHaveTextContent(
      "Agent 生成话术推荐，人工确认后发送",
    );
    expect(screen.getByRole("option", { name: /自动回复/ })).toHaveTextContent(
      "Agent 自动生成并发送消息，仅在必要时转人工",
    );
    await user.click(screen.getByRole("option", { name: /话术推荐/ }));

    expect(onChangeSeatAgentMode).toHaveBeenCalledWith("assistant");
  });

  it("hides the AI dialog button in group conversations without group AI reply auth", () => {
    render(
      <ChatPanel
        activeAccount={account}
        activeConversation={{
          ...createConversation(),
          mode: "group",
        }}
        activeHistoryStatus="idle"
        canConfigureSeatAIHosting
        canToggleConversationAIHosting={false}
        canConfigureSeatSemiAuto
        canSendMessage
        seatAIHostingEnabled
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

    expect(screen.queryByRole("button", { name: "AI 对话" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("AI 对话")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "历史记录" })).toBeInTheDocument();
  });

  it("shows a group AI popover with auto-reply switch when group AI reply auth is enabled", async () => {
    const user = userEvent.setup();
    const onChangeFullAuto = vi.fn();

    render(
      <ChatPanel
        activeAccount={{
          ...account,
          seatGroupAIHostingEnabled: true,
        }}
        activeConversation={{
          ...createConversation(),
          mode: "group",
        }}
        activeHistoryStatus="idle"
        canConfigureSeatAIHosting
        canToggleConversationAIHosting
        canConfigureSeatSemiAuto
        canSendMessage
        seatAIHostingEnabled
        shouldShowConversationAIHostingControl
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

    await user.click(screen.getByRole("button", { name: "AI 对话" }));

    expect(screen.getByTestId("group-ai-dialog-content")).toBeInTheDocument();
    expect(screen.getByText("测试席位")).toBeInTheDocument();
    expect(screen.getByText("AI自动回复")).toBeInTheDocument();
    expect(
      screen.getByText("开启后，当前企微号被@时，AI会自动处理"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("switch", { name: "AI自动回复" }));

    expect(onChangeFullAuto).toHaveBeenCalledWith(true);
    expect(
      screen.queryByTestId("chat-agent-hosting-status-bar"),
    ).not.toBeInTheDocument();
  });

  it("does not show the single-chat agent hosting status bar for group conversations", () => {
    render(
      <ChatPanel
        activeAccount={{
          ...account,
          seatGroupAIHostingEnabled: true,
        }}
        activeConversation={{
          ...createConversation(),
          agentHostingStatus: "thinking",
          conversationAIHostingSwitch: true,
          mode: "group",
        }}
        activeHistoryStatus="idle"
        canSendMessage
        canToggleConversationAIHosting
        conversationAIHostingEnabled
        conversationAIHostingConfigured
        shouldShowConversationAIHostingControl
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
        onChangeFullAuto={vi.fn()}
        onCancelAgentHosting={vi.fn()}
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

    expect(
      screen.queryByTestId("chat-agent-hosting-status-bar"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "AI 对话" })).toBeInTheDocument();
    expect(screen.getByTestId("chat-composer-editor")).toBeInTheDocument();
  });

  it("keeps the group AI entry visible but disabled when the conversation is not operable", async () => {
    const user = userEvent.setup();

    render(
      <ChatPanel
        activeAccount={{
          ...account,
          seatGroupAIHostingEnabled: true,
        }}
        activeConversation={{
          ...createConversation(),
          mode: "group",
        }}
        activeHistoryStatus="idle"
        canSendMessage={false}
        composerPlaceholder="当前账号未接管，暂时无法发送消息"
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
        shouldShowConversationAIHostingControl
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

    const aiDialogButton = screen.getByRole("button", { name: "AI 对话" });

    expect(aiDialogButton).toBeDisabled();
    await user.click(aiDialogButton);
    expect(screen.queryByTestId("group-ai-dialog-content")).not.toBeInTheDocument();
  });

  it("hides the AI dialog button in application-message conversations", () => {
    render(
      <ChatPanel
        activeAccount={account}
        activeConversation={{
          ...createConversation(),
          customerBindType: 2,
        }}
        activeHistoryStatus="idle"
        canConfigureSeatAIHosting
        canToggleConversationAIHosting
        canConfigureSeatSemiAuto
        canSendMessage
        seatAIHostingEnabled
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

    expect(screen.queryByRole("button", { name: "AI 对话" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "历史记录" })).toBeInTheDocument();
  });

  it("keeps the AI dialog button visible when full-auto cannot be enabled", async () => {
    const user = userEvent.setup();
    const onChangeFullAuto = vi.fn();
    const onChangeSeatAgentMode = vi.fn();

    render(
      <ChatPanel
        activeAccount={{
          ...account,
          fullAutoSwitch: false,
          seatAIHostingEnabled: false,
          semiAutoSwitch: true,
        }}
        activeConversation={createConversation()}
        activeHistoryStatus="idle"
        canConfigureSeatAIHosting
        canToggleConversationAIHosting={false}
        canConfigureSeatSemiAuto
        canSendMessage
        seatAIHostingEnabled={false}
        shouldShowConversationAIHostingControl
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
        onChangeSeatAgentMode={onChangeSeatAgentMode}
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

    await user.click(screen.getByRole("button", { name: "AI 对话" }));

    expect(screen.getByRole("combobox", { name: "切换 AI 模式" })).toBeEnabled();
    expect(screen.getByText("话术推荐")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "托管当前会话" })).toBeDisabled();
  });

  it("keeps auto-reply selectable without semi-auto auth", async () => {
    const user = userEvent.setup();
    const onChangeSeatAgentMode = vi.fn();

    render(
      <ChatPanel
        activeAccount={{
          ...account,
          fullAutoSwitch: false,
          seatAIHostingAuth: true,
          seatAIHostingEnabled: false,
          semiAutoAuth: false,
          semiAutoSwitch: false,
        }}
        activeConversation={createConversation()}
        activeHistoryStatus="idle"
        canConfigureSeatAIHosting
        canToggleConversationAIHosting={false}
        canConfigureSeatSemiAuto={false}
        canSendMessage
        seatAIHostingEnabled={false}
        shouldShowConversationAIHostingControl
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
        onChangeSeatAgentMode={onChangeSeatAgentMode}
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

    await user.click(screen.getByRole("button", { name: "AI 对话" }));
    await user.click(screen.getByRole("combobox", { name: "切换 AI 模式" }));

    expect(screen.getByRole("option", { name: /话术推荐/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("option", { name: /自动回复/ })).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );

    await user.click(screen.getByRole("option", { name: /自动回复/ }));

    expect(onChangeSeatAgentMode).toHaveBeenCalledWith("autoReply");
  });

  it("disables the AI dialog button when messages cannot be sent", async () => {
    const user = userEvent.setup();

    render(
      <ChatPanel
        activeAccount={account}
        activeConversation={createConversation()}
        activeHistoryStatus="idle"
        canConfigureSeatAIHosting
        canToggleConversationAIHosting
        canConfigureSeatSemiAuto
        canSendMessage={false}
        seatAIHostingEnabled
        shouldShowConversationAIHostingControl
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

    const aiDialogButton = screen.getByRole("button", { name: "AI 对话" });

    expect(aiDialogButton).toBeDisabled();
    await user.click(aiDialogButton);
    expect(screen.queryByText("切换 AI 模式")).not.toBeInTheDocument();
  });

  it("requests full-auto enable from the AI dialog current conversation button", async () => {
    const user = userEvent.setup();
    const onChangeFullAuto = vi.fn();

    render(
      <ChatPanel
        activeAccount={account}
        activeConversation={createConversation()}
        activeHistoryStatus="idle"
        canConfigureSeatAIHosting
        canToggleConversationAIHosting
        canConfigureSeatSemiAuto
        canSendMessage
        seatAIHostingEnabled
        shouldShowConversationAIHostingControl
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

    await user.click(screen.getByRole("button", { name: "AI 对话" }));
    await user.click(screen.getByRole("button", { name: "托管当前会话" }));

    expect(onChangeFullAuto).toHaveBeenCalledWith(true);
    expect(screen.queryByText("切换 AI 模式")).not.toBeInTheDocument();
  });

  it("shows a spinner on the current conversation hosting button while a full-auto change is pending", async () => {
    const user = userEvent.setup();
    const onChangeFullAuto = vi.fn();

    render(
      <ChatPanel
        activeConversation={createConversation()}
        activeHistoryStatus="idle"
        canConfigureSeatAIHosting
        canToggleConversationAIHosting
        canConfigureSeatSemiAuto
        canSendMessage
        seatAIHostingEnabled
        shouldShowConversationAIHostingControl
        composerPlaceholder="输入消息"
        customerPanelWidth={375}
        draft=""
        fileUploadQueue={[]}
        fullAutoActionPending
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

    const aiDialogButton = screen.getByRole("button", { name: "AI 对话" });

    expect(aiDialogButton).toBeEnabled();
    await user.click(aiDialogButton);
    const fullAutoButton = screen.getByRole("button", { name: "托管当前会话" });
    expect(fullAutoButton).toBeDisabled();
    expect(fullAutoButton.querySelector('[data-slot="spinner"]')).toBeInTheDocument();
    await user.click(fullAutoButton);
    expect(onChangeFullAuto).not.toHaveBeenCalled();
  });

  it("requests full-auto disable from the AI dialog current conversation button", async () => {
    const user = userEvent.setup();
    const onChangeFullAuto = vi.fn();

    render(
      <ChatPanel
        activeAccount={account}
        activeConversation={{
          ...createConversation(),
          agentHostingStatus: "thinking",
          conversationAIHostingSwitch: true,
        }}
        activeHistoryStatus="idle"
        canConfigureSeatAIHosting
        canToggleConversationAIHosting
        canConfigureSeatSemiAuto
        canSendMessage
        seatAIHostingEnabled
        conversationAIHostingConfigured
        conversationAIHostingEnabled
        shouldShowConversationAIHostingControl
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

    await user.click(screen.getByRole("button", { name: "AI 对话" }));
    await user.click(screen.getByRole("button", { name: "关闭当前会话托管" }));

    expect(onChangeFullAuto).toHaveBeenCalledWith(false);
  });

  it("renders the handoff reminder inside the chat column only", async () => {
    const user = userEvent.setup();
    const onMarkHandoffHandled = vi.fn();
    const onViewHandoffMessage = vi.fn();

    render(
      <ChatPanel
        activeAccount={account}
        activeConversation={{ ...createConversation(), handoffMsgId: "9001" }}
        activeHistoryStatus="idle"
        canMarkHandoffHandled
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
        onMarkHandoffHandled={onMarkHandoffHandled}
        onMessageViewportScroll={vi.fn()}
        onOpenHistory={vi.fn()}
        onRefreshGroupMembers={vi.fn()}
        onRetryMessage={vi.fn()}
        onSendDraft={vi.fn()}
        onViewHandoffMessage={onViewHandoffMessage}
      />,
    );

    const statusBar = screen.getByTestId("chat-handoff-status-bar");
    expect(statusBar.parentElement).toContainElement(
      screen.getByTestId("message-scroll-area"),
    );
    expect(within(statusBar.parentElement!).queryByText("基础信息")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "查看触发消息" }));
    await user.click(screen.getByRole("button", { name: "标记接管提醒已处理" }));

    expect(onViewHandoffMessage).toHaveBeenCalledTimes(1);
    expect(onMarkHandoffHandled).toHaveBeenCalledTimes(1);
  });
});

function createConversation(): Conversation {
  return {
    accountId: "seat-1",
    customerAvatarUrl: "",
    customerId: "customer-1",
    customerName: "客户",
    id: "conversation-1",
    conversationAIHostingSwitch: false,
    handoffMsgId: "0",
    customerBindType: 1,
    mode: "single",
    preview: "",
    priority: "medium",
    quietFor: "刚刚",
    unread: 0,
    updatedAt: "刚刚",
  };
}
