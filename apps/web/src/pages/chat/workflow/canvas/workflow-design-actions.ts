import type { WorkflowPublishReview } from "@chatai/contracts";
import type { WorkflowDraftPublishStatus, WorkflowDraftSaveStatus } from "../workflow-draft-service";

export type WorkflowDesignAction = {
  disabled: boolean;
  label: string;
  reason?: string;
};

export type WorkflowPrimaryReleaseAction = "publish" | "submit";

export function getWorkflowPrimaryReleaseAction({
  currentReview,
  hasUnpublishedChanges,
  runtimeStatus,
}: {
  currentReview?: WorkflowPublishReview | null;
  hasUnpublishedChanges: boolean;
  runtimeStatus: "active" | "inactive" | "paused" | "stopped";
}): WorkflowPrimaryReleaseAction | null {
  if (runtimeStatus === "stopped") return null;
  if (currentReview?.status === "approved") return "publish";
  if (currentReview?.status === "pending") return "publish";
  if (hasUnpublishedChanges) return "submit";
  return "publish";
}

export type WorkflowRuntimeMenuItem = {
  action: "enable" | "pause" | "resume";
  label: string;
};

export function getWorkflowSubmitReviewAction({
  canEdit,
  canPublish,
  currentReview,
  hasUnpublishedChanges,
  reviewActionState,
  saveState,
}: {
  canEdit: boolean;
  canPublish: boolean;
  currentReview?: WorkflowPublishReview | null;
  hasUnpublishedChanges: boolean;
  reviewActionState: "idle" | "submitting" | "approving" | "rejecting" | "withdrawing";
  saveState: WorkflowDraftSaveStatus;
}): WorkflowDesignAction {
  const label = currentReview?.status === "rejected" ? "重新提交审核" : "提交审核";
  if (reviewActionState === "submitting") {
    return { disabled: true, label: "提交中" };
  }
  if (currentReview?.status === "pending") {
    return { disabled: true, label, reason: "正在审核中" };
  }
  if (currentReview?.status === "approved") {
    return { disabled: true, label, reason: "已通过审核，可以直接发布" };
  }
  if (!hasUnpublishedChanges) {
    return { disabled: true, label, reason: "当前没有待提交的修改" };
  }
  if (!canEdit || !canPublish) {
    return { disabled: true, label, reason: "当前无法提交审核" };
  }
  if (saveState === "error") {
    return { disabled: true, label, reason: "请先处理保存失败" };
  }
  if (reviewActionState !== "idle") {
    return { disabled: true, label };
  }
  return { disabled: false, label };
}

export function getWorkflowPublishAction({
  canPublish,
  currentReview,
  hasUnpublishedChanges,
  publishState,
  saveState,
}: {
  canPublish: boolean;
  currentReview?: WorkflowPublishReview | null;
  hasUnpublishedChanges: boolean;
  publishState: WorkflowDraftPublishStatus;
  saveState: WorkflowDraftSaveStatus;
}): WorkflowDesignAction {
  const publishing = publishState === "publishing";
  const label = publishing ? "发布中" : "发布";
  if (currentReview?.status === "pending") {
    return { disabled: true, label, reason: "待审核通过后可发布" };
  }
  if (currentReview?.status === "approved") {
    if (!canPublish) {
      return { disabled: true, label, reason: "当前无法发布" };
    }
    if (saveState !== "saved" || publishing) {
      return {
        disabled: true,
        label,
        reason: publishing ? undefined : "保存完成后再发布",
      };
    }
    return { disabled: false, label };
  }
  return {
    disabled: true,
    label,
    reason: hasUnpublishedChanges ? "请先提交审核" : "当前没有可发布的变更",
  };
}

export function getWorkflowRuntimeMenuItem({
  hasUnpublishedChanges,
  lifecycleActionState,
  publishedRevision,
  runtimeStatus,
}: {
  hasUnpublishedChanges: boolean;
  lifecycleActionState: "enabling" | "idle" | "pausing" | "resuming";
  publishedRevision?: number | null;
  runtimeStatus: "active" | "inactive" | "paused" | "stopped";
}): WorkflowRuntimeMenuItem | null {
  if (publishedRevision == null || runtimeStatus === "stopped") return null;
  if (runtimeStatus === "active") {
    return {
      action: "pause",
      label: lifecycleActionState === "pausing" ? "暂停中" : "暂停",
    };
  }
  const enabling = runtimeStatus === "paused"
    ? lifecycleActionState === "resuming"
    : lifecycleActionState === "enabling";
  return {
    action: runtimeStatus === "paused" ? "resume" : "enable",
    label: enabling
      ? "启用中"
      : hasUnpublishedChanges ? "启用已发布版本" : "启用",
  };
}
