import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { WorkflowPublishReview } from "@chatai/contracts";
import { WorkflowVersionHistoryPanel } from "@/pages/chat/workflow/canvas/workflow-version-history";
import type { WorkflowVersionHistoryItem } from "@/pages/chat/workflow/workflow-draft-service";

describe("WorkflowVersionHistoryPanel", () => {
  it("disables restore while review locks editing", async () => {
    const user = userEvent.setup();
    const onRestoreVersion = vi.fn();
    renderPanel({ canRestore: false, onRestoreVersion });

    await user.click(screen.getByRole("button", { name: "还原到该版本" }));

    expect(screen.getByRole("button", { name: "还原到该版本" })).toBeDisabled();
    expect(onRestoreVersion).not.toHaveBeenCalled();
  });

  it("confirms before replacing the current draft with a published version", async () => {
    const user = userEvent.setup();
    const onRestoreVersion = vi.fn();
    renderPanel({ onRestoreVersion });

    await user.click(screen.getByRole("button", { name: "还原到该版本" }));
    expect(onRestoreVersion).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "确认还原" }));
    expect(onRestoreVersion).toHaveBeenCalledWith("workflow-1-r1");
  });

  it("formats review timestamps instead of rendering raw ISO values", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("tab", { name: "审核记录" }));

    expect(await screen.findByText("08/16 18:00")).toBeInTheDocument();
    expect(screen.queryByText("2026-08-16T10:00:00.000Z")).not.toBeInTheDocument();
  });

  it("opens the selected review record", async () => {
    const user = userEvent.setup();
    const onSelectReview = vi.fn();
    renderPanel({ onSelectReview });

    await user.click(screen.getByRole("tab", { name: "审核记录" }));
    await user.click(await screen.findByRole("button", { name: /待审核/ }));

    expect(onSelectReview).toHaveBeenCalledWith(expect.objectContaining({ id: "review-1" }));
  });

  it("loads reviews only after opening the review tab and requires an explicit load-more click", async () => {
    const user = userEvent.setup();
    const loadReviews = vi.fn(async (cursor?: string) => cursor
      ? { items: [createReview("review-2")], nextCursor: null }
      : { items: [createReview("review-1")], nextCursor: "review-1" });
    renderPanel({ loadReviews });

    expect(loadReviews).not.toHaveBeenCalled();
    await user.click(screen.getByRole("tab", { name: "审核记录" }));
    expect(await screen.findByRole("button", { name: "加载更多" })).toBeInTheDocument();
    expect(loadReviews).toHaveBeenCalledWith(undefined);

    await user.click(screen.getByRole("button", { name: "加载更多" }));
    expect(loadReviews).toHaveBeenLastCalledWith("review-1");
    expect(await screen.findAllByRole("button", { name: /待审核/ })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "加载更多" })).not.toBeInTheDocument();
  });

  it("loads more versions only after clicking the load-more button", async () => {
    const user = userEvent.setup();
    const loadMoreVersions = vi.fn(async () => ({ items: [], nextCursor: null }));
    renderPanel({ loadMoreVersions, nextVersionCursor: "1" });

    expect(loadMoreVersions).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "加载更多" }));

    expect(loadMoreVersions).toHaveBeenCalledWith("1");
  });

  it("allows retrying when the first review page fails", async () => {
    const user = userEvent.setup();
    const loadReviews = vi.fn()
      .mockRejectedValueOnce(new Error("request failed"))
      .mockResolvedValueOnce({ items: [createReview()], nextCursor: null });
    renderPanel({ loadReviews });

    await user.click(screen.getByRole("tab", { name: "审核记录" }));
    await user.click(await screen.findByRole("button", { name: "重试" }));

    expect(await screen.findByRole("button", { name: /待审核/ })).toBeInTheDocument();
    expect(loadReviews).toHaveBeenCalledTimes(2);
  });
});

function renderPanel({
  canRestore = true,
  loadMoreVersions = vi.fn(async () => ({ items: [], nextCursor: null })),
  loadReviews = vi.fn(async () => ({ items: [createReview()], nextCursor: null })),
  nextVersionCursor = null,
  onRestoreVersion = vi.fn(),
  onSelectReview = vi.fn(),
}: {
  canRestore?: boolean;
  loadMoreVersions?: (cursor: string) => Promise<{
    items: WorkflowVersionHistoryItem[];
    nextCursor: string | null;
  }>;
  loadReviews?: (cursor?: string) => Promise<{
    items: WorkflowPublishReview[];
    nextCursor: string | null;
  }>;
  nextVersionCursor?: string | null;
  onRestoreVersion?: (versionId: string) => void;
  onSelectReview?: (review: WorkflowPublishReview) => void;
} = {}) {
  return render(
    <WorkflowVersionHistoryPanel
      canRestore={canRestore}
      currentPreviewVersionId="workflow-1-r1"
      loadMoreVersions={loadMoreVersions}
      loadReviews={loadReviews}
      nextVersionCursor={nextVersionCursor}
      onClose={vi.fn()}
      onExitPreview={vi.fn()}
      onRestoreVersion={onRestoreVersion}
      onSelectReview={onSelectReview}
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

function createReview(id = "review-1"): WorkflowPublishReview {
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
    id,
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
