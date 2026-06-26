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

  it("hides composer placeholder without blocking non-send composer actions in full agent mode", async () => {
    const user = userEvent.setup();
    const onCancelAgentHosting = vi.fn();
    const onOpenHistory = vi.fn();

    render(
      <ChatPanel
        activeConversation={{
          ...createConversation(),
          agentHostingStatus: "thinking",
          agentMode: "full",
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

    expect(screen.getByTestId("chat-agent-hosting-status-bar")).toHaveClass(
      "rounded-full",
    );
    expect(screen.getByTestId("chat-agent-hosting-status-bar-anchor")).toHaveClass(
      "absolute",
      "left-1/2",
      "bottom-12",
      "z-30",
      "w-4/5",
      "max-w-[520px]",
      "-translate-x-1/2",
    );
    expect(screen.getByTestId("chat-agent-hosting-status-bar-content")).toHaveClass(
      "relative",
      "z-10",
    );
    expect(screen.queryByTestId("chat-agent-hosting-composer-shell")).not.toBeInTheDocument();
    expect(screen.queryByTestId("chat-agent-hosting-composer-mask")).not.toBeInTheDocument();
    expect(screen.getByTestId("chat-composer-editor").closest(".px-4")).toHaveClass(
      "pt-3",
    );
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
          agentMode: "full",
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
        activeConversation={{
          ...createConversation(),
          agentMode: "full",
        }}
        activeHistoryStatus="idle"
        canConfigureFullAuto
        canEnableFullAuto
        canConfigureSemiAuto
        canSendMessage
        isFullAutoAvailable
        isSemiAutoAvailable
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

    expect(screen.getByText("AI 对话配置")).toBeInTheDocument();
    expect(screen.getByText("辅助模式")).toBeInTheDocument();
    expect(screen.getByText("Agent 生成话术推荐，人工确认后发送")).toBeInTheDocument();
    expect(screen.getByText("托管模式")).toBeInTheDocument();
    expect(screen.getByText("Agent 自动生成并发送消息，仅在必要时转人工")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "关闭当前会话托管" })).toBeEnabled();

    await user.click(screen.getByRole("switch", { name: "辅助模式" }));

    expect(onChangeSeatAgentMode).toHaveBeenCalledWith("semi", false);
  });

  it("keeps the AI dialog button visible when full-auto cannot be enabled", async () => {
    const user = userEvent.setup();
    const onChangeFullAuto = vi.fn();
    const onChangeSeatAgentMode = vi.fn();

    render(
      <ChatPanel
        activeConversation={createConversation()}
        activeHistoryStatus="idle"
        canConfigureFullAuto
        canEnableFullAuto={false}
        canConfigureSemiAuto
        canSendMessage
        isFullAutoAvailable={false}
        isSemiAutoAvailable
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

    expect(screen.getByRole("switch", { name: "辅助模式" })).toBeEnabled();
    expect(screen.getByRole("switch", { name: "托管模式" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "开启当前会话托管" })).toBeDisabled();
  });

  it("disables the AI dialog button when messages cannot be sent", async () => {
    const user = userEvent.setup();

    render(
      <ChatPanel
        activeConversation={createConversation()}
        activeHistoryStatus="idle"
        canConfigureFullAuto
        canEnableFullAuto
        canConfigureSemiAuto
        canSendMessage={false}
        isFullAutoAvailable
        isSemiAutoAvailable
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
    expect(screen.queryByText("AI 对话配置")).not.toBeInTheDocument();
  });

  it("requests full-auto enable from the AI dialog current conversation button", async () => {
    const user = userEvent.setup();
    const onChangeFullAuto = vi.fn();

    render(
      <ChatPanel
        activeConversation={createConversation()}
        activeHistoryStatus="idle"
        canConfigureFullAuto
        canEnableFullAuto
        canConfigureSemiAuto
        canSendMessage
        isFullAutoAvailable
        isSemiAutoAvailable
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
    await user.click(screen.getByRole("button", { name: "开启当前会话托管" }));

    expect(onChangeFullAuto).toHaveBeenCalledWith(true);
    expect(screen.queryByText("AI 对话配置")).not.toBeInTheDocument();
  });

  it("shows a spinner on the current conversation hosting button while a full-auto change is pending", async () => {
    const user = userEvent.setup();
    const onChangeFullAuto = vi.fn();

    render(
      <ChatPanel
        activeConversation={createConversation()}
        activeHistoryStatus="idle"
        canConfigureFullAuto
        canEnableFullAuto
        canConfigureSemiAuto
        canSendMessage
        isFullAutoAvailable
        isSemiAutoAvailable
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
    const fullAutoButton = screen.getByRole("button", { name: "开启当前会话托管" });
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
        activeConversation={{
          ...createConversation(),
          agentHostingStatus: "thinking",
          agentMode: "full",
        }}
        activeHistoryStatus="idle"
        canConfigureFullAuto
        canEnableFullAuto
        canConfigureSemiAuto
        canSendMessage
        isFullAutoAvailable
        isSemiAutoAvailable
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
});

function createConversation(): Conversation {
  return {
    accountId: "seat-1",
    customerAvatarUrl: "",
    customerId: "customer-1",
    customerName: "客户",
    id: "conversation-1",
    agentMode: "semi",
    mode: "single",
    preview: "",
    priority: "medium",
    quietFor: "刚刚",
    unread: 0,
    updatedAt: "刚刚",
  };
}
