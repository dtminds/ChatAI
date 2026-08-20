import { describe, expect, it } from "vitest";
import {
  getWorkflowPrimaryReleaseAction,
  getWorkflowPublishAction,
  getWorkflowRuntimeMenuItem,
  getWorkflowSubmitReviewAction,
} from "@/pages/chat/workflow/canvas/workflow-design-actions";
import type { WorkflowPublishReview } from "@chatai/contracts";

describe("workflow design actions", () => {
  it("keeps submit disabled until there are unpublished changes", () => {
    expect(getWorkflowSubmitReviewAction(createSubmitInput({
      hasUnpublishedChanges: false,
    }))).toMatchObject({ disabled: true, label: "提交审核" });
    expect(getWorkflowSubmitReviewAction(createSubmitInput({
      hasUnpublishedChanges: true,
    }))).toMatchObject({ disabled: false, label: "提交审核" });
  });

  it("locks submit while a review is pending or already approved", () => {
    expect(getWorkflowSubmitReviewAction(createSubmitInput({
      currentReview: createReview("pending"),
      hasUnpublishedChanges: true,
    })).disabled).toBe(true);
    expect(getWorkflowSubmitReviewAction(createSubmitInput({
      currentReview: createReview("approved"),
      hasUnpublishedChanges: true,
    })).disabled).toBe(true);
  });

  it("relabels submit after rejection", () => {
    expect(getWorkflowSubmitReviewAction(createSubmitInput({
      currentReview: createReview("rejected"),
      hasUnpublishedChanges: true,
    }))).toMatchObject({ disabled: false, label: "重新提交审核" });
  });

  it("shows submit or publish, never both", () => {
    expect(getWorkflowPrimaryReleaseAction({
      hasUnpublishedChanges: true,
    })).toBe("submit");
    expect(getWorkflowPrimaryReleaseAction({
      currentReview: createReview("rejected"),
      hasUnpublishedChanges: true,
    })).toBe("submit");
    expect(getWorkflowPrimaryReleaseAction({
      currentReview: createReview("approved"),
      hasUnpublishedChanges: true,
    })).toBe("publish");
    expect(getWorkflowPrimaryReleaseAction({
      hasUnpublishedChanges: false,
    })).toBe("publish");
    expect(getWorkflowPrimaryReleaseAction({
      currentReview: createReview("pending"),
      hasUnpublishedChanges: true,
    })).toBe("publish");
  });

  it("enables publish only after review approval", () => {
    expect(getWorkflowPublishAction({
      canPublish: true,
      hasUnpublishedChanges: false,
      publishState: "idle",
      saveState: "saved",
    }).disabled).toBe(true);
    expect(getWorkflowPublishAction({
      canPublish: true,
      currentReview: createReview("approved"),
      hasUnpublishedChanges: true,
      publishState: "idle",
      saveState: "saved",
    }).disabled).toBe(false);
  });

  it("hides runtime controls until a version has been published", () => {
    expect(getWorkflowRuntimeMenuItem({
      hasUnpublishedChanges: false,
      lifecycleActionState: "idle",
      publishedRevision: null,
      runtimeStatus: "inactive",
    })).toBeNull();
    expect(getWorkflowRuntimeMenuItem({
      hasUnpublishedChanges: false,
      lifecycleActionState: "idle",
      publishedRevision: 1,
      runtimeStatus: "inactive",
    })).toEqual({ action: "enable", label: "启用" });
    expect(getWorkflowRuntimeMenuItem({
      hasUnpublishedChanges: true,
      lifecycleActionState: "idle",
      publishedRevision: 1,
      runtimeStatus: "paused",
    })).toEqual({ action: "resume", label: "启用已发布版本" });
    expect(getWorkflowRuntimeMenuItem({
      hasUnpublishedChanges: false,
      lifecycleActionState: "idle",
      publishedRevision: 1,
      runtimeStatus: "active",
    })).toEqual({ action: "pause", label: "暂停" });
  });
});

function createSubmitInput(
  overrides: Partial<Parameters<typeof getWorkflowSubmitReviewAction>[0]> = {},
) {
  return {
    canEdit: true,
    canPublish: true,
    hasUnpublishedChanges: false,
    reviewActionState: "idle" as const,
    saveState: "saved" as const,
    ...overrides,
  };
}

function createReview(status: WorkflowPublishReview["status"]): WorkflowPublishReview {
  return {
    basePublishedRevision: null,
    changeSummary: {
      addedNodes: [],
      changedNodes: [],
      firstPublication: true,
      pathChanged: false,
      removedNodes: [],
      triggerChanged: false,
    },
    checkedAt: "2026-08-16T10:00:00.000+08:00",
    id: "review-1",
    publishedAt: null,
    publishedBySubUserId: null,
    resultingRevision: null,
    reviewComment: null,
    reviewedAt: null,
    reviewedBySubUserId: null,
    sourceDraftVersion: 1,
    status,
    submittedAt: "2026-08-16T10:00:00.000+08:00",
    submittedBySubUserId: "sub-user-1",
    workflowId: "workflow-1",
  };
}
