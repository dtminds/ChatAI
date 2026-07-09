import type {
  WorkflowDraftPublishStatus,
  WorkflowDraftRestoreStatus,
} from "./workflow-draft-service";

export type WorkflowWorkspaceMode =
  | "editing"
  | "publishing"
  | "restoring"
  | "version-preview";

export type WorkflowReadOnlyReason =
  | "none"
  | "permission-denied"
  | "publishing"
  | "restoring"
  | "version-preview";

export type WorkflowModeState = {
  canEdit?: boolean;
  isPreviewingVersion: boolean;
  publishState?: WorkflowDraftPublishStatus;
  restoreState?: WorkflowDraftRestoreStatus;
};

export type WorkflowModePermissions = {
  canEditGraph: boolean;
  canEditNodeSettings: boolean;
  canOpenInsertPalette: boolean;
  canPublish: boolean;
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
  publishState,
  restoreState,
}: WorkflowModeState): WorkflowModeStateResult {
  const isPublishing = publishState === "publishing";
  const isRestoring = restoreState === "restoring";
  const isPreviewMode = isPreviewingVersion;
  const mode = getWorkflowWorkspaceMode({
    isPreviewingVersion,
    isPublishing,
    isRestoring,
  });
  const readOnlyReason = getWorkflowReadOnlyReason({
    canEdit,
    isPreviewingVersion,
    isPublishing,
    isRestoring,
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
}: {
  isPreviewingVersion: boolean;
  isPublishing: boolean;
  isRestoring: boolean;
}): WorkflowWorkspaceMode {
  if (isRestoring) {
    return "restoring";
  }

  if (isPreviewingVersion) {
    return "version-preview";
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
}: {
  canEdit: boolean;
  isPreviewingVersion: boolean;
  isPublishing: boolean;
  isRestoring: boolean;
}): WorkflowReadOnlyReason {
  if (!canEdit) {
    return "permission-denied";
  }

  if (isRestoring) {
    return "restoring";
  }

  if (isPreviewingVersion) {
    return "version-preview";
  }

  if (isPublishing) {
    return "publishing";
  }

  return "none";
}
