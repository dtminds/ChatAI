import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  WorkflowVariableDefinition,
  WorkflowVariableSelector,
} from "./types";
import { WorkflowVariablePicker } from "./workflow-variable-picker";
import { WorkflowVariableValueTag } from "./workflow-variable-value-tag";
import {
  getWorkflowVariableDisplaySourceLabel,
  resolveWorkflowVariable,
} from "./workflow-variables";

export function WorkflowVariableSelect({
  ariaLabel,
  buttonClassName,
  disabled = false,
  invalidLabel = "原变量不可用",
  onSelect,
  placeholder = "选择变量",
  value,
  variables,
}: {
  ariaLabel: string;
  buttonClassName?: string;
  disabled?: boolean;
  invalidLabel?: string;
  onSelect: (variable: WorkflowVariableDefinition) => void;
  placeholder?: string;
  value?: WorkflowVariableSelector;
  variables: WorkflowVariableDefinition[];
}) {
  const [open, setOpen] = useState(false);
  const selectedVariable = value ? resolveWorkflowVariable(variables, value) : undefined;
  const hasInvalidValue = Boolean(value && !selectedVariable);

  return (
    <WorkflowVariablePicker
      onOpenChange={setOpen}
      onSelect={(variable) => {
        onSelect(variable);
        setOpen(false);
      }}
      open={open}
      variables={variables}
    >
      <Button
        aria-label={ariaLabel}
        className={cn(
          "h-9 w-full min-w-0 justify-between rounded-[8px] pl-1.5 pr-3 text-[13px] font-normal",
          buttonClassName,
        )}
        disabled={disabled}
        type="button"
        variant="outline"
      >
        <span className="flex min-w-0 flex-1 text-left">
          {selectedVariable ? (
            <WorkflowVariableValueTag
              label={selectedVariable.label}
              sourceLabel={getWorkflowVariableDisplaySourceLabel(selectedVariable)}
            />
          ) : (
            <span className="truncate text-muted-foreground">
              {hasInvalidValue ? invalidLabel : placeholder}
            </span>
          )}
        </span>
        <HugeiconsIcon
          aria-hidden="true"
          className="shrink-0 text-muted-foreground"
          icon={ArrowDown01Icon}
          size={14}
          strokeWidth={1.8}
        />
      </Button>
    </WorkflowVariablePicker>
  );
}
