import { useCallback, useState } from "react";
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
import { CHUNK_FIRST_FIELD_MAX_LENGTH, CHUNK_SECOND_FIELD_MAX_LENGTH, useDialogSubmit } from "./shared";

export function AddChunkDialog({
  dialogTitle,
  fieldIdPrefix,
  firstFieldLabel,
  onOpenChange,
  onSubmit,
  open,
  secondFieldLabel,
}: {
  dialogTitle: string;
  fieldIdPrefix: string;
  firstFieldLabel: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: { first: string; second: string }) => void | Promise<void>;
  open: boolean;
  secondFieldLabel: string;
}) {
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");

  const reset = useCallback(() => {
    setFirst("");
    setSecond("");
  }, []);

  const { handleOpenChange, runSubmit, submitting } = useDialogSubmit({
    onOpenChange,
    onReset: reset,
    open,
  });

  function handleSubmit() {
    void runSubmit(async () => {
      const normalizedFirst = first.trim();
      const normalizedSecond = second.trim();

      if (!normalizedFirst || !normalizedSecond) {
        return false;
      }

      await onSubmit({ first: normalizedFirst, second: normalizedSecond });
    });
  }

  const firstFieldId = `${fieldIdPrefix}-first`;
  const secondFieldId = `${fieldIdPrefix}-second`;

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="max-w-[760px]">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-3">
          <div className="space-y-2">
            <Label htmlFor={firstFieldId}>
              {firstFieldLabel} <span className="text-destructive">*</span>
            </Label>
            <Textarea
              className="min-h-0 resize-none"
              id={firstFieldId}
              maxLength={CHUNK_FIRST_FIELD_MAX_LENGTH}
              onChange={(event) => setFirst(event.target.value)}
              placeholder="请输入"
              rows={2}
              value={first}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor={secondFieldId}>
                {secondFieldLabel} <span className="text-destructive">*</span>
              </Label>
              <span className="text-xs text-muted-foreground">
                {second.length}/{CHUNK_SECOND_FIELD_MAX_LENGTH}
              </span>
            </div>
            <Textarea
              className="min-h-[320px] resize-y"
              id={secondFieldId}
              maxLength={CHUNK_SECOND_FIELD_MAX_LENGTH}
              onChange={(event) => setSecond(event.target.value)}
              placeholder="请输入"
              value={second}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button disabled={submitting} onClick={() => handleOpenChange(false)} type="button" variant="outline">
            取消
          </Button>
          <Button
            disabled={submitting || !first.trim() || !second.trim()}
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
