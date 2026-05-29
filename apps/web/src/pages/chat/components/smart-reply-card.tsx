import { type ReactElement, useCallback, useEffect, useState } from "react";
import {
  AiChat02Icon,
  InputCursorTextIcon,
  Loading03Icon,
  MoreHorizontalIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ShinyText } from "@/components/ui/shiny-text";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ChatMessage } from "@/pages/chat/chat-types";
import {
  getSmartReplyCustomerQuestion,
  canRequestSmartReplyMakeShorter,
  isSmartReplyGenerationFailed,
  isSmartReplyKnowledgeMiss,
  isSmartReplyMediaContentType,
  isSmartReplySent,
  resolveSmartReplyProcessingLabel,
  SMART_REPLY_BUSY_TIMEOUT_MS,
  SMART_REPLY_MEDIA_PROCESSING_HINT_MS,
  type SmartReplySendPayload,
} from "@/pages/chat/api/smart-reply-adapter";
import { adaptSmartReplyViolationResult } from "@/pages/chat/api/smart-reply-adapter";
import {
  checkSmartReplyTextModeration,
  getSmartReplyKnowledgeConfig,
  listSmartReplyAttachments,
} from "@/pages/chat/api/workbench-gateway";
import {
  SmartReplyEditDialog,
  type SmartReplyRecommendedAttachment,
} from "@/pages/chat/components/smart-reply-edit-dialog";

const SMART_REPLY_TRIGGER_ICON =
  "https://b1.dtminds.com/fe-utility-tools/scrm-mobile/assets/customer/容器@2x (1).png!tiny.webp";
const SMART_REPLY_COLLAPSE_IMAGE =
  "data:image/svg+xml,%3Csvg width='14' height='14' viewBox='0 0 14 14' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M3.5 5.25L7 8.75L10.5 5.25' stroke='white' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E";

export type SmartReplySuggestion = {
  assistantName: string;
  busyRequestId?: number;
  content: string;
  failReason?: string;
  generateStatus?: number | string;
  pollComplete?: boolean;
  status?: "thinking" | "processing" | "ready";
  refAttachIds?: string[];
  recordId?: string;
};

export type SmartReplyCardProps = {
  assistantName: string;
  content: string;
  failReason?: string;
  isThinking?: boolean;
  isProcessing?: boolean;
  isGenerationFailed?: boolean;
  isKnowledgeHit?: boolean;
  isKnowledgeMiss?: boolean;
  isSent?: boolean;
  canSendMessage?: boolean;
  onEdit?: () => void;
  onFillComposer?: () => void;
  onMakeShorter?: () => void;
  canMakeShorter?: boolean;
  onRegenerate?: () => void;
  onSend?: () => void;
  processingLabel?: string;
  refAttachIds?: string[];
};

export function SmartReplyCard({
  assistantName,
  content,
  failReason,
  isThinking = false,
  isProcessing = false,
  isGenerationFailed = false,
  isKnowledgeHit = true,
  isKnowledgeMiss = false,
  isSent = false,
  canSendMessage = true,
  onEdit,
  onFillComposer,
  onMakeShorter,
  canMakeShorter = true,
  onRegenerate,
  onSend,
  processingLabel,
  refAttachIds,
}: SmartReplyCardProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const resolvedFailureReason = failReason?.trim();
  const shouldShowActions = isKnowledgeHit && !isThinking && !isProcessing;

  return (
    <TooltipProvider>
      <article
        className="w-full max-w-[640px] overflow-hidden rounded-[12px] bg-conversation-active p-[3px] text-smart-reply-card-foreground"
        data-collapsed={isCollapsed ? "true" : "false"}
        data-testid="smart-reply-card"
      >
        <header
          className="flex min-w-0 items-center gap-2 px-[12px] py-[7px]"
          data-testid="smart-reply-card-header"
        >
          <div className="flex min-w-0 flex-1 items-center gap-[6px]">
            <HugeiconsIcon
              aria-label="AI 智能回复"
              className="shrink-0 text-conversation-active-foreground"
              icon={AiChat02Icon}
              size={18}
            />
            <p className="min-w-0 truncate text-[13px] font-medium leading-5 text-conversation-active-foreground">
              {assistantName}
            </p>
          </div>
          {!isCollapsed && shouldShowActions ? (
            <div className="flex min-w-0 shrink-0 items-center gap-2">
              <SmartReplyReferences refAttachIds={refAttachIds} onEdit={onEdit} />
              <SmartReplyActions
                canSendMessage={canSendMessage}
                canMakeShorter={canMakeShorter}
                content={content}
                isThinking={isThinking}
                onEdit={onEdit}
                onFillComposer={onFillComposer}
                onMakeShorter={onMakeShorter}
                onRegenerate={onRegenerate}
                onSend={onSend}
              />
            </div>
          ) : null}
          <SmartReplyIconTooltip label={isCollapsed ? "展开" : "收起"}>
            <button
              aria-expanded={!isCollapsed}
              aria-label={isCollapsed ? "展开" : "收起"}
              className="inline-flex size-6 shrink-0 items-center justify-center rounded-[6px] border border-conversation-active-foreground/25 bg-conversation-active-foreground/10 outline-none transition-colors hover:bg-conversation-active-foreground/15 focus-visible:ring-2 focus-visible:ring-ring/20"
              onClick={() => setIsCollapsed((current) => !current)}
              type="button"
            >
              <img
                alt=""
                aria-hidden
                className={isCollapsed ? "size-3.5 -rotate-90" : "size-3.5"}
                src={SMART_REPLY_COLLAPSE_IMAGE}
              />
            </button>
          </SmartReplyIconTooltip>
        </header>

        {isCollapsed ? null : (
          <SmartReplyContentBody
            content={content}
            failReason={resolvedFailureReason}
            isGenerationFailed={isGenerationFailed}
            isKnowledgeHit={isKnowledgeHit}
            isKnowledgeMiss={isKnowledgeMiss}
            isProcessing={isProcessing}
            isThinking={isThinking}
            onRetry={onRegenerate}
            processingLabel={processingLabel}
          />
        )}
      </article>
    </TooltipProvider>
  );
}

type SmartReplyMessageAnchorProps = {
  canSendMessage?: boolean;
  conversationId?: string;
  message: ChatMessage;
  onEdit?: (message: ChatMessage, content: string) => void;
  onFillComposer?: (message: ChatMessage, content: string) => void;
  onMakeShorter?: (message: ChatMessage) => void;
  onRegenerate?: (message: ChatMessage) => void;
  onSend?: (
    message: ChatMessage,
    payload: SmartReplySendPayload,
  ) => void | Promise<{ ok: boolean }>;
  onBusyTimeout?: () => void;
  suggestion?: SmartReplySuggestion | null;
};

export function SmartReplyMessageAnchor({
  canSendMessage = true,
  conversationId,
  message,
  onEdit,
  onFillComposer,
  onMakeShorter,
  onRegenerate,
  onSend,
  onBusyTimeout,
  suggestion,
}: SmartReplyMessageAnchorProps) {
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [automaticCheckIllegalWords, setAutomaticCheckIllegalWords] = useState<
    number | null
  >(null);
  const [recommendedAttachments, setRecommendedAttachments] = useState<
    SmartReplyRecommendedAttachment[]
  >([]);
  const [isRecommendedAttachmentsLoading, setIsRecommendedAttachmentsLoading] =
    useState(false);

  const isThinking = suggestion?.status === "thinking";
  const isProcessing = suggestion?.status === "processing";
  const isBusy = isThinking || isProcessing;
  const processingLabel = useSmartReplyProcessingLabel(
    message.content.type,
    suggestion?.status,
  );

  useSmartReplyBusyTimeout(
    Boolean(suggestion) && isBusy,
    onBusyTimeout,
    suggestion?.busyRequestId,
  );

  const refAttachIds = suggestion?.refAttachIds;
  const refAttachIdsKey = refAttachIds?.join(",") ?? "";

  useEffect(() => {
    if (!isEditDialogOpen) {
      return;
    }

    if (!conversationId || !refAttachIdsKey) {
      setRecommendedAttachments([]);
      setIsRecommendedAttachmentsLoading(false);
      return;
    }

    const ids = refAttachIdsKey.split(",");

    let cancelled = false;
    setIsRecommendedAttachmentsLoading(true);

    void listSmartReplyAttachments(conversationId, ids)
      .then((attachments) => {
        if (!cancelled) {
          setRecommendedAttachments(attachments);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRecommendedAttachments([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsRecommendedAttachmentsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [conversationId, isEditDialogOpen, refAttachIdsKey]);

  useEffect(() => {
    if (!isEditDialogOpen) {
      setAutomaticCheckIllegalWords(null);
      return;
    }

    if (!conversationId) {
      setAutomaticCheckIllegalWords(0);
      return;
    }

    let cancelled = false;

    void getSmartReplyKnowledgeConfig(conversationId)
      .then((response) => {
        if (!cancelled) {
          setAutomaticCheckIllegalWords(response.config.automaticCheckIllegalWords);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAutomaticCheckIllegalWords(0);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [conversationId, isEditDialogOpen]);

  const handleEditDialogOpenChange = useCallback((open: boolean) => {
    setIsEditDialogOpen(open);

    if (!open) {
      setRecommendedAttachments([]);
      setIsRecommendedAttachmentsLoading(false);
      setAutomaticCheckIllegalWords(null);
    }
  }, []);

  const openEditDialog = useCallback(() => {
    handleEditDialogOpenChange(true);
  }, [handleEditDialogOpenChange]);

  if (!suggestion) {
    return null;
  }

  const resolvedSuggestion = suggestion;
  const displayContent = resolvedSuggestion.content;
  const isKnowledgeMiss = isSmartReplyKnowledgeMiss(resolvedSuggestion);
  const isGenerationFailed = isSmartReplyGenerationFailed(resolvedSuggestion);
  const isKnowledgeHit = !isKnowledgeMiss && !isGenerationFailed;
  const isSent = isSmartReplySent(resolvedSuggestion);
  const canMakeShorter = canRequestSmartReplyMakeShorter(resolvedSuggestion);

  return (
    <>
      <SmartReplyCard
        refAttachIds={resolvedSuggestion.refAttachIds}
        assistantName={resolvedSuggestion.assistantName}
        canMakeShorter={canMakeShorter}
        canSendMessage={canSendMessage}
        content={displayContent}
        failReason={resolvedSuggestion.failReason}
        isGenerationFailed={isGenerationFailed}
        isKnowledgeHit={isKnowledgeHit}
        isKnowledgeMiss={isKnowledgeMiss}
        isSent={isSent}
        isThinking={isThinking}
        isProcessing={isProcessing}
        processingLabel={processingLabel}
        onEdit={openEditDialog}
        onFillComposer={
          onFillComposer
            ? () => {
                onFillComposer(message, displayContent.trim());
              }
            : undefined
        }
        onMakeShorter={
          onMakeShorter
            ? () => {
                onMakeShorter(message);
              }
            : undefined
        }
        onRegenerate={
          onRegenerate
            ? () => {
                onRegenerate(message);
              }
            : undefined
        }
        onSend={
          resolvedSuggestion.refAttachIds?.length &&
          resolvedSuggestion.refAttachIds.length > 0
            ? openEditDialog
            : onSend
              ? () => {
                  onSend(message, {
                    content: displayContent.trim(),
                    recommendedAttachments: [],
                    selectedAttachmentIds: [],
                  });
                }
              : undefined
        }
      />
      <SmartReplyEditDialog
        automaticCheckIllegalWords={automaticCheckIllegalWords}
        canSendMessage={canSendMessage}
        conversationId={conversationId}
        faqInitialQuestion={getSmartReplyCustomerQuestion(message)}
        initialContent={displayContent}
        isRecommendedAttachmentsLoading={isRecommendedAttachmentsLoading}
        onCheckViolations={
          conversationId
            ? async (content) => {
                const response = await checkSmartReplyTextModeration(
                  conversationId,
                  content,
                );

                return adaptSmartReplyViolationResult(response);
              }
            : undefined
        }
        onOpenChange={handleEditDialogOpenChange}
        recommendedAttachments={recommendedAttachments}
        onSend={
          onSend
            ? async ({ content, selectedAttachmentIds }) => {
                const result = await onSend(message, {
                  content,
                  recommendedAttachments,
                  selectedAttachmentIds,
                });

                if (result?.ok === true) {
                  setIsEditDialogOpen(false);
                }

                return result?.ok === true;
              }
            : undefined
        }
        open={isEditDialogOpen}
      />
    </>
  );
}

function useSmartReplyProcessingLabel(
  contentType: ChatMessage["content"]["type"],
  status: SmartReplySuggestion["status"] | undefined,
) {
  const isThinking = status === "thinking";
  const isProcessing = status === "processing";
  const isMediaMessage = isSmartReplyMediaContentType(contentType);
  const [mediaHintExpired, setMediaHintExpired] = useState(false);

  useEffect(() => {
    if (isThinking) {
      setMediaHintExpired(true);
      return;
    }

    if (!isProcessing || !isMediaMessage) {
      setMediaHintExpired(false);
      return;
    }

    setMediaHintExpired(false);
    const timer = window.setTimeout(() => {
      setMediaHintExpired(true);
    }, SMART_REPLY_MEDIA_PROCESSING_HINT_MS);

    return () => window.clearTimeout(timer);
  }, [contentType, isMediaMessage, isProcessing, isThinking]);

  return resolveSmartReplyProcessingLabel(contentType, status, mediaHintExpired);
}

function useSmartReplyBusyTimeout(
  isBusy: boolean,
  onTimeout?: () => void,
  busyRequestId?: number,
) {
  useEffect(() => {
    if (!isBusy || !onTimeout) {
      return;
    }

    const timer = window.setTimeout(() => {
      onTimeout();
    }, SMART_REPLY_BUSY_TIMEOUT_MS);

    return () => window.clearTimeout(timer);
  }, [busyRequestId, isBusy, onTimeout]);
}

export function isSmartReplyBusy(
  suggestion?: SmartReplySuggestion | null,
): boolean {
  return (
    suggestion?.status === "thinking" || suggestion?.status === "processing"
  );
}

export function SmartReplyTriggerIcon({
  isProcessing = false,
  isThinking = false,
  onClick,
}: {
  isProcessing?: boolean;
  isThinking?: boolean;
  onClick?: () => void;
}) {
  if (isProcessing || isThinking) {
    return null;
  }

  return (
    <button
      aria-label="生成智能回复"
      className="inline-flex size-[14px] shrink-0 items-center justify-center border-0 bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-ring/20"
      data-testid="smart-reply-trigger-icon"
      onClick={onClick}
      type="button"
    >
      <img
        alt=""
        aria-hidden
        className="size-[14px] object-contain"
        src={SMART_REPLY_TRIGGER_ICON}
      />
    </button>
  );
}

export function SmartReplyInlineProcessingHint({ label }: { label: string }) {
  return (
    <div
      className="ml-[16px] flex shrink-0 items-center gap-1 text-smart-reply-muted-foreground"
      data-testid="smart-reply-inline-processing"
      role="status"
    >
      <HugeiconsIcon
        color="currentColor"
        icon={Loading03Icon}
        size={14}
        strokeWidth={2}
      />
      <p className="text-[12px] leading-4">{label}</p>
    </div>
  );
}

function SmartReplyIconTooltip({
  children,
  disabled,
  label,
  triggerTestId,
}: {
  children: ReactElement;
  disabled?: boolean;
  label: string;
  triggerTestId?: string;
}) {
  const trigger = disabled ? (
    <span className="inline-flex" data-testid={triggerTestId}>
      {children}
    </span>
  ) : (
    children
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{trigger}</TooltipTrigger>
      <TooltipContent side="top" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function SmartReplyContentBody({
  content,
  failReason,
  isGenerationFailed,
  isKnowledgeHit,
  isKnowledgeMiss,
  isProcessing,
  isThinking,
  onRetry,
  processingLabel,
}: {
  content: string;
  failReason?: string;
  isGenerationFailed: boolean;
  isKnowledgeHit: boolean;
  isKnowledgeMiss: boolean;
  isProcessing: boolean;
  isThinking: boolean;
  onRetry?: () => void;
  processingLabel?: string;
}) {
  return (
    <div
      className="rounded-[10px] bg-background px-[13px] py-[10px]"
      data-testid="smart-reply-card-body"
    >
      {isThinking || isProcessing || !isKnowledgeHit ? (
        <SmartReplyReadonlyContent
          failReason={failReason}
          isGenerationFailed={isGenerationFailed}
          isKnowledgeMiss={isKnowledgeMiss}
          isProcessing={isProcessing}
          isThinking={isThinking}
          onRetry={onRetry}
          processingLabel={processingLabel}
        />
      ) : (
        <p className="max-h-[120px] overflow-y-auto whitespace-pre-wrap text-[13px] leading-[22px] text-smart-reply-card-foreground">
          {content}
        </p>
      )}
    </div>
  );
}

function SmartReplyReadonlyContent({
  failReason,
  isGenerationFailed,
  isKnowledgeMiss,
  isProcessing,
  isThinking,
  onRetry,
  processingLabel,
}: {
  failReason?: string;
  isGenerationFailed: boolean;
  isKnowledgeMiss: boolean;
  isProcessing: boolean;
  isThinking: boolean;
  onRetry?: () => void;
  processingLabel?: string;
}) {
  return (
    <div className="rounded-[10px]">
      {isThinking || isProcessing ? (
        <div className="flex items-center gap-1 text-smart-reply-muted-foreground">
          <HugeiconsIcon
            color="currentColor"
            icon={Loading03Icon}
            size={14}
            strokeWidth={2}
          />
          <p className="text-[13px]" role="status">
            <ShinyText>
              {processingLabel ??
                (isThinking ? "AI正在生成话术..." : "正在处理消息...")}
            </ShinyText>
          </p>
        </div>
      ) : null}
      {isKnowledgeMiss ? (
        <div className="flex items-center">
          <p className="text-[13px] text-smart-reply-muted-foreground">
            🤔未命中知识集，暂无推荐话术
          </p>
          {onRetry ? (
            <button
              className="ml-[10px] text-[13px] text-smart-reply-action outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/20"
              onClick={onRetry}
              type="button"
            >
              重试
            </button>
          ) : null}
        </div>
      ) : null}
      {isGenerationFailed ? (
        <div className="flex items-center">
          <p className="text-[13px] text-smart-reply-muted-foreground">
            {failReason ? `生成失败：${failReason}` : "生成失败"}
          </p>
          {onRetry ? (
            <button
              className="ml-[10px] text-[13px] text-smart-reply-action outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/20"
              onClick={onRetry}
              type="button"
            >
              重试
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SmartReplyReferences({
  refAttachIds,
  onEdit,
}: {
  refAttachIds?: string[];
  onEdit?: () => void;
}) {
  const refAttachCount = refAttachIds?.length ?? 0;

  return (
    <div className="flex min-w-0 cursor-pointer items-center gap-[10px]">
      {refAttachCount > 0 ? (
        <div
          aria-label={`推荐附件 ${refAttachCount} 个`}
          className="inline-flex items-center gap-1 text-[12px] leading-4 text-smart-reply-muted-foreground"
          onClick={onEdit}
        >
          <img
            alt=""
            aria-hidden
            className="size-[14px] object-contain"
            src="https://b1.dtminds.com/fe-utility-tools/scrm-mobile/assets/third/容器@2x (3).png!tiny.webp"
          />
          <span>{refAttachCount}</span>
        </div>
      ) : null}
    </div>
  );
}

function SmartReplyActions({
  canSendMessage = true,
  canMakeShorter = true,
  content,
  isThinking,
  onEdit,
  onFillComposer,
  onMakeShorter,
  onRegenerate,
  onSend,
}: {
  canSendMessage?: boolean;
  canMakeShorter?: boolean;
  content: string;
  isThinking: boolean;
  onEdit?: () => void;
  onFillComposer?: () => void;
  onMakeShorter?: () => void;
  onRegenerate?: () => void;
  onSend?: () => void;
}) {
  const isActionDisabled = !canSendMessage || isThinking || !content.trim();

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <SmartReplyIconTooltip
        disabled={isActionDisabled}
        label="填入输入框"
        triggerTestId="smart-reply-fill-composer-tooltip-trigger"
      >
        <Button
          aria-label="填入输入框"
          className="size-6 rounded-[6px] border border-conversation-active-foreground/25 bg-conversation-active-foreground/10 p-0 text-conversation-active-foreground hover:bg-conversation-active-foreground/15 hover:text-conversation-active-foreground"
          disabled={isActionDisabled}
          onClick={onFillComposer}
          size="icon"
          type="button"
          variant="ghost"
        >
          <HugeiconsIcon
            aria-hidden="true"
            icon={InputCursorTextIcon}
            size={14}
            strokeWidth={2}
          />
        </Button>
      </SmartReplyIconTooltip>
      <div className="inline-flex shrink-0 items-center overflow-hidden rounded-[6px] border border-conversation-active-foreground/25 bg-conversation-active-foreground/10">
        <Button
          className="h-6 rounded-none px-2 text-[12px] leading-4 text-conversation-active-foreground hover:bg-conversation-active-foreground/15 hover:text-conversation-active-foreground"
          disabled={isActionDisabled}
          onClick={onEdit}
          type="button"
          variant="ghost"
        >
          编辑
        </Button>
        <Button
          className="h-6 rounded-none border-l border-conversation-active-foreground/20 px-2 text-[12px] leading-4 text-conversation-active-foreground hover:bg-conversation-active-foreground/15 hover:text-conversation-active-foreground"
          disabled={isActionDisabled}
          onClick={onSend}
          type="button"
          variant="ghost"
        >
          发送
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label="更多智能回复操作"
              className="size-6 rounded-none border-l border-conversation-active-foreground/20 p-0 text-conversation-active-foreground hover:bg-conversation-active-foreground/15 hover:text-conversation-active-foreground"
              size="icon"
              type="button"
              variant="ghost"
            >
              <HugeiconsIcon
                aria-hidden="true"
                icon={MoreHorizontalIcon}
                size={14}
                strokeWidth={2}
              />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[128px]" side="top">
            <DropdownMenuItem
              disabled={isActionDisabled || !canMakeShorter || !onMakeShorter}
              onSelect={() => {
                onMakeShorter?.();
              }}
            >
              变短一点
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={isActionDisabled}
              onSelect={() => {
                onRegenerate?.();
              }}
            >
              重新生成
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
