import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent, { PointerEventsCheckLevel } from "@testing-library/user-event";
import type React from "react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  WorkflowEditorPage,
  WorkflowPage,
} from "@/pages/chat/workflow/workflow-page";
import { WorkflowTemplateCenterPage } from "@/pages/chat/workflow/workflow-template-section";
import { WorkflowListTable } from "@/pages/chat/workflow/workflow-list-components";
import {
  createInitialDraft,
} from "@/pages/chat/workflow/graph";
import type { WorkflowNodeKind } from "@/pages/chat/workflow/types";
import {
  getWorkflowDocument,
  getWorkflowDraftRepository,
  resetWorkflowDocumentsForTest,
  type WorkflowListInput,
  type WorkflowListPage,
} from "@/pages/chat/workflow/workflow-draft-service";
import { WorkflowRepositoryError } from "@/pages/chat/workflow/workflow-repository-types";
import type { WorkflowTemplateRepository } from "@/pages/chat/workflow/workflow-template-repository";
import {
  resetWorkbenchService,
} from "@/pages/chat/api/workbench-service";
import type { WorkflowTemplateListPage } from "@chatai/contracts";
import { useAuthStore } from "@/store/auth-store";

const agentServiceMock = vi.hoisted(() => ({
  getAiHostingQuota: vi.fn(),
  listAiHostingModels: vi.fn(),
}));

const reactFlowControlMock = vi.hoisted(() => ({
  fitView: vi.fn(),
  getNodesBounds: vi.fn(),
  screenToFlowPosition: vi.fn(({ x, y }: { x: number; y: number }) => ({ x, y })),
  setCenter: vi.fn(),
  setViewport: vi.fn(),
  zoomIn: vi.fn(),
  zoomOut: vi.fn(),
  zoomTo: vi.fn(),
}));

vi.mock("@/pages/chat/ai-hosting/agent-service", () => agentServiceMock);

vi.mock("@xyflow/react", async () => {
  return {
    Background: () => null,
    BaseEdge: ({
      id,
      style,
    }: {
      id: string;
      style?: React.CSSProperties;
    }) => (
      <svg
        aria-hidden="true"
        data-opacity={style?.opacity}
        data-stroke={style?.stroke}
        data-stroke-width={style?.strokeWidth}
        data-testid={`workflow-base-edge-${id}`}
      />
    ),
    EdgeLabelRenderer: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Handle: ({
      children,
      id,
      type,
    }: {
      children?: React.ReactNode;
      id?: string;
      type?: string;
    }) => (
      <div data-handle-id={id} data-handle-type={type} data-testid={`workflow-handle-${type}-${id ?? "default"}`}>
        {children}
      </div>
    ),
    MiniMap: () => <div data-testid="workflow-minimap" />,
    Position: {
      Bottom: "bottom",
      Left: "left",
      Right: "right",
      Top: "top",
    },
    SelectionMode: {
      Partial: "partial",
    },
    ReactFlow: ({
      children,
      edgeTypes,
      edges = [],
      deleteKeyCode,
      fitView,
      maxZoom,
      minZoom,
      multiSelectionKeyCode,
      nodeTypes,
      nodes,
      nodesConnectable,
      nodesDraggable,
      panOnDrag,
      proOptions,
      zoomOnScroll,
      onConnect,
      onEdgeClick,
      onNodeClick,
      onNodeDrag,
      onNodeDragStart,
      onNodeDragStop,
      onNodeMouseEnter,
      onNodeMouseLeave,
      onNodesChange,
      onPaneClick,
      onMoveEnd,
      isValidConnection,
    }: {
      children?: React.ReactNode;
      edges?: Array<{
        data?: Record<string, unknown>;
        id: string;
        source: string;
        target: string;
        selected?: boolean;
        type?: string;
      }>;
      edgeTypes?: Record<string, (props: any) => React.ReactNode>;
      deleteKeyCode?: unknown;
      fitView?: boolean;
      maxZoom?: number;
      minZoom?: number;
      multiSelectionKeyCode?: unknown;
      nodeTypes?: Record<string, (props: any) => React.ReactNode>;
      nodes: Array<{
        data: Record<string, unknown>;
        id: string;
        position?: { x: number; y: number };
        selected?: boolean;
        type?: string;
        zIndex?: number;
      }>;
      nodesConnectable?: boolean;
      nodesDraggable?: boolean;
      panOnDrag?: boolean;
      proOptions?: { hideAttribution?: boolean };
      zoomOnScroll?: boolean;
      onConnect?: (connection: { source: string; target: string }) => void;
      onEdgeClick?: (_event: unknown, edge: { id: string }) => void;
      onNodeClick?: (_event: unknown, node: { id: string }) => void;
      onNodeDrag?: (_event: { stopPropagation: () => void }, node: any, nodes: any[]) => void;
      onNodeDragStart?: (_event: { stopPropagation: () => void }, node: any, nodes: any[]) => void;
      onNodeDragStop?: (_event: { stopPropagation: () => void }, node: any, nodes: any[]) => void;
      onNodeMouseEnter?: (_event: unknown, node: { id: string }) => void;
      onNodeMouseLeave?: (_event: unknown, node: { id: string }) => void;
      onNodesChange?: (changes: Array<{
        dragging?: boolean;
        id: string;
        position?: { x: number; y: number };
        type: string;
      }>) => void;
      onMoveEnd?: (_event: unknown, viewport: { x: number; y: number; zoom: number }) => void;
      onPaneClick?: () => void;
      isValidConnection?: (connection: { source: string; target: string }) => boolean;
    }) => (
      <div
        data-delete-key-code={deleteKeyCode === null ? "disabled" : String(deleteKeyCode)}
        data-fit-view={fitView ? "true" : "false"}
        data-hide-attribution={proOptions?.hideAttribution ? "true" : "false"}
        data-max-zoom={maxZoom}
        data-min-zoom={minZoom}
        data-multi-selection-key-code={multiSelectionKeyCode === null ? "disabled" : String(multiSelectionKeyCode)}
        data-pan-on-drag={panOnDrag ? "true" : "false"}
        data-testid="workflow-react-flow"
        data-zoom-on-scroll={zoomOnScroll ? "true" : "false"}
      >
        <button
          onClick={() => onPaneClick?.()}
          type="button"
        >
          点击画布空白处
        </button>
        <button
          onClick={() => onMoveEnd?.(null, { x: 140, y: 260, zoom: 1.1 })}
          type="button"
        >
          移动画布视角
        </button>
        <button
          disabled={!nodesConnectable}
          onClick={() => {
            const connection = { source: "branch-intent", sourceHandle: "branch-default", target: "end", targetHandle: null };
            if (isValidConnection?.(connection) ?? true) {
              onConnect?.(connection);
            }
          }}
          type="button"
        >
          连接否则分支到结束
        </button>
        <button
          disabled={!nodesDraggable}
          onClick={() => {
            const node = nodes.find((node) => node.id === "wait-2d");
            if (!node) {
              return;
            }
            const nextNode = {
              ...node,
              position: { x: 420, y: 120 },
            };
            const dragEvent = { stopPropagation: vi.fn() };

            onNodeDragStart?.(dragEvent, node, nodes);
            onNodesChange?.([
              {
                dragging: true,
                id: "wait-2d",
                position: { x: 420, y: 120 },
                type: "position",
              },
            ]);
            onNodeDrag?.(dragEvent, nextNode, [nextNode]);
            onNodesChange?.([
              {
                dragging: false,
                id: "wait-2d",
                position: { x: 420, y: 120 },
                type: "position",
              },
            ]);
            onNodeDragStop?.(dragEvent, nextNode, [nextNode]);
          }}
          type="button"
        >
          移动观察期
        </button>
        {edges.map((edge, index) => {
          const EdgeComponent = edgeTypes?.[edge.type ?? ""];

          return (
            <div
              data-selected={edge.selected ? "true" : undefined}
              data-testid={`workflow-edge-${edge.id}`}
              key={edge.id}
              onClick={() => onEdgeClick?.({}, edge)}
            >
              {EdgeComponent ? (
                <EdgeComponent
                  data={edge.data}
                  id={edge.id}
                  selected={Boolean(edge.selected)}
                  source={edge.source}
                  sourceX={100 + index * 40}
                  sourceY={80 + index * 20}
                  target={edge.target}
                  targetX={260 + index * 40}
                  targetY={80 + index * 20}
                />
              ) : null}
            </div>
          );
        })}
        {nodes.map((node) => {
          const NodeComponent = nodeTypes?.[node.type ?? ""];

          return (
            <div
              data-position-x={node.position?.x}
              data-position-y={node.position?.y}
              data-selected={node.selected ? "true" : undefined}
              data-z-index={node.zIndex}
              data-testid={`workflow-node-${node.id}`}
              key={node.id}
              onClick={() => onNodeClick?.({}, node)}
              onMouseEnter={() => onNodeMouseEnter?.({}, node)}
              onMouseLeave={() => onNodeMouseLeave?.({}, node)}
            >
              {NodeComponent ? (
                <NodeComponent data={node.data} id={node.id} />
              ) : null}
            </div>
          );
        })}
        {children}
      </div>
    ),
    ReactFlowProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    ViewportPortal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    applyEdgeChanges: (_changes: unknown, edges: unknown) => edges,
    applyNodeChanges: (
      changes: Array<{
        id: string;
        position?: { x: number; y: number };
        type: string;
      }>,
      nodes: Array<{
        id: string;
        position?: { x: number; y: number };
      }>,
    ) =>
      nodes.map((node) => {
        const positionChange = changes.find(
          (change) => change.type === "position" && change.id === node.id && change.position,
        );

        return positionChange
          ? {
              ...node,
              position: positionChange.position,
            }
          : node;
      }),
    getBezierPath: () => ["M 0 0 C 40 0 80 40 120 40", 120, 80],
    useNodesInitialized: () => false,
    useReactFlow: () => reactFlowControlMock,
    useViewport: () => ({
      x: 0,
      y: 0,
      zoom: 1,
    }),
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

function renderWorkflowPage(
  initialEntry = "/chat/workflows/newcomer-conversion",
  repository = getWorkflowDraftRepository(),
  templateRepository?: WorkflowTemplateRepository,
) {
  const router = createMemoryRouter(
    [
      {
        path: "/chat/workflows",
        element: <WorkflowPage repository={repository} templateRepository={templateRepository} />,
      },
      {
        path: "/chat/workflows/new",
        element: <WorkflowEditorPage repository={repository} />,
      },
      {
        path: "/chat/workflows/observability",
        element: <div>运行观测页</div>,
      },
      {
        path: "/chat/workflows/templates",
        element: <WorkflowTemplateCenterPage repository={templateRepository} />,
      },
      {
        path: "/chat/workflows/:workflowId",
        element: <WorkflowEditorPage repository={repository} />,
      },
      {
        path: "/chat/workflows/:workflowId/data",
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

function getWorkflowSearchInput() {
  return screen.getByRole("textbox", { name: "搜索工作流" });
}

function getWorkflowCreateButton() {
  return screen.getByRole("button", { name: "新建工作流" });
}

function getWorkflowMetadataInputs() {
  const [nameInput, descriptionInput] = within(screen.getByRole("dialog")).getAllByRole("textbox");
  if (!nameInput || !descriptionInput) throw new Error("Workflow metadata inputs were not rendered");
  return { descriptionInput, nameInput };
}

function setupCanvasUser() {
  return userEvent.setup({
    pointerEventsCheck: PointerEventsCheckLevel.Never,
  });
}

async function publishInMemoryWorkflow(workflowId: string) {
  const repository = getWorkflowDraftRepository();
  const submitted = await repository.submitReview(workflowId);
  await repository.approveReview(workflowId, submitted.currentReview!.id);
  await repository.publishReview(workflowId, submitted.currentReview!.id);
}

describe("Agent workflow page", () => {
  beforeEach(() => {
    vi.useRealTimers();
    resetWorkflowDocumentsForTest();
    resetWorkbenchService();
    reactFlowControlMock.fitView.mockClear();
    reactFlowControlMock.screenToFlowPosition.mockClear();
    reactFlowControlMock.setCenter.mockClear();
    reactFlowControlMock.zoomIn.mockClear();
    reactFlowControlMock.zoomOut.mockClear();
    reactFlowControlMock.zoomTo.mockClear();
    mockSession();
    agentServiceMock.getAiHostingQuota.mockResolvedValue({
      agents: {
        limit: 20,
        used: 3,
      },
      kbDocs: {
        limit: 1024 * 1024 * 1024,
        used: 20 * 1024 * 1024,
      },
      kbs: {
        limit: 20,
        used: 4,
      },
    });
    agentServiceMock.listAiHostingModels.mockResolvedValue({ models: [] });
  });


  it("opens the Workflow menu on the list page instead of the canvas editor", async () => {
    renderWorkflowPage("/chat/workflows");

    expect(await screen.findByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(
      screen
        .getAllByRole("link")
        .find((link) => link.getAttribute("href") === "/chat/workflows"),
    ).toBeInTheDocument();
    expect(getWorkflowSearchInput()).toBeInTheDocument();
    expect(getWorkflowCreateButton()).toBeInTheDocument();
    expect(screen.getByText("新人转化旅程")).toBeInTheDocument();
    expect(screen.queryByRole("application")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "运行观测" })).not.toBeInTheDocument();
  });

  it("opens the observability page from the list header for observers", async () => {
    const user = userEvent.setup();
    const repository = getWorkflowDraftRepository();
    vi.spyOn(repository, "getTenantOverview").mockImplementation(() => ({
      activeWorkflowCount: 1,
      canViewWorkflowObservability: true,
      recentFailedRunCount: 0,
      recentSuccessRatePercent: 100,
      todayRunCount: 1,
      todayRunCountChangePercent: 0,
      totalWorkflowCount: 1,
    }));
    const { router } = renderWorkflowPage("/chat/workflows", repository);

    const link = await screen.findByRole("link", { name: "运行观测" });
    expect(link).toHaveAttribute("href", "/chat/workflows/observability");
    await user.click(link);
    expect(router.state.location.pathname).toBe("/chat/workflows/observability");
    expect(screen.getByText("运行观测页")).toBeInTheDocument();
  });

  it("does not expose ChatAI observability from the embedded Workflow list", async () => {
    const repository = getWorkflowDraftRepository("sop_embed");
    vi.spyOn(repository, "getTenantOverview").mockImplementation(() => ({
      activeWorkflowCount: 1,
      canViewWorkflowObservability: true,
      recentFailedRunCount: 0,
      recentSuccessRatePercent: 100,
      todayRunCount: 1,
      todayRunCountChangePercent: 0,
      totalWorkflowCount: 1,
    }));
    const router = createMemoryRouter([{
      path: "/embed/workflows",
      element: <WorkflowPage repository={repository} surface="sop_embed" />,
    }], { initialEntries: ["/embed/workflows"] });

    render(<RouterProvider router={router} />);

    expect(await screen.findByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "运行观测" })).not.toBeInTheDocument();
  });

  it("opens the editor from the embedded Workflow list", async () => {
    const user = userEvent.setup();
    const repository = getWorkflowDraftRepository("sop_embed");
    const document = await repository.createDocument({
      name: "营销画布编辑跳转",
      workflowType: "wecom_sop",
    });
    const router = createMemoryRouter([
      {
        path: "/embed/workflows",
        element: <WorkflowPage repository={repository} surface="sop_embed" />,
      },
      {
        path: "/embed/workflows/:workflowId",
        element: <WorkflowEditorPage repository={repository} surface="sop_embed" />,
      },
    ], { initialEntries: ["/embed/workflows"] });

    render(<RouterProvider router={router} />);

    const row = await screen.findByRole("row", { name: new RegExp(document.name) });
    expect(within(row).queryByRole("link", { name: "编辑" })).not.toBeInTheDocument();

    await user.click(within(row).getByRole("button", { name: `操作 ${document.name}` }));
    const editLink = screen.getAllByRole("menuitem")[0];
    expect(editLink).toHaveAttribute("href", `/embed/workflows/${document.id}`);

    await user.click(editLink);

    expect(router.state.location.pathname).toBe(`/embed/workflows/${document.id}`);
    expect(await screen.findByRole("heading", { name: document.name })).toBeInTheDocument();
  });

  it("opens data from the embedded Workflow list in fullscreen", async () => {
    const user = userEvent.setup();
    const repository = getWorkflowDraftRepository("sop_embed");
    const document = await repository.createDocument({
      name: "营销画布数据跳转",
      workflowType: "wecom_sop",
    });
    const router = createMemoryRouter([
      {
        path: "/embed/workflows",
        element: <WorkflowPage repository={repository} surface="sop_embed" />,
      },
      {
        path: "/embed/workflows/:workflowId",
        element: <WorkflowEditorPage repository={repository} surface="sop_embed" />,
      },
      {
        path: "/embed/workflows/:workflowId/data",
        element: <WorkflowEditorPage repository={repository} surface="sop_embed" />,
      },
    ], { initialEntries: ["/embed/workflows"] });

    render(<RouterProvider router={router} />);

    const row = await screen.findByRole("row", { name: new RegExp(document.name) });

    await user.click(within(row).getByRole("button", { name: `操作 ${document.name}` }));
    const dataLink = screen.getByRole("menuitem", { name: "数据" });
    expect(dataLink).toHaveAttribute("href", `/embed/workflows/${document.id}/data`);

    await user.click(dataLink);

    expect(router.state.location.pathname).toBe(`/embed/workflows/${document.id}/data`);
    expect(await screen.findByRole("tab", { name: "数据" })).toHaveAttribute("aria-selected", "true");
  });

  it("creates WeCom SOPs without showing a type selector from the embedded Workflow list", async () => {
    const user = userEvent.setup();
    const repository = getWorkflowDraftRepository("sop_embed");
    const createDocumentSpy = vi.spyOn(repository, "createDocument");
    const router = createMemoryRouter([
      {
        path: "/embed/workflows",
        element: <WorkflowPage repository={repository} surface="sop_embed" />,
      },
      {
        path: "/embed/workflows/new",
        element: <WorkflowEditorPage repository={repository} surface="sop_embed" />,
      },
      {
        path: "/embed/workflows/:workflowId",
        element: <WorkflowEditorPage repository={repository} surface="sop_embed" />,
      },
    ], { initialEntries: ["/embed/workflows"] });

    render(<RouterProvider router={router} />);
    await user.click(getWorkflowCreateButton());

    expect(router.state.location.pathname).toBe("/embed/workflows/new");
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    await user.type(getWorkflowMetadataInputs().nameInput, "企微新客旅程");
    await user.click(screen.getByRole("button", { name: "创建" }));

    await waitFor(() => expect(createDocumentSpy).toHaveBeenCalledWith(expect.objectContaining({
      workflowType: "wecom_sop",
    })));
  });

  it("collects workflow metadata before creating and opens the new canvas", async () => {
    const user = userEvent.setup();
    const repository = getWorkflowDraftRepository();
    const createDocumentSpy = vi.spyOn(repository, "createDocument");
    const { router } = renderWorkflowPage("/chat/workflows");

    await user.click(getWorkflowCreateButton());

    expect(createDocumentSpy).not.toHaveBeenCalled();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    const { descriptionInput, nameInput } = getWorkflowMetadataInputs();
    await user.type(nameInput, "新客欢迎旅程");
    await user.type(descriptionInput, "添加客户后发送欢迎消息");
    await user.click(screen.getByRole("button", { name: "创建" }));

    await waitFor(() => {
      expect(createDocumentSpy).toHaveBeenCalledWith(expect.objectContaining({
        description: "添加客户后发送欢迎消息",
        name: "新客欢迎旅程",
        workflowType: "chatai_sop",
      }));
      expect(router.state.location.pathname).toBe("/chat/workflows/workflow-1");
    });
    expect(await screen.findByRole("heading", { name: "新客欢迎旅程" })).toBeInTheDocument();
    expect(getWorkflowDocument("workflow-1").description).toBe("添加客户后发送欢迎消息");
  });

  it("discards unfinished metadata when the create dialog is reopened", async () => {
    const user = userEvent.setup();
    renderWorkflowPage("/chat/workflows");

    await user.click(getWorkflowCreateButton());
    let { descriptionInput, nameInput } = getWorkflowMetadataInputs();
    await user.type(nameInput, "未保存名称");
    await user.type(descriptionInput, "未保存描述");
    await user.click(screen.getByRole("button", { name: "关闭" }));
    await user.click(getWorkflowCreateButton());
    ({ descriptionInput, nameInput } = getWorkflowMetadataInputs());

    expect(nameInput).toHaveValue("");
    expect(descriptionInput).toHaveValue("");
  });

  it("keeps the create request id for retries within the ChatAI Surface", async () => {
    const user = userEvent.setup();
    const toastError = vi.spyOn(toast, "error");
    const baseRepository = getWorkflowDraftRepository();
    const createDocument = vi.fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockRejectedValueOnce(new Error("network"))
      .mockImplementation((input) => baseRepository.createDocument(input));
    const repository = { ...baseRepository, createDocument };
    const { router } = renderWorkflowPage("/chat/workflows", repository);

    await user.click(getWorkflowCreateButton());
    await user.type(getWorkflowMetadataInputs().nameInput, "新客欢迎旅程");
    await user.click(screen.getByRole("button", { name: "创建" }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("操作失败，请稍后重试"));
    expect(within(screen.getByRole("dialog")).queryByRole("alert")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "创建" }));
    await waitFor(() => expect(createDocument).toHaveBeenCalledTimes(2));

    const firstRequestId = createDocument.mock.calls[0]?.[0].clientRequestId;
    expect(createDocument.mock.calls[1]?.[0].clientRequestId).toBe(firstRequestId);

    await user.click(screen.getByRole("button", { name: "创建" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/chat/workflows/workflow-1"));

    expect(createDocument.mock.calls[2]?.[0]).toMatchObject({ workflowType: "chatai_sop" });
    expect(createDocument.mock.calls[2]?.[0].clientRequestId).toBe(firstRequestId);
    toastError.mockRestore();
  });

  it("reports direct-route create failures through a toast", async () => {
    const user = userEvent.setup();
    const toastError = vi.spyOn(toast, "error");
    const baseRepository = getWorkflowDraftRepository();
    const repository = {
      ...baseRepository,
      createDocument: vi.fn().mockRejectedValue(new Error("network")),
    };

    renderWorkflowPage("/chat/workflows/new", repository);
    await user.type(getWorkflowMetadataInputs().nameInput, "ChatAI 新客旅程");
    await user.click(screen.getByRole("button", { name: "创建" }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("操作失败，请稍后重试"));
    expect(within(screen.getByRole("dialog")).queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    toastError.mockRestore();
  });

  it("keeps the backend reason when workflow creation is not entitled", async () => {
    const user = userEvent.setup();
    const toastError = vi.spyOn(toast, "error");
    const baseRepository = getWorkflowDraftRepository();
    const repository = {
      ...baseRepository,
      createDocument: vi.fn().mockRejectedValue(new WorkflowRepositoryError(
        "forbidden",
        "当前无对应产品权益",
        { apiCode: "WORKFLOW_ENTITLEMENT_REQUIRED" },
      )),
    };

    renderWorkflowPage("/chat/workflows/new", repository);
    await user.type(getWorkflowMetadataInputs().nameInput, "无权益工作流");
    await user.click(screen.getByRole("button", { name: "创建" }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("当前无对应产品权益"));
    expect(within(screen.getByRole("dialog")).queryByRole("alert")).not.toBeInTheDocument();
    toastError.mockRestore();
  });

  it("renders workflows in a table with navigation and row actions", async () => {
    const user = userEvent.setup();
    renderWorkflowPage("/chat/workflows");

    const table = await screen.findByRole("table");
    const row = within(table).getByRole("row", { name: /新人转化旅程/ });
    const activeRow = within(table).getByRole("row", { name: /会员复购唤醒/ });
    const pausedRow = within(table).getByRole("row", { name: /直播后跟进/ });

    expect(within(table).getAllByRole("columnheader")).toHaveLength(6);
    expect(within(row).getAllByRole("cell")).toHaveLength(6);
    expect(within(row).getByText("草稿")).toBeInTheDocument();
    expect(within(row).getAllByLabelText(/^托管账号 /)).toHaveLength(3);
    expect(within(row).getByText("+1")).toBeInTheDocument();
    expect(within(row).getByText("1,248,000")).toBeInTheDocument();
    expect(within(row).getByText("248")).toBeInTheDocument();
    expect(within(row).getByText("96%")).toBeInTheDocument();
    expect(within(row).getByText("今天 18:20")).toBeInTheDocument();
    expect(within(row).getByRole("link", { name: "打开 新人转化旅程" })).toHaveAttribute(
      "href",
      "/chat/workflows/newcomer-conversion",
    );
    expect(within(row).queryByRole("link", { name: "编辑" })).not.toBeInTheDocument();
    expect(within(activeRow).getByRole("button", { name: "操作 会员复购唤醒" })).toBeInTheDocument();
    expect(within(pausedRow).getByText("未启用")).toBeInTheDocument();
    expect(within(pausedRow).getByRole("button", { name: "操作 直播后跟进" })).toBeInTheDocument();

    await user.click(within(row).getByRole("button", { name: "操作 新人转化旅程" }));
    expect(screen.getAllByRole("menuitem")[0]).toHaveAttribute(
      "href",
      "/chat/workflows/newcomer-conversion",
    );
  });

  it("renders WeCom member avatars in the workflow list", () => {
    const workflow = {
      ...getWorkflowDocument("newcomer-conversion"),
      managedAccountCount: 0,
      managedAccounts: [],
      wecomMemberCount: 2,
      wecomMembers: [
        { avatarUrl: "https://example.com/zhang-san.png", id: 201, name: "张三" },
        { avatarUrl: "", id: 202, name: "李四" },
      ],
      workflowType: "wecom_sop" as const,
    };

    const router = createMemoryRouter([{
      path: "/",
      element: (
        <WorkflowListTable
          loading={false}
          onDelete={vi.fn()}
          onLifecycleAction={vi.fn()}
          onRename={vi.fn()}
          operationPendingId={null}
          sourceColumnLabel="企微成员"
          workflows={[workflow]}
        />
      ),
    }]);
    render(<RouterProvider router={router} />);

    const row = screen.getByRole("row", { name: /新人转化旅程/ });
    expect(within(row).getAllByLabelText(/^企微成员 /)).toHaveLength(2);
    expect(within(row).queryByLabelText(/^托管账号 /)).not.toBeInTheDocument();
  });

  it("opens the data tab from the workflow row menu", async () => {
    const user = userEvent.setup();
    const { router } = renderWorkflowPage("/chat/workflows");
    const table = await screen.findByRole("table");
    const row = within(table).getByRole("row", { name: /新人转化旅程/ });
    const postMessage = vi.spyOn(window.parent, "postMessage").mockImplementation(() => undefined);

    await user.click(within(row).getByRole("button", { name: "操作 新人转化旅程" }));
    const menuItems = screen.getAllByRole("menuitem");
    expect(menuItems.slice(0, 2).map(item => item.textContent?.trim())).toEqual(["编辑", "数据"]);
    const dataLink = screen.getByRole("menuitem", { name: "数据" });
    expect(dataLink).toHaveAttribute("href", "/chat/workflows/newcomer-conversion/data");

    await user.click(dataLink);

    await waitFor(() => expect(router.state.location.pathname)
      .toBe("/chat/workflows/newcomer-conversion/data"));
    expect(await screen.findByRole("tab", { name: "数据" })).toHaveAttribute("aria-selected", "true");
    expect(postMessage).not.toHaveBeenCalled();
    postMessage.mockRestore();
  });

  it("marks published workflows that have unpublished changes", async () => {
    const user = userEvent.setup();
    const baseRepository = getWorkflowDraftRepository();
    const repository = {
      ...baseRepository,
      async listDocuments(input?: WorkflowListInput): Promise<WorkflowListPage> {
        const page = await baseRepository.listDocuments(input);
        return {
          ...page,
          items: page.items.map(workflow => workflow.id === "vip-reactivation"
            ? { ...workflow, hasUnpublishedChanges: true }
            : workflow),
        };
      },
    };
    renderWorkflowPage("/chat/workflows", repository);

    const table = await screen.findByRole("table");
    const changedRow = within(table).getByRole("row", { name: /会员复购唤醒/ });
    const newDraftRow = within(table).getByRole("row", { name: /新人转化旅程/ });
    const publishedRow = within(table).getByRole("row", { name: /直播后跟进/ });

    const marker = within(changedRow).getByRole("img", { name: "有未发布的修改" });
    expect(marker).toBeInTheDocument();
    expect(within(newDraftRow).queryByRole("img", { name: "有未发布的修改" })).not.toBeInTheDocument();
    expect(within(publishedRow).queryByRole("img", { name: "有未发布的修改" })).not.toBeInTheDocument();

    await user.hover(marker);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("有未发布的修改");
  });

  it("does not find workflows by description", async () => {
    const user = userEvent.setup();
    renderWorkflowPage("/chat/workflows");

    await screen.findByText("新人转化旅程");
    await user.type(getWorkflowSearchInput(), "长期未复购");

    await waitFor(() => {
      expect(screen.queryByText("会员复购唤醒")).not.toBeInTheDocument();
      expect(screen.queryByText("新人转化旅程")).not.toBeInTheDocument();
    });
  });

  it("filters workflows by user-facing status", async () => {
    const user = userEvent.setup();
    const repository = getWorkflowDraftRepository();
    await repository.createDocument({ name: "普通草稿流程", workflowType: "chatai_sop" });
    const stopped = await repository.createDocument({ name: "已停止流程", workflowType: "chatai_sop" });
    await repository.stopDocument?.(stopped.id);
    renderWorkflowPage("/chat/workflows");

    await screen.findByText("新人转化旅程");
    expect(screen.getByRole("tab", { name: "全部" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "运行中" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "待处理" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "未启用" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "草稿" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "已停止" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "已暂停" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "已发布" })).not.toBeInTheDocument();
    expect(screen.queryByText("3 个流程")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "运行中" }));
    await waitFor(() => {
      expect(screen.getByText("会员复购唤醒")).toBeInTheDocument();
      expect(screen.queryByText("新人转化旅程")).not.toBeInTheDocument();
      expect(screen.queryByText("直播后跟进")).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole("tab", { name: "未启用" }));
    await waitFor(() => {
      expect(screen.getByText("直播后跟进")).toBeInTheDocument();
      expect(screen.queryByText("新人转化旅程")).not.toBeInTheDocument();
      expect(screen.queryByText("会员复购唤醒")).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole("tab", { name: "草稿" }));
    await waitFor(() => {
      expect(screen.getByText("普通草稿流程")).toBeInTheDocument();
      expect(screen.getByText("新人转化旅程")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("tab", { name: "已停止" }));
    await waitFor(() => {
      expect(screen.getByText("已停止流程")).toBeInTheDocument();
      expect(screen.queryByText("新人转化旅程")).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole("tab", { name: "运行中" }));
    await user.type(getWorkflowSearchInput(), "不存在");
    await waitFor(() => expect(screen.queryByText("会员复购唤醒")).not.toBeInTheDocument());
  });

  it("starts a changed filter from the first page without retaining old rows", async () => {
    const user = userEvent.setup();
    const baseRepository = getWorkflowDraftRepository();
    const newcomer = await baseRepository.getDocument("newcomer-conversion");
    const vip = await baseRepository.getDocument("vip-reactivation");
    let resolveActiveList: ((page: WorkflowListPage) => void) | undefined;
    const listDocuments = vi.fn((input: WorkflowListInput = {}): WorkflowListPage | Promise<WorkflowListPage> => {
      if (input.status === "active") {
        return new Promise<WorkflowListPage>((resolve) => {
          resolveActiveList = resolve;
        });
      }
      return input.page === 2
        ? { items: [newcomer], total: 11 }
        : { items: [vip], total: 11 };
    });
    renderWorkflowPage("/chat/workflows", { ...baseRepository, listDocuments });

    await screen.findByText("会员复购唤醒");
    expect(screen.getByText("共 11 条")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "下一页" }));
    await screen.findByText("新人转化旅程");
    await user.click(screen.getByRole("tab", { name: "运行中" }));

    await waitFor(() => expect(listDocuments).toHaveBeenLastCalledWith(expect.objectContaining({
      page: 1,
      status: "active",
    })));
    expect(within(screen.getByRole("table")).getByRole("status"))
      .toBeInTheDocument();
    expect(screen.queryByText("新人转化旅程")).not.toBeInTheDocument();

    await act(async () => {
      resolveActiveList?.({
        items: [vip],
        total: 1,
      });
    });
    expect(await screen.findByText("会员复购唤醒")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "全部" }));
    await waitFor(() => expect(listDocuments).toHaveBeenLastCalledWith(expect.objectContaining({
      page: 1,
      status: "all",
    })));
  });

  it("uses the total page range and jumps directly to a later page", async () => {
    const user = userEvent.setup();
    const baseRepository = getWorkflowDraftRepository();
    const seed = await baseRepository.getDocument("vip-reactivation");
    const pageItems = Array.from({ length: 6 }, (_, index) => ({
      ...seed,
      name: `第 ${index + 1} 页流程`,
    }));
    const listDocuments = vi.fn((input: WorkflowListInput = {}): WorkflowListPage => {
      const page = input.page ?? 1;
      return {
        items: [pageItems[page - 1]],
        total: 51,
      };
    });

    renderWorkflowPage("/chat/workflows", { ...baseRepository, listDocuments });

    expect(await screen.findByText("第 1 页流程")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "6" })).toBeInTheDocument();

    await user.click(await screen.findByRole("button", { name: "6" }));

    expect(await screen.findByText("第 6 页流程")).toBeInTheDocument();
    expect(listDocuments).toHaveBeenCalledTimes(2);
    expect(listDocuments).toHaveBeenLastCalledWith(expect.objectContaining({ page: 6 }));
    expect(listDocuments).not.toHaveBeenCalledWith(expect.objectContaining({ page: 2 }));
    expect(listDocuments).not.toHaveBeenCalledWith(expect.objectContaining({ page: 3 }));
    expect(listDocuments).not.toHaveBeenCalledWith(expect.objectContaining({ page: 4 }));
    expect(listDocuments).not.toHaveBeenCalledWith(expect.objectContaining({ page: 5 }));
  });

  it("loads featured templates after the workflow list is ready", async () => {
    const baseRepository = getWorkflowDraftRepository();
    let resolveList: ((page: WorkflowListPage) => void) | undefined;
    const listDocuments = vi.fn(() => new Promise<WorkflowListPage>((resolve) => {
      resolveList = resolve;
    }));
    const list = vi.fn<WorkflowTemplateRepository["list"]>(async () => ({ items: [], total: 0 }));
    const templateRepository: WorkflowTemplateRepository = {
      apply: vi.fn(),
      get: vi.fn(),
      list,
    };

    renderWorkflowPage("/chat/workflows", { ...baseRepository, listDocuments }, templateRepository);

    await waitFor(() => expect(listDocuments).toHaveBeenCalled());
    expect(list).not.toHaveBeenCalled();
    expect(screen.queryByRole("region", { name: "推荐模板" })).not.toBeInTheDocument();

    await act(async () => {
      resolveList?.(await Promise.resolve(baseRepository.listDocuments()));
    });

    await waitFor(() => expect(list).toHaveBeenCalledWith({ featured: true, limit: 4 }));
  });

  it("shows all template pages and requests the selected page directly", async () => {
    const user = userEvent.setup();
    const createTemplateItem = (id: string, name: string) => ({
      coverUrl: null,
      description: "模板说明",
      id,
      name,
      nodeKinds: ["message", "tag"] as WorkflowNodeKind[],
      nodeCount: 3,
      publishedAt: "2026-09-01T00:00:00.000Z",
      sortOrder: 0,
      trigger: "添加好友",
      updatedAt: "2026-09-01T00:00:00.000Z",
      version: 1,
      workflowType: "chatai_sop" as const,
    });
    const list = vi.fn<WorkflowTemplateRepository["list"]>(async (input = {}) => input.featured
      ? { items: [createTemplateItem("1", "推荐模板样例")], total: 40 }
      : {
          items: [createTemplateItem(String(input.page ?? 1), `第 ${input.page ?? 1} 页模板`)],
          total: 40,
        });
    const templateRepository: WorkflowTemplateRepository = {
      apply: vi.fn(),
      get: vi.fn(),
      list,
    };

    renderWorkflowPage("/chat/workflows", getWorkflowDraftRepository(), templateRepository);

    expect(await screen.findByText("推荐模板样例")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "查看更多" }));
    expect(await screen.findByRole("heading", { name: "模板中心" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "返回工作流列表" })).toHaveAttribute("href", "/chat/workflows");
    await user.click(await screen.findByRole("button", { name: "5" }));

    expect(await screen.findByText("第 5 页模板")).toBeInTheDocument();
    expect(list).toHaveBeenCalledTimes(3);
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 8, page: 5 }));
    expect(list).not.toHaveBeenCalledWith(expect.objectContaining({ page: 2 }));
    expect(list).not.toHaveBeenCalledWith(expect.objectContaining({ page: 3 }));
    expect(list).not.toHaveBeenCalledWith(expect.objectContaining({ page: 4 }));
  });

  it("filters templates by every selected tag", async () => {
    const user = userEvent.setup();
    const template = {
      coverUrl: null,
      description: "模板说明",
      id: "tagged-template",
      name: "标签模板",
      nodeKinds: ["message"] as WorkflowNodeKind[],
      nodeCount: 1,
      publishedAt: "2026-09-01T00:00:00.000Z",
      sortOrder: 0,
      tags: ["lifecycle:potential_conversion", "lifecycle:new_customer_repurchase"],
      trigger: "添加好友",
      updatedAt: "2026-09-01T00:00:00.000Z",
      version: 1,
      workflowType: "chatai_sop" as const,
    };
    const list = vi.fn<WorkflowTemplateRepository["list"]>(async (input = {}) => input.featured
      ? { items: [template], total: 1 }
      : { items: [template], total: 1 });
    const templateRepository: WorkflowTemplateRepository = {
      apply: vi.fn(),
      get: vi.fn(),
      list,
    };

    renderWorkflowPage("/chat/workflows", getWorkflowDraftRepository(), templateRepository);
    await screen.findByText("标签模板");
    await user.click(screen.getByRole("button", { name: "查看更多" }));
    await screen.findByRole("heading", { name: "模板中心" });

    await user.click(screen.getByRole("button", { name: "潜客转化" }));
    await waitFor(() => expect(list).toHaveBeenLastCalledWith(expect.objectContaining({
      tags: ["lifecycle:potential_conversion"],
    })));
    await user.click(screen.getByRole("button", { name: "新客二回" }));
    await waitFor(() => expect(list).toHaveBeenLastCalledWith(expect.objectContaining({
      tags: ["lifecycle:potential_conversion", "lifecycle:new_customer_repurchase"],
    })));
  });

  it("keeps a slower previous template-center request from replacing the latest result", async () => {
    const user = userEvent.setup();
    const initialTemplate = {
      coverUrl: null,
      description: "初始结果",
      id: "initial-template",
      name: "初始模板",
      nodeKinds: ["message"] as WorkflowNodeKind[],
      nodeCount: 1,
      publishedAt: "2026-09-01T00:00:00.000Z",
      sortOrder: 0,
      trigger: "添加好友",
      updatedAt: "2026-09-01T00:00:00.000Z",
      version: 1,
      workflowType: "chatai_sop" as const,
    };
    const filteredTemplate = { ...initialTemplate, description: "筛选结果", id: "filtered-template", name: "筛选模板" };
    let resolveInitial!: (page: WorkflowTemplateListPage) => void;
    let resolveFiltered!: (page: WorkflowTemplateListPage) => void;
    const initial = new Promise<WorkflowTemplateListPage>(resolve => { resolveInitial = resolve; });
    const filtered = new Promise<WorkflowTemplateListPage>(resolve => { resolveFiltered = resolve; });
    const list = vi.fn<WorkflowTemplateRepository["list"]>(async (input = {}) => input.tags?.length ? filtered : initial);
    const templateRepository: WorkflowTemplateRepository = {
      apply: vi.fn(),
      get: vi.fn(),
      list,
    };

    renderWorkflowPage("/chat/workflows/templates", getWorkflowDraftRepository(), templateRepository);
    expect(await screen.findByRole("heading", { name: "模板中心" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "潜客转化" }));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));

    resolveFiltered({ items: [filteredTemplate], total: 1 });
    expect(await screen.findByText("筛选模板")).toBeInTheDocument();
    resolveInitial({ items: [initialTemplate], total: 1 });
    await act(async () => { await Promise.resolve(); });

    expect(screen.queryByText("初始模板")).not.toBeInTheDocument();
    expect(screen.getByText("筛选模板")).toBeInTheDocument();
  });

  it("previews and applies a published template from its card without changing the recommended list", async () => {
    const user = userEvent.setup();
    const recommendedTemplate = {
      coverUrl: null,
      description: "推荐模板说明",
      id: "featured-1",
      name: "推荐模板样例",
      nodeKinds: ["message", "tag"] as WorkflowNodeKind[],
      nodeCount: 2,
      publishedAt: "2026-09-01T00:00:00.000Z",
      sortOrder: 0,
      trigger: "添加好友",
      updatedAt: "2026-09-01T00:00:00.000Z",
      version: 1,
      workflowType: "chatai_sop" as const,
    };
    const browserTemplate = {
      ...recommendedTemplate,
      id: "browser-1",
      name: "模板中心样例",
    };
    const get = vi.fn().mockResolvedValue({
      ...recommendedTemplate,
      configurationItems: [],
      draft: createInitialDraft(),
      status: "published" as const,
    });
    const apply = vi.fn().mockResolvedValue({ id: "applied-workflow" });
    const withdraw = vi.fn();
    const templateRepository: WorkflowTemplateRepository = {
      apply,
      get,
      list: vi.fn(async input => input.featured
        ? { items: [recommendedTemplate], total: 1 }
        : { items: [browserTemplate], total: 1 }),
      withdraw,
    };

    renderWorkflowPage("/chat/workflows", getWorkflowDraftRepository(), templateRepository);

    const recommendationSection = await screen.findByRole("region", { name: "推荐模板" });
    const templateCard = await within(recommendationSection).findByTestId("workflow-template-card-featured-1");
    expect(templateCard.querySelector("img")).toHaveAttribute("src", "https://b5.bokr.com.cn/dist/backgrounds/10.png!w800.webp");
    expect(within(templateCard).getByLabelText("模板节点类型")).toHaveAttribute("data-tone", "light");
    expect(within(templateCard).getByLabelText("模板节点类型")).toHaveTextContent("+1");
    expect(within(recommendationSection).queryByRole("button", { name: "预览 推荐模板样例" })).not.toBeInTheDocument();
    expect(within(recommendationSection).queryByRole("button", { name: "一键应用 推荐模板样例" })).not.toBeInTheDocument();
    await user.click(templateCard);

    const previewDialog = await screen.findByRole("dialog");
    expect(get).toHaveBeenCalledWith("featured-1");
    expect(await within(previewDialog).findByRole("application", { name: "工作流预览" })).toHaveAttribute("data-preview", "true");
    expect(within(previewDialog).getByTestId("workflow-react-flow")).toHaveAttribute("data-pan-on-drag", "true");
    expect(within(previewDialog).getByTestId("workflow-react-flow")).toHaveAttribute("data-zoom-on-scroll", "true");
    expect(within(previewDialog).getAllByTestId(/workflow-handle-/).length).toBeGreaterThan(0);
    const previewActions = within(previewDialog).getByRole("group", { name: "模板操作" });
    expect(within(previewActions).getByRole("button", { name: "使用模板" })).toBeInTheDocument();
    expect(within(previewActions).queryByRole("button", { name: "更多模板操作" })).not.toBeInTheDocument();
    await user.click(within(previewDialog).getByRole("button", { name: "关闭" }));

    expect(within(recommendationSection).getByText("推荐模板样例")).toBeInTheDocument();
    expect(within(recommendationSection).queryByText("模板中心样例")).not.toBeInTheDocument();
    await user.click(templateCard);
    const reopenedPreview = await screen.findByRole("dialog");
    await user.click(within(within(reopenedPreview).getByRole("group", { name: "模板操作" })).getByRole("button", { name: "使用模板" }));

    await waitFor(() => expect(apply).toHaveBeenCalledWith("featured-1", expect.objectContaining({
      clientRequestId: expect.any(String),
    })));
  });

  it("keeps template detail failures actionable and retries the same template", async () => {
    const user = userEvent.setup();
    const item = {
      coverUrl: null,
      description: "模板说明",
      id: "template-detail-error",
      name: "详情失败模板",
      nodeKinds: ["message"] as WorkflowNodeKind[],
      nodeCount: 1,
      publishedAt: "2026-09-01T00:00:00.000Z",
      sortOrder: 0,
      trigger: "添加好友",
      updatedAt: "2026-09-01T00:00:00.000Z",
      version: 1,
      workflowType: "chatai_sop" as const,
    };
    const get = vi.fn()
      .mockRejectedValueOnce(new WorkflowRepositoryError("server", "模板服务暂不可用"))
      .mockResolvedValue({
        ...item,
        configurationItems: [],
        draft: createInitialDraft(),
        status: "published" as const,
      });
    const templateRepository: WorkflowTemplateRepository = {
      apply: vi.fn(),
      get,
      list: vi.fn(async () => ({ items: [item], total: 1 })),
    };

    renderWorkflowPage("/chat/workflows/templates", getWorkflowDraftRepository(), templateRepository);
    await user.click(await screen.findByTestId("workflow-template-card-template-detail-error"));

    const detailDialog = await screen.findByRole("dialog");
    expect(within(detailDialog).getByRole("heading", { name: "详情失败模板" })).toBeInTheDocument();
    expect(await within(detailDialog).findByRole("alert")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "重试" }));

    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("application", { name: "工作流预览" })).toBeInTheDocument();
  });


  it("shows a clean template draft preview and lets template managers delete the draft", async () => {
    const user = userEvent.setup();
    useAuthStore.getState().setSession({
      accountType: "sub",
      displayName: "模板运营",
      permissions: ["chat.access", "chat.send", "chat.takeover", "workflow_template_manage"],
      role: "admin",
      subUserId: "2",
      uid: 101,
    });
    const draftTemplate = {
      coverUrl: null,
      description: "尚未发布的模板",
      id: "8",
      name: "待发布模板",
      nodeKinds: ["message", "tag"] as WorkflowNodeKind[],
      nodeCount: 3,
      publishedAt: "2026-09-01T00:00:00.000Z",
      sortOrder: 0,
      trigger: "用户消息",
      updatedAt: "2026-09-01T00:00:00.000Z",
      version: 1,
      workflowType: "chatai_sop" as const,
    };
    const templateDetail = {
      ...draftTemplate,
      configurationItems: [],
      draft: createInitialDraft(),
      status: "draft" as const,
    };
    const listDrafts = vi.fn()
      .mockResolvedValueOnce({ items: [draftTemplate], total: 1 })
      .mockResolvedValue({ items: [], total: 0 });
    const deleteDraft = vi.fn().mockResolvedValue(undefined);
    const templateRepository = {
      apply: vi.fn(),
      deleteDraft,
      get: vi.fn(),
      getDraft: vi.fn().mockResolvedValue(templateDetail),
      list: vi.fn(async () => ({ items: [], total: 0 })),
      listDrafts,
      publish: vi.fn(),
    } as WorkflowTemplateRepository & {
      listDrafts: WorkflowTemplateRepository["list"];
    };

    renderWorkflowPage("/chat/workflows/templates", getWorkflowDraftRepository(), templateRepository);

    await user.click(await screen.findByRole("button", { name: "草稿箱" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(await within(dialog).findByRole("button", { name: /待发布模板/ }));

    expect(await within(dialog).findByRole("heading", { name: "待发布模板" })).toBeInTheDocument();
    expect(await within(dialog).findByRole("application", { name: "工作流预览" })).toHaveAttribute("data-preview", "true");
    const draftActions = within(dialog).getByRole("group", { name: "模板操作" });
    expect(within(draftActions).getByRole("button", { name: "更多模板操作" })).toBeInTheDocument();
    expect(within(draftActions).getByRole("button", { name: "发布模板" })).toBeInTheDocument();
    expect(within(dialog).queryByLabelText("画布工具")).not.toBeInTheDocument();
    expect(within(dialog).getByTestId("workflow-react-flow")).toHaveAttribute("data-fit-view", "false");
    expect(within(dialog).getByTestId("workflow-react-flow")).toHaveAttribute("data-hide-attribution", "true");
    await user.click(within(draftActions).getByRole("button", { name: "更多模板操作" }));
    await user.click(await screen.findByRole("menuitem", { name: "删除草稿" }));
    const confirmDialog = await screen.findByRole("alertdialog");
    await user.click(within(confirmDialog).getByRole("button", { name: "删除" }));

    expect(deleteDraft).toHaveBeenCalledWith("8");
    expect(await within(dialog).findByText("暂无数据")).toBeInTheDocument();
    expect(listDrafts).toHaveBeenCalledWith(expect.objectContaining({ limit: 8, page: 1 }));
  });

  it("lets template managers withdraw a published template from the overflow menu", async () => {
    const user = userEvent.setup();
    useAuthStore.getState().setSession({
      accountType: "sub",
      displayName: "模板运营",
      permissions: ["chat.access", "chat.send", "chat.takeover", "workflow_template_manage"],
      role: "admin",
      subUserId: "2",
      uid: 101,
    });
    const template = {
      coverUrl: null,
      description: "已发布模板",
      id: "9",
      name: "可撤回模板",
      nodeKinds: ["message"] as WorkflowNodeKind[],
      nodeCount: 2,
      publishedAt: "2026-09-01T00:00:00.000Z",
      sortOrder: 0,
      trigger: "用户消息",
      updatedAt: "2026-09-01T00:00:00.000Z",
      version: 1,
      workflowType: "chatai_sop" as const,
    };
    const withdraw = vi.fn().mockResolvedValue({ ...template, status: "draft" });
    const repository: WorkflowTemplateRepository = {
      apply: vi.fn(),
      get: vi.fn().mockResolvedValue({ ...template, configurationItems: [], draft: createInitialDraft(), status: "published" }),
      list: vi.fn(async input => input.featured ? { items: [template], total: 1 } : { items: [], total: 0 }),
      withdraw,
    };

    renderWorkflowPage("/chat/workflows", getWorkflowDraftRepository(), repository);
    await user.click(await screen.findByRole("button", { name: /可撤回模板/ }));
    const dialog = await screen.findByRole("dialog");
    const actions = within(dialog).getByRole("group", { name: "模板操作" });
    await user.click(within(actions).getByRole("button", { name: "更多模板操作" }));
    await user.click(await screen.findByRole("menuitem", { name: "撤回为草稿" }));
    const confirmDialog = await screen.findByRole("alertdialog");
    await user.click(within(confirmDialog).getByRole("button", { name: "撤回" }));

    await waitFor(() => expect(withdraw).toHaveBeenCalledWith("9"));
  });

  it("lets template managers edit published template metadata without withdrawing it", async () => {
    const user = userEvent.setup();
    useAuthStore.getState().setSession({
      accountType: "sub",
      displayName: "模板运营",
      permissions: ["chat.access", "chat.send", "chat.takeover", "workflow_template_manage"],
      role: "admin",
      subUserId: "2",
      uid: 101,
    });
    const template = {
      coverUrl: null,
      description: "旧描述",
      id: "10",
      name: "待编辑模板",
      nodeKinds: ["message"] as WorkflowNodeKind[],
      nodeCount: 2,
      publishedAt: "2026-09-01T00:00:00.000Z",
      sortOrder: 0,
      trigger: "用户消息",
      updatedAt: "2026-09-01T00:00:00.000Z",
      version: 1,
      workflowType: "chatai_sop" as const,
    };
    const updateInfo = vi.fn().mockImplementation(async (_id: string, input: Parameters<NonNullable<WorkflowTemplateRepository["updateInfo"]>>[1]) => ({
      ...template,
      ...input,
      configurationItems: [],
      draft: createInitialDraft(),
      status: "published" as const,
    }));
    const repository: WorkflowTemplateRepository = {
      apply: vi.fn(),
      get: vi.fn().mockResolvedValue({ ...template, configurationItems: [], draft: createInitialDraft(), status: "published" }),
      list: vi.fn(async input => input.featured ? { items: [template], total: 1 } : { items: [template], total: 1 }),
      updateInfo,
    };

    renderWorkflowPage("/chat/workflows", getWorkflowDraftRepository(), repository);
    await user.click(await screen.findByRole("button", { name: /待编辑模板/ }));
    const detailDialog = await screen.findByRole("dialog");
    await user.click(within(detailDialog).getByRole("button", { name: "更多模板操作" }));
    await user.click(await screen.findByRole("menuitem", { name: "编辑信息" }));

    const editDialog = await screen.findByRole("heading", { name: "编辑模板信息" }).then(heading => heading.closest<HTMLElement>('[role="dialog"]'));
    if (!editDialog) throw new Error("Template metadata dialog was not rendered");
    expect(within(editDialog).getByText("模板名称")).toBeInTheDocument();
    expect(within(editDialog).getByText("模板描述")).toBeInTheDocument();
    expect(within(editDialog).getByText("封面图片")).toBeInTheDocument();
    expect(within(editDialog).getByText("排序权重")).toBeInTheDocument();
    const nameInput = within(editDialog).getByRole("textbox", { name: "模板名称" });
    await user.clear(nameInput);
    await user.type(nameInput, "更新后的模板");
    await user.click(within(editDialog).getByRole("button", { name: "保存" }));

    await waitFor(() => expect(updateInfo).toHaveBeenCalledWith("10", expect.objectContaining({
      name: "更新后的模板",
      description: "旧描述",
    })));
    expect(await within(detailDialog).findByRole("heading", { name: "更新后的模板" })).toBeInTheDocument();
  });

  it("moves an inactive workflow from draft to ready after publishing", async () => {
    const user = userEvent.setup();
    const repository = getWorkflowDraftRepository();
    const draft = await repository.createDocument({ name: "待发布流程", workflowType: "chatai_sop" });
    const submitted = await repository.submitReview(draft.id);
    await repository.approveReview(draft.id, submitted.currentReview!.id);
    await repository.publishReview(draft.id, submitted.currentReview!.id);
    renderWorkflowPage("/chat/workflows");

    await user.click(screen.getByRole("tab", { name: "草稿" }));
    expect(screen.queryByText("待发布流程")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "未启用" }));
    const row = await screen.findByRole("row", { name: /待发布流程/ });
    expect(within(row).getByText("未启用")).toBeInTheDocument();
    await user.click(within(row).getByRole("button", { name: "操作 待发布流程" }));
    expect(screen.getByRole("menuitem", { name: "启用" })).toBeInTheDocument();
  });

  it("uses the ChatAI SOP type when creating from the direct route", async () => {
    const user = userEvent.setup();
    const createDocumentSpy = vi.spyOn(getWorkflowDraftRepository(), "createDocument");
    const { router } = renderWorkflowPage("/chat/workflows/new");

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(createDocumentSpy).not.toHaveBeenCalled();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();

    await user.type(getWorkflowMetadataInputs().nameInput, "ChatAI 新客旅程");
    await user.click(screen.getByRole("button", { name: "创建" }));

    expect(await screen.findByRole("application")).toBeInTheDocument();
    expect(createDocumentSpy).toHaveBeenCalledWith(expect.objectContaining({
      workflowType: "chatai_sop",
    }));
    expect(router.state.location.pathname).toBe("/chat/workflows/workflow-1");
    expect(screen.queryByRole("region", { name: "节点库" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开节点库" })).toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "节点配置" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "返回列表" })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "智能体导航" })).not.toBeInTheDocument();
  });

  it("renders a not-found state for unknown workflow ids", async () => {
    renderWorkflowPage("/chat/workflows/missing-workflow");

    const backLink = await screen.findByRole("link", { name: "返回列表" });
    expect(screen.queryByRole("application")).not.toBeInTheDocument();
    expect(backLink).toHaveAttribute("href", "/chat/workflows");
  });

  it("confirms internal navigation while the draft is not saved", async () => {
    const user = setupCanvasUser();
    const repository = getWorkflowDraftRepository();
    const originalSaveDraft = repository.saveDraft.bind(repository);
    let releaseSave!: () => void;
    let saveCompleted = Promise.resolve();
    const saveDraftSpy = vi.spyOn(repository, "saveDraft").mockImplementation((...args) => {
      const result = (async () => {
        await new Promise<void>((resolve) => {
          releaseSave = resolve;
        });
        return originalSaveDraft(...args);
      })();
      saveCompleted = result.then(() => undefined);
      return result;
    });
    const { router } = renderWorkflowPage("/chat/workflows/newcomer-conversion");
    const canvas = await screen.findByRole("application");

    await user.click(within(canvas).getByRole("button", { name: "打开节点库" }));
    await user.click(within(screen.getByRole("region", { name: "节点库" })).getByRole("button", { name: "添加 转人工节点" }));
    await waitFor(() => expect(saveDraftSpy).toHaveBeenCalled());

    void router.navigate("/chat/workflows");
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "继续编辑" }));
    expect(router.state.location.pathname).toBe("/chat/workflows/newcomer-conversion");

    void router.navigate("/chat/workflows");
    await user.click(await screen.findByRole("button", { name: "仍然离开" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/chat/workflows"));
    releaseSave();
    await saveCompleted;
    saveDraftSpy.mockRestore();
  });

  it("switches between design and data without treating it as leaving an unsaved workflow", async () => {
    const user = setupCanvasUser();
    const getDocumentSpy = vi.spyOn(getWorkflowDraftRepository(), "getDocument");
    const { router } = renderWorkflowPage("/chat/workflows/newcomer-conversion");
    const canvas = await screen.findByRole("application");
    await user.click(within(canvas).getByRole("button", { name: "打开节点库" }));
    await user.click(within(screen.getByRole("region", { name: "节点库" })).getByRole("button", { name: "添加 转人工节点" }));

    await user.click(screen.getByRole("tab", { name: "数据" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/chat/workflows/newcomer-conversion/data"));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(getDocumentSpy).toHaveBeenCalledTimes(1);
    getDocumentSpy.mockRestore();
  });

  it("opens current workflow data after publishing a new revision", async () => {
    const repository = getWorkflowDraftRepository();
    const existing = getWorkflowDocument("vip-reactivation");
    const start = existing.draft.nodes.find(node => node.data.kind === "start")!;
    const wait = existing.draft.nodes.find(node => node.data.kind === "wait")!;
    const end = existing.draft.nodes.find(node => node.data.kind === "end")!;
    await repository.saveDraft(existing.id, {
      ...existing.draft,
      edges: [
        { id: "edge-start-wait", source: start.id, target: wait.id, type: "workflow" },
        { id: "edge-wait-end", source: wait.id, target: end.id, type: "workflow" },
      ],
      nodes: [start, wait, end],
    });
    const submitted = await repository.submitReview(existing.id);
    await repository.approveReview(existing.id, submitted.currentReview!.id);
    await repository.publishReview(existing.id, submitted.currentReview!.id);
    const initialPublishedRevision = getWorkflowDocument(existing.id).publishedRevision!;
    const user = setupCanvasUser();
    const { router } = renderWorkflowPage("/chat/workflows/vip-reactivation");
    const canvas = await screen.findByRole("application");
    await user.click(within(canvas).getByRole("button", { name: "观察期" }));
    const panel = screen.getByRole("complementary", { name: "节点配置" });
    fireEvent.change(within(panel).getByLabelText("等待时长"), { target: { value: "3" } });

    const submitButton = await screen.findByRole("button", { name: "提交审核" });
    await waitFor(() => expect(submitButton).toBeEnabled());
    await user.click(submitButton);
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "提交审核" }));
    await user.click(await screen.findByRole("button", { name: "去审核" }));
    await user.click(within(screen.getByRole("complementary")).getByRole("button", { name: "通过" }));
    await user.click(await screen.findByRole("button", { name: "发布" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "发布" }));
    await waitFor(() => expect(getWorkflowDocument("vip-reactivation").publishedRevision)
      .toBe(initialPublishedRevision + 1));

    await user.click(screen.getByRole("tab", { name: "数据" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/chat/workflows/vip-reactivation/data"));
    expect(screen.getByRole("button", { name: "刷新数据" })).toBeInTheDocument();
  });

  it("opens workflow rows in the current tab", async () => {
    renderWorkflowPage("/chat/workflows");

    const editLink = await screen.findByRole("link", { name: "打开 新人转化旅程" });

    expect(editLink).toHaveAttribute("href", "/chat/workflows/newcomer-conversion");
    expect(editLink).not.toHaveAttribute("target");
    expect(editLink).not.toHaveAttribute("rel");
  });

  it("consumes the review deep link once so closing the panel keeps it closed", async () => {
    const user = userEvent.setup();
    await getWorkflowDraftRepository().submitReview("newcomer-conversion");
    const { router } = renderWorkflowPage("/chat/workflows/newcomer-conversion?panel=review");

    expect(await screen.findByText("发布审核")).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.search).toBe(""));
    await user.click(screen.getByRole("button", { name: "关闭审核" }));

    expect(screen.queryByText("发布审核")).not.toBeInTheDocument();
    expect(router.state.location.search).toBe("");
  });

  it("offers activation from the inactive workflow row menu", async () => {
    const user = userEvent.setup();
    await publishInMemoryWorkflow("newcomer-conversion");
    renderWorkflowPage("/chat/workflows");

    await screen.findByText("新人转化旅程");
    await user.click(screen.getByRole("button", { name: "操作 新人转化旅程" }));
    await user.click(screen.getByRole("menuitem", { name: "启用" }));

    await waitFor(() => {
      expect(getWorkflowDocument("newcomer-conversion").runtimeStatus).toBe("active");
    });
  });

  it("opens template conversion from the workflow row menu for template managers", async () => {
    const user = userEvent.setup();
    useAuthStore.getState().setSession({
      accountType: "sub",
      displayName: "模板运营",
      permissions: ["chat.access", "chat.send", "chat.takeover", "workflow_template_manage"],
      role: "admin",
      subUserId: "2",
      uid: 101,
    });
    const baseRepository = getWorkflowDraftRepository();
    const repository = {
      ...baseRepository,
      convertToTemplate: vi.fn(),
    };

    renderWorkflowPage("/chat/workflows", repository);

    await screen.findByText("新人转化旅程");
    await user.click(screen.getByRole("button", { name: "操作 新人转化旅程" }));
    await user.click(screen.getByRole("menuitem", { name: "转换为模板" }));

    expect(await screen.findByRole("dialog")).toHaveAccessibleName("转换为模板");
    expect(screen.getByRole("textbox", { name: "模板名称" })).toHaveValue("新人转化旅程");
    expect(screen.getByText("封面图片", { selector: "label" })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "排序权重" })).toHaveValue(0);
    expect(screen.getByText("数值越大越靠前，默认为 0")).toBeInTheDocument();
    expect(screen.getByText("生命周期")).toBeInTheDocument();
    expect(screen.getByText("行业特性")).toBeInTheDocument();
    expect(screen.getByText("常见场景")).toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: "模板描述" }), "用于验证模板转换");
    await user.click(screen.getByRole("button", { name: "潜客转化" }));
    await user.click(screen.getByRole("button", { name: "创建模板" }));

    await waitFor(() => expect(repository.convertToTemplate).toHaveBeenCalledWith(
      "newcomer-conversion",
      expect.objectContaining({
        description: "用于验证模板转换",
        name: "新人转化旅程",
        sortOrder: 0,
        tags: ["lifecycle:potential_conversion"],
      }),
    ));
  });

  it("does not offer activation for an unpublished draft", async () => {
    const user = userEvent.setup();
    await getWorkflowDraftRepository().createDocument({
      name: "未发布草稿",
      workflowType: "chatai_sop",
    });
    renderWorkflowPage("/chat/workflows");

    await user.click(await screen.findByRole("button", { name: "操作 未发布草稿" }));

    expect(screen.getByRole("menuitem", { name: "启用" })).toHaveAttribute("aria-disabled", "true");
  });

  it("enables a paused workflow through the resume lifecycle action", async () => {
    const user = userEvent.setup();
    renderWorkflowPage("/chat/workflows");

    const row = await screen.findByRole("row", { name: /直播后跟进/ });
    await user.click(within(row).getByRole("button", { name: "操作 直播后跟进" }));
    await user.click(screen.getByRole("menuitem", { name: "启用" }));

    await waitFor(() => {
      expect(getWorkflowDocument("live-follow-up").runtimeStatus).toBe("active");
    });
  });

  it("shows the active Workflow limit for both enable and resume", async () => {
    const user = userEvent.setup();
    const baseRepository = getWorkflowDraftRepository();
    await publishInMemoryWorkflow("newcomer-conversion");
    const limitError = () => new WorkflowRepositoryError(
      "conflict",
      "最多同时运行 50 个工作流",
      { apiCode: "WORKFLOW_ACTIVE_LIMIT_EXCEEDED" },
    );
    const repository = {
      ...baseRepository,
      enableDocument: vi.fn(() => { throw limitError(); }),
      resumeDocument: vi.fn(() => { throw limitError(); }),
    };
    const toastError = vi.spyOn(toast, "error");
    renderWorkflowPage("/chat/workflows", repository);

    await screen.findByText("新人转化旅程");
    await user.click(screen.getByRole("button", { name: "操作 新人转化旅程" }));
    await user.click(screen.getByRole("menuitem", { name: "启用" }));
    await waitFor(() => expect(toastError).toHaveBeenLastCalledWith("最多同时运行 50 个工作流"));

    const pausedRow = screen.getByRole("row", { name: /直播后跟进/ });
    await user.click(within(pausedRow).getByRole("button", { name: "操作 直播后跟进" }));
    await user.click(screen.getByRole("menuitem", { name: "启用" }));
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(2));
    expect(toastError).toHaveBeenLastCalledWith("最多同时运行 50 个工作流");

    toastError.mockRestore();
  });

  it("confirms before stopping a workflow", async () => {
    const user = userEvent.setup();
    const stopDocumentSpy = vi.spyOn(getWorkflowDraftRepository(), "stopDocument");
    renderWorkflowPage("/chat/workflows");

    await screen.findByText("会员复购唤醒");
    await user.click(screen.getByRole("button", { name: "操作 会员复购唤醒" }));
    await user.click(screen.getByRole("menuitem", { name: "停止" }));

    expect(stopDocumentSpy).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "停止" }));

    await waitFor(() => {
      expect(stopDocumentSpy).toHaveBeenCalledWith("vip-reactivation");
      expect(getWorkflowDocument("vip-reactivation").runtimeStatus).toBe("stopped");
    });
  });

  it("filters workflow rows and edits metadata from the row menu", async () => {
    const user = userEvent.setup();
    renderWorkflowPage("/chat/workflows");

    await screen.findByText("新人转化旅程");
    await user.type(getWorkflowSearchInput(), "会员");

    await waitFor(() => {
      expect(screen.queryByText("新人转化旅程")).not.toBeInTheDocument();
      expect(screen.getByText("会员复购唤醒")).toBeInTheDocument();
    });

    await user.clear(getWorkflowSearchInput());
    await waitFor(() => expect(screen.getByText("新人转化旅程")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "操作 新人转化旅程" }));
    await user.click(screen.getByRole("menuitem", { name: "重命名" }));
    const { descriptionInput, nameInput } = getWorkflowMetadataInputs();
    expect(nameInput).toHaveAttribute("maxlength", "40");
    expect(descriptionInput).toHaveAttribute("maxlength", "200");
    expect(nameInput).toHaveValue("新人转化旅程");
    expect(descriptionInput).toHaveValue("引导新客户完成首次购买");
    await user.clear(nameInput);
    await user.type(nameInput, "新客首购旅程");
    await user.clear(descriptionInput);
    await user.type(descriptionInput, "帮助新客户完成第一次购买");
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(await screen.findByText("新客首购旅程")).toBeInTheDocument();
    expect(screen.queryByText("新人转化旅程")).not.toBeInTheDocument();
    expect(getWorkflowDocument("newcomer-conversion").description).toBe("帮助新客户完成第一次购买");
  });

  it("reports metadata save failures through a toast", async () => {
    const user = userEvent.setup();
    const toastError = vi.spyOn(toast, "error");
    const baseRepository = getWorkflowDraftRepository();
    const repository = {
      ...baseRepository,
      updateDocumentMetadata: vi.fn().mockRejectedValue(new Error("network")),
    };

    renderWorkflowPage("/chat/workflows", repository);
    await screen.findByText("新人转化旅程");
    await user.click(screen.getByRole("button", { name: "操作 新人转化旅程" }));
    await user.click(screen.getByRole("menuitem", { name: "重命名" }));
    const { nameInput } = getWorkflowMetadataInputs();
    await user.clear(nameInput);
    await user.type(nameInput, "新名称");
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("操作失败，请稍后重试"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    toastError.mockRestore();
  });

  it("deletes a workflow from the row menu and refreshes the list", async () => {
    const user = userEvent.setup();
    renderWorkflowPage("/chat/workflows");

    await screen.findByText("直播后跟进");
    await user.click(screen.getByRole("button", { name: "操作 直播后跟进" }));
    await user.click(screen.getByRole("menuitem", { name: "删除" }));
    await user.click(screen.getByRole("button", { name: "删除" }));

    await waitFor(() => {
      expect(screen.queryByText("直播后跟进")).not.toBeInTheDocument();
    });
  });

  it("cancels deleting a workflow from the row menu", async () => {
    const user = userEvent.setup();
    const baseRepository = getWorkflowDraftRepository();
    const deleteDocument = vi.fn();
    renderWorkflowPage("/chat/workflows", { ...baseRepository, deleteDocument });

    await screen.findByText("直播后跟进");
    await user.click(screen.getByRole("button", { name: "操作 直播后跟进" }));
    await user.click(screen.getByRole("menuitem", { name: "删除" }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "取消" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(deleteDocument).not.toHaveBeenCalled();
  });

  it("reports delete failures through a toast", async () => {
    const user = userEvent.setup();
    const toastError = vi.spyOn(toast, "error");
    const baseRepository = getWorkflowDraftRepository();
    const repository = {
      ...baseRepository,
      deleteDocument: vi.fn().mockRejectedValue(new Error("network")),
    };

    renderWorkflowPage("/chat/workflows", repository);
    await screen.findByText("直播后跟进");
    await user.click(screen.getByRole("button", { name: "操作 直播后跟进" }));
    await user.click(screen.getByRole("menuitem", { name: "删除" }));
    await user.click(screen.getByRole("button", { name: "删除" }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("操作失败，请稍后重试"));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    toastError.mockRestore();
  });

  it("returns to the previous page after deleting its only workflow", async () => {
    const user = userEvent.setup();
    const baseRepository = getWorkflowDraftRepository();
    const newcomer = await baseRepository.getDocument("newcomer-conversion");
    const vip = await baseRepository.getDocument("vip-reactivation");
    const listDocuments = vi.fn((input: WorkflowListInput = {}) => input.page === 2
      ? { items: [newcomer], total: 11 }
      : { items: [vip], total: 11 });
    renderWorkflowPage("/chat/workflows", { ...baseRepository, listDocuments });

    await screen.findByText("会员复购唤醒");
    await user.click(screen.getByRole("button", { name: "下一页" }));
    await screen.findByText("新人转化旅程");
    await user.click(screen.getByRole("button", { name: "操作 新人转化旅程" }));
    await user.click(screen.getByRole("menuitem", { name: "删除" }));
    await user.click(screen.getByRole("button", { name: "删除" }));

    expect(await screen.findByText("会员复购唤醒")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "上一页" })).toBeDisabled();
    expect(listDocuments).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 }));
  });


});
