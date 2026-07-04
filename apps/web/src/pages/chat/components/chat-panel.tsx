import type {
  PointerEvent as ReactPointerEvent,
  ReactNode,
  RefObject,
} from "react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { LexicalEditor } from "lexical";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  ChatComposer,
  type ComposerMaterialLibraryBizType,
} from "@/pages/chat/components/chat-composer";
import { ChatAgentHostingStatusBar } from "@/pages/chat/components/chat-agent-hosting-status-bar";
import { ChatHeader } from "@/pages/chat/components/chat-header";
import { ChatMessagePanel } from "@/pages/chat/components/chat-message-panel";
import { CustomerSidePanel } from "@/pages/chat/components/customer-side-panel";
import type { SidebarIframeSendStatus } from "@/pages/chat/lib/sidebar-iframe-url";
import { MessageHistorySidePanel } from "@/pages/chat/components/message-history-side-panel";
import type { InputEnterBehavior } from "@/pages/chat/components/input-enter-behavior";
import type {
  Conversation,
  Account,
  CustomerProfile,
  FileUploadQueueItem,
  GroupMember,
  ChatMessage,
  Message,
  QuotedMessagePreviewContent,
} from "@/pages/chat/chat-types";
import type {
  SettingsSidebarItem,
  WorkbenchMaterialCollectionItemDto,
  WorkbenchSeatAgentMode,
} from "@chatai/contracts";
import type { ComposerSegment } from "@/pages/chat/lib/composer-segments";
import {
  resolveAgentHostingStatus,
  type AgentHostingStatus,
} from "@/pages/chat/lib/chat-agent-hosting-status";
import { isConversationAIFeatureSupported } from "@/pages/chat/lib/conversation-ai-hosting";
import type { SmartReplySendPayload } from "@/pages/chat/api/smart-reply-adapter";

type ChatPanelProps = {
  accountName?: string;
  accountAvatarUrl?: string;
  activeConversation?: Conversation;
  activeHistoryStatus: "idle" | "loading" | "error";
  canConfigureSeatAIHosting?: boolean;
  canConfigureSeatSemiAuto?: boolean;
  canToggleConversationAIHosting?: boolean;
  canCollectMaterialActions?: boolean;
  canSendMessage: boolean;
  fullAutoActionPending?: boolean;
  seatAgentModeActionPending?: boolean;
  fullAutoDisplayStatus?: AgentHostingStatus;
  activeAccount?: Account;
  seatAIHostingEnabled?: boolean;
  conversationAIHostingEnabled?: boolean;
  composerPlaceholder: string;
  customer?: CustomerProfile;
  /** 侧栏 iframe `tos`：当前坐席是否已接管账号 */
  sidebarIframeTos?: "0" | "1";
  /** 侧栏 iframe `sendStatus`：发送能力状态码 */
  sidebarIframeSendStatus?: SidebarIframeSendStatus;
  customerPanelWidth: number;
  draft: string;
  groupMembers: GroupMember[];
  isGroupMembersLoading: boolean;
  inputEnterBehavior: InputEnterBehavior;
  isConversationLoading: boolean;
  isEmojiPickerOpen: boolean;
  isMobileLayout?: boolean;
  isSendingDraft: boolean;
  isResizingCustomerPanel: boolean;
  messages: Message[];
  quotedMessage: QuotedMessagePreviewContent | null;
  hasMoreHistory: boolean;
  historyLoadLabel?: string;
  historyPanel?: {
    activeHistory?: {
      hasNext: boolean;
      hasPrev: boolean;
      messages: Message[];
      nextCursor?: string;
      prevCursor?: string;
    };
    activeHistoryError?: string;
    activeHistoryLoading: boolean;
    activeHistoryFilters: {
      day?: string;
      senderId?: string;
      scope: "all" | "file" | "media" | "h5" | "mini-program";
    };
    scrollMode?: "end";
    isOpen: boolean;
  };
  isHistoryPanelOpen: boolean;
  onCustomerPanelResizeStart: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onComposerSegmentsChange: (segments: ComposerSegment[]) => void;
  onDraftChange: (draft: string) => void;
  onEmojiPickerOpenChange: (isOpen: boolean) => void;
  onEnterBehaviorChange: (behavior: InputEnterBehavior) => void;
  onCancelFileUpload: (uploadId: string) => void;
  onCancelAgentHosting?: () => void;
  onEnableAgentHosting?: () => void;
  onChangeSeatAgentMode?: (mode: WorkbenchSeatAgentMode) => void;
  onChangeFullAuto?: (enabled: boolean) => void;
  collectedExpressions?: WorkbenchMaterialCollectionItemDto[];
  hasMoreCollectedExpressions?: boolean;
  isCollectedExpressionLoadingMore?: boolean;
  sendingCollectedExpressionId?: string | null;
  onCollectMaterial?: (message: ChatMessage) => void;
  onDeleteCollectedExpression?: (item: WorkbenchMaterialCollectionItemDto) => void;
  onLoadMoreCollectedExpressions?: () => void;
  onOpenCollectedExpressions?: () => void;
  onOpenMaterialLibrary?: (bizType: ComposerMaterialLibraryBizType) => void;
  onSelectCollectedExpression?: (item: WorkbenchMaterialCollectionItemDto) => void;
  onTopCollectedExpression?: (item: WorkbenchMaterialCollectionItemDto) => void;
  onDownloadMessageFile?: (message: ChatMessage) => void;
  onFileSelect: (files: FileList | File[] | null) => void;
  onBackToConversationList?: () => void;
  onOpenHistory: () => void;
  onHistoryClose: () => void;
  onHistoryLoadMoreNext: () => void;
  onHistoryLoadMorePrev: () => void;
  onHistoryRefresh: () => void;
  onHistorySetDay: (day?: string) => void;
  onHistorySetScope: (scope: "all" | "file" | "media" | "h5" | "mini-program") => void;
  onHistorySetSenderId: (senderId?: string) => void;
  onRefreshGroupMembers: () => void;
  onLoadOlderMessages: () => void;
  onMentionMessage?: (message: ChatMessage) => void;
  onOpenQuotedMessage?: (quoteMsgId: string) => void;
  onQuoteMessage?: (message: ChatMessage) => void;
  onRevokeMessage?: (message: ChatMessage) => void;
  onClearQuotedMessage: () => void;
  onMessageViewportScroll: () => void;
  onRetryMessage: (uiMessageKey: string) => void | Promise<void>;
  onSendSmartReply?: (message: ChatMessage, payload: SmartReplySendPayload) => void;
  onFillSmartReplyComposer?: (message: ChatMessage, content: string) => void;
  onDismissSmartReply?: (message: ChatMessage) => void;
  onMakeShorterSmartReply?: (message: ChatMessage) => void;
  onTriggerSmartReply?: (
    message: ChatMessage,
    options?: { force?: boolean },
  ) => void;
  onVoicePlaybackReady?: (
    message: ChatMessage,
    payload: { playbackUrl: string },
  ) => void;
  onTranscribeVoice?: (message: ChatMessage) => Promise<string>;
  retryingMessageIds?: ReadonlySet<string>;
  onSendDraft: (segments: ComposerSegment[]) => void;
  onDismissScopeTransitionError: () => void;
  onQuickReplyActiveChange?: (isActive: boolean) => void;
  quickReplyPanel?: ReactNode;
  scopeTransitionError?: string;
  sidebarItems: SettingsSidebarItem[];
  fileUploadQueue: FileUploadQueueItem[];
  messageViewportRef: RefObject<HTMLDivElement | null>;
  composerRef: RefObject<LexicalEditor | null>;
  workbenchBodyRef: RefObject<HTMLDivElement | null>;
};

export function ChatPanel({
  accountName,
  accountAvatarUrl,
  activeConversation,
  activeHistoryStatus,
  canConfigureSeatAIHosting = false,
  canConfigureSeatSemiAuto = false,
  canToggleConversationAIHosting = false,
  canCollectMaterialActions = true,
  canSendMessage,
  fullAutoActionPending = false,
  seatAgentModeActionPending = false,
  fullAutoDisplayStatus,
  activeAccount,
  seatAIHostingEnabled = false,
  conversationAIHostingEnabled = false,
  composerPlaceholder,
  customer,
  sidebarIframeTos,
  sidebarIframeSendStatus,
  customerPanelWidth,
  draft,
  groupMembers,
  isGroupMembersLoading,
  inputEnterBehavior,
  isConversationLoading,
  isEmojiPickerOpen,
  isMobileLayout = false,
  isSendingDraft,
  isResizingCustomerPanel,
  messages,
  quotedMessage,
  hasMoreHistory,
  historyLoadLabel,
  historyPanel,
  isHistoryPanelOpen,
  onCustomerPanelResizeStart,
  onComposerSegmentsChange,
  onDraftChange,
  onEmojiPickerOpenChange,
  onEnterBehaviorChange,
  onCancelFileUpload,
  onCancelAgentHosting,
  onEnableAgentHosting,
  onChangeSeatAgentMode,
  onChangeFullAuto,
  collectedExpressions,
  hasMoreCollectedExpressions,
  isCollectedExpressionLoadingMore,
  sendingCollectedExpressionId,
  onCollectMaterial,
  onDeleteCollectedExpression,
  onLoadMoreCollectedExpressions,
  onOpenCollectedExpressions,
  onOpenMaterialLibrary,
  onSelectCollectedExpression,
  onTopCollectedExpression,
  onDownloadMessageFile,
  onFileSelect,
  onBackToConversationList,
  onOpenHistory,
  onHistoryClose,
  onHistoryLoadMoreNext,
  onHistoryLoadMorePrev,
  onHistoryRefresh,
  onHistorySetDay,
  onHistorySetScope,
  onHistorySetSenderId,
  onRefreshGroupMembers,
  onLoadOlderMessages,
  onMentionMessage,
  onOpenQuotedMessage,
  onQuoteMessage,
  onRevokeMessage,
  onClearQuotedMessage,
  onMessageViewportScroll,
  onRetryMessage,
  onSendSmartReply,
  onFillSmartReplyComposer,
  onDismissSmartReply,
  onMakeShorterSmartReply,
  onTriggerSmartReply,
  onVoicePlaybackReady,
  retryingMessageIds,
  onSendDraft,
  onTranscribeVoice,
  onDismissScopeTransitionError,
  onQuickReplyActiveChange,
  quickReplyPanel,
  scopeTransitionError,
  sidebarItems,
  fileUploadQueue,
  messageViewportRef,
  composerRef,
  workbenchBodyRef,
}: ChatPanelProps) {
  const resolvedAgentHostingStatus =
    fullAutoDisplayStatus ??
    resolveAgentHostingStatus(activeConversation, conversationAIHostingEnabled);
  const agentHostingStatus =
    !conversationAIHostingEnabled || resolvedAgentHostingStatus === "exited"
      ? null
      : resolvedAgentHostingStatus;
  const hasActiveFileUpload = fileUploadQueue.length > 0;
  const hasActiveConversation = activeConversation !== undefined;
  const canUseConversationAIFeatures =
    isConversationAIFeatureSupported(activeConversation);
  const historyPanelNode = historyPanel ? (
    <MessageHistorySidePanel
      accountAvatarUrl={accountAvatarUrl}
      accountName={accountName}
      activeConversation={activeConversation}
      activeHistory={historyPanel.activeHistory}
      activeHistoryError={historyPanel.activeHistoryError}
      activeHistoryFilters={historyPanel.activeHistoryFilters}
      activeHistoryLoading={historyPanel.activeHistoryLoading}
      onDownloadMessageFile={onDownloadMessageFile}
      onTranscribeVoice={onTranscribeVoice}
      onVoicePlaybackReady={onVoicePlaybackReady}
      scrollMode={historyPanel.scrollMode}
      customer={customer}
      groupMembers={groupMembers}
      isOpen={historyPanel.isOpen}
      onClose={onHistoryClose}
      onLoadMoreNext={onHistoryLoadMoreNext}
      onLoadMorePrev={onHistoryLoadMorePrev}
      onRefresh={onHistoryRefresh}
      onSetDay={onHistorySetDay}
      onSetScope={onHistorySetScope}
      onSetSenderId={onHistorySetSenderId}
    />
  ) : null;

  return (
    <section className="flex min-h-0 min-w-0 flex-col bg-surface">
      <ChatHeader
        activeConversation={activeConversation}
        onBack={isMobileLayout ? onBackToConversationList : undefined}
      />

      <div className="flex min-h-0 min-w-0 flex-1" ref={workbenchBodyRef}>
        {hasActiveConversation ? (
          <>
            <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-surface">
              <ChatMessagePanel
                activeHistoryStatus={activeHistoryStatus}
                bottomOverlay={
                  hasActiveFileUpload ? (
                    <FileUploadQueueBar
                      items={fileUploadQueue}
                      onCancelFileUpload={onCancelFileUpload}
                    />
                  ) : null
                }
                canCollectMaterialActions={canCollectMaterialActions}
                canUseMessageActions={canSendMessage}
                hasBottomOverlay={hasActiveFileUpload}
                hasMoreHistory={hasMoreHistory}
                historyLoadLabel={historyLoadLabel}
                isConversationLoading={isConversationLoading}
                conversationId={activeConversation.id}
                conversationMode={activeConversation.mode}
                messages={messages}
                messageViewportRef={messageViewportRef}
                onCollectMaterial={onCollectMaterial}
                onDownloadMessageFile={onDownloadMessageFile}
                onMentionMessage={onMentionMessage}
                onLoadOlderMessages={onLoadOlderMessages}
                onOpenQuotedMessage={onOpenQuotedMessage}
                onQuoteMessage={onQuoteMessage}
                onSendSmartReply={onSendSmartReply}
                onFillSmartReplyComposer={onFillSmartReplyComposer}
                onDismissSmartReply={onDismissSmartReply}
                onMakeShorterSmartReply={onMakeShorterSmartReply}
                onTriggerSmartReply={onTriggerSmartReply}
                onRevokeMessage={onRevokeMessage}
                onMessageViewportScroll={onMessageViewportScroll}
                onRetryMessage={onRetryMessage}
                onTranscribeVoice={onTranscribeVoice}
                onVoicePlaybackReady={onVoicePlaybackReady}
                retryingMessageIds={retryingMessageIds}
              />

              <Separator className="bg-divider" />

              <div className="relative">
                {scopeTransitionError ? (
                  <div
                    className="absolute bottom-full left-0 right-0 z-20 mb-0 flex min-h-8 items-center justify-between gap-3 border-t border-destructive/10 bg-destructive/55 px-5 py-1.5 text-xs font-medium leading-5 text-destructive-foreground/90 shadow-[0_-4px_16px_var(--shadow-soft)] backdrop-blur-md"
                    data-testid="scope-transition-error"
                    role="status"
                  >
                    <span className="min-w-0 truncate">{scopeTransitionError}</span>
                    <button
                      aria-label="关闭错误提示"
                      className="inline-flex size-6 shrink-0 items-center justify-center rounded-[6px] text-destructive-foreground/75 outline-none transition-colors hover:bg-white/10 hover:text-destructive-foreground focus-visible:ring-2 focus-visible:ring-white/30"
                      onClick={onDismissScopeTransitionError}
                      type="button"
                    >
                      <HugeiconsIcon
                        aria-hidden="true"
                        icon={Cancel01Icon}
                        size={14}
                        strokeWidth={2}
                      />
                    </button>
                  </div>
                ) : null}

                <div className="relative overflow-visible bg-surface pb-3">
                  {agentHostingStatus ? (
                    <div
                      className="absolute bottom-12 left-1/2 z-30 w-4/5 max-w-[520px] -translate-x-1/2"
                      data-testid="chat-agent-hosting-status-bar-anchor"
                    >
                      <ChatAgentHostingStatusBar
                        onCancel={onCancelAgentHosting}
                        onEnable={onEnableAgentHosting}
                        status={agentHostingStatus}
                      />
                    </div>
                  ) : null}
                  <div className="px-4 pt-3">
                    <ChatComposer
                      canConfigureSeatAIHosting={canConfigureSeatAIHosting}
                      canConfigureSeatSemiAuto={canConfigureSeatSemiAuto}
                      canToggleConversationAIHosting={canToggleConversationAIHosting}
                      canSendMessage={canSendMessage}
                      canUseConversationAIFeatures={canUseConversationAIFeatures}
                      draft={draft}
                      fullAutoActionPending={fullAutoActionPending}
                      seatAgentModeActionPending={seatAgentModeActionPending}
                      hasActiveFileUpload={hasActiveFileUpload}
                      currentSeatThirdUserId={activeConversation.thirdUserId}
                      groupMembers={groupMembers}
                      hidePlaceholder={!!agentHostingStatus}
                      isGroupConversation={activeConversation.mode === "group"}
                      inputEnterBehavior={inputEnterBehavior}
                      isEmojiPickerOpen={isEmojiPickerOpen}
                      isMobileLayout={isMobileLayout}
                      isSending={isSendingDraft}
                      isHistoryPanelOpen={isHistoryPanelOpen}
                      accountAvatarUrl={activeAccount?.avatarUrl ?? accountAvatarUrl}
                      accountName={activeAccount?.name ?? accountName}
                      seatAIHostingAuth={activeAccount?.seatAIHostingAuth === true}
                      seatSemiAutoAuth={activeAccount?.semiAutoAuth === true}
                      fullAutoSwitch={activeAccount?.fullAutoSwitch === true}
                      semiAutoSwitch={activeAccount?.semiAutoSwitch === true}
                      conversationAIHostingEnabled={conversationAIHostingEnabled}
                      collectedExpressions={collectedExpressions}
                      hasMoreCollectedExpressions={hasMoreCollectedExpressions}
                      isCollectedExpressionLoadingMore={
                        isCollectedExpressionLoadingMore
                      }
                      sendingCollectedExpressionId={sendingCollectedExpressionId}
                      onClearQuotedMessage={onClearQuotedMessage}
                      onDeleteCollectedExpression={onDeleteCollectedExpression}
                      onDraftChange={onDraftChange}
                      onEmojiPickerOpenChange={onEmojiPickerOpenChange}
                      onEnterBehaviorChange={onEnterBehaviorChange}
                      onFileSelect={onFileSelect}
                      onChangeSeatAgentMode={onChangeSeatAgentMode ?? noopChangeSeatAgentMode}
                      onChangeFullAuto={onChangeFullAuto ?? noopChangeFullAuto}
                      onLoadMoreCollectedExpressions={
                        onLoadMoreCollectedExpressions
                      }
                      onOpenCollectedExpressions={onOpenCollectedExpressions}
                      onOpenMaterialLibrary={onOpenMaterialLibrary ?? noop}
                      onOpenHistory={onOpenHistory}
                      onSelectCollectedExpression={onSelectCollectedExpression}
                      onSegmentsChange={onComposerSegmentsChange}
                      onSendDraft={onSendDraft}
                      onTopCollectedExpression={onTopCollectedExpression}
                      placeholder={composerPlaceholder}
                      quotedMessage={quotedMessage}
                      composerRef={composerRef}
                    />
                  </div>
                </div>
              </div>
              {isMobileLayout ? historyPanelNode : null}
            </div>

            {isMobileLayout ? null : (
              <div
                className="relative flex h-full min-h-0 min-w-0 shrink-0"
                data-testid="customer-side-panel-shell"
                style={{ width: `${customerPanelWidth + 4}px` }}
              >
                <div
                  className={cn(
                    "flex h-full min-h-0 shrink-0",
                    historyPanel?.isOpen
                      ? "invisible pointer-events-none"
                      : "visible",
                  )}
                  data-testid="customer-side-panel-layout"
                >
                  <CustomerSidePanel
                    accountName={accountName}
                    conversationMode={activeConversation.mode}
                    customer={customer}
                    sidebarIframeConversationId={activeConversation.id}
                    sidebarIframeSeatId={activeConversation.accountId}
                    sidebarIframeTos={sidebarIframeTos}
                    sidebarIframeSendStatus={sidebarIframeSendStatus}
                    groupMembers={groupMembers}
                    isGroupMembersLoading={isGroupMembersLoading}
                    isResizing={isResizingCustomerPanel}
                    onRefreshGroupMembers={onRefreshGroupMembers}
                    onResizeStart={onCustomerPanelResizeStart}
                    onQuickReplyActiveChange={onQuickReplyActiveChange}
                    panelWidth={customerPanelWidth}
                    quickReplyPanel={quickReplyPanel}
                    sidebarItems={sidebarItems}
                  />
                </div>
                {historyPanelNode}
              </div>
            )}
          </>
        ) : (
          <div className="flex min-h-0 min-w-0 flex-1 bg-surface" />
        )}
      </div>
    </section>
  );
}

function FileUploadQueueBar({
  items,
  onCancelFileUpload,
}: {
  items: FileUploadQueueItem[];
  onCancelFileUpload: (uploadId: string) => void;
}) {
  return (
    <div className="px-5">
      <div className="overflow-hidden rounded-t-[14px] border border-b-0 border-divider bg-surface px-4 py-1.5">
        {items.map((item) => (
          <div
            className="grid h-7 grid-cols-[minmax(0,1fr)_160px_auto] items-center gap-4"
            key={item.id}
          >
            <div className="flex min-w-0 items-center gap-2">
              <span className="min-w-0 truncate text-[13px] font-semibold text-foreground">
                {item.fileName}
              </span>
              <span className="shrink-0 text-[13px] text-muted-foreground">
                {item.status === "sending" ? "正在发送" : "正在准备发送"}
              </span>
            </div>
            <div className="flex min-w-0 items-center gap-2">
              <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-200"
                  style={{ width: `${item.progress}%` }}
                />
              </div>
              <span className="w-9 shrink-0 text-right text-[13px] tabular-nums text-muted-foreground">
                {item.progress}%
              </span>
            </div>
            <button
              aria-label={`取消上传 ${item.fileName}`}
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-[7px] text-muted-foreground outline-none transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:opacity-45"
              onClick={() => onCancelFileUpload(item.id)}
              type="button"
            >
              <HugeiconsIcon
                aria-hidden="true"
                icon={Cancel01Icon}
                size={15}
                strokeWidth={2}
              />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function noop() {}

function noopChangeSeatAgentMode() {}

function noopChangeFullAuto() {}
