import { useEffect, useState } from "react";
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
import type { KbDocChunkViewItem } from "../kb-types";
import { ChunkContentEditor } from "./chunk-content-editor";
import {
  QA_ANSWER_MAX_LENGTH,
  QA_QUESTION_MAX_LENGTH,
  useDialogSubmit,
} from "./shared";

const CHUNK_VECTORIZATION_TIP =
  "保存编辑后的切片内容，需要重新向量化，并产生额外 tokens 消耗。";

export function EditChunkDialog({
  chunk,
  onOpenChange,
  onSubmit,
  open,
}: {
  chunk: KbDocChunkViewItem | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (
    chunkId: string,
    values: Partial<Pick<KbDocChunkViewItem, "question" | "answer" | "title" | "content">>,
  ) => void | Promise<void>;
  open: boolean;
}) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const { handleOpenChange, runSubmit, submitting } = useDialogSubmit({
    onOpenChange,
    open,
  });

  useEffect(() => {
    if (!chunk || !open) {
      return;
    }

    setQuestion(chunk.question ?? "");
    setAnswer(chunk.answer ?? "");
    setTitle(chunk.title ?? "");
    setContent(chunk.content ?? "");
  }, [chunk, open]);

  function handleSubmit() {
    if (!chunk) {
      return;
    }

    void runSubmit(async () => {
      if (chunk.type === "qa") {
        const normalizedQuestion = question.trim();
        const normalizedAnswer = answer.trim();

        if (!normalizedQuestion || !normalizedAnswer) {
          return false;
        }

        await onSubmit(chunk.id, {
          question: normalizedQuestion,
          answer: normalizedAnswer,
        });
        return;
      }

      const normalizedTitle = title.trim();
      const normalizedContent = content.trim();

      if (!normalizedContent) {
        return false;
      }

      await onSubmit(chunk.id, {
        title: normalizedTitle,
        content: normalizedContent,
      });
    });
  }

  const isValid =
    chunk?.type === "qa"
      ? question.trim().length > 0 && answer.trim().length > 0
      : content.trim().length > 0;

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="max-w-[760px]">
        <DialogHeader>
          <DialogTitle>编辑切片</DialogTitle>
        </DialogHeader>

        {chunk?.type === "qa" ? (
          <div className="space-y-5 py-3">
            <div className="space-y-2">
              <Label htmlFor="edit-chunk-question">
                问题 <span className="text-destructive">*</span>
              </Label>
              <Textarea
                className="min-h-0 resize-none"
                id="edit-chunk-question"
                maxLength={QA_QUESTION_MAX_LENGTH}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="请输入"
                rows={2}
                value={question}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="edit-chunk-answer">
                  答案 <span className="text-destructive">*</span>
                </Label>
                <span className="text-xs text-muted-foreground">
                  {answer.length}/{QA_ANSWER_MAX_LENGTH}
                </span>
              </div>
              <Textarea
                className="min-h-[320px] resize-y"
                id="edit-chunk-answer"
                maxLength={QA_ANSWER_MAX_LENGTH}
                onChange={(event) => setAnswer(event.target.value)}
                placeholder="请输入"
                value={answer}
              />
              <ChunkVectorizationTip />
            </div>
          </div>
        ) : (
          <div className="space-y-5 py-3">
            <div className="space-y-2">
              <Label htmlFor="edit-chunk-title">
                切片标题
              </Label>
              <Textarea
                className="min-h-0 resize-none"
                id="edit-chunk-title"
                onChange={(event) => setTitle(event.target.value)}
                placeholder="请输入"
                rows={2}
                value={title}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-chunk-content">
                {chunk?.imageUrls?.length ? "内容" : "切片内容"}{" "}
                <span className="text-destructive">*</span>
              </Label>
              <ChunkContentEditor
                className="min-h-[320px]"
                content={content}
                imageAlt={title || chunk?.title || "切片图片"}
                imageUrls={chunk?.imageUrls}
                onContentChange={setContent}
              />
              <ChunkVectorizationTip />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button disabled={submitting} onClick={() => handleOpenChange(false)} type="button" variant="outline">
            取消
          </Button>
          <Button disabled={submitting || !isValid} onClick={handleSubmit} type="button">
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChunkVectorizationTip() {
  return (
    <p className="rounded-[8px] bg-primary/8 px-3 py-2 text-sm leading-5 text-foreground">
      {CHUNK_VECTORIZATION_TIP}
    </p>
  );
}
