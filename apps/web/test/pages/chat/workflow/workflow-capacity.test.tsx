import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
    const loadingCapacityRegions = screen.getAllByRole("region", { name: "SOP 客户容量" });
    for (const capacity of loadingCapacityRegions) {
      expect(within(capacity).getByRole("status")).toHaveTextContent("正在加载");
    }

    await act(async () => {
      resolveCapacity?.({
        capacityRejectedCountToday: 0,
        status: "normal",
        usagePercent: 0,
      });
    });
    for (const capacity of await screen.findAllByRole("region", { name: "SOP 客户容量" })) {
      expect(within(capacity).getByText("100%")).toBeInTheDocument();
    }
  });

  it("shows full capacity without preventing the Workflow list from loading", async () => {
    const user = userEvent.setup();
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

    const capacityRegions = await screen.findAllByRole("region", { name: "SOP 客户容量" });
    for (const capacity of capacityRegions) {
      expect(within(capacity).getByRole("progressbar", { name: "SOP 客户容量使用进度" }))
        .toHaveAttribute("aria-valuenow", "100");
      expect(within(capacity).getByText("0%")).toBeInTheDocument();
      expect(within(capacity).getByText(/12 次/)).toBeInTheDocument();
      expect(within(capacity).queryByText("10,000")).not.toBeInTheDocument();
    }
    await user.hover(screen.getAllByRole("button", { name: "查看剩余用量说明" })[0]);
    expect(await screen.findByRole("tooltip")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("新人转化旅程")).toBeInTheDocument());
  });

  it("shows the tenant operating metrics without deriving them from the paged list", async () => {
    const repository = {
      ...createInMemoryWorkflowDraftRepository(),
      getTenantOverview: () => ({
        activeWorkflowCount: 23,
        recentFailedRunCount: 231,
        recentSuccessRatePercent: 98.2,
        todayRunCount: 12_847,
        todayRunCountChangePercent: 12,
        totalWorkflowCount: 38,
      }),
    };

    render(
      <MemoryRouter>
        <WorkflowPage repository={repository} />
      </MemoryRouter>,
    );

    const overview = await screen.findByRole("region", { name: "Workflow 数据概览" });
    expect(within(overview).getByText("12,847")).toBeInTheDocument();
    expect(within(overview).getByText("23")).toBeInTheDocument();
    expect(within(overview).getByText("98.2%")).toBeInTheDocument();
    expect(within(overview).getByText(/231 次/)).toBeInTheDocument();
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

    for (const capacity of await screen.findAllByRole("region", { name: "SOP 客户容量" })) {
      expect(within(capacity).getByRole("progressbar", { name: "SOP 客户容量使用进度" }))
        .toHaveAttribute("aria-valuenow", "80");
      expect(within(capacity).getByText("20%")).toBeInTheDocument();
    }
  });

  it("shows the medium capacity usage as a percentage", async () => {
    const repository = {
      ...createInMemoryWorkflowDraftRepository(),
      getCapacityOverview: () => ({
        capacityRejectedCountToday: 0,
        status: "normal" as const,
        usagePercent: 56,
      }),
    };

    render(
      <MemoryRouter>
        <WorkflowPage repository={repository} />
      </MemoryRouter>,
    );

    for (const capacity of await screen.findAllByRole("region", { name: "SOP 客户容量" })) {
      expect(within(capacity).getByText("44%")).toBeInTheDocument();
    }
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

    expect((await screen.findAllByRole("button", { name: "重新加载容量" })).length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.getByText("新人转化旅程")).toBeInTheDocument());
  });
});
