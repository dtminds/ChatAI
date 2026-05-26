import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Cancel01Icon,
  BookOpen01Icon,
  Loading03Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
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
  conversationId?: string;
  faqInitialQuestion?: string;
  recommendedAttachments?: SmartReplyRecommendedAttachment[];
  isRecommendedAttachmentsLoading?: boolean;
  onSend?: (payload: {
    content: string;
    selectedAttachmentIds: string[];
  }) => void;
  onCheckViolations?: (content: string) => Promise<SmartReplyViolationResult | null>;
};

const DEMO_VIOLATION_WORDS = ["太好用了", "最好", "第一", "极致"];

export function SmartReplyEditDialog({
  open,
  onOpenChange,
  initialContent,
  conversationId,
  faqInitialQuestion: faqInitialQuestionProp,
  recommendedAttachments: recommendedAttachmentsProp,
  isRecommendedAttachmentsLoading = false,
  onSend,
  onCheckViolations,
}: SmartReplyEditDialogProps) {
  const recommendedAttachments = recommendedAttachmentsProp ?? [];
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
      if (onCheckViolations) {
        const result = await onCheckViolations(draftContent);
        setViolationResult(result);
        setViolationCheckPhase(result ? "found" : "clean");
        return;
      }

      await new Promise((resolve) => {
        window.setTimeout(resolve, 400);
      });

      const words = DEMO_VIOLATION_WORDS.filter((word) =>
        draftContent.includes(word),
      );
      if (words.length > 0) {
        setViolationResult({
          categoryLabel: "广告法_通用禁用极限词",
          words,
        });
        setViolationCheckPhase("found");
      } else {
        setViolationResult(null);
        setViolationCheckPhase("clean");
      }
    } finally {
      setIsCheckingViolations(false);
    }
  }, [draftContent, onCheckViolations]);

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

  const handleSend = () => {
    const trimmed = draftContent.trim();
    if (!trimmed) {
      return;
    }
    onSend?.({
      content: trimmed,
      selectedAttachmentIds,
    });
    onOpenChange(false);
  };

  return (
    <>
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        aria-describedby={undefined}
        className="flex max-h-[min(90vh,720px)] w-[640px] max-w-none flex-col gap-0 overflow-hidden p-0 sm:rounded-[10px] px-[24px]"
        data-testid="smart-reply-edit-dialog"
      >
        <DialogHeader className="space-y-0 py-[16px] text-left">
          <DialogTitle className="text-[14px] font-medium leading-6 text-[#101419]">
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
              className="h-8 gap-1.5 rounded-[8px] px-3 text-[13px] border-none bg-[rgba(38,127,240,0.06)] text-[#666]"
              disabled={isCheckingViolations || !draftContent.trim()}
              onClick={() => void handleCheckViolations()}
              type="button"
              variant="outline"
            >
              {isCheckingViolations ? (
                <HugeiconsIcon
                  className="animate-spin"
                  icon={Loading03Icon}
                  size={14}
                  strokeWidth={2}
                />
              ) : (
                <HugeiconsIcon icon={Search01Icon} size={14} strokeWidth={2} />
              )}
              {isCheckingViolations ? "违规词检测中" : "违规词检测"}
            </Button>
            <Button
              className="h-8 gap-1.5 rounded-[8px] px-3 text-[13px] bg-[rgba(38,127,240,0.06)] text-[#666] border-none"
              disabled={!draftContent.trim()}
              onClick={() => setIsFaqDialogOpen(true)}
              type="button"
              variant="outline"
            >
              <HugeiconsIcon icon={BookOpen01Icon} size={14} strokeWidth={2} />
              添加到FAQ
            </Button>
          </div>

          {violationCheckPhase === "loading" ? (
            <ViolationCheckLoadingBanner />
          ) : null}
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
            disabled={!draftContent.trim()}
            onClick={handleSend}
            type="button"
          >
            发送
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <SmartReplyAddToFaqDialog
      conversationId={conversationId}
      initialAnswer={draftContent.trim()}
      initialQuestion={faqInitialQuestion}
      initialSelectedAttachmentIds={selectedAttachmentIds}
      isRecommendedAttachmentsLoading={isRecommendedAttachmentsLoading}
      onOpenChange={setIsFaqDialogOpen}
      onSaved={() => onOpenChange(false)}
      open={isFaqDialogOpen}
      recommendedAttachments={recommendedAttachments}
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
  return (
    <div className="relative rounded-[8px] border border-input/80 bg-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-[6px] px-[12px] py-[5px] text-[13px] leading-[22px] whitespace-pre-wrap break-words"
      >
        <HighlightedText segments={splitByHighlights(value, highlightedWords)} />
      </div>
      <Textarea
        className="relative min-h-[168px] resize-none border-0 bg-transparent px-[12px] py-[5px] text-[13px] leading-[22px] text-transparent caret-[#101419] shadow-none focus-visible:ring-0"
        onChange={(event) => onChange(event.target.value)}
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
          className={segment.highlighted ? "text-[#F53F3F]" : "text-[#101419]"}
          key={`${segment.text}-${index}`}
        >
          {segment.text}
        </span>
      ))}
    </>
  );
}

function ViolationCheckLoadingBanner() {
  return (
    <section
      className="mt-3 rounded-[6px] border border-[#EEEFF0] bg-[#F7F8FA] p-[12px]"
      data-testid="smart-reply-violation-check-loading"
    >
      <p className="text-[13px] leading-[22px] text-[#101419] font-medium">违规词检测中...</p>
    </section>
  );
}

function ViolationCheckSuccessBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <section
      className="relative mt-3 rounded-[8px] border border-[#EEEFF0] bg-[#F7F8FA] p-[12px]"
      data-testid="smart-reply-violation-check-success"
    >
      <button
        aria-label="关闭违规词检测提示"
        className="absolute right-3 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-[6px] text-[#86909C] outline-none transition-colors hover:bg-[#EEEFF0] hover:text-[#101419] focus-visible:ring-2 focus-visible:ring-ring/20"
        onClick={onDismiss}
        type="button"
      >
        <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={2} />
      </button>
      <p className="pr-8 text-[13px] leading-[22px] text-[#101419]">
        <span className="font-medium">违规词检测</span>
        <span aria-hidden className="mx-1 ml-[12px]">
          👍
        </span>
        <span className="text-[#999]">做的太棒了，暂未检测到错误处～</span>
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
      className="relative mt-[16px] rounded-[6px] border border-[#FBC9C9] bg-[#FFF5F5] p-[12px]"
      data-testid="smart-reply-violation-result"
    >
      <button
        aria-label="关闭违规词检测结果"
        className="absolute right-3 top-3 inline-flex size-6 items-center justify-center rounded-[6px] text-[#7E858F] outline-none transition-colors hover:bg-[#FFECEC] hover:text-[#101419] focus-visible:ring-2 focus-visible:ring-ring/20"
        onClick={onDismiss}
        type="button"
      >
        <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={2} color="#7E858F"/>
      </button>
      <div>
        <span className="text-[13px] font-medium text-[#101419]">
          违规词检测结果 
        </span>
        <span className="ml-[12px] text-[13px] text-[#999]">
          文中涉及以下违规：{result.categoryLabel}
        </span>
      </div>


      <div className="mt-[12px] flex flex-wrap gap-2">
        {result.words.map((word) => (
          <span
            className="inline-flex rounded-full bg-[#FFEDED] px-[12px] py-[6px] text-[12px] leading-5 text-[#FF3E33]"
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
