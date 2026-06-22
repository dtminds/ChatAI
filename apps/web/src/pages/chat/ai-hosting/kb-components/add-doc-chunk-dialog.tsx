import { useState } from "react";
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

export function AddDocChunkDialog({
  onOpenChange,
  onSubmit,
  open,
}: {
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: { title: string; content: string }) => void;
  open: boolean;
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setTitle("");
    setContent("");
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

  function handleSubmit() {
    const normalizedTitle = title.trim();
    const normalizedContent = content.trim();

    if (!normalizedTitle || !normalizedContent) {
      return;
    }

    setSubmitting(true);
    onSubmit({ title: normalizedTitle, content: normalizedContent });
    setSubmitting(false);
    handleOpenChange(false);
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle>添加切片</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="doc-chunk-title">
              切片标题 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="doc-chunk-title"
              onChange={(event) => setTitle(event.target.value)}
              placeholder="请输入"
              value={title}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="doc-chunk-content">
              切片内容 <span className="text-destructive">*</span>
            </Label>
            <Textarea
              className="min-h-[120px]"
              id="doc-chunk-content"
              onChange={(event) => setContent(event.target.value)}
              placeholder="请输入"
              value={content}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button disabled={submitting} onClick={() => handleOpenChange(false)} type="button" variant="outline">
            取消
          </Button>
          <Button
            disabled={submitting || !title.trim() || !content.trim()}
            onClick={handleSubmit}
            type="button"
          >
            确定
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
