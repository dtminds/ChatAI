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
import { cn } from "@/lib/utils";

const QUICK_REPLY_CATEGORY_TITLE_MAX_LENGTH = 10;

type QuickReplyCategoryDialogProps = {
  initialTitle?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (title: string) => Promise<void> | void;
  variant?: "category" | "group";
};

export function QuickReplyCategoryDialog({
  initialTitle = "",
  open,
  onOpenChange,
  onSubmit,
  variant = "category",
}: QuickReplyCategoryDialogProps) {
  const [title, setTitle] = useState(initialTitle);
  const [titleError, setTitleError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(initialTitle);
      setTitleError("");
      setIsSubmitting(false);
    }
  }, [initialTitle, open]);

  const copy = getQuickReplyCategoryDialogCopy(variant, Boolean(initialTitle));
  const titleTooLong = title.length > QUICK_REPLY_CATEGORY_TITLE_MAX_LENGTH;
  const visibleTitleError = titleTooLong ? copy.maxLengthError : titleError;

  const handleSubmit = async () => {
    const normalizedTitle = title.trim();

    if (!normalizedTitle) {
      setTitleError(copy.emptyError);
      return;
    }

    if (titleTooLong) {
      setTitleError(copy.maxLengthError);
      return;
    }

    setIsSubmitting(true);

    try {
      await onSubmit(normalizedTitle);
      onOpenChange(false);
    } catch {
      // The mutation owner reports the request failure.
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          {copy.description ? (
            <DialogDescription>{copy.description}</DialogDescription>
          ) : null}
        </DialogHeader>
        <div className="space-y-2">
          <div className="relative">
            <Input
              aria-invalid={visibleTitleError ? true : undefined}
              className={cn(
                "pr-14",
                titleTooLong && "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/15",
              )}
              onChange={(event) => {
                setTitle(event.target.value);
                setTitleError("");
              }}
              placeholder={copy.placeholder}
              value={title}
            />
            <span className={cn(
              "pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs tabular-nums text-muted-foreground",
              titleTooLong && "text-destructive",
            )}>
              {title.length}/{QUICK_REPLY_CATEGORY_TITLE_MAX_LENGTH}
            </span>
          </div>
          {visibleTitleError ? (
            <p className="text-xs text-destructive" role="alert">
              {visibleTitleError}
            </p>
          ) : null}
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

function getQuickReplyCategoryDialogCopy(
  variant: "category" | "group",
  isEditing: boolean,
) {
  if (variant === "group") {
    return {
      description:
        "用于收纳同类话术，主题要比分类更具体，如报价、改址；不要再用售前、售后这类大类名",
      emptyError: "请输入话术分组名称",
      maxLengthError: "话术分组名称不能超过10字",
      placeholder: "请输入话术分组名称，10字以内",
      title: isEditing ? "编辑话术分组" : "创建话术分组",
    };
  }

  return {
    description: "按客户服务场景划分大类，如售前、售后、物流；具体主题请建话术分组",
    emptyError: "请输入分类名称",
    maxLengthError: "分类名称不能超过10字",
    placeholder: "请输入分类名称，10字以内",
    title: isEditing ? "编辑分类" : "新建分类",
  };
}
