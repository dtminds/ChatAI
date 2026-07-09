import { AlertCircleIcon, CancelSquareIcon, CheckmarkCircle02Icon, PlayIcon, Settings02Icon, WorkflowSquare01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import type {
  WorkflowDraftPublishStatus,
  WorkflowDraftRestoreStatus,
  WorkflowDraftSaveStatus,
} from "../workflow-draft-service";

export function WorkflowTopBar({
  isPreviewingVersion,
  isViewingRunHistory,
  lastSavedAt,
  onExitPreview,
  onExitRunHistory,
  onOpenRunHistory,
  onOpenVersionHistory,
  onOpenVariables,
  onPublish,
  onPublishCheck,
  onRestoreVersion,
  onRunWorkflow,
  onStopWorkflowRun,
  previewRunLabel,
  previewRunMeta,
  previewVersionLabel,
  previewVersionMeta,
  publishedAt,
  publishState,
  publishReady,
  readyChecks,
  restoreState,
  runningState,
  saveState,
  totalChecks,
  workflowName,
}: {
  isPreviewingVersion?: boolean;
  isViewingRunHistory?: boolean;
  lastSavedAt: string;
  onExitPreview?: () => void;
  onExitRunHistory?: () => void;
  onOpenRunHistory: () => void;
  onOpenVersionHistory: () => void;
  onOpenVariables: () => void;
  onPublish: () => void;
  onPublishCheck: () => void;
  onRestoreVersion?: () => void;
  onRunWorkflow: () => void;
  onStopWorkflowRun?: () => void;
  previewRunLabel?: string;
  previewRunMeta?: string;
  previewVersionLabel?: string;
  previewVersionMeta?: string;
  publishedAt: string | null;
  publishState: WorkflowDraftPublishStatus;
  publishReady: boolean;
  readyChecks: number;
  restoreState?: WorkflowDraftRestoreStatus;
  runningState?: "failed" | "running" | "stopped" | "succeeded";
  saveState: WorkflowDraftSaveStatus;
  totalChecks: number;
  workflowName: string;
}) {
  const saveStateLabel = getSaveStateLabel(saveState);
  const publishing = publishState === "publishing";
  const restoring = restoreState === "restoring";
  const isRunning = runningState === "running";
  const readOnlyMode = isPreviewingVersion || isViewingRunHistory;
  const previewLabel = isViewingRunHistory
    ? previewRunLabel ?? "Test Run"
    : previewVersionLabel ?? "历史版本";
  const previewMeta = isViewingRunHistory ? previewRunMeta : previewVersionMeta;

  return (
    <header className="workflow-canvas-topbar">
      {readOnlyMode ? (
        <div className="workflow-canvas-status workflow-canvas-status-restoring">
          <span className="workflow-version-preview-name">{previewLabel}</span>
          <span className="workflow-view-only-badge">View only</span>
          {previewMeta ? (
            <>
              <span className="workflow-canvas-status-separator" />
              <span className="truncate">{previewMeta}</span>
            </>
          ) : null}
        </div>
      ) : (
        <div className="workflow-canvas-status">
          <span title={saveState === "saved" ? `上次保存：${lastSavedAt}` : undefined}>
            {saveStateLabel}
          </span>
          <span className="workflow-canvas-status-separator" />
          <span title={publishedAt ? `发布时间：${publishedAt}` : undefined}>
            {publishedAt ? `已发布 ${publishedAt}` : "未发布"}
          </span>
          <span className="workflow-canvas-status-separator" />
          <span className="truncate">{workflowName}</span>
        </div>
      )}

      <div />

      <div className="workflow-canvas-actions" aria-label="Workflow 操作">
        {readOnlyMode ? (
          <>
            {isPreviewingVersion ? (
              <Button
                className="workflow-topbar-button"
                onClick={onRestoreVersion}
                disabled={!onRestoreVersion || restoring}
                type="button"
                variant="default"
              >
                <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} strokeWidth={1.8} />
                <span>{restoring ? "恢复中" : "恢复"}</span>
              </Button>
            ) : null}
            <Button
              className="workflow-topbar-button"
              onClick={isViewingRunHistory ? onExitRunHistory : onExitPreview}
              type="button"
              variant="secondary"
            >
              {isViewingRunHistory ? "返回编辑" : "退出版本"}
            </Button>
          </>
        ) : (
          <>
            <Button
              aria-label="打开变量面板"
              className="workflow-topbar-button"
              onClick={onOpenVariables}
              type="button"
              variant="secondary"
            >
              <HugeiconsIcon icon={Settings02Icon} size={16} strokeWidth={1.8} />
              <span>变量</span>
            </Button>
            <Button
              className="workflow-topbar-button"
              disabled={isRunning}
              onClick={onRunWorkflow}
              type="button"
              variant="secondary"
            >
              <HugeiconsIcon icon={PlayIcon} size={16} strokeWidth={1.8} />
              <span>{isRunning ? "运行中" : "测试运行"}</span>
            </Button>
            {isRunning ? (
              <Button
                aria-label="停止运行"
                className="workflow-topbar-button"
                onClick={onStopWorkflowRun}
                type="button"
                variant="secondary"
              >
                <HugeiconsIcon icon={CancelSquareIcon} size={16} strokeWidth={1.8} />
                <span>停止</span>
              </Button>
            ) : null}
            <Button
              className="workflow-topbar-button"
              onClick={onOpenRunHistory}
              type="button"
              variant="secondary"
            >
              <HugeiconsIcon icon={PlayIcon} size={16} strokeWidth={1.8} />
              <span>运行历史</span>
            </Button>
            <Button
              className="workflow-topbar-button"
              onClick={onOpenVersionHistory}
              type="button"
              variant="secondary"
            >
              <HugeiconsIcon icon={WorkflowSquare01Icon} size={16} strokeWidth={1.8} />
              <span>版本历史</span>
            </Button>
            <Button
              className="workflow-topbar-button"
              onClick={onPublishCheck}
              type="button"
              variant="secondary"
            >
              <HugeiconsIcon
                icon={publishReady ? CheckmarkCircle02Icon : AlertCircleIcon}
                size={16}
                strokeWidth={1.8}
              />
              <span>
                发布检查 {readyChecks}/{totalChecks}
              </span>
            </Button>
            <Button
              className="workflow-topbar-button workflow-topbar-publish"
              disabled={!publishReady || publishing || saveState === "error"}
              onClick={onPublish}
              type="button"
              variant={publishReady ? "default" : "secondary"}
            >
              <HugeiconsIcon
                icon={publishReady ? CheckmarkCircle02Icon : AlertCircleIcon}
                size={16}
                strokeWidth={1.8}
              />
              <span>
                {publishing ? "发布中" : "发布"}
              </span>
            </Button>
          </>
        )}
      </div>
    </header>
  );
}

function getSaveStateLabel(saveState: WorkflowDraftSaveStatus) {
  if (saveState === "error") {
    return "保存失败";
  }

  if (saveState === "dirty" || saveState === "saving") {
    return "正在保存";
  }

  return "已保存";
}
