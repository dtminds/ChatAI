import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const QA_QUESTION_MAX_LENGTH = 500;
const QA_ANSWER_MAX_LENGTH = 2000;

export function AddQaChunkDialog({
  onOpenChange,
  onSubmit,
  open,
}: {
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: { question: string; answer: string }) => void | Promise<void>;
  open: boolean;
}) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  function reset() {
    setQuestion("");
    setAnswer("");
    setSubmitting(false);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && submitting) {
      return;
    }

    if (!nextOpen) {
      reset();
    }

    onOpenChange(nextOpen);
  }

  async function handleSubmit() {
    const normalizedQuestion = question.trim();
    const normalizedAnswer = answer.trim();

    if (!normalizedQuestion || !normalizedAnswer) {
      return;
    }

    setSubmitting(true);
    let submitSuccessful = false;

    try {
      await Promise.resolve(
        onSubmit({ question: normalizedQuestion, answer: normalizedAnswer }),
      );
      submitSuccessful = true;
    } finally {
      if (isMountedRef.current) {
        setSubmitting(false);
      }
    }

    if (submitSuccessful && isMountedRef.current) {
      reset();
      onOpenChange(false);
    }
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle>手动添加问答</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="qa-chunk-question">
              问题 <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="qa-chunk-question"
              maxLength={QA_QUESTION_MAX_LENGTH}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="请输入"
              value={question}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="qa-chunk-answer">
              答案 <span className="text-destructive">*</span>
            </Label>
            <Textarea
              className="min-h-[120px]"
              id="qa-chunk-answer"
              maxLength={QA_ANSWER_MAX_LENGTH}
              onChange={(event) => setAnswer(event.target.value)}
              placeholder="请输入"
              value={answer}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button disabled={submitting} onClick={() => handleOpenChange(false)} type="button" variant="outline">
            取消
          </Button>
          <Button
            disabled={submitting || !question.trim() || !answer.trim()}
            onClick={() => void handleSubmit()}
            type="button"
          >
            确定
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
