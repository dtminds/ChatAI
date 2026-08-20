import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { WorkflowPublishReview } from "@chatai/contracts";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkflowReviewPanel } from "@/pages/chat/workflow/canvas/workflow-review-panel";
import { useAuthStore } from "@/store/auth-store";

describe("WorkflowReviewPanel", () => {
  beforeEach(() => {
    useAuthStore.setState(useAuthStore.getInitialState(), true);
  });

  it("offers approval and confirms withdrawal without self rejection", async () => {
    const user = userEvent.setup();
    const onWithdraw = vi.fn(async () => true);
    useAuthStore.getState().setSession({
      accountType: "sub",
      displayName: "运营主管",
      permissions: ["chat.access"],
      role: "admin",
      subUserId: "101",
      uid: 1,
    });

    renderPanel(createReview({ submittedBySubUserId: "101" }), { onWithdraw });

    expect(screen.getByRole("button", { name: "通过" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "驳回" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "撤回审核" }));
    expect(onWithdraw).not.toHaveBeenCalled();
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "确认" }));
    expect(onWithdraw).toHaveBeenCalledOnce();
  });

  it("requires another reviewer to provide a rejection reason", async () => {
    const user = userEvent.setup();
    const onReject = vi.fn(async () => true);
    renderPanel(createReview(), { onReject });

    expect(screen.queryByRole("button", { name: "撤回审核" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "驳回" }));
    await user.click(screen.getByRole("button", { name: "确认驳回" }));
    expect(onReject).not.toHaveBeenCalled();

    const panel = screen.getByRole("complementary");
    await user.type(within(panel).getByRole("textbox"), "进入条件需要调整");
    await user.click(screen.getByRole("button", { name: "确认驳回" }));
    expect(onReject).toHaveBeenCalledWith("进入条件需要调整");
  });

  it("limits review comments to 200 characters and shows the current count", async () => {
    const user = userEvent.setup();
    renderPanel(createReview());

    const input = screen.getByRole("textbox");
    expect(input).toHaveAttribute("maxlength", "200");
    expect(screen.getByText("0/200")).toBeInTheDocument();

    await user.type(input, "审".repeat(201));

    expect(input).toHaveValue("审".repeat(200));
    expect(screen.getByText("200/200")).toBeInTheDocument();
  });

  it("shows who decided a rejected review and when", () => {
    renderPanel(createReview({
      reviewComment: "进入条件需要调整",
      reviewedAt: "2026-08-16T11:30:00.000+08:00",
      reviewedBySubUserId: "303",
      status: "rejected",
    }));

    expect(screen.getByText(/其他管理员于 .* 审核驳回/)).toBeInTheDocument();
    expect(screen.getByText("进入条件需要调整")).toBeInTheDocument();
  });

  it("shows publication as a fact without changing the approved decision", () => {
    renderPanel(createReview({
      publishedAt: "2026-08-16T12:00:00.000+08:00",
      resultingRevision: 3,
      reviewedAt: "2026-08-16T11:30:00.000+08:00",
      reviewedBySubUserId: "303",
      status: "approved",
    }));

    expect(screen.getByText("审核通过")).toBeInTheDocument();
    expect(screen.getByText(/版本 3/)).toBeInTheDocument();
  });

  it("opens the published version from the publication record", async () => {
    const user = userEvent.setup();
    const onViewPublishedVersion = vi.fn();
    renderPanel(createReview({
      publishedAt: "2026-08-16T12:00:00.000+08:00",
      resultingRevision: 3,
      status: "approved",
    }), { onViewPublishedVersion });

    await user.click(screen.getByRole("button", { name: "查看版本" }));

    expect(onViewPublishedVersion).toHaveBeenCalledOnce();
  });

  it("restores an unpublished historical review snapshot", async () => {
    const user = userEvent.setup();
    const onRestore = vi.fn(async () => true);
    renderPanel(createReview({ status: "withdrawn" }), { onRestore });

    await user.click(screen.getByRole("button", { name: "还原到该版本" }));
    expect(onRestore).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "确认还原" }));

    expect(onRestore).toHaveBeenCalledOnce();
  });
});

function renderPanel(
  review: WorkflowPublishReview,
  overrides: Partial<React.ComponentProps<typeof WorkflowReviewPanel>> = {},
) {
  return render(
    <WorkflowReviewPanel
      onApprove={vi.fn(async () => true)}
      onClose={vi.fn()}
      onReject={vi.fn(async () => true)}
      onWithdraw={vi.fn(async () => true)}
      pending={false}
      review={review}
      {...overrides}
    />,
  );
}

function createReview(overrides: Partial<WorkflowPublishReview> = {}): WorkflowPublishReview {
  return {
    basePublishedRevision: null,
    changeSummary: {
      addedNodes: [{ id: "start", kind: "start", title: "开始" }],
      changedNodes: [],
      firstPublication: true,
      pathChanged: true,
      removedNodes: [],
      triggerChanged: true,
    },
    checkedAt: "2026-08-16T10:00:00.000+08:00",
    id: "review-1",
    publishedAt: null,
    publishedBySubUserId: null,
    resultingRevision: null,
    reviewComment: null,
    reviewedAt: null,
    reviewedBySubUserId: null,
    sourceDraftVersion: 2,
    status: "pending",
    submittedAt: "2026-08-16T10:00:00.000+08:00",
    submittedBySubUserId: "202",
    workflowId: "workflow-1",
    ...overrides,
  };
}
