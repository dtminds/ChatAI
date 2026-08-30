import {
  WORKFLOW_DESCRIPTION_MAX_LENGTH,
  WORKFLOW_NAME_MAX_LENGTH,
  type WorkflowType,
} from "@chatai/contracts";
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export type WorkflowCreateInput = {
  description: string;
  name: string;
  workflowType: WorkflowType;
};

export function WorkflowCreateDialog({
  onCreate,
  onOpenChange,
  open,
  pending = false,
  workflowType,
}: {
  onCreate: (input: WorkflowCreateInput) => Promise<boolean>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  pending?: boolean;
  workflowType: WorkflowCreateInput["workflowType"];
}) {
  const fieldId = useId();
  const nameId = `${fieldId}-name`;
  const descriptionId = `${fieldId}-description`;
  const [nameValue, setNameValue] = useState("");
  const [descriptionValue, setDescriptionValue] = useState("");

  useEffect(() => {
    if (!open) return;
    setNameValue("");
    setDescriptionValue("");
  }, [open]);

  const submit = async () => {
    const name = nameValue.trim();
    if (!name) return;

    await onCreate({
      description: descriptionValue.trim(),
      name,
      workflowType,
    });
  };

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (!pending) onOpenChange(nextOpen);
      }}
      open={open}
    >
      <DialogContent
        aria-describedby={undefined}
        closeButtonDisabled={pending}
      >
        <DialogHeader>
          <DialogTitle>新建工作流</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <label className="text-sm font-medium" htmlFor={nameId}>工作流名称</label>
              <span className="text-xs text-muted-foreground">
                {nameValue.length}/{WORKFLOW_NAME_MAX_LENGTH}
              </span>
            </div>
            <Input
              autoFocus
              id={nameId}
              maxLength={WORKFLOW_NAME_MAX_LENGTH}
              onChange={(event) => setNameValue(event.target.value)}
              readOnly={pending}
              value={nameValue}
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <label className="text-sm font-medium" htmlFor={descriptionId}>备注</label>
              <span className="text-xs text-muted-foreground">
                {descriptionValue.length}/{WORKFLOW_DESCRIPTION_MAX_LENGTH}
              </span>
            </div>
            <Textarea
              id={descriptionId}
              maxLength={WORKFLOW_DESCRIPTION_MAX_LENGTH}
              onChange={(event) => setDescriptionValue(event.target.value)}
              placeholder="填写备注"
              readOnly={pending}
              value={descriptionValue}
            />
          </div>
          <DialogFooter>
            <Button disabled={!nameValue.trim() || pending} type="submit">
              {pending ? "创建中" : "创建"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
