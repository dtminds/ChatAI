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
import { Input } from "@/components/ui/input";
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
  const titleTooLong = title.length > MATERIAL_GROUP_TITLE_MAX_LENGTH;
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
              {title.length}/{MATERIAL_GROUP_TITLE_MAX_LENGTH}
            </span>
          </div>
          <Input
            aria-invalid={titleTooLong || undefined}
            aria-label="分组名称"
            autoFocus
            className={cn(
              titleTooLong && "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/15",
            )}
            disabled={isSubmitting}
            id={inputId}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                handleSubmit();
              }
            }}
            placeholder="请输入分组名称"
            value={title}
          />
          {titleTooLong ? (
            <p className="text-xs text-destructive" role="alert">
              分组名称不能超过10字
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
