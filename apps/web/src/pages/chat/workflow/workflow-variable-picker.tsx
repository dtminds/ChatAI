import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  Search01Icon,
  Settings03Icon,
  UserIcon,
  ZapIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { nodeVisuals } from "./node-definitions";
import type {
  WorkflowVariableDefinition,
  WorkflowVariableScope,
} from "./types";

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
          `${variable.label} ${variable.sourceNodeTitle ?? ""} ${variable.selector.join(".")}`
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
        <div className="border-b p-2">
          <div className="relative">
            <HugeiconsIcon
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              icon={Search01Icon}
              size={14}
              strokeWidth={1.8}
            />
            <Input
              aria-label="搜索变量"
              autoFocus
              className="h-8 pl-8 text-xs"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => event.stopPropagation()}
              placeholder="搜索"
              value={query}
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

  const contextScopes: Exclude<WorkflowVariableScope, "node">[] = [
    "system",
    "customer",
    "trigger",
  ];
  const nodeVariableGroups = groupNodeVariables(
    variables.filter((variable) => variable.scope === "node"),
  );

  return (
    <>
      {contextScopes.map((scope) => {
        const scoped = variables.filter((variable) => variable.scope === scope);
        if (!scoped.length) return null;

        return (
          <VariableGroupSubMenu
            icon={scopeIcons[scope]}
            key={scope}
            label={scopeLabels[scope]}
            onSelect={onSelect}
            variables={scoped}
          />
        );
      })}

      {nodeVariableGroups.length ? <DropdownMenuSeparator /> : null}

      {nodeVariableGroups.map((group) => {
        const visual = group.sourceNodeKind ? nodeVisuals[group.sourceNodeKind] : undefined;

        return (
          <VariableGroupSubMenu
            icon={visual?.icon}
            iconAccentRgb={visual?.accentRgb}
            key={group.sourceNodeId}
            label={group.sourceNodeTitle}
            onSelect={onSelect}
            variables={group.variables}
          />
        );
      })}
    </>
  );
}

function VariableGroupSubMenu({
  icon,
  iconAccentRgb,
  label,
  onSelect,
  variables,
}: {
  icon?: typeof Settings03Icon;
  iconAccentRgb?: string;
  label: string;
  onSelect: (variable: WorkflowVariableDefinition) => void;
  variables: WorkflowVariableDefinition[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenuSub onOpenChange={setOpen} open={open}>
      <DropdownMenuSubTrigger onClick={() => setOpen(true)}>
        {icon ? (
          <span
            className={cn(
              "flex size-5 shrink-0 items-center justify-center text-muted-foreground",
              iconAccentRgb && "workflow-variable-source-icon",
              !iconAccentRgb && "rounded-md",
            )}
            style={iconAccentRgb
              ? { "--workflow-variable-icon-rgb": iconAccentRgb } as CSSProperties
              : undefined}
          >
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
        {variables.map((variable) => (
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
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {variableTypeLabels[variable.type]}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

function groupNodeVariables(variables: WorkflowVariableDefinition[]) {
  const groups = new Map<string, {
    sourceNodeId: string;
    sourceNodeKind: WorkflowVariableDefinition["sourceNodeKind"];
    sourceNodeTitle: string;
    variables: WorkflowVariableDefinition[];
  }>();

  variables.forEach((variable) => {
    if (!variable.sourceNodeId || !variable.sourceNodeTitle) return;

    const current = groups.get(variable.sourceNodeId);
    if (current) {
      current.variables.push(variable);
      return;
    }

    groups.set(variable.sourceNodeId, {
      sourceNodeId: variable.sourceNodeId,
      sourceNodeKind: variable.sourceNodeKind,
      sourceNodeTitle: variable.sourceNodeTitle,
      variables: [variable],
    });
  });

  return [...groups.values()];
}

const scopeLabels: Record<Exclude<WorkflowVariableScope, "node">, string> = {
  customer: "客户变量",
  system: "系统变量",
  trigger: "触发变量",
};

const scopeIcons = {
  customer: UserIcon,
  system: Settings03Icon,
  trigger: ZapIcon,
} satisfies Record<Exclude<WorkflowVariableScope, "node">, typeof Settings03Icon>;

const variableTypeLabels: Record<WorkflowVariableDefinition["type"], string> = {
  boolean: "布尔",
  datetime: "时间",
  number: "数字",
  object: "对象",
  string: "文本",
};
