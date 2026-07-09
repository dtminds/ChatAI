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
    <aside aria-label="版本历史" className="workflow-version-panel">
      <div className="workflow-version-panel-header">
        <div className="min-w-0 flex-1">
          <h2 className="workflow-version-panel-title">版本历史</h2>
          <p className="workflow-version-panel-description">
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

      <div className="workflow-version-list">
        {versions.length ? versions.map((version, index) => {
          const isSelected = version.id === currentPreviewVersionId;
          const isLatest = index === 0;

          return (
            <button
              aria-current={isSelected ? "true" : undefined}
              className={cn(
                "workflow-version-item",
                isSelected && "workflow-version-item-selected",
              )}
              key={version.id}
              onClick={() => onSelectVersion(version.id)}
              type="button"
            >
              {index < versions.length - 1 ? <span className="workflow-version-line" /> : null}
              <span className="workflow-version-dot" />
              <span className="workflow-version-content">
                <span className="workflow-version-name-row">
                  <span className="workflow-version-name">{version.name}</span>
                  {isLatest ? <span className="workflow-version-badge">Latest</span> : null}
                </span>
                <span className="workflow-version-meta">
                  {version.publishedAt} · Revision {version.revision}
                </span>
              </span>
            </button>
          );
        }) : (
          <div className="workflow-version-empty">
            <span className="workflow-version-empty-icon">
              <HugeiconsIcon icon={WorkflowSquare01Icon} size={18} strokeWidth={1.8} />
            </span>
            <span>暂无发布版本</span>
          </div>
        )}
      </div>

      {selectedVersion ? (
        <div className="workflow-version-preview-actions">
          <div className="workflow-version-preview-copy">
            <span className="workflow-version-preview-title">
              {selectedVersion.name}
            </span>
            <span className="workflow-version-preview-meta">
              当前为只读预览
            </span>
          </div>
          <div className="workflow-version-action-row">
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
