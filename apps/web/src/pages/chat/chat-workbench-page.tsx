import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { LexicalEditor } from "lexical";
import { AlertCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DotMatrixLoader } from "@/components/ui/dot-matrix-loader";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import {
  MATERIAL_COLLECTION_BIZ_TYPE,
  type WorkbenchQuickReplyCategoryDto,
  type WorkbenchQuickReplyDto,
} from "@chatai/contracts";
import { notifyAuthSessionChanged } from "@/pages/auth/auth-tokens";
import { logout } from "@/pages/auth/auth-service";
import { useAuthStore } from "@/store/auth-store";
import { AccountRail } from "@/pages/chat/components/account-rail";
import { ChatPanel } from "@/pages/chat/components/chat-panel";
import { ConversationListPanel } from "@/pages/chat/components/conversation-list-panel";
import { CustomerPage } from "@/pages/chat/customer-page";
import type { InputEnterBehavior } from "@/pages/chat/components/input-enter-behavior";
import {
  MaterialGroupSelectDialog,
  MaterialLibraryDialog,
} from "@/pages/chat/components/material-collection";
import {
  CLEAR_COMPOSER_COMMAND,
  INSERT_COMPOSER_MENTION_COMMAND,
  RESTORE_COMPOSER_COMMAND,
  UPDATE_COMPOSER_IMAGE_COMMAND,
} from "@/pages/chat/components/composer/lexical-commands";
import { useAccountRailResize } from "@/pages/chat/hooks/use-account-rail-resize";
import { useCustomerPanelResize } from "@/pages/chat/hooks/use-customer-panel-resize";
import { useMessageScrollRestoration } from "@/pages/chat/hooks/use-message-scroll-restoration";
import {
  getFirstUnreadCustomerMessageKey,
  useVisibleUnreadConversationRead,
} from "@/pages/chat/hooks/use-visible-unread-conversation-read";
import { useConversationRevealTimer } from "@/pages/chat/hooks/use-conversation-reveal-timer";
import { useSmartReplyState } from "@/pages/chat/hooks/use-smart-reply-state";
import { useMaterialCollection } from "@/pages/chat/hooks/use-material-collection";
import { useQuickReplies } from "@/pages/chat/hooks/use-quick-replies";
import { useWorkbenchPolling } from "@/pages/chat/hooks/use-workbench-polling";
import type { PollingPauseReason } from "@/pages/chat/hooks/use-workbench-polling";
import { isValidMessageSeq } from "@/pages/chat/lib/message-seq";
import { useWorkbenchStore } from "@/store/workbench-store";
import type {
  ChatMessage,
  ChatMode,
  FileUploadQueueItem,
  QuotedMessagePreviewContent,
} from "@/pages/chat/chat-types";
import {
  MEDIA_UPLOAD_SDK_LOAD_FAILED_CODE,
  MEDIA_UPLOAD_SDK_LOAD_FAILED_MESSAGE,
} from "@/pages/chat/api/media-upload-errors";
import { uploadWorkbenchFile } from "@/pages/chat/api/media-upload-service";
import { getVisibleConversations } from "@/pages/chat/api/workbench-gateway";
import { downloadMessageFile } from "@/pages/chat/api/workbench-gateway";
import {
  isComposerFileSizeAllowed,
  isSupportedComposerFile,
} from "@/pages/chat/lib/composer-file-files";
import {
  extractComposerMentionState,
  type ComposerSegment,
} from "@/pages/chat/lib/composer-segments";
import {
  hasConversationComposerDraftContent,
  isConversationListedInWorkbench,
} from "@/pages/chat/lib/conversation-composer-draft";
import { QuickReplyCategoryDialog } from "@/pages/chat/components/quick-reply/quick-reply-category-dialog";
import { QuickReplyFormDialog } from "@/pages/chat/components/quick-reply/quick-reply-form-dialog";
import { QuickReplyPanel } from "@/pages/chat/components/quick-reply/quick-reply-panel";
import { buildQuickReplyComposerSegments } from "@/pages/chat/lib/quick-reply-segments";
import type { QuickReplyFormValues } from "@/pages/chat/hooks/use-quick-replies";
import { resolveWorkbenchPermissions } from "@/pages/chat/lib/workbench-permissions";
import { openMessageDownloadUrl } from "@/pages/chat/lib/message-download";
import { canUseExpiringUrl } from "@/pages/chat/lib/message-url-expiry";
import { findViewportAnchor } from "@/pages/chat/lib/scroll-anchor";
import {
  CONVERSATION_LIST_PANEL_WIDTH,
  MIN_WORKBENCH_CONTENT_WIDTH,
} from "@/pages/chat/lib/panel-width";

const ACCOUNT_RAIL_COLLAPSED_STORAGE_KEY = "chatai.accountRailCollapsed";

type MentionRetryDialogState = {
  conversationId: string;
  displayName: string;
  groupMemberId: string;
  refreshedOnce: boolean;
};

function getInitialAccountRailCollapsed() {
  try {
    return (
      window.localStorage.getItem(ACCOUNT_RAIL_COLLAPSED_STORAGE_KEY) === "true"
    );
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
  const location = useLocation();
  const navigate = useNavigate();
  const activeView =
    location.pathname === "/chat/customers"
      ? "customers"
      : "chat";

  return (
    <ChatWorkbenchContent
      activeView={activeView}
      onNavigateCustomerPage={() => {
        navigate("/chat/customers");
      }}
      onNavigateChat={() => {
        navigate("/chat");
      }}
      onOpenSettings={() => {
        navigate("/chat/settings");
      }}
    />
  );
}

function ChatWorkbenchContent({
  activeView = "chat",
  onNavigateChat,
  onNavigateCustomerPage,
  onOpenSettings,
}: {
  activeView?: "chat" | "customers";
  onNavigateChat?: () => void;
  onNavigateCustomerPage?: () => void;
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
    deleteConversation,
    groupMembersLoadingByConversationId,
    groupMembersByConversationId,
    dismissScopeTransitionError,
    dismissReadReceiptError,
    hasMoreHistoryByConversationId,
    historyStatusByConversationId,
    historyPanelByConversationId,
    historyPanelErrorByConversationId,
    historyPanelFiltersByConversationId,
    historyPanelLoadingByConversationId,
    historyPanelScrollModeByConversationId,
    historyPanelOpenConversationId,
    initializeWorkbench,
    isConversationLoading,
    loadActiveGroupMembers,
    loadOlderMessages,
    refreshSeatSummaries,
    markConversationRead,
    markConversationUnread,
    me,
    messagePaginationByConversationId,
    messagesByConversationId,
    pollIntervalMs,
    pollJitterMs,
    pollWorkbench,
    dismissSmartReply,
    requestSmartReplyGeneralAnswer,
    requestSmartReplyMakeShorter,
    readReceiptError,
    resetWorkbenchSession,
    revokeMessage,
    pinConversation,
    retryFailedMessage,
    saveComposerDraft,
    setChatSendPermission,
    closeHistoryPanel,
    clearActiveConversation,
    clearComposerDraft,
    composerDraftsByConversationId,
    loadHistoryMessages,
    openHistoryPanel,
    setHistoryPanelDay,
    setHistoryPanelScope,
    setHistoryPanelSenderId,
    scopeTransitionError,
    sendAgentMessageSegments,
    sendSmartReply,
    setActiveAccount,
    setActiveConversation,
    setActiveMode,
    sidebarItems,
    selectOrCreateAndSelectConversation,
    takeOverAccount,
    takeoverStatusByAccountId,
    unpinConversation,
    updateMessageDownloadContent,
    confirmVoicePlaybackReady,
    transcribeVoiceMessage,
  } = useWorkbenchStore(
    useShallow((state) => ({
      accounts: state.accounts,
      activeAccountId: state.activeAccountId,
      activeConversationId: state.activeConversationId,
      activeMode: state.activeMode,
      bootstrapError: state.bootstrapError,
      bootstrapStatus: state.bootstrapStatus,
      clearActiveConversation: state.clearActiveConversation,
      clearComposerDraft: state.clearComposerDraft,
      closeHistoryPanel: state.closeHistoryPanel,
      composerDraftsByConversationId: state.composerDraftsByConversationId,
      confirmVoicePlaybackReady: state.confirmVoicePlaybackReady,
      conversationListsByScope: state.conversationListsByScope,
      customerProfilesById: state.customerProfilesById,
      deleteConversation: state.deleteConversation,
      dismissReadReceiptError: state.dismissReadReceiptError,
      dismissScopeTransitionError: state.dismissScopeTransitionError,
      dismissSmartReply: state.dismissSmartReply,
      groupMembersByConversationId: state.groupMembersByConversationId,
      groupMembersLoadingByConversationId:
        state.groupMembersLoadingByConversationId,
      hasMoreHistoryByConversationId: state.hasMoreHistoryByConversationId,
      historyPanelByConversationId: state.historyPanelByConversationId,
      historyPanelErrorByConversationId:
        state.historyPanelErrorByConversationId,
      historyPanelFiltersByConversationId:
        state.historyPanelFiltersByConversationId,
      historyPanelLoadingByConversationId:
        state.historyPanelLoadingByConversationId,
      historyPanelOpenConversationId: state.historyPanelOpenConversationId,
      historyPanelScrollModeByConversationId:
        state.historyPanelScrollModeByConversationId,
      historyStatusByConversationId: state.historyStatusByConversationId,
      initializeWorkbench: state.initializeWorkbench,
      isConversationLoading: state.isConversationLoading,
      loadActiveGroupMembers: state.loadActiveGroupMembers,
      loadHistoryMessages: state.loadHistoryMessages,
      loadOlderMessages: state.loadOlderMessages,
      markConversationRead: state.markConversationRead,
      markConversationUnread: state.markConversationUnread,
      me: state.me,
      messagePaginationByConversationId:
        state.messagePaginationByConversationId,
      messagesByConversationId: state.messagesByConversationId,
      openHistoryPanel: state.openHistoryPanel,
      pinConversation: state.pinConversation,
      pollIntervalMs: state.pollState.intervalMs,
      pollJitterMs: state.pollState.jitterMs,
      pollWorkbench: state.pollWorkbench,
      readReceiptError: state.readReceiptError,
      resetWorkbenchSession: state.resetWorkbenchSession,
      refreshSeatSummaries: state.refreshSeatSummaries,
      requestSmartReplyGeneralAnswer: state.requestSmartReplyGeneralAnswer,
      requestSmartReplyMakeShorter: state.requestSmartReplyMakeShorter,
      retryFailedMessage: state.retryFailedMessage,
      revokeMessage: state.revokeMessage,
      saveComposerDraft: state.saveComposerDraft,
      scopeTransitionError: state.scopeTransitionError,
      selectOrCreateAndSelectConversation:
        state.selectOrCreateAndSelectConversation,
      sendAgentMessageSegments: state.sendAgentMessageSegments,
      sendSmartReply: state.sendSmartReply,
      setActiveAccount: state.setActiveAccount,
      setActiveConversation: state.setActiveConversation,
      setActiveMode: state.setActiveMode,
      setChatSendPermission: state.setChatSendPermission,
      setHistoryPanelDay: state.setHistoryPanelDay,
      setHistoryPanelScope: state.setHistoryPanelScope,
      setHistoryPanelSenderId: state.setHistoryPanelSenderId,
      sidebarItems: state.sidebarItems,
      takeOverAccount: state.takeOverAccount,
      takeoverStatusByAccountId: state.takeoverStatusByAccountId,
      transcribeVoiceMessage: state.transcribeVoiceMessage,
      unpinConversation: state.unpinConversation,
      updateMessageDownloadContent: state.updateMessageDownloadContent,
    })),
  );
  const subUser = useAuthStore((state) => state.subUser);

  const [draft, setDraft] = useState("");
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [composerSegments, setComposerSegments] = useState<ComposerSegment[]>(
    [],
  );
  const [sendFailureDialog, setSendFailureDialog] = useState<{
    description?: string;
    title: string;
  } | null>(null);
  const [quickReplyFormState, setQuickReplyFormState] = useState<
    | { defaultCategoryId: string | 0; mode: "create" }
    | { mode: "copy"; quickReply: WorkbenchQuickReplyDto }
    | { mode: "edit"; quickReply: WorkbenchQuickReplyDto }
    | null
  >(null);
  const [quickReplyCategoryFormState, setQuickReplyCategoryFormState] =
    useState<
      | { mode: "create"; parentId: string | 0 }
      | { category: WorkbenchQuickReplyCategoryDto; mode: "edit" }
      | null
    >(null);
  const [isQuickReplyPanelActive, setIsQuickReplyPanelActive] = useState(false);
  const quickReplyInitialValues = useMemo(
    () => getQuickReplyInitialValues(quickReplyFormState),
    [quickReplyFormState],
  );
  const [pollingPauseReason, setPollingPauseReason] =
    useState<PollingPauseReason | null>(null);
  const handlePollingPaused = useCallback((reason: PollingPauseReason) => {
    setPollingPauseReason(reason);
  }, []);
  const [fileUploadTransitionError, setFileUploadTransitionError] = useState<
    string | undefined
  >();
  const [fileUploadQueue, setFileUploadQueue] = useState<FileUploadQueueItem[]>(
    [],
  );
  const [isSendingDraft, setIsSendingDraft] = useState(false);
  const [retryingUiMessageKeys, setRetryingUiMessageKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [quotedMessage, setQuotedMessage] =
    useState<QuotedMessagePreviewContent | null>(null);
  const [mentionRetryDialogState, setMentionRetryDialogState] =
    useState<MentionRetryDialogState | null>(null);
  const [isRefreshingMentionTarget, setIsRefreshingMentionTarget] =
    useState(false);
  const [isAccountRailCollapsed, setIsAccountRailCollapsed] = useState(
    getInitialAccountRailCollapsed,
  );
  const [inputEnterBehavior, setInputEnterBehavior] =
    useState<InputEnterBehavior>("send");
  const workbenchBodyRef = useRef<HTMLDivElement | null>(null);
  const messageViewportRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<LexicalEditor | null>(null);
  const mentionRetryDialogStateRef =
    useRef<MentionRetryDialogState | null>(null);
  const isSendingDraftRef = useRef(false);
  const shouldRestoreComposerFocusRef = useRef(false);
  const isMountedRef = useRef(true);
  const activeConversationIdRef = useRef<string | undefined>(activeConversationId);
  const composerDraftHydratedConversationIdRef = useRef<string | undefined>(
    undefined,
  );
  const draftRef = useRef(draft);
  const composerSegmentsRef = useRef(composerSegments);
  const quotedMessageRef = useRef(quotedMessage);
  draftRef.current = draft;
  composerSegmentsRef.current = composerSegments;
  quotedMessageRef.current = quotedMessage;
  const fileUploadQueueRef = useRef<typeof fileUploadQueue>([]);
  const fileUploadAbortControllersRef = useRef(
    new Map<string, AbortController>(),
  );
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
      resetWorkbenchSession();
      notifyAuthSessionChanged();
    }
  }

  const handleAccountRailCollapseChange = (nextIsCollapsed: boolean) => {
    setIsAccountRailCollapsed(nextIsCollapsed);
    writeAccountRailCollapsed(nextIsCollapsed);
  };

  const activeAccount =
    accounts.find((account) => account.id === activeAccountId) ?? accounts[0];
  const allConversations = conversationListsByScope[activeAccountId] ?? [];
  const visibleSearchableConversations =
    getVisibleConversations(allConversations);
  const visibleConversations = visibleSearchableConversations.filter(
    (conversation) => conversation.mode === activeMode,
  );
  const firstVisibleConversationId = visibleConversations[0]?.id;
  const activeConversation =
    visibleConversations.find(
      (conversation) => conversation.id === activeConversationId,
    ) ?? (activeView === "chat" ? visibleConversations[0] : undefined);
  const isHistoryPanelOpen =
    historyPanelOpenConversationId === activeConversation?.id;
  const activeMessages =
    (activeConversation && messagesByConversationId[activeConversation.id]) ??
    [];
  const activeGroupMembers =
    activeConversation?.mode === "group"
      ? (groupMembersByConversationId[activeConversation.id] ?? [])
      : [];
  const isActiveGroupMembersLoading =
    activeConversation?.mode === "group"
      ? groupMembersLoadingByConversationId[activeConversation.id] === true
      : false;
  const activeHistoryStatus = activeConversation
    ? (historyStatusByConversationId[activeConversation.id] ?? "idle")
    : "idle";
  const hasMoreHistory = activeConversation
    ? hasMoreHistoryByConversationId[activeConversation.id] === true
    : false;
  const skippedHiddenCount = activeConversation
    ? (messagePaginationByConversationId[activeConversation.id]
        ?.skippedHiddenCount ?? 0)
    : 0;
  const historyLoadLabel =
    skippedHiddenCount > 0
      ? `已跳过 ${skippedHiddenCount} 条不可展示记录，继续加载更早消息`
      : undefined;
  const activeCustomer =
    (activeConversation &&
      customerProfilesById[activeConversation.customerId]) ??
    undefined;

  useConversationRevealTimer(allConversations);
  const workbenchPermissions = resolveWorkbenchPermissions({
    account: activeAccount,
    activeConversation,
    bootstrapStatus,
    me,
    subUser,
  });
  const {
    canSendMessage,
    canTakeOverAccount,
    canUseChatSend,
    canUseConversationActions,
    composerPlaceholder,
    isAccountTakenOverByCurrentUser,
    isConversationActionDisabled,
    sidebarIframeSendStatus,
  } = workbenchPermissions;
  const canCollectMaterialActions = Boolean(subUser && subUser.role !== "viewer");
  const sidebarIframeTos: "0" | "1" = isAccountTakenOverByCurrentUser ? "1" : "0";
  const firstUnreadMessageKey = useMemo(
    () =>
      getFirstUnreadCustomerMessageKey(
        activeMessages,
        activeConversation?.unread ?? 0,
      ),
    [activeConversation?.unread, activeMessages],
  );
  const requestActiveConversationRead = useVisibleUnreadConversationRead({
    activeConversationId: activeConversation?.id,
    activeMessages,
    activeView,
    canUseConversationActions,
    firstUnreadMessageKey,
    isConversationLoading,
    markConversationRead,
    messageViewportRef,
    unreadCount: activeConversation?.unread ?? 0,
  });

  const hasActiveFileUploads = () => fileUploadQueueRef.current.length > 0;

  const setFileUploadQueueState = (
    updater: (queue: typeof fileUploadQueue) => typeof fileUploadQueue,
  ) => {
    if (!isMountedRef.current) {
      return;
    }

    setFileUploadQueue((currentQueue) => {
      const nextQueue = updater(currentQueue);
      fileUploadQueueRef.current = nextQueue;
      return nextQueue;
    });
  };

  const { handleLoadOlderMessages, handleMessageViewportScroll } =
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
    if (bootstrapStatus !== "idle") {
      return;
    }

    void initializeWorkbench();
  }, [bootstrapStatus, initializeWorkbench]);

  useEffect(
    () => {
      isMountedRef.current = true;

      return () => {
        isMountedRef.current = false;
        clearActiveConversation();
        fileUploadAbortControllersRef.current.forEach((controller) => {
          controller.abort();
        });
        fileUploadAbortControllersRef.current.clear();
        fileUploadQueueRef.current = [];
      };
    },
    [clearActiveConversation],
  );

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    if (activeView !== "chat") {
      return;
    }

    if (!activeConversationId && firstVisibleConversationId) {
      void setActiveConversation(firstVisibleConversationId);
    }
  }, [
    activeConversationId,
    activeView,
    firstVisibleConversationId,
    setActiveConversation,
  ]);

  useEffect(() => {
    setChatSendPermission(canUseChatSend);
  }, [canUseChatSend, setChatSendPermission]);

  useEffect(() => {
    if (!readReceiptError) {
      return;
    }

    toast.warning(readReceiptError);
    dismissReadReceiptError();
  }, [dismissReadReceiptError, readReceiptError]);

  const handleTakeOverAccount = useCallback(
    async (accountId: string) => {
      if (!canTakeOverAccount) {
        toast.warning("当前账号无接管权限");
        return;
      }

      const result = await takeOverAccount(accountId);

      if (!isMountedRef.current || result.ok) {
        return;
      }

      toast.warning(result.errorMessage);
    },
    [canTakeOverAccount, takeOverAccount],
  );

  const handleStartCustomerChat = useCallback(
    async (input: {
      seatId: string;
      thirdExternalUserId: string;
      customerName: string;
      customerAvatar: string;
      realName: string;
    }) => {
      onNavigateChat?.();
      await setActiveAccount(input.seatId);
      await selectOrCreateAndSelectConversation({
        avatar: input.customerAvatar,
        name: input.customerName,
        realName: input.realName,
        thirdExternalUserId: input.thirdExternalUserId,
      });
    },
    [onNavigateChat, selectOrCreateAndSelectConversation, setActiveAccount],
  );

  const handleRetryFailedMessage = useCallback(
    async (uiMessageKey: string) => {
      if (!canSendMessage) {
        return;
      }

      const retryConversationId = activeConversationIdRef.current;
      setRetryingUiMessageKeys((current) => new Set(current).add(uiMessageKey));

      try {
        const result = await retryFailedMessage(uiMessageKey);

        if (
          !isMountedRef.current ||
          activeConversationIdRef.current !== retryConversationId
        ) {
          return;
        }

        if (!result.ok) {
          toast.warning(result.errorMessage || "重试失败，请稍后重试");
          return;
        }

        const messageViewport = messageViewportRef.current;

        if (messageViewport) {
          messageViewport.scrollTo?.({
            top: 0,
            behavior: "smooth",
          });
        }
      } finally {
        if (isMountedRef.current) {
          setRetryingUiMessageKeys((current) => {
            const next = new Set(current);
            next.delete(uiMessageKey);
            return next;
          });
        }
      }
    },
    [canSendMessage, retryFailedMessage],
  );

  const handleRevokeMessage = useCallback(
    async (message: ChatMessage) => {
      if (!canSendMessage) {
        return;
      }

      const result = await revokeMessage(message.uiMessageKey);

      if (!isMountedRef.current || result.ok) {
        return;
      }

      toast.warning(result.errorMessage || "撤回失败，请稍后重试");
    },
    [canSendMessage, revokeMessage],
  );

  useEffect(() => {
    setIsEmojiPickerOpen(false);
  }, [activeConversation?.id]);

  useEffect(() => {
    mentionRetryDialogStateRef.current = null;
    setMentionRetryDialogState(null);
    setIsRefreshingMentionTarget(false);
  }, [activeConversation?.id]);

  useEffect(() => {
    if (isSendingDraft || !shouldRestoreComposerFocusRef.current) {
      return;
    }

    shouldRestoreComposerFocusRef.current = false;
    const editor = composerRef.current;
    editor?.getRootElement()?.focus();
    editor?.focus();
  }, [isSendingDraft]);

  useWorkbenchPolling({
    activeAccountId,
    bootstrapStatus,
    currentUserId: me?.id,
    intervalMs: pollIntervalMs,
    jitterMs: pollJitterMs,
    onPollingPaused: handlePollingPaused,
    refreshSeatSummaries,
    pollWorkbench,
  });

  // 心跳当前按产品决策停用；保留调用示例，后续恢复时再打开。
  // useSmartHeartbeat({
  //   conversationId: activeConversation?.id,
  //   enabled:
  //     bootstrapStatus === "ready" &&
  //     isAccountTakenOverByCurrentUser &&
  //     activeConversation?.mode === "single",
  // });

  const hasUnsentComposerContent = () =>
    draftRef.current.trim().length > 0 ||
    composerSegmentsRef.current.length > 0 ||
    quotedMessageRef.current !== null;

  const persistComposerDraftForConversation = (conversationId: string) => {
    if (!conversationId) {
      return;
    }

    const conversationStillExists = isConversationListedInWorkbench(
      useWorkbenchStore.getState().conversationListsByScope,
      conversationId,
    );

    if (!conversationStillExists) {
      clearComposerDraft(conversationId);
      return;
    }

    if (!hasUnsentComposerContent()) {
      clearComposerDraft(conversationId);
      return;
    }

    saveComposerDraft(conversationId, {
      draft: draftRef.current,
      quotedMessage: quotedMessageRef.current,
      segments: composerSegmentsRef.current,
    });
  };

  const resetComposerUI = (options?: { keepQuote?: boolean }) => {
    composerRef.current?.dispatchCommand(CLEAR_COMPOSER_COMMAND, undefined);
    setDraft("");
    setComposerSegments([]);
    if (!options?.keepQuote) {
      setQuotedMessage(null);
    }
  };

  const restoreComposerDraftForConversation = (conversationId: string) => {
    const savedDraft = composerDraftsByConversationId[conversationId];

    if (!savedDraft || !hasConversationComposerDraftContent(savedDraft)) {
      resetComposerUI();
      return;
    }

    setDraft(savedDraft.draft);
    setComposerSegments(savedDraft.segments);
    setQuotedMessage(savedDraft.quotedMessage);
    composerRef.current?.dispatchCommand(RESTORE_COMPOSER_COMMAND, {
      segments: savedDraft.segments,
    });
  };

  const clearComposer = (options?: { keepQuote?: boolean }) => {
    resetComposerUI(options);

    if (activeConversationIdRef.current) {
      clearComposerDraft(activeConversationIdRef.current);
    }
  };

  useEffect(() => {
    if (activeView !== "chat") {
      const previousConversationId = composerDraftHydratedConversationIdRef.current;

      if (previousConversationId) {
        persistComposerDraftForConversation(previousConversationId);
      }

      composerDraftHydratedConversationIdRef.current = undefined;

      if (activeConversationId) {
        clearActiveConversation();
      }

      return;
    }

    const previousConversationId = composerDraftHydratedConversationIdRef.current;

    if (previousConversationId === activeConversationId) {
      return;
    }

    if (previousConversationId) {
      persistComposerDraftForConversation(previousConversationId);
    }

    composerDraftHydratedConversationIdRef.current = activeConversationId;

    if (!activeConversationId) {
      resetComposerUI();
      return;
    }

    restoreComposerDraftForConversation(activeConversationId);
  }, [
    activeConversationId,
    activeView,
    clearActiveConversation,
    composerDraftsByConversationId,
  ]);

  const scrollMessageViewportToBottom = useCallback(() => {
    const scroll = () => {
      messageViewportRef.current?.scrollTo?.({
        top: 0,
        behavior: "smooth",
      });
    };

    scroll();

    window.requestAnimationFrame(() => {
      scroll();
      window.requestAnimationFrame(scroll);
    });
  }, []);

  const handleSmartReplySendFailure = useCallback(
    ({
      errorCode,
      errorMessage,
      reason,
    }: {
      errorCode: string;
      errorMessage?: string;
      reason: "file-upload" | "image-upload" | "send" | "unavailable";
    }) => {
      setSendFailureDialog(
        getSendFailureDialogCopy(reason, errorCode, errorMessage),
      );
    },
    [],
  );

  const {
    activeMaterialLibraryBizType,
    activeMaterialLibraryGroupId,
    collectedExpressions,
    hasMoreCollectedExpressions,
    hasMoreMaterialLibraryItems,
    isCollectedExpressionLoadingMore,
    isCollectingMaterial,
    isMaterialLibraryBusy,
    isMaterialLibraryGroupsLoading,
    isMaterialLibraryItemsLoading,
    isMaterialLibraryLoadingMore,
    isMaterialLibrarySending,
    sendingMaterialId,
    materialCollectionGroups,
    materialLibraryGroups,
    materialLibraryItems,
    pendingMaterialCollection,
    handleCollectMaterial,
    handleCreateMaterialGroup,
    handleCreatePendingMaterialGroup,
    handleDeleteCollectedExpression,
    handleDeleteMaterial,
    handleDeleteMaterialGroup,
    handleEditMaterial,
    handleLoadMoreCollectedExpressions,
    handleLoadMoreMaterialLibraryItems,
    handleMoveMaterial,
    handleOpenCollectedExpressions,
    handleOpenMaterialLibrary,
    handleRenameMaterialGroup,
    handleSelectMaterial,
    handleSelectMaterialLibraryGroup,
    handleSubmitMaterialCollection,
    handleTopCollectedExpression,
    handleTopMaterial,
    handleTopMaterialGroup,
    resetMaterialLibrary,
    resetMaterialSessionState,
    resetPendingCollection,
  } = useMaterialCollection({
    bootstrapStatus,
    currentMaterialThirdUserId: activeConversation?.thirdUserId,
    isMountedRef,
    onSendFailure: handleSmartReplySendFailure,
    onSent: () => {
      setIsEmojiPickerOpen(false);
      scrollMessageViewportToBottom();
    },
    requestActiveConversationRead,
    resolvedActiveConversationId: activeConversation?.id,
    sendAgentMessageSegments,
  });

  const resetLocalSessionState = useCallback(() => {
    fileUploadAbortControllersRef.current.forEach((controller) => {
      controller.abort();
    });
    fileUploadAbortControllersRef.current.clear();
    fileUploadQueueRef.current = [];
    mentionRetryDialogStateRef.current = null;
    isSendingDraftRef.current = false;
    shouldRestoreComposerFocusRef.current = false;
    composerDraftHydratedConversationIdRef.current = undefined;
    setDraft("");
    setComposerSegments([]);
    setFileUploadQueue([]);
    setFileUploadTransitionError(undefined);
    setIsEmojiPickerOpen(false);
    setIsQuickReplyPanelActive(false);
    setIsRefreshingMentionTarget(false);
    setIsSendingDraft(false);
    setMentionRetryDialogState(null);
    setPollingPauseReason(null);
    setQuickReplyCategoryFormState(null);
    setQuickReplyFormState(null);
    setQuotedMessage(null);
    setRetryingUiMessageKeys(new Set());
    setSendFailureDialog(null);
    resetMaterialSessionState();
    composerRef.current?.dispatchCommand(CLEAR_COMPOSER_COMMAND, undefined);
  }, [resetMaterialSessionState]);

  const subUserId = subUser?.subUserId ?? null;
  const previousSubUserIdRef = useRef(subUserId);

  useEffect(() => {
    if (previousSubUserIdRef.current === subUserId) {
      return;
    }

    previousSubUserIdRef.current = subUserId;
    resetLocalSessionState();
  }, [resetLocalSessionState, subUserId]);

  const quickReplies = useQuickReplies({
    enabled: activeView === "chat" && Boolean(activeConversation) && isQuickReplyPanelActive,
  });

  const {
    handleDismissSmartReply,
    handleFillSmartReplyComposer,
    handleMakeShorterSmartReply,
    handleSendSmartReply,
    handleTriggerSmartReply,
  } = useSmartReplyState({
    activeConversation,
    canSendMessage,
    composerRef,
    dismissSmartReply,
    isMountedRef,
    isSendingDraftRef,
    onDraftChange: setDraft,
    onSendFailure: handleSmartReplySendFailure,
    onSendingChange: setIsSendingDraft,
    onSent: scrollMessageViewportToBottom,
    requestSmartReplyGeneralAnswer,
    requestSmartReplyMakeShorter,
    sendSmartReply,
  });

  const handleSendDraft = async (segments: ComposerSegment[]) => {
    const sendConversationId = activeConversation?.id;
    const normalizedSegments = segments.length > 0 ? segments : [];
    const mentionState = extractComposerMentionState(segments);
    const mention =
      mentionState.memberIds.length > 0 || mentionState.mentionAll
        ? {
            all: mentionState.mentionAll || undefined,
            location: "start" as const,
            memberIds: mentionState.memberIds,
          }
        : undefined;

    if (normalizedSegments.length === 0 || !canSendMessage) {
      return;
    }

    if (isSendingDraftRef.current) {
      return;
    }

    isSendingDraftRef.current = true;
    setIsSendingDraft(true);

    try {
      const result = await sendAgentMessageSegments(normalizedSegments, {
        mention,
        quote: quotedMessage?.quoteMsgId
          ? {
              quoteMsgId: quotedMessage.quoteMsgId,
              quotedMessage: {
                contentType: quotedMessage.contentType,
                fallbackText: quotedMessage.fallbackText,
                imageUrl: quotedMessage.imageUrl,
                senderName: quotedMessage.senderName,
                text: quotedMessage.text,
                title: quotedMessage.title,
              },
            }
          : undefined,
        onImageUploaded({ nextSegment, previousSegment }) {
          if (
            nextSegment.type !== "image" ||
            previousSegment.type !== "image" ||
            !nextSegment.url
          ) {
            return;
          }

          composerRef.current?.dispatchCommand(UPDATE_COMPOSER_IMAGE_COMMAND, {
            clientId: previousSegment.clientId,
            fileId: nextSegment.fileId,
            localUrl: nextSegment.localUrl ?? previousSegment.localUrl,
            previousSrc: previousSegment.url ?? previousSegment.localUrl ?? "",
            src: nextSegment.url,
          });
        },
      });

      if (
        !isMountedRef.current ||
        activeConversationIdRef.current !== sendConversationId
      ) {
        return;
      }

      if (!result.ok) {
        setSendFailureDialog(
          getSendFailureDialogCopy(
            result.reason,
            result.errorCode,
            result.errorMessage,
          ),
        );
        composerRef.current?.focus();
        return;
      }

      clearComposer({
        keepQuote: quotedMessage !== null && !result.didConsumeQuote,
      });
      scrollMessageViewportToBottom();
      void requestActiveConversationRead();
    } finally {
      isSendingDraftRef.current = false;
      if (isMountedRef.current) {
        shouldRestoreComposerFocusRef.current =
          activeConversationIdRef.current === sendConversationId;
        setIsSendingDraft(false);
      }
    }
  };

  const removeFileUpload = (uploadId: string) => {
    fileUploadAbortControllersRef.current.delete(uploadId);
    setFileUploadQueueState((currentQueue) =>
      currentQueue.filter((item) => item.id !== uploadId),
    );
  };

  const handleCancelFileUpload = (uploadId: string) => {
    fileUploadAbortControllersRef.current.get(uploadId)?.abort();
    removeFileUpload(uploadId);
  };

  const handleFileSelect = (fileList: FileList | File[] | null) => {
    const files = Array.from(fileList ?? []);

    if (files.length === 0) {
      return;
    }

    if (!activeConversation || !canSendMessage) {
      setSendFailureDialog(
        getSendFailureDialogCopy("unavailable", "UNAVAILABLE"),
      );
      return;
    }

    for (const file of files) {
      if (!isSupportedComposerFile(file)) {
        toast.warning("仅支持 PDF、Excel、Word、TXT、PPT 文件");
        continue;
      }

      if (!isComposerFileSizeAllowed(file)) {
        setSendFailureDialog({
          description: "请选择不超过 10 MB 的文件",
          title: "文件过大，无法发送",
        });
        continue;
      }

      const uploadId = `file-upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const nextUpload: FileUploadQueueItem = {
        fileName: file.name,
        id: uploadId,
        progress: 1,
        status: "uploading",
      };
      const abortController = new AbortController();
      fileUploadAbortControllersRef.current.set(uploadId, abortController);

      setFileUploadQueueState((currentQueue) => [...currentQueue, nextUpload]);

      void (async () => {
        try {
          const fileSegment = await uploadWorkbenchFile(
            activeConversation.id,
            file,
            {
              onProgress(progress) {
                setFileUploadQueueState((currentQueue) =>
                  currentQueue.map((item) =>
                    item.id === uploadId
                      ? {
                          ...item,
                          progress: Math.max(
                            item.progress,
                            Math.min(100, progress),
                          ),
                        }
                      : item,
                  ),
                );
              },
              signal: abortController.signal,
            },
          );

          if (
            !fileUploadQueueRef.current.some((item) => item.id === uploadId)
          ) {
            return;
          }

          setFileUploadQueueState((currentQueue) =>
            currentQueue.map((item) =>
              item.id === uploadId
                ? { ...item, progress: 100, status: "sending" }
                : item,
            ),
          );

          const result = await sendAgentMessageSegments([fileSegment]);

          if (!isMountedRef.current) {
            return;
          }

          if (!result.ok) {
            setSendFailureDialog(
              getSendFailureDialogCopy(
                result.reason,
                result.errorCode,
                result.errorMessage,
              ),
            );
            composerRef.current?.focus();
            return;
          }
        } catch (error) {
          if (!isMountedRef.current) {
            return;
          }

          if (fileUploadQueueRef.current.some((item) => item.id === uploadId)) {
            setSendFailureDialog(
              getSendFailureDialogCopy(
                "file-upload",
                getSendErrorCode(error),
                getSendErrorMessage(error),
              ),
            );
            composerRef.current?.focus();
          }
        } finally {
          removeFileUpload(uploadId);
        }
      })();
    }
  };

  const handleDownloadMessageFile = (message: ChatMessage) => {
    if (message.content.type !== "file" && message.content.type !== "video") {
      return;
    }

    const url = getMessageDownloadUrl(message);

    if (isMessageDownloadUrlReady(message, url)) {
      openMessageDownloadUrl(message, url);
      return;
    }

    if (!message.content.fileSerialNo || !message.seq || !activeConversation) {
      return;
    }

    if (message.conversationId !== activeConversation.id) {
      return;
    }

    updateMessageDownloadContent(message.conversationId, message.uiMessageKey, {
      downloadStatus: "ing",
    });

    void downloadMessageFile({
      conversationId: message.conversationId,
      msgInfoId: message.seq,
    })
      .then(() => {
        if (!isMountedRef.current) {
          return;
        }

      })
      .catch(() => {
        if (!isMountedRef.current) {
          return;
        }

        updateMessageDownloadContent(message.conversationId, message.uiMessageKey, {
          downloadStatus: "failed",
        });
        toast.warning("下载失败，请稍后重试");
      });
  };

  const handleVoicePlaybackReady = (
    message: ChatMessage,
    payload: { playbackUrl: string },
  ) => {
    if (message.content.type !== "voice" || !message.seq) {
      return;
    }

    void confirmVoicePlaybackReady(
      message.conversationId,
      message.uiMessageKey,
      payload.playbackUrl,
    );
  };

  const handleTranscribeVoice = async (message: ChatMessage) => {
    if (message.content.type !== "voice") {
      throw new Error("当前消息不支持转文字");
    }

    return transcribeVoiceMessage(message.conversationId, message.uiMessageKey);
  };

  const handleDraftChange = (nextDraft: string) => {
    setDraft(nextDraft);
  };

  const handleComposerSegmentsChange = (nextSegments: ComposerSegment[]) => {
    setComposerSegments(nextSegments);
  };

  const handleSelectQuickReply = (quickReply: WorkbenchQuickReplyDto) => {
    if (!canSendMessage) {
      toast.warning("当前无法发送消息");
      return;
    }

    const { invalidAttachmentCount, segments } =
      buildQuickReplyComposerSegments(quickReply);

    if (invalidAttachmentCount > 0) {
      toast.warning("该话术附件数据异常，无法发送");
      return;
    }

    if (segments.length === 0) {
      toast.warning("话术数据异常");
      return;
    }

    const nextDraft =
      segments.find((segment) => segment.type === "text")?.text ?? "";

    setDraft(nextDraft);
    setComposerSegments(segments);
    setQuotedMessage(null);
    composerRef.current?.dispatchCommand(RESTORE_COMPOSER_COMMAND, {
      segments,
    });
    composerRef.current?.focus();
  };

  const quickReplyPanel = (
    <QuickReplyPanel
      activeCategoryId={quickReplies.activeCategoryId}
      activeScopeType={quickReplies.activeScopeType}
      activeTopCategoryId={quickReplies.activeTopCategoryId}
      categories={quickReplies.categories}
      isLoading={quickReplies.isLoading}
      isMutating={quickReplies.isMutating}
      keyword={quickReplies.keyword}
      quickReplies={quickReplies.quickReplies}
      quickRepliesByCategoryId={quickReplies.quickRepliesByCategoryId}
      onCategoryChange={quickReplies.setActiveCategoryId}
      onCreateCategory={(parentId) =>
        setQuickReplyCategoryFormState({ mode: "create", parentId })
      }
      onCreateQuickReply={(categoryId) => {
        setQuickReplyFormState({
          defaultCategoryId: categoryId,
          mode: "create",
        });
      }}
      onCopyQuickReply={(quickReply) =>
        setQuickReplyFormState({ mode: "copy", quickReply })
      }
      onBottomCategory={quickReplies.bottomCategory}
      onBottomQuickReply={quickReplies.bottomQuickReply}
      onDeleteCategory={quickReplies.deleteCategory}
      onDeleteQuickReply={quickReplies.deleteQuickReply}
      onEditCategory={(category) =>
        setQuickReplyCategoryFormState({ category, mode: "edit" })
      }
      onEditQuickReply={(quickReply) =>
        setQuickReplyFormState({ mode: "edit", quickReply })
      }
      onImportQuickReplies={quickReplies.importQuickReplies}
      onKeywordChange={quickReplies.setKeyword}
      onMoveCategory={quickReplies.moveCategory}
      onMoveQuickReply={quickReplies.moveQuickReply}
      onScopeTypeChange={quickReplies.setActiveScopeType}
      onSelectQuickReply={handleSelectQuickReply}
      onSortCategories={quickReplies.sortCategories}
      onSortQuickReplies={quickReplies.sortQuickReplies}
      onTopCategoryChange={quickReplies.setActiveTopCategoryId}
      onTopCategory={quickReplies.topCategory}
      onTopQuickReply={quickReplies.topQuickReply}
    />
  );

  const handleSelectConversation = async (conversationId: string) => {
    if (conversationId === activeConversationId) {
      return;
    }

    if (hasActiveFileUploads()) {
      setFileUploadTransitionError("文件上传中，暂不能切换会话");
      return;
    }

    await setActiveConversation(conversationId);
  };

  const handleSelectMode = async (mode: ChatMode) => {
    if (mode === activeMode) {
      return;
    }

    if (hasActiveFileUploads()) {
      setFileUploadTransitionError("文件上传中，暂不能切换会话");
      return;
    }

    await setActiveMode(mode);
  };

  const handleOpenQuotedMessage = (quoteMsgId: string) => {
    const quoteSeq = Number(quoteMsgId);
    const originalMessage = Number.isSafeInteger(quoteSeq)
      ? activeMessages.find((message) => message.seq === quoteSeq)
      : undefined;
    const viewport = messageViewportRef.current;
    const anchor =
      viewport && originalMessage
        ? findViewportAnchor(viewport, originalMessage.uiMessageKey)
        : null;

    if (!anchor) {
      toast.warning("当前未加载原始消息");
      return;
    }

    anchor.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const handleQuoteMessage = (message: ChatMessage) => {
    if (message.isRevoked) {
      return;
    }

    const quotePreview = buildQuotedMessagePreview(message);

    if (!quotePreview) {
      return;
    }

    setQuotedMessage(quotePreview);
    composerRef.current?.focus();
  };

  const handleMentionMessage = (message: ChatMessage) => {
    if (
      !message.isGroupConversation ||
      message.isOwnMessage ||
      !message.sender.groupMemberId
    ) {
      return;
    }

    const activeGroupMember = activeGroupMembers.find(
      (member) => member.id === message.sender.groupMemberId,
    );

    if (!activeGroupMember) {
      const retryDialogState = {
        conversationId: message.conversationId,
        displayName: message.senderDisplayName || message.sender.name,
        groupMemberId: message.sender.groupMemberId,
        refreshedOnce: false,
      };

      mentionRetryDialogStateRef.current = retryDialogState;
      setMentionRetryDialogState(retryDialogState);
      return;
    }

    composerRef.current?.dispatchCommand(INSERT_COMPOSER_MENTION_COMMAND, {
      displayName: activeGroupMember.displayName,
      memberId: activeGroupMember.id,
    });
    composerRef.current?.focus();
  };

  const handleRetryMentionTarget = async () => {
    const dialogState = mentionRetryDialogState;

    if (!dialogState || !activeConversation?.id || isRefreshingMentionTarget) {
      return;
    }

    setIsRefreshingMentionTarget(true);

    try {
      await loadActiveGroupMembers({ force: true });

      if (!isMountedRef.current) {
        return;
      }

      const refreshedState = useWorkbenchStore.getState();
      const isStillActiveRetry =
        refreshedState.activeConversationId === dialogState.conversationId &&
        mentionRetryDialogStateRef.current?.conversationId ===
          dialogState.conversationId &&
        mentionRetryDialogStateRef.current?.groupMemberId ===
          dialogState.groupMemberId;

      if (!isStillActiveRetry) {
        return;
      }

      const refreshedMembers =
        refreshedState.groupMembersByConversationId[
          dialogState.conversationId
        ] ?? [];
      const refreshedMember = refreshedMembers.find(
        (member) => member.id === dialogState.groupMemberId,
      );

      if (!refreshedMember) {
        const nextDialogState = {
          ...dialogState,
          refreshedOnce: true,
        };

        mentionRetryDialogStateRef.current = nextDialogState;
        setMentionRetryDialogState(nextDialogState);
        return;
      }

      composerRef.current?.dispatchCommand(INSERT_COMPOSER_MENTION_COMMAND, {
        displayName: refreshedMember.displayName,
        memberId: refreshedMember.id,
      });
      composerRef.current?.focus();
      mentionRetryDialogStateRef.current = null;
      setMentionRetryDialogState(null);
    } finally {
      if (isMountedRef.current) {
        setIsRefreshingMentionTarget(false);
      }
    }
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
          正在加载工作台数据
        </div>
      </div>
    );
  }

  if (bootstrapStatus === "error" && accounts.length === 0) {
    return (
      <div className="flex h-svh items-center justify-center bg-background px-6">
        <div className="max-w-md rounded-2xl border border-destructive/25 bg-surface px-6 py-5 shadow-sm">
          <p className="text-sm font-semibold text-foreground">
            工作台初始化失败
          </p>
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
          activeAccountId={activeView === "chat" ? activeAccountId : undefined}
          activeNavItem={activeView === "customers" ? "客户" : "聊天"}
          canTakeOverAccount={canTakeOverAccount}
          currentEmployee={me}
          currentEmployeeId={me?.id}
          isCollapsed={isAccountRailCollapsed}
          onCollapseChange={handleAccountRailCollapseChange}
          onLogout={handleLogout}
          onNavItemSelect={(label) => {
            if (label === "客户") {
              onNavigateCustomerPage?.();
              return;
            }

            if (label === "聊天" || label === "工作台") {
              onNavigateChat?.();
            }
          }}
          onResizeStart={handleAccountRailResizeStart}
          onSelectAccount={async (accountId) => {
            onNavigateChat?.();
            await setActiveAccount(accountId);
          }}
          onOpenSettings={onOpenSettings}
          onTakeOverAccount={handleTakeOverAccount}
          takeoverStatusByAccountId={takeoverStatusByAccountId}
        />

        <div
          className="relative z-10 h-full min-h-0 overflow-x-auto rounded-[14px_0_0_14px] bg-surface pl-0 shadow"
          data-testid="chat-workbench-scroll-container"
        >
          <div
            className={cn(
              "h-full min-h-0",
              (isResizingAccountRail || isResizingCustomerPanel) &&
                "select-none",
            )}
            data-testid="chat-workbench-content"
            style={{ minWidth: `${MIN_WORKBENCH_CONTENT_WIDTH}px` }}
          >
            {activeView === "customers" ? (
              <CustomerPage
                accounts={accounts}
                currentEmployeeId={me?.id}
                onStartChat={handleStartCustomerChat}
              />
            ) : (
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
                  composerDraftsByConversationId={composerDraftsByConversationId}
                  conversations={visibleSearchableConversations}
                  isConversationActionDisabled={isConversationActionDisabled}
                  isConversationLoading={isConversationLoading}
                  onDeleteConversation={deleteConversation}
                  onMarkConversationRead={markConversationRead}
                  onMarkConversationUnread={markConversationUnread}
                  onPinConversation={pinConversation}
                  onSelectConversation={handleSelectConversation}
                  onSelectMode={handleSelectMode}
                  onUnpinConversation={unpinConversation}
                  searchableConversations={visibleSearchableConversations}
                />

                <ChatPanel
                  accountName={activeAccount?.name}
                  accountAvatarUrl={activeAccount?.avatarUrl}
                  activeConversation={activeConversation}
                  activeHistoryStatus={activeHistoryStatus}
                  canCollectMaterialActions={canCollectMaterialActions}
                  canSendMessage={canSendMessage}
                  composerPlaceholder={composerPlaceholder}
                  customer={activeCustomer}
                  sidebarIframeTos={sidebarIframeTos}
                  sidebarIframeSendStatus={sidebarIframeSendStatus}
                  customerPanelWidth={customerPanelWidth}
                  draft={draft}
                  groupMembers={activeGroupMembers}
                  isGroupMembersLoading={isActiveGroupMembersLoading}
                  inputEnterBehavior={inputEnterBehavior}
                  isConversationLoading={isConversationLoading}
                  isEmojiPickerOpen={isEmojiPickerOpen}
                  isSendingDraft={isSendingDraft}
                  isResizingCustomerPanel={isResizingCustomerPanel}
                  fileUploadQueue={fileUploadQueue}
                  collectedExpressions={collectedExpressions}
                  hasMoreCollectedExpressions={hasMoreCollectedExpressions}
                  hasMoreHistory={hasMoreHistory}
                  historyLoadLabel={historyLoadLabel}
                  isCollectedExpressionLoadingMore={
                    isCollectedExpressionLoadingMore
                  }
                  sendingCollectedExpressionId={sendingMaterialId}
                  messages={activeMessages}
                  messageViewportRef={messageViewportRef}
                  quotedMessage={quotedMessage}
                  sidebarItems={sidebarItems}
                  onCustomerPanelResizeStart={handleCustomerPanelResizeStart}
                  onComposerSegmentsChange={handleComposerSegmentsChange}
                  onCancelFileUpload={handleCancelFileUpload}
                  onClearQuotedMessage={() => setQuotedMessage(null)}
                  onCollectMaterial={handleCollectMaterial}
                  onDeleteCollectedExpression={handleDeleteCollectedExpression}
                  onDownloadMessageFile={handleDownloadMessageFile}
                  onTranscribeVoice={handleTranscribeVoice}
                  onVoicePlaybackReady={handleVoicePlaybackReady}
                  onDraftChange={handleDraftChange}
                  onEmojiPickerOpenChange={setIsEmojiPickerOpen}
                  onEnterBehaviorChange={setInputEnterBehavior}
                  onFileSelect={handleFileSelect}
                  onOpenMaterialLibrary={handleOpenMaterialLibrary}
                  onOpenHistory={() => {
                    if (isHistoryPanelOpen) {
                      closeHistoryPanel();
                      return;
                    }

                    void openHistoryPanel(activeConversation?.id);
                  }}
                  onHistoryClose={() => closeHistoryPanel()}
                  onHistoryLoadMoreNext={() => {
                    const nextCursor =
                      activeConversation
                        ? historyPanelByConversationId[activeConversation.id]
                            ?.nextCursor
                        : undefined;
                    void loadHistoryMessages({
                      cursor: nextCursor,
                      direction: "next",
                    });
                  }}
                  onHistoryLoadMorePrev={() => {
                    const prevCursor =
                      activeConversation
                        ? historyPanelByConversationId[activeConversation.id]
                            ?.prevCursor
                        : undefined;
                    void loadHistoryMessages({
                      cursor: prevCursor,
                      direction: "prev",
                    });
                  }}
                  onHistoryRefresh={() => {
                    void loadHistoryMessages({ direction: "next" });
                  }}
                  onHistorySetDay={(day) => {
                    void setHistoryPanelDay(day);
                  }}
                  onHistorySetScope={(scope) => {
                    void setHistoryPanelScope(scope);
                  }}
                  onHistorySetSenderId={(senderId) => {
                    void setHistoryPanelSenderId(senderId);
                  }}
                  onLoadMoreCollectedExpressions={() => {
                    void handleLoadMoreCollectedExpressions();
                  }}
                  onOpenCollectedExpressions={handleOpenCollectedExpressions}
                  onRefreshGroupMembers={() => {
                    void loadActiveGroupMembers({ force: true });
                  }}
                  onLoadOlderMessages={handleLoadOlderMessages}
                  onMentionMessage={handleMentionMessage}
                  onOpenQuotedMessage={handleOpenQuotedMessage}
                  onQuoteMessage={handleQuoteMessage}
                  onSelectCollectedExpression={handleSelectMaterial}
                  onTopCollectedExpression={handleTopCollectedExpression}
                  onSendSmartReply={handleSendSmartReply}
                  onFillSmartReplyComposer={handleFillSmartReplyComposer}
                  onDismissSmartReply={handleDismissSmartReply}
                  onMakeShorterSmartReply={handleMakeShorterSmartReply}
                  onTriggerSmartReply={handleTriggerSmartReply}
                  onRevokeMessage={handleRevokeMessage}
                  onMessageViewportScroll={handleMessageViewportScroll}
                  onRetryMessage={handleRetryFailedMessage}
                  retryingMessageIds={retryingUiMessageKeys}
                  onSendDraft={handleSendDraft}
                  onQuickReplyActiveChange={setIsQuickReplyPanelActive}
                  quickReplyPanel={quickReplyPanel}
                  onDismissScopeTransitionError={() => {
                    setFileUploadTransitionError(undefined);
                    dismissScopeTransitionError();
                  }}
                  scopeTransitionError={
                    fileUploadTransitionError ?? scopeTransitionError
                  }
                  historyPanel={
                    activeConversation
                      ? {
                          activeHistory:
                            historyPanelByConversationId[activeConversation.id],
                          activeHistoryError:
                            historyPanelErrorByConversationId[
                              activeConversation.id
                            ],
                          activeHistoryFilters:
                            historyPanelFiltersByConversationId[
                              activeConversation.id
                            ] ?? {
                              scope: "all",
                            },
                          activeHistoryLoading:
                            historyPanelLoadingByConversationId[
                              activeConversation.id
                            ] ?? false,
                          scrollMode:
                            historyPanelScrollModeByConversationId[
                              activeConversation.id
                            ],
                          isOpen: isHistoryPanelOpen,
                        }
                      : undefined
                  }
                  isHistoryPanelOpen={isHistoryPanelOpen}
                  composerRef={composerRef}
                  workbenchBodyRef={workbenchBodyRef}
                />
              </div>
            )}
          </div>
        </div>
      </div>
      <AlertDialog open={pollingPauseReason !== null}>
        <AlertDialogContent
          className="overflow-hidden p-0"
          size="sm"
          style={{ height: 286, maxWidth: 520, width: 520 }}
        >
          <div className="relative h-full overflow-hidden px-10 py-9">
            <AlertDialogHeader className="relative z-10 min-w-0 space-y-4 text-left">
              <AlertDialogTitle>
                {getPollingPausedDialogCopy(pollingPauseReason).title}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {getPollingPausedDialogCopy(pollingPauseReason).description}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <img
              alt=""
              aria-hidden="true"
              className="pointer-events-none absolute bottom-2 left-2 w-[250px] select-none"
              data-testid="polling-paused-illustration"
              src="https://b5.bokr.com.cn/dist/pause_poll.png"
            />
            <AlertDialogFooter className="absolute bottom-10 right-10 z-10">
              <AlertDialogAction onClick={() => {
                window.location.reload();
              }}>
                刷新页面
              </AlertDialogAction>
            </AlertDialogFooter>
          </div>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={sendFailureDialog !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSendFailureDialog(null);
            composerRef.current?.focus();
          }
        }}
      >
        <AlertDialogContent size="default">
          <div className="flex items-start gap-3">
            <HugeiconsIcon
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-destructive"
              color="currentColor"
              icon={AlertCircleIcon}
              size={20}
              strokeWidth={2}
            />
            <AlertDialogHeader className="min-w-0 flex-1 space-y-1.5 text-left">
              <AlertDialogTitle>{sendFailureDialog?.title}</AlertDialogTitle>
              {sendFailureDialog?.description ? (
                <AlertDialogDescription>
                  {sendFailureDialog.description}
                </AlertDialogDescription>
              ) : null}
            </AlertDialogHeader>
          </div>
          <AlertDialogFooter>
            <AlertDialogAction variant="destructive">知道了</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog
        open={mentionRetryDialogState !== null}
        onOpenChange={(open) => {
          if (!open) {
            mentionRetryDialogStateRef.current = null;
            setMentionRetryDialogState(null);
            setIsRefreshingMentionTarget(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {mentionRetryDialogState?.refreshedOnce
                ? "刷新后仍未找到该成员"
                : "该成员已退群或群成员数据未更新"}
            </DialogTitle>
            <DialogDescription>
              {mentionRetryDialogState?.refreshedOnce
                ? `${mentionRetryDialogState.displayName} 可能已退群，暂不支持 @Ta`
                : `${mentionRetryDialogState?.displayName ?? ""} 暂不支持 @Ta，请刷新群成员后重试`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              disabled={isRefreshingMentionTarget}
              onClick={() => {
                void handleRetryMentionTarget();
              }}
            >
              {isRefreshingMentionTarget ? "刷新中" : "刷新群成员并重试"}
            </Button>
            <Button
              onClick={() => {
                mentionRetryDialogStateRef.current = null;
                setMentionRetryDialogState(null);
                setIsRefreshingMentionTarget(false);
              }}
              variant="outline"
            >
              取消
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <MaterialGroupSelectDialog
        bizType={pendingMaterialCollection?.bizType ?? MATERIAL_COLLECTION_BIZ_TYPE.FILE}
        groups={materialCollectionGroups}
        initialValues={pendingMaterialCollection?.formValues}
        isSaving={isCollectingMaterial}
        onCreateGroup={handleCreatePendingMaterialGroup}
        onOpenChange={(open) => {
          if (!open) {
            resetPendingCollection();
          }
        }}
        onSubmit={(payload) => {
          void handleSubmitMaterialCollection(payload);
        }}
        open={pendingMaterialCollection !== null}
      />
      <QuickReplyFormDialog
        categories={quickReplies.categories}
        conversationId={activeConversation?.id}
        initialValues={quickReplyInitialValues}
        mode={quickReplyFormState?.mode === "edit" ? "edit" : "create"}
        onOpenChange={(open) => {
          if (!open) {
            setQuickReplyFormState(null);
          }
        }}
        onSubmit={(values) => {
          return handleSubmitQuickReplyForm(
            quickReplyFormState,
            values,
            quickReplies.createQuickReply,
            quickReplies.updateQuickReply,
          );
        }}
        open={quickReplyFormState !== null}
      />
      <QuickReplyCategoryDialog
        initialTitle={
          quickReplyCategoryFormState?.mode === "edit"
            ? quickReplyCategoryFormState.category.title
            : ""
        }
        variant={
          quickReplyCategoryFormState?.mode === "edit"
            ? quickReplyCategoryFormState.category.parentId === 0
              ? "category"
              : "group"
            : quickReplyCategoryFormState?.parentId === 0
              ? "category"
              : "group"
        }
        onOpenChange={(open) => {
          if (!open) {
            setQuickReplyCategoryFormState(null);
          }
        }}
        onSubmit={(title) => {
          return handleSubmitQuickReplyCategoryForm(
            quickReplyCategoryFormState,
            title,
            quickReplies.createCategory,
            quickReplies.updateCategory,
          );
        }}
        open={quickReplyCategoryFormState !== null}
      />
      <MaterialLibraryDialog
        activeGroupId={activeMaterialLibraryGroupId}
        bizType={activeMaterialLibraryBizType ?? MATERIAL_COLLECTION_BIZ_TYPE.FILE}
        groups={materialLibraryGroups}
        hasMoreItems={hasMoreMaterialLibraryItems}
        isBusy={isMaterialLibraryBusy}
        isGroupsLoading={isMaterialLibraryGroupsLoading}
        isItemsLoading={isMaterialLibraryItemsLoading}
        isLoadingMoreItems={isMaterialLibraryLoadingMore}
        isSending={isMaterialLibrarySending}
        items={materialLibraryItems}
        onCreateGroup={handleCreateMaterialGroup}
        onDeleteGroup={handleDeleteMaterialGroup}
        onDeleteMaterial={handleDeleteMaterial}
        onEditMaterial={handleEditMaterial}
        onLoadMoreItems={() => {
          void handleLoadMoreMaterialLibraryItems();
        }}
        onMoveMaterial={handleMoveMaterial}
        onOpenChange={(open) => {
          if (!open) {
            resetMaterialLibrary();
          }
        }}
        onRenameGroup={handleRenameMaterialGroup}
        onSelectGroup={(groupId) => {
          void handleSelectMaterialLibraryGroup(groupId);
        }}
        onSelectMaterial={handleSelectMaterial}
        onTopGroup={handleTopMaterialGroup}
        onTopMaterial={handleTopMaterial}
        open={activeMaterialLibraryBizType !== null}
      />
    </div>
  );
}

function getSendFailureDialogCopy(
  reason: "file-upload" | "image-upload" | "send" | "unavailable",
  errorCode: string,
  errorMessage?: string,
) {
  const description = resolveSendFailureDescription(reason, errorCode, errorMessage);

  if (
    (reason === "file-upload" || reason === "image-upload") &&
    errorCode === MEDIA_UPLOAD_SDK_LOAD_FAILED_CODE
  ) {
    return {
      title: MEDIA_UPLOAD_SDK_LOAD_FAILED_MESSAGE,
      description: undefined,
    };
  }

  if (reason === "file-upload") {
    return {
      title: "文件上传失败，请稍后重试",
      description,
    };
  }

  if (reason === "image-upload") {
    return {
      title: "图片上传失败，请稍后重试",
      description,
    };
  }

  if (reason === "unavailable") {
    return {
      title: "当前无法发送消息，请稍后重试",
      description,
    };
  }

  return {
    title: "发送失败，请稍后重试",
    description,
  };
}

function resolveSendFailureDescription(
  reason: "file-upload" | "image-upload" | "send" | "unavailable",
  errorCode: string,
  errorMessage?: string,
) {
  const message = errorMessage?.trim();

  if (reason === "file-upload" || reason === "image-upload") {
    if (message && containsChineseText(message)) {
      return message;
    }

    return undefined;
  }

  if (message && containsChineseText(message)) {
    return message;
  }

  if (message && isTransportFailureMessage(message)) {
    return "网络异常，请稍后重试";
  }

  return `错误码：${errorCode}`;
}

function containsChineseText(text: string) {
  return /[\u4e00-\u9fff]/.test(text);
}

function isTransportFailureMessage(message: string) {
  const normalized = message.toLowerCase();

  return (
    normalized.includes("cors") ||
    normalized.includes("network error") ||
    normalized.includes("network") ||
    normalized.includes("timeout") ||
    normalized.includes("failed to fetch")
  );
}

function getPollingPausedDialogCopy(reason: PollingPauseReason | null) {
  if (reason === "idle") {
    return {
      description: "检测到你已离开页面一段时间，已暂停消息同步。",
      title: "已暂停新消息同步",
    };
  }

  return {
    description: "当前页面已暂停消息同步。若要在此页面继续，请刷新页面",
    title: "实时同步已被其他页面占用",
  };
}

function getMessageDownloadUrl(message: ChatMessage) {
  if (message.content.type === "file") {
    return message.content.fileUrl?.trim() ?? "";
  }

  if (message.content.type === "video") {
    return message.content.videoUrl?.trim() ?? "";
  }

  return "";
}

function isMessageDownloadUrlReady(message: ChatMessage, url: string) {
  if (message.content.type === "video") {
    return (
      message.content.downloadStatus === "finished" &&
      canUseExpiringUrl(url, message.content.fileUrlExpireTime)
    );
  }

  return (
    message.content.type === "file" &&
    message.content.downloadStatus === "finished" &&
    url
  );
}

function buildQuotedMessagePreview(
  message: ChatMessage,
): QuotedMessagePreviewContent | null {
  if (!isValidMessageSeq(message.seq)) {
    return null;
  }

  const senderName =
    message.senderDisplayName || message.sender.name || message.author;
  const basePreview = {
    contentType: message.content.type,
    quoteMsgId: String(message.seq),
    senderName,
  } satisfies Pick<
    QuotedMessagePreviewContent,
    "contentType" | "quoteMsgId" | "senderName"
  >;

  switch (message.content.type) {
    case "text":
      return {
        ...basePreview,
        text: message.content.text,
      };
    case "image":
      return {
        ...basePreview,
        fallbackText: "[图片]",
        imageUrl: message.content.imageUrl,
      };
    case "video":
      return {
        ...basePreview,
        fallbackText: "[视频]",
        imageUrl: message.content.coverImageUrl,
        title: message.content.alt || message.content.durationLabel,
      };
    case "voice":
      return {
        ...basePreview,
        fallbackText: "[语音]",
        title: message.content.durationLabel,
      };
    case "file":
      return {
        ...basePreview,
        fallbackText: "[文件]",
        title: message.content.fileName,
      };
    case "h5":
      return {
        ...basePreview,
        fallbackText: "[链接]",
        imageUrl: message.content.previewImageUrl,
        title: message.content.title,
      };
    case "mini-program":
      return {
        ...basePreview,
        fallbackText: "[小程序]",
        imageUrl: message.content.coverImageUrl,
        title: message.content.title,
      };
    case "contact-card":
      return {
        ...basePreview,
        fallbackText: "[名片]",
        imageUrl: message.content.avatarUrl,
        title: message.content.name,
      };
    case "location":
      return {
        ...basePreview,
        fallbackText: "[位置]",
        title: message.content.title || message.content.address,
      };
    case "sphfeed":
      return {
        ...basePreview,
        fallbackText: "[视频号]",
        imageUrl: message.content.imageUrl,
        title: message.content.title,
      };
    case "solitaire":
      return {
        ...basePreview,
        fallbackText: "[接龙]",
        title: message.content.title,
      };
    case "redpacket":
      return {
        ...basePreview,
        fallbackText: "[红包]",
        title: message.content.title,
      };
    case "quote":
      return {
        ...basePreview,
        fallbackText: "[引用消息]",
        title: message.content.text,
      };
    case "chatrecord":
      return {
        ...basePreview,
        fallbackText: "[聊天记录]",
        title: message.content.msgTitle,
      };
  }
}

function getQuickReplyInitialValues(
  state:
    | { defaultCategoryId: string | 0; mode: "create" }
    | { mode: "copy"; quickReply: WorkbenchQuickReplyDto }
    | { mode: "edit"; quickReply: WorkbenchQuickReplyDto }
    | null,
): QuickReplyFormValues | undefined {
  if (!state) {
    return undefined;
  }

  if (state.mode === "create") {
    return {
      attachments: [],
      categoryId: state.defaultCategoryId,
      contentText: "",
      labelColor: "",
      labelText: "",
    };
  }

  if (state.mode === "copy") {
    return {
      attachments: [...state.quickReply.attachments],
      categoryId: state.quickReply.categoryId,
      contentText: state.quickReply.contentText,
      labelColor: state.quickReply.labelColor,
      labelText: state.quickReply.labelText,
    };
  }

  return {
    attachments: state.quickReply.attachments,
    categoryId: state.quickReply.categoryId,
    contentText: state.quickReply.contentText,
    labelColor: state.quickReply.labelColor,
    labelText: state.quickReply.labelText,
  };
}

async function handleSubmitQuickReplyForm(
  state:
    | { defaultCategoryId: string | 0; mode: "create" }
    | { mode: "copy"; quickReply: WorkbenchQuickReplyDto }
    | { mode: "edit"; quickReply: WorkbenchQuickReplyDto }
    | null,
  values: QuickReplyFormValues,
  createQuickReply: (values: QuickReplyFormValues) => Promise<void>,
  updateQuickReply: (
    quickReplyId: string,
    values: QuickReplyFormValues,
    scopeType?: WorkbenchQuickReplyDto["scopeType"],
  ) => Promise<void>,
) {
  if (state?.mode === "edit") {
    await updateQuickReply(state.quickReply.id, values, state.quickReply.scopeType);
    return;
  }

  await createQuickReply(values);
}

async function handleSubmitQuickReplyCategoryForm(
  state:
    | { mode: "create"; parentId: string | 0 }
    | { category: WorkbenchQuickReplyCategoryDto; mode: "edit" }
    | null,
  title: string,
  createCategory: (input: { parentId: string | 0; title: string }) => Promise<void>,
  updateCategory: (
    categoryId: string,
    title: string,
    scopeType?: WorkbenchQuickReplyCategoryDto["scopeType"],
  ) => Promise<void>,
) {
  if (state?.mode === "edit") {
    await updateCategory(state.category.id, title, state.category.scopeType);
    return;
  }

  await createCategory({
    parentId: state?.mode === "create" ? state.parentId : 0,
    title,
  });
}

function getSendErrorCode(error: unknown) {
  if (isErrorWithCode(error) && !isTransportErrorCode(error.code)) {
    return error.code;
  }

  if (isErrorWithStatus(error)) {
    return String(error.status);
  }

  if (isErrorWithCode(error)) {
    return error.code;
  }

  return "UNKNOWN";
}

function getSendErrorMessage(error: unknown) {
  if (isErrorWithMessage(error)) {
    return error.message;
  }

  return undefined;
}

function isErrorWithCode(error: unknown): error is { code: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string"
  );
}

function isErrorWithStatus(error: unknown): error is { status: number } {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof (error as { status: unknown }).status === "number"
  );
}

function isErrorWithMessage(error: unknown): error is { message: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  );
}

function isTransportErrorCode(code: string) {
  return code === "ERR_NETWORK" || code === "ECONNABORTED";
}
