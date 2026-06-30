import {
  type ReactElement,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AiChat02Icon,
  Attachment01Icon,
  InputCursorTextIcon,
  MoreHorizontalIcon,
  Cancel01Icon,
  RefreshIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { DotMatrixLoader } from "@/components/ui/dot-matrix-loader";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  isSmartReplyContentIncompleteSkip,
  isSmartReplyGenerationFailed,
  isSmartReplyKnowledgeMiss,
  isSmartReplyMediaContentType,
  resolveSmartReplyProcessingLabel,
  SMART_REPLY_BUSY_TIMEOUT_MS,
  SMART_REPLY_CONTENT_INCOMPLETE_SKIP_HINT,
  SMART_REPLY_MEDIA_PROCESSING_HINT_MS,
  SMART_REPLY_THINKING_LABEL,
  type SmartReplySendPayload,
} from "@/pages/chat/api/smart-reply-adapter";
import {
  adaptSmartReplyViolationResult,
  mergeSmartReplyRecommendedAttachments,
  resolveSmartReplyAttachmentCount,
  resolveSmartReplyRecommendedAttachmentsSource,
} from "@/pages/chat/api/smart-reply-adapter";
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
const SMART_REPLY_DISMISS_COLLAPSE_MS = 520;
const SMART_REPLY_DISMISS_FLIGHT_MS = 560;
const SMART_REPLY_DISMISS_FLIGHT_OVERLAP_MS = 320;
const SMART_REPLY_DISMISS_PLACEHOLDER_COLLAPSE_MS = 220;
const SMART_REPLY_DISMISS_STACK_GAP_PX = 6;

export type SmartReplySuggestion = {
  assistantName: string;
  busyRequestId?: number;
  content: string;
  failReason?: string;
  /** Java 原始 genAnswer */
  genAnswer?: string;
  generateStatus?: number | string;
  pollComplete?: boolean;
  sent?: boolean;
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
  isSending?: boolean;
  canSendMessage?: boolean;
  onEdit?: () => void;
  onFillComposer?: () => void;
  onMakeShorter?: () => void;
  onDismiss?: () => void;
  canMakeShorter?: boolean;
  onRegenerate?: () => void;
  onSend?: () => void;
  processingLabel?: string;
  refAttachIds?: string[];
  attachmentCount?: number;
  dismissTargetRef?: RefObject<HTMLElement | null>;
  collapseContainerRef?: RefObject<HTMLDivElement | null>;
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
  isSending = false,
  canSendMessage = true,
  onEdit,
  onFillComposer,
  onMakeShorter,
  onDismiss,
  canMakeShorter = true,
  onRegenerate,
  onSend,
  processingLabel,
  refAttachIds,
  attachmentCount,
  dismissTargetRef,
  collapseContainerRef,
}: SmartReplyCardProps) {
  const resolvedAttachmentCount =
    attachmentCount ?? refAttachIds?.length ?? 0;
  const cardRef = useRef<HTMLElement | null>(null);
  const dismissAnimationCleanupRef = useRef<(() => void) | null>(null);
  const [isDismissing, setIsDismissing] = useState(false);
  const [dismissPlaceholderSize, setDismissPlaceholderSize] = useState<{
    height: number;
    width: number;
  } | null>(null);
  const resolvedFailureReason = failReason?.trim();
  const shouldShowActions = isKnowledgeHit && !isThinking && !isProcessing;
  useEffect(() => {
    return () => {
      dismissAnimationCleanupRef.current?.();
      dismissAnimationCleanupRef.current = null;
    };
  }, []);

  const handleDismiss = useCallback(() => {
    if (!onDismiss || isDismissing) {
      return;
    }

    const card = cardRef.current;
    const target = dismissTargetRef?.current;

    if (!card || typeof card.animate !== "function") {
      onDismiss();
      return;
    }

    const cardRect = card.getBoundingClientRect();
    const targetRect =
      target?.getBoundingClientRect() ??
      ({
        bottom: cardRect.top + 32,
        height: 32,
        left: cardRect.left - 42,
        right: cardRect.left - 10,
        top: cardRect.top,
        width: 32,
        x: cardRect.left - 42,
        y: cardRect.top,
        toJSON: () => undefined,
      } as DOMRect);

    if (cardRect.width <= 0 || cardRect.height <= 0) {
      onDismiss();
      return;
    }

    setDismissPlaceholderSize({
      height: cardRect.height,
      width: cardRect.width,
    });
    setIsDismissing(true);
    dismissAnimationCleanupRef.current?.();
    dismissAnimationCleanupRef.current = animateSmartReplyDismiss({
      card,
      onComplete: () => {
        dismissAnimationCleanupRef.current = animateSmartReplyPlaceholderCollapse(
          collapseContainerRef?.current ?? card,
          onDismiss,
        );
      },
      sourceRect: cardRect,
      targetRect,
    });
  }, [
    dismissTargetRef,
    collapseContainerRef,
    isDismissing,
    onDismiss,
  ]);

  return (
    <TooltipProvider>
      <article
        aria-hidden={isDismissing ? "true" : undefined}
        className="w-full max-w-[640px] overflow-hidden rounded-[12px] bg-conversation-active p-[3px] text-foreground"
        data-dismissing={isDismissing ? "true" : "false"}
        data-testid="smart-reply-card"
        ref={cardRef}
        style={
          dismissPlaceholderSize
            ? {
                height: dismissPlaceholderSize.height,
                opacity: 0,
                pointerEvents: "none",
                width: dismissPlaceholderSize.width,
              }
            : undefined
        }
      >
        <header
          className="flex min-w-0 items-center gap-1 px-[6px] py-[6px]"
          data-testid="smart-reply-card-header"
        >
          <div className="flex min-w-0 flex-1 items-center gap-[3px]">
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
          {shouldShowActions ? (
            <div className="flex min-w-0 shrink-0 items-center gap-2">
              <SmartReplyActions
                canSendMessage={canSendMessage}
                canMakeShorter={canMakeShorter}
                content={content}
                isSending={isSending}
                isThinking={isThinking}
                onEdit={onEdit}
                onFillComposer={onFillComposer}
                onMakeShorter={onMakeShorter}
                onRegenerate={onRegenerate}
                onSend={onSend}
              />
            </div>
          ) : null}
          <SmartReplyIconTooltip label="收起">
            <button
              aria-label="收起"
              className="inline-flex size-6 shrink-0 items-center justify-center rounded-[6px] border border-conversation-active-foreground/25 bg-conversation-active-foreground/10 text-conversation-active-foreground outline-none transition-colors hover:bg-conversation-active-foreground/15 focus-visible:ring-2 focus-visible:ring-ring/20"
              disabled={isDismissing}
              onClick={handleDismiss}
              type="button"
            >
              <HugeiconsIcon
                aria-hidden="true"
                icon={Cancel01Icon}
                size={15}
                strokeWidth={2}
              />
            </button>
          </SmartReplyIconTooltip>
        </header>

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
          attachmentCount={resolvedAttachmentCount}
          onEdit={onEdit}
        />
      </article>
    </TooltipProvider>
  );
}

function animateSmartReplyDismiss({
  card,
  onComplete,
  sourceRect,
  targetRect,
}: {
  card: HTMLElement;
  onComplete: () => void;
  sourceRect: DOMRect;
  targetRect: DOMRect;
}): () => void {
  const { animationLayer, contentLayer, miniIconLayer, miniIconMotion } =
    createSmartReplyDismissAnimationLayer(card, sourceRect);
  const collapsedLeft = sourceRect.left;
  const collapsedTop = sourceRect.top;
  const start = {
    x: collapsedLeft + 16,
    y: collapsedTop + 16,
  };
  const end = {
    x: targetRect.left + targetRect.width / 2,
    y: targetRect.top + targetRect.height / 2,
  };
  const distanceX = end.x - start.x;
  const distanceY = end.y - start.y;
  const arch = Math.max(54, Math.min(96, Math.abs(distanceX) * 0.55));
  const control = {
    x: start.x + distanceX * 0.46,
    y: Math.min(start.y, end.y) - arch + distanceY * 0.08,
  };
  const collapseAnimation = animationLayer.animate(
    [
      {
        borderRadius: "12px",
        height: `${sourceRect.height}px`,
        opacity: 1,
        transform: "translate(0, 0)",
        width: `${sourceRect.width}px`,
      },
      {
        borderRadius: "11px",
        height: `${Math.max(48, sourceRect.height * 0.74)}px`,
        opacity: 1,
        transform: "translate(0, 0)",
        width: `${Math.max(72, sourceRect.width * 0.68)}px`,
      },
      {
        borderRadius: "9px",
        height: "48px",
        opacity: 1,
        transform: "translate(0, 0)",
        width: "72px",
      },
      {
        borderRadius: "8px",
        height: "32px",
        opacity: 1,
        transform: "translate(0, 0)",
        width: "32px",
      },
    ],
    {
      duration: SMART_REPLY_DISMISS_COLLAPSE_MS,
      easing: "cubic-bezier(0.24, 0.78, 0.2, 1)",
      fill: "forwards",
    },
  );
  const contentAnimation = contentLayer.animate(
    [
      { opacity: 1, transform: "translateY(0)" },
      { opacity: 0, transform: "translateY(-2px)" },
      { opacity: 0, transform: "translateY(-2px)" },
    ],
    {
      duration: SMART_REPLY_DISMISS_COLLAPSE_MS,
      easing: "ease-out",
      fill: "forwards",
    },
  );
  const miniIconAnimation = miniIconLayer.animate(
    [
      { opacity: 1, transform: "translate(0, 0)" },
      { opacity: 1, transform: miniIconMotion.endTransform },
    ],
    {
      duration: SMART_REPLY_DISMISS_COLLAPSE_MS,
      easing: "cubic-bezier(0.24, 0.78, 0.2, 1)",
      fill: "forwards",
    },
  );

  const flightAnimation = animationLayer.animate(buildSmartReplyDismissFlightFrames({
    control,
    end,
    origin: {
      x: collapsedLeft,
      y: collapsedTop,
    },
    start,
  }), {
    delay: SMART_REPLY_DISMISS_COLLAPSE_MS - SMART_REPLY_DISMISS_FLIGHT_OVERLAP_MS,
    duration: SMART_REPLY_DISMISS_FLIGHT_MS,
    easing: "linear",
    fill: "forwards",
  });

  let completed = false;
  let animationLayerRemoved = false;
  const animations = [
    collapseAnimation,
    contentAnimation,
    miniIconAnimation,
    flightAnimation,
  ];
  const removeAnimationLayer = () => {
    if (animationLayerRemoved) {
      return;
    }

    animationLayerRemoved = true;
    animationLayer.remove();
  };
  const clearAnimationHandlers = () => {
    flightAnimation.onfinish = null;
    flightAnimation.oncancel = null;
    collapseAnimation.onfinish = null;
    collapseAnimation.oncancel = null;
  };
  const complete = () => {
    if (completed) {
      return;
    }

    completed = true;
    removeAnimationLayer();
    onComplete();
  };

  flightAnimation.onfinish = complete;
  flightAnimation.oncancel = complete;
  collapseAnimation.onfinish = null;
  collapseAnimation.oncancel = complete;

  return () => {
    if (completed) {
      return;
    }

    completed = true;
    clearAnimationHandlers();
    for (const animation of animations) {
      animation.cancel();
    }
    removeAnimationLayer();
  };
}

function animateSmartReplyPlaceholderCollapse(
  placeholder: HTMLElement,
  onComplete: () => void,
): () => void {
  if (typeof placeholder.animate !== "function") {
    onComplete();
    return () => undefined;
  }

  const currentHeight = placeholder.getBoundingClientRect().height;
  const currentWidth = placeholder.getBoundingClientRect().width;

  if (currentHeight <= 0) {
    onComplete();
    return () => undefined;
  }

  const animation = placeholder.animate(
    [
      {
        height: `${currentHeight}px`,
        marginTop: "0px",
        opacity: 0,
      },
      {
        height: "0px",
        marginTop: `-${SMART_REPLY_DISMISS_STACK_GAP_PX}px`,
        opacity: 0,
      },
    ],
    {
      duration: SMART_REPLY_DISMISS_PLACEHOLDER_COLLAPSE_MS,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      fill: "forwards",
    },
  );

  placeholder.style.overflow = "hidden";
  placeholder.style.width = `${currentWidth}px`;

  let completed = false;
  const complete = () => {
    if (completed) {
      return;
    }

    completed = true;
    onComplete();
  };

  animation.onfinish = complete;
  animation.oncancel = complete;

  return () => {
    if (completed) {
      return;
    }

    completed = true;
    animation.onfinish = null;
    animation.oncancel = null;
    animation.cancel();
  };
}

function createSmartReplyDismissAnimationLayer(
  card: HTMLElement,
  sourceRect: DOMRect,
) {
  const animationLayer = card.cloneNode(false) as HTMLElement;
  const contentLayer = card.cloneNode(true) as HTMLElement;
  const miniIconLayer = document.createElement("div");
  const sourceIcon = card.querySelector('[aria-label="AI 智能回复"]');
  const sourceIconRect = sourceIcon?.getBoundingClientRect();
  const centeredIcon = sourceIcon?.cloneNode(true);
  const miniIconSize = sourceIconRect?.width && sourceIconRect.width > 0
    ? sourceIconRect.width
    : 18;
  const miniIconStartLeft = sourceIconRect
    ? sourceIconRect.left - sourceRect.left
    : 12;
  const miniIconStartTop = sourceIconRect ? sourceIconRect.top - sourceRect.top : 7;
  const miniIconEndLeft = 16 - miniIconSize / 2;
  const miniIconEndTop = 16 - miniIconSize / 2;
  const miniIconMotion = {
    endTransform: `translate(${miniIconEndLeft - miniIconStartLeft}px, ${miniIconEndTop - miniIconStartTop}px)`,
  };

  animationLayer.setAttribute("aria-hidden", "true");
  animationLayer.setAttribute("data-testid", "smart-reply-card-animation-layer");
  animationLayer.style.contain = "layout paint style";
  animationLayer.style.height = `${sourceRect.height}px`;
  animationLayer.style.left = `${sourceRect.left}px`;
  animationLayer.style.margin = "0";
  animationLayer.style.maxWidth = "none";
  animationLayer.style.pointerEvents = "none";
  animationLayer.style.position = "fixed";
  animationLayer.style.top = `${sourceRect.top}px`;
  animationLayer.style.transformOrigin = "0 0";
  animationLayer.style.width = `${sourceRect.width}px`;
  animationLayer.style.zIndex = "50";
  animationLayer.style.overflow = "hidden";

  contentLayer.removeAttribute("data-testid");
  contentLayer
    .querySelector('[aria-label="AI 智能回复"]')
    ?.setAttribute("visibility", "hidden");
  contentLayer
    .querySelectorAll("[data-testid]")
    .forEach((element) => element.removeAttribute("data-testid"));
  contentLayer.style.height = "100%";
  contentLayer.style.inset = "0";
  contentLayer.style.margin = "0";
  contentLayer.style.maxWidth = "none";
  contentLayer.style.pointerEvents = "none";
  contentLayer.style.position = "absolute";
  contentLayer.style.width = "100%";

  miniIconLayer.setAttribute("data-testid", "smart-reply-card-animation-mini-icon");
  miniIconLayer.style.alignItems = "center";
  miniIconLayer.style.color = "currentColor";
  miniIconLayer.style.display = "flex";
  miniIconLayer.style.justifyContent = "center";
  miniIconLayer.style.height = `${miniIconSize}px`;
  miniIconLayer.style.left = `${miniIconStartLeft}px`;
  miniIconLayer.style.opacity = "1";
  miniIconLayer.style.pointerEvents = "none";
  miniIconLayer.style.position = "absolute";
  miniIconLayer.style.top = `${miniIconStartTop}px`;
  miniIconLayer.style.width = `${miniIconSize}px`;

  if (centeredIcon instanceof Element) {
    centeredIcon.setAttribute("aria-hidden", "true");
    centeredIcon.removeAttribute("aria-label");
    miniIconLayer.appendChild(centeredIcon);
  }

  animationLayer.append(contentLayer, miniIconLayer);
  document.body.appendChild(animationLayer);

  return { animationLayer, contentLayer, miniIconLayer, miniIconMotion };
}

function buildSmartReplyDismissFlightFrames({
  control,
  end,
  origin,
  start,
}: {
  control: { x: number; y: number };
  end: { x: number; y: number };
  origin: { x: number; y: number };
  start: { x: number; y: number };
}) {
  const frames: Keyframe[] = [];

  for (let index = 0; index <= 32; index += 1) {
    const progress = index / 32;
    const easedProgress = 1 - (1 - progress) ** 2;
    const point = getQuadraticCurvePoint(start, control, end, easedProgress);
    const scale = 1 - 0.92 * easedProgress;
    const opacity =
      progress < 0.72 ? 1 : Math.max(0, 1 - (progress - 0.72) / 0.28);

    frames.push({
      offset: progress,
      opacity,
      transform: `translate(${point.x - origin.x - 16 * scale}px, ${point.y - origin.y - 16 * scale}px) scale(${scale})`,
    });
  }

  return frames;
}

function getQuadraticCurvePoint(
  start: { x: number; y: number },
  control: { x: number; y: number },
  end: { x: number; y: number },
  progress: number,
) {
  const inverseProgress = 1 - progress;

  return {
    x:
      inverseProgress * inverseProgress * start.x +
      2 * inverseProgress * progress * control.x +
      progress * progress * end.x,
    y:
      inverseProgress * inverseProgress * start.y +
      2 * inverseProgress * progress * control.y +
      progress * progress * end.y,
  };
}

type SmartReplyMessageAnchorProps = {
  canSendMessage?: boolean;
  conversationId?: string;
  dismissTargetRef?: RefObject<HTMLElement | null>;
  message: ChatMessage;
  onEdit?: (message: ChatMessage, content: string) => void;
  onFillComposer?: (message: ChatMessage, content: string) => void;
  onDismiss?: (message: ChatMessage) => void;
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
  dismissTargetRef,
  message,
  onEdit,
  onFillComposer,
  onDismiss,
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
  const [isSending, setIsSending] = useState(false);
  const isMountedRef = useRef(true);
  const collapseContainerRef = useRef<HTMLDivElement | null>(null);

  const isThinking = suggestion?.status === "thinking";
  const isProcessing = suggestion?.status === "processing";
  const isBusy = isThinking || isProcessing;
  const displayContent = suggestion?.content ?? "";
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
  const attachmentSource = useMemo(
    () =>
      resolveSmartReplyRecommendedAttachmentsSource({
        genAnswer: suggestion?.genAnswer,
        refAttachIds,
      }),
    [refAttachIdsKey, suggestion?.genAnswer],
  );
  const attachmentIds = attachmentSource.attachmentIds;
  const inlineAttachments = attachmentSource.inlineAttachments;

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isEditDialogOpen) {
      return;
    }

    if (!conversationId || attachmentIds.length === 0) {
      setRecommendedAttachments(inlineAttachments);
      setIsRecommendedAttachmentsLoading(false);
      return;
    }

    let cancelled = false;
    setIsRecommendedAttachmentsLoading(true);

    void listSmartReplyAttachments(conversationId, attachmentIds)
      .then((attachments) => {
        if (!cancelled) {
          setRecommendedAttachments(
            mergeSmartReplyRecommendedAttachments(attachments, inlineAttachments),
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRecommendedAttachments(inlineAttachments);
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
  }, [attachmentIds, conversationId, inlineAttachments, isEditDialogOpen]);

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

  const handleSendFromCard = useCallback(async () => {
    if (!onSend || isSending) {
      return;
    }

    setIsSending(true);

    try {
      await onSend(message, {
        content: displayContent.trim(),
        recommendedAttachments: [],
        selectedAttachmentIds: [],
      });
    } finally {
      if (isMountedRef.current) {
        setIsSending(false);
      }
    }
  }, [displayContent, isSending, message, onSend]);

  if (!suggestion) {
    return null;
  }

  const resolvedSuggestion = suggestion;
  const isContentIncompleteSkip =
    isSmartReplyContentIncompleteSkip(resolvedSuggestion);
  const isKnowledgeMiss = isSmartReplyKnowledgeMiss(resolvedSuggestion);
  const isGenerationFailed = isSmartReplyGenerationFailed(resolvedSuggestion);
  const isKnowledgeHit =
    !isKnowledgeMiss && !isGenerationFailed && !isContentIncompleteSkip;
  const canMakeShorter = canRequestSmartReplyMakeShorter(resolvedSuggestion);
  const attachmentCount = resolveSmartReplyAttachmentCount(resolvedSuggestion);

  if (isContentIncompleteSkip) {
    return (
      <SmartReplyContentIncompleteSkipHint
        message={message}
        onDismiss={onDismiss}
        text={SMART_REPLY_CONTENT_INCOMPLETE_SKIP_HINT}
      />
    );
  }

  return (
    <>
      <div
        className="overflow-visible"
        data-testid="smart-reply-card-collapse-container"
        ref={collapseContainerRef}
      >
        <SmartReplyCard
          attachmentCount={attachmentCount}
          refAttachIds={resolvedSuggestion.refAttachIds}
          assistantName={resolvedSuggestion.assistantName}
          canMakeShorter={canMakeShorter}
          canSendMessage={canSendMessage}
          collapseContainerRef={collapseContainerRef}
          content={displayContent}
          dismissTargetRef={dismissTargetRef}
          failReason={resolvedSuggestion.failReason}
          isGenerationFailed={isGenerationFailed}
          isKnowledgeHit={isKnowledgeHit}
          isKnowledgeMiss={isKnowledgeMiss}
          isSending={isSending}
          isThinking={isThinking}
          isProcessing={isProcessing}
          processingLabel={processingLabel}
          onDismiss={onDismiss ? () => onDismiss(message) : undefined}
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
            attachmentCount > 0
              ? openEditDialog
              : onSend
                ? handleSendFromCard
                : undefined
          }
        />
      </div>
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

function SmartReplyContentIncompleteSkipHint({
  message,
  onDismiss,
  text,
}: {
  message: ChatMessage;
  onDismiss?: (message: ChatMessage) => void;
  text: string;
}) {
  return (
    <div className="flex max-w-[640px] items-center gap-2 text-[13px] leading-5 text-muted-foreground">
      <span>{text}</span>
      {onDismiss ? (
        <button
          aria-label="收起"
          className="inline-flex size-5 shrink-0 items-center justify-center rounded-[5px] text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/20"
          onClick={() => onDismiss(message)}
          title="收起"
          type="button"
        >
          <HugeiconsIcon
            aria-hidden="true"
            icon={Cancel01Icon}
            size={14}
            strokeWidth={2}
          />
        </button>
      ) : null}
    </div>
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

export function SmartReplyInlineProcessingHint({
  animated = true,
  label,
  onDismiss,
  onRegenerate,
}: {
  animated?: boolean;
  label: string;
  onDismiss?: () => void;
  onRegenerate?: () => void;
}) {
  return (
    <div
      className="flex shrink-0 items-center gap-1.5 text-muted-foreground"
      data-testid="smart-reply-inline-processing"
      role="status"
    >
      <p className="text-[13px] leading-5">
        {animated ? (
          <ShinyText duration={1.15} shimmerWidth={44}>
            {label}
          </ShinyText>
        ) : (
          label
        )}
      </p>
      {onRegenerate ? (
        <button
          aria-label="重新生成"
          className="inline-flex size-5 shrink-0 items-center justify-center rounded-[5px] text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/20"
          onClick={onRegenerate}
          title="重新生成"
          type="button"
        >
          <HugeiconsIcon
            aria-hidden="true"
            icon={RefreshIcon}
            size={14}
            strokeWidth={2}
          />
        </button>
      ) : null}
      {onDismiss ? (
        <button
          aria-label="收起"
          className="inline-flex size-5 shrink-0 items-center justify-center rounded-[5px] text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/20"
          onClick={onDismiss}
          title="收起"
          type="button"
        >
          <HugeiconsIcon
            aria-hidden="true"
            icon={Cancel01Icon}
            size={14}
            strokeWidth={2}
          />
        </button>
      ) : null}
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
  onEdit,
  onRetry,
  processingLabel,
  attachmentCount = 0,
}: {
  content: string;
  failReason?: string;
  isGenerationFailed: boolean;
  isKnowledgeHit: boolean;
  isKnowledgeMiss: boolean;
  isProcessing: boolean;
  isThinking: boolean;
  onEdit?: () => void;
  onRetry?: () => void;
  processingLabel?: string;
  attachmentCount?: number;
}) {
  return (
    <div
      className="rounded-[10px] bg-background py-[10px]"
      data-testid="smart-reply-card-body"
    >
      {isThinking || isProcessing || !isKnowledgeHit ? (
        <div className="px-[13px]">
          <SmartReplyReadonlyContent
            failReason={failReason}
            isGenerationFailed={isGenerationFailed}
            isKnowledgeMiss={isKnowledgeMiss}
            isProcessing={isProcessing}
            isThinking={isThinking}
            onRetry={onRetry}
            processingLabel={processingLabel}
          />
        </div>
      ) : (
        <>
          <ScrollArea
            className="w-full [--scrollbar-size:4px] [--scrollbar-track-padding:0px]"
            type="hover"
            viewportProps={{
              className: "max-h-[120px] !h-auto",
            }}
          >
            <p className="whitespace-pre-wrap px-[13px] text-[13px] leading-[22px] text-foreground">
              {content}
            </p>
          </ScrollArea>
          <SmartReplyReferences
            attachmentCount={attachmentCount}
            onEdit={onEdit}
          />
        </>
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
        <div className="flex items-center gap-1 text-muted-foreground">
          <span aria-hidden="true" className="inline-flex">
            <DotMatrixLoader
              ariaLabel="智能回复处理中"
              dotSize={2}
              size={14}
              speed={1.2}
            />
          </span>
          <p className="text-[13px]" role="status">
            <ShinyText duration={1.15} shimmerWidth={44}>
              {processingLabel ??
                (isThinking ? SMART_REPLY_THINKING_LABEL : "正在处理消息...")}
            </ShinyText>
          </p>
        </div>
      ) : null}
      {isKnowledgeMiss ? (
        <div className="flex items-center">
          <p className="text-[13px] text-muted-foreground">
            🤔未命中知识集，暂无推荐话术
          </p>
          {onRetry ? (
            <button
              className="ml-[10px] text-[13px] text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/20"
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
          <p className="text-[13px] text-muted-foreground">
            {failReason ? `生成失败：${failReason}` : "生成失败"}
          </p>
          {onRetry ? (
            <button
              className="ml-[10px] text-[13px] text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/20"
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
  attachmentCount,
  onEdit,
}: {
  attachmentCount: number;
  onEdit?: () => void;
}) {
  if (attachmentCount <= 0) {
    return null;
  }

  return (
    <div className="mt-[8px] flex min-w-0 cursor-pointer items-center px-[13px]">
      <div
        aria-label={`推荐附件 ${attachmentCount} 个`}
        className="inline-flex items-center gap-1 text-[12px] leading-4 text-muted-foreground"
        onClick={onEdit}
      >
        <HugeiconsIcon
          aria-hidden
          icon={Attachment01Icon}
          size={14}
          strokeWidth={1.8}
        />
        <span>{attachmentCount}</span>
      </div>
    </div>
  );
}

function SmartReplyActions({
  canSendMessage = true,
  canMakeShorter = true,
  content,
  isSending = false,
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
  isSending?: boolean;
  isThinking: boolean;
  onEdit?: () => void;
  onFillComposer?: () => void;
  onMakeShorter?: () => void;
  onRegenerate?: () => void;
  onSend?: () => void;
}) {
  const isActionDisabled =
    isSending || !canSendMessage || isThinking || !content.trim();

  return (
    <div className="flex shrink-0 items-center gap-1">
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
          aria-label={isSending ? "正在发送" : undefined}
          aria-busy={isSending ? "true" : undefined}
          className="h-6 rounded-none border-l border-conversation-active-foreground/20 px-2 text-[12px] leading-4 text-conversation-active-foreground hover:bg-conversation-active-foreground/15 hover:text-conversation-active-foreground"
          disabled={isActionDisabled}
          onClick={onSend}
          type="button"
          variant="ghost"
        >
          {isSending ? (
            <Spinner variant="classic" size={12} className="text-current" />
          ) : null}
          {isSending ? null : "发送"}
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
