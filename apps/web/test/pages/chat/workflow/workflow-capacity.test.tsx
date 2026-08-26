import { act, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import {
  createInMemoryWorkflowDraftRepository,
} from "@/pages/chat/workflow/workflow-draft-service";
import { WorkflowPage } from "@/pages/chat/workflow/workflow-list-page";

describe("Workflow tenant capacity", () => {
  it("keeps capacity in loading state until its independent request completes", async () => {
    let resolveCapacity: ((value: {
      capacityRejectedCountToday: number;
      status: "normal" | "warning" | "full";
      usagePercent: number;
    }) => void) | undefined;
    const repository = {
      ...createInMemoryWorkflowDraftRepository(),
      getCapacityOverview: () => new Promise<{
        capacityRejectedCountToday: number;
        status: "normal" | "warning" | "full";
        usagePercent: number;
      }>(resolve => { resolveCapacity = resolve; }),
    };

    render(
      <MemoryRouter>
        <WorkflowPage repository={repository} />
      </MemoryRouter>,
    );

    await screen.findByText("新人转化旅程");
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "SOP 客户容量" })).not.toBeInTheDocument();

    await act(async () => {
      resolveCapacity?.({
        capacityRejectedCountToday: 0,
        status: "normal",
        usagePercent: 25,
      });
    });
    expect(await screen.findByRole("region", { name: "SOP 客户容量" })).toBeInTheDocument();
  });

  it("shows full capacity without preventing the Workflow list from loading", async () => {
    const repository = {
      ...createInMemoryWorkflowDraftRepository(),
      getCapacityOverview: () => ({
        capacityRejectedCountToday: 12,
        status: "full" as const,
        usagePercent: 100,
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
    expect(within(capacity).getByText("100%")).toBeInTheDocument();
    expect(within(capacity).getByText("12")).toBeInTheDocument();
    expect(within(capacity).queryByText("10,000")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("新人转化旅程")).toBeInTheDocument());
  });

  it("shows the near-full state before capacity is exhausted", async () => {
    const repository = {
      ...createInMemoryWorkflowDraftRepository(),
      getCapacityOverview: () => ({
        capacityRejectedCountToday: 0,
        status: "warning" as const,
        usagePercent: 80,
      }),
    };

    render(
      <MemoryRouter>
        <WorkflowPage repository={repository} />
      </MemoryRouter>,
    );

    const capacity = await screen.findByRole("region", { name: "SOP 客户容量" });
    expect(within(capacity).getByRole("progressbar", { name: "SOP 客户容量使用进度" }))
      .toHaveAttribute("aria-valuenow", "80");
    expect(within(capacity).getByText("容量即将用完")).toBeInTheDocument();
    expect(within(capacity).queryByText("容量已用完")).not.toBeInTheDocument();
  });

  it("keeps the Workflow list usable when capacity cannot be loaded", async () => {
    const repository = {
      ...createInMemoryWorkflowDraftRepository(),
      getCapacityOverview: () => {
        throw new TypeError("network unavailable");
      },
    };

    render(
      <MemoryRouter>
        <WorkflowPage repository={repository} />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("button", { name: "重新加载容量" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("新人转化旅程")).toBeInTheDocument());
  });
});
