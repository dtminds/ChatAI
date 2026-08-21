import { useState, type ReactNode } from "react";
import {
  Globe02Icon,
  InputCursorTextIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { nodeVisuals } from "./node-definitions";
import type {
  WorkflowVariableDefinition,
} from "./types";
import { getWorkflowOutputTypeLabel } from "./workflow-node-outputs";

export function WorkflowVariablePicker({
  children,
  onOpenChange,
  onSelect,
  open,
  variables,
}: {
  children: ReactNode;
  onOpenChange: (open: boolean) => void;
  onSelect: (variable: WorkflowVariableDefinition) => void;
  open: boolean;
  variables: WorkflowVariableDefinition[];
}) {
  return (
    <DropdownMenu
      modal={false}
      onOpenChange={onOpenChange}
      open={open}
    >
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 p-0" sideOffset={6}>
        <div className="max-h-72 overflow-y-auto p-1">
          <VariableOptions variables={variables} onSelect={onSelect} />
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function VariableOptions({ variables, onSelect }: {
  variables: WorkflowVariableDefinition[];
  onSelect: (variable: WorkflowVariableDefinition) => void;
}) {
  if (!variables.length) {
    return <p className="px-3 py-6 text-center text-sm text-muted-foreground">暂无可用变量</p>;
  }

  const contextVariableGroups = [
    {
      icon: InputCursorTextIcon,
      key: "input",
      label: "输入参数",
      variables: variables.filter(variable =>
        variable.scope === "input" && !variable.sourceNodeId),
    },
    {
      icon: Globe02Icon,
      key: "global",
      label: "全局变量",
      variables: variables.filter(variable =>
        (variable.scope === "subject" || variable.scope === "trigger")
        && !variable.sourceNodeId),
    },
  ].filter(group => group.variables.length);
  const nodeVariableGroups = groupNodeVariables(
    variables.filter((variable) => variable.sourceNodeId && variable.sourceNodeTitle),
  );

  return (
    <>
      {contextVariableGroups.map(group => (
        <VariableGroupSubMenu
          icon={group.icon}
          key={group.key}
          label={group.label}
          onSelect={onSelect}
          variables={group.variables}
        />
      ))}

      {contextVariableGroups.length && nodeVariableGroups.length
        ? <DropdownMenuSeparator />
        : null}

      {nodeVariableGroups.map((group) => {
        const visual = group.sourceNodeKind ? nodeVisuals[group.sourceNodeKind] : undefined;

        return (
          <VariableGroupSubMenu
            icon={visual?.icon}
            isCurrentNode={group.isCurrentNode}
            key={group.sourceNodeId}
            label={group.sourceNodeTitle}
            onSelect={onSelect}
            showNodeSections
            variables={group.variables}
          />
        );
      })}
    </>
  );
}

function VariableGroupSubMenu({
  icon,
  isCurrentNode = false,
  label,
  onSelect,
  showNodeSections = false,
  variables,
}: {
  icon?: typeof Globe02Icon;
  isCurrentNode?: boolean;
  label: string;
  onSelect: (variable: WorkflowVariableDefinition) => void;
  showNodeSections?: boolean;
  variables: WorkflowVariableDefinition[];
}) {
  const [open, setOpen] = useState(false);
  const outputVariables = showNodeSections
    ? variables.filter(variable => !isNodeLifecycleVariable(variable))
    : variables;
  const attributeVariables = showNodeSections
    ? variables.filter(isNodeLifecycleVariable)
    : [];

  return (
    <DropdownMenuSub onOpenChange={setOpen} open={open}>
      <DropdownMenuSubTrigger
        className="h-7 gap-1.5 px-2"
        indicatorClassName="!size-3.5 text-muted-foreground/60"
        onClick={() => setOpen(true)}
      >
        {icon ? (
          <span className="flex size-4.5 shrink-0 items-center justify-center text-muted-foreground">
            <HugeiconsIcon
              className="!size-3.5"
              color="currentColor"
              icon={icon}
              size={14}
              strokeWidth={1.6}
            />
          </span>
        ) : null}
        <span className="min-w-0 flex-1 truncate">
          {label}
          {isCurrentNode
            ? <span className="text-muted-foreground/70">（当前节点）</span>
            : null}
        </span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-56">
        {outputVariables.length && showNodeSections
          ? (
              <DropdownMenuLabel className="px-2 pb-0.5 pt-1 text-[11px] font-normal text-muted-foreground/60">
                节点输出
              </DropdownMenuLabel>
            )
          : null}
        {renderVariableItems(outputVariables, onSelect)}
        {attributeVariables.length
          ? (
              <DropdownMenuLabel className="px-2 pb-0.5 pt-1.5 text-[11px] font-normal text-muted-foreground/60">
                节点事件
              </DropdownMenuLabel>
            )
          : null}
        {renderVariableItems(attributeVariables, onSelect)}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

function renderVariableItems(
  variables: WorkflowVariableDefinition[],
  onSelect: (variable: WorkflowVariableDefinition) => void,
) {
  return variables.map(variable => (
    <DropdownMenuItem
      className="h-7 min-w-0 gap-1.5 px-2"
      key={variable.selector.join(".")}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onSelect(variable);
      }}
      onPointerDown={(event) => {
        event.preventDefault();
        onSelect(variable);
      }}
    >
      <span className="min-w-0 flex-1 truncate">{variable.label}</span>
      <span className="shrink-0 text-[11px] text-muted-foreground/70">
        {getWorkflowOutputTypeLabel(variable.valueType)}
      </span>
    </DropdownMenuItem>
  ));
}

function isNodeLifecycleVariable(variable: WorkflowVariableDefinition) {
  return variable.scope === "current-node-lifecycle" || variable.scope === "node-lifecycle";
}

function groupNodeVariables(variables: WorkflowVariableDefinition[]) {
  const groups = new Map<string, {
    sourceNodeId: string;
    sourceNodeKind: WorkflowVariableDefinition["sourceNodeKind"];
    sourceNodeTitle: string;
    isCurrentNode: boolean;
    variables: WorkflowVariableDefinition[];
  }>();

  variables.forEach((variable) => {
    if (!variable.sourceNodeId || !variable.sourceNodeTitle) return;

    const current = groups.get(variable.sourceNodeId);
    if (current) {
      current.isCurrentNode ||= variable.scope === "current-node-lifecycle";
      current.variables.push(variable);
      return;
    }

    groups.set(variable.sourceNodeId, {
      sourceNodeId: variable.sourceNodeId,
      sourceNodeKind: variable.sourceNodeKind,
      sourceNodeTitle: variable.sourceNodeTitle,
      isCurrentNode: variable.scope === "current-node-lifecycle",
      variables: [variable],
    });
  });

  return [...groups.values()];
}
