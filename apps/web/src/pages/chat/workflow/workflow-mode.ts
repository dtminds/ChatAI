import type { WorkflowRunRecord } from "./types";
import type {
  WorkflowDraftPublishStatus,
  WorkflowDraftRestoreStatus,
} from "./workflow-draft-service";

export type WorkflowWorkspaceMode =
  | "editing"
  | "publishing"
  | "restoring"
  | "run-history"
  | "running"
  | "version-preview";

export type WorkflowReadOnlyReason =
  | "none"
  | "permission-denied"
  | "publishing"
  | "restoring"
  | "run-history"
  | "running"
  | "version-preview";

export type WorkflowModeState = {
  canEdit?: boolean;
  isPreviewingVersion: boolean;
  isViewingRunHistory: boolean;
  publishState?: WorkflowDraftPublishStatus;
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
  readOnlyReason: WorkflowReadOnlyReason;
};

export function deriveWorkflowMode({
  canEdit = true,
  isPreviewingVersion,
  isViewingRunHistory,
  publishState,
  restoreState,
  workflowRunStatus,
}: WorkflowModeState): WorkflowModeStateResult {
  const isPublishing = publishState === "publishing";
  const isRestoring = restoreState === "restoring";
  const isRunning = workflowRunStatus === "running";
  const isPreviewMode = isPreviewingVersion || isViewingRunHistory;
  const mode = getWorkflowWorkspaceMode({
    isPreviewingVersion,
    isPublishing,
    isRestoring,
    isRunning,
    isViewingRunHistory,
  });
  const readOnlyReason = getWorkflowReadOnlyReason({
    canEdit,
    isPreviewingVersion,
    isPublishing,
    isRestoring,
    isRunning,
    isViewingRunHistory,
  });
  const nodesReadOnly = readOnlyReason !== "none";
  const canvasReadOnly = readOnlyReason !== "none" && readOnlyReason !== "permission-denied";
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
    readOnlyReason,
  };
}

function getWorkflowWorkspaceMode({
  isPreviewingVersion,
  isPublishing,
  isRestoring,
  isRunning,
  isViewingRunHistory,
}: {
  isPreviewingVersion: boolean;
  isPublishing: boolean;
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

  if (isPublishing) {
    return "publishing";
  }

  return "editing";
}

function getWorkflowReadOnlyReason({
  canEdit,
  isPreviewingVersion,
  isPublishing,
  isRestoring,
  isRunning,
  isViewingRunHistory,
}: {
  canEdit: boolean;
  isPreviewingVersion: boolean;
  isPublishing: boolean;
  isRestoring: boolean;
  isRunning: boolean;
  isViewingRunHistory: boolean;
}): WorkflowReadOnlyReason {
  if (!canEdit) {
    return "permission-denied";
  }

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

  if (isPublishing) {
    return "publishing";
  }

  return "none";
}
