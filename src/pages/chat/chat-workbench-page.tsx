import { startTransition, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AccountRail } from "@/pages/chat/components/account-rail";
import { ChatPanel } from "@/pages/chat/components/chat-panel";
import { ConversationListPanel } from "@/pages/chat/components/conversation-list-panel";
import type { InputEnterBehavior } from "@/pages/chat/components/input-enter-behavior";
import { useCustomerPanelResize } from "@/pages/chat/hooks/use-customer-panel-resize";
import { useMessageScrollRestoration } from "@/pages/chat/hooks/use-message-scroll-restoration";
import { useWorkbenchPolling } from "@/pages/chat/hooks/use-workbench-polling";
import { type WechatEmojiName, toWechatEmojiToken } from "@/pages/chat/wechat-emoji";
import { useWorkbenchStore } from "@/store/workbench-store";

export function ChatWorkbenchPage() {
  const {
    accounts,
    activeAccountId,
    activeConversationId,
    activeMessageSeq,
    activeMode,
    bootstrapError,
    bootstrapStatus,
    claimActiveConversation,
    claimStatusByConversationId,
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
  } = useWorkbenchStore();

  const [draft, setDraft] = useState("");
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
  const activeHistoryStatus = activeConversation
    ? historyStatusByConversationId[activeConversation.id] ?? "idle"
    : "idle";
  const hasMoreHistory = activeConversation
    ? hasMoreHistoryByConversationId[activeConversation.id] !== false
    : false;
  const activeClaimStatus = activeConversation
    ? claimStatusByConversationId[activeConversation.id] ?? "idle"
    : "idle";
  const activeSendStatus = activeConversation
    ? sendStatusByConversationId[activeConversation.id] ?? "idle"
    : "idle";
  const activeCustomer =
    (activeConversation &&
      customerProfilesById[activeConversation.customerId]) ??
    undefined;
  const isClaimedByCurrentUser =
    !!activeConversation?.assignedEmployeeId &&
    activeConversation.assignedEmployeeId === me?.id;
  const isClaimedByOther =
    !!activeConversation?.assignedEmployeeId &&
    activeConversation.assignedEmployeeId !== me?.id;
  const isActiveAccountOffline = activeAccount?.loginStatus === "offline";
  const canSendMessage =
    bootstrapStatus === "ready" &&
    !!activeConversation &&
    !isActiveAccountOffline &&
    !isClaimedByOther &&
    activeSendStatus !== "sending";
  const composerHint = isActiveAccountOffline
    ? "当前账号离线，暂时无法发送消息。"
    : isClaimedByOther
    ? "该会话已被其他坐席领取，当前只读。"
    : activeConversation?.status === "public" && !isClaimedByCurrentUser
      ? "发送第一条消息时会自动领取会话。"
      : pollState.status === "error"
        ? "轮询暂时失败，消息状态可能延迟回收。"
        : activeSendStatus === "sending"
          ? "消息已受理，等待轮询回收最终状态。"
          : undefined;

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
  }, [activeConversation?.id]);

  useWorkbenchPolling({
    activeAccountId,
    bootstrapStatus,
    intervalMs: pollState.intervalMs,
    jitterMs: pollState.jitterMs,
    pollWorkbench,
  });

  const handleSendDraft = () => {
    const normalizedDraft = draft.trim();

    if (!normalizedDraft || !canSendMessage) {
      return;
    }

    void sendAgentTextMessage(normalizedDraft);
    setDraft("");
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
      <div className="flex h-svh items-center justify-center bg-[#F7F8F9] px-6">
        <div className="rounded-2xl border border-[#E7EBF0] bg-white px-6 py-5 text-sm text-[#66758A] shadow-sm">
          正在加载工作台数据...
        </div>
      </div>
    );
  }

  if (bootstrapStatus === "error" && accounts.length === 0) {
    return (
      <div className="flex h-svh items-center justify-center bg-[#F7F8F9] px-6">
        <div className="max-w-md rounded-2xl border border-[#F2D1D4] bg-white px-6 py-5 shadow-sm">
          <p className="text-sm font-semibold text-foreground">工作台初始化失败</p>
          <p className="mt-2 text-sm leading-6 text-[#6D7787]">
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
    <div className="h-svh min-h-[720px] bg-[#F7F8F9]">
      <div className="grid h-full grid-cols-[14.5rem_minmax(0,1fr)] overflow-hidden">
        <AccountRail
          accounts={accounts}
          activeAccountId={activeAccountId}
          isPollError={pollState.status === "error"}
          onSelectAccount={setActiveAccount}
          pollIntervalMs={pollState.intervalMs}
        />

        <div className="h-full min-h-0 pl-0">
          <div
            className={cn(
              "grid h-full min-h-0 overflow-hidden rounded-[20px_0_0_20px] border-l border-[#EBEDEE] bg-white lg:grid-cols-[18rem_minmax(0,1fr)]",
              isResizingCustomerPanel && "select-none",
            )}
            style={{ boxShadow: "-5px 0 10px -4px rgba(20, 37, 44, 0.04)" }}
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
              activeClaimStatus={activeClaimStatus}
              activeConversation={activeConversation}
              activeHistoryStatus={activeHistoryStatus}
              activeMessageSeq={activeMessageSeq}
              canSendMessage={canSendMessage}
              composerHint={composerHint}
              customer={activeCustomer}
              customerPanelWidth={customerPanelWidth}
              draft={draft}
              inputEnterBehavior={inputEnterBehavior}
              isClaimedByCurrentUser={isClaimedByCurrentUser}
              isClaimedByOther={isClaimedByOther}
              isConversationLoading={isConversationLoading}
              isEmojiPickerOpen={isEmojiPickerOpen}
              isResizingCustomerPanel={isResizingCustomerPanel}
              hasMoreHistory={hasMoreHistory}
              messageListBottomRef={messageListBottomRef}
              messages={activeMessages}
              messageViewportRef={messageViewportRef}
              onClaimConversation={claimActiveConversation}
              onCustomerPanelResizeStart={handleCustomerPanelResizeStart}
              onDraftChange={setDraft}
              onEmojiPickerOpenChange={setIsEmojiPickerOpen}
              onEmojiSelect={handleEmojiSelect}
              onEnterBehaviorChange={setInputEnterBehavior}
              onLoadOlderMessages={handleLoadOlderMessages}
              onMessageViewportScroll={handleMessageViewportScroll}
              onRetryMessage={retryFailedMessage}
              onSendDraft={handleSendDraft}
              scopeTransitionError={scopeTransitionError}
              textareaRef={textareaRef}
              workbenchBodyRef={workbenchBodyRef}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
