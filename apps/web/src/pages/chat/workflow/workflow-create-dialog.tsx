import type { WorkflowType } from "@chatai/contracts";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";

export type WorkflowCreateInput = {
  description: string;
  name: string;
  workflowType: Extract<WorkflowType, "chatai_sop" | "wecom_sop">;
};

const workflowTypeOptions: Array<{
  description: string;
  label: string;
  value: WorkflowCreateInput["workflowType"];
}> = [
  {
    description: "支持消息、Agent 和 ChatAI 相关节点",
    label: "ChatAI SOP",
    value: "chatai_sop",
  },
  {
    description: "面向企微客户的营销自动化",
    label: "企微客户 SOP",
    value: "wecom_sop",
  },
];

export function WorkflowCreateDialog({
  error,
  onCreate,
  onOpenChange,
  onWorkflowTypeChange,
  open,
  pending = false,
}: {
  error?: string | null;
  onCreate: (input: WorkflowCreateInput) => Promise<boolean>;
  onOpenChange: (open: boolean) => void;
  onWorkflowTypeChange?: () => void;
  open: boolean;
  pending?: boolean;
}) {
  const fieldId = useId();
  const nameId = `${fieldId}-name`;
  const descriptionId = `${fieldId}-description`;
  const [nameValue, setNameValue] = useState("");
  const [descriptionValue, setDescriptionValue] = useState("");
  const [workflowType, setWorkflowType] = useState<WorkflowCreateInput["workflowType"] | null>(null);

  useEffect(() => {
    if (!open) return;
    setNameValue("");
    setDescriptionValue("");
    setWorkflowType(null);
  }, [open]);

  const submit = async () => {
    const name = nameValue.trim();
    if (!name || !workflowType) return;

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
      <DialogContent aria-describedby={undefined} closeButtonDisabled={pending}>
        <DialogHeader>
          <DialogTitle>新建 Workflow</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Workflow 类型</legend>
            <RadioGroup
              className="grid gap-2"
              onValueChange={(value) => {
                const nextWorkflowType = value as WorkflowCreateInput["workflowType"];
                if (nextWorkflowType !== workflowType) onWorkflowTypeChange?.();
                setWorkflowType(nextWorkflowType);
              }}
              value={workflowType ?? undefined}
            >
              {workflowTypeOptions.map((option) => (
                <label
                  className="flex cursor-pointer items-start gap-3 rounded-lg border bg-background p-3 hover:bg-accent/50 has-[[data-state=checked]]:border-primary"
                  key={option.value}
                >
                  <RadioGroupItem className="mt-0.5" disabled={pending} value={option.value} />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{option.label}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{option.description}</span>
                  </span>
                </label>
              ))}
            </RadioGroup>
          </fieldset>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <label className="text-sm font-medium" htmlFor={nameId}>Workflow 名称</label>
              <span className="text-xs text-muted-foreground">{nameValue.length}/100</span>
            </div>
            <Input
              autoFocus
              id={nameId}
              maxLength={100}
              onChange={(event) => setNameValue(event.target.value)}
              readOnly={pending}
              value={nameValue}
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <label className="text-sm font-medium" htmlFor={descriptionId}>Workflow 描述</label>
              <span className="text-xs text-muted-foreground">{descriptionValue.length}/1000</span>
            </div>
            <Textarea
              id={descriptionId}
              maxLength={1000}
              onChange={(event) => setDescriptionValue(event.target.value)}
              placeholder="填写 Workflow 的用途或目标"
              readOnly={pending}
              value={descriptionValue}
            />
          </div>
          {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
          <DialogFooter>
            <Button disabled={!nameValue.trim() || !workflowType || pending} type="submit">
              {pending ? "创建中" : "创建"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
