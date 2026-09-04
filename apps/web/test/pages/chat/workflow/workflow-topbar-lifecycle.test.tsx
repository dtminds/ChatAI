import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { WorkflowPublishReview } from "@chatai/contracts";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { WorkflowTopBar } from "@/pages/chat/workflow/canvas/workflow-topbar";

describe("WorkflowTopBar review lifecycle", () => {
  it("submits an editable draft for review", async () => {
    const user = userEvent.setup();
    const onSubmitReview = vi.fn();
    renderTopBar({
      hasUnpublishedChanges: true,
      onSubmitReview,
      publishedRevision: null,
    });

    expect(screen.getByText("草稿")).toBeInTheDocument();
    expect(screen.queryByText("有尚未发布的修改")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "发布" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "提交审核" }));
    expect(onSubmitReview).not.toHaveBeenCalled();
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "提交审核" }));
    expect(onSubmitReview).toHaveBeenCalledOnce();
  });

  it("shows the unpublished-change indicator only after a version has been published", () => {
    renderTopBar({
      hasUnpublishedChanges: true,
      publishedRevision: 1,
    });

    expect(screen.getByText("有尚未发布的修改")).toBeInTheDocument();
  });

  it("keeps rejected review actions separate from the runtime status", () => {
    const review = createReview({ status: "rejected" });
    const { rerender } = renderTopBar({
      currentReview: review,
      hasUnpublishedChanges: true,
      publishedRevision: null,
    });

    expect(screen.getByText("草稿")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重新提交审核" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "发布" })).not.toBeInTheDocument();

    rerender(createTopBar({
      currentReview: review,
      hasUnpublishedChanges: true,
      publishedRevision: 2,
      runtimeStatus: "active",
    }));
    expect(screen.getByText("运行中")).toBeInTheDocument();
  });

  it("keeps publish disabled while a review is pending", () => {
    renderTopBar({
      currentReview: createReview(),
      hasUnpublishedChanges: true,
      publishedRevision: 1,
      runtimeStatus: "active",
    });

    expect(screen.getByText("运行中")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "撤回审核" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "审核" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "提交审核" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发布" })).toBeDisabled();
  });

  it("requires confirmation before publishing an approved review", async () => {
    const user = userEvent.setup();
    const onPublish = vi.fn();
    renderTopBar({
      canPublish: true,
      currentReview: createReview({ status: "approved" }),
      hasUnpublishedChanges: true,
      onPublish,
      publishedRevision: 1,
    });

    expect(screen.getByText("未启用")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "提交审核" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "继续修改" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "查看审核详情" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "发布" }));
    expect(onPublish).not.toHaveBeenCalled();
    const publishDialog = within(screen.getByRole("alertdialog"));
    await user.click(publishDialog.getByRole("button", { name: "发布" }));
    expect(onPublish).toHaveBeenCalledOnce();
  });

  it("does not render an overflow menu for runtime or template actions", () => {
    const { rerender } = renderTopBar({
      currentReview: createReview(),
      hasUnpublishedChanges: true,
      publishedRevision: 1,
      runtimeStatus: "inactive",
    });

    expect(screen.queryByRole("button", { name: "更多操作" })).not.toBeInTheDocument();

    rerender(createTopBar({
      currentReview: createReview({ status: "approved" }),
      hasUnpublishedChanges: true,
      publishedRevision: 1,
      runtimeStatus: "active",
    }));
    expect(screen.getByRole("button", { name: "发布" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "更多操作" })).not.toBeInTheDocument();
  });

  it("keeps release and runtime actions hidden for a stopped workflow", () => {
    renderTopBar({
      canEdit: false,
      canPublish: false,
      hasUnpublishedChanges: true,
      publishedRevision: 1,
      runtimeStatus: "stopped",
    });

    expect(screen.getByRole("button", { name: "版本历史" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "提交审核" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "发布" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "更多操作" })).not.toBeInTheDocument();
  });

  it("switches between design and data modes", async () => {
    const user = userEvent.setup();
    const onModeChange = vi.fn();
    renderTopBar({ onModeChange });

    await user.click(screen.getByRole("tab", { name: "数据" }));
    expect(onModeChange).toHaveBeenCalledWith("data");
  });

  it("confirms before restoring a version preview and can return to editing", async () => {
    const user = userEvent.setup();
    const onExitPreview = vi.fn();
    const onRestoreVersion = vi.fn();
    renderTopBar({
      isPreviewingVersion: true,
      onExitPreview,
      onRestoreVersion,
      previewVersionLabel: "版本 1",
      previewVersionMeta: "08-16 17:00:00",
    });

    await user.click(screen.getByRole("button", { name: "还原到该版本" }));
    expect(onRestoreVersion).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "确认还原" }));
    expect(onRestoreVersion).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: "返回最新" }));
    expect(onExitPreview).toHaveBeenCalledOnce();
  });
});

function renderTopBar(overrides: Partial<React.ComponentProps<typeof WorkflowTopBar>> = {}) {
  return render(createTopBar(overrides));
}

function createTopBar(overrides: Partial<React.ComponentProps<typeof WorkflowTopBar>> = {}) {
  return (
    <WorkflowTopBar
      lastSavedAt="刚刚"
      mode="design"
      onOpenVersionHistory={vi.fn()}
      onPublish={vi.fn()}
      publishedAt={null}
      publishState="idle"
      saveState="saved"
      workflowName="新客培育"
      {...overrides}
    />
  );
}

function createReview(overrides: Partial<WorkflowPublishReview> = {}): WorkflowPublishReview {
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
    status: "pending",
    submittedAt: "2026-08-16T10:00:00.000+08:00",
    submittedBySubUserId: "sub-user-1",
    workflowId: "workflow-1",
    ...overrides,
  };
}
