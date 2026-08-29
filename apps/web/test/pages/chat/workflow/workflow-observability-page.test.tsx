import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  WorkflowObservabilitySummaryResponse,
  WorkflowObservabilityWorkflowDetailResponse,
  WorkflowObservabilityWorkflowListResponse,
} from "@chatai/contracts";
import { RequestNormalizedError } from "@/lib/request";
import { WorkflowObservabilityPage } from "@/pages/chat/workflow/workflow-observability-page";

const api = vi.hoisted(() => ({
  getWorkflowObservabilityDetail: vi.fn(),
  getWorkflowObservabilitySummary: vi.fn(),
  listWorkflowObservabilityWorkflows: vi.fn(),
}));

vi.mock("@/pages/chat/workflow/workflow-observability-api", () => api);
vi.mock("@/pages/chat/ai-hosting/ai-hosting-layout", () => ({
  AiHostingLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AiHostingPageHeader: ({
    actions,
    title,
  }: {
    actions?: React.ReactNode;
    title: React.ReactNode;
  }) => (
    <div>
      <h1>{title}</h1>
      {actions}
    </div>
  ),
}));

const summary: WorkflowObservabilitySummaryResponse = {
  deadTransitionCount: 2,
  inference: { expiredLease: 0, pending: 1, retryWait: 0 },
  observedAt: 1_784_800_000_000,
  outbox: { pending: 0 },
  tasks: {
    dispatched: 0,
    dueBacklog: 3,
    expiredLease: 0,
    pending: 4,
    running: 1,
    stalledDispatched: 0,
    suspended: 0,
  },
  transitions: { dead: 2, leased: 0, pending: 1 },
  workers: [
    { health: "healthy", lastSuccessAt: 1_784_800_000_000, reportedBy: "worker-1", role: "scheduler" },
    { health: "unknown", role: "task-consumer" },
    { health: "unknown", role: "entry-consumer" },
    { health: "unknown", role: "inference" },
    { health: "unknown", role: "outbox" },
    { health: "offline", role: "reconciler" },
  ],
};

const listPage: WorkflowObservabilityWorkflowListResponse = {
  items: [
    {
      activeRunCount: 1,
      activeTaskCount: 2,
      dueBacklogCount: 3,
      name: "新客旅程",
      runtimeStatus: "active",
      totalRunCount: 10,
      transition: {
        attempt: 2,
        lastErrorCode: "LEASE_EXPIRED",
        nextAttemptAt: 1_784_800_000_000,
        status: "dead",
        targetStatus: "pending",
        updateTime: 1_784_800_000_000,
      },
      uid: 9,
      workflowId: "12",
    },
    {
      activeRunCount: 0,
      activeTaskCount: 1,
      dueBacklogCount: 0,
      name: "老客召回",
      runtimeStatus: "paused",
      totalRunCount: 4,
      transition: {
        attempt: 1,
        nextAttemptAt: 1_784_800_000_000,
        status: "dead",
        targetStatus: "suspended",
        updateTime: 1_784_800_000_000,
      },
      uid: 8,
      workflowId: "13",
    },
  ],
  observedAt: 1_784_800_000_000,
  page: 1,
  pageSize: 20,
  total: 2,
  totalPages: 1,
};

const detail: WorkflowObservabilityWorkflowDetailResponse = {
  activeRunCount: 1,
  dueBacklogCount: 3,
  name: "新客旅程",
  observedAt: 1_784_800_000_000,
  runtimeStatus: "active",
  taskDistribution: {
    cancelled: 0,
    completed: 8,
    dead: 0,
    dispatched: 0,
    leased: 1,
    pending: 3,
    running: 1,
    suspended: 0,
    waiting_external: 0,
  },
  transition: {
    attempt: 2,
    lastErrorCode: "LEASE_EXPIRED",
    nextAttemptAt: 1_784_800_000_000,
    status: "dead",
    targetStatus: "pending",
    updateTime: 1_784_800_000_000,
  },
  uid: 9,
  workflowId: "12",
};

describe("workflow observability page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getWorkflowObservabilitySummary.mockResolvedValue(summary);
    api.listWorkflowObservabilityWorkflows.mockResolvedValue(listPage);
    api.getWorkflowObservabilityDetail.mockResolvedValue(detail);
  });

  it("hides the page when the observer API forbids access", async () => {
    api.getWorkflowObservabilitySummary.mockRejectedValue(
      new RequestNormalizedError({ message: "forbidden", status: 403 }),
    );
    renderPage();
    expect(await screen.findByRole("heading", { name: "无权查看运行观测" })).toBeInTheDocument();
  });

  it("shows loading then empty without treating loading as empty", async () => {
    let resolveSummary: (value: WorkflowObservabilitySummaryResponse) => void = () => undefined;
    api.getWorkflowObservabilitySummary.mockReturnValue(new Promise((resolve) => {
      resolveSummary = resolve;
    }));
    api.listWorkflowObservabilityWorkflows.mockResolvedValue({
      ...listPage,
      items: [],
      total: 0,
    });
    renderPage();
    expect(screen.getByRole("status")).toHaveTextContent("正在加载");
    expect(screen.queryByText("暂无数据")).not.toBeInTheDocument();
    resolveSummary(summary);
    expect(await screen.findByText("暂无数据")).toBeInTheDocument();
  });

  it("loads summary and the first list page together, then filters without per-row requests", async () => {
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByRole("heading", { name: "运行观测" })).toBeInTheDocument();
    expect(screen.getByText("2 个暂停或恢复请求已失败")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "迁移失败" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看迁移失败" })).toBeInTheDocument();
    expect(screen.getByText("恢复失败")).toBeInTheDocument();
    expect(screen.getByText("暂停失败")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "新客旅程" })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(api.getWorkflowObservabilitySummary).toHaveBeenCalledTimes(1);
      expect(api.listWorkflowObservabilityWorkflows).toHaveBeenCalledWith(
        {
          page: 1,
          pageSize: 20,
          state: "all",
          uid: undefined,
          workflowId: undefined,
        },
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
    expect(api.getWorkflowObservabilityDetail).not.toHaveBeenCalled();
    await user.click(screen.getByRole("tab", { name: "有积压" }));
    await waitFor(() => {
      expect(api.listWorkflowObservabilityWorkflows).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, state: "backlog" }),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
    expect(api.listWorkflowObservabilityWorkflows.mock.calls).toHaveLength(2);
    expect(api.getWorkflowObservabilityDetail).not.toHaveBeenCalled();
  });

  it("shows a filter tip when hovering the info icon", async () => {
    const user = userEvent.setup();
    renderPage();
    const tab = await screen.findByRole("tab", { name: "有积压" });
    const tip = tab.querySelector("[data-slot='tooltip-trigger']");
    expect(tip).toBeTruthy();
    await user.hover(tip as Element);
    expect(await screen.findByRole("tooltip")).toBeInTheDocument();
  });

  it("shows metric tips without prefetching extra requests", async () => {
    const user = userEvent.setup();
    renderPage();
    const metrics = await screen.findByRole("region", { name: "队列指标" });
    const tips = metrics.querySelectorAll("[data-slot='tooltip-trigger']");
    expect(tips).toHaveLength(8);
    await user.hover(tips[0] as Element);
    expect(await screen.findByRole("tooltip")).toBeInTheDocument();
    expect(api.getWorkflowObservabilityDetail).not.toHaveBeenCalled();
  });

  it("opens a detail sheet on name click without prefetching every row", async () => {
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByRole("button", { name: "新客旅程" })).toBeInTheDocument();
    expect(api.getWorkflowObservabilityDetail).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "新客旅程" }));
    const dialog = await screen.findByRole("dialog", { name: "新客旅程" });
    expect(within(dialog).getByText("UID 9 · 12")).toBeInTheDocument();
    expect(within(dialog).getByText("待调度")).toBeInTheDocument();
    expect(within(dialog).getByText("恢复失败")).toBeInTheDocument();
    const distributionTips = within(dialog)
      .getByRole("region", { name: "任务分布" })
      .querySelectorAll("[data-slot='tooltip-trigger']");
    expect(distributionTips).toHaveLength(9);
    await user.hover(distributionTips[0] as Element);
    expect(await screen.findByRole("tooltip")).toBeInTheDocument();
    expect(api.getWorkflowObservabilityDetail).toHaveBeenCalledTimes(1);
    expect(api.getWorkflowObservabilityDetail).toHaveBeenCalledWith(
      "12",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(screen.queryByText("执行记录")).not.toBeInTheDocument();
  });

  it("clamps to the last page and reloads when the list shrinks", async () => {
    const user = userEvent.setup();
    let catalogTotal = 21;
    api.listWorkflowObservabilityWorkflows.mockImplementation(async (query: {
      page?: number;
    }) => {
      const requestedPage = query.page ?? 1;
      const totalPages = Math.max(1, Math.ceil(catalogTotal / 20));
      return {
        items: requestedPage <= totalPages
          ? [{
              ...listPage.items[0],
              name: requestedPage === 1 ? "新客旅程" : "第二页旅程",
              workflowId: String(requestedPage),
            }]
          : [],
        observedAt: listPage.observedAt,
        page: requestedPage,
        pageSize: 20,
        total: catalogTotal,
        totalPages,
      };
    });
    renderPage();
    expect(await screen.findByText("新客旅程")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "2" }));
    expect(await screen.findByText("第二页旅程")).toBeInTheDocument();
    catalogTotal = 2;
    await user.click(screen.getByRole("button", { name: "刷新运行观测" }));
    await waitFor(() => {
      expect(api.listWorkflowObservabilityWorkflows).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1 }),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
    expect(await screen.findByText("新客旅程")).toBeInTheDocument();
    expect(screen.queryByText("暂无数据")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "2" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "下一页" })).toBeDisabled();
  });

  it("keeps the previous snapshot when a refresh fails", async () => {
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText("新客旅程")).toBeInTheDocument();
    api.getWorkflowObservabilitySummary.mockRejectedValueOnce(new Error("network"));
    await user.click(screen.getByRole("button", { name: "刷新运行观测" }));
    expect(await screen.findByText("刷新失败，当前展示上次结果")).toBeInTheDocument();
    expect(screen.getByText("新客旅程")).toBeInTheDocument();
  });
});

function renderPage() {
  const router = createMemoryRouter(
    [
      { path: "/chat/workflows/observability", element: <WorkflowObservabilityPage /> },
      { path: "/chat/workflows/:workflowId/data", element: <div>执行记录</div> },
    ],
    { initialEntries: ["/chat/workflows/observability"] },
  );
  return render(<RouterProvider router={router} />);
}
