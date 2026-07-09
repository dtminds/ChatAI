import { AlertCircleIcon, Cancel01Icon, CheckmarkCircle02Icon, PlayIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  WorkflowRunRecord,
  WorkflowRunTraceItem,
} from "../types";

type WorkflowRunHistoryTab = "detail" | "result" | "tracing";

export function WorkflowRunHistoryPanel({
  currentRunId,
  onClose,
  onExitHistory,
  onSelectRun,
  runs,
}: {
  currentRunId?: string;
  onClose: () => void;
  onExitHistory: () => void;
  onSelectRun: (runId: string) => void;
  runs: WorkflowRunRecord[];
}) {
  const [activeTab, setActiveTab] = useState<WorkflowRunHistoryTab>("result");
  const selectedRun = runs.find((run) => run.id === currentRunId);

  return (
    <aside
      aria-label="运行历史"
      className="workflow-run-panel absolute right-4 top-[72px] z-[16] flex max-h-[calc(100%-88px)] w-[360px] flex-col overflow-hidden rounded-2xl border-[0.5px] border-[var(--workflow-border)] bg-[var(--workflow-panel-bg-blur)] shadow-[0_18px_44px_rgba(15,23,42,0.14)] backdrop-blur-[10px] max-lg:left-2.5 max-lg:right-2.5 max-lg:top-28 max-lg:max-h-[calc(100%-124px)] max-lg:w-auto"
    >
      <div className="workflow-version-panel-header flex items-start gap-2 px-3 pb-2 pt-3">
        <div className="min-w-0 flex-1">
          <h2 className="workflow-version-panel-title text-[15px] font-bold leading-[22px] text-foreground">运行历史</h2>
          <p className="workflow-version-panel-description mt-0.5 text-xs leading-[18px] text-muted-foreground">
            查看历史测试运行的图和节点结果
          </p>
        </div>
        <Button
          aria-label="关闭运行历史"
          className="size-8 shrink-0 rounded-lg"
          onClick={onClose}
          size="icon"
          type="button"
          variant="ghost"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={1.8} />
        </Button>
      </div>

      <div className="workflow-run-list min-h-0 flex-1 overflow-y-auto px-2 pb-2 pt-1">
        {runs.length ? runs.map((run) => {
          const isSelected = run.id === currentRunId;
          const statusMeta = getRunStatusMeta(run.status);

          return (
            <button
              aria-current={isSelected ? "true" : undefined}
              className={cn(
                "workflow-run-item flex w-full min-w-0 items-start gap-2 rounded-[10px] border-0 bg-transparent p-2 text-left text-inherit hover:bg-slate-950/5",
                isSelected && "workflow-run-item-selected bg-[rgba(82,139,255,0.12)]",
              )}
              key={run.id}
              onClick={() => onSelectRun(run.id)}
              type="button"
            >
              <span
                className={cn(
                  "workflow-run-status-icon",
                  "flex size-6 shrink-0 items-center justify-center rounded-lg bg-[var(--workflow-soft)]",
                  statusMeta.className,
                )}
              >
                <HugeiconsIcon
                  icon={statusMeta.icon}
                  size={15}
                  strokeWidth={1.8}
                />
              </span>
              <span className="workflow-run-content grid min-w-0 flex-1 gap-0.5">
                <span className="workflow-run-title truncate text-[13px] font-bold leading-[18px] text-foreground">{run.title}</span>
                <span className="workflow-run-meta truncate text-xs leading-[18px] text-muted-foreground">
                  {run.finishedAt || run.createdAt} · {run.totalNodes} 节点 · {run.durationMs}ms
                </span>
              </span>
            </button>
          );
        }) : (
          <div className="workflow-version-empty flex min-h-40 flex-col items-center justify-center gap-2 text-[13px] text-muted-foreground">
            <span className="workflow-version-empty-icon flex size-9 items-center justify-center rounded-[10px] bg-[var(--workflow-soft)]">
              <HugeiconsIcon icon={PlayIcon} size={18} strokeWidth={1.8} />
            </span>
            <span>暂无运行记录</span>
          </div>
        )}
      </div>

      {selectedRun ? (
        <div className="workflow-run-detail grid gap-2.5 border-t-[0.5px] border-[var(--workflow-border)] px-3 pb-3 pt-2.5">
          <div className="workflow-run-detail-header grid gap-0.5">
            <span className="workflow-version-preview-title text-[13px] font-bold leading-[18px] text-foreground">{selectedRun.title}</span>
            <span className="workflow-version-preview-meta text-xs leading-[18px] text-muted-foreground">
              {getRunStatusMeta(selectedRun.status).label}
            </span>
          </div>

          <div className="workflow-run-tabs flex gap-3.5 border-b-[0.5px] border-[var(--workflow-border)]" role="tablist" aria-label="运行详情视图">
            <RunTab activeTab={activeTab} label="RESULT" tab="result" onChange={setActiveTab} />
            <RunTab activeTab={activeTab} label="DETAIL" tab="detail" onChange={setActiveTab} />
            <RunTab activeTab={activeTab} label="TRACING" tab="tracing" onChange={setActiveTab} />
          </div>

          {activeTab === "result" ? <RunResultPanel run={selectedRun} /> : null}
          {activeTab === "detail" ? <RunDetailPanel run={selectedRun} /> : null}
          {activeTab === "tracing" ? <RunTracingPanel trace={selectedRun.trace} /> : null}

          <div className="workflow-version-action-row flex justify-end gap-2">
            <Button
              className="h-8 rounded-lg px-3 text-xs"
              onClick={onExitHistory}
              type="button"
              variant="secondary"
            >
              返回编辑
            </Button>
          </div>
        </div>
      ) : null}
    </aside>
  );
}

function RunTab({
  activeTab,
  label,
  onChange,
  tab,
}: {
  activeTab: WorkflowRunHistoryTab;
  label: string;
  onChange: (tab: WorkflowRunHistoryTab) => void;
  tab: WorkflowRunHistoryTab;
}) {
  return (
    <button
      aria-selected={activeTab === tab}
      className="workflow-run-tab h-8 border-0 border-b-2 border-transparent bg-transparent text-[11px] font-bold leading-none tracking-normal text-muted-foreground aria-selected:border-[var(--workflow-blue)] aria-selected:text-foreground"
      onClick={() => onChange(tab)}
      role="tab"
      type="button"
    >
      {label}
    </button>
  );
}

function RunMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="workflow-run-metric grid gap-0.5 rounded-[10px] bg-[var(--workflow-panel-section)] p-2">
      <span className="text-[13px] font-bold leading-[18px] text-foreground">{value}</span>
      <span className="text-[11px] leading-4 text-muted-foreground">{label}</span>
    </div>
  );
}

function RunResultPanel({ run }: { run: WorkflowRunRecord }) {
  if (run.errorMessage) {
    return (
      <p className="workflow-run-error m-0 rounded-[10px] bg-destructive/10 p-2 text-xs leading-[18px] text-destructive">
        {run.errorMessage}
      </p>
    );
  }

  return (
    <div className="workflow-run-tab-panel grid min-h-0 gap-2.5" role="tabpanel">
      <RuntimeBlock value={run.outputs} />
    </div>
  );
}

function RunDetailPanel({ run }: { run: WorkflowRunRecord }) {
  return (
    <div className="workflow-run-tab-panel grid min-h-0 gap-2.5" role="tabpanel">
      <div className="workflow-run-summary-grid grid grid-cols-2 gap-2">
        <RunMetric label="节点" value={`${run.totalNodes}`} />
        <RunMetric label="步骤" value={`${run.totalSteps}`} />
        <RunMetric label="耗时" value={`${run.durationMs}ms`} />
        <RunMetric label="Token" value={`${run.totalTokens}`} />
      </div>
      <FieldBlock title="INPUT">
        <RuntimeBlock value={run.inputs} />
      </FieldBlock>
      <FieldBlock title="OUTPUT">
        <RuntimeBlock value={run.outputs} />
      </FieldBlock>
    </div>
  );
}

function RunTracingPanel({ trace }: { trace: WorkflowRunTraceItem[] }) {
  return (
    <div className="workflow-run-tab-panel grid min-h-0 gap-2.5" role="tabpanel">
      {trace.map((item, index) => (
        <div className="workflow-run-trace-item flex min-w-0 items-start gap-2 rounded-[10px] bg-[var(--workflow-panel-section)] p-2" key={`${item.nodeId}-${index}`}>
          <RunStatusIcon status={item.status} />
          <span className="workflow-run-content grid min-w-0 flex-1 gap-0.5">
            <span className="workflow-run-title truncate text-[13px] font-bold leading-[18px] text-foreground">{item.nodeTitle}</span>
            <span className="workflow-run-meta truncate text-xs leading-[18px] text-muted-foreground">
              {item.startedAt} · {item.nodeType} · {item.durationMs}ms
            </span>
            {item.logs.length ? (
              <span className="workflow-run-trace-logs truncate text-[11px] leading-4 text-muted-foreground">
                {item.logs.join(" / ")}
              </span>
            ) : null}
          </span>
        </div>
      ))}
    </div>
  );
}

function RunStatusIcon({ status }: { status: WorkflowRunRecord["status"] | WorkflowRunTraceItem["status"] }) {
  const statusMeta = getRunStatusMeta(status);

  return (
    <span
      className={cn(
        "workflow-run-status-icon",
        "flex size-6 shrink-0 items-center justify-center rounded-lg bg-[var(--workflow-soft)]",
        statusMeta.className,
      )}
    >
      <HugeiconsIcon
        icon={statusMeta.icon}
        size={15}
        strokeWidth={1.8}
      />
    </span>
  );
}

function getRunStatusMeta(status: WorkflowRunRecord["status"] | WorkflowRunTraceItem["status"]) {
  if (status === "succeeded") {
    return {
      className: "workflow-run-status-success text-emerald-700",
      icon: CheckmarkCircle02Icon,
      label: "运行成功",
    };
  }

  if (status === "running" || status === "waiting") {
    return {
      className: "workflow-run-status-running text-primary",
      icon: PlayIcon,
      label: "运行中",
    };
  }

  if (status === "stopped") {
    return {
      className: "workflow-run-status-failed text-destructive",
      icon: Cancel01Icon,
      label: "已停止",
    };
  }

  return {
    className: "workflow-run-status-failed text-destructive",
    icon: AlertCircleIcon,
    label: "运行失败",
  };
}

function FieldBlock({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="workflow-run-field grid gap-1.5">
      <h3 className="m-0 text-[11px] font-bold leading-4 tracking-normal text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function RuntimeBlock({ value }: { value: unknown }) {
  return (
    <pre className="workflow-run-runtime-block m-0 max-h-[180px] overflow-auto whitespace-pre-wrap rounded-[10px] bg-background p-2.5 text-xs leading-[18px] text-foreground">
      {formatRuntimeValue(value)}
    </pre>
  );
}

function formatRuntimeValue(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value ?? {}, null, 2);
}
