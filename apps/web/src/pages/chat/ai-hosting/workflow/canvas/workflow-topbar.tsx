import { AlertCircleIcon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import type { WorkflowDraftSaveStatus } from "../workflow-draft-service";

export function WorkflowTopBar({
  lastSavedAt,
  onPublishCheck,
  publishReady,
  readyChecks,
  saveState,
  totalChecks,
  workflowName,
}: {
  lastSavedAt: string;
  onPublishCheck: () => void;
  publishReady: boolean;
  readyChecks: number;
  saveState: WorkflowDraftSaveStatus;
  totalChecks: number;
  workflowName: string;
}) {
  const saveStateLabel = getSaveStateLabel(saveState);

  return (
    <header className="workflow-canvas-topbar">
      <div className="workflow-canvas-status">
        <span title={saveState === "saved" ? `上次保存：${lastSavedAt}` : undefined}>
          {saveStateLabel}
        </span>
        <span className="workflow-canvas-status-separator" />
        <span className="truncate">{workflowName}</span>
      </div>

      <div />

      <div className="workflow-canvas-actions" aria-label="Workflow 操作">
        <Button
          className="workflow-topbar-button workflow-topbar-publish"
          onClick={onPublishCheck}
          type="button"
          variant={publishReady ? "default" : "secondary"}
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
