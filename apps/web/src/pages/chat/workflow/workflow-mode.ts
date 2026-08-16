import type {
  WorkflowDraftPublishStatus,
  WorkflowDraftRestoreStatus,
} from "./workflow-draft-service";

export type WorkflowWorkspaceMode =
  | "editing"
  | "publishing"
  | "read-only"
  | "restoring"
  | "version-preview";

export type WorkflowReadOnlyReason =
  | "none"
  | "permission-denied"
  | "publishing"
  | "review-locked"
  | "restoring"
  | "stopped"
  | "version-preview";

export type WorkflowModeState = {
  canEdit?: boolean;
  canPublish?: boolean;
  isPreviewingVersion: boolean;
  publishState?: WorkflowDraftPublishStatus;
  reviewStatus?: "pending" | "approved" | "rejected" | "withdrawn" | "obsolete" | "published";
  restoreState?: WorkflowDraftRestoreStatus;
  runtimeStatus?: "active" | "inactive" | "paused" | "stopped";
};

export type WorkflowModePermissions = {
  canEditGraph: boolean;
  canEditNodeSettings: boolean;
  canMoveNodes: boolean;
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
  canPublish = true,
  isPreviewingVersion,
  publishState,
  reviewStatus,
  restoreState,
  runtimeStatus,
}: WorkflowModeState): WorkflowModeStateResult {
  const isPublishing = publishState === "publishing";
  const isRestoring = restoreState === "restoring";
  const isPreviewMode = isPreviewingVersion;
  const readOnlyReason = getWorkflowReadOnlyReason({
    canEdit,
    isPreviewingVersion,
    isPublishing,
    isRestoring,
    reviewStatus,
    runtimeStatus,
  });
  const mode = getWorkflowWorkspaceMode({
    readOnlyReason,
  });
  const nodesReadOnly = readOnlyReason !== "none";
  const canvasReadOnly = readOnlyReason !== "none";
  const canMutate = canEdit && !nodesReadOnly;
  const canMoveNodes = canMutate || readOnlyReason === "stopped";

  return {
    isPreviewMode,
    mode,
    permissions: {
      canEditGraph: canMutate,
      canEditNodeSettings: canMutate,
      canMoveNodes,
      canOpenInsertPalette: canMutate,
      canPublish: canMutate && canPublish,
      canUseClipboard: canMutate,
      canUseHistory: canMutate,
      canvasReadOnly,
      nodesReadOnly,
    },
    readOnlyReason,
  };
}

function getWorkflowWorkspaceMode({ readOnlyReason }: {
  readOnlyReason: WorkflowReadOnlyReason;
}): WorkflowWorkspaceMode {
  if (readOnlyReason === "restoring") return "restoring";
  if (readOnlyReason === "version-preview") return "version-preview";
  if (readOnlyReason === "publishing") return "publishing";
  if (readOnlyReason === "review-locked") return "read-only";
  if (readOnlyReason === "stopped") return "read-only";
  return "editing";
}

function getWorkflowReadOnlyReason({
  canEdit,
  isPreviewingVersion,
  isPublishing,
  isRestoring,
  reviewStatus,
  runtimeStatus,
}: {
  canEdit: boolean;
  isPreviewingVersion: boolean;
  isPublishing: boolean;
  isRestoring: boolean;
  reviewStatus?: WorkflowModeState["reviewStatus"];
  runtimeStatus?: WorkflowModeState["runtimeStatus"];
}): WorkflowReadOnlyReason {
  if (isRestoring) {
    return "restoring";
  }

  if (isPreviewingVersion) {
    return "version-preview";
  }

  if (isPublishing) {
    return "publishing";
  }

  if (reviewStatus === "pending" || reviewStatus === "approved") {
    return "review-locked";
  }

  if (runtimeStatus === "stopped") {
    return "stopped";
  }

  if (!canEdit) {
    return "permission-denied";
  }

  return "none";
}
