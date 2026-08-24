import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import {
  createInMemoryWorkflowDraftRepository,
} from "@/pages/chat/workflow/workflow-draft-service";
import { WorkflowPage } from "@/pages/chat/workflow/workflow-list-page";

describe("Workflow tenant capacity", () => {
  it("shows full capacity without preventing the Workflow list from loading", async () => {
    const repository = {
      ...createInMemoryWorkflowDraftRepository(),
      getCapacityOverview: () => ({
        activeRunCount: 10_000,
        activeRunLimit: 10_000,
        capacityRejectedCountToday: 12,
        date: "2026-08-24",
      }),
    };

    render(
      <MemoryRouter>
        <WorkflowPage repository={repository} />
      </MemoryRouter>,
    );

    const capacity = await screen.findByRole("region", { name: "SOP 客户容量" });
    expect(within(capacity).getByRole("progressbar", { name: "SOP 客户容量使用进度" }))
      .toHaveAttribute("aria-valuenow", "100");
    expect(within(capacity).getByText("容量已用完")).toBeInTheDocument();
    expect(within(capacity).getByText("12")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("新人转化旅程")).toBeInTheDocument());
  });
});
