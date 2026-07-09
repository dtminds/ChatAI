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
    <aside aria-label="运行历史" className="workflow-run-panel">
      <div className="workflow-version-panel-header">
        <div className="min-w-0 flex-1">
          <h2 className="workflow-version-panel-title">运行历史</h2>
          <p className="workflow-version-panel-description">
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

      <div className="workflow-run-list">
        {runs.length ? runs.map((run) => {
          const isSelected = run.id === currentRunId;
          const statusMeta = getRunStatusMeta(run.status);

          return (
            <button
              aria-current={isSelected ? "true" : undefined}
              className={cn("workflow-run-item", isSelected && "workflow-run-item-selected")}
              key={run.id}
              onClick={() => onSelectRun(run.id)}
              type="button"
            >
              <span
                className={cn(
                  "workflow-run-status-icon",
                  statusMeta.className,
                )}
              >
                <HugeiconsIcon
                  icon={statusMeta.icon}
                  size={15}
                  strokeWidth={1.8}
                />
              </span>
              <span className="workflow-run-content">
                <span className="workflow-run-title">{run.title}</span>
                <span className="workflow-run-meta">
                  {run.finishedAt || run.createdAt} · {run.totalNodes} 节点 · {run.durationMs}ms
                </span>
              </span>
            </button>
          );
        }) : (
          <div className="workflow-version-empty">
            <span className="workflow-version-empty-icon">
              <HugeiconsIcon icon={PlayIcon} size={18} strokeWidth={1.8} />
            </span>
            <span>暂无运行记录</span>
          </div>
        )}
      </div>

      {selectedRun ? (
        <div className="workflow-run-detail">
          <div className="workflow-run-detail-header">
            <span className="workflow-version-preview-title">{selectedRun.title}</span>
            <span className="workflow-version-preview-meta">
              {getRunStatusMeta(selectedRun.status).label}
            </span>
          </div>

          <div className="workflow-run-tabs" role="tablist" aria-label="运行详情视图">
            <RunTab activeTab={activeTab} label="RESULT" tab="result" onChange={setActiveTab} />
            <RunTab activeTab={activeTab} label="DETAIL" tab="detail" onChange={setActiveTab} />
            <RunTab activeTab={activeTab} label="TRACING" tab="tracing" onChange={setActiveTab} />
          </div>

          {activeTab === "result" ? <RunResultPanel run={selectedRun} /> : null}
          {activeTab === "detail" ? <RunDetailPanel run={selectedRun} /> : null}
          {activeTab === "tracing" ? <RunTracingPanel trace={selectedRun.trace} /> : null}

          <div className="workflow-version-action-row">
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
      className="workflow-run-tab"
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
    <div className="workflow-run-metric">
      <span>{value}</span>
      <span>{label}</span>
    </div>
  );
}

function RunResultPanel({ run }: { run: WorkflowRunRecord }) {
  if (run.errorMessage) {
    return <p className="workflow-run-error">{run.errorMessage}</p>;
  }

  return (
    <div className="workflow-run-tab-panel" role="tabpanel">
      <RuntimeBlock value={run.outputs} />
    </div>
  );
}

function RunDetailPanel({ run }: { run: WorkflowRunRecord }) {
  return (
    <div className="workflow-run-tab-panel" role="tabpanel">
      <div className="workflow-run-summary-grid">
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
    <div className="workflow-run-tab-panel" role="tabpanel">
      {trace.map((item, index) => (
        <div className="workflow-run-trace-item" key={`${item.nodeId}-${index}`}>
          <RunStatusIcon status={item.status} />
          <span className="workflow-run-content">
            <span className="workflow-run-title">{item.nodeTitle}</span>
            <span className="workflow-run-meta">
              {item.startedAt} · {item.nodeType} · {item.durationMs}ms
            </span>
            {item.logs.length ? (
              <span className="workflow-run-trace-logs">
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
      className: "workflow-run-status-success",
      icon: CheckmarkCircle02Icon,
      label: "运行成功",
    };
  }

  if (status === "running" || status === "waiting") {
    return {
      className: "workflow-run-status-running",
      icon: PlayIcon,
      label: "运行中",
    };
  }

  if (status === "stopped") {
    return {
      className: "workflow-run-status-failed",
      icon: Cancel01Icon,
      label: "已停止",
    };
  }

  return {
    className: "workflow-run-status-failed",
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
    <section className="workflow-run-field">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function RuntimeBlock({ value }: { value: unknown }) {
  return (
    <pre className="workflow-run-runtime-block">
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
