import type {
  WorkflowVariables,
} from "../types";
import { FieldGroup } from "./field-group";

export function NodeVariablesPanel({
  variables,
}: {
  variables: WorkflowVariables;
}) {
  return (
    <>
      <FieldGroup title="输入变量">
        <VariableList variables={variables.inputs} />
      </FieldGroup>
      <FieldGroup title="输出变量">
        <VariableList variables={variables.outputs} />
      </FieldGroup>
    </>
  );
}

function VariableList({
  variables,
}: {
  variables: Array<{ name: string; type: string; value: string }>;
}) {
  return (
    <div className="space-y-2">
      {variables.map((variable) => (
        <div
          className="rounded-lg border border-[var(--workflow-border)] bg-background px-3 py-2 shadow-xs"
          key={variable.name}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="truncate text-xs font-medium text-foreground">{variable.name}</span>
            <span className="shrink-0 rounded-md bg-[var(--workflow-soft)] px-1.5 py-0.5 text-[11px] text-muted-foreground">
              {variable.type}
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">{variable.value}</p>
        </div>
      ))}
    </div>
  );
}
