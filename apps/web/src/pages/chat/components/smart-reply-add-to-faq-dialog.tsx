import { useCallback, useEffect, useId, useState } from "react";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
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
  initialQuestion?: string;
  initialAnswer?: string;
  knowledgeSets?: SmartReplyFaqOption[];
  faqOptions?: SmartReplyFaqOption[];
  onSave?: (payload: SmartReplyAddToFaqPayload) => void;
};

const DEMO_KNOWLEDGE_SETS: SmartReplyFaqOption[] = [
  { id: "ks-default", name: "默认知识集" },
];

const DEMO_FAQ_OPTIONS: SmartReplyFaqOption[] = [
  { id: "faq-default", name: "默认 FAQ" },
];

export function SmartReplyAddToFaqDialog({
  open,
  onOpenChange,
  initialQuestion = "",
  initialAnswer = "",
  knowledgeSets = DEMO_KNOWLEDGE_SETS,
  faqOptions = DEMO_FAQ_OPTIONS,
  onSave,
}: SmartReplyAddToFaqDialogProps) {
  const [knowledgeSetId, setKnowledgeSetId] = useState(
    () => knowledgeSets[0]?.id ?? "",
  );
  const [faqId, setFaqId] = useState(() => faqOptions[0]?.id ?? "");
  const [question, setQuestion] = useState(initialQuestion);
  const [answer, setAnswer] = useState(initialAnswer);
  const [similarQuestions, setSimilarQuestions] = useState<string[]>([""]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setKnowledgeSetId(knowledgeSets[0]?.id ?? "");
    setFaqId(faqOptions[0]?.id ?? "");
    setQuestion(initialQuestion);
    setAnswer(initialAnswer);
    setSimilarQuestions([""]);
  }, [faqOptions, initialAnswer, initialQuestion, knowledgeSets, open]);

  const handleAddSimilarQuestion = useCallback(() => {
    setSimilarQuestions((current) => [...current, ""]);
  }, []);

  const handleSimilarQuestionChange = useCallback((index: number, value: string) => {
    setSimilarQuestions((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? value : item)),
    );
  }, []);

  const handleSave = () => {
    const trimmedQuestion = question.trim();
    const trimmedAnswer = answer.trim();
    if (!knowledgeSetId || !faqId || !trimmedQuestion || !trimmedAnswer) {
      return;
    }

    onSave?.({
      knowledgeSetId,
      faqId,
      question: trimmedQuestion,
      similarQuestions: similarQuestions
        .map((item) => item.trim())
        .filter(Boolean),
      answer: trimmedAnswer,
    });
    onOpenChange(false);
  };

  const canSave =
    Boolean(knowledgeSetId) &&
    Boolean(faqId) &&
    Boolean(question.trim()) &&
    Boolean(answer.trim());

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        aria-describedby={undefined}
        className="flex max-h-[min(90vh,720px)] w-[520px] max-w-none flex-col gap-0 overflow-hidden p-0 sm:rounded-[10px]"
        data-testid="smart-reply-add-to-faq-dialog"
      >
        <DialogHeader className="space-y-0 px-6 py-4 text-left">
          <DialogTitle className="text-[14px] font-medium leading-6 text-[#101419]">
            添加至FAQ
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-4">
          <FaqSelectField
            label="知识集"
            onValueChange={setKnowledgeSetId}
            options={knowledgeSets}
            required
            value={knowledgeSetId}
          />
          <FaqSelectField
            label="选择FAQ"
            onValueChange={setFaqId}
            options={faqOptions}
            required
            value={faqId}
          />
          <FaqTextareaField
            label="问题"
            onChange={setQuestion}
            required
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
            保存
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
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: SmartReplyFaqOption[];
  required?: boolean;
}) {
  const fieldId = useId();

  return (
    <div className="space-y-2">
      <FaqFieldLabel htmlFor={fieldId} label={label} required={required} />
      <Select onValueChange={onValueChange} value={value}>
        <SelectTrigger
          aria-label={label}
          className="h-9 w-full rounded-[8px] px-3 text-[13px] shadow-none"
          id={fieldId}
        >
          <SelectValue placeholder="请选择" />
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
              rows={3}
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
