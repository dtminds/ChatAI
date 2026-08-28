import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  WorkflowObservabilitySummaryResponse,
  WorkflowObservabilityWorkflowListResponse,
} from "@chatai/contracts";
import { RequestNormalizedError } from "@/lib/request";
import { WorkflowObservabilityPage } from "@/pages/chat/workflow/workflow-observability-page";

const api = vi.hoisted(() => ({
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
  items: [{
    activeRunCount: 1,
    activeTaskCount: 2,
    dueBacklogCount: 3,
    name: "新客旅程",
    runtimeStatus: "active",
    totalRunCount: 10,
    uid: 9,
    workflowId: "12",
  }],
  observedAt: 1_784_800_000_000,
  page: 1,
  pageSize: 20,
  total: 1,
  totalPages: 1,
};

describe("workflow observability page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getWorkflowObservabilitySummary.mockResolvedValue(summary);
    api.listWorkflowObservabilityWorkflows.mockResolvedValue(listPage);
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
    expect(screen.getByRole("link", { name: "新客旅程" })).toHaveAttribute(
      "href",
      "/chat/workflows/12/data",
    );
    await user.click(screen.getByRole("tab", { name: "有积压" }));
    await waitFor(() => {
      expect(api.listWorkflowObservabilityWorkflows).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, state: "backlog" }),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
    expect(api.listWorkflowObservabilityWorkflows.mock.calls).toHaveLength(2);
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
