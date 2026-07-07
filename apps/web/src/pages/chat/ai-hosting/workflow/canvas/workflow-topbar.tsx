import { AlertCircleIcon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";

export function WorkflowTopBar({
  onPublishCheck,
  publishReady,
  readyChecks,
  totalChecks,
  workflowName,
}: {
  onPublishCheck: () => void;
  publishReady: boolean;
  readyChecks: number;
  totalChecks: number;
  workflowName: string;
}) {
  return (
    <header className="workflow-canvas-topbar">
      <div className="workflow-canvas-status">
        <span>自动保存</span>
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
