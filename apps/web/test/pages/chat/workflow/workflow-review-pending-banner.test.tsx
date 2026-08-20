import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { WorkflowReviewPendingBanner } from "@/pages/chat/workflow/canvas/workflow-review-pending-banner";

describe("WorkflowReviewPendingBanner", () => {
  it("opens the pending review from the canvas banner", async () => {
    const user = userEvent.setup();
    const onOpenReview = vi.fn();

    render(
      <WorkflowReviewPendingBanner
        onOpenReview={onOpenReview}
      />,
    );

    expect(screen.getByRole("status", { name: "待审核" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "去审核" }));
    expect(onOpenReview).toHaveBeenCalledOnce();
  });
});
