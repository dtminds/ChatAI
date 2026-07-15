import { useState } from "react";
import {
  Add01Icon,
  ArrowDown01Icon,
  ArrowUp02Icon,
  Delete02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  addWorkflowBranchCondition,
  addWorkflowBranchPath,
  branchOperatorNeedsValue,
  getBranchOperatorOptions,
  getDefaultBranchOperator,
  getWorkflowBranchPaths,
  moveWorkflowBranchPath,
  removeWorkflowBranchCondition,
  removeWorkflowBranchPath,
  updateWorkflowBranchCondition,
  updateWorkflowBranchLogic,
  WORKFLOW_BRANCH_CONDITION_MAX,
  WORKFLOW_BRANCH_PATH_MAX,
} from "../../branch-paths";
import type {
  WorkflowBranchCondition,
  WorkflowBranchConditionValue,
  WorkflowBranchPath,
  WorkflowVariableDefinition,
  WorkflowVariableValueType,
} from "../../types";
import { WorkflowVariablePicker } from "../../workflow-variable-picker";
import {
  getAvailableVariablesForNode,
  getWorkflowVariableDisplayLabel,
  resolveWorkflowVariable,
} from "../../workflow-variables";
import type { NodeSettingsProps } from "../types";

export function BranchConfig({ edges, node, nodes, onNodeChange }: NodeSettingsProps<"branch">) {
  const [pendingDeletePath, setPendingDeletePath] = useState<WorkflowBranchPath | null>(null);
  const branchPaths = getWorkflowBranchPaths(node.data);
  const conditionalPaths = branchPaths.filter((path) => !path.isDefault);
  const fallbackPath = branchPaths.find((path) => path.isDefault)!;
  const variables = getAvailableVariablesForNode(node.id, nodes, edges)
    .filter((variable) => variable.type !== "object");

  const updateBranchPaths = (nextPaths: WorkflowBranchPath[]) => {
    onNodeChange({ branchPaths: nextPaths });
  };
  const updatePath = (nextPath: WorkflowBranchPath) => {
    updateBranchPaths(branchPaths.map((path) => path.id === nextPath.id ? nextPath : path));
  };
  const deletePath = (path: WorkflowBranchPath) => {
    updateBranchPaths(removeWorkflowBranchPath(branchPaths, path.id));
    setPendingDeletePath(null);
  };
  const requestDeletePath = (path: WorkflowBranchPath) => {
    const connected = edges.some((edge) => edge.source === node.id && edge.sourceHandle === path.id);
    if (connected) {
      setPendingDeletePath(path);
      return;
    }
    deletePath(path);
  };

  return (
    <div className="space-y-4">
      {conditionalPaths.map((path, index) => (
        <section className="space-y-3 rounded-[8px] border p-3" key={path.id}>
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-foreground">{path.label}</h3>
            <div className="flex items-center gap-1">
              <Button
                aria-label={`上移${path.label} ${index + 1}`}
                className="size-7 rounded-md"
                disabled={index === 0}
                onClick={() => updateBranchPaths(moveWorkflowBranchPath(branchPaths, path.id, "up"))}
                size="icon"
                type="button"
                variant="ghost"
              >
                <HugeiconsIcon icon={ArrowUp02Icon} size={14} strokeWidth={1.8} />
              </Button>
              <Button
                aria-label={`下移${path.label} ${index + 1}`}
                className="size-7 rounded-md"
                disabled={index === conditionalPaths.length - 1}
                onClick={() => updateBranchPaths(moveWorkflowBranchPath(branchPaths, path.id, "down"))}
                size="icon"
                type="button"
                variant="ghost"
              >
                <HugeiconsIcon icon={ArrowDown01Icon} size={14} strokeWidth={1.8} />
              </Button>
              <Button
                aria-label={`删除${path.label} ${index + 1}`}
                className="size-7 rounded-md text-destructive hover:text-destructive"
                disabled={conditionalPaths.length <= 1}
                onClick={() => requestDeletePath(path)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={1.8} />
              </Button>
            </div>
          </div>

          <div className={path.conditions.length > 1 ? "relative pl-8" : undefined}>
            {path.conditions.length > 1 ? (
              <>
                <span
                  aria-hidden="true"
                  className="absolute bottom-[18px] left-2 top-[18px] w-5 rounded-l-[8px] border-b border-l border-t border-border"
                />
                <Select
                  onValueChange={(value) => {
                    if (value === "all" || value === "any") {
                      updatePath(updateWorkflowBranchLogic(path, value));
                    }
                  }}
                  value={path.logic}
                >
                  <SelectTrigger
                    aria-label={`${path.label}条件关系`}
                    className="absolute left-2 top-1/2 z-10 size-6 -translate-x-1/2 -translate-y-1/2 justify-center rounded-[4px] bg-background p-0 text-xs shadow-none [&>svg]:hidden"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="center" className="min-w-16">
                    <SelectItem value="all">且</SelectItem>
                    <SelectItem value="any">或</SelectItem>
                  </SelectContent>
                </Select>
              </>
            ) : null}

            <div className="space-y-2">
              {path.conditions.map((condition, conditionIndex) => (
                <BranchConditionRow
                  condition={condition}
                  index={conditionIndex}
                  key={condition.id}
                  onChange={(patch) => updatePath(updateWorkflowBranchCondition(path, condition.id, patch))}
                  onDelete={() => updatePath(removeWorkflowBranchCondition(path, condition.id))}
                  showDelete={path.conditions.length > 1}
                  variables={variables}
                />
              ))}
            </div>
          </div>

          <Button
            className="h-auto justify-start gap-1 rounded-none p-0 text-xs text-primary hover:no-underline"
            disabled={path.conditions.length >= WORKFLOW_BRANCH_CONDITION_MAX}
            onClick={() => updatePath(addWorkflowBranchCondition(path))}
            type="button"
            variant="link"
          >
            <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={1.8} />
            添加条件
          </Button>
        </section>
      ))}

      <Button
        className="h-9 w-full rounded-[8px]"
        disabled={conditionalPaths.length >= WORKFLOW_BRANCH_PATH_MAX}
        onClick={() => updateBranchPaths(addWorkflowBranchPath(branchPaths))}
        type="button"
        variant="outline"
      >
        <HugeiconsIcon icon={Add01Icon} size={15} strokeWidth={1.8} />
        添加分支
      </Button>

      <section className="rounded-[8px] border px-3 py-3">
        <h3 className="text-sm font-semibold text-foreground">{fallbackPath.label}</h3>
        <p className="mt-1 text-xs text-muted-foreground">不满足以上条件</p>
      </section>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) setPendingDeletePath(null);
        }}
        open={Boolean(pendingDeletePath)}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除分支</AlertDialogTitle>
            <AlertDialogDescription>删除后，该分支对应的下游连线也会被删除</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDeletePath) deletePath(pendingDeletePath);
              }}
              variant="destructive"
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function BranchConditionRow({
  condition,
  index,
  onChange,
  onDelete,
  showDelete,
  variables,
}: {
  condition: WorkflowBranchCondition;
  index: number;
  onChange: (patch: Partial<WorkflowBranchCondition>) => void;
  onDelete: () => void;
  showDelete: boolean;
  variables: WorkflowVariableDefinition[];
}) {
  const [variablePickerOpen, setVariablePickerOpen] = useState(false);
  const variable = condition.selector ? resolveWorkflowVariable(variables, condition.selector) : undefined;
  const operatorOptions = getBranchOperatorOptions(variable?.type);

  return (
    <div className="space-y-2 rounded-[8px] bg-secondary/50 p-2.5">
      <div className="grid grid-cols-[minmax(0,1fr)_8.5rem_2rem] gap-2">
        <WorkflowVariablePicker
          onOpenChange={setVariablePickerOpen}
          onSelect={(nextVariable) => {
            const operator = getDefaultBranchOperator(nextVariable.type);
            onChange({
              operator,
              selector: nextVariable.selector,
              value: getDefaultConditionValue(nextVariable.type, operator),
            });
            setVariablePickerOpen(false);
          }}
          open={variablePickerOpen}
          variables={variables}
        >
          <Button
            aria-label={`条件 ${index + 1} 变量`}
            className="h-9 min-w-0 justify-between rounded-[8px] px-3 text-[13px] font-normal"
            type="button"
            variant="outline"
          >
            <span className={variable ? "truncate" : "truncate text-muted-foreground"}>
              {variable ? getWorkflowVariableDisplayLabel(variable) : "选择变量"}
            </span>
            <HugeiconsIcon icon={ArrowDown01Icon} size={14} strokeWidth={1.8} />
          </Button>
        </WorkflowVariablePicker>

        <Select
          disabled={!variable}
          onValueChange={(value) => {
            const operator = value as WorkflowBranchCondition["operator"];
            onChange({
              operator,
              value: getDefaultConditionValue(variable?.type, operator),
            });
          }}
          value={operatorOptions.some((option) => option.value === condition.operator)
            ? condition.operator
            : undefined}
        >
          <SelectTrigger
            aria-label={`条件 ${index + 1} 判断`}
            className="h-9 w-full rounded-[8px] text-[13px]"
          >
            <SelectValue placeholder="选择判断" />
          </SelectTrigger>
          <SelectContent>
            {operatorOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          aria-label={`删除条件 ${index + 1}`}
          className="size-8 rounded-md text-destructive hover:text-destructive"
          disabled={!showDelete}
          onClick={onDelete}
          size="icon"
          type="button"
          variant="ghost"
        >
          <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={1.8} />
        </Button>
      </div>

      {variable && branchOperatorNeedsValue(condition.operator) ? (
        <ConditionValueField
          condition={condition}
          onChange={(value) => onChange({ value })}
          type={variable.type}
        />
      ) : null}
    </div>
  );
}

function ConditionValueField({
  condition,
  onChange,
  type,
}: {
  condition: WorkflowBranchCondition;
  onChange: (value: WorkflowBranchConditionValue) => void;
  type: WorkflowVariableValueType;
}) {
  if (condition.operator === "datetime-between") {
    const value = Array.isArray(condition.value) ? condition.value : ["", ""];
    return (
      <div className="grid grid-cols-2 gap-2">
        <DateTimePicker
          aria-label="开始时间"
          className="text-[13px]"
          onValueChange={(nextValue) => onChange([nextValue, value[1]])}
          value={value[0]}
        />
        <DateTimePicker
          aria-label="结束时间"
          className="text-[13px]"
          onValueChange={(nextValue) => onChange([value[0], nextValue])}
          value={value[1]}
        />
      </div>
    );
  }
  if (type === "datetime") {
    return (
      <DateTimePicker
        aria-label="比较时间"
        className="text-[13px]"
        onValueChange={onChange}
        value={typeof condition.value === "string" ? condition.value : ""}
      />
    );
  }
  if (type === "number") {
    return (
      <Input
        aria-label="比较值"
        className="h-9 rounded-[8px] px-3 text-[13px]"
        onChange={(event) => {
          const value = event.target.value;
          onChange(value === "" ? "" : Number(value));
        }}
        placeholder="输入数值"
        type="number"
        value={typeof condition.value === "number" ? condition.value : ""}
      />
    );
  }
  return (
    <Input
      aria-label="比较值"
      className="h-9 rounded-[8px] px-3 text-[13px]"
      onChange={(event) => onChange(event.target.value)}
      placeholder="输入比较值"
      value={typeof condition.value === "string" ? condition.value : ""}
    />
  );
}

function getDefaultConditionValue(
  type: WorkflowVariableValueType | undefined,
  operator: WorkflowBranchCondition["operator"],
): WorkflowBranchConditionValue | undefined {
  if (!branchOperatorNeedsValue(operator)) return undefined;
  if (operator === "datetime-between") return ["", ""];
  if (type === "number") return "";
  return "";
}
