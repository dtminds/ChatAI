import type { WorkflowRunRecord } from "./types";
import type { WorkflowDraftRestoreStatus } from "./workflow-draft-service";

export type WorkflowWorkspaceMode =
  | "editing"
  | "restoring"
  | "run-history"
  | "running"
  | "version-preview";

export type WorkflowModeState = {
  canEdit?: boolean;
  isPreviewingVersion: boolean;
  isViewingRunHistory: boolean;
  restoreState?: WorkflowDraftRestoreStatus;
  workflowRunStatus?: WorkflowRunRecord["status"];
};

export type WorkflowModePermissions = {
  canEditGraph: boolean;
  canEditNodeSettings: boolean;
  canOpenInsertPalette: boolean;
  canPublish: boolean;
  canRunNode: boolean;
  canRunWorkflow: boolean;
  canUseClipboard: boolean;
  canUseHistory: boolean;
  canvasReadOnly: boolean;
  nodesReadOnly: boolean;
};

export type WorkflowModeStateResult = {
  isPreviewMode: boolean;
  mode: WorkflowWorkspaceMode;
  permissions: WorkflowModePermissions;
};

export function deriveWorkflowMode({
  canEdit = true,
  isPreviewingVersion,
  isViewingRunHistory,
  restoreState,
  workflowRunStatus,
}: WorkflowModeState): WorkflowModeStateResult {
  const isRestoring = restoreState === "restoring";
  const isRunning = workflowRunStatus === "running";
  const isPreviewMode = isPreviewingVersion || isViewingRunHistory;
  const mode = getWorkflowWorkspaceMode({
    isPreviewingVersion,
    isRestoring,
    isRunning,
    isViewingRunHistory,
  });
  const nodesReadOnly = !canEdit || isRestoring || isPreviewMode || isRunning;
  const canvasReadOnly = isRestoring || isPreviewMode || isRunning;
  const canMutate = canEdit && !nodesReadOnly;

  return {
    isPreviewMode,
    mode,
    permissions: {
      canEditGraph: canMutate,
      canEditNodeSettings: canMutate,
      canOpenInsertPalette: canMutate,
      canPublish: canMutate,
      canRunNode: canMutate,
      canRunWorkflow: canMutate,
      canUseClipboard: canMutate,
      canUseHistory: canMutate,
      canvasReadOnly,
      nodesReadOnly,
    },
  };
}

function getWorkflowWorkspaceMode({
  isPreviewingVersion,
  isRestoring,
  isRunning,
  isViewingRunHistory,
}: {
  isPreviewingVersion: boolean;
  isRestoring: boolean;
  isRunning: boolean;
  isViewingRunHistory: boolean;
}): WorkflowWorkspaceMode {
  if (isRestoring) {
    return "restoring";
  }

  if (isViewingRunHistory) {
    return "run-history";
  }

  if (isPreviewingVersion) {
    return "version-preview";
  }

  if (isRunning) {
    return "running";
  }

  return "editing";
}
