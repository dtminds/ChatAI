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
    await user.click(screen.getByRole("button", { name: "提交审核" }));
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
    expect(screen.getByRole("button", { name: "重新提交审核" })).toBeInTheDocument();

    rerender(createTopBar({
      currentReview: review,
      hasUnpublishedChanges: true,
      publishedRevision: 2,
      runtimeStatus: "active",
    }));
    expect(screen.getByText("运行中")).toBeInTheDocument();
  });

  it("shows review and withdraw actions while pending", async () => {
    const user = userEvent.setup();
    const onOpenReview = vi.fn();
    const onWithdrawReview = vi.fn(async () => true);
    renderTopBar({
      currentReview: createReview(),
      hasUnpublishedChanges: true,
      onOpenReview,
      onWithdrawReview,
      publishedRevision: 1,
      runtimeStatus: "active",
    });

    expect(screen.getByText("运行中")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "审核" }));
    await user.click(screen.getByRole("button", { name: "撤回审核" }));
    expect(onOpenReview).toHaveBeenCalledOnce();
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "确认" }));
    expect(onWithdrawReview).toHaveBeenCalledOnce();
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
    expect(screen.queryByRole("button", { name: "继续修改" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "查看审核详情" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "发布" }));
    expect(onPublish).not.toHaveBeenCalled();
    const publishDialog = within(screen.getByRole("alertdialog"));
    expect(publishDialog.getByText(/已删除等待节点上的客户可能被清退/)).toBeInTheDocument();
    await user.click(publishDialog.getByRole("button", { name: "发布" }));
    expect(onPublish).toHaveBeenCalledOnce();
  });

  it("keeps activation available for the published version while review occupies the primary action", async () => {
    const user = userEvent.setup();
    const onEnable = vi.fn(async () => true);
    const { rerender } = renderTopBar({
      currentReview: createReview(),
      hasUnpublishedChanges: true,
      onEnable,
      publishedRevision: 1,
      runtimeStatus: "inactive",
    });

    await user.click(screen.getByRole("button", { name: "启用已发布版本" }));

    rerender(createTopBar({
      currentReview: createReview({ status: "approved" }),
      hasUnpublishedChanges: true,
      onEnable,
      publishedRevision: 1,
      runtimeStatus: "inactive",
    }));
    await user.click(screen.getByRole("button", { name: "启用已发布版本" }));

    expect(onEnable).toHaveBeenCalledTimes(2);
  });

  it("identifies reviewed content in design mode and published data in data mode", () => {
    const review = createReview({ status: "approved" });
    const { rerender } = renderTopBar({
      currentReview: review,
      hasUnpublishedChanges: true,
      publishedRevision: 1,
    });

    expect(screen.getByText("已审核内容")).toBeInTheDocument();

    rerender(createTopBar({
      currentReview: review,
      hasUnpublishedChanges: true,
      mode: "data",
      publishedRevision: 1,
    }));
    expect(screen.getByText("当前已发布版本数据")).toBeInTheDocument();
  });

  it("offers enable only after a formal version has been published", async () => {
    const user = userEvent.setup();
    const onEnable = vi.fn(async () => true);
    renderTopBar({
      hasUnpublishedChanges: false,
      onEnable,
      publishedRevision: 1,
      runtimeStatus: "inactive",
    });

    expect(screen.getByText("未启用")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "发布" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "启用" }));
    expect(onEnable).toHaveBeenCalledOnce();
  });

  it("shows only the runtime status when the active workflow has no pending version", () => {
    renderTopBar({
      hasUnpublishedChanges: false,
      publishedRevision: 1,
      runtimeStatus: "active",
    });

    expect(screen.getByText("运行中")).toBeInTheDocument();
    expect(screen.queryByText(/已是最新版本/)).not.toBeInTheDocument();
  });

  it("switches between design and data modes", async () => {
    const user = userEvent.setup();
    const onModeChange = vi.fn();
    renderTopBar({ onModeChange });

    await user.click(screen.getByRole("tab", { name: "数据" }));
    expect(onModeChange).toHaveBeenCalledWith("data");
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
      onPublishCheck={vi.fn()}
      publishedAt={null}
      publishReady
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
