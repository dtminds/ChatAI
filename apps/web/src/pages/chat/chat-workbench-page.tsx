import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { LexicalEditor } from "lexical";
import { AlertCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DotMatrixLoader } from "@/components/ui/dot-matrix-loader";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { notifyAuthSessionChanged } from "@/pages/auth/auth-tokens";
import { logout } from "@/pages/auth/auth-service";
import { AccountRail } from "@/pages/chat/components/account-rail";
import { ChatPanel } from "@/pages/chat/components/chat-panel";
import { ConversationListPanel } from "@/pages/chat/components/conversation-list-panel";
import type { InputEnterBehavior } from "@/pages/chat/components/input-enter-behavior";
import {
  CLEAR_COMPOSER_COMMAND,
  INSERT_COMPOSER_MENTION_COMMAND,
  UPDATE_COMPOSER_IMAGE_COMMAND,
} from "@/pages/chat/components/composer/lexical-commands";
import { useAccountRailResize } from "@/pages/chat/hooks/use-account-rail-resize";
import { useCustomerPanelResize } from "@/pages/chat/hooks/use-customer-panel-resize";
import { useMessageScrollRestoration } from "@/pages/chat/hooks/use-message-scroll-restoration";
import { useConversationRevealTimer } from "@/pages/chat/hooks/use-conversation-reveal-timer";
import { useWorkbenchPolling } from "@/pages/chat/hooks/use-workbench-polling";
import type { PollingPauseReason } from "@/pages/chat/hooks/use-workbench-polling";
import { useWorkbenchStore } from "@/store/workbench-store";
import type {
  ChatMessage,
  ChatMode,
  FileUploadQueueItem,
  Message,
  QuotedMessagePreviewContent,
} from "@/pages/chat/chat-types";
import { uploadWorkbenchFile } from "@/pages/chat/api/media-upload-service";
import { getVisibleConversations } from "@/pages/chat/api/workbench-gateway";
import {
  downloadMessageFile,
  getMessageFileDownloadStatus,
} from "@/pages/chat/api/workbench-gateway";
import {
  isComposerFileSizeAllowed,
  isSupportedComposerFile,
} from "@/pages/chat/lib/composer-file-files";
import {
  extractComposerMentionState,
  type ComposerSegment,
} from "@/pages/chat/lib/composer-segments";
import { openMessageDownloadUrl } from "@/pages/chat/lib/message-download";
import { canUseExpiringUrl } from "@/pages/chat/lib/message-url-expiry";
import { findViewportAnchor } from "@/pages/chat/lib/scroll-anchor";
import {
  CONVERSATION_LIST_PANEL_WIDTH,
  MIN_WORKBENCH_CONTENT_WIDTH,
} from "@/pages/chat/lib/panel-width";

const ACCOUNT_RAIL_COLLAPSED_STORAGE_KEY = "chatai.accountRailCollapsed";
const MAX_ACTIVE_DOWNLOAD_TRANSFERS = 3;
const DOWNLOAD_STATUS_POLL_INTERVAL_MS = 3000;
const MAX_DOWNLOAD_STATUS_POLL_COUNT = 40;

type PendingComposerDiscardSwitch =
  | {
      conversationId: string;
      type: "conversation";
    }
  | {
      mode: ChatMode;
      type: "mode";
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
    deleteConversation,
    groupMembersLoadingByConversationId,
    groupMembersByConversationId,
    dismissScopeTransitionError,
    dismissReadReceiptError,
    hasMoreHistoryByConversationId,
    historyStatusByConversationId,
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
    pollState,
    pollWorkbench,
    readReceiptError,
    pinConversation,
    retryFailedMessage,
    scopeTransitionError,
    sendAgentMessageSegments,
    setActiveAccount,
    setActiveConversation,
    setActiveMode,
    sidebarItems,
    takeOverAccount,
    takeoverStatusByAccountId,
    unpinConversation,
    updateMessageDownloadContent,
  } = useWorkbenchStore();

  const [draft, setDraft] = useState("");
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [composerSegments, setComposerSegments] = useState<ComposerSegment[]>(
    [],
  );
  const [sendFailureDialog, setSendFailureDialog] = useState<{
    description: string;
    title: string;
  } | null>(null);
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
  const [quotedMessage, setQuotedMessage] =
    useState<QuotedMessagePreviewContent | null>(null);
  const [pendingComposerDiscardSwitch, setPendingComposerDiscardSwitch] =
    useState<PendingComposerDiscardSwitch | null>(null);
  const [isAccountRailCollapsed, setIsAccountRailCollapsed] = useState(
    getInitialAccountRailCollapsed,
  );
  const [inputEnterBehavior, setInputEnterBehavior] =
    useState<InputEnterBehavior>("send");
  const workbenchBodyRef = useRef<HTMLDivElement | null>(null);
  const messageViewportRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<LexicalEditor | null>(null);
  const isSendingDraftRef = useRef(false);
  const isMountedRef = useRef(true);
  const fileUploadQueueRef = useRef<typeof fileUploadQueue>([]);
  const fileUploadAbortControllersRef = useRef(
    new Map<string, AbortController>(),
  );
  const [downloadTransferStates, setDownloadTransferStates] = useState<
    Record<string, "idle" | "transferring">
  >({});
  const downloadPollingTimeoutsRef = useRef(new Map<string, number>());
  const downloadPollingMessageIdsRef = useRef(new Set<string>());
  const downloadPollingConversationRef = useRef<string | undefined>(undefined);
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
  const activeConversation =
    visibleConversations.find(
      (conversation) => conversation.id === activeConversationId,
    ) ?? visibleConversations[0];
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
  const isActiveAccountOffline = activeAccount?.loginStatus === "offline";
  const isActiveAccountTakenOver =
    !!activeAccount?.takenOverEmployeeId &&
    activeAccount.takenOverEmployeeId === me?.id;
  const canSendMessage =
    !!activeConversation &&
    !isActiveAccountOffline &&
    isActiveAccountTakenOver;
  const sidebarIframeTos: "0" | "1" =
    !!activeAccount?.takenOverEmployeeId &&
    activeAccount.takenOverEmployeeId === me?.id
      ? "1"
      : "0";
  const isConversationActionDisabled =
    isActiveAccountOffline || !isActiveAccountTakenOver;
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

  const clearDownloadPollingTimers = () => {
    downloadPollingTimeoutsRef.current.forEach((timeoutId) => {
      window.clearTimeout(timeoutId);
    });
    downloadPollingTimeoutsRef.current.clear();
    downloadPollingMessageIdsRef.current.clear();
  };

  const updateDownloadTransferState = (
    messageId: string,
    state: "idle" | "transferring",
  ) => {
    if (!isMountedRef.current) {
      return;
    }

    setDownloadTransferStates((currentStates) => {
      if (state === "idle") {
        const { [messageId]: _ignored, ...nextStates } = currentStates;
        return nextStates;
      }

      return {
        ...currentStates,
        [messageId]: state,
      };
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
    void initializeWorkbench();
  }, [initializeWorkbench]);

  useEffect(
    () => {
      isMountedRef.current = true;

      return () => {
        isMountedRef.current = false;
        fileUploadAbortControllersRef.current.forEach((controller) => {
          controller.abort();
        });
        fileUploadAbortControllersRef.current.clear();
        fileUploadQueueRef.current = [];
        clearDownloadPollingTimers();
      };
    },
    [],
  );

  useEffect(() => {
    if (downloadPollingConversationRef.current === activeConversation?.id) {
      return;
    }

    clearDownloadPollingTimers();
    downloadPollingConversationRef.current = activeConversation?.id;
    setDownloadTransferStates({});
  }, [activeConversation?.id]);

  useEffect(() => {
    if (!activeConversation) {
      return;
    }

    const restorableMessages = getRestorableDownloadMessages(activeMessages);
    const restorableIds = new Set(restorableMessages.map((message) => message.id));

    downloadPollingMessageIdsRef.current.forEach((messageId) => {
      if (!restorableIds.has(messageId)) {
        stopMessageDownloadPolling(messageId);
      }
    });

    restorableMessages.forEach((message) => {
      if (downloadPollingMessageIdsRef.current.has(message.id)) {
        return;
      }

      updateDownloadTransferState(message.id, "transferring");
      startMessageDownloadPolling(message);
    });
  }, [activeConversation?.id, activeMessages]);

  useEffect(() => {
    if (!readReceiptError) {
      return;
    }

    toast.warning(readReceiptError);
    dismissReadReceiptError();
  }, [dismissReadReceiptError, readReceiptError]);

  useEffect(() => {
    setIsEmojiPickerOpen(false);
  }, [activeConversation?.id]);

  useWorkbenchPolling({
    activeAccountId,
    bootstrapStatus,
    currentUserId: me?.id,
    intervalMs: pollState.intervalMs,
    jitterMs: pollState.jitterMs,
    onPollingPaused: handlePollingPaused,
    refreshSeatSummaries,
    pollWorkbench,
  });

  const clearComposer = (options?: { keepQuote?: boolean }) => {
    composerRef.current?.dispatchCommand(CLEAR_COMPOSER_COMMAND, undefined);
    setDraft("");
    setComposerSegments([]);
    if (!options?.keepQuote) {
      setQuotedMessage(null);
    }
  };

  const handleSendDraft = async (segments: ComposerSegment[]) => {
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
              quotedMessageId: quotedMessage.quotedMessageId,
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

      if (!result.ok) {
        setSendFailureDialog(
          getSendFailureDialogCopy(result.reason, result.errorCode),
        );
        composerRef.current?.focus();
        return;
      }

      clearComposer({
        keepQuote: quotedMessage !== null && !result.didConsumeQuote,
      });
      composerRef.current?.focus();
    } finally {
      isSendingDraftRef.current = false;
      setIsSendingDraft(false);
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
              getSendFailureDialogCopy(result.reason, result.errorCode),
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
              getSendFailureDialogCopy("file-upload", getSendErrorCode(error)),
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

    if (
      downloadPollingMessageIdsRef.current.size >=
      MAX_ACTIVE_DOWNLOAD_TRANSFERS
    ) {
      toast.warning("下载队列已满，请稍后");
      return;
    }

    if (message.conversationId !== activeConversation.id) {
      return;
    }

    updateDownloadTransferState(message.id, "transferring");
    downloadPollingMessageIdsRef.current.add(message.id);
    updateMessageDownloadContent(message.conversationId, message.id, {
      downloadStatus: "ing",
    });

    void downloadMessageFile({
      conversationId: message.conversationId,
      messageId: message.remoteMessageId ?? message.id,
      messageSeq: message.seq,
    })
      .then(() => {
        if (!isMountedRef.current) {
          return;
        }

        startMessageDownloadPolling(message);
      })
      .catch(() => {
        if (!isMountedRef.current) {
          return;
        }

        stopMessageDownloadPolling(message.id);
        updateMessageDownloadContent(message.conversationId, message.id, {
          downloadStatus: "failed",
        });
        toast.warning("下载失败，请稍后重试");
      });
  };

  const startMessageDownloadPolling = (message: ChatMessage) => {
    downloadPollingMessageIdsRef.current.add(message.id);

    if (downloadPollingTimeoutsRef.current.has(message.id)) {
      return;
    }

    pollMessageDownloadStatus(message, 0);
  };

  const stopMessageDownloadPolling = (messageId: string) => {
    const timeoutId = downloadPollingTimeoutsRef.current.get(messageId);

    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
      downloadPollingTimeoutsRef.current.delete(messageId);
    }

    downloadPollingMessageIdsRef.current.delete(messageId);
    updateDownloadTransferState(messageId, "idle");
  };

  const pollMessageDownloadStatus = (message: ChatMessage, attempt: number) => {
    if (!isMountedRef.current || !message.seq) {
      stopMessageDownloadPolling(message.id);
      return;
    }

    if (attempt >= MAX_DOWNLOAD_STATUS_POLL_COUNT) {
      stopMessageDownloadPolling(message.id);
      updateMessageDownloadContent(message.conversationId, message.id, {
        downloadStatus: "failed",
      });
      toast.warning("文件下载超时，请稍后重试");
      return;
    }

    const timeoutId = window.setTimeout(() => {
      downloadPollingTimeoutsRef.current.delete(message.id);

      if (
        !isMountedRef.current ||
        downloadPollingConversationRef.current !== message.conversationId
      ) {
        downloadPollingMessageIdsRef.current.delete(message.id);
        return;
      }

      void getMessageFileDownloadStatus({
        conversationId: message.conversationId,
        messageSeq: message.seq ?? 0,
      })
        .then((status) => {
          if (
            !isMountedRef.current ||
            downloadPollingConversationRef.current !== message.conversationId
          ) {
            return;
          }

          if (status?.downloadStatus === "finished") {
            stopMessageDownloadPolling(message.id);
            updateMessageDownloadContent(message.conversationId, message.id, {
              downloadStatus: "finished",
              fileUrlExpireTime: status.fileUrlExpireTime,
              fileUrl: status.fileUrl,
            });

            if (message.content.type === "file" && status.fileUrl) {
              openMessageDownloadUrl(message, status.fileUrl);
            }
            return;
          }

          if (status?.downloadStatus === "failed") {
            stopMessageDownloadPolling(message.id);
            updateMessageDownloadContent(message.conversationId, message.id, {
              downloadStatus: "failed",
            });
            toast.warning("下载失败，请稍后重试");
            return;
          }

          pollMessageDownloadStatus(message, attempt + 1);
        })
        .catch(() => {
          if (!isMountedRef.current) {
            return;
          }

          if (downloadPollingConversationRef.current !== message.conversationId) {
            return;
          }

          stopMessageDownloadPolling(message.id);
          updateMessageDownloadContent(message.conversationId, message.id, {
            downloadStatus: "failed",
          });
          window.setTimeout(() => {
            if (
              !isMountedRef.current ||
              downloadPollingConversationRef.current !== message.conversationId
            ) {
              return;
            }

            toast.warning("下载失败，请稍后重试");
          }, 0);
        });
    }, DOWNLOAD_STATUS_POLL_INTERVAL_MS);

    downloadPollingTimeoutsRef.current.set(message.id, timeoutId);
  };

  const handleDraftChange = (nextDraft: string) => {
    setDraft(nextDraft);
  };

  const handleComposerSegmentsChange = (nextSegments: ComposerSegment[]) => {
    setComposerSegments(nextSegments);
  };

  const hasUnsentComposerContent = () =>
    draft.trim().length > 0 ||
    composerSegments.length > 0 ||
    quotedMessage !== null;

  const handleSelectConversation = async (conversationId: string) => {
    if (conversationId === activeConversationId) {
      return;
    }

    if (hasActiveFileUploads()) {
      setFileUploadTransitionError("文件上传中，暂不能切换会话");
      return;
    }

    if (hasUnsentComposerContent()) {
      setPendingComposerDiscardSwitch({
        conversationId,
        type: "conversation",
      });
      return;
    }

    clearComposer();
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

    if (hasUnsentComposerContent()) {
      setPendingComposerDiscardSwitch({
        mode,
        type: "mode",
      });
      return;
    }

    clearComposer();
    await setActiveMode(mode);
  };

  const cancelPendingComposerDiscardSwitch = () => {
    setPendingComposerDiscardSwitch(null);
    composerRef.current?.focus();
  };

  const confirmPendingComposerDiscardSwitch = async () => {
    const pendingSwitch = pendingComposerDiscardSwitch;

    if (!pendingSwitch) {
      return;
    }

    setPendingComposerDiscardSwitch(null);
    clearComposer();

    if (pendingSwitch.type === "conversation") {
      await setActiveConversation(pendingSwitch.conversationId);
      return;
    }

    await setActiveMode(pendingSwitch.mode);
  };

  const handleOpenQuotedMessage = (quoteMsgId: string) => {
    const quoteSeq = Number(quoteMsgId);
    const originalMessage = Number.isSafeInteger(quoteSeq)
      ? activeMessages.find((message) => message.seq === quoteSeq)
      : undefined;
    const viewport = messageViewportRef.current;
    const anchor =
      viewport && originalMessage
        ? findViewportAnchor(viewport, originalMessage.id)
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

    setQuotedMessage(buildQuotedMessagePreview(message));
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

    composerRef.current?.dispatchCommand(INSERT_COMPOSER_MENTION_COMMAND, {
      displayName: message.senderDisplayName || message.sender.name,
      memberId: message.sender.groupMemberId,
    });
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
              (isResizingAccountRail || isResizingCustomerPanel) &&
                "select-none",
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
                conversations={visibleSearchableConversations}
                isConversationActionDisabled={isConversationActionDisabled}
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
                activeConversation={activeConversation}
                activeHistoryStatus={activeHistoryStatus}
                canSendMessage={canSendMessage}
                composerPlaceholder={composerPlaceholder}
                customer={activeCustomer}
                sidebarIframeTos={sidebarIframeTos}
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
                downloadTransferStates={downloadTransferStates}
                hasMoreHistory={hasMoreHistory}
                historyLoadLabel={historyLoadLabel}
                messages={activeMessages}
                messageViewportRef={messageViewportRef}
                quotedMessage={quotedMessage}
                sidebarItems={sidebarItems}
                onCustomerPanelResizeStart={handleCustomerPanelResizeStart}
                onComposerSegmentsChange={handleComposerSegmentsChange}
                onCancelFileUpload={handleCancelFileUpload}
                onClearQuotedMessage={() => setQuotedMessage(null)}
                onDownloadMessageFile={handleDownloadMessageFile}
                onDraftChange={handleDraftChange}
                onEmojiPickerOpenChange={setIsEmojiPickerOpen}
                onEnterBehaviorChange={setInputEnterBehavior}
                onFileSelect={handleFileSelect}
                onRefreshGroupMembers={() => {
                  void loadActiveGroupMembers({ force: true });
                }}
                onLoadOlderMessages={handleLoadOlderMessages}
                onMentionMessage={handleMentionMessage}
                onOpenQuotedMessage={handleOpenQuotedMessage}
                onQuoteMessage={handleQuoteMessage}
                onMessageViewportScroll={handleMessageViewportScroll}
                onRetryMessage={retryFailedMessage}
                onSendDraft={handleSendDraft}
                onDismissScopeTransitionError={() => {
                  setFileUploadTransitionError(undefined);
                  dismissScopeTransitionError();
                }}
                scopeTransitionError={
                  fileUploadTransitionError ?? scopeTransitionError
                }
                composerRef={composerRef}
                workbenchBodyRef={workbenchBodyRef}
              />
            </div>
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
              <AlertDialogDescription>
                {sendFailureDialog?.description}
              </AlertDialogDescription>
            </AlertDialogHeader>
          </div>
          <AlertDialogFooter>
            <AlertDialogAction variant="destructive">知道了</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={pendingComposerDiscardSwitch !== null}
        onOpenChange={(open) => {
          if (!open) {
            cancelPendingComposerDiscardSwitch();
          }
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>切换会话？</AlertDialogTitle>
            <AlertDialogDescription>
              切换后，输入框中的未发送内容会被清空。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>继续编辑</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                void confirmPendingComposerDiscardSwitch();
              }}
            >
              确认切换
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function getSendFailureDialogCopy(
  reason: "file-upload" | "image-upload" | "send" | "unavailable",
  errorCode: string,
) {
  if (reason === "file-upload") {
    return {
      title: "文件上传失败，请稍后重试",
      description: `ErrorCode: ${errorCode}`,
    };
  }

  if (reason === "image-upload") {
    return {
      title: "图片上传失败，请稍后重试",
      description: `ErrorCode: ${errorCode}`,
    };
  }

  if (reason === "unavailable") {
    return {
      title: "当前无法发送消息，请稍后重试",
      description: `ErrorCode: ${errorCode}`,
    };
  }

  return {
    title: "发送失败，请稍后重试",
    description: `ErrorCode: ${errorCode}`,
  };
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

function getRestorableDownloadMessages(messages: Message[]) {
  return messages
    .filter((message): message is ChatMessage => {
      if (message.role === "system") {
        return false;
      }

      if (message.content.type !== "file" && message.content.type !== "video") {
        return false;
      }

      return (
        message.content.downloadStatus === "ing" &&
        Boolean(message.seq)
      );
    })
    .sort(
      (left, right) =>
        getMessageDownloadOrderValue(right) - getMessageDownloadOrderValue(left),
    )
    .slice(0, MAX_ACTIVE_DOWNLOAD_TRANSFERS);
}

function getMessageDownloadOrderValue(message: ChatMessage) {
  return message.seq ?? 0;
}

function buildQuotedMessagePreview(
  message: ChatMessage,
): QuotedMessagePreviewContent {
  const senderName =
    message.senderDisplayName || message.sender.name || message.author;
  const basePreview = {
    contentType: message.content.type,
    quoteMsgId: String(message.seq ?? message.remoteMessageId ?? message.id),
    quotedMessageId: message.remoteMessageId ?? message.id,
    senderName,
  } satisfies Pick<
    QuotedMessagePreviewContent,
    "contentType" | "quoteMsgId" | "quotedMessageId" | "senderName"
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
  }
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

function isTransportErrorCode(code: string) {
  return code === "ERR_NETWORK" || code === "ECONNABORTED";
}
