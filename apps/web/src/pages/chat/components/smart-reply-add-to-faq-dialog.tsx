import { useEffect, useId, useRef, useState } from "react";
import { Spinner } from "@/components/ui/spinner";
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
import { isRequestError } from "@/lib/request";
import { createKbChunk } from "@/pages/chat/ai-hosting/api/kb-chunk-service";
import { listKbDocs, listKbs } from "@/pages/chat/ai-hosting/api/kb-service";

const FAQ_DIALOG_KB_LIST_PAGE_SIZE = 200;
const FAQ_DIALOG_DOC_LIST_PAGE_SIZE = 100;

export type SmartReplyFaqOption = {
  disabled?: boolean;
  id: string;
  name: string;
};

export type SmartReplyAddToFaqDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialQuestion?: string;
  initialAnswer?: string;
  onSaved?: () => void;
};

export function SmartReplyAddToFaqDialog({
  open,
  onOpenChange,
  initialQuestion = "",
  initialAnswer = "",
  onSaved,
}: SmartReplyAddToFaqDialogProps) {
  const isMountedRef = useRef(false);
  const [knowledgeSets, setKnowledgeSets] = useState<SmartReplyFaqOption[]>([]);
  const [isKnowledgeSetsLoading, setIsKnowledgeSetsLoading] = useState(false);
  const [kbId, setKbId] = useState("");
  const [faqOptions, setFaqOptions] = useState<SmartReplyFaqOption[]>([]);
  const [isFaqsLoading, setIsFaqsLoading] = useState(false);
  const [docId, setDocId] = useState("");
  const [question, setQuestion] = useState(initialQuestion);
  const [answer, setAnswer] = useState(initialAnswer);
  const [isSaving, setIsSaving] = useState(false);

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

    setQuestion(initialQuestion);
    setAnswer(initialAnswer);
    setKnowledgeSets([]);
    setKbId("");
    setFaqOptions([]);
    setDocId("");

    let cancelled = false;
    setIsKnowledgeSetsLoading(true);

    void listKbs({ page: 1, pageSize: FAQ_DIALOG_KB_LIST_PAGE_SIZE })
      .then((response) => {
        if (cancelled) {
          return;
        }

        const options = response.kbs.map((item) => ({
          id: item.kbId,
          name: item.name,
        }));
        setKnowledgeSets(options);
        setKbId(options[0]?.id ?? "");
      })
      .catch(() => {
        if (!cancelled) {
          setKnowledgeSets([]);
          setKbId("");
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
  }, [initialAnswer, initialQuestion, open]);

  useEffect(() => {
    if (!open || !kbId) {
      setFaqOptions([]);
      setDocId("");
      setIsFaqsLoading(false);
      return;
    }

    let cancelled = false;
    setIsFaqsLoading(true);

    void listKbDocs(kbId, {
      docType: "qa",
      page: 1,
      pageSize: FAQ_DIALOG_DOC_LIST_PAGE_SIZE,
    })
      .then((response) => {
        if (cancelled) {
          return;
        }

        const options = response.docs.map((item) => ({
          disabled: item.status !== "completed",
          id: item.docId,
          name: item.name,
        }));
        setFaqOptions(options);
        setDocId(options.find((option) => !option.disabled)?.id ?? "");
      })
      .catch(() => {
        if (!cancelled) {
          setFaqOptions([]);
          setDocId("");
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
  }, [kbId, open]);

  const handleSave = () => {
    const trimmedQuestion = question.trim();
    const trimmedAnswer = answer.trim();

    if (!docId || !trimmedQuestion || !trimmedAnswer || isSaving) {
      return;
    }

    setIsSaving(true);

    void createKbChunk({
      chunkType: "faq",
      content: trimmedAnswer,
      docId,
      title: trimmedQuestion,
    })
      .then(() => {
        if (!isMountedRef.current) {
          return;
        }
        toast.success("已添加至 FAQ");
        onSaved?.();
        onOpenChange(false);
      })
      .catch((error) => {
        if (!isMountedRef.current) {
          return;
        }
        toast.error(
          isRequestError(error) ? error.message : "添加至 FAQ 失败",
        );
      })
      .finally(() => {
        if (isMountedRef.current) {
          setIsSaving(false);
        }
      });
  };

  const canSave =
    Boolean(docId) &&
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
          <DialogTitle className="text-[14px] font-medium leading-6 text-foreground">
            添加至FAQ
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4">
          <div className="grid gap-5 md:grid-cols-[220px_minmax(0,1fr)]">
            <div className="space-y-4">
              <FaqSelectField
                isLoading={isKnowledgeSetsLoading}
                label="知识库"
                loadingLabel="正在加载"
                onValueChange={setKbId}
                options={knowledgeSets}
                required
                value={kbId}
              />
              <FaqSelectField
                isLoading={isFaqsLoading}
                label="选择FAQ"
                loadingLabel="正在加载"
                onValueChange={setDocId}
                options={faqOptions}
                required
                value={docId}
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
              <FaqTextareaField
                label="答案"
                onChange={setAnswer}
                required
                rows={6}
                value={answer}
              />
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
              <Spinner variant="classic" size={14} />
              {loadingLabel}
            </span>
          ) : (
            <SelectValue placeholder="请选择" />
          )}
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem disabled={option.disabled} key={option.id} value={option.id}>
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
      className="gap-0.5 text-[13px] font-normal leading-[22px] text-muted-foreground"
      htmlFor={htmlFor}
    >
      {required ? (
        <span aria-hidden className="text-destructive">
          *
        </span>
      ) : null}
      {label}
    </Label>
  );
}
