import { useCallback, useEffect, useId, useState } from "react";
import { Add01Icon, Loading03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  adaptKnowledgeDocOptions,
  adaptKnowledgeSetOptions,
  buildSmartReplyKnowledgeFaqAddRequest,
} from "@/pages/chat/api/smart-reply-adapter";
import {
  addSmartReplyKnowledgeFaq,
  listKnowledgeDocPage,
  listKnowledgePage,
} from "@/pages/chat/api/workbench-gateway";
import { isRequestError } from "@/lib/request";
import {
  SmartReplyRecommendedAttachmentsSection,
  type SmartReplyRecommendedAttachment,
} from "@/pages/chat/components/smart-reply-recommended-attachments";

export type SmartReplyFaqOption = {
  id: string;
  name: string;
};

export type SmartReplyAddToFaqPayload = {
  knowledgeSetId: string;
  faqId: string;
  question: string;
  similarQuestions: string[];
  answer: string;
};

export type SmartReplyAddToFaqDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId?: string;
  initialQuestion?: string;
  initialAnswer?: string;
  recommendedAttachments?: SmartReplyRecommendedAttachment[];
  isRecommendedAttachmentsLoading?: boolean;
  initialSelectedAttachmentIds?: string[];
  onSaved?: () => void;
};

export function SmartReplyAddToFaqDialog({
  open,
  onOpenChange,
  conversationId,
  initialQuestion = "",
  initialAnswer = "",
  recommendedAttachments = [],
  isRecommendedAttachmentsLoading = false,
  initialSelectedAttachmentIds = [],
  onSaved,
}: SmartReplyAddToFaqDialogProps) {
  const [knowledgeSets, setKnowledgeSets] = useState<SmartReplyFaqOption[]>([]);
  const [isKnowledgeSetsLoading, setIsKnowledgeSetsLoading] = useState(false);
  const [knowledgeSetId, setKnowledgeSetId] = useState("");
  const [faqOptions, setFaqOptions] = useState<SmartReplyFaqOption[]>([]);
  const [isFaqsLoading, setIsFaqsLoading] = useState(false);
  const [faqId, setFaqId] = useState("");
  const [question, setQuestion] = useState(initialQuestion);
  const [answer, setAnswer] = useState(initialAnswer);
  const [similarQuestions, setSimilarQuestions] = useState<string[]>([""]);
  const [selectedAttachmentIds, setSelectedAttachmentIds] = useState<string[]>(
    initialSelectedAttachmentIds,
  );
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    setQuestion(initialQuestion);
    setAnswer(initialAnswer);
    setSimilarQuestions([""]);
    setSelectedAttachmentIds(initialSelectedAttachmentIds);
    setKnowledgeSets([]);
    setKnowledgeSetId("");
    setFaqOptions([]);
    setFaqId("");

    if (!conversationId) {
      setKnowledgeSets([]);
      setKnowledgeSetId("");
      setIsKnowledgeSetsLoading(false);
      return;
    }

    let cancelled = false;
    setIsKnowledgeSetsLoading(true);

    void listKnowledgePage(conversationId)
      .then((response) => {
        if (cancelled) {
          return;
        }

        const options = adaptKnowledgeSetOptions(response.list);
        setKnowledgeSets(options);
        setKnowledgeSetId(options[0]?.id ?? "");
      })
      .catch(() => {
        if (!cancelled) {
          setKnowledgeSets([]);
          setKnowledgeSetId("");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsKnowledgeSetsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [conversationId, initialAnswer, initialQuestion, initialSelectedAttachmentIds, open]);

  useEffect(() => {
    if (!open || !conversationId || !knowledgeSetId) {
      setFaqOptions([]);
      setFaqId("");
      setIsFaqsLoading(false);
      return;
    }

    let cancelled = false;
    setIsFaqsLoading(true);

    void listKnowledgeDocPage(conversationId, knowledgeSetId)
      .then((response) => {
        if (cancelled) {
          return;
        }

        const options = adaptKnowledgeDocOptions(response.list);
        setFaqOptions(options);
        setFaqId(options[0]?.id ?? "");
      })
      .catch(() => {
        if (!cancelled) {
          setFaqOptions([]);
          setFaqId("");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsFaqsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [conversationId, knowledgeSetId, open]);

  const handleAddSimilarQuestion = useCallback(() => {
    setSimilarQuestions((current) => [...current, ""]);
  }, []);

  const handleSimilarQuestionChange = useCallback((index: number, value: string) => {
    setSimilarQuestions((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? value : item)),
    );
  }, []);

  const handleToggleAttachment = useCallback((attachmentId: string, checked: boolean) => {
    setSelectedAttachmentIds((current) => {
      if (checked) {
        return current.includes(attachmentId)
          ? current
          : [...current, attachmentId];
      }

      return current.filter((id) => id !== attachmentId);
    });
  }, []);

  const handleSave = () => {
    const trimmedQuestion = question.trim();
    const trimmedAnswer = answer.trim();

    if (!conversationId || !faqId || !trimmedQuestion || !trimmedAnswer || isSaving) {
      return;
    }

    setIsSaving(true);

    void addSmartReplyKnowledgeFaq(
      buildSmartReplyKnowledgeFaqAddRequest({
        attachIds: selectedAttachmentIds,
        answer: trimmedAnswer,
        conversationId,
        docId: faqId,
        question: trimmedQuestion,
        similarQuestions: similarQuestions
          .map((item) => item.trim())
          .filter(Boolean),
      }),
    )
      .then(() => {
        toast.success("已添加至 FAQ");
        onSaved?.();
        onOpenChange(false);
      })
      .catch((error) => {
        toast.error(
          isRequestError(error) ? error.message : "添加至 FAQ 失败",
        );
      })
      .finally(() => {
        setIsSaving(false);
      });
  };

  const canSave =
    Boolean(conversationId) &&
    Boolean(faqId) &&
    Boolean(question.trim()) &&
    Boolean(answer.trim()) &&
    !isKnowledgeSetsLoading &&
    !isFaqsLoading &&
    !isSaving;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        aria-describedby={undefined}
        className="flex max-h-[min(90vh,720px)] w-[min(860px,calc(100vw-48px))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:rounded-[10px]"
        data-testid="smart-reply-add-to-faq-dialog"
      >
        <DialogHeader className="space-y-0 px-6 py-4 text-left">
          <DialogTitle className="text-[14px] font-medium leading-6 text-[#101419]">
            添加至FAQ
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4">
          <div className="grid gap-5 md:grid-cols-[220px_minmax(0,1fr)]">
            <div className="space-y-4">
              <FaqSelectField
                isLoading={isKnowledgeSetsLoading}
                label="知识集"
                loadingLabel="正在加载知识集"
                onValueChange={setKnowledgeSetId}
                options={knowledgeSets}
                required
                value={knowledgeSetId}
              />
              <FaqSelectField
                isLoading={isFaqsLoading}
                label="选择FAQ"
                loadingLabel="正在加载 FAQ"
                onValueChange={setFaqId}
                options={faqOptions}
                required
                value={faqId}
              />
            </div>
            <div className="min-w-0 space-y-4">
              <FaqTextareaField
                label="问题"
                onChange={setQuestion}
                required
                rows={2}
                value={question}
              />
              <SimilarQuestionsField
                onAdd={handleAddSimilarQuestion}
                onChange={handleSimilarQuestionChange}
                values={similarQuestions}
              />
              <FaqTextareaField
                label="答案"
                onChange={setAnswer}
                required
                rows={6}
                value={answer}
              />
              {isRecommendedAttachmentsLoading ? (
                <SmartReplyRecommendedAttachmentsSection
                  isLoading
                  onSelectedAttachmentIdsChange={() => undefined}
                  recommendedAttachments={[]}
                  selectedAttachmentIds={[]}
                />
              ) : recommendedAttachments.length > 0 ? (
                <SmartReplyRecommendedAttachmentsSection
                  onSelectedAttachmentIdsChange={handleToggleAttachment}
                  recommendedAttachments={recommendedAttachments}
                  selectedAttachmentIds={selectedAttachmentIds}
                />
              ) : null}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 px-6 py-4 sm:justify-end">
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
            disabled={!canSave}
            onClick={handleSave}
            type="button"
          >
            {isSaving ? "保存中" : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FaqSelectField({
  label,
  value,
  onValueChange,
  options,
  required = false,
  isLoading = false,
  loadingLabel = "正在加载",
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: SmartReplyFaqOption[];
  required?: boolean;
  isLoading?: boolean;
  loadingLabel?: string;
}) {
  const fieldId = useId();

  return (
    <div className="space-y-2">
      <FaqFieldLabel htmlFor={fieldId} label={label} required={required} />
      <Select disabled={isLoading || options.length === 0} onValueChange={onValueChange} value={value}>
        <SelectTrigger
          aria-label={label}
          className="h-9 w-full rounded-[8px] px-3 text-[13px] shadow-none"
          id={fieldId}
        >
          {isLoading ? (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <HugeiconsIcon
                className="animate-spin"
                icon={Loading03Icon}
                size={14}
                strokeWidth={2}
              />
              {loadingLabel}
            </span>
          ) : (
            <SelectValue placeholder="请选择" />
          )}
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function FaqTextareaField({
  label,
  value,
  onChange,
  required = false,
  rows = 4,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  rows?: number;
}) {
  const fieldId = useId();

  return (
    <div className="space-y-2">
      <FaqFieldLabel htmlFor={fieldId} label={label} required={required} />
      <Textarea
        aria-label={label}
        className="min-h-0 resize-none rounded-[8px] px-3 py-2 text-[13px] leading-[22px] shadow-none focus-visible:ring-2 focus-visible:ring-ring/20"
        id={fieldId}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        value={value}
      />
    </div>
  );
}

function SimilarQuestionsField({
  values,
  onChange,
  onAdd,
}: {
  values: string[];
  onChange: (index: number, value: string) => void;
  onAdd: () => void;
}) {
  return (
    <div className="space-y-2">
      <FaqFieldLabel label="相似问法" />
      <div className="space-y-3">
        {values.map((value, index) => {
          const fieldId = `similar-question-${index}`;
          return (
            <Textarea
              className="min-h-0 resize-none rounded-[8px] px-3 py-2 text-[13px] leading-[22px] shadow-none focus-visible:ring-2 focus-visible:ring-ring/20"
              id={fieldId}
              key={fieldId}
              onChange={(event) => onChange(index, event.target.value)}
              placeholder="请输入相似问法"
              rows={1}
              value={value}
            />
          );
        })}
      </div>
      <Button
        className="h-auto gap-1 p-0 text-[13px] text-[#267FF0] hover:bg-transparent hover:text-[#1a6ad4]"
        onClick={onAdd}
        type="button"
        variant="ghost"
      >
        <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={2} />
        添加相似问法
      </Button>
    </div>
  );
}

function FaqFieldLabel({
  label,
  htmlFor,
  required = false,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
}) {
  return (
    <Label
      className="gap-0.5 text-[13px] font-normal leading-[22px] text-[#3D3D3D]"
      htmlFor={htmlFor}
    >
      {required ? (
        <span aria-hidden className="text-[#F53F3F]">
          *
        </span>
      ) : null}
      {label}
    </Label>
  );
}
