import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { WorkflowPublishReview } from "@chatai/contracts";
import { WorkflowVersionHistoryPanel } from "@/pages/chat/workflow/canvas/workflow-version-history";

describe("WorkflowVersionHistoryPanel", () => {
  it("disables restore while review locks editing", async () => {
    const user = userEvent.setup();
    const onRestoreVersion = vi.fn();
    renderPanel({ canRestore: false, onRestoreVersion });

    await user.click(screen.getByRole("button", { name: "恢复" }));

    expect(screen.getByRole("button", { name: "恢复" })).toBeDisabled();
    expect(onRestoreVersion).not.toHaveBeenCalled();
  });

  it("formats review timestamps instead of rendering raw ISO values", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("tab", { name: "审核记录" }));

    expect(await screen.findByText("08/16 18:00")).toBeInTheDocument();
    expect(screen.queryByText("2026-08-16T10:00:00.000Z")).not.toBeInTheDocument();
  });
});

function renderPanel({
  canRestore = true,
  onRestoreVersion = vi.fn(),
}: {
  canRestore?: boolean;
  onRestoreVersion?: (versionId: string) => void;
} = {}) {
  return render(
    <WorkflowVersionHistoryPanel
      canRestore={canRestore}
      currentPreviewVersionId="workflow-1-r1"
      loadReviews={async () => [createReview()]}
      onClose={vi.fn()}
      onExitPreview={vi.fn()}
      onRestoreVersion={onRestoreVersion}
      onSelectVersion={vi.fn()}
      restoreState="idle"
      versions={[{
        draft: { edges: [], nodes: [], viewport: { x: 0, y: 0, zoom: 1 } },
        id: "workflow-1-r1",
        name: "版本 1",
        publishedAt: "08-16 17:00:00",
        revision: 1,
      }]}
    />,
  );
}

function createReview(): WorkflowPublishReview {
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
    checkedAt: "2026-08-16T10:00:00.000Z",
    id: "review-1",
    publishedAt: null,
    publishedBySubUserId: null,
    resultingRevision: null,
    reviewComment: null,
    reviewedAt: null,
    reviewedBySubUserId: null,
    sourceDraftVersion: 1,
    status: "pending",
    submittedAt: "2026-08-16T10:00:00.000Z",
    submittedBySubUserId: "sub-user-1",
    workflowId: "workflow-1",
  };
}
