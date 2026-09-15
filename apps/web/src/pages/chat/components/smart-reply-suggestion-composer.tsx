import {
  AiSecurity03Icon,
  BookOpen01Icon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ComponentProps } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
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
  type SmartReplySendPayload,
} from "@/pages/chat/api/smart-reply-adapter";
import {
  checkSmartReplyTextModeration,
  listSmartReplyAttachments,
} from "@/pages/chat/api/workbench-gateway";
import { ChatComposer } from "@/pages/chat/components/chat-composer";
import { SmartReplyAddToFaqDialog } from "@/pages/chat/components/smart-reply-add-to-faq-dialog";
import type { Message } from "@/pages/chat/chat-types";
import type { SmartReplyAssistantTurn } from "@/pages/chat/lib/smart-reply-assistant";
import type { ComposerSegment } from "@/pages/chat/lib/composer-segments";
import type {
  SmartReplyRecommendedAttachment,
  SmartReplyViolationResult,
} from "@/pages/chat/lib/smart-reply-types";
import { useAuthStore } from "@/store/auth-store";

type SharedComposerProps = Omit<
  ComponentProps<typeof ChatComposer>,
  | "canSendMessage"
  | "composerMode"
  | "composerRef"
  | "historyKey"
  | "initialSegments"
  | "isSending"
  | "notice"
  | "onDraftChange"
  | "onSegmentsChange"
  | "onSendDraft"
  | "placeholder"
  | "quotedMessage"
  | "rightActions"
  | "sendLabel"
>;

const noop = () => {};

export function SmartReplySuggestionComposer({
  composerProps,
  conversationMessages,
  isSending,
  onSend,
  turn,
}: {
  composerProps: SharedComposerProps;
  conversationMessages: Message[];
  isSending: boolean;
  onSend?: (
    message: SmartReplyAssistantTurn["message"],
    payload: SmartReplySendPayload,
  ) => void | Promise<{ ok: boolean } | undefined>;
  turn: SmartReplyAssistantTurn;
}) {
  const subUser = useAuthStore((state) => state.subUser);
  const canManageKnowledgeBase = canManageAiHostingAgents(subUser);
  const composerRef = useRef<LexicalEditor | null>(null);
  const conversationMessagesRef = useRef(conversationMessages);
  conversationMessagesRef.current = conversationMessages;
  const [draftText, setDraftText] = useState(turn.suggestion?.content ?? "");
  const [preparedSegments, setPreparedSegments] = useState<ComposerSegment[] | null>(
    null,
  );
  const [isFaqDialogOpen, setIsFaqDialogOpen] = useState(false);
  const [isCheckingViolations, setIsCheckingViolations] = useState(false);
  const [violationResult, setViolationResult] =
    useState<SmartReplyViolationResult | null>(null);
  const [violationCheckedClean, setViolationCheckedClean] = useState(false);
  const suggestion = turn.suggestion;
  const suggestionRevision = useMemo(
    () =>
      [
        turn.lookupKey,
        suggestion?.recordId ?? "",
        suggestion?.content ?? "",
        suggestion?.refAttachIds?.join(",") ?? "",
      ].join(":"),
    [
      suggestion?.content,
      suggestion?.recordId,
      suggestion?.refAttachIds,
      turn.lookupKey,
    ],
  );

  useEffect(() => {
    const content = suggestion?.content ?? "";
    const source = resolveSmartReplyRecommendedAttachmentsSource({
      genAnswer: suggestion?.genAnswer,
      refAttachIds: suggestion?.refAttachIds,
    });
    let cancelled = false;

    setPreparedSegments(null);
    setDraftText(content);
    setViolationResult(null);
    setViolationCheckedClean(false);

    const prepare = async () => {
      let attachments = source.inlineAttachments;

      if (composerProps.conversationId && source.attachmentIds.length > 0) {
        try {
          const loaded = await listSmartReplyAttachments(
            composerProps.conversationId,
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

      const enriched = enrichSmartReplyRecommendedAttachmentsFromMessages(
        attachments,
        conversationMessagesRef.current,
      );
      const selectedAttachmentIds = getInitiallySelectedAttachmentIds(enriched);
      const nextSegments = buildSmartReplySendSegments({
        content,
        recommendedAttachments: enriched,
        selectedAttachmentIds,
      });

      setPreparedSegments(nextSegments);
    };

    void prepare();

    return () => {
      cancelled = true;
    };
  }, [composerProps.conversationId, suggestionRevision]);

  const canEdit = turn.isComposerEditable && preparedSegments !== null && !isSending;
  const handleCheckViolations = async () => {
    const content = draftText.trim();

    if (!composerProps.conversationId || !content || isCheckingViolations) {
      return;
    }

    setIsCheckingViolations(true);
    setViolationResult(null);
    setViolationCheckedClean(false);

    try {
      const response = await checkSmartReplyTextModeration(
        composerProps.conversationId,
        content,
      );
      const result = adaptSmartReplyViolationResult(response);
      setViolationResult(result);
      setViolationCheckedClean(!result);
    } catch {
      toast.error("操作失败，请稍后重试");
    } finally {
      setIsCheckingViolations(false);
    }
  };
  const handleDismissViolationResult = () => {
    setViolationResult(null);
    setViolationCheckedClean(false);
  };
  const handleSend = async (nextSegments: ComposerSegment[]) => {
    if (!canEdit || violationResult || !onSend) {
      if (violationResult) {
        toast.warning("请先修改违规内容");
      }
      return;
    }

    await onSend(turn.message, {
      content: draftText.trim(),
      recommendedAttachments: [],
      segments: nextSegments,
      selectedAttachmentIds: [],
    });
  };
  const rightActions = (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <Button
              aria-label="添加到FAQ"
              className="size-8 p-0 shadow-none"
              disabled={!canManageKnowledgeBase || !canEdit || !draftText.trim()}
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
                !composerProps.conversationId ||
                !draftText.trim() ||
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
  );
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

  if (!preparedSegments) {
    return (
      <div
        className="chat-composer-surface relative z-10 mx-auto mb-4 mt-3 flex min-h-[136px] w-[calc(100%-2rem)] max-w-[860px] items-center justify-center rounded-[18px] border text-[13px] text-muted-foreground"
        data-composer-mode="suggestion"
        data-testid="smart-reply-suggestion-composer"
        role="status"
      >
        <Spinner className="mr-2" size={14} variant="classic" />
        正在准备话术建议
      </div>
    );
  }

  return (
    <div data-testid="smart-reply-suggestion-composer">
      <ChatComposer
        {...composerProps}
        canSendMessage={canEdit}
        composerMode="suggestion"
        composerRef={composerRef}
        historyKey={`smart-reply:${suggestionRevision}`}
        initialSegments={preparedSegments}
        isSending={isSending}
        key={suggestionRevision}
        notice={notice}
        onDraftChange={(nextDraft) => {
          setDraftText(nextDraft);
        }}
        onSegmentsChange={noop}
        onSendDraft={handleSend}
        placeholder="编辑话术建议"
        quotedMessage={null}
        rightActions={rightActions}
        sendLabel="采纳并发送"
      />
      <SmartReplyAddToFaqDialog
        canManage={canManageKnowledgeBase}
        initialAnswer={draftText}
        initialQuestion={getSmartReplyCustomerQuestion(turn.message)}
        onOpenChange={setIsFaqDialogOpen}
        open={isFaqDialogOpen}
      />
    </div>
  );
}

function getInitiallySelectedAttachmentIds(
  attachments: SmartReplyRecommendedAttachment[],
) {
  const explicitlySelected = attachments
    .filter((attachment) => attachment.defaultSelected)
    .map((attachment) => attachment.id);

  return explicitlySelected.length > 0
    ? explicitlySelected
    : attachments.map((attachment) => attachment.id);
}
