import {
  AiSecurity03Icon,
  BookOpen01Icon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { LexicalEditor } from "lexical";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { canManageAiHostingAgents } from "@/pages/chat/ai-hosting/agent-permissions";
import {
  adaptSmartReplyViolationResult,
  buildSmartReplySendSegments,
  enrichSmartReplyRecommendedAttachmentsFromMessages,
  getSmartReplyCustomerQuestion,
  mergeSmartReplyRecommendedAttachments,
  resolveSmartReplyRecommendedAttachmentsSource,
  resolveSmartReplyReferenceMessageSeqs,
  type SmartReplySendPayload,
} from "@/pages/chat/api/smart-reply-adapter";
import {
  checkSmartReplyTextModeration,
  listSmartReplyAttachments,
  loadSmartReplyReferenceMessages,
} from "@/pages/chat/api/workbench-gateway";
import { REPLACE_COMPOSER_COMMAND } from "@/pages/chat/components/composer/lexical-commands";
import { $exportComposerSegments } from "@/pages/chat/components/composer/lexical-utils";
import { SmartReplyAddToFaqDialog } from "@/pages/chat/components/smart-reply-add-to-faq-dialog";
import type {
  Message,
  QuotedMessagePreviewContent,
} from "@/pages/chat/chat-types";
import type { SmartReplyAssistantTurn } from "@/pages/chat/lib/smart-reply-assistant";
import type { ComposerSegment } from "@/pages/chat/lib/composer-segments";
import type {
  SmartReplyRecommendedAttachment,
  SmartReplyViolationResult,
} from "@/pages/chat/lib/smart-reply-types";
import { useAuthStore } from "@/store/auth-store";

type PreparedSuggestion = {
  revision: string;
  segments: ComposerSegment[];
};

type UseSmartReplyComposerOptions = {
  approvedOverwriteLookupKey?: string;
  composerRef: React.RefObject<LexicalEditor | null>;
  conversationId?: string;
  conversationMessages: Message[];
  draftText: string;
  isSending: boolean;
  onSend?: (
    message: SmartReplyAssistantTurn["message"],
    payload: SmartReplySendPayload,
  ) => void | Promise<{ ok: boolean } | undefined>;
  quotedMessage: QuotedMessagePreviewContent | null;
  turn?: SmartReplyAssistantTurn;
};

type SmartReplyComposerState = {
  canEdit: boolean;
  clearTransientState: () => void;
  dialog: ReactNode;
  hasAppliedSuggestion: boolean;
  isSuggestionMode: boolean;
  notice: ReactNode;
  onSendDraft: (segments: ComposerSegment[]) => void;
  overwriteConfirmationLookupKey?: string;
  rightActions: ReactNode;
};

export function useSmartReplyComposer({
  approvedOverwriteLookupKey,
  composerRef,
  conversationId,
  conversationMessages,
  draftText,
  isSending,
  onSend,
  quotedMessage,
  turn,
}: UseSmartReplyComposerOptions): SmartReplyComposerState {
  const subUser = useAuthStore((state) => state.subUser);
  const canManageKnowledgeBase = canManageAiHostingAgents(subUser);
  const conversationMessagesRef = useRef(conversationMessages);
  conversationMessagesRef.current = conversationMessages;
  const suggestion = turn?.suggestion;
  const turnLookupKey = turn?.lookupKey;
  const suggestionRevision = useMemo(
    () =>
      turnLookupKey
        ? [
            turnLookupKey,
            suggestion?.recordId ?? "",
            suggestion?.content ?? "",
            suggestion?.refAttachIds?.join(",") ?? "",
          ].join(":")
        : undefined,
    [
      suggestion?.content,
      suggestion?.recordId,
      suggestion?.refAttachIds,
      turnLookupKey,
    ],
  );
  const syncPreparedSuggestion = useMemo(() => {
    if (!turnLookupKey || !suggestionRevision || !suggestion) {
      return null;
    }
    return buildInitialPreparedSuggestion({
      conversationMessages,
      suggestion,
      suggestionRevision,
    });
  }, [conversationMessages, suggestion, suggestionRevision, turnLookupKey]);
  const [asyncPreparedSuggestion, setAsyncPreparedSuggestion] =
    useState<PreparedSuggestion | null>(null);
  const preparedSuggestion =
    syncPreparedSuggestion ??
    (asyncPreparedSuggestion?.revision === suggestionRevision
      ? asyncPreparedSuggestion
      : null);
  const [appliedSuggestion, setAppliedSuggestion] = useState<{
    lookupKey: string;
    revision: string;
  } | null>(null);
  const [overwriteConfirmationLookupKey, setOverwriteConfirmationLookupKey] =
    useState<string>();
  const [isFaqDialogOpen, setIsFaqDialogOpen] = useState(false);
  const [isCheckingViolations, setIsCheckingViolations] = useState(false);
  const violationCheckIdRef = useRef(0);
  const [violationResult, setViolationResult] =
    useState<SmartReplyViolationResult | null>(null);
  const [violationCheckedClean, setViolationCheckedClean] = useState(false);

  useEffect(() => {
    violationCheckIdRef.current += 1;
    setAsyncPreparedSuggestion(null);
    setAppliedSuggestion(null);
    setOverwriteConfirmationLookupKey(undefined);
    setIsFaqDialogOpen(false);
    setIsCheckingViolations(false);
    setViolationResult(null);
    setViolationCheckedClean(false);
  }, [conversationId]);

  useEffect(() => {
    if (turn) {
      return;
    }

    violationCheckIdRef.current += 1;
    setAsyncPreparedSuggestion(null);
    setAppliedSuggestion(null);
    setOverwriteConfirmationLookupKey(undefined);
    setIsFaqDialogOpen(false);
    setIsCheckingViolations(false);
    setViolationResult(null);
    setViolationCheckedClean(false);
  }, [turn]);

  useEffect(() => {
    if (!turnLookupKey || !suggestionRevision || !suggestion) {
      setAsyncPreparedSuggestion(null);
      return;
    }

    if (syncPreparedSuggestion) {
      setAsyncPreparedSuggestion(null);
      setViolationResult(null);
      setViolationCheckedClean(false);
      return;
    }

    const content = suggestion.content ?? "";
    const source = resolveSmartReplyRecommendedAttachmentsSource({
      genAnswer: suggestion.genAnswer,
      refAttachIds: suggestion.refAttachIds,
    });
    let cancelled = false;

    setAsyncPreparedSuggestion(null);
    setViolationResult(null);
    setViolationCheckedClean(false);

    const prepare = async () => {
      let attachments = source.inlineAttachments;

      if (conversationId && source.attachmentIds.length > 0) {
        try {
          const loaded = await listSmartReplyAttachments(
            conversationId,
            source.attachmentIds,
          );
          attachments = mergeSmartReplyRecommendedAttachments(
            loaded,
            source.inlineAttachments,
          );
        } catch {
          attachments = source.inlineAttachments;
        }
      }

      if (cancelled) {
        return;
      }

      let referenceMessages = conversationMessagesRef.current;
      const referenceMessageSeqs =
        resolveSmartReplyReferenceMessageSeqs(attachments);

      if (conversationId && referenceMessageSeqs.length > 0) {
        try {
          const loadedReferenceMessages = await loadSmartReplyReferenceMessages(
            conversationId,
            referenceMessageSeqs,
          );
          referenceMessages = [
            ...loadedReferenceMessages,
            ...conversationMessagesRef.current,
          ];
        } catch {
          referenceMessages = conversationMessagesRef.current;
        }
      }

      if (cancelled) {
        return;
      }

      const enriched = enrichSmartReplyRecommendedAttachmentsFromMessages(
        attachments,
        referenceMessages,
      );
      const selectedAttachmentIds = getInitiallySelectedAttachmentIds(enriched);

      setAsyncPreparedSuggestion({
        revision: suggestionRevision,
        segments: buildSmartReplySendSegments({
          content,
          recommendedAttachments: enriched,
          selectedAttachmentIds,
        }),
      });
    };

    void prepare();

    return () => {
      cancelled = true;
    };
  }, [
    conversationId,
    suggestion,
    suggestionRevision,
    syncPreparedSuggestion,
    turnLookupKey,
  ]);

  const applySuggestion = () => {
    if (
      !turn ||
      turn.phase !== "confirmation" ||
      !suggestionRevision ||
      preparedSuggestion?.revision !== suggestionRevision ||
      appliedSuggestion?.revision === suggestionRevision
    ) {
      return;
    }

    const hasAppliedThisTurn = appliedSuggestion?.lookupKey === turn.lookupKey;
    let hasComposerSegments = false;
    composerRef.current?.getEditorState().read(() => {
      hasComposerSegments = $exportComposerSegments().length > 0;
    });

    if (
      !hasAppliedThisTurn &&
      approvedOverwriteLookupKey !== turn.lookupKey &&
      (hasComposerSegments || quotedMessage !== null)
    ) {
      setOverwriteConfirmationLookupKey(turn.lookupKey);
      return;
    }

    const editor = composerRef.current;
    if (!editor) {
      return;
    }

    setOverwriteConfirmationLookupKey(undefined);
    const didReplace = editor.dispatchCommand(REPLACE_COMPOSER_COMMAND, {
      segments: preparedSuggestion.segments,
    });
    if (!didReplace) {
      return;
    }

    setAppliedSuggestion({
      lookupKey: turn.lookupKey,
      revision: suggestionRevision,
    });
  };

  useLayoutEffect(applySuggestion, [
    appliedSuggestion,
    approvedOverwriteLookupKey,
    composerRef,
    preparedSuggestion,
    quotedMessage,
    suggestionRevision,
    turn,
  ]);

  useEffect(applySuggestion, [
    appliedSuggestion,
    approvedOverwriteLookupKey,
    composerRef,
    preparedSuggestion,
    quotedMessage,
    suggestionRevision,
    turn,
  ]);

  useEffect(() => {
    if (!turn || overwriteConfirmationLookupKey === turn.lookupKey) {
      return;
    }

    setOverwriteConfirmationLookupKey(undefined);
  }, [overwriteConfirmationLookupKey, turn]);

  const clearTransientState = () => {
    violationCheckIdRef.current += 1;
    setIsFaqDialogOpen(false);
    setIsCheckingViolations(false);
    setViolationResult(null);
    setViolationCheckedClean(false);
    setOverwriteConfirmationLookupKey(undefined);
  };
  const hasAppliedCurrentSuggestion = Boolean(
    turnLookupKey &&
      suggestionRevision &&
      appliedSuggestion?.lookupKey === turnLookupKey &&
      appliedSuggestion.revision === suggestionRevision,
  );
  const isRetainedFailedSuggestion = Boolean(
    turn?.phase === "failed" && hasAppliedCurrentSuggestion,
  );
  const isSuggestionMode = Boolean(
    turn?.phase === "thinking" ||
      turn?.phase === "confirmation" ||
      isRetainedFailedSuggestion,
  );
  const isPrepared =
    Boolean(suggestionRevision) &&
    preparedSuggestion?.revision === suggestionRevision;
  const canEdit = Boolean(
    ((turn?.phase === "confirmation" && turn.isComposerEditable) ||
      isRetainedFailedSuggestion) &&
      isPrepared &&
      hasAppliedCurrentSuggestion &&
      !isSending,
  );
  const effectiveDraftText =
    draftText ||
    (hasAppliedCurrentSuggestion ? suggestion?.content ?? "" : "");
  const handleCheckViolations = async () => {
    const content = effectiveDraftText.trim();

    if (!conversationId || !content || isCheckingViolations) {
      return;
    }

    setIsCheckingViolations(true);
    setViolationResult(null);
    setViolationCheckedClean(false);
    const checkId = violationCheckIdRef.current + 1;
    violationCheckIdRef.current = checkId;

    try {
      const response = await checkSmartReplyTextModeration(
        conversationId,
        content,
      );
      if (violationCheckIdRef.current !== checkId) {
        return;
      }

      const result = adaptSmartReplyViolationResult(response);
      setViolationResult(result);
      setViolationCheckedClean(!result);
    } catch {
      if (violationCheckIdRef.current === checkId) {
        toast.error("操作失败，请稍后重试");
      }
    } finally {
      if (violationCheckIdRef.current === checkId) {
        setIsCheckingViolations(false);
      }
    }
  };
  const handleDismissViolationResult = () => {
    setViolationResult(null);
    setViolationCheckedClean(false);
  };
  const handleSend = async (segments: ComposerSegment[]) => {
    if (!canEdit || !onSend || !turn) {
      return;
    }

    clearTransientState();
    await onSend(turn.message, {
      content: effectiveDraftText.trim(),
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
      recommendedAttachments: [],
      segments,
      selectedAttachmentIds: [],
    });
  };
  const rightActions = isSuggestionMode ? (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <Button
              aria-label="添加到FAQ"
              className="size-8 p-0 shadow-none"
              disabled={
                !canManageKnowledgeBase || !canEdit || !effectiveDraftText.trim()
              }
              onClick={() => setIsFaqDialogOpen(true)}
              size="icon"
              type="button"
              variant="ghost"
            >
              <HugeiconsIcon icon={BookOpen01Icon} size={16} strokeWidth={2} />
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={6}>
          添加到FAQ
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <Button
              aria-label="违规词检测"
              className="size-8 p-0 shadow-none"
              disabled={
                !canEdit ||
                !conversationId ||
                !effectiveDraftText.trim() ||
                isCheckingViolations
              }
              onClick={() => void handleCheckViolations()}
              size="icon"
              type="button"
              variant="ghost"
            >
              {isCheckingViolations ? (
                <Spinner className="text-current" size={14} variant="classic" />
              ) : (
                <HugeiconsIcon icon={AiSecurity03Icon} size={16} strokeWidth={2} />
              )}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={6}>
          {isCheckingViolations ? "检测中" : "违规词检测"}
        </TooltipContent>
      </Tooltip>
    </>
  ) : null;
  const notice = isCheckingViolations ? (
    <div
      className="flex h-7 min-w-0 flex-1 items-center gap-2 rounded-[8px] bg-muted/50 px-2.5 text-[12px] leading-4 text-muted-foreground"
      role="status"
    >
      <Spinner className="shrink-0 text-current" size={14} variant="classic" />
      <span className="truncate">正在检测</span>
    </div>
  ) : violationResult ? (
    <div
      className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-[8px] bg-destructive/8 px-2 text-[12px] leading-4 text-destructive"
      role="status"
    >
      <HugeiconsIcon
        className="shrink-0"
        icon={AiSecurity03Icon}
        size={14}
        strokeWidth={2}
      />
      <span className="min-w-0 truncate">
        发现违规词：{violationResult.words.join("、")}
      </span>
      <Button
        aria-label="关闭检测结果"
        className="ml-auto size-5 shrink-0 rounded-full p-0 text-current shadow-none hover:bg-destructive/10 hover:text-current"
        onClick={handleDismissViolationResult}
        size="icon"
        type="button"
        variant="ghost"
      >
        <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={2} />
      </Button>
    </div>
  ) : violationCheckedClean ? (
    <div
      className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-[8px] bg-success-muted/40 px-2 text-[12px] leading-4 text-success"
      role="status"
    >
      <HugeiconsIcon
        className="shrink-0"
        icon={AiSecurity03Icon}
        size={14}
        strokeWidth={2}
      />
      <span className="min-w-0 truncate">未发现违规词</span>
      <Button
        aria-label="关闭检测结果"
        className="ml-auto size-5 shrink-0 rounded-full p-0 text-current shadow-none hover:bg-success-muted/60 hover:text-current"
        onClick={handleDismissViolationResult}
        size="icon"
        type="button"
        variant="ghost"
      >
        <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={2} />
      </Button>
    </div>
  ) : null;
  const dialog = turn ? (
    <SmartReplyAddToFaqDialog
      canManage={canManageKnowledgeBase}
      initialAnswer={effectiveDraftText}
      initialQuestion={getSmartReplyCustomerQuestion(turn.message)}
      onOpenChange={setIsFaqDialogOpen}
      open={isFaqDialogOpen}
    />
  ) : null;

  return {
    canEdit,
    clearTransientState,
    dialog,
    hasAppliedSuggestion:
      Boolean(turn) && appliedSuggestion?.lookupKey === turn?.lookupKey,
    isSuggestionMode,
    notice,
    onSendDraft: handleSend,
    overwriteConfirmationLookupKey,
    rightActions,
  };
}

function getInitiallySelectedAttachmentIds(
  attachments: SmartReplyRecommendedAttachment[],
) {
  return attachments.map((attachment) => attachment.id);
}

function buildInitialPreparedSuggestion({
  conversationMessages,
  suggestion,
  suggestionRevision,
}: {
  conversationMessages: Message[];
  suggestion: NonNullable<SmartReplyAssistantTurn["suggestion"]>;
  suggestionRevision: string;
}): PreparedSuggestion | null {
  const source = resolveSmartReplyRecommendedAttachmentsSource({
    genAnswer: suggestion.genAnswer,
    refAttachIds: suggestion.refAttachIds,
  });

  if (source.attachmentIds.length > 0) {
    return null;
  }

  const attachments = source.inlineAttachments;
  const referenceMessageSeqs =
    resolveSmartReplyReferenceMessageSeqs(attachments);

  if (referenceMessageSeqs.length > 0) {
    return null;
  }

  const enriched = enrichSmartReplyRecommendedAttachmentsFromMessages(
    attachments,
    conversationMessages,
  );
  const selectedAttachmentIds = getInitiallySelectedAttachmentIds(enriched);

  return {
    revision: suggestionRevision,
    segments: buildSmartReplySendSegments({
      content: suggestion.content ?? "",
      recommendedAttachments: enriched,
      selectedAttachmentIds,
    }),
  };
}
