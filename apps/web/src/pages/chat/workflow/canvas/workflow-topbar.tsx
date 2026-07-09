import { AlertCircleIcon, CheckmarkCircle02Icon, Settings02Icon, WorkflowSquare01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  WorkflowDraftPublishStatus,
  WorkflowDraftRestoreStatus,
  WorkflowDraftSaveStatus,
} from "../workflow-draft-service";

export function WorkflowTopBar({
  isPreviewingVersion,
  lastSavedAt,
  onExitPreview,
  onOpenVersionHistory,
  onOpenVariables,
  onPublish,
  onPublishCheck,
  onRestoreVersion,
  previewVersionLabel,
  previewVersionMeta,
  publishedAt,
  publishState,
  publishReady,
  readyChecks,
  restoreState,
  saveState,
  totalChecks,
  workflowName,
}: {
  isPreviewingVersion?: boolean;
  lastSavedAt: string;
  onExitPreview?: () => void;
  onOpenVersionHistory: () => void;
  onOpenVariables: () => void;
  onPublish: () => void;
  onPublishCheck: () => void;
  onRestoreVersion?: () => void;
  previewVersionLabel?: string;
  previewVersionMeta?: string;
  publishedAt: string | null;
  publishState: WorkflowDraftPublishStatus;
  publishReady: boolean;
  readyChecks: number;
  restoreState?: WorkflowDraftRestoreStatus;
  saveState: WorkflowDraftSaveStatus;
  totalChecks: number;
  workflowName: string;
}) {
  const saveStateLabel = getSaveStateLabel(saveState);
  const publishing = publishState === "publishing";
  const restoring = restoreState === "restoring";
  const readOnlyMode = Boolean(isPreviewingVersion);
  const previewLabel = previewVersionLabel ?? "历史版本";
  const previewMeta = previewVersionMeta;
  const topbarButtonClassName = "workflow-topbar-button pointer-events-auto h-10 gap-1.5 rounded-xl border-[0.5px] border-[var(--workflow-border)] bg-[var(--workflow-panel-bg-blur)] px-3.5 text-[13px] font-semibold shadow-[0_10px_28px_rgba(15,23,42,0.12)] backdrop-blur-[10px]";

  return (
    <header className="workflow-canvas-topbar pointer-events-none absolute left-0 right-0 top-3.5 z-[12] grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3 px-3 max-lg:grid-cols-[minmax(0,1fr)] max-lg:gap-2 max-lg:px-2.5">
      {readOnlyMode ? (
        <div className="workflow-canvas-status workflow-canvas-status-restoring pointer-events-none flex min-w-0 max-w-[520px] items-center gap-2 text-[13px] font-semibold leading-[18px] text-[#667085]">
          <span className="workflow-version-preview-name min-w-0 truncate text-foreground">{previewLabel}</span>
          <span className="workflow-view-only-badge shrink-0 rounded-md border-[0.5px] border-[rgba(82,139,255,0.28)] bg-[rgba(82,139,255,0.1)] px-1.5 py-0.5 text-[10px] font-bold uppercase leading-[14px] text-[var(--workflow-blue)]">View only</span>
          {previewMeta ? (
            <>
              <span className="workflow-canvas-status-separator size-[3px] shrink-0 rounded-full bg-current opacity-70" />
              <span className="truncate">{previewMeta}</span>
            </>
          ) : null}
        </div>
      ) : (
        <div className="workflow-canvas-status pointer-events-none flex min-w-0 max-w-[420px] items-center gap-2 text-[13px] font-semibold leading-9 text-[#667085] max-lg:max-w-none max-lg:leading-5">
          <span title={saveState === "saved" ? `上次保存：${lastSavedAt}` : undefined}>
            {saveStateLabel}
          </span>
          <span className="workflow-canvas-status-separator size-[3px] shrink-0 rounded-full bg-current opacity-70" />
          <span title={publishedAt ? `发布时间：${publishedAt}` : undefined}>
            {publishedAt ? `已发布 ${publishedAt}` : "未发布"}
          </span>
          <span className="workflow-canvas-status-separator size-[3px] shrink-0 rounded-full bg-current opacity-70" />
          <span className="truncate">{workflowName}</span>
        </div>
      )}

      <div />

      <div className="workflow-canvas-actions pointer-events-none flex min-w-0 justify-end gap-2.5 max-lg:justify-start max-lg:overflow-x-auto max-lg:pb-0.5" aria-label="Workflow 操作">
        {readOnlyMode ? (
          <>
            {isPreviewingVersion ? (
              <Button
                className={topbarButtonClassName}
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
              className={topbarButtonClassName}
              onClick={onExitPreview}
              type="button"
              variant="secondary"
            >
              退出版本
            </Button>
          </>
        ) : (
          <>
            <Button
              aria-label="打开变量面板"
              className={topbarButtonClassName}
              onClick={onOpenVariables}
              type="button"
              variant="secondary"
            >
              <HugeiconsIcon icon={Settings02Icon} size={16} strokeWidth={1.8} />
              <span>变量</span>
            </Button>
            <Button
              className={topbarButtonClassName}
              onClick={onOpenVersionHistory}
              type="button"
              variant="secondary"
            >
              <HugeiconsIcon icon={WorkflowSquare01Icon} size={16} strokeWidth={1.8} />
              <span>版本历史</span>
            </Button>
            <Button
              className={topbarButtonClassName}
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
              className={cn(topbarButtonClassName, "workflow-topbar-publish border-transparent")}
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
