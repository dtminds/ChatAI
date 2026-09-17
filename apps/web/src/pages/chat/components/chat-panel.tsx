import type {
  PointerEvent as ReactPointerEvent,
  ReactNode,
  RefObject,
} from "react";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { LexicalEditor } from "lexical";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  ChatComposer,
  type ComposerMaterialLibraryBizType,
} from "@/pages/chat/components/chat-composer";
import {
  ChatAIAssistantStatusBar,
  type ChatAIAssistantAction,
  type ChatAIAssistantStatus,
} from "@/pages/chat/components/chat-ai-assistant-status-bar";
import {
  ChatAIAssistantDebugMenu,
  getChatAIAssistantDebugScenarioView,
  type ChatAIAssistantDebugScenario,
} from "@/pages/chat/components/chat-ai-assistant-debug-menu";
import { ChatAgentHostingStatusBar } from "@/pages/chat/components/chat-agent-hosting-status-bar";
import { ChatAgentClarificationPrompt } from "@/pages/chat/components/chat-agent-clarification-prompt";
import { ChatAgentToolApprovalPrompt } from "@/pages/chat/components/chat-agent-tool-approval-prompt";
import { ChatAgentTurnTimeline } from "@/pages/chat/components/chat-agent-turn-timeline";
import { ChatHandoffStatusBar } from "@/pages/chat/components/chat-handoff-status-bar";
import { useSmartReplyComposer } from "@/pages/chat/components/use-smart-reply-composer";
import { useCustomerResponsePreflight } from "@/pages/chat/components/use-customer-response-preflight";
import { useAgentTurnMock } from "@/pages/chat/components/use-agent-turn-mock";
import { REPLACE_COMPOSER_COMMAND } from "@/pages/chat/components/composer/lexical-commands";
import { ChatHeader } from "@/pages/chat/components/chat-header";
import { CHAT_USER_MEMORY_RESERVED_WIDTH } from "@/pages/chat/components/chat-user-memory-popover";
import { ChatMessagePanel } from "@/pages/chat/components/chat-message-panel";
import { FileUploadQueueBar } from "@/pages/chat/components/file-upload-queue-bar";
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
  CustomerChatStartInput,
  Message,
  QuotedMessagePreviewContent,
} from "@/pages/chat/chat-types";
import type { TicketReminderDisplayMode } from "@/pages/chat/tickets/ticket-count-store";
import { isConversationTicketSupported } from "@/pages/chat/tickets/conversation-ticket-policy";
import type {
  CustomerResponseDirection,
  SettingsSidebarItem,
  WorkbenchMaterialCollectionItemDto,
  WorkbenchSeatAgentMode,
} from "@chatai/contracts";
import type { ComposerSegment } from "@/pages/chat/lib/composer-segments";
import {
  resolveAgentHostingStatus,
  type AgentHostingStatus,
} from "@/pages/chat/lib/chat-agent-hosting-status";
import {
  SMART_REPLY_INLINE_LOADING_HINT,
  type SmartReplySendPayload,
} from "@/pages/chat/api/smart-reply-adapter";
import { hasConversationHandoff } from "@/pages/chat/lib/conversation-handoff-preview";
import { resolveConversationAIAssistantEligibility } from "@/pages/chat/lib/conversation-ai-assistant";
import {
  resolveSmartReplyAssistantUIPhase,
  resolveSmartReplyAssistantTurn,
  SMART_REPLY_DRAFT_CONFIRMATION_LABEL,
  type SmartReplyAssistantPhase,
} from "@/pages/chat/lib/smart-reply-assistant";
import { useWorkbenchStore } from "@/store/workbench-store";
import { useShallow } from "zustand/react/shallow";

const WORKBENCH_SIDEBAR_COLLAPSED_STORAGE_KEY =
  "chatai.workbenchSidebarCollapsed";

type AgentTurnTimelineState = "hidden" | "visible" | "exiting";

export type ChatAuxiliaryPanel = "history" | "tickets" | null;

type ChatPanelProps = {
  accounts?: Account[];
  accountName?: string;
  accountAvatarUrl?: string;
  activeConversation?: Conversation;
  activeHistoryStatus: "idle" | "loading" | "error";
  canConfigureSeatAIHosting?: boolean;
  canConfigureSeatSemiAuto?: boolean;
  canToggleConversationAIHosting?: boolean;
  canCollectMaterialActions?: boolean;
  canSendMessage: boolean;
  canMarkHandoffHandled?: boolean;
  canUseMessageForward?: boolean;
  fullAutoActionPending?: boolean;
  seatAgentModeActionPending?: boolean;
  fullAutoDisplayStatus?: AgentHostingStatus;
  aiAssistantStatus?: ChatAIAssistantStatus;
  aiAssistantStatusLabel?: string;
  aiAssistantActions?: readonly ChatAIAssistantAction[];
  activeAccount?: Account;
  seatAIHostingEnabled?: boolean;
  conversationAIHostingConfigured?: boolean;
  conversationAIHostingEnabled?: boolean;
  shouldShowConversationAIHostingControl?: boolean;
  composerPlaceholder: string;
  customer?: CustomerProfile;
  currentEmployeeId?: string;
  /** 侧栏 iframe `tos`：当前坐席是否已接管账号 */
  sidebarIframeTos?: "0" | "1";
  /** 侧栏 iframe `sendStatus`：发送能力状态码 */
  sidebarIframeSendStatus?: SidebarIframeSendStatus;
  customerPanelWidth: number;
  groupMembers: GroupMember[];
  isGroupMembersLoading: boolean;
  inputEnterBehavior: InputEnterBehavior;
  isConversationActionDisabled?: boolean;
  isConversationLoading: boolean;
  isEmojiPickerOpen: boolean;
  isMobileLayout?: boolean;
  isSendingDraft: boolean;
  isHandoffClearPending?: boolean;
  isResizingCustomerPanel: boolean;
  messages: Message[];
  multiSelectMode?: boolean;
  multiSelectToolbar?: ReactNode;
  quotedMessage: QuotedMessagePreviewContent | null;
  selectedMessageKeys?: ReadonlySet<string>;
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
  };
  activeAuxiliaryPanel?: ChatAuxiliaryPanel;
  onCustomerPanelResizeStart: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onComposerSegmentsChange: (segments: ComposerSegment[]) => void;
  onComposerModeChange?: (mode: "message" | "suggestion") => void;
  onDraftChange: (draft: string) => void;
  onEmojiPickerOpenChange: (isOpen: boolean) => void;
  onEnterBehaviorChange: (behavior: InputEnterBehavior) => void;
  onCancelFileUpload: (uploadId: string) => void;
  onCancelAgentHosting?: () => void;
  onEnableAgentHosting?: () => void;
  onChangeSeatAgentMode?: (mode: WorkbenchSeatAgentMode) => void;
  onChangeFullAuto?: (enabled: boolean) => void;
  onMarkHandoffHandled?: () => void;
  onViewHandoffMessage?: () => void;
  collectedExpressions?: WorkbenchMaterialCollectionItemDto[];
  hasMoreCollectedExpressions?: boolean;
  isCollectedExpressionLoadingMore?: boolean;
  sendingCollectedExpressionId?: string | null;
  onCollectMaterial?: (message: ChatMessage) => void;
  onEnterMultiSelectMode?: (message?: ChatMessage) => void;
  onForwardMessage?: (message: ChatMessage) => void;
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
  onAuxiliaryPanelClose?: () => void;
  onHistoryClose: () => void;
  onHistoryLoadMoreNext: () => void;
  onHistoryLoadMorePrev: () => void;
  onHistoryRefresh: () => void;
  onHistorySetDay: (day?: string) => void;
  onHistorySetScope: (scope: "all" | "file" | "media" | "h5" | "mini-program") => void;
  onHistorySetSenderId: (senderId?: string) => void;
  onRefreshGroupMembers: () => void;
  onStartCustomerChat?: (
    input: CustomerChatStartInput,
  ) => void | Promise<void>;
  onLoadOlderMessages: () => void;
  onMarkConversationRead?: (conversationId: string) => void | Promise<void>;
  onMarkConversationUnread?: (conversationId: string) => void | Promise<void>;
  onMentionMessage?: (message: ChatMessage) => void;
  onOpenQuotedMessage?: (quoteMsgId: string) => void;
  onQuoteMessage?: (message: ChatMessage) => void;
  onRevokeMessage?: (message: ChatMessage) => void;
  onClearQuotedMessage: () => void;
  onMessageViewportScroll: () => void;
  onPersistentSidebarChange?: (visible: boolean) => void;
  onPinConversation?: (conversationId: string) => void | Promise<void>;
  onRetryMessage: (uiMessageKey: string) => void | Promise<void>;
  onLoadSendFailReason?: (uiMessageKey: string) => Promise<string | undefined>;
  onSendSmartReply?: (message: ChatMessage, payload: SmartReplySendPayload) => void;
  onDismissSmartReply?: (message: ChatMessage) => void;
  onTriggerSmartReply?: (
    message: ChatMessage,
    options?: { confirmedComposerOverwrite?: boolean; force?: boolean },
  ) => void;
  onToggleMessageSelection?: (message: ChatMessage) => void;
  onToggleTickets?: () => void;
  onUnpinConversation?: (conversationId: string) => void | Promise<void>;
  onVoicePlaybackReady?: (
    message: ChatMessage,
    payload: { playbackUrl: string },
  ) => void;
  onTranscribeVoice?: (message: ChatMessage) => Promise<string>;
  retryingMessageIds?: ReadonlySet<string>;
  onSendDraft: (segments: ComposerSegment[]) => boolean | Promise<boolean>;
  onDismissScopeTransitionError: () => void;
  onQuickReplyActiveChange?: (isActive: boolean) => void;
  quickReplyPanel?: ReactNode;
  ticketPanel?: ReactNode;
  ticketReminderCount?: number;
  ticketReminderDisplayMode?: TicketReminderDisplayMode;
  scopeTransitionError?: string;
  sidebarItems: SettingsSidebarItem[];
  fileUploadQueue: FileUploadQueueItem[];
  messageViewportRef: RefObject<HTMLDivElement | null>;
  composerRef: RefObject<LexicalEditor | null>;
  workbenchBodyRef: RefObject<HTMLDivElement | null>;
};

export function ChatPanel({
  accounts = [],
  accountName,
  accountAvatarUrl,
  activeConversation,
  activeHistoryStatus,
  canConfigureSeatAIHosting = false,
  canConfigureSeatSemiAuto = false,
  canToggleConversationAIHosting = false,
  canCollectMaterialActions = true,
  canSendMessage,
  canMarkHandoffHandled = false,
  canUseMessageForward = false,
  fullAutoActionPending = false,
  seatAgentModeActionPending = false,
  fullAutoDisplayStatus,
  aiAssistantStatus = "waiting",
  aiAssistantStatusLabel,
  aiAssistantActions,
  activeAccount,
  seatAIHostingEnabled = false,
  conversationAIHostingConfigured = false,
  conversationAIHostingEnabled = false,
  shouldShowConversationAIHostingControl = false,
  composerPlaceholder,
  customer,
  currentEmployeeId,
  sidebarIframeTos,
  sidebarIframeSendStatus,
  customerPanelWidth,
  groupMembers,
  isGroupMembersLoading,
  inputEnterBehavior,
  isConversationActionDisabled = false,
  isConversationLoading,
  isEmojiPickerOpen,
  isMobileLayout = false,
  isSendingDraft,
  isHandoffClearPending = false,
  isResizingCustomerPanel,
  messages,
  multiSelectMode = false,
  multiSelectToolbar,
  quotedMessage,
  selectedMessageKeys,
  hasMoreHistory,
  historyLoadLabel,
  historyPanel,
  activeAuxiliaryPanel,
  onCustomerPanelResizeStart,
  onComposerSegmentsChange,
  onComposerModeChange,
  onDraftChange,
  onEmojiPickerOpenChange,
  onEnterBehaviorChange,
  onCancelFileUpload,
  onCancelAgentHosting,
  onEnableAgentHosting,
  onChangeSeatAgentMode,
  onChangeFullAuto,
  onMarkHandoffHandled,
  onViewHandoffMessage,
  collectedExpressions,
  hasMoreCollectedExpressions,
  isCollectedExpressionLoadingMore,
  sendingCollectedExpressionId,
  onCollectMaterial,
  onEnterMultiSelectMode,
  onForwardMessage,
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
  onAuxiliaryPanelClose,
  onHistoryClose,
  onHistoryLoadMoreNext,
  onHistoryLoadMorePrev,
  onHistoryRefresh,
  onHistorySetDay,
  onHistorySetScope,
  onHistorySetSenderId,
  onRefreshGroupMembers,
  onStartCustomerChat,
  onLoadOlderMessages,
  onMarkConversationRead,
  onMarkConversationUnread,
  onMentionMessage,
  onOpenQuotedMessage,
  onQuoteMessage,
  onRevokeMessage,
  onClearQuotedMessage,
  onMessageViewportScroll,
  onPersistentSidebarChange,
  onPinConversation,
  onRetryMessage,
  onLoadSendFailReason,
  onSendSmartReply,
  onDismissSmartReply,
  onTriggerSmartReply,
  onToggleMessageSelection,
  onToggleTickets,
  onUnpinConversation,
  onVoicePlaybackReady,
  retryingMessageIds,
  onSendDraft,
  onTranscribeVoice,
  onDismissScopeTransitionError,
  onQuickReplyActiveChange,
  quickReplyPanel,
  ticketPanel,
  ticketReminderCount,
  ticketReminderDisplayMode,
  scopeTransitionError,
  sidebarItems,
  fileUploadQueue,
  messageViewportRef,
  composerRef,
  workbenchBodyRef,
}: ChatPanelProps) {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isUserMemoryOpen, setIsUserMemoryOpen] = useState(false);
  const [isDesktopSidebarCollapsed, setIsDesktopSidebarCollapsed] = useState(
    readDesktopSidebarCollapsedPreference,
  );
  const [aiAssistantDebugScenario, setAIAssistantDebugScenario] =
    useState<ChatAIAssistantDebugScenario | null>(null);
  const [approvedOverwriteLookupKey, setApprovedOverwriteLookupKey] =
    useState<string>();
  const [composerDraftText, setComposerDraftText] = useState("");
  const activeConversationId = activeConversation?.id;
  const latestCustomerMessageId = getLatestCustomerMessageId(messages);
  const agentTurnMock = useAgentTurnMock({
    composerRef,
    conversationId: activeConversationId,
    messageId: latestCustomerMessageId,
  });
  const [agentTurnTimelineState, setAgentTurnTimelineState] =
    useState<AgentTurnTimelineState>("hidden");
  const [isAgentTurnHistoryExpanded, setIsAgentTurnHistoryExpanded] =
    useState(false);
  const [isAgentTurnTerminalSettled, setIsAgentTurnTerminalSettled] =
    useState(true);
  const hasBlockingAgentInteraction = Boolean(
    agentTurnMock.approval || agentTurnMock.clarification,
  );
  const hasBlockingAgentTurn = Boolean(
    (agentTurnMock.isActive && !agentTurnMock.isTerminal) ||
      agentTurnMock.isReplyReady,
  );

  useLayoutEffect(() => {
    setAgentTurnTimelineState("hidden");
    setIsAgentTurnHistoryExpanded(false);
    setIsAgentTurnTerminalSettled(false);
  }, [activeConversationId, agentTurnMock.turnId]);

  useLayoutEffect(() => {
    if (hasBlockingAgentInteraction) {
      setAgentTurnTimelineState("hidden");
      setIsAgentTurnHistoryExpanded(false);
      setIsAgentTurnTerminalSettled(false);
      return;
    }

    if (agentTurnMock.isRunning) {
      setAgentTurnTimelineState(
        agentTurnMock.hasActivities ? "visible" : "hidden",
      );
      setIsAgentTurnHistoryExpanded(false);
      setIsAgentTurnTerminalSettled(false);
      return;
    }

    if (agentTurnMock.isTerminal) {
      if (
        agentTurnTimelineState === "visible" &&
        !isAgentTurnHistoryExpanded
      ) {
        setAgentTurnTimelineState("exiting");
      } else if (agentTurnTimelineState === "hidden") {
        setIsAgentTurnTerminalSettled(true);
      }
      return;
    }

    if (!agentTurnMock.isActive) {
      setAgentTurnTimelineState("hidden");
      setIsAgentTurnHistoryExpanded(false);
      setIsAgentTurnTerminalSettled(true);
    }
  }, [
    agentTurnMock.hasActivities,
    agentTurnMock.isActive,
    agentTurnMock.isRunning,
    agentTurnMock.isTerminal,
    agentTurnTimelineState,
    hasBlockingAgentInteraction,
    isAgentTurnHistoryExpanded,
  ]);

  const showAgentTurnTimeline = Boolean(
    agentTurnTimelineState !== "hidden" &&
      agentTurnMock.hasActivities &&
      !hasBlockingAgentInteraction,
  );
  const isAgentTurnTerminalTransitioning = Boolean(
    agentTurnMock.isTerminal && !isAgentTurnTerminalSettled,
  );
  const canExpandAgentTurnHistory = Boolean(
    agentTurnMock.hasActivities &&
      !agentTurnMock.isRunning &&
      !hasBlockingAgentInteraction &&
      !isAgentTurnTerminalTransitioning,
  );
  const handleExpandAgentTurnHistory = () => {
    if (!canExpandAgentTurnHistory) return;
    setIsAgentTurnHistoryExpanded(true);
    setAgentTurnTimelineState("visible");
  };
  const handleCollapseAgentTurnHistory = () => {
    if (!isAgentTurnHistoryExpanded) return;
    setAgentTurnTimelineState("exiting");
  };
  const handleAgentTurnTimelineExitComplete = () => {
    setAgentTurnTimelineState("hidden");
    setIsAgentTurnHistoryExpanded(false);
    if (agentTurnMock.isTerminal) {
      setIsAgentTurnTerminalSettled(true);
    }
  };
  const smartReplyState = useWorkbenchStore(
    useShallow((state) => ({
      activeMessageKey: activeConversationId
        ? state.smartReplyActiveMessageKeyByConversationId[activeConversationId]
        : undefined,
      autoPending: activeConversationId
        ? state.smartReplyAutoPendingMessageKeysByConversationId[
            activeConversationId
          ]
        : undefined,
      composerHasContent: activeConversationId
        ? state.composerHasContentByConversationId[activeConversationId]
        : false,
      draftConfirmationMessageKey: activeConversationId
        ? state.smartReplyDraftConfirmationMessageKeyByConversationId[
            activeConversationId
          ]
        : undefined,
      hidden: activeConversationId
        ? state.smartReplyHiddenMessageKeysByConversationId[activeConversationId]
        : undefined,
      pending: activeConversationId
        ? state.smartReplyPendingMessageKeysByConversationId[activeConversationId]
        : undefined,
      suggestions: activeConversationId
        ? state.smartReplyByMessageIdByConversationId[activeConversationId]
        : undefined,
    })),
  );
  const resolvedAuxiliaryPanel = activeAuxiliaryPanel ?? null;
  const resolvedAgentHostingStatus =
    fullAutoDisplayStatus ??
    resolveAgentHostingStatus(activeConversation, conversationAIHostingEnabled);
  const agentHostingStatus =
    activeConversation?.mode === "group" ||
    !conversationAIHostingEnabled ||
    resolvedAgentHostingStatus === "exited"
      ? null
      : resolvedAgentHostingStatus;
  const aiAssistantStatusVisible =
    resolveConversationAIAssistantEligibility({
      account: activeAccount,
      canUseConversationActions: canSendMessage,
      conversation: activeConversation,
    }).canUse && !agentHostingStatus;
  const sourceSmartReplyTurn = aiAssistantStatusVisible
    ? resolveSmartReplyAssistantTurn({
        activeMessageKey: smartReplyState.activeMessageKey,
        autoPending: smartReplyState.autoPending,
        draftConfirmationMessageKey:
          smartReplyState.draftConfirmationMessageKey,
        hidden: smartReplyState.hidden,
        messages,
        pending: smartReplyState.pending,
        suggestions: smartReplyState.suggestions,
      })
    : undefined;
  const customerResponsePreflight = useCustomerResponsePreflight({
    blocked: Boolean(
      hasBlockingAgentTurn ||
        sourceSmartReplyTurn ||
        isSendingDraft ||
        isConversationLoading ||
        multiSelectMode ||
        aiAssistantDebugScenario,
    ),
    conversationId:
      activeConversation?.mode === "single" ? activeConversationId : undefined,
    enabled:
      activeConversation?.mode === "single" &&
      aiAssistantStatusVisible &&
      Boolean(onTriggerSmartReply),
    messages,
    onAccept: ({ message }) => {
      onTriggerSmartReply?.(message, {
        confirmedComposerOverwrite: true,
      });
    },
  });
  const smartReplyComposer = useSmartReplyComposer({
    approvedOverwriteLookupKey,
    composerRef,
    conversationId: activeConversationId,
    conversationMessages: messages,
    draftText: composerDraftText,
    isSending: isSendingDraft,
    onSend: onSendSmartReply,
    quotedMessage,
    turn: sourceSmartReplyTurn,
  });
  const smartReplyUIPhase = resolveSmartReplyAssistantUIPhase({
    composerHasContent: Boolean(
      smartReplyState.composerHasContent ||
        composerDraftText.trim().length > 0 ||
        quotedMessage,
    ),
    hasAppliedSuggestion: smartReplyComposer.hasAppliedSuggestion,
    isOverwriteApproved:
      approvedOverwriteLookupKey === sourceSmartReplyTurn?.lookupKey,
    isOverwriteConfirmationRequested:
      smartReplyComposer.overwriteConfirmationLookupKey ===
      sourceSmartReplyTurn?.lookupKey,
    turn: sourceSmartReplyTurn,
  });
  const shouldConfirmComposerOverwrite =
    smartReplyUIPhase === "draft_confirmation";
  const smartReplyTurn =
    sourceSmartReplyTurn && shouldConfirmComposerOverwrite
      ? {
          ...sourceSmartReplyTurn,
          isComposerEditable: true,
          label: SMART_REPLY_DRAFT_CONFIRMATION_LABEL,
          phase: "draft_confirmation" as const,
          showComposer: false,
        }
      : sourceSmartReplyTurn;
  const isSmartReplySuggestionMode =
    !aiAssistantDebugScenario &&
    !agentTurnMock.isActive &&
    smartReplyUIPhase !== "draft_confirmation" &&
    smartReplyComposer.isSuggestionMode;
  const isSuggestionComposerMode =
    isSmartReplySuggestionMode || agentTurnMock.isReplyReady;
  const hasComposerStatusOverlay =
    Boolean(agentHostingStatus) || aiAssistantStatusVisible;
  const staticAIAssistantDebugView = aiAssistantDebugScenario
    ? getChatAIAssistantDebugScenarioView(aiAssistantDebugScenario)
    : null;
  const presentedAgentTurnView = isAgentTurnTerminalTransitioning
    ? {
        label: "思考中",
        status: "thinking" as const,
      }
    : agentTurnMock.view;
  const aiAssistantDebugView =
    presentedAgentTurnView ?? staticAIAssistantDebugView;
  const resolvedAIAssistantStatus =
    aiAssistantDebugView?.status ??
    (customerResponsePreflight.phase === "analyzing"
      ? "thinking"
      : customerResponsePreflight.phase === "confirmation"
        ? "confirmation"
        : smartReplyUIPhase === "applying"
          ? "thinking"
          : smartReplyTurn
            ? getSmartReplyStatusBarStatus(smartReplyTurn.phase)
            : aiAssistantStatus);
  const resolvedAIAssistantStatusLabel = aiAssistantDebugView
    ? aiAssistantDebugView.label
    : customerResponsePreflight.label
      ? customerResponsePreflight.label
      : smartReplyUIPhase === "applying"
        ? SMART_REPLY_INLINE_LOADING_HINT
        : smartReplyTurn
          ? smartReplyTurn.label
          : aiAssistantStatusLabel;

  const hasActiveFileUpload = fileUploadQueue.length > 0;
  const hasActiveConversation = activeConversation !== undefined;
  const isTicketSupported = isConversationTicketSupported(activeConversation);
  const canShowUserMemory = Boolean(
    activeConversation?.mode === "single" &&
    activeConversation.customerBindType !== 2 &&
    activeConversation.thirdExternalUserId?.trim(),
  );
  const sidebarPanelLabel = activeConversation?.mode === "group"
    ? "群成员信息栏"
    : "客户信息栏";
  const hasPersistentDesktopSidebar =
    !isMobileLayout &&
    hasActiveConversation &&
    (!isDesktopSidebarCollapsed || isUserMemoryOpen);

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
      isOpen={resolvedAuxiliaryPanel === "history"}
      onClose={onAuxiliaryPanelClose ?? onHistoryClose}
      onLoadMoreNext={onHistoryLoadMoreNext}
      onLoadMorePrev={onHistoryLoadMorePrev}
      onRefresh={onHistoryRefresh}
      onSetDay={onHistorySetDay}
      onSetScope={onHistorySetScope}
      onSetSenderId={onHistorySetSenderId}
    />
  ) : null;
  const ticketsPanelNode =
    isTicketSupported && ticketPanel && resolvedAuxiliaryPanel === "tickets" ? (
      <aside
        aria-label="工单"
        className="absolute inset-0 z-20 flex w-full min-w-0 flex-col border-l border-divider bg-surface"
      >
        <div className="flex items-center justify-between px-4 py-3">
          <p className="min-w-0 text-sm font-semibold text-foreground">工单</p>
          <Button
            aria-label="关闭工单"
            className="size-8 p-0"
            onClick={onAuxiliaryPanelClose ?? onHistoryClose}
            size="icon"
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon
              aria-hidden="true"
              icon={Cancel01Icon}
              size={18}
              strokeWidth={1.8}
            />
          </Button>
        </div>
        <div className="min-h-0 flex-1">{ticketPanel}</div>
      </aside>
    ) : null;
  const auxiliaryPanelNode =
    resolvedAuxiliaryPanel === "history"
      ? historyPanelNode
      : ticketsPanelNode;
  const customerSidePanelNode = activeConversation ? (
    <CustomerSidePanel
      accounts={accounts}
      accountName={accountName}
      conversationMode={activeConversation.mode}
      currentEmployeeId={currentEmployeeId}
      currentSeatThirdUserId={activeConversation.thirdUserId}
      customer={customer}
      groupMembers={groupMembers}
      isGroupMembersLoading={isGroupMembersLoading}
      isResizing={isResizingCustomerPanel}
      onRefreshGroupMembers={onRefreshGroupMembers}
      onResizeStart={onCustomerPanelResizeStart}
      onQuickReplyActiveChange={onQuickReplyActiveChange}
      onStartCustomerChat={onStartCustomerChat}
      panelWidth={isMobileLayout ? undefined : customerPanelWidth}
      quickReplyPanel={quickReplyPanel}
      showResizeHandle={!isMobileLayout}
      sidebarIframeConversationId={activeConversation.id}
      sidebarIframeSeatId={activeConversation.accountId}
      sidebarIframeTos={sidebarIframeTos}
      sidebarIframeSendStatus={sidebarIframeSendStatus}
      sidebarItems={sidebarItems}
      className={isMobileLayout ? "h-full w-full pt-12" : undefined}
    />
  ) : null;

  useEffect(() => {
    setIsMobileSidebarOpen(false);
  }, [activeConversation?.id, isMobileLayout]);

  useEffect(() => {
    setAIAssistantDebugScenario(null);
    setApprovedOverwriteLookupKey(undefined);
    setComposerDraftText("");
  }, [activeConversation?.id]);

  useEffect(() => {
    onEmojiPickerOpenChange(false);
  }, [isSuggestionComposerMode, onEmojiPickerOpenChange]);

  useEffect(() => {
    onComposerModeChange?.(
      isSuggestionComposerMode ? "suggestion" : "message",
    );
  }, [isSuggestionComposerMode, onComposerModeChange]);

  useEffect(() => {
    if (!sourceSmartReplyTurn) {
      setApprovedOverwriteLookupKey(undefined);
    }
  }, [sourceSmartReplyTurn]);

  useLayoutEffect(() => {
    onPersistentSidebarChange?.(hasPersistentDesktopSidebar);
  }, [hasPersistentDesktopSidebar, onPersistentSidebarChange]);

  useEffect(() => {
    if (!canShowUserMemory) {
      setIsUserMemoryOpen(false);
    }
  }, [canShowUserMemory]);

  useEffect(() => {
    if (isMobileLayout && !isMobileSidebarOpen) {
      onQuickReplyActiveChange?.(false);
    }
  }, [isMobileLayout, isMobileSidebarOpen, onQuickReplyActiveChange]);

  const isSidebarOpen = isMobileLayout
    ? isMobileSidebarOpen
    : !isDesktopSidebarCollapsed;
  const handleToggleSidebar = () => {
    if (isMobileLayout) {
      setIsMobileSidebarOpen((current) => !current);
      return;
    }

    if (!isDesktopSidebarCollapsed && resolvedAuxiliaryPanel) {
      (onAuxiliaryPanelClose ?? onHistoryClose)();
    }
    if (!isDesktopSidebarCollapsed) {
      onQuickReplyActiveChange?.(false);
    }
    setIsDesktopSidebarCollapsed((current) => {
      const next = !current;
      writeDesktopSidebarCollapsedPreference(next);
      return next;
    });
  };
  const handleOpenHistory = () => {
    if (!isMobileLayout) {
      setIsDesktopSidebarCollapsed(false);
      writeDesktopSidebarCollapsedPreference(false);
    }
    onOpenHistory();
  };
  const handleToggleTickets = () => {
    if (resolvedAuxiliaryPanel !== "tickets" && !isMobileLayout) {
      setIsDesktopSidebarCollapsed(false);
      writeDesktopSidebarCollapsedPreference(false);
    }
    onToggleTickets?.();
  };
  const handleComposerDraftChange = (nextDraft: string) => {
    setComposerDraftText(nextDraft);
    onDraftChange(nextDraft);
  };
  const handleDismissCurrentSmartReply = () => {
    if (!sourceSmartReplyTurn || !onDismissSmartReply) {
      return;
    }

    smartReplyComposer.clearTransientState();
    if (smartReplyComposer.hasAppliedSuggestion) {
      composerRef.current?.dispatchCommand(REPLACE_COMPOSER_COMMAND, {
        segments: [],
      });
      onClearQuotedMessage();
    }
    setApprovedOverwriteLookupKey(undefined);
    onDismissSmartReply(sourceSmartReplyTurn.message);
  };
  const handleApproveComposerOverwrite = () => {
    if (!sourceSmartReplyTurn || !onTriggerSmartReply) {
      return;
    }

    setApprovedOverwriteLookupKey(sourceSmartReplyTurn.lookupKey);
    onTriggerSmartReply(sourceSmartReplyTurn.message, {
      confirmedComposerOverwrite: true,
    });
  };
  const handleRegenerateSmartReply = () => {
    if (!sourceSmartReplyTurn || !onTriggerSmartReply) {
      return;
    }

    smartReplyComposer.clearTransientState();
    setApprovedOverwriteLookupKey(sourceSmartReplyTurn.lookupKey);
    onTriggerSmartReply(sourceSmartReplyTurn.message, { force: true });
  };
  const handleTriggerSmartReplyFromMessage = useCallback(
    (
      message: ChatMessage,
      options?: { force?: boolean },
    ) => {
      customerResponsePreflight.dismiss();
      onTriggerSmartReply?.(message, options);
    },
    [customerResponsePreflight.dismiss, onTriggerSmartReply],
  );
  const handleAIAssistantDebugStatusChange = (
    scenario: ChatAIAssistantDebugScenario,
  ) => {
    agentTurnMock.reset({ clearComposer: agentTurnMock.isReplyReady });
    setAIAssistantDebugScenario(scenario);
  };
  const handleAgentTurnMockScenarioSelect = (
    scenario: Parameters<typeof agentTurnMock.startScenario>[0],
  ) => {
    customerResponsePreflight.dismiss();
    if (sourceSmartReplyTurn) {
      toast.error("请先处理当前话术建议");
      return;
    }

    setAIAssistantDebugScenario(null);
    void agentTurnMock.startScenario(scenario);
  };
  const handleSendAgentTurnMockReply = (segments: ComposerSegment[]) => {
    void Promise.resolve(onSendDraft(segments))
      .then((didSend) => {
        if (didSend) {
          agentTurnMock.markReplyHandled();
        }
      })
      .catch(() => {});
  };
  const resolvedAIAssistantActions: readonly ChatAIAssistantAction[] =
    presentedAgentTurnView
      ? isAgentTurnTerminalTransitioning
        ? []
        : agentTurnMock.actions
      : aiAssistantDebugScenario === "thinking-cancellable"
      ? [
          {
            id: "stop",
            label: "停止",
            onSelect: () => setAIAssistantDebugScenario("waiting"),
            tone: "quiet",
          },
        ]
      : aiAssistantDebugScenario === "confirmation"
        ? [
            {
              id: "ignore",
              label: "忽略",
              onSelect: () => setAIAssistantDebugScenario("waiting"),
              tone: "quiet",
            },
            {
              id: "approve",
              label: "批准",
              onSelect: () =>
                setAIAssistantDebugScenario("thinking-cancellable"),
              tone: "primary",
            },
          ]
        : customerResponsePreflight.phase === "confirmation"
          ? [
              {
                id: "ignore-preflight",
                label: "忽略",
                onSelect: customerResponsePreflight.dismiss,
                tone: "quiet",
              },
              {
                disabled: !onTriggerSmartReply,
                id: "start-preflight",
                label: getCustomerResponsePreflightActionLabel(
                  customerResponsePreflight.direction,
                ),
                onSelect: onTriggerSmartReply
                  ? customerResponsePreflight.accept
                  : undefined,
                tone: "primary",
              },
            ]
        : smartReplyTurn?.phase === "draft_confirmation"
          ? [
              {
                disabled: !onDismissSmartReply,
                id: "ignore",
                label: "忽略",
                onSelect: onDismissSmartReply
                  ? handleDismissCurrentSmartReply
                  : undefined,
                tone: "quiet",
              },
              {
                disabled: !onTriggerSmartReply,
                id: "draft",
                label: "起草回复",
                onSelect: onTriggerSmartReply
                  ? handleApproveComposerOverwrite
                  : undefined,
                tone: "primary",
              },
            ]
          : smartReplyUIPhase !== "applying" &&
            smartReplyTurn &&
            (smartReplyTurn.phase === "confirmation" ||
              smartReplyTurn.phase === "failed")
          ? [
              {
                disabled: !onDismissSmartReply,
                id: "ignore",
                label: "忽略",
                onSelect: onDismissSmartReply
                  ? handleDismissCurrentSmartReply
                  : undefined,
                tone: "quiet",
              },
              {
                disabled: !onTriggerSmartReply,
                id: "regenerate",
                label: "重新生成",
                onSelect: onTriggerSmartReply
                  ? handleRegenerateSmartReply
                  : undefined,
                tone: "primary",
              },
            ]
          : (aiAssistantActions ?? []);
  const displayedAIAssistantActions = multiSelectMode
    ? resolvedAIAssistantActions.map((action) => ({
        ...action,
        disabled: true,
      }))
    : resolvedAIAssistantActions;
  const agentTurnProcessControl = canExpandAgentTurnHistory
    ? {
        disabled:
          isAgentTurnHistoryExpanded ||
          agentTurnTimelineState !== "hidden",
        onExpand: handleExpandAgentTurnHistory,
      }
    : undefined;

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col bg-surface">
      <ChatHeader
        activeConversation={activeConversation}
        isAIHostingEnabled={conversationAIHostingEnabled}
        isConversationActionDisabled={isConversationActionDisabled}
        isMobileLayout={isMobileLayout}
        isSidebarOpen={isSidebarOpen}
        isHistoryPanelOpen={resolvedAuxiliaryPanel === "history"}
        isTicketsPanelOpen={resolvedAuxiliaryPanel === "tickets"}
        isUserMemoryOpen={isUserMemoryOpen}
        onBack={isMobileLayout ? onBackToConversationList : undefined}
        onMarkConversationRead={
          activeConversation && onMarkConversationRead
            ? () => onMarkConversationRead(activeConversation.id)
            : undefined
        }
        onMarkConversationUnread={
          activeConversation && onMarkConversationUnread
            ? () => onMarkConversationUnread(activeConversation.id)
            : undefined
        }
        onOpenHistory={handleOpenHistory}
        onPinConversation={
          activeConversation && onPinConversation
            ? () => onPinConversation(activeConversation.id)
            : undefined
        }
        onToggleSidebar={hasActiveConversation ? handleToggleSidebar : undefined}
        onToggleTickets={
          isTicketSupported && ticketPanel && onToggleTickets
            ? handleToggleTickets
            : undefined
        }
        ticketReminderCount={ticketReminderCount}
        ticketReminderDisplayMode={ticketReminderDisplayMode}
        onUnpinConversation={
          activeConversation && onUnpinConversation
            ? () => onUnpinConversation(activeConversation.id)
            : undefined
        }
        onUserMemoryOpenChange={setIsUserMemoryOpen}
      />

      <div className="flex min-h-0 min-w-0 flex-1" ref={workbenchBodyRef}>
        {hasActiveConversation ? (
          <>
            <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-surface">
              {hasConversationHandoff(activeConversation.handoffMsgId) &&
              onMarkHandoffHandled &&
              onViewHandoffMessage ? (
                <ChatHandoffStatusBar
                  canMarkHandled={canMarkHandoffHandled}
                  isPending={isHandoffClearPending}
                  onMarkHandled={onMarkHandoffHandled}
                  onViewMessage={onViewHandoffMessage}
                />
              ) : null}

              <div className="relative flex min-h-0 flex-1 flex-col">
                <ChatMessagePanel
                  activeHistoryStatus={activeHistoryStatus}
                  canCollectMaterialActions={canCollectMaterialActions}
                  canUseMessageActions={canSendMessage}
                  canUseMessageForward={canUseMessageForward}
                  hasComposerStatusOverlay={hasComposerStatusOverlay}
                  hasMoreHistory={hasMoreHistory}
                  historyLoadLabel={historyLoadLabel}
                  isConversationLoading={isConversationLoading}
                  conversationId={activeConversation.id}
                  conversationMode={activeConversation.mode}
                  customerAvatarFallbackUrl={
                    activeConversation.customerBindType === 2
                      ? activeConversation.customerAvatarUrl
                      : undefined
                  }
                  messages={messages}
                  multiSelectMode={multiSelectMode}
                  selectedMessageKeys={selectedMessageKeys}
                  messageViewportRef={messageViewportRef}
                  onCollectMaterial={onCollectMaterial}
                  onEnterMultiSelectMode={onEnterMultiSelectMode}
                  onForwardMessage={onForwardMessage}
                  onDownloadMessageFile={onDownloadMessageFile}
                  onMentionMessage={onMentionMessage}
                  onLoadOlderMessages={onLoadOlderMessages}
                  onOpenQuotedMessage={onOpenQuotedMessage}
                  onQuoteMessage={onQuoteMessage}
                  onTriggerSmartReply={
                    onTriggerSmartReply
                      ? handleTriggerSmartReplyFromMessage
                      : undefined
                  }
                  onToggleMessageSelection={onToggleMessageSelection}
                  onRevokeMessage={onRevokeMessage}
                  onMessageViewportScroll={onMessageViewportScroll}
                  onRetryMessage={onRetryMessage}
                  onLoadSendFailReason={onLoadSendFailReason}
                  onTranscribeVoice={onTranscribeVoice}
                  onVoicePlaybackReady={onVoicePlaybackReady}
                  retryingMessageIds={retryingMessageIds}
                />

                <div
                  className="relative z-10 -mt-12 shrink-0"
                  data-testid="chat-composer-region"
                >
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -top-12 bottom-0 left-0 right-[var(--scrollbar-size)] bg-linear-to-b from-transparent via-surface/85 to-surface"
                  />
                  {scopeTransitionError ? (
                    <div
                      className="relative z-20 flex min-h-8 items-center justify-between gap-3 border-t border-destructive/10 bg-destructive/55 px-5 py-1.5 text-xs font-medium leading-5 text-destructive-foreground/90 shadow-[0_-4px_16px_var(--shadow-soft)] backdrop-blur-md"
                      data-testid="scope-transition-error"
                      role="status"
                    >
                      <span className="min-w-0 truncate">
                        {scopeTransitionError}
                      </span>
                      <button
                        aria-label="关闭错误提示"
                        className="inline-flex size-6 shrink-0 items-center justify-center rounded-[6px] text-destructive-foreground/75 outline-none transition-colors hover:bg-destructive-foreground/10 hover:text-destructive-foreground focus-visible:ring-2 focus-visible:ring-destructive-foreground/30"
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

                  <div className="relative z-10 flex flex-col overflow-visible">
                    {hasActiveFileUpload ? (
                      <div className="relative z-20 mx-auto -mb-3 w-[calc(100%-2rem)] max-w-[860px]">
                        <FileUploadQueueBar
                          items={fileUploadQueue}
                          onCancelFileUpload={onCancelFileUpload}
                        />
                      </div>
                    ) : null}
                    <div
                      className={cn(
                        "relative flex flex-col",
                        multiSelectMode && "z-40",
                      )}
                    >
                      {agentHostingStatus ? (
                        <div
                          className="absolute left-1/2 top-1 z-30 w-4/5 max-w-[520px] -translate-x-1/2 -translate-y-full"
                          data-testid="chat-agent-hosting-status-bar-anchor"
                        >
                          <ChatAgentHostingStatusBar
                            onCancel={onCancelAgentHosting}
                            onEnable={onEnableAgentHosting}
                            status={agentHostingStatus}
                          />
                        </div>
                      ) : aiAssistantStatusVisible ? (
                        <div
                          className={cn(
                            "absolute left-1/2 top-1 z-0 w-[calc(100%-2rem)] max-w-[860px] -translate-x-1/2",
                            showAgentTurnTimeline ||
                              hasBlockingAgentInteraction
                              ? "-translate-y-full"
                              : "-translate-y-[42px]",
                            multiSelectMode && "pointer-events-none",
                          )}
                          data-testid="chat-ai-assistant-status-bar-anchor"
                          inert={multiSelectMode || undefined}
                        >
                          <div className="flex flex-col">
                            <div className="relative z-10 order-2">
                              {agentTurnMock.approval ? (
                                <ChatAgentToolApprovalPrompt
                                  approval={agentTurnMock.approval}
                                  disabled={agentTurnMock.isResolvingApproval}
                                  onApprove={() =>
                                    void agentTurnMock.resolveApproval({
                                      action: "approve",
                                    })
                                  }
                                  onRedirect={(instruction) =>
                                    void agentTurnMock.resolveApproval({
                                      action: "redirect",
                                      instruction,
                                    })
                                  }
                                  onReject={() =>
                                    void agentTurnMock.resolveApproval({
                                      action: "reject",
                                    })
                                  }
                                />
                              ) : agentTurnMock.clarification ? (
                                <ChatAgentClarificationPrompt
                                  disabled={agentTurnMock.isResolvingClarification}
                                  input={agentTurnMock.clarification}
                                  onRespond={(response) =>
                                    void agentTurnMock.resolveClarification(
                                      response,
                                    )
                                  }
                                  onTerminate={() =>
                                    void agentTurnMock.terminate()
                                  }
                                />
                              ) : (
                                <ChatAIAssistantStatusBar
                                  actions={displayedAIAssistantActions}
                                  customerName={activeConversation.customerName}
                                  delayTransitionMs={200}
                                  immediateWaitingToThinking
                                  key={activeConversation.id}
                                  label={resolvedAIAssistantStatusLabel}
                                  processControl={agentTurnProcessControl}
                                  reason={
                                    presentedAgentTurnView?.reason ??
                                    smartReplyTurn?.reason
                                  }
                                  status={resolvedAIAssistantStatus}
                                  waitingForCustomer={Boolean(
                                    presentedAgentTurnView?.waitingForCustomer ||
                                      (smartReplyTurn &&
                                        smartReplyTurn.phase === "skipped"),
                                  )}
                                />
                              )}
                              <ChatAIAssistantDebugMenu
                                className="absolute left-[calc(100%+0.5rem)] top-[21px] -translate-y-1/2 max-[940px]:left-auto max-[940px]:right-1"
                                mockScenario={agentTurnMock.activeScenario}
                                onMockScenarioSelect={
                                  handleAgentTurnMockScenarioSelect
                                }
                                onValueChange={handleAIAssistantDebugStatusChange}
                                value={
                                  aiAssistantDebugScenario ??
                                  resolvedAIAssistantStatus
                                }
                              />
                            </div>
                            {showAgentTurnTimeline ? (
                              <div className="relative z-0 order-1 mx-5 -mb-4">
                                <ChatAgentTurnTimeline
                                  events={agentTurnMock.events}
                                  motion={
                                    agentTurnTimelineState === "exiting"
                                      ? "exit"
                                      : "enter"
                                  }
                                  onCollapse={
                                    isAgentTurnHistoryExpanded
                                      ? handleCollapseAgentTurnHistory
                                      : undefined
                                  }
                                  onExitComplete={
                                    handleAgentTurnTimelineExitComplete
                                  }
                                />
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                      <div
                        className={cn(
                          "flex flex-col",
                          multiSelectMode && "pointer-events-none",
                        )}
                        inert={multiSelectMode || undefined}
                      >
                        <ChatComposer
                          canConfigureSeatAIHosting={canConfigureSeatAIHosting}
                          canConfigureSeatSemiAuto={canConfigureSeatSemiAuto}
                          canToggleConversationAIHosting={
                            canToggleConversationAIHosting
                          }
                          canSendMessage={
                            agentTurnMock.isReplyReady
                              ? canSendMessage
                              : isSmartReplySuggestionMode
                              ? smartReplyComposer.canEdit
                              : canSendMessage
                          }
                          composerMode={
                            isSuggestionComposerMode
                              ? "suggestion"
                              : "message"
                          }
                          conversationId={activeConversation.id}
                          historyKey={activeConversation.id}
                          shouldShowConversationAIHostingControl={
                            shouldShowConversationAIHostingControl
                          }
                          fullAutoActionPending={fullAutoActionPending}
                          seatAgentModeActionPending={seatAgentModeActionPending}
                          hasActiveFileUpload={hasActiveFileUpload}
                          currentSeatThirdUserId={
                            activeConversation.thirdUserId
                          }
                          groupMembers={groupMembers}
                          isGroupConversation={
                            activeConversation.mode === "group"
                          }
                          inputEnterBehavior={inputEnterBehavior}
                          isEmojiPickerOpen={isEmojiPickerOpen}
                          isMobileLayout={isMobileLayout}
                          isSending={isSendingDraft}
                          accountAvatarUrl={
                            activeAccount?.avatarUrl ?? accountAvatarUrl
                          }
                          accountName={activeAccount?.name ?? accountName}
                          seatAIHostingAuth={
                            activeAccount?.seatAIHostingAuth === true
                          }
                          seatSemiAutoAuth={
                            activeAccount?.semiAutoAuth === true
                          }
                          conversationAIHostingConfigured={
                            conversationAIHostingConfigured
                          }
                          fullAutoSwitch={
                            activeAccount?.fullAutoSwitch === true
                          }
                          semiAutoSwitch={
                            activeAccount?.semiAutoSwitch === true
                          }
                          collectedExpressions={collectedExpressions}
                          hasMoreCollectedExpressions={
                            hasMoreCollectedExpressions
                          }
                          isCollectedExpressionLoadingMore={
                            isCollectedExpressionLoadingMore
                          }
                          sendingCollectedExpressionId={
                            sendingCollectedExpressionId
                          }
                          onClearQuotedMessage={onClearQuotedMessage}
                          onDeleteCollectedExpression={
                            onDeleteCollectedExpression
                          }
                          notice={
                            isSmartReplySuggestionMode
                              ? smartReplyComposer.notice
                              : undefined
                          }
                          onDraftChange={handleComposerDraftChange}
                          onEmojiPickerOpenChange={onEmojiPickerOpenChange}
                          onEnterBehaviorChange={onEnterBehaviorChange}
                          onFileSelect={onFileSelect}
                          onChangeSeatAgentMode={
                            onChangeSeatAgentMode ?? noopChangeSeatAgentMode
                          }
                          onChangeFullAuto={
                            onChangeFullAuto ?? noopChangeFullAuto
                          }
                          onLoadMoreCollectedExpressions={
                            onLoadMoreCollectedExpressions
                          }
                          onOpenCollectedExpressions={
                            onOpenCollectedExpressions
                          }
                          onOpenMaterialLibrary={
                            onOpenMaterialLibrary ?? noop
                          }
                          onSelectCollectedExpression={
                            onSelectCollectedExpression
                          }
                          onSegmentsChange={onComposerSegmentsChange}
                          onSendDraft={
                            agentTurnMock.isReplyReady
                              ? handleSendAgentTurnMockReply
                              : isSmartReplySuggestionMode
                              ? smartReplyComposer.onSendDraft
                              : onSendDraft
                          }
                          onTopCollectedExpression={onTopCollectedExpression}
                          placeholder={
                            agentHostingStatus
                              ? "托管中，不支持发送消息"
                              : isSuggestionComposerMode
                                ? "编辑话术建议"
                              : composerPlaceholder
                          }
                          quotedMessage={quotedMessage}
                          rightActions={
                            isSmartReplySuggestionMode
                              ? smartReplyComposer.rightActions
                              : undefined
                          }
                          sendLabel={
                            isSuggestionComposerMode
                              ? "采纳并发送"
                              : undefined
                          }
                          composerRef={composerRef}
                        />
                        {smartReplyComposer.dialog}
                      </div>
                      {multiSelectMode && multiSelectToolbar ? (
                        <div
                          className="absolute inset-x-0 bottom-0 top-1 z-10 flex items-center justify-center bg-surface/85"
                          data-testid="message-multi-select-composer-overlay"
                        >
                          {multiSelectToolbar}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
              {isMobileLayout ? auxiliaryPanelNode : null}
            </div>

            {isMobileLayout ? (
              <Sheet
                onOpenChange={setIsMobileSidebarOpen}
                open={isMobileSidebarOpen}
              >
                <SheetContent
                  className="w-[min(24rem,calc(100vw-1rem))] max-w-none overflow-hidden p-0"
                  side="right"
                >
                  <SheetTitle className="sr-only">{sidebarPanelLabel}</SheetTitle>
                  <SheetDescription className="sr-only">
                    查看当前会话的客户信息、快捷话术和扩展侧边栏
                  </SheetDescription>
                  {customerSidePanelNode}
                </SheetContent>
              </Sheet>
            ) : isDesktopSidebarCollapsed ? (
              isUserMemoryOpen ? (
                <div
                  aria-hidden="true"
                  className="h-full shrink-0 bg-surface"
                  data-testid="user-memory-reserved-rail"
                  style={{ width: CHAT_USER_MEMORY_RESERVED_WIDTH }}
                />
              ) : null
            ) : (
              <div
                className="relative flex h-full min-h-0 min-w-0 shrink-0"
                data-testid="customer-side-panel-shell"
                style={{ width: `${customerPanelWidth + 4}px` }}
              >
                <div
                  className={cn(
                    "flex h-full min-h-0 shrink-0",
                    resolvedAuxiliaryPanel
                      ? "invisible pointer-events-none"
                      : "visible",
                  )}
                  data-testid="customer-side-panel-layout"
                >
                  {customerSidePanelNode}
                </div>
                {auxiliaryPanelNode}
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

function readDesktopSidebarCollapsedPreference() {
  try {
    return (
      window.localStorage.getItem(WORKBENCH_SIDEBAR_COLLAPSED_STORAGE_KEY) ===
      "true"
    );
  } catch {
    return false;
  }
}

function writeDesktopSidebarCollapsedPreference(isCollapsed: boolean) {
  try {
    window.localStorage.setItem(
      WORKBENCH_SIDEBAR_COLLAPSED_STORAGE_KEY,
      String(isCollapsed),
    );
  } catch {
    // Sidebar persistence is best-effort; the current session still updates.
  }
}

function getSmartReplyStatusBarStatus(
  phase: SmartReplyAssistantPhase,
): ChatAIAssistantStatus {
  if (phase === "thinking") {
    return "thinking";
  }

  if (
    phase === "draft_confirmation" ||
    phase === "confirmation" ||
    phase === "failed"
  ) {
    return "confirmation";
  }

  return "waiting";
}

function getCustomerResponsePreflightActionLabel(
  direction?: CustomerResponseDirection,
) {
  if (direction === "provide_response") {
    return "起草回复";
  }

  if (direction === "request_information") {
    return "起草追问";
  }

  return "开始处理";
}

function noop() {}

function getLatestCustomerMessageId(messages: Message[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];

    if (message?.role === "customer") {
      return message.seq != null ? String(message.seq) : undefined;
    }
  }

  return undefined;
}

function noopChangeSeatAgentMode() {}

function noopChangeFullAuto() {}
