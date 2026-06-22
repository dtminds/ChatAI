import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { KnowledgeChunk } from "../kb-mock-data";

const QA_QUESTION_MAX_LENGTH = 500;
const QA_ANSWER_MAX_LENGTH = 2000;
const IMAGE_TITLE_MAX_LENGTH = 16;

export function EditChunkDialog({
  chunk,
  onOpenChange,
  onSubmit,
  open,
}: {
  chunk: KnowledgeChunk | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (
    chunkId: string,
    values: Partial<Pick<KnowledgeChunk, "question" | "answer" | "title" | "content">>,
  ) => void | Promise<void>;
  open: boolean;
}) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!chunk || !open) {
      return;
    }

    setQuestion(chunk.question ?? "");
    setAnswer(chunk.answer ?? "");
    setTitle(chunk.title ?? "");
    setContent(chunk.content ?? "");
    setSubmitting(false);
  }, [chunk, open]);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && submitting) {
      return;
    }

    onOpenChange(nextOpen);
  }

  async function handleSubmit() {
    if (!chunk) {
      return;
    }

    setSubmitting(true);
    let submitSuccessful = false;

    try {
      if (chunk.type === "qa") {
        const normalizedQuestion = question.trim();
        const normalizedAnswer = answer.trim();

        if (!normalizedQuestion || !normalizedAnswer) {
          return;
        }

        await Promise.resolve(
          onSubmit(chunk.id, {
            question: normalizedQuestion,
            answer: normalizedAnswer,
          }),
        );
      } else {
        const normalizedTitle = title.trim();
        const normalizedContent = content.trim();

        if (!normalizedTitle || !normalizedContent) {
          return;
        }

        await Promise.resolve(
          onSubmit(chunk.id, {
            title: normalizedTitle,
            content: normalizedContent,
          }),
        );
      }

      submitSuccessful = true;
    } finally {
      if (isMountedRef.current) {
        setSubmitting(false);
      }
    }

    if (submitSuccessful && isMountedRef.current) {
      onOpenChange(false);
    }
  }

  const isValid =
    chunk?.type === "qa"
      ? question.trim().length > 0 && answer.trim().length > 0
      : title.trim().length > 0 && content.trim().length > 0;

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle>编辑切片</DialogTitle>
        </DialogHeader>

        {chunk?.type === "qa" ? (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-chunk-question">
                问题 <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="edit-chunk-question"
                maxLength={QA_QUESTION_MAX_LENGTH}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="请输入"
                value={question}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-chunk-answer">
                答案 <span className="text-destructive">*</span>
              </Label>
              <Textarea
                className="min-h-[120px]"
                id="edit-chunk-answer"
                maxLength={QA_ANSWER_MAX_LENGTH}
                onChange={(event) => setAnswer(event.target.value)}
                placeholder="请输入"
                value={answer}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {chunk?.type === "image" && chunk.fileUrl ? (
              <div className="overflow-hidden rounded-[8px] border bg-muted/30 p-3">
                <img
                  alt={chunk.title ?? "图片预览"}
                  className="mx-auto max-h-40 object-contain"
                  src={chunk.fileUrl}
                />
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="edit-chunk-title">
                切片标题 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="edit-chunk-title"
                maxLength={chunk?.type === "image" ? IMAGE_TITLE_MAX_LENGTH : undefined}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="请输入"
                value={title}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-chunk-content">
                切片内容 <span className="text-destructive">*</span>
              </Label>
              <Textarea
                className="min-h-[120px]"
                id="edit-chunk-content"
                onChange={(event) => setContent(event.target.value)}
                placeholder="请输入"
                value={content}
              />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button disabled={submitting} onClick={() => handleOpenChange(false)} type="button" variant="outline">
            取消
          </Button>
          <Button disabled={submitting || !isValid} onClick={() => void handleSubmit()} type="button">
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
