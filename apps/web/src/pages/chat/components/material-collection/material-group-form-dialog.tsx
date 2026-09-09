import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LimitedInput } from "@/components/ui/limited-input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type MaterialGroupFormDialogProps = {
  initialTitle?: string;
  isSubmitting?: boolean;
  mode: "create" | "edit";
  onOpenChange: (open: boolean) => void;
  onSubmit: (title: string) => void;
  open: boolean;
};

const MATERIAL_GROUP_TITLE_MAX_LENGTH = 10;

export function MaterialGroupFormDialog({
  initialTitle = "",
  isSubmitting = false,
  mode,
  onOpenChange,
  onSubmit,
  open,
}: MaterialGroupFormDialogProps) {
  const inputId = useId();
  const [title, setTitle] = useState("");
  const initialTitleRef = useRef(initialTitle);
  initialTitleRef.current = initialTitle;

  useEffect(() => {
    if (open) {
      setTitle(initialTitleRef.current);
    }
  }, [open]);

  const normalizedTitle = title.trim();
  const titleLength = title.length;
  const titleTooLong = titleLength > MATERIAL_GROUP_TITLE_MAX_LENGTH;
  const dialogTitle = mode === "edit" ? "编辑分组" : "新建分组";
  const submitLabel = mode === "edit" ? "保存" : "新建";

  function handleSubmit() {
    if (!normalizedTitle || titleTooLong) {
      return;
    }

    onSubmit(normalizedTitle);
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription className="sr-only">
            输入分组名称
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor={inputId}>分组名称</Label>
            <span className={cn(
              "text-xs tabular-nums text-muted-foreground",
              titleTooLong && "text-destructive",
            )}>
              {titleLength}/{MATERIAL_GROUP_TITLE_MAX_LENGTH}
            </span>
          </div>
          <LimitedInput
            aria-invalid={titleTooLong || undefined}
            aria-label="分组名称"
            autoFocus
            className={cn(
              titleTooLong && "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/15",
            )}
            disabled={isSubmitting}
            id={inputId}
            maxLength={MATERIAL_GROUP_TITLE_MAX_LENGTH}
            onKeyDown={(event) => {
              if (
                event.key === "Enter"
                && !event.nativeEvent.isComposing
                && event.keyCode !== 229
              ) {
                handleSubmit();
              }
            }}
            onValueChange={setTitle}
            placeholder="请输入分组名称"
            value={title}
          />
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
          <Button
            disabled={isSubmitting || !normalizedTitle || titleTooLong}
            onClick={handleSubmit}
            type="button"
          >
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
