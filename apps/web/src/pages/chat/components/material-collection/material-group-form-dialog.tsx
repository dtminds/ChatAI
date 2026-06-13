import { useEffect, useId, useState } from "react";
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

  useEffect(() => {
    if (open) {
      setTitle(initialTitle);
    }
  }, [initialTitle, open]);

  const normalizedTitle = title.trim();
  const dialogTitle = mode === "edit" ? "编辑分组" : "新建分组";
  const submitLabel = mode === "edit" ? "保存" : "新建";

  function handleSubmit() {
    if (!normalizedTitle) {
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
          <Label htmlFor={inputId}>分组名称</Label>
          <Input
            aria-label="分组名称"
            autoFocus
            disabled={isSubmitting}
            id={inputId}
            maxLength={MATERIAL_GROUP_TITLE_MAX_LENGTH}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                handleSubmit();
              }
            }}
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
            disabled={isSubmitting || !normalizedTitle}
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
