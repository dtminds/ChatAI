import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const QUICK_REPLY_CATEGORY_TITLE_MAX_LENGTH = 10;

type QuickReplyCategoryDialogProps = {
  initialTitle?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (title: string) => Promise<void> | void;
};

export function QuickReplyCategoryDialog({
  initialTitle = "",
  open,
  onOpenChange,
  onSubmit,
}: QuickReplyCategoryDialogProps) {
  const [title, setTitle] = useState(initialTitle);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(initialTitle);
      setError("");
      setIsSubmitting(false);
    }
  }, [initialTitle, open]);

  const handleSubmit = async () => {
    const normalizedTitle = title.trim();

    if (!normalizedTitle) {
      setError("请输入分类名称");
      return;
    }

    if (normalizedTitle.length > QUICK_REPLY_CATEGORY_TITLE_MAX_LENGTH) {
      setError("分类名称不能超过10字");
      return;
    }

    setIsSubmitting(true);

    try {
      await onSubmit(normalizedTitle);
      onOpenChange(false);
    } catch (submitError) {
      setError(getSubmitErrorMessage(submitError));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{initialTitle ? "编辑分类" : "新建分类"}</DialogTitle>
          <DialogDescription>
            分类名称用于组织快捷话术
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Input
            maxLength={QUICK_REPLY_CATEGORY_TITLE_MAX_LENGTH}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="请输入分类名称，10字以内"
            value={title}
          />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button
            disabled={isSubmitting}
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            取消
          </Button>
          <Button disabled={isSubmitting} onClick={handleSubmit} type="button">
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function getSubmitErrorMessage(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.trim()
  ) {
    return error.message.trim();
  }

  return "保存失败，请稍后重试";
}
