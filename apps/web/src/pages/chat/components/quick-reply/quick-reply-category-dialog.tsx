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
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(initialTitle);
      setError("");
      setIsSubmitting(false);
    }
  }, [initialTitle, open]);

  const copy = getQuickReplyCategoryDialogCopy(variant, Boolean(initialTitle));

  const handleSubmit = async () => {
    const normalizedTitle = title.trim();

    if (!normalizedTitle) {
      setError(copy.emptyError);
      return;
    }

    if (normalizedTitle.length > QUICK_REPLY_CATEGORY_TITLE_MAX_LENGTH) {
      setError(copy.maxLengthError);
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
          <DialogTitle>{copy.title}</DialogTitle>
          {copy.description ? (
            <DialogDescription>{copy.description}</DialogDescription>
          ) : null}
        </DialogHeader>
        <div className="space-y-2">
          <Input
            maxLength={QUICK_REPLY_CATEGORY_TITLE_MAX_LENGTH}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={copy.placeholder}
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
