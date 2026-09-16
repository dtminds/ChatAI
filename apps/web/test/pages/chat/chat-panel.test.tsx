import { createRef, type ReactNode, useState } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CONTROLLED_TEXT_INSERTION_COMMAND,
  type LexicalEditor,
} from "lexical";
import { ChatPanel } from "@/pages/chat/components/chat-panel";
import type { ChatAIAssistantAction } from "@/pages/chat/components/chat-ai-assistant-status-bar";
import { INSERT_COMPOSER_TEXT_COMMAND } from "@/pages/chat/components/composer/lexical-commands";
import { checkSmartReplyTextModeration } from "@/pages/chat/api/workbench-gateway";
import type { Account, ChatMessage, Conversation } from "@/pages/chat/chat-types";
import { useWorkbenchStore } from "@/store/workbench-store";

vi.mock("@/pages/chat/api/workbench-gateway", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/pages/chat/api/workbench-gateway")>();

  return {
    ...actual,
    checkSmartReplyTextModeration: vi.fn(),
  };
});

vi.mock("@/pages/chat/ai-hosting/api/user-memory-service", () => ({
  createUserMemoryItem: vi.fn(),
  deleteUserMemoryItem: vi.fn(),
  getUserMemoryCustomer: vi.fn().mockResolvedValue({
    customerName: "客户",
    items: [],
    platform: 5,
    thirdExternalUserId: "external-1",
    version: 0,
  }),
  getUserMemoryEvidence: vi.fn(),
  updateUserMemoryItem: vi.fn(),
}));

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
  beforeEach(() => {
    window.localStorage.clear();
    useWorkbenchStore.setState(useWorkbenchStore.getInitialState(), true);
  });

  afterEach(() => {
    vi.mocked(checkSmartReplyTextModeration).mockReset();
    vi.useRealTimers();
  });

  it("truncates typed, IME, and dropped composer text to the remaining space", async () => {
    const composerRef = createRef<LexicalEditor>();
    const existingText = "字".repeat(994);

    render(
      <ChatPanel
        activeAccount={account}
        activeConversation={createConversation()}
        activeHistoryStatus="idle"
        canSendMessage
        composerPlaceholder="输入消息"
        customerPanelWidth={375}
        fileUploadQueue={[]}
        groupMembers={[]}
        hasMoreHistory={false}
        historyPanel={{ activeHistoryFilters: { scope: "all" }, activeHistoryLoading: false }}
        inputEnterBehavior="send"
        isConversationLoading={false}
        isEmojiPickerOpen={false}
        isGroupMembersLoading={false}
        isResizingCustomerPanel={false}
        isSendingDraft={false}
        messages={[]}
        quotedMessage={null}
        sidebarItems={[]}
        composerRef={composerRef}
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

    await waitFor(() => {
      expect(composerRef.current).not.toBeNull();
    });

    act(() => {
      composerRef.current?.dispatchCommand(
        INSERT_COMPOSER_TEXT_COMMAND,
        existingText,
      );
      composerRef.current?.dispatchCommand(
        CONTROLLED_TEXT_INSERTION_COMMAND,
        "甲乙",
      );
      composerRef.current?.dispatchCommand(
        CONTROLLED_TEXT_INSERTION_COMMAND,
        new InputEvent("beforeinput", {
          data: "丙丁",
          inputType: "insertFromComposition",
        }),
      );

      const dropEvent = new InputEvent("beforeinput", {
        inputType: "insertFromDrop",
      });
      Object.defineProperty(dropEvent, "dataTransfer", {
        value: {
          getData: (type: string) =>
            type === "text/plain" ? "戊己庚辛" : "",
        },
      });
      composerRef.current?.dispatchCommand(
        CONTROLLED_TEXT_INSERTION_COMMAND,
        dropEvent,
      );
    });

    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "输入消息" })).toHaveTextContent(
        `${existingText}甲乙丙丁戊己`,
      );
    });
  });

  it("isolates composer undo history when the active conversation changes", async () => {
    const user = userEvent.setup();
    const composerRef = createRef<LexicalEditor>();

    function renderPanel(conversationId: string) {
      return (
        <ChatPanel
          activeAccount={account}
          activeConversation={{ ...createConversation(), id: conversationId }}
          activeHistoryStatus="idle"
          canSendMessage
          composerPlaceholder="输入消息"
          customerPanelWidth={375}
          fileUploadQueue={[]}
          groupMembers={[]}
          hasMoreHistory={false}
          historyPanel={{ activeHistoryFilters: { scope: "all" }, activeHistoryLoading: false }}
          inputEnterBehavior="send"
          isConversationLoading={false}
          isEmojiPickerOpen={false}
          isGroupMembersLoading={false}
          isResizingCustomerPanel={false}
          isSendingDraft={false}
          messages={[]}
          quotedMessage={null}
          sidebarItems={[]}
          composerRef={composerRef}
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
        />
      );
    }

    const { rerender } = render(renderPanel("conversation-a"));
    const textbox = screen.getByRole("textbox", { name: "输入消息" });

    await user.click(textbox);
    await user.paste("会话 A 草稿");
    await waitFor(() => expect(textbox).toHaveTextContent("会话 A 草稿"));

    rerender(renderPanel("conversation-b"));
    expect(screen.getByRole("textbox", { name: "输入消息" })).toBe(textbox);

    await user.click(textbox);
    await user.keyboard("{Control>}a{/Control}");
    await user.paste("会话 B 草稿");
    await waitFor(() => expect(textbox).toHaveTextContent("会话 B 草稿"));

    fireEvent.keyDown(textbox, {
      code: "KeyZ",
      ctrlKey: true,
      key: "z",
    });

    await waitFor(() => {
      expect(textbox).toHaveTextContent("会话 B 草稿");
      expect(textbox).not.toHaveTextContent("会话 A 草稿");
    });
  });

  it("runs header actions for the active conversation and toggles the desktop sidebar", async () => {
    const user = userEvent.setup();
    const onPinConversation = vi.fn();
    const onPersistentSidebarChange = vi.fn();
    const onQuickReplyActiveChange = vi.fn();

    const panel = (
      <ChatPanel
        activeAccount={account}
        activeConversation={{
          ...createConversation(),
          thirdExternalUserId: "external-1",
        }}
        activeHistoryStatus="idle"
        canSendMessage
        composerPlaceholder="输入消息"
        customerPanelWidth={375}
        fileUploadQueue={[]}
        groupMembers={[]}
        hasMoreHistory={false}
        historyPanel={{ activeHistoryFilters: { scope: "all" }, activeHistoryLoading: false }}
        inputEnterBehavior="send"
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
        onPersistentSidebarChange={onPersistentSidebarChange}
        onPinConversation={onPinConversation}
        onQuickReplyActiveChange={onQuickReplyActiveChange}
        onRefreshGroupMembers={vi.fn()}
        onRetryMessage={vi.fn()}
        onSendDraft={vi.fn()}
      />
    );
    const { unmount } = render(panel);

    expect(onPersistentSidebarChange).toHaveBeenLastCalledWith(true);

    await user.click(screen.getByRole("button", { name: "更多会话操作" }));
    await user.click(screen.getByRole("menuitem", { name: "置顶" }));
    expect(onPinConversation).toHaveBeenCalledWith("conversation-1");

    expect(screen.getByTestId("customer-side-panel-shell")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "折叠侧边栏" }));
    expect(screen.queryByTestId("customer-side-panel-shell")).not.toBeInTheDocument();
    expect(onPersistentSidebarChange).toHaveBeenLastCalledWith(false);
    expect(onQuickReplyActiveChange).toHaveBeenCalledWith(false);
    expect(
      window.localStorage.getItem("chatai.workbenchSidebarCollapsed"),
    ).toBe("true");

    expect(screen.queryByTestId("user-memory-reserved-rail")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "客户记忆" }));
    expect(screen.getByTestId("user-memory-reserved-rail")).toBeInTheDocument();
    expect(onPersistentSidebarChange).toHaveBeenLastCalledWith(true);
    await user.click(screen.getByRole("button", { name: "客户记忆" }));
    expect(screen.queryByTestId("user-memory-reserved-rail")).not.toBeInTheDocument();
    expect(onPersistentSidebarChange).toHaveBeenLastCalledWith(false);

    unmount();
    render(panel);

    expect(screen.queryByTestId("customer-side-panel-shell")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "展开侧边栏" }));
    expect(screen.getByTestId("customer-side-panel-shell")).toBeInTheDocument();
    expect(onPersistentSidebarChange).toHaveBeenLastCalledWith(true);
    expect(
      window.localStorage.getItem("chatai.workbenchSidebarCollapsed"),
    ).toBe("false");
  });

  it("opens the mobile sidebar sheet from the persistent header button", async () => {
    const user = userEvent.setup();

    render(
      <ChatPanel
        activeAccount={account}
        activeConversation={createConversation()}
        activeHistoryStatus="idle"
        canSendMessage
        composerPlaceholder="输入消息"
        customerPanelWidth={375}
        fileUploadQueue={[]}
        groupMembers={[]}
        hasMoreHistory={false}
        historyPanel={{ activeHistoryFilters: { scope: "all" }, activeHistoryLoading: false }}
        inputEnterBehavior="send"
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
        onBackToConversationList={vi.fn()}
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

    await user.click(screen.getByRole("button", { name: "展开侧边栏" }));

    expect(screen.getByRole("complementary", { name: "客户信息栏" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "关闭" })).toBeInTheDocument();
  });

  it("renders the customer side panel resize handle", () => {
    render(
      <ChatPanel
        activeAccount={account}
        activeConversation={createConversation()}
        activeHistoryStatus="idle"
        canSendMessage
        composerPlaceholder="输入消息"
        customerPanelWidth={375}
        fileUploadQueue={[]}
        groupMembers={[]}
        hasMoreHistory={false}
        historyPanel={{ activeHistoryFilters: { scope: "all" }, activeHistoryLoading: false }}
        inputEnterBehavior="send"
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
        fileUploadQueue={[]}
        groupMembers={[]}
        hasMoreHistory={false}
        historyPanel={{ activeHistoryFilters: { scope: "all" }, activeHistoryLoading: false }}
        inputEnterBehavior="send"
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
        fileUploadQueue={[]}
        groupMembers={[]}
        hasMoreHistory={false}
        historyPanel={{
          activeHistory: { hasNext: false, hasPrev: false, messages: [] },
          activeHistoryFilters: { scope: "all" },
          activeHistoryLoading: false,
        }}
        inputEnterBehavior="send"
        activeAuxiliaryPanel="history"
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

  it("switches tickets and history in the shared auxiliary panel slot", async () => {
    const user = userEvent.setup();

    function TestPanel() {
      const [activeAuxiliaryPanel, setActiveAuxiliaryPanel] = useState<
        "history" | "tickets" | null
      >(null);

      return (
        <ChatPanel
          activeAuxiliaryPanel={activeAuxiliaryPanel}
          activeConversation={createConversation()}
          activeHistoryStatus="idle"
          canSendMessage
          composerPlaceholder="输入消息"
          customerPanelWidth={375}
          fileUploadQueue={[]}
          groupMembers={[]}
          hasMoreHistory={false}
          historyPanel={{
            activeHistory: { hasNext: false, hasPrev: false, messages: [] },
            activeHistoryFilters: { scope: "all" },
            activeHistoryLoading: false,
          }}
          inputEnterBehavior="send"
          isConversationLoading={false}
          isEmojiPickerOpen={false}
          isGroupMembersLoading={false}
          isResizingCustomerPanel={false}
          isSendingDraft={false}
          messages={[]}
          quotedMessage={null}
          sidebarItems={[]}
          ticketPanel={<div>工单列表内容</div>}
          composerRef={createRef()}
          messageViewportRef={createRef()}
          workbenchBodyRef={createRef()}
          onAuxiliaryPanelClose={() => setActiveAuxiliaryPanel(null)}
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
          onOpenHistory={() =>
            setActiveAuxiliaryPanel((current) =>
              current === "history" ? null : "history",
            )
          }
          onRefreshGroupMembers={vi.fn()}
          onRetryMessage={vi.fn()}
          onSendDraft={vi.fn()}
          onToggleTickets={() =>
            setActiveAuxiliaryPanel((current) =>
              current === "tickets" ? null : "tickets",
            )
          }
        />
      );
    }

    render(<TestPanel />);

    expect(screen.queryByRole("tab", { name: "工单" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "折叠侧边栏" }));
    expect(screen.queryByTestId("customer-side-panel-shell")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "工单" }));
    expect(screen.getByTestId("customer-side-panel-shell")).toBeInTheDocument();
    expect(
      window.localStorage.getItem("chatai.workbenchSidebarCollapsed"),
    ).toBe("false");
    expect(
      screen.getByRole("complementary", { name: "工单" }),
    ).toBeInTheDocument();
    expect(screen.getByText("工单列表内容")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "历史记录" }));
    expect(
      screen.queryByRole("complementary", { name: "工单" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("complementary", { name: "聊天记录" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "关闭聊天记录" }));
    expect(
      screen.queryByRole("complementary", { name: "聊天记录" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("complementary", { name: "客户信息栏" }),
    ).toBeInTheDocument();
  });

  it("renders mobile history as a chat-detail overlay without the customer side shell", () => {
    render(
      <ChatPanel
        activeConversation={createConversation()}
        activeHistoryStatus="idle"
        canSendMessage
        composerPlaceholder="输入消息"
        customerPanelWidth={375}
        fileUploadQueue={[]}
        groupMembers={[]}
        hasMoreHistory={false}
        historyPanel={{
          activeHistory: { hasNext: false, hasPrev: false, messages: [] },
          activeHistoryFilters: { scope: "all" },
          activeHistoryLoading: false,
        }}
        inputEnterBehavior="send"
        activeAuxiliaryPanel="history"
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

  it("opens mobile tickets over the chat without opening the customer sidebar sheet", async () => {
    const user = userEvent.setup();

    function TestPanel() {
      const [activeAuxiliaryPanel, setActiveAuxiliaryPanel] = useState<
        "tickets" | null
      >(null);

      return (
        <ChatPanel
          activeAuxiliaryPanel={activeAuxiliaryPanel}
          activeConversation={createConversation()}
          activeHistoryStatus="idle"
          canSendMessage
          composerPlaceholder="输入消息"
          customerPanelWidth={375}
          fileUploadQueue={[]}
          groupMembers={[]}
          hasMoreHistory={false}
          historyPanel={{
            activeHistoryFilters: { scope: "all" },
            activeHistoryLoading: false,
          }}
          inputEnterBehavior="send"
          isConversationLoading={false}
          isEmojiPickerOpen={false}
          isGroupMembersLoading={false}
          isMobileLayout
          isResizingCustomerPanel={false}
          isSendingDraft={false}
          messages={[]}
          quotedMessage={null}
          sidebarItems={[]}
          ticketPanel={<div>工单列表内容</div>}
          composerRef={createRef()}
          messageViewportRef={createRef()}
          workbenchBodyRef={createRef()}
          onBackToConversationList={vi.fn()}
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
          onToggleTickets={() =>
            setActiveAuxiliaryPanel((current) =>
              current === "tickets" ? null : "tickets",
            )
          }
        />
      );
    }

    render(<TestPanel />);
    await user.click(screen.getByRole("button", { name: "工单" }));

    expect(
      screen.getByRole("complementary", { name: "工单" }),
    ).toBeInTheDocument();
    expect(screen.getByText("工单列表内容")).toBeInTheDocument();
    expect(
      screen.queryByRole("complementary", { name: "客户信息栏" }),
    ).not.toBeInTheDocument();
  });

  it("shows a blank work area when no conversation is active", () => {
    render(
      <ChatPanel
        activeConversation={undefined}
        activeHistoryStatus="idle"
        canSendMessage={false}
        composerPlaceholder="输入消息"
        customerPanelWidth={375}
        fileUploadQueue={[]}
        groupMembers={[]}
        hasMoreHistory={false}
        historyPanel={undefined}
        inputEnterBehavior="send"
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

  it("keeps composer feedback outside the message scroller", async () => {
    const user = userEvent.setup();
    const onCancelFileUpload = vi.fn();

    render(
      <ChatPanel
        activeConversation={createConversation()}
        activeHistoryStatus="idle"
        canSendMessage
        composerPlaceholder="输入消息"
        customerPanelWidth={375}
        fileUploadQueue={[
          {
            fileName: "报价单.pdf",
            id: "file-upload-1",
            progress: 12,
            status: "uploading",
          },
        ]}
        groupMembers={[]}
        hasMoreHistory={false}
        historyPanel={{ activeHistoryFilters: { scope: "all" }, activeHistoryLoading: false }}
        inputEnterBehavior="send"
        isConversationLoading={false}
        isEmojiPickerOpen={false}
        isGroupMembersLoading={false}
        isResizingCustomerPanel={false}
        isSendingDraft={false}
        messages={[]}
        quotedMessage={null}
        scopeTransitionError="切换会话失败"
        sidebarItems={[]}
        composerRef={createRef()}
        messageViewportRef={createRef()}
        workbenchBodyRef={createRef()}
        onCancelFileUpload={onCancelFileUpload}
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

    const errorBanner = screen.getByTestId("scope-transition-error");
    const composerRegion = screen.getByTestId("chat-composer-region");
    const messageRegion = screen.getByTestId("message-scroll-area").closest("section");

    expect(errorBanner).toHaveTextContent("切换会话失败");
    expect(composerRegion).toContainElement(errorBanner);
    expect(composerRegion).toContainElement(screen.getByText("报价单.pdf"));
    expect(messageRegion?.parentElement).toBe(composerRegion.parentElement);
    expect(messageRegion).not.toContainElement(composerRegion);

    await user.click(screen.getByRole("button", { name: "取消上传 报价单.pdf" }));
    expect(onCancelFileUpload).toHaveBeenCalledWith("file-upload-1");
  });

  it("shows the hosting placeholder and keeps non-send actions available in full agent mode", async () => {
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
        fileUploadQueue={[]}
        groupMembers={[]}
        hasMoreHistory={false}
        historyPanel={{ activeHistoryFilters: { scope: "all" }, activeHistoryLoading: false }}
        inputEnterBehavior="send"
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

    expect(screen.getByText("AI 托管中")).toBeInTheDocument();
    expect(screen.getByTestId("chat-agent-hosting-status-bar")).toBeInTheDocument();
    expect(screen.getByTestId("chat-composer-region")).toContainElement(
      screen.getByTestId("chat-agent-hosting-status-bar-anchor"),
    );
    expect(screen.getByTestId("chat-agent-hosting-status-bar-content")).toBeInTheDocument();
    expect(screen.queryByTestId("chat-agent-hosting-composer-shell")).not.toBeInTheDocument();
    expect(screen.queryByTestId("chat-agent-hosting-composer-mask")).not.toBeInTheDocument();
    expect(screen.getByTestId("chat-composer-editor")).toBeInTheDocument();
    expect(screen.getByText(/Agent 正在查看消息/)).toBeInTheDocument();
    expect(screen.getByLabelText("托管中，不支持发送消息")).toBeInTheDocument();
    expect(screen.getByText("托管中，不支持发送消息")).toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "选择 Enter 键行为" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "历史记录" }));
    await user.click(screen.getByRole("button", { name: "取消托管" }));

    expect(onOpenHistory).toHaveBeenCalledTimes(1);
    expect(onCancelAgentHosting).toHaveBeenCalledTimes(1);
  });

  it("shows the AI assistant bar only when smart reply is active without full agent mode", () => {
    const assistantAccount = {
      ...account,
      seatAIAssistantEnabled: true,
    };
    const conversation = {
      ...createConversation(),
      bizStatus: 1,
    };
    const { rerender } = render(
      createStatusBarPanel({
        activeAccount: assistantAccount,
        activeConversation: conversation,
      }),
    );

    expect(screen.getByTestId("chat-ai-assistant-status-bar")).toBeInTheDocument();
    expect(screen.getByTestId("chat-ai-assistant-status-bar")).toHaveTextContent(
      "正在等待 客户 的消息",
    );
    expect(screen.getByText("客户", { selector: "strong" })).toBeInTheDocument();
    expect(screen.queryByTestId("chat-agent-hosting-status-bar")).not.toBeInTheDocument();

    rerender(
      createStatusBarPanel({
        activeAccount: assistantAccount,
        activeConversation: conversation,
        canSendMessage: false,
      }),
    );

    expect(screen.queryByTestId("chat-ai-assistant-status-bar")).not.toBeInTheDocument();

    rerender(
      createStatusBarPanel({
        activeAccount: assistantAccount,
        activeConversation: {
          ...conversation,
          agentHostingStatus: "thinking",
          conversationAIHostingSwitch: true,
        },
        conversationAIHostingEnabled: true,
      }),
    );

    expect(screen.getByTestId("chat-agent-hosting-status-bar")).toBeInTheDocument();
    expect(screen.queryByTestId("chat-ai-assistant-status-bar")).not.toBeInTheDocument();
  });

  it("restarts the thinking timer when the active conversation changes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-15T10:00:00+08:00"));
    const assistantAccount = {
      ...account,
      seatAIAssistantEnabled: true,
    };
    const conversation = {
      ...createConversation(),
      bizStatus: 1,
    };
    const { rerender } = render(
      createStatusBarPanel({
        activeAccount: assistantAccount,
        activeConversation: conversation,
        aiAssistantStatus: "thinking",
      }),
    );

    act(() => {
      vi.advanceTimersByTime(1_200);
    });
    expect(screen.getByText("1.2s")).toBeInTheDocument();

    rerender(
      createStatusBarPanel({
        activeAccount: assistantAccount,
        activeConversation: {
          ...conversation,
          id: "conversation-2",
        },
        aiAssistantStatus: "thinking",
      }),
    );

    expect(screen.getByText("0.0s")).toBeInTheDocument();
  });

  it("switches the AI assistant bar state from the development debug menu", async () => {
    const user = userEvent.setup();
    const assistantAccount = {
      ...account,
      seatAIAssistantEnabled: true,
    };
    const conversation = {
      ...createConversation(),
      bizStatus: 1,
    };
    const { rerender } = render(
      createStatusBarPanel({
        activeAccount: assistantAccount,
        activeConversation: conversation,
      }),
    );

    const openDebugMenu = () =>
      user.click(
        screen.getByRole("button", {
          name: "切换 AI 辅助条调试状态",
        }),
      );
    await openDebugMenu();
    await user.click(
      screen.getByRole("menuitemradio", { name: "思考中" }),
    );
    await screen.findByText("AI 正在思考");

    await openDebugMenu();
    await user.click(
      screen.getByRole("menuitemradio", { name: "待确认 · 退款" }),
    );
    await screen.findByLabelText("确认退款 100 元");

    await user.click(screen.getByRole("button", { name: "忽略" }));
    await screen.findByText("客户", { selector: "strong" });

    await openDebugMenu();
    await user.click(
      screen.getByRole("menuitemradio", { name: "思考中 · 查询订单" }),
    );
    await screen.findByLabelText("正在查询订单信息");

    await openDebugMenu();
    await user.click(
      screen.getByRole("menuitemradio", { name: "思考中 · 可取消" }),
    );
    await screen.findByLabelText("正在执行售后 SOP");
    await user.click(screen.getByRole("button", { name: "停止" }));
    await screen.findByText("客户", { selector: "strong" });

    rerender(
      createStatusBarPanel({
        activeAccount: assistantAccount,
        activeConversation: {
          ...conversation,
          id: "conversation-2",
        },
      }),
    );

    await screen.findByText("客户", { selector: "strong" });
  });

  it("runs externally supplied AI assistant actions", async () => {
    const user = userEvent.setup();
    const onIgnore = vi.fn();
    const assistantAccount = {
      ...account,
      seatAIAssistantEnabled: true,
    };

    render(
      createStatusBarPanel({
        activeAccount: assistantAccount,
        activeConversation: {
          ...createConversation(),
          bizStatus: 1,
        },
        aiAssistantActions: [
          {
            id: "ignore",
            label: "忽略",
            onSelect: onIgnore,
            tone: "quiet",
          },
        ],
        aiAssistantStatus: "confirmation",
        aiAssistantStatusLabel: "确认退款 100 元",
      }),
    );

    await user.click(screen.getByRole("button", { name: "忽略" }));

    expect(onIgnore).toHaveBeenCalledTimes(1);
  });

  it("restores the existing composer draft after ignoring a smart reply suggestion", async () => {
    const user = userEvent.setup();
    const assistantAccount = {
      ...account,
      seatAIAssistantEnabled: true,
    };
    const conversation = {
      ...createConversation(),
      bizStatus: 1,
    };
    const customerMessage = {
      author: "客户",
      content: { text: "这个产品适合敏感肌吗", type: "text" },
      conversationId: conversation.id,
      isOwnMessage: false,
      rawMsgtype: "text",
      role: "customer",
      sender: { id: "customer-1", name: "客户" },
      sentAt: "2026-09-15T10:00:00+08:00",
      seq: 12,
      status: "sent",
      uiMessageKey: "message-12",
    } satisfies ChatMessage;

    render(
      createStatusBarPanel({
        activeAccount: assistantAccount,
        activeConversation: conversation,
        messages: [customerMessage],
        onDismissSmartReply: (message) => {
          useWorkbenchStore.getState().dismissSmartReply(message);
        },
      }),
    );

    const regularComposer = screen.getByRole("textbox", { name: "输入消息" });
    await user.click(regularComposer);
    await user.paste("客服正在编辑的草稿");
    expect(regularComposer).toHaveTextContent("客服正在编辑的草稿");

    act(() => {
      useWorkbenchStore.setState((state) => ({
        smartReplyActiveMessageKeyByConversationId: {
          ...state.smartReplyActiveMessageKeyByConversationId,
          [conversation.id]: "12",
        },
        smartReplyByMessageIdByConversationId: {
          ...state.smartReplyByMessageIdByConversationId,
          [conversation.id]: {
            "12": {
              assistantName: "智能助手",
              content: "建议先少量试用",
              generateStatus: 2,
              pollComplete: true,
              recordId: "record-12",
              status: "ready",
            },
          },
        },
      }));
    });

    const suggestionComposer = await screen.findByTestId(
      "smart-reply-suggestion-composer",
    );
    expect(
      await screen.findByRole("textbox", { name: "编辑话术建议" }),
    ).toHaveTextContent("建议先少量试用");
    expect(suggestionComposer).toBeVisible();
    const hiddenRegularComposer = regularComposer.closest('[aria-hidden="true"]');
    expect(hiddenRegularComposer).not.toBeNull();
    expect(hiddenRegularComposer).toHaveAttribute("inert");
    expect(screen.getAllByTestId("chat-composer")).toHaveLength(2);

    vi.mocked(checkSmartReplyTextModeration).mockResolvedValue({
      result: {
        categoryLabel: "广告法",
        words: ["绝对安全"],
      },
    });
    await user.click(screen.getByRole("button", { name: "违规词检测" }));
    expect(await screen.findByText("发现违规词：绝对安全")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "忽略" }));

    await waitFor(() => {
      expect(
        screen.queryByTestId("smart-reply-suggestion-composer"),
      ).not.toBeInTheDocument();
      expect(regularComposer.closest('[aria-hidden="true"]')).toBeNull();
      expect(regularComposer.closest("[inert]")).toBeNull();
      expect(regularComposer).toHaveTextContent("客服正在编辑的草稿");
    });
  });

  it("keeps a skipped smart reply visible with its reason until dismissed", async () => {
    vi.useFakeTimers();
    const assistantAccount = {
      ...account,
      seatAIAssistantEnabled: true,
    };
    const conversation = {
      ...createConversation(),
      bizStatus: 1,
    };
    const customerMessage = {
      author: "客户",
      content: { text: "我要转人工", type: "text" },
      conversationId: conversation.id,
      isOwnMessage: false,
      rawMsgtype: "text",
      role: "customer",
      sender: { id: "customer-1", name: "客户" },
      sentAt: "2026-09-15T10:00:00+08:00",
      seq: 12,
      status: "sent",
      uiMessageKey: "message-12",
    } satisfies ChatMessage;
    const onDismissSmartReply = vi.fn();

    useWorkbenchStore.setState((state) => ({
      smartReplyActiveMessageKeyByConversationId: {
        ...state.smartReplyActiveMessageKeyByConversationId,
        [conversation.id]: "12",
      },
      smartReplyByMessageIdByConversationId: {
        ...state.smartReplyByMessageIdByConversationId,
        [conversation.id]: {
          "12": {
            assistantName: "智能助手",
            content: "",
            failReason: "命中人工处理规则",
            generateStatus: 4,
            pollComplete: true,
          },
        },
      },
    }));

    const view = render(
      createStatusBarPanel({
        activeAccount: assistantAccount,
        activeConversation: conversation,
        messages: [customerMessage],
        onDismissSmartReply,
      }),
    );

    expect(screen.getByText(/已跳过话术推荐/)).toBeInTheDocument();
    expect(screen.getByText("查看原因")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "正在等待 客户 的消息",
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(onDismissSmartReply).not.toHaveBeenCalled();

    view.unmount();
  });

  it("shows semantic waiting as a single centered status message", () => {
    const assistantAccount = {
      ...account,
      seatAIAssistantEnabled: true,
    };
    const conversation = {
      ...createConversation(),
      bizStatus: 1,
    };
    const customerMessage = {
      author: "客户",
      content: { text: "我想问一下", type: "text" },
      conversationId: conversation.id,
      isOwnMessage: false,
      rawMsgtype: "text",
      role: "customer",
      sender: { id: "customer-1", name: "客户" },
      sentAt: "2026-09-15T10:00:00+08:00",
      seq: 12,
      status: "sent",
      uiMessageKey: "message-12",
    } satisfies ChatMessage;

    useWorkbenchStore.setState((state) => ({
      smartReplyActiveMessageKeyByConversationId: {
        ...state.smartReplyActiveMessageKeyByConversationId,
        [conversation.id]: "12",
      },
      smartReplyByMessageIdByConversationId: {
        ...state.smartReplyByMessageIdByConversationId,
        [conversation.id]: {
          "12": {
            assistantName: "智能助手",
            content: "",
            createdAt: Date.now(),
            generateStatus: 5,
          },
        },
      },
    }));

    render(
      createStatusBarPanel({
        activeAccount: assistantAccount,
        activeConversation: conversation,
        messages: [customerMessage],
      }),
    );

    const statusBar = screen.getByTestId("chat-ai-assistant-status-bar");
    expect(statusBar).toHaveTextContent("语义不完整，继续等待下一条消息");
    expect(statusBar).not.toHaveTextContent("正在等待 客户 的消息");
  });

  it("makes the suggestion composer inert during message multi-select", () => {
    const assistantAccount = {
      ...account,
      seatAIAssistantEnabled: true,
    };
    const conversation = {
      ...createConversation(),
      bizStatus: 1,
    };
    const customerMessage = {
      author: "客户",
      content: { text: "这个产品适合敏感肌吗", type: "text" },
      conversationId: conversation.id,
      isOwnMessage: false,
      rawMsgtype: "text",
      role: "customer",
      sender: { id: "customer-1", name: "客户" },
      sentAt: "2026-09-15T10:00:00+08:00",
      seq: 12,
      status: "sent",
      uiMessageKey: "message-12",
    } satisfies ChatMessage;

    useWorkbenchStore.setState((state) => ({
      smartReplyActiveMessageKeyByConversationId: {
        ...state.smartReplyActiveMessageKeyByConversationId,
        [conversation.id]: "12",
      },
      smartReplyByMessageIdByConversationId: {
        ...state.smartReplyByMessageIdByConversationId,
        [conversation.id]: {
          "12": {
            assistantName: "智能助手",
            content: "建议先少量试用",
            generateStatus: 2,
            pollComplete: true,
            recordId: "record-12",
            status: "ready",
          },
        },
      },
    }));

    render(
      createStatusBarPanel({
        activeAccount: assistantAccount,
        activeConversation: conversation,
        messages: [customerMessage],
        multiSelectMode: true,
        multiSelectToolbar: <button type="button">转发所选消息</button>,
      }),
    );

    const suggestionComposer = screen.getByTestId(
      "smart-reply-suggestion-composer",
    );
    expect(suggestionComposer.closest("[inert]")).not.toBeNull();
    expect(
      screen.getByTestId("message-multi-select-composer-overlay"),
    ).toContainElement(
      screen.getByRole("button", { name: "转发所选消息" }),
    );
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
        fileUploadQueue={[]}
        groupMembers={[]}
        hasMoreHistory={false}
        historyPanel={{ activeHistoryFilters: { scope: "all" }, activeHistoryLoading: false }}
        inputEnterBehavior="send"
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
        fileUploadQueue={[]}
        groupMembers={[]}
        hasMoreHistory={false}
        historyPanel={{ activeHistoryFilters: { scope: "all" }, activeHistoryLoading: false }}
        inputEnterBehavior="send"
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
    expect(screen.getByRole("combobox", { name: "切换 AI 模式" })).toBeInTheDocument();
    expect(screen.getByText("自动回复")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "关闭当前会话托管" })).toBeEnabled();

    await user.click(screen.getByRole("combobox", { name: "切换 AI 模式" }));
    expect(screen.getByRole("option", { name: /关闭/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /自动回复/ })).toBeInTheDocument();
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
        fileUploadQueue={[]}
        groupMembers={[]}
        hasMoreHistory={false}
        historyPanel={{ activeHistoryFilters: { scope: "all" }, activeHistoryLoading: false }}
        inputEnterBehavior="send"
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
        fileUploadQueue={[]}
        groupMembers={[]}
        hasMoreHistory={false}
        historyPanel={{ activeHistoryFilters: { scope: "all" }, activeHistoryLoading: false }}
        inputEnterBehavior="send"
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
        fileUploadQueue={[]}
        groupMembers={[]}
        hasMoreHistory={false}
        historyPanel={{ activeHistoryFilters: { scope: "all" }, activeHistoryLoading: false }}
        inputEnterBehavior="send"
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

    expect(screen.getByText("AI 托管中")).toBeInTheDocument();
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
        fileUploadQueue={[]}
        groupMembers={[]}
        hasMoreHistory={false}
        historyPanel={{ activeHistoryFilters: { scope: "all" }, activeHistoryLoading: false }}
        inputEnterBehavior="send"
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

  it("hides AI and ticket actions in application-message conversations", () => {
    render(
      <ChatPanel
        activeAccount={account}
        activeAuxiliaryPanel="tickets"
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
        fileUploadQueue={[]}
        groupMembers={[]}
        hasMoreHistory={false}
        historyPanel={{ activeHistoryFilters: { scope: "all" }, activeHistoryLoading: false }}
        inputEnterBehavior="send"
        isConversationLoading={false}
        isEmojiPickerOpen={false}
        isGroupMembersLoading={false}
        isResizingCustomerPanel={false}
        isSendingDraft={false}
        messages={[]}
        quotedMessage={null}
        sidebarItems={[]}
        ticketPanel={<div>工单列表内容</div>}
        ticketReminderCount={3}
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
        onToggleTickets={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "AI 对话" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "工单" })).not.toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "工单" })).not.toBeInTheDocument();
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
        fileUploadQueue={[]}
        groupMembers={[]}
        hasMoreHistory={false}
        historyPanel={{ activeHistoryFilters: { scope: "all" }, activeHistoryLoading: false }}
        inputEnterBehavior="send"
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
        fileUploadQueue={[]}
        groupMembers={[]}
        hasMoreHistory={false}
        historyPanel={{ activeHistoryFilters: { scope: "all" }, activeHistoryLoading: false }}
        inputEnterBehavior="send"
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
        fileUploadQueue={[]}
        groupMembers={[]}
        hasMoreHistory={false}
        historyPanel={{ activeHistoryFilters: { scope: "all" }, activeHistoryLoading: false }}
        inputEnterBehavior="send"
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
        fileUploadQueue={[]}
        groupMembers={[]}
        hasMoreHistory={false}
        historyPanel={{ activeHistoryFilters: { scope: "all" }, activeHistoryLoading: false }}
        inputEnterBehavior="send"
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
        fileUploadQueue={[]}
        fullAutoActionPending
        groupMembers={[]}
        hasMoreHistory={false}
        historyPanel={{ activeHistoryFilters: { scope: "all" }, activeHistoryLoading: false }}
        inputEnterBehavior="send"
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
        fileUploadQueue={[]}
        groupMembers={[]}
        hasMoreHistory={false}
        historyPanel={{ activeHistoryFilters: { scope: "all" }, activeHistoryLoading: false }}
        inputEnterBehavior="send"
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
        activeConversation={{ ...createConversation(), handoffMsgId: 9001 }}
        activeHistoryStatus="idle"
        canMarkHandoffHandled
        canSendMessage
        composerPlaceholder="输入消息"
        customerPanelWidth={375}
        fileUploadQueue={[]}
        groupMembers={[]}
        hasMoreHistory={false}
        historyPanel={{ activeHistoryFilters: { scope: "all" }, activeHistoryLoading: false }}
        inputEnterBehavior="send"
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

    await user.click(screen.getByRole("button", { name: "定位消息" }));
    await user.click(screen.getByRole("button", { name: "标记已处理" }));

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
    handoffMsgId: 0,
    customerBindType: 1,
    mode: "single",
    preview: "",
    priority: "medium",
    quietFor: "刚刚",
    unread: 0,
    updatedAt: "刚刚",
  };
}

function createStatusBarPanel({
  activeAccount,
  activeConversation,
  aiAssistantStatus,
  aiAssistantStatusLabel,
  aiAssistantActions,
  canSendMessage = true,
  conversationAIHostingEnabled = false,
  messages = [],
  multiSelectMode = false,
  multiSelectToolbar,
  onDismissSmartReply,
}: {
  activeAccount: Account;
  activeConversation: Conversation;
  aiAssistantActions?: readonly ChatAIAssistantAction[];
  aiAssistantStatus?: "waiting" | "thinking" | "confirmation";
  aiAssistantStatusLabel?: string;
  canSendMessage?: boolean;
  conversationAIHostingEnabled?: boolean;
  messages?: ChatMessage[];
  multiSelectMode?: boolean;
  multiSelectToolbar?: ReactNode;
  onDismissSmartReply?: (message: ChatMessage) => void;
}) {
  return (
    <ChatPanel
      activeAccount={activeAccount}
      activeConversation={activeConversation}
      activeHistoryStatus="idle"
      aiAssistantActions={aiAssistantActions}
      aiAssistantStatus={aiAssistantStatus}
      aiAssistantStatusLabel={aiAssistantStatusLabel}
      canSendMessage={canSendMessage && !conversationAIHostingEnabled}
      conversationAIHostingEnabled={conversationAIHostingEnabled}
      composerPlaceholder="输入消息"
      customerPanelWidth={375}
      fileUploadQueue={[]}
      groupMembers={[]}
      hasMoreHistory={false}
      historyPanel={{
        activeHistoryFilters: { scope: "all" },
        activeHistoryLoading: false,
      }}
      inputEnterBehavior="send"
      isConversationLoading={false}
      isEmojiPickerOpen={false}
      isGroupMembersLoading={false}
      isResizingCustomerPanel={false}
      isSendingDraft={false}
      messages={messages}
      multiSelectMode={multiSelectMode}
      multiSelectToolbar={multiSelectToolbar}
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
      onDismissSmartReply={onDismissSmartReply}
      onRefreshGroupMembers={vi.fn()}
      onRetryMessage={vi.fn()}
      onSendDraft={vi.fn()}
    />
  );
}
