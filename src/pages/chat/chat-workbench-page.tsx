import { startTransition, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AccountRail } from "@/pages/chat/components/account-rail";
import { ChatPanel } from "@/pages/chat/components/chat-panel";
import { ConversationListPanel } from "@/pages/chat/components/conversation-list-panel";
import type { MentionInsertPosition } from "@/pages/chat/components/chat-composer";
import type { InputEnterBehavior } from "@/pages/chat/components/input-enter-behavior";
import { useCustomerPanelResize } from "@/pages/chat/hooks/use-customer-panel-resize";
import { useMessageScrollRestoration } from "@/pages/chat/hooks/use-message-scroll-restoration";
import { useWorkbenchPolling } from "@/pages/chat/hooks/use-workbench-polling";
import { type WechatEmojiName, toWechatEmojiToken } from "@/pages/chat/wechat-emoji";
import { seedGroupMembersByConversationId } from "@/pages/chat/mock-data";
import { useWorkbenchStore } from "@/store/workbench-store";
import type { GroupMember } from "@/pages/chat/chat-types";

export function ChatWorkbenchPage() {
  const {
    accounts,
    activeAccountId,
    activeConversationId,
    activeMessageSeq,
    activeMode,
    bootstrapError,
    bootstrapStatus,
    conversationListsByScope,
    customerProfilesById,
    hasMoreHistoryByConversationId,
    historyStatusByConversationId,
    initializeWorkbench,
    isConversationLoading,
    loadOlderMessages,
    me,
    messagesByConversationId,
    pollState,
    pollWorkbench,
    retryFailedMessage,
    scopeTransitionError,
    sendAgentTextMessage,
    sendStatusByConversationId,
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
  const [inputEnterBehavior, setInputEnterBehavior] =
    useState<InputEnterBehavior>("send");
  const workbenchBodyRef = useRef<HTMLDivElement | null>(null);
  const messageViewportRef = useRef<HTMLDivElement | null>(null);
  const messageListBottomRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const {
    customerPanelWidth,
    handleCustomerPanelResizeStart,
    isResizingCustomerPanel,
  } = useCustomerPanelResize(workbenchBodyRef);

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
  const activeGroupMembers =
    (activeConversation && seedGroupMembersByConversationId[activeConversation.id]) ?? [];
  const activeHistoryStatus = activeConversation
    ? historyStatusByConversationId[activeConversation.id] ?? "idle"
    : "idle";
  const hasMoreHistory = activeConversation
    ? hasMoreHistoryByConversationId[activeConversation.id] !== false
    : false;
  const activeSendStatus = activeConversation
    ? sendStatusByConversationId[activeConversation.id] ?? "idle"
    : "idle";
  const activeCustomer =
    (activeConversation &&
      customerProfilesById[activeConversation.customerId]) ??
    undefined;
  const isActiveAccountOffline = activeAccount?.loginStatus === "offline";
  const isActiveAccountTakenOver =
    !!activeAccount?.takenOverEmployeeId &&
    activeAccount.takenOverEmployeeId === me?.id;
  const canSendMessage =
    bootstrapStatus === "ready" &&
    !!activeConversation &&
    !isActiveAccountOffline &&
    isActiveAccountTakenOver &&
    activeSendStatus !== "sending";
  const composerPlaceholder = canSendMessage
    ? "请输入消息……"
    : isActiveAccountOffline
      ? "当前账号离线，暂时无法发送消息"
    : !isActiveAccountTakenOver
      ? "当前账号未接管，暂时无法发送消息"
      : "当前会话暂不可发送消息";

  const { handleLoadOlderMessages, handleMessageViewportScroll } =
    useMessageScrollRestoration({
    activeConversationId: activeConversation?.id,
    activeHistoryStatus,
    hasMoreHistory,
    isHistoryLoading: activeHistoryStatus === "loading",
    loadOlderMessages,
    messageCount: activeMessages.length,
    messageListBottomRef,
    messageViewportRef,
    });

  useEffect(() => {
    void initializeWorkbench();
  }, [initializeWorkbench]);

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

  const handleSendDraft = () => {
    const mentionText = selectedMentionMembers
      .map((member) => `@${member.displayName}`)
      .join(" ");
    const normalizedDraft = formatDraftWithMentions({
      draft,
      mentionInsertPosition,
      mentionText,
    });

    if (!normalizedDraft || !canSendMessage) {
      return;
    }

    void sendAgentTextMessage(normalizedDraft);
    setDraft("");
    setMentionInsertPosition("start");
    setSelectedMentionMembers([]);
    textareaRef.current?.focus();
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
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(triggerStart, triggerStart);
    });
  };

  const handleRemoveMentionMember = (memberId: string) => {
    setSelectedMentionMembers((currentMembers) =>
      currentMembers.filter((member) => member.id !== memberId),
    );
    textareaRef.current?.focus();
  };

  const handleEmojiSelect = (name: WechatEmojiName) => {
    const nextToken = toWechatEmojiToken(name);
    const textarea = textareaRef.current;

    setIsEmojiPickerOpen(false);

    if (!textarea) {
      setDraft((currentDraft) => `${currentDraft}${nextToken}`);
      return;
    }

    const selectionStart = textarea.selectionStart ?? draft.length;
    const selectionEnd = textarea.selectionEnd ?? draft.length;
    const nextDraft =
      draft.slice(0, selectionStart) + nextToken + draft.slice(selectionEnd);
    const nextCursorPosition = selectionStart + nextToken.length;

    setDraft(nextDraft);

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(nextCursorPosition, nextCursorPosition);
    });
  };

  if (bootstrapStatus === "loading" && accounts.length === 0) {
    return (
      <div className="flex h-svh items-center justify-center bg-background px-6">
        <div className="rounded-2xl border border-border bg-surface px-6 py-5 text-sm text-muted-foreground shadow-sm">
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
    <div className="h-svh min-h-[720px] bg-background">
      <div className="grid h-full grid-cols-[14.5rem_minmax(0,1fr)] overflow-hidden">
        <AccountRail
          accounts={accounts}
          activeAccountId={activeAccountId}
          currentEmployeeId={me?.id}
          onSelectAccount={setActiveAccount}
          onTakeOverAccount={takeOverAccount}
          takeoverStatusByAccountId={takeoverStatusByAccountId}
        />

        <div className="h-full min-h-0 pl-0">
          <div
            className={cn(
              "grid h-full min-h-0 overflow-hidden rounded-[20px_0_0_20px] border-l border-divider bg-surface lg:grid-cols-[18rem_minmax(0,1fr)]",
              isResizingCustomerPanel && "select-none",
            )}
            style={{ boxShadow: "-5px 0 10px -4px var(--shadow-soft)" }}
          >
            <ConversationListPanel
              activeConversation={activeConversation}
              activeMode={activeMode}
              conversations={visibleConversations}
              onSelectConversation={setActiveConversation}
              onSelectMode={setActiveMode}
            />

            <ChatPanel
              accountName={activeAccount?.name}
              activeConversation={activeConversation}
              activeHistoryStatus={activeHistoryStatus}
              activeMessageSeq={activeMessageSeq}
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
              messageListBottomRef={messageListBottomRef}
              messages={activeMessages}
              messageViewportRef={messageViewportRef}
              onCustomerPanelResizeStart={handleCustomerPanelResizeStart}
              onDraftChange={handleDraftChange}
              onEmojiPickerOpenChange={setIsEmojiPickerOpen}
              onEmojiSelect={handleEmojiSelect}
              onEnterBehaviorChange={setInputEnterBehavior}
              onMentionInsertPositionChange={setMentionInsertPosition}
              onRemoveMentionMember={handleRemoveMentionMember}
              onSelectMentionMember={handleSelectMentionMember}
              onLoadOlderMessages={handleLoadOlderMessages}
              onMessageViewportScroll={handleMessageViewportScroll}
              onRetryMessage={retryFailedMessage}
              onSendDraft={handleSendDraft}
              scopeTransitionError={scopeTransitionError}
              selectedMentionMembers={selectedMentionMembers}
              textareaRef={textareaRef}
              workbenchBodyRef={workbenchBodyRef}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function formatDraftWithMentions({
  draft,
  mentionInsertPosition,
  mentionText,
}: {
  draft: string;
  mentionInsertPosition: MentionInsertPosition;
  mentionText: string;
}) {
  const normalizedDraft = draft.trim();

  if (!mentionText) {
    return normalizedDraft;
  }

  if (!normalizedDraft) {
    return mentionText;
  }

  return mentionInsertPosition === "start"
    ? `${mentionText} ${normalizedDraft}`
    : `${normalizedDraft} ${mentionText}`;
}
