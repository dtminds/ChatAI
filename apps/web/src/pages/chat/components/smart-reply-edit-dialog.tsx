import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type UIEvent,
} from "react";
import {
  Cancel01Icon,
  BookOpen01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  SmartReplyAddToFaqDialog,
} from "@/pages/chat/components/smart-reply-add-to-faq-dialog";
import {
  SmartReplyRecommendedAttachmentsSection,
  type SmartReplyRecommendedAttachment,
} from "@/pages/chat/components/smart-reply-recommended-attachments";

export type { SmartReplyRecommendedAttachment };

export type SmartReplyViolationResult = {
  categoryLabel: string;
  words: string[];
};

export type SmartReplyEditDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialContent: string;
  canSendMessage?: boolean;
  automaticCheckIllegalWords?: number | null;
  conversationId?: string;
  faqInitialQuestion?: string;
  recommendedAttachments?: SmartReplyRecommendedAttachment[];
  isRecommendedAttachmentsLoading?: boolean;
  onSend?: (payload: {
    content: string;
    selectedAttachmentIds: string[];
  }) => void | Promise<boolean>;
  onCheckViolations?: (content: string) => Promise<SmartReplyViolationResult | null>;
};

const EMPTY_RECOMMENDED_ATTACHMENTS: SmartReplyRecommendedAttachment[] = [];

export function SmartReplyEditDialog({
  open,
  onOpenChange,
  initialContent,
  canSendMessage = true,
  automaticCheckIllegalWords = null,
  conversationId,
  faqInitialQuestion: faqInitialQuestionProp,
  recommendedAttachments: recommendedAttachmentsProp,
  isRecommendedAttachmentsLoading = false,
  onSend,
  onCheckViolations,
}: SmartReplyEditDialogProps) {
  const isMountedRef = useRef(false);
  const recommendedAttachments = recommendedAttachmentsProp ?? EMPTY_RECOMMENDED_ATTACHMENTS;
  const [draftContent, setDraftContent] = useState(initialContent);
  const [violationResult, setViolationResult] =
    useState<SmartReplyViolationResult | null>(null);
  const [isCheckingViolations, setIsCheckingViolations] = useState(false);
  const [violationCheckPhase, setViolationCheckPhase] = useState<
    "none" | "loading" | "clean" | "found"
  >("none");
  const [selectedAttachmentIds, setSelectedAttachmentIds] = useState<string[]>(
    () =>
      recommendedAttachments
        .filter((item) => item.defaultSelected)
        .map((item) => item.id),
  );
  const [isFaqDialogOpen, setIsFaqDialogOpen] = useState(false);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    setDraftContent(initialContent);
    setViolationResult(null);
    setViolationCheckPhase("none");
    setIsFaqDialogOpen(false);
    setSelectedAttachmentIds(
      recommendedAttachments
        .filter((item) => item.defaultSelected)
        .map((item) => item.id),
    );
  }, [initialContent, open, recommendedAttachments]);

  const faqInitialQuestion = useMemo(() => {
    const customerQuestion = faqInitialQuestionProp?.trim();

    if (customerQuestion) {
      return customerQuestion;
    }

    return draftContent.split("\n").find((line) => line.trim())?.trim() ?? draftContent.trim();
  }, [draftContent, faqInitialQuestionProp]);

  const highlightedWords = useMemo(
    () => violationResult?.words ?? [],
    [violationResult],
  );

  const trimmedDraftContent = draftContent.trim();
  const trimmedInitialContent = initialContent.trim();
  const isContentChanged = trimmedDraftContent !== trimmedInitialContent;
  const shouldAutoCheckIllegalWords = automaticCheckIllegalWords === 1;
  const isSendBlockedByViolations = violationCheckPhase === "found";
  const canCheckViolations = Boolean(onCheckViolations);

  const runViolationCheck = useCallback(async () => {
    if (!onCheckViolations) {
      return null;
    }

    return onCheckViolations(draftContent);
  }, [draftContent, onCheckViolations]);

  const handleDraftContentChange = useCallback((value: string) => {
    setDraftContent(value);
    setViolationResult(null);
    setViolationCheckPhase("none");
  }, []);

  const handleCheckViolations = useCallback(async () => {
    setIsCheckingViolations(true);
    setViolationCheckPhase("loading");
    setViolationResult(null);
    try {
      const result = await runViolationCheck();
      if (!isMountedRef.current) {
        return;
      }
      setViolationResult(result);
      setViolationCheckPhase(result ? "found" : "clean");
    } catch {
      if (isMountedRef.current) {
        setViolationCheckPhase("none");
      }
    } finally {
      if (isMountedRef.current) {
        setIsCheckingViolations(false);
      }
    }
  }, [runViolationCheck]);

  const handleDismissViolationStatus = useCallback(() => {
    setViolationResult(null);
    setViolationCheckPhase("none");
  }, []);

  const handleToggleAttachment = (attachmentId: string, checked: boolean) => {
    setSelectedAttachmentIds((current) => {
      if (checked) {
        return current.includes(attachmentId)
          ? current
          : [...current, attachmentId];
      }
      return current.filter((id) => id !== attachmentId);
    });
  };

  const handleSend = async () => {
    const trimmed = trimmedDraftContent;
    if (!trimmed) {
      return;
    }

    if (shouldAutoCheckIllegalWords && isContentChanged) {
      setIsCheckingViolations(true);
      setViolationCheckPhase("loading");
      setViolationResult(null);
      try {
        const result = await runViolationCheck();
        if (!isMountedRef.current) {
          return;
        }
        setViolationResult(result);
        setViolationCheckPhase(result ? "found" : "clean");
        if (result) {
          return;
        }
      } finally {
        if (isMountedRef.current) {
          setIsCheckingViolations(false);
        }
      }
    } else if (
      !shouldAutoCheckIllegalWords &&
      isContentChanged &&
      violationCheckPhase === "found"
    ) {
      return;
    }

    const shouldClose = await onSend?.({
      content: trimmed,
      selectedAttachmentIds,
    });

    if (isMountedRef.current && shouldClose !== false) {
      onOpenChange(false);
    }
  };

  const isSendDisabled =
    !canSendMessage ||
    !trimmedDraftContent ||
    isCheckingViolations ||
    isSendBlockedByViolations;

  return (
    <>
      <Dialog onOpenChange={onOpenChange} open={open}>
        <DialogContent
          aria-describedby={undefined}
          className="flex max-h-[min(90vh,720px)] w-[640px] max-w-none flex-col gap-0 overflow-hidden px-[24px] py-0 text-foreground sm:rounded-[10px]"
          data-testid="smart-reply-edit-dialog"
        >
          <DialogHeader className="space-y-0 py-[16px] text-left">
            <DialogTitle className="text-[14px] font-medium leading-6 text-foreground">
              编辑
            </DialogTitle>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <ViolationHighlightEditor
              highlightedWords={highlightedWords}
              onChange={handleDraftContentChange}
              value={draftContent}
            />

            <div className="mt-[20px] flex justify-end gap-2">
              <Button
                className="h-8 gap-1.5 rounded-[8px] px-3 text-[13px]"
                disabled={
                  isCheckingViolations || !draftContent.trim() || !canCheckViolations
                }
                onClick={() => void handleCheckViolations()}
                type="button"
                variant="outline"
              >
                {isCheckingViolations ? (
                  <Spinner variant="classic" size={14} className="text-current" />
                ) : (
                  <HugeiconsIcon icon={Search01Icon} size={14} strokeWidth={2} />
                )}
                {isCheckingViolations ? "检测中" : "违规词检测"}
              </Button>
              <Button
                className="h-8 gap-1.5 rounded-[8px] px-3 text-[13px]"
                disabled={!draftContent.trim()}
                onClick={() => setIsFaqDialogOpen(true)}
                type="button"
                variant="outline"
              >
                <HugeiconsIcon icon={BookOpen01Icon} size={14} strokeWidth={2} />
                添加到FAQ
              </Button>
            </div>

            {violationCheckPhase === "clean" ? (
              <ViolationCheckSuccessBanner onDismiss={handleDismissViolationStatus} />
            ) : null}
            {violationCheckPhase === "found" && violationResult ? (
              <ViolationResultPanel
                onDismiss={handleDismissViolationStatus}
                result={violationResult}
              />
            ) : null}

            {isRecommendedAttachmentsLoading ? (
              <SmartReplyRecommendedAttachmentsSection
                className="mt-[24px]"
                isLoading
                onSelectedAttachmentIdsChange={() => undefined}
                recommendedAttachments={[]}
                selectedAttachmentIds={[]}
              />
            ) : recommendedAttachments.length > 0 ? (
              <SmartReplyRecommendedAttachmentsSection
                className="mt-[24px]"
                onSelectedAttachmentIdsChange={handleToggleAttachment}
                recommendedAttachments={recommendedAttachments}
                selectedAttachmentIds={selectedAttachmentIds}
              />
            ) : null}
          </div>

          <DialogFooter className="gap-2 py-4 sm:justify-end">
            <Button
              className="h-9 min-w-[72px] rounded-[8px] px-4 text-[13px]"
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              取消
            </Button>
            <Button
              className="h-9 min-w-[72px] rounded-[8px] px-4 text-[13px]"
              disabled={isSendDisabled}
              onClick={handleSend}
              type="button"
            >
              发送
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <SmartReplyAddToFaqDialog
        initialAnswer={draftContent.trim()}
        initialQuestion={faqInitialQuestion}
        onOpenChange={setIsFaqDialogOpen}
        onSaved={() => onOpenChange(false)}
        open={isFaqDialogOpen}
      />
    </>
  );
}

function ViolationHighlightEditor({
  value,
  onChange,
  highlightedWords,
}: {
  value: string;
  onChange: (value: string) => void;
  highlightedWords: string[];
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const handleScroll = useCallback((event: UIEvent<HTMLTextAreaElement>) => {
    if (overlayRef.current) {
      overlayRef.current.scrollTop = event.currentTarget.scrollTop;
    }
  }, []);

  return (
    <div className="relative rounded-[8px] border border-input/80 bg-background text-foreground">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-y-auto rounded-[6px] px-[12px] py-[5px] text-[13px] leading-[22px] whitespace-pre-wrap break-words [scrollbar-gutter:stable]"
        data-testid="smart-reply-violation-highlight-overlay"
        ref={overlayRef}
      >
        <HighlightedText segments={splitByHighlights(value, highlightedWords)} />
      </div>
      <Textarea
        className="relative min-h-[168px] resize-none border-0 bg-transparent px-[12px] py-[5px] text-[13px] leading-[22px] text-transparent caret-foreground shadow-none [scrollbar-gutter:stable] focus-visible:ring-0"
        onChange={(event) => onChange(event.target.value)}
        onScroll={handleScroll}
        value={value}
      />
    </div>
  );
}

function HighlightedText({
  segments,
}: {
  segments: Array<{ text: string; highlighted: boolean }>;
}) {
  return (
    <>
      {segments.map((segment, index) => (
        <span
          className={segment.highlighted ? "text-destructive" : "text-foreground"}
          key={`${segment.text}-${index}`}
        >
          {segment.text}
        </span>
      ))}
    </>
  );
}

function ViolationCheckSuccessBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <section
      className="relative mt-3 rounded-[8px] border border-border bg-muted/50 p-[12px]"
      data-testid="smart-reply-violation-check-success"
    >
      <button
        aria-label="关闭违规词检测提示"
        className="absolute right-3 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-[6px] text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/20"
        onClick={onDismiss}
        type="button"
      >
        <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={2} />
      </button>
      <p className="pr-8 text-[13px] leading-[22px] text-foreground">
        <span className="font-medium">违规词检测</span>
        <span aria-hidden className="mx-1 ml-[12px]">
          👍
        </span>
        <span className="text-muted-foreground">做的太棒了，暂未检测到错误处～</span>
      </p>
    </section>
  );
}

function ViolationResultPanel({
  result,
  onDismiss,
}: {
  result: SmartReplyViolationResult;
  onDismiss: () => void;
}) {
  return (
    <section
      className="relative mt-[16px] rounded-[6px] border border-destructive/25 bg-destructive/5 p-[12px]"
      data-testid="smart-reply-violation-result"
    >
      <button
        aria-label="关闭违规词检测结果"
        className="absolute right-3 top-3 inline-flex size-6 items-center justify-center rounded-[6px] text-muted-foreground outline-none transition-colors hover:bg-destructive/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/20"
        onClick={onDismiss}
        type="button"
      >
        <HugeiconsIcon
          color="currentColor"
          icon={Cancel01Icon}
          size={14}
          strokeWidth={2}
        />
      </button>
      <div>
        <span className="text-[13px] font-medium text-foreground">
          违规词检测结果 
        </span>
        <span className="ml-[12px] text-[13px] text-muted-foreground">
          文中涉及以下违规：{result.categoryLabel}
        </span>
      </div>


      <div className="mt-[12px] flex flex-wrap gap-2">
        {result.words.map((word) => (
          <span
            className="inline-flex rounded-full bg-destructive/10 px-[12px] py-[6px] text-[12px] leading-5 text-destructive"
            key={word}
          >
            {word}
          </span>
        ))}
      </div>
    </section>
  );
}

function splitByHighlights(
  text: string,
  highlightedWords: string[],
): Array<{ text: string; highlighted: boolean }> {
  if (!text || highlightedWords.length === 0) {
    return [{ text, highlighted: false }];
  }

  const uniqueWords = [...new Set(highlightedWords.filter(Boolean))].sort(
    (left, right) => right.length - left.length,
  );

  if (uniqueWords.length === 0) {
    return [{ text, highlighted: false }];
  }

  const pattern = new RegExp(
    `(${uniqueWords.map((word) => escapeRegExp(word)).join("|")})`,
    "g",
  );
  const parts = text.split(pattern).filter((part) => part.length > 0);

  return parts.map((part) => ({
    text: part,
    highlighted: uniqueWords.includes(part),
  }));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
