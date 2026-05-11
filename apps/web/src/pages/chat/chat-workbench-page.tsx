import {
  startTransition,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { LexicalEditor } from "lexical";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DotMatrixLoader } from "@/components/ui/dot-matrix-loader";
import { cn } from "@/lib/utils";
import { clearAuthTokens } from "@/pages/auth/auth-tokens";
import { logout } from "@/pages/auth/auth-service";
import { AccountRail } from "@/pages/chat/components/account-rail";
import { ChatPanel } from "@/pages/chat/components/chat-panel";
import { ConversationListPanel } from "@/pages/chat/components/conversation-list-panel";
import type { MentionInsertPosition } from "@/pages/chat/components/chat-composer";
import type { InputEnterBehavior } from "@/pages/chat/components/input-enter-behavior";
import { CLEAR_COMPOSER_COMMAND } from "@/pages/chat/components/composer/lexical-commands";
import { useAccountRailResize } from "@/pages/chat/hooks/use-account-rail-resize";
import { useCustomerPanelResize } from "@/pages/chat/hooks/use-customer-panel-resize";
import { useMessageScrollRestoration } from "@/pages/chat/hooks/use-message-scroll-restoration";
import { useWorkbenchPolling } from "@/pages/chat/hooks/use-workbench-polling";
import { seedGroupMembersByConversationId } from "@/pages/chat/mock-data";
import { useWorkbenchStore } from "@/store/workbench-store";
import type { ChatMode, GroupMember } from "@/pages/chat/chat-types";
import type { ComposerSegment } from "@/pages/chat/lib/composer-segments";
import {
  CONVERSATION_LIST_PANEL_WIDTH,
  MIN_WORKBENCH_CONTENT_WIDTH,
} from "@/pages/chat/lib/panel-width";

const ACCOUNT_RAIL_COLLAPSED_STORAGE_KEY = "chatai.accountRailCollapsed";

function getInitialAccountRailCollapsed() {
  try {
    return window.localStorage.getItem(ACCOUNT_RAIL_COLLAPSED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function writeAccountRailCollapsed(isCollapsed: boolean) {
  try {
    window.localStorage.setItem(
      ACCOUNT_RAIL_COLLAPSED_STORAGE_KEY,
      String(isCollapsed),
    );
  } catch {
    // Keep the UI usable when storage is unavailable.
  }
}

export function ChatWorkbenchPage() {
  return <ChatWorkbenchContent />;
}

export function ChatWorkbenchRoutePage() {
  const navigate = useNavigate();

  return (
    <ChatWorkbenchContent
      onOpenSettings={() => {
        navigate("/chat/settings");
      }}
    />
  );
}

function ChatWorkbenchContent({
  onOpenSettings,
}: {
  onOpenSettings?: () => void;
}) {
  const {
    accounts,
    activeAccountId,
    activeConversationId,
    activeMode,
    bootstrapError,
    bootstrapStatus,
    conversationListsByScope,
    customerProfilesById,
    dismissScopeTransitionError,
    dismissReadReceiptError,
    hasMoreHistoryByConversationId,
    historyStatusByConversationId,
    initializeWorkbench,
    isConversationLoading,
    loadOlderMessages,
    me,
    messagesByConversationId,
    pollState,
    pollWorkbench,
    readReceiptError,
    retryFailedMessage,
    scopeTransitionError,
    sendAgentMessageSegments,
    setActiveAccount,
    setActiveConversation,
    setActiveMode,
    takeOverAccount,
    takeoverStatusByAccountId,
  } = useWorkbenchStore();

  const [draft, setDraft] = useState("");
  const [mentionInsertPosition, setMentionInsertPosition] =
    useState<MentionInsertPosition>("start");
  const [selectedMentionMembers, setSelectedMentionMembers] = useState<GroupMember[]>([]);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [isAccountRailCollapsed, setIsAccountRailCollapsed] = useState(
    getInitialAccountRailCollapsed,
  );
  const [inputEnterBehavior, setInputEnterBehavior] =
    useState<InputEnterBehavior>("send");
  const workbenchBodyRef = useRef<HTMLDivElement | null>(null);
  const messageViewportRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<LexicalEditor | null>(null);
  const {
    customerPanelWidth,
    handleCustomerPanelResizeStart,
    isResizingCustomerPanel,
  } = useCustomerPanelResize(workbenchBodyRef);
  const {
    accountRailWidth,
    handleAccountRailResizeStart,
    isResizingAccountRail,
  } = useAccountRailResize();

  async function handleLogout() {
    try {
      await logout();
    } finally {
      clearAuthTokens();
    }
  }

  const handleAccountRailCollapseChange = (nextIsCollapsed: boolean) => {
    setIsAccountRailCollapsed(nextIsCollapsed);
    writeAccountRailCollapsed(nextIsCollapsed);
  };

  const activeAccount =
    accounts.find((account) => account.id === activeAccountId) ?? accounts[0];
  const allConversations = conversationListsByScope[activeAccountId] ?? [];
  const visibleConversations = allConversations.filter(
    (conversation) => conversation.mode === activeMode,
  );
  const activeConversation =
    visibleConversations.find(
      (conversation) => conversation.id === activeConversationId,
    ) ?? visibleConversations[0];
  const activeMessages =
    (activeConversation && messagesByConversationId[activeConversation.id]) ?? [];
  const activeGroupMembers = activeConversation
    ? getGroupMembersForConversation(activeConversation.id, activeConversation.mode)
    : [];
  const activeHistoryStatus = activeConversation
    ? historyStatusByConversationId[activeConversation.id] ?? "idle"
    : "idle";
  const hasMoreHistory = activeConversation
    ? hasMoreHistoryByConversationId[activeConversation.id] === true
    : false;
  const activeCustomer =
    (activeConversation &&
      customerProfilesById[activeConversation.customerId]) ??
    undefined;
  const isActiveAccountOffline = activeAccount?.loginStatus === "offline";
  const isActiveAccountTakenOver =
    !!activeAccount?.takenOverEmployeeId &&
    activeAccount.takenOverEmployeeId === me?.id;
  const canSendMessage =
    !!activeConversation &&
    !isActiveAccountOffline &&
    isActiveAccountTakenOver;
  const composerPlaceholder = canSendMessage
    ? "请输入消息……"
    : bootstrapStatus === "loading" && !activeConversation
      ? "正在加载会话数据..."
    : isActiveAccountOffline
      ? "当前账号离线，暂时无法发送消息"
    : !isActiveAccountTakenOver
      ? "当前账号未接管，暂时无法发送消息"
    : !activeConversation
      ? "当前列表暂无可发送会话"
      : "当前会话暂不可发送消息";

  const {
    handleLoadOlderMessages,
    handleMessageViewportScroll,
  } =
    useMessageScrollRestoration({
    activeConversationId: activeConversation?.id,
    activeHistoryStatus,
    hasMoreHistory,
    isHistoryLoading: activeHistoryStatus === "loading",
    loadOlderMessages,
    messageCount: activeMessages.length,
    messageViewportRef,
    });

  useEffect(() => {
    void initializeWorkbench();
  }, [initializeWorkbench]);

  useEffect(() => {
    if (!readReceiptError) {
      return;
    }

    toast.warning(readReceiptError);
    dismissReadReceiptError();
  }, [dismissReadReceiptError, readReceiptError]);

  useEffect(() => {
    setIsEmojiPickerOpen(false);
    setMentionInsertPosition("start");
    setSelectedMentionMembers([]);
  }, [activeConversation?.id]);

  useWorkbenchPolling({
    activeAccountId,
    bootstrapStatus,
    intervalMs: pollState.intervalMs,
    jitterMs: pollState.jitterMs,
    pollWorkbench,
  });

  const handleSendDraft = (segments: ComposerSegment[]) => {
    const mentionText = selectedMentionMembers
      .map((member) => `@${member.displayName}`)
      .join(" ");
    const normalizedSegments = formatSegmentsWithMentions({
      mentionInsertPosition,
      mentionText,
      segments,
    });

    if (normalizedSegments.length === 0 || !canSendMessage) {
      return;
    }

    void sendAgentMessageSegments(normalizedSegments);
    composerRef.current?.dispatchCommand(CLEAR_COMPOSER_COMMAND, undefined);
    setDraft("");
    setMentionInsertPosition("start");
    setSelectedMentionMembers([]);
    composerRef.current?.focus();
  };

  const handleDraftChange = (nextDraft: string) => {
    setDraft(nextDraft);
  };

  const handleSelectMentionMember = (
    member: GroupMember,
    triggerStart: number,
    triggerEnd: number,
  ) => {
    setSelectedMentionMembers((currentMembers) =>
      currentMembers.some((currentMember) => currentMember.id === member.id)
        ? currentMembers
        : [...currentMembers, member],
    );
    setDraft((currentDraft) =>
      currentDraft.slice(0, triggerStart) + currentDraft.slice(triggerEnd),
    );

    requestAnimationFrame(() => {
      composerRef.current?.focus();
    });
  };

  const handleRemoveMentionMember = (memberId: string) => {
    setSelectedMentionMembers((currentMembers) =>
      currentMembers.filter((member) => member.id !== memberId),
    );
    composerRef.current?.focus();
  };

  if (bootstrapStatus === "loading" && accounts.length === 0) {
    return (
      <div className="flex h-svh items-center justify-center bg-background px-6">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <DotMatrixLoader
            ariaLabel="正在加载"
            className="text-foreground"
            dotSize={3}
            size={22}
          />
          正在加载工作台数据...
        </div>
      </div>
    );
  }

  if (bootstrapStatus === "error" && accounts.length === 0) {
    return (
      <div className="flex h-svh items-center justify-center bg-background px-6">
        <div className="max-w-md rounded-2xl border border-destructive/25 bg-surface px-6 py-5 shadow-sm">
          <p className="text-sm font-semibold text-foreground">工作台初始化失败</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {bootstrapError ?? "暂时无法获取会话数据。"}
          </p>
          <Button
            className="mt-4 h-9 rounded-lg px-4 text-[13px] shadow-none"
            onClick={() => {
              startTransition(() => {
                void initializeWorkbench();
              });
            }}
          >
            重新加载
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-svh min-h-[720px] overflow-hidden bg-sidebar">
      <div
        className={cn(
          "grid h-full",
          isResizingAccountRail
            ? "transition-none"
            : "transition-[grid-template-columns] duration-200 ease-out",
        )}
        data-testid="chat-workbench-shell"
        style={
          {
            gridTemplateColumns: isAccountRailCollapsed
              ? "3.5rem minmax(0, 1fr)"
              : `${accountRailWidth}px minmax(0, 1fr)`,
          } as CSSProperties
        }
      >
        <AccountRail
          accounts={accounts}
          activeAccountId={activeAccountId}
          currentEmployee={me}
          currentEmployeeId={me?.id}
          isCollapsed={isAccountRailCollapsed}
          onCollapseChange={handleAccountRailCollapseChange}
          onLogout={handleLogout}
          onResizeStart={handleAccountRailResizeStart}
          onSelectAccount={setActiveAccount}
          onOpenSettings={onOpenSettings}
          onTakeOverAccount={takeOverAccount}
          takeoverStatusByAccountId={takeoverStatusByAccountId}
        />

        <div
          className="relative z-10 h-full min-h-0 overflow-x-auto rounded-[14px_0_0_14px] bg-surface pl-0 shadow"
          data-testid="chat-workbench-scroll-container"
        >
          <div
            className={cn(
              "h-full min-h-0",
              (isResizingAccountRail || isResizingCustomerPanel) && "select-none",
            )}
            data-testid="chat-workbench-content"
            style={{ minWidth: `${MIN_WORKBENCH_CONTENT_WIDTH}px` }}
          >
            <div
              className="grid h-full min-h-0 overflow-hidden rounded-[inherit]"
              data-testid="chat-main-layout"
              style={{
                gridTemplateColumns: `${CONVERSATION_LIST_PANEL_WIDTH}px minmax(0, 1fr)`,
              }}
            >
              <ConversationListPanel
                activeConversation={activeConversation}
                activeMode={activeMode}
                conversations={visibleConversations}
                onSelectConversation={setActiveConversation}
                onSelectMode={setActiveMode}
                searchableConversations={allConversations}
              />

              <ChatPanel
                accountName={activeAccount?.name}
                activeConversation={activeConversation}
                activeHistoryStatus={activeHistoryStatus}
                canSendMessage={canSendMessage}
                composerPlaceholder={composerPlaceholder}
                customer={activeCustomer}
                customerPanelWidth={customerPanelWidth}
                draft={draft}
                groupMembers={activeGroupMembers}
                inputEnterBehavior={inputEnterBehavior}
                isConversationLoading={isConversationLoading}
                isEmojiPickerOpen={isEmojiPickerOpen}
                isResizingCustomerPanel={isResizingCustomerPanel}
                mentionInsertPosition={mentionInsertPosition}
                hasMoreHistory={hasMoreHistory}
                messages={activeMessages}
                messageViewportRef={messageViewportRef}
                onCustomerPanelResizeStart={handleCustomerPanelResizeStart}
                onDraftChange={handleDraftChange}
                onEmojiPickerOpenChange={setIsEmojiPickerOpen}
                onEnterBehaviorChange={setInputEnterBehavior}
                onMentionInsertPositionChange={setMentionInsertPosition}
                onRemoveMentionMember={handleRemoveMentionMember}
                onSelectMentionMember={handleSelectMentionMember}
                onLoadOlderMessages={handleLoadOlderMessages}
                onMessageViewportScroll={handleMessageViewportScroll}
                onRetryMessage={retryFailedMessage}
                onSendDraft={handleSendDraft}
                onDismissScopeTransitionError={dismissScopeTransitionError}
                scopeTransitionError={scopeTransitionError}
                selectedMentionMembers={selectedMentionMembers}
                composerRef={composerRef}
                workbenchBodyRef={workbenchBodyRef}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatSegmentsWithMentions({
  segments,
  mentionInsertPosition,
  mentionText,
}: {
  segments: ComposerSegment[];
  mentionInsertPosition: MentionInsertPosition;
  mentionText: string;
}): ComposerSegment[] {
  if (!mentionText) {
    return segments;
  }

  if (segments.length === 0) {
    return [
      {
        text: mentionText,
        type: "text",
      },
    ];
  }

  if (mentionInsertPosition === "start") {
    return [
      {
        text: `${mentionText} `,
        type: "text",
      },
      ...segments,
    ];
  }

  return [
    ...segments,
    {
      text: ` ${mentionText}`,
      type: "text",
    },
  ];
}

function getGroupMembersForConversation(conversationId: string, mode: ChatMode) {
  if (mode !== "group") {
    return [];
  }

  return (
    seedGroupMembersByConversationId[conversationId] ??
    seedGroupMembersByConversationId["conv-004"] ??
    []
  );
}
