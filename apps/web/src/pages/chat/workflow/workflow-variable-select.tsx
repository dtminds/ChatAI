import { ArrowDown01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  WorkflowVariableDefinition,
  WorkflowVariableSelector,
} from "./types";
import {
  WorkflowVariablePicker,
  type WorkflowCustomFieldVisibility,
} from "./workflow-variable-picker";
import { WorkflowVariableValueTag } from "./workflow-variable-value-tag";
import {
  getWorkflowVariableDisplaySourceLabel,
  resolveWorkflowVariable,
} from "./workflow-variables";

export function WorkflowVariableSelect({
  ariaLabel,
  buttonClassName,
  customFieldVisibility,
  disabled = false,
  invalidLabel = "原变量不可用",
  onClear,
  onSelect,
  placeholder = "选择变量",
  value,
  variables,
}: {
  ariaLabel: string;
  buttonClassName?: string;
  customFieldVisibility: WorkflowCustomFieldVisibility;
  disabled?: boolean;
  invalidLabel?: string;
  onClear?: () => void;
  onSelect: (variable: WorkflowVariableDefinition) => void;
  placeholder?: string;
  value?: WorkflowVariableSelector;
  variables: WorkflowVariableDefinition[];
}) {
  const [open, setOpen] = useState(false);
  const selectedVariable = value ? resolveWorkflowVariable(variables, value) : undefined;
  const hasInvalidValue = Boolean(value && !selectedVariable);
  const showClear = Boolean(value && onClear);

  const trigger = (
    <WorkflowVariablePicker
      customFieldVisibility={customFieldVisibility}
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
        <span className={cn("flex min-w-0 flex-1 text-left", showClear && "pr-8")}>
          {selectedVariable ? (
            <WorkflowVariableValueTag
              label={selectedVariable.label}
              sourceLabel={getWorkflowVariableDisplaySourceLabel(selectedVariable)}
            />
          ) : (
            <span className="truncate pl-1.5 text-muted-foreground">
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

  if (!showClear) return trigger;

  return (
    <div className="relative min-w-0 w-full">
      {trigger}
      <Button
        aria-label={`清除${ariaLabel}`}
        className="absolute right-8 top-1/2 z-10 size-7 -translate-y-1/2 p-0 text-muted-foreground hover:bg-accent hover:text-foreground"
        disabled={disabled}
        onClick={() => {
          setOpen(false);
          onClear?.();
        }}
        size="sm"
        type="button"
        variant="ghost"
      >
        <HugeiconsIcon aria-hidden="true" icon={Cancel01Icon} size={13} strokeWidth={1.8} />
      </Button>
    </div>
  );
}
