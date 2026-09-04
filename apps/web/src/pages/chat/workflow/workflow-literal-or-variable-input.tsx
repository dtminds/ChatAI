import { Cancel01Icon, Settings03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { cn } from "@/lib/utils";
import type {
  WorkflowOutputValueType,
  WorkflowVariableDefinition,
  WorkflowVariableSelector,
} from "./types";
import {
  WorkflowVariablePicker,
  type WorkflowCustomFieldVisibility,
} from "./workflow-variable-picker";
import { WorkflowVariableValueTag } from "./workflow-variable-value-tag";
import {
  getWorkflowVariableDisplayLabel,
  getWorkflowVariableDisplaySourceLabel,
  resolveWorkflowVariable,
} from "./workflow-variables";

export type WorkflowLiteralOrVariableValue =
  | { kind: "literal"; value: string }
  | {
    kind: "variable";
    selector: WorkflowVariableSelector;
    valueType: WorkflowOutputValueType;
  };

export function WorkflowLiteralOrVariableInput({
  ariaLabel,
  className,
  clearVariableAriaLabel = "改为固定内容",
  customFieldVisibility,
  disabled = false,
  inputClassName,
  inputMode,
  inputType = "text",
  leadingAddon,
  literalControl,
  onChange,
  placeholder,
  showVariablePicker = true,
  value,
  variables,
}: {
  ariaLabel: string;
  className?: string;
  clearVariableAriaLabel?: string;
  customFieldVisibility: WorkflowCustomFieldVisibility;
  disabled?: boolean;
  inputClassName?: string;
  inputMode?: ComponentPropsWithoutRef<"input">["inputMode"];
  inputType?: ComponentPropsWithoutRef<"input">["type"];
  leadingAddon?: ReactNode;
  literalControl?: ReactNode;
  onChange: (value: WorkflowLiteralOrVariableValue) => void;
  placeholder: string;
  showVariablePicker?: boolean;
  value: WorkflowLiteralOrVariableValue;
  variables: WorkflowVariableDefinition[];
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const selectedVariable = value.kind === "variable"
    ? resolveWorkflowVariable(variables, value.selector)
    : undefined;
  const variableLabel = selectedVariable
    ? getWorkflowVariableDisplayLabel(selectedVariable)
    : "原变量不可用";

  return (
    <div className={cn("relative min-w-0", className)}>
      {value.kind === "literal" && literalControl ? literalControl : (
        <InputGroup className="h-9">
          {leadingAddon ? (
            <InputGroupAddon align="inline-start" className="pl-3">
              {leadingAddon}
            </InputGroupAddon>
          ) : null}
          <InputGroupInput
            aria-label={ariaLabel}
            className={cn(
              "min-w-0 pr-16 text-xs",
              leadingAddon ? "pl-2" : "pl-3",
              inputClassName,
              value.kind === "variable" && "caret-transparent text-transparent",
            )}
            disabled={disabled}
            inputMode={value.kind === "literal" ? inputMode : undefined}
            onChange={(event) => onChange({ kind: "literal", value: event.target.value })}
            placeholder={placeholder}
            readOnly={value.kind === "variable"}
            type={value.kind === "variable" ? "text" : inputType}
            value={value.kind === "variable" ? variableLabel : value.value}
          />
          {value.kind === "variable" ? (
            <div
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute inset-y-1 right-16 flex min-w-0 items-center",
                leadingAddon ? "left-9" : "left-1.5",
              )}
            >
              <WorkflowVariableValueTag
                label={selectedVariable?.label ?? variableLabel}
                sourceLabel={selectedVariable
                  ? getWorkflowVariableDisplaySourceLabel(selectedVariable)
                  : undefined}
              />
            </div>
          ) : null}
        </InputGroup>
      )}

      {value.kind === "variable" ? (
        <Button
          aria-label={clearVariableAriaLabel}
          className="absolute right-8 top-1/2 size-7 -translate-y-1/2 p-0 text-muted-foreground hover:bg-accent hover:text-foreground"
          disabled={disabled}
          onClick={() => onChange({ kind: "literal", value: "" })}
          size="sm"
          type="button"
          variant="ghost"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={13} strokeWidth={1.8} />
        </Button>
      ) : null}

      {showVariablePicker ? (
        <WorkflowVariablePicker
          customFieldVisibility={customFieldVisibility}
          onOpenChange={setPickerOpen}
          onSelect={(variable) => {
            onChange({
              kind: "variable",
              selector: variable.selector,
              valueType: variable.valueType,
            });
            setPickerOpen(false);
          }}
          open={pickerOpen}
          variables={variables}
        >
          <Button
            aria-label="引用变量"
            className="absolute right-1 top-1/2 size-7 -translate-y-1/2 p-0 text-muted-foreground hover:bg-accent hover:text-foreground"
            disabled={disabled}
            size="sm"
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon icon={Settings03Icon} size={14} strokeWidth={1.8} />
          </Button>
        </WorkflowVariablePicker>
      ) : null}
    </div>
  );
}
