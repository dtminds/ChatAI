import { useState, type ReactNode } from "react";
import {
  getWorkflowCustomFieldVariableId,
  getWorkflowCustomFieldVariableValueType,
} from "@chatai/contracts";
import {
  Globe02Icon,
  InputCursorTextIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Spinner } from "@/components/ui/spinner";
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
import { useWorkflowCustomFieldResourceContext } from "./workflow-custom-field-resource";

export type WorkflowCustomFieldVisibility = "all" | "compatible" | "hidden";

export function WorkflowVariablePicker({
  children,
  customFieldVisibility,
  onOpenChange,
  onSelect,
  open,
  variables,
}: {
  children: ReactNode;
  customFieldVisibility: WorkflowCustomFieldVisibility;
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
          <VariableOptions
            customFieldVisibility={customFieldVisibility}
            onSelect={onSelect}
            variables={variables}
          />
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function VariableOptions({ customFieldVisibility, variables, onSelect }: {
  customFieldVisibility: WorkflowCustomFieldVisibility;
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
          customFieldVisibility={customFieldVisibility}
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
            customFieldVisibility={customFieldVisibility}
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
  customFieldVisibility,
  icon,
  isCurrentNode = false,
  label,
  onSelect,
  showNodeSections = false,
  variables,
}: {
  customFieldVisibility: WorkflowCustomFieldVisibility;
  icon?: typeof Globe02Icon;
  isCurrentNode?: boolean;
  label: string;
  onSelect: (variable: WorkflowVariableDefinition) => void;
  showNodeSections?: boolean;
  variables: WorkflowVariableDefinition[];
}) {
  const [open, setOpen] = useState(false);
  const customFieldResource = useWorkflowCustomFieldResourceContext();
  const isGlobalGroup = variables.some(variable =>
    variable.scope === "subject" || variable.scope === "trigger");
  const customFieldVariables = isGlobalGroup
    ? variables.filter(variable =>
        getWorkflowCustomFieldVariableId(variable.selector) !== null)
    : [];
  const outputVariables = showNodeSections
    ? variables.filter(variable => !isNodeLifecycleVariable(variable))
    : variables.filter(variable =>
        getWorkflowCustomFieldVariableId(variable.selector) === null);
  const attributeVariables = showNodeSections
    ? variables.filter(isNodeLifecycleVariable)
    : [];
  const showCustomFieldSection = isGlobalGroup
    && customFieldVisibility !== "hidden"
    && (
      customFieldVariables.length > 0
      || customFieldResource.status === "loading"
      || customFieldResource.status === "error"
      || (customFieldVisibility === "all" && customFieldResource.status === "ready")
    );

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
      <DropdownMenuSubContent className="max-h-[min(24rem,var(--radix-dropdown-menu-content-available-height))] w-56 overflow-x-hidden overflow-y-auto">
        {outputVariables.length && showNodeSections
          ? (
              <DropdownMenuLabel className="px-2 pb-0.5 pt-1 text-[11px] font-normal text-muted-foreground/60">
                节点输出
              </DropdownMenuLabel>
            )
          : null}
        {renderVariableItems(outputVariables, onSelect)}
        {showCustomFieldSection
          ? (
              <>
                <DropdownMenuLabel className="mt-1 border-t border-border/60 px-2 pb-0.5 pt-2 text-[11px] font-normal text-muted-foreground/60">
                  客户自定义属性
                </DropdownMenuLabel>
                <CustomFieldVariableItems
                  onSelect={onSelect}
                  showUnsupported={customFieldVisibility === "all"}
                  variables={customFieldVariables}
                />
              </>
            )
          : null}
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

function CustomFieldVariableItems({
  onSelect,
  showUnsupported,
  variables,
}: {
  onSelect: (variable: WorkflowVariableDefinition) => void;
  showUnsupported: boolean;
  variables: WorkflowVariableDefinition[];
}) {
  const resource = useWorkflowCustomFieldResourceContext();
  if (variables.length === 0
    && (resource.status === "loading" || resource.status === "idle")) {
    return (
      <DropdownMenuItem disabled>
        <Spinner size={12} />
        <span>正在加载</span>
      </DropdownMenuItem>
    );
  }
  if (variables.length === 0 && resource.status === "error") {
    return (
      <DropdownMenuItem
        onSelect={(event) => {
          event.preventDefault();
          resource.reload();
        }}
      >
        加载失败，重新加载
      </DropdownMenuItem>
    );
  }

  const unsupportedFields = showUnsupported && resource.status === "ready"
    ? resource.fields.filter(field =>
        getWorkflowCustomFieldVariableValueType(field.type) === null)
    : [];
  if (variables.length === 0 && unsupportedFields.length === 0) {
    return <DropdownMenuItem disabled>暂无数据</DropdownMenuItem>;
  }

  return (
    <>
      {renderVariableItems(variables, onSelect)}
      {unsupportedFields.map(field => (
        <DropdownMenuItem disabled key={field.id}>
          <span className="min-w-0 flex-1 truncate">{field.title}</span>
          <span className="shrink-0 text-[11px] text-muted-foreground/70">
            暂不支持
          </span>
        </DropdownMenuItem>
      ))}
    </>
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
