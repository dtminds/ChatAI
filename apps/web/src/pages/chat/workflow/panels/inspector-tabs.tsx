import {
  AlertCircleIcon,
  CheckmarkCircle02Icon,
  PlayIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type {
  WorkflowNode,
  NodeRunRecord,
  WorkflowVariables,
} from "../types";
import { FieldGroup } from "./field-group";

export function LastRunPanel({
  lastRun,
  node,
  onRunNode,
}: {
  lastRun?: NodeRunRecord;
  node: WorkflowNode;
  onRunNode: () => void;
}) {
  if (!lastRun) {
    return (
      <section className="workflow-field-group rounded-xl border border-[var(--workflow-border)] bg-[var(--workflow-panel-section)] p-4">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--workflow-soft)] text-muted-foreground">
            <HugeiconsIcon icon={PlayIcon} size={17} strokeWidth={1.8} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold">尚未运行</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              运行当前节点后，这里会显示输入、输出、耗时和执行日志
            </p>
          </div>
        </div>
        <Button className="mt-4 h-8 w-full gap-1.5 text-xs" onClick={onRunNode} type="button">
          <HugeiconsIcon icon={PlayIcon} size={15} strokeWidth={1.8} />
          运行 {node.data.title}
        </Button>
      </section>
    );
  }

  if (lastRun.status === "running" || lastRun.status === "waiting") {
    return (
      <>
        <section className="workflow-field-group rounded-xl border border-[var(--workflow-border)] bg-[var(--workflow-panel-section)] p-3">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-[var(--workflow-soft)] text-muted-foreground">
              <Spinner size={16} variant="classic" />
            </span>
            <div>
              <h3 className="text-sm font-semibold">正在运行</h3>
              <p className="text-xs text-muted-foreground">等待节点返回执行结果</p>
            </div>
          </div>
        </section>

        <FieldGroup title="输入">
          <RuntimeBlock>{lastRun.input}</RuntimeBlock>
        </FieldGroup>

        <FieldGroup title="日志">
          <RuntimeLogList logs={lastRun.logs} />
        </FieldGroup>
      </>
    );
  }

  if (lastRun.status === "failed") {
    return (
      <>
        <section className="workflow-field-group rounded-xl border border-destructive/30 bg-destructive/10 p-3">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-background text-destructive">
              <HugeiconsIcon icon={AlertCircleIcon} size={17} strokeWidth={1.8} />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-destructive">运行失败</h3>
              <p className="text-xs text-muted-foreground">{lastRun.errorMessage ?? lastRun.finishedAt}</p>
            </div>
          </div>
        </section>

        <FieldGroup title="输入">
          <RuntimeBlock>{lastRun.input}</RuntimeBlock>
        </FieldGroup>

        <FieldGroup title="日志">
          <RuntimeLogList logs={lastRun.logs} />
        </FieldGroup>
      </>
    );
  }

  return (
    <>
      <section className="workflow-field-group rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <HugeiconsIcon icon={CheckmarkCircle02Icon} size={17} strokeWidth={1.8} />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-emerald-900">运行成功</h3>
              <p className="text-xs text-emerald-700">{lastRun.finishedAt}</p>
            </div>
          </div>
          <Badge className="rounded-md bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
            {lastRun.durationMs}ms
          </Badge>
        </div>
      </section>

      <FieldGroup title="输入">
        <RuntimeBlock>{lastRun.input}</RuntimeBlock>
      </FieldGroup>

      <FieldGroup title="输出">
        <RuntimeBlock>{lastRun.output}</RuntimeBlock>
      </FieldGroup>

      <FieldGroup title="日志">
        <RuntimeLogList logs={lastRun.logs} />
      </FieldGroup>
    </>
  );
}

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

function RuntimeBlock({ children }: { children: string }) {
  return (
    <pre className="max-h-36 overflow-auto rounded-lg bg-background p-3 text-xs leading-5 text-foreground shadow-xs">
      {children}
    </pre>
  );
}

function RuntimeLogList({ logs }: { logs: string[] }) {
  return (
    <div className="space-y-2">
      {logs.map((log) => (
        <div className="flex items-center gap-2 text-xs text-muted-foreground" key={log}>
          <span className="size-1.5 rounded-full bg-emerald-500" />
          <span>{log}</span>
        </div>
      ))}
    </div>
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
