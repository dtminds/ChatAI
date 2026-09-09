import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type React from "react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  WorkflowEditorPage,
  WorkflowPage,
} from "@/pages/chat/workflow/workflow-page";
import {
  getWorkflowDraftRepository,
  resetWorkflowDocumentsForTest,
} from "@/pages/chat/workflow/workflow-draft-service";
import { resetWorkbenchService } from "@/pages/chat/api/workbench-service";
import { useAuthStore } from "@/store/auth-store";

vi.mock("@xyflow/react", async () => {
  const actual = await vi.importActual<typeof import("@xyflow/react")>("@xyflow/react");

  return {
    ...actual,
    Background: () => null,
    MiniMap: () => null,
    ReactFlow: ({ children }: { children?: React.ReactNode }) => (
      <div data-testid="workflow-react-flow">{children}</div>
    ),
    useNodesInitialized: () => false,
    useReactFlow: () => ({
      fitView: vi.fn(),
      getNodesBounds: vi.fn(),
      screenToFlowPosition: vi.fn(({ x, y }: { x: number; y: number }) => ({ x, y })),
      setCenter: vi.fn(),
      setViewport: vi.fn(),
      zoomIn: vi.fn(),
      zoomOut: vi.fn(),
      zoomTo: vi.fn(),
    }),
    useViewport: () => ({ x: 0, y: 0, zoom: 1 }),
  };
});

function mockSession() {
  useAuthStore.setState(useAuthStore.getInitialState(), true);
  useAuthStore.getState().setSession({
    accountType: "sub",
    displayName: "运营主管",
    permissions: ["chat.access", "chat.send", "chat.takeover"],
    role: "admin",
    subUserId: "101",
    uid: 101,
  });
}

function renderWorkflowPage(initialEntry = "/chat/workflows/newcomer-conversion") {
  const repository = getWorkflowDraftRepository();
  const router = createMemoryRouter(
    [
      {
        path: "/chat/workflows",
        element: <WorkflowPage repository={repository} />,
      },
      {
        path: "/chat/workflows/:workflowId",
        element: <WorkflowEditorPage repository={repository} />,
      },
    ],
    { initialEntries: [initialEntry] },
  );

  return {
    router,
    ...render(<RouterProvider router={router} />),
  };
}

function getWorkflowBackButton() {
  const topbar = document.querySelector<HTMLElement>(".workflow-canvas-topbar");
  if (!topbar) throw new Error("Workflow canvas topbar was not rendered");
  return within(topbar).getByRole("button", { name: "返回列表" });
}

describe("Agent workflow page", () => {
  beforeEach(() => {
    resetWorkflowDocumentsForTest();
    resetWorkbenchService();
    mockSession();
  });

  it("renders a named workflow editor route with the dedicated canvas header", async () => {
    renderWorkflowPage("/chat/workflows/newcomer-conversion");

    expect(await screen.findByRole("application")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "新人转化旅程" })).toBeInTheDocument();
    expect(getWorkflowBackButton()).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "返回列表" })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "智能体导航" })).not.toBeInTheDocument();
  });

  it("returns to the workflow list from the canvas header", async () => {
    const user = userEvent.setup();
    const { router } = renderWorkflowPage("/chat/workflows/newcomer-conversion");

    await screen.findByRole("application");
    await user.click(getWorkflowBackButton());

    await waitFor(() => expect(router.state.location.pathname).toBe("/chat/workflows"));
  });
});
