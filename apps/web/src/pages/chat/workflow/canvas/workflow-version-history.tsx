import { Cancel01Icon, CheckmarkCircle02Icon, WorkflowSquare01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  WorkflowDraftRestoreStatus,
  WorkflowVersionHistoryItem,
} from "../workflow-draft-service";

export function WorkflowVersionHistoryPanel({
  currentPreviewVersionId,
  onClose,
  onExitPreview,
  onRestoreVersion,
  onSelectVersion,
  restoreState,
  versions,
}: {
  currentPreviewVersionId?: string;
  onClose: () => void;
  onExitPreview: () => void;
  onRestoreVersion: (versionId: string) => void;
  onSelectVersion: (versionId: string) => void;
  restoreState: WorkflowDraftRestoreStatus;
  versions: WorkflowVersionHistoryItem[];
}) {
  const isRestoring = restoreState === "restoring";
  const selectedVersion = versions.find((version) => version.id === currentPreviewVersionId);

  return (
    <aside
      aria-label="版本历史"
      className="workflow-version-panel absolute right-4 top-4 z-[16] flex max-h-[calc(100%-32px)] w-[268px] flex-col overflow-hidden rounded-2xl border-[0.5px] border-[var(--workflow-border)] bg-[var(--workflow-panel-bg-blur)] shadow-[0_18px_44px_var(--shadow-medium)] backdrop-blur-[10px] max-lg:left-2.5 max-lg:right-2.5 max-lg:top-2.5 max-lg:max-h-[calc(100%-20px)] max-lg:w-auto"
    >
      <div className="workflow-version-panel-header flex items-start gap-2 px-3 pb-2 pt-3">
        <div className="min-w-0 flex-1">
          <h2 className="workflow-version-panel-title text-[15px] font-bold leading-[22px] text-foreground">版本历史</h2>
          <p className="workflow-version-panel-description mt-0.5 text-xs leading-[18px] text-muted-foreground">
            选择版本后以只读方式预览
          </p>
        </div>
        <Button
          aria-label="关闭版本历史"
          className="size-8 shrink-0 rounded-lg"
          onClick={onClose}
          size="icon"
          type="button"
          variant="ghost"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={1.8} />
        </Button>
      </div>

      <div className="workflow-version-list min-h-0 flex-1 overflow-y-auto px-2 pb-2 pt-1">
        {versions.length ? versions.map((version, index) => {
          const isSelected = version.id === currentPreviewVersionId;
          const isLatest = index === 0;

          return (
            <button
              aria-current={isSelected ? "true" : undefined}
              className={cn(
                "workflow-version-item relative flex w-full min-w-0 gap-2 rounded-[10px] border-0 bg-transparent p-2 text-left text-inherit hover:bg-muted",
                isSelected && "workflow-version-item-selected bg-primary/10",
              )}
              key={version.id}
              onClick={() => onSelectVersion(version.id)}
              type="button"
            >
              {index < versions.length - 1 ? (
                <span className="workflow-version-line absolute left-[13px] top-[22px] h-[calc(100%-8px)] w-0.5 rounded-full bg-[var(--workflow-border)]" />
              ) : null}
              <span
                className={cn(
                  "workflow-version-dot z-[1] mt-1 size-2.5 shrink-0 rounded-full border-2 border-muted-foreground bg-[var(--workflow-panel-bg)]",
                  isSelected && "border-[var(--workflow-blue)]",
                )}
              />
              <span className="workflow-version-content grid min-w-0 flex-1 gap-[3px]">
                <span className="workflow-version-name-row flex min-w-0 items-center gap-1.5">
                  <span className="workflow-version-name min-w-0 truncate text-[13px] font-bold leading-[18px] text-foreground">{version.name}</span>
                  {isLatest ? (
                    <span className="workflow-version-badge shrink-0 rounded-md border-[0.5px] border-primary/30 bg-primary/10 px-[5px] py-px text-[10px] font-bold leading-[14px] text-primary">
                      Latest
                    </span>
                  ) : null}
                </span>
                <span className="workflow-version-meta truncate text-xs leading-[18px] text-muted-foreground">
                  {version.publishedAt} · Revision {version.revision}
                </span>
              </span>
            </button>
          );
        }) : (
          <div className="workflow-version-empty flex min-h-40 flex-col items-center justify-center gap-2 text-[13px] text-muted-foreground">
            <span className="workflow-version-empty-icon flex size-9 items-center justify-center rounded-[10px] bg-[var(--workflow-soft)]">
              <HugeiconsIcon icon={WorkflowSquare01Icon} size={18} strokeWidth={1.8} />
            </span>
            <span>暂无发布版本</span>
          </div>
        )}
      </div>

      {selectedVersion ? (
        <div className="workflow-version-preview-actions grid gap-2.5 border-t-[0.5px] border-[var(--workflow-border)] px-3 pb-3 pt-2.5">
          <div className="workflow-version-preview-copy grid gap-0.5">
            <span className="workflow-version-preview-title text-[13px] font-bold leading-[18px] text-foreground">
              {selectedVersion.name}
            </span>
            <span className="workflow-version-preview-meta text-xs leading-[18px] text-muted-foreground">
              当前为只读预览
            </span>
          </div>
          <div className="workflow-version-action-row flex justify-end gap-2">
            <Button
              className="h-8 rounded-lg px-3 text-xs"
              onClick={onExitPreview}
              type="button"
              variant="secondary"
            >
              退出预览
            </Button>
            <Button
              className="h-8 rounded-lg px-3 text-xs"
              disabled={isRestoring}
              onClick={() => onRestoreVersion(selectedVersion.id)}
              type="button"
            >
              <HugeiconsIcon icon={CheckmarkCircle02Icon} size={14} strokeWidth={1.8} />
              {isRestoring ? "恢复中" : "恢复"}
            </Button>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
