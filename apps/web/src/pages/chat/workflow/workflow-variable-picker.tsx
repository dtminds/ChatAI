import { useMemo, useState, type ReactNode } from "react";
import {
  InputCursorTextIcon,
  Search01Icon,
  UserIcon,
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
import { Input } from "@/components/ui/input";
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
  const [query, setQuery] = useState("");
  const filteredVariables = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return normalizedQuery
      ? variables.filter((variable) =>
          `${variable.label} ${variable.sourceNodeTitle ?? ""} ${variable.selector.join(".")} ${
            variable.scope === "current-node-lifecycle" ? "当前节点" : ""
          }`
            .toLowerCase()
            .includes(normalizedQuery))
      : variables;
  }, [query, variables]);

  return (
    <DropdownMenu
      modal={false}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) setQuery("");
      }}
      open={open}
    >
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 p-0" sideOffset={6}>
        <div className="p-2">
          <div className="relative">
            <HugeiconsIcon
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              icon={Search01Icon}
              size={14}
              strokeWidth={1.8}
            />
            <Input
              aria-label="搜索变量"
              className="h-8 pl-8 text-xs"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => event.stopPropagation()}
              placeholder="搜索"
              value={query}
              variant="soft"
            />
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto p-1">
          <VariableOptions variables={filteredVariables} onSelect={onSelect} />
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

  const contextVariableGroups = contextScopes.flatMap((scope) => {
    const scoped = variables.filter((variable) =>
      variable.scope === scope && !variable.sourceNodeId);
    return scoped.length ? [{ scope, variables: scoped }] : [];
  });
  const nodeVariableGroups = groupNodeVariables(
    variables.filter((variable) => variable.sourceNodeId && variable.sourceNodeTitle),
  );

  return (
    <>
      {contextVariableGroups.map(group => (
        <VariableGroupSubMenu
          icon={scopeIcons[group.scope]}
          key={group.scope}
          label={scopeLabels[group.scope]}
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
            key={group.sourceNodeId}
            label={group.isCurrentNode
              ? `${group.sourceNodeTitle}（当前节点）`
              : group.sourceNodeTitle}
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
  label,
  onSelect,
  showNodeSections = false,
  variables,
}: {
  icon?: typeof UserIcon;
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
      <DropdownMenuSubTrigger onClick={() => setOpen(true)}>
        {icon ? (
          <span className="flex size-5 shrink-0 items-center justify-center text-muted-foreground">
            <HugeiconsIcon
              color="currentColor"
              icon={icon}
              size={13}
              strokeWidth={1.8}
            />
          </span>
        ) : null}
        <span className="min-w-0 flex-1 truncate">{label}</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-56">
        {outputVariables.length && showNodeSections
          ? (
              <DropdownMenuLabel className="px-2.5 pb-1 pt-1.5 text-[11px] font-normal text-muted-foreground/60">
                节点输出
              </DropdownMenuLabel>
            )
          : null}
        {renderVariableItems(outputVariables, onSelect)}
        {attributeVariables.length
          ? (
              <DropdownMenuLabel className="px-2.5 pb-1 pt-2 text-[11px] font-normal text-muted-foreground/60">
                节点属性
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
      className="min-w-0"
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

const contextScopes = ["input", "subject"] as const;
type ContextScope = typeof contextScopes[number];

const scopeLabels: Record<ContextScope, string> = {
  input: "输入参数",
  subject: "主体变量",
};

const scopeIcons = {
  input: InputCursorTextIcon,
  subject: UserIcon,
} satisfies Record<ContextScope, typeof UserIcon>;
