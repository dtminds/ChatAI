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
import { splitWorkflowTriggers } from "@/pages/chat/workflow/workflow-list-components";
import {
  canDeleteNodeKind,
  canDuplicateNodeKind,
  canInsertAfterNodeKind,
  createDefaultNodeData,
  getNodeDefinition,
  insertableNodeKinds,
  nodeDefinitions,
  orderedNodeDefinitions,
  paletteItems,
} from "@/pages/chat/workflow/node-definitions";
import {
  createEdge,
  createInitialDraft,
  createNodeFromKind,
} from "@/pages/chat/workflow/graph";
import type { WorkflowNodeKind } from "@/pages/chat/workflow/types";
import {
  getWorkflowDocument,
  getWorkflowDraftRepository,
  importWorkflowDraft,
  resetWorkflowDocumentsForTest,
  type WorkflowListInput,
  type WorkflowListPage,
} from "@/pages/chat/workflow/workflow-draft-service";
import { WorkflowRepositoryError } from "@/pages/chat/workflow/workflow-repository-types";
import {
  createMockWorkbenchService,
  resetWorkbenchService,
  setWorkbenchService,
} from "@/pages/chat/api/workbench-service";
import { MATERIAL_COLLECTION_BIZ_TYPE } from "@chatai/contracts";
import { useAuthStore } from "@/store/auth-store";

const agentServiceMock = vi.hoisted(() => ({
  getAiHostingQuota: vi.fn(),
  listAiHostingModels: vi.fn(),
}));

const reactFlowControlMock = vi.hoisted(() => ({
  fitView: vi.fn(),
  screenToFlowPosition: vi.fn(({ x, y }: { x: number; y: number }) => ({ x, y })),
  setCenter: vi.fn(),
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
      maxZoom,
      minZoom,
      multiSelectionKeyCode,
      nodeTypes,
      nodes,
      nodesConnectable,
      nodesDraggable,
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
        data-max-zoom={maxZoom}
        data-min-zoom={minZoom}
        data-multi-selection-key-code={multiSelectionKeyCode === null ? "disabled" : String(multiSelectionKeyCode)}
        data-testid="workflow-react-flow"
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
    uid: 1,
  });
}

function renderWorkflowPage(
  initialEntry = "/chat/workflows/newcomer-conversion",
  repository = getWorkflowDraftRepository(),
) {
  const router = createMemoryRouter(
    [
      {
        path: "/chat/workflows",
        element: <WorkflowPage repository={repository} />,
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

function getWorkflowBackButton() {
  const topbar = document.querySelector<HTMLElement>(".workflow-canvas-topbar");
  if (!topbar) throw new Error("Workflow canvas topbar was not rendered");
  return within(topbar).getByRole("button", { name: "返回列表" });
}

function getWorkflowMetadataButton(workflowName: string) {
  const heading = screen.getByRole("heading", { name: workflowName });
  const headingRow = heading.parentElement;
  if (!headingRow) throw new Error("Workflow heading row was not rendered");
  return within(headingRow).getByRole("button", { name: "编辑" });
}

function workflowNodeX(nodeId: string) {
  return Number(screen.getByTestId(`workflow-node-${nodeId}`).dataset.positionX);
}

function workflowNodeYByButtonName(canvas: HTMLElement, name: RegExp) {
  const node = within(canvas).getByRole("button", { name });
  const wrapper = node.closest("[data-testid^='workflow-node-']");

  return Number((wrapper as HTMLElement | null)?.dataset.positionY);
}

function closestWorkflowNodeX(element: HTMLElement) {
  const wrapper = element.closest("[data-testid^='workflow-node-']");

  return Number((wrapper as HTMLElement | null)?.dataset.positionX);
}

function setupCanvasUser() {
  return userEvent.setup({
    pointerEventsCheck: PointerEventsCheckLevel.Never,
  });
}

function getUndoButton(canvas: HTMLElement) {
  return within(canvas).getByRole("button", { name: /^撤销/ });
}

function getRedoButton(canvas: HTMLElement) {
  return within(canvas).getByRole("button", { name: /^重做/ });
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

  it("splits multiple workflow triggers into separate labels", () => {
    expect(splitWorkflowTriggers("添加好友、用户消息")).toEqual(["添加好友", "用户消息"]);
    expect(splitWorkflowTriggers("表单提交，收到邮件")).toEqual(["表单提交", "收到邮件"]);
    expect(splitWorkflowTriggers("90 天未复购会员")).toEqual(["90 天未复购会员"]);
  });

  it("keeps node metadata, default data, renderers, settings panels and palette in sync", () => {
    const nodeKinds = Object.keys(nodeDefinitions) as WorkflowNodeKind[];
    const paletteNodeIds = paletteItems.map((item) => item.id);

    expect(nodeKinds).toEqual([
      "agent",
      "ai-collect",
      "ai-intent",
      "audience-filter",
      "branch",
      "coupon",
      "customer-update",
      "end",
      "handoff",
      "llm",
      "message",
      "message-query",
      "order-bind",
      "order-query",
      "order-conversion",
      "ratio-split",
      "start",
      "tag",
      "tag-query",
      "wait",
      "wait-event",
    ]);

    for (const kind of nodeKinds) {
      const definition = nodeDefinitions[kind];
      const defaultData = createDefaultNodeData(kind);

      expect(defaultData.kind).toBe(kind);
      expect(defaultData.title).toBeTruthy();
      expect(defaultData.label).toBeTruthy();
      expect(defaultData.metric).toBeTruthy();
      expect(defaultData.status).toBeTruthy();
      expect(getNodeDefinition(kind)).toBe(definition);
      expect(definition.body.kind).toMatch(/custom|fields|none/);
      expect(canDeleteNodeKind(kind)).toBe(definition.canDelete);
      expect(canDuplicateNodeKind(kind)).toBe(definition.canDuplicate);
      expect(canInsertAfterNodeKind(kind)).toBe(definition.canInsertAfter);
    }

    expect(insertableNodeKinds).toEqual([
      "wait",
      "wait-event",
      "branch",
      "audience-filter",
      "ratio-split",
      "ai-intent",
      "llm",
      "ai-collect",
      "order-query",
      "tag-query",
      "tag",
      "customer-update",
      "order-bind",
      "message",
      "message-query",
      "handoff",
      "agent",
      "coupon",
      "order-conversion",
    ]);
    expect(paletteNodeIds).toEqual(insertableNodeKinds);
    expect(orderedNodeDefinitions.map((definition) => definition.kind)).toEqual([
      "start",
      "wait",
      "wait-event",
      "branch",
      "audience-filter",
      "ratio-split",
      "ai-intent",
      "llm",
      "ai-collect",
      "order-query",
      "tag-query",
      "tag",
      "customer-update",
      "order-bind",
      "message",
      "message-query",
      "handoff",
      "agent",
      "coupon",
      "order-conversion",
      "end",
    ]);
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

  it("creates WeCom SOPs without showing a type selector from the embedded Workflow list", async () => {
    const user = userEvent.setup();
    const repository = getWorkflowDraftRepository("sop_embed");
    const createDocumentSpy = vi.spyOn(repository, "createDocument");
    const router = createMemoryRouter([{
      path: "/embed/workflows",
      element: <WorkflowPage repository={repository} surface="sop_embed" />,
    }], { initialEntries: ["/embed/workflows"] });

    render(<RouterProvider router={router} />);
    await user.click(getWorkflowCreateButton());

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
      return input.cursor
        ? { items: [newcomer], nextCursor: null, total: 11 }
        : { items: [vip], nextCursor: "page-2", total: 11 };
    });
    renderWorkflowPage("/chat/workflows", { ...baseRepository, listDocuments });

    await screen.findByText("会员复购唤醒");
    expect(screen.getByText("共 11 条")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "下一页" }));
    await screen.findByText("新人转化旅程");
    await user.click(screen.getByRole("tab", { name: "运行中" }));

    await waitFor(() => expect(listDocuments).toHaveBeenLastCalledWith(expect.objectContaining({
      cursor: undefined,
      status: "active",
    })));
    expect(within(screen.getByRole("table")).getByRole("status"))
      .toBeInTheDocument();
    expect(screen.queryByText("新人转化旅程")).not.toBeInTheDocument();

    await act(async () => {
      resolveActiveList?.({
        items: [vip],
        nextCursor: null,
        total: 1,
      });
    });
    expect(await screen.findByText("会员复购唤醒")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "全部" }));
    await waitFor(() => expect(listDocuments).toHaveBeenLastCalledWith(expect.objectContaining({
      cursor: undefined,
      status: "all",
    })));
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
    const listDocuments = vi.fn((input: WorkflowListInput = {}) => input.cursor
      ? { items: [newcomer], nextCursor: null, total: 11 }
      : { items: [vip], nextCursor: "page-2", total: 11 });
    renderWorkflowPage("/chat/workflows", { ...baseRepository, listDocuments });

    await screen.findByText("会员复购唤醒");
    await user.click(screen.getByRole("button", { name: "下一页" }));
    await screen.findByText("新人转化旅程");
    await user.click(screen.getByRole("button", { name: "操作 新人转化旅程" }));
    await user.click(screen.getByRole("menuitem", { name: "删除" }));
    await user.click(screen.getByRole("button", { name: "删除" }));

    expect(await screen.findByText("会员复购唤醒")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "上一页" })).toBeDisabled();
    expect(listDocuments).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: undefined }));
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

  it("updates workflow metadata from the canvas header", async () => {
    const user = userEvent.setup();
    renderWorkflowPage("/chat/workflows/newcomer-conversion");

    await screen.findByRole("application");
    await user.click(getWorkflowMetadataButton("新人转化旅程"));
    const { descriptionInput, nameInput } = getWorkflowMetadataInputs();
    await user.clear(nameInput);
    await user.type(nameInput, "新客首购旅程");
    await user.clear(descriptionInput);
    await user.type(descriptionInput, "引导新客完成首购");
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(await screen.findByText("新客首购旅程")).toBeInTheDocument();
    expect(getWorkflowDocument("newcomer-conversion").name).toBe("新客首购旅程");
    expect(getWorkflowDocument("newcomer-conversion").description).toBe("引导新客完成首购");
  });

  it("opens version history as a header popover outside the canvas", async () => {
    const user = userEvent.setup();
    renderWorkflowPage("/chat/workflows/newcomer-conversion");

    const canvas = await screen.findByRole("application");
    await user.click(within(canvas).getByRole("button", { name: "观察期" }));
    const settings = screen.getByRole("complementary", { name: "节点配置" });
    await user.click(screen.getByRole("button", { name: "版本历史" }));

    const history = screen.getByRole("dialog", { name: "版本历史面板" });
    expect(history).toBeInTheDocument();
    expect(canvas).not.toContainElement(history);
    expect(settings).toBeInTheDocument();
  });

  it("shows historical node configuration in a read-only inspector", async () => {
    const user = userEvent.setup();
    await publishInMemoryWorkflow("newcomer-conversion");
    const currentDraft = getWorkflowDocument("newcomer-conversion").draft;
    importWorkflowDraft("newcomer-conversion", {
      ...currentDraft,
      nodes: currentDraft.nodes.map((node) => node.id === "wait-2d"
        ? {
            ...node,
            data: node.data.kind === "wait"
              ? { ...node.data, duration: 5, metric: "5 天后唤醒" }
              : node.data,
          }
        : node),
    });
    renderWorkflowPage("/chat/workflows/newcomer-conversion");

    const canvas = await screen.findByRole("application");
    await user.click(screen.getByRole("button", { name: "版本历史" }));
    await user.click(within(screen.getByRole("dialog", { name: "版本历史面板" }))
      .getByRole("button", { name: /版本 1/ }));
    await user.click(within(canvas).getByRole("button", { name: "观察期" }));

    const panel = screen.getByRole("complementary", { name: "节点配置" });
    expect(within(panel).getByRole("spinbutton", { name: "等待时长" })).toHaveValue(2);
    expect(within(panel).getByRole("spinbutton", { name: "等待时长" })).toBeDisabled();
    expect(getWorkflowDocument("newcomer-conversion").draft.nodes.find(node => node.id === "wait-2d")?.data)
      .toMatchObject({ duration: 5 });
  });

  it("groups canvas actions in a single bottom toolbar", async () => {
    renderWorkflowPage();

    const canvas = await screen.findByRole("application");
    const toolbar = within(canvas).getByLabelText("画布工具");

    expect(toolbar).toHaveClass("nodrag", "nopan");
    expect(within(toolbar).getByRole("button", { name: "缩小" })).toBeInTheDocument();
    expect(within(toolbar).getByRole("button", { name: "放大" })).toBeInTheDocument();
    expect(within(toolbar).getByRole("button", { name: "撤销" })).toBeInTheDocument();
    expect(within(toolbar).getByRole("button", { name: "重做" })).toBeInTheDocument();
    expect(within(toolbar).getByRole("button", { name: "自动整理画布" })).toBeInTheDocument();
    expect(within(toolbar).getByRole("button", { name: "显示小地图" })).toBeInTheDocument();
    expect(within(toolbar).getByRole("button", { name: "打开节点库" })).toBeInTheDocument();
    expect(within(toolbar).queryByRole("button", { name: "打开变量面板" })).not.toBeInTheDocument();
    expect(within(canvas).queryByRole("button", { name: "选择模式" })).not.toBeInTheDocument();
  });

  it("keeps checks as a dismissible overlay instead of a workspace tab", async () => {
    const user = userEvent.setup();

    renderWorkflowPage();

    expect(await screen.findByRole("application")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "编排" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "预览" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "检查" })).not.toBeInTheDocument();
    expect(screen.queryByText("客户路径模拟")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "提交审核" }));

    expect(screen.getByRole("region", { name: "发布检查" })).toBeInTheDocument();
    expect(screen.getByRole("application")).toBeInTheDocument();

    await user.click(within(screen.getByRole("application"))
      .getByRole("button", { name: "点击画布空白处" }));

    expect(screen.getByRole("region", { name: "发布检查" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "关闭发布检查" }));

    expect(screen.queryByRole("region", { name: "发布检查" })).not.toBeInTheDocument();
  });

  it("keeps publish checks open while navigating between node settings", async () => {
    const user = userEvent.setup();

    renderWorkflowPage("/chat/workflows/newcomer-conversion");

    const canvas = await screen.findByRole("application");
    await user.click(within(canvas).getByRole("button", { name: "观察期" }));
    expect(screen.getByRole("complementary", { name: "节点配置" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "提交审核" }));

    const checksPanel = screen.getByRole("region", { name: "发布检查" });
    expect(screen.getByRole("complementary", { name: "节点配置" })).toBeInTheDocument();

    const nodeIssue = within(checksPanel).getAllByRole("button")
      .find((button) => button.querySelector("[data-node-icon-kind]"));
    expect(nodeIssue).toBeDefined();
    await user.click(nodeIssue!);

    expect(screen.getByRole("region", { name: "发布检查" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "节点配置" })).toBeInTheDocument();
    expect(reactFlowControlMock.setCenter).toHaveBeenCalledWith(
      expect.any(Number),
      expect.any(Number),
      { duration: 200, zoom: 1 },
    );
  });

  it("keeps node naming out of the settings panel", async () => {
    const user = setupCanvasUser();

    renderWorkflowPage();

    const canvas = await screen.findByRole("application");
    await user.click(within(canvas).getByRole("button", { name: "打开节点库" }));
    const palette = await screen.findByRole("region", { name: "节点库" });
    await user.click(within(palette).getByRole("button", { name: "添加 转人工节点" }));

    const handoffNode = within(canvas).getByRole("button", { name: "转人工" });
    expect(handoffNode).toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "节点配置" })).not.toBeInTheDocument();

    await user.click(handoffNode);

    const panel = screen.getByRole("complementary", { name: "节点配置" });
    expect(within(panel).getAllByText("转人工")).toHaveLength(1);
    expect(within(panel).queryByLabelText("节点名称")).not.toBeInTheDocument();
    expect(within(panel).queryByLabelText("节点说明")).not.toBeInTheDocument();
  });

  it("configures operator and customer handoff messages", async () => {
    const user = setupCanvasUser();

    renderWorkflowPage();

    const canvas = await screen.findByRole("application");
    await user.click(within(canvas).getByRole("button", { name: "打开节点库" }));
    const palette = await screen.findByRole("region", { name: "节点库" });
    await user.click(within(palette).getByRole("button", { name: "添加 转人工节点" }));
    await user.click(within(canvas).getByRole("button", { name: "转人工" }));

    const panel = screen.getByRole("complementary", { name: "节点配置" });
    const operatorMessage = within(panel).getByRole("textbox", { name: "给客服的转发提示" });
    const customerMessage = within(panel).getByRole("textbox", { name: "对客话术" });

    expect(within(panel).getAllByText("0/100")).toHaveLength(2);

    const operatorSection = operatorMessage.closest("section")!;
    await user.click(within(operatorSection).getByRole("button", { name: "插入变量" }));
    await user.click(screen.getByRole("menuitem", { name: "全局变量" }));
    fireEvent.pointerDown(await screen.findByRole("menuitem", { name: /^客户 ID文本$/ }));

    const customerSection = customerMessage.closest("section")!;
    await user.click(within(customerSection).getByRole("button", { name: "插入变量" }));
    await user.click(screen.getByRole("menuitem", { name: "全局变量" }));
    fireEvent.pointerDown(await screen.findByRole("menuitem", { name: /^客户 ID文本$/ }));

    await waitFor(() => {
      expect(within(canvas).getByRole("button", { name: "转人工" }))
        .toHaveTextContent("客服提示：全局变量.客户 ID");
      expect(within(canvas).getByRole("button", { name: "转人工" }))
        .toHaveTextContent("对客话术：全局变量.客户 ID");
    });
    expect(within(panel).queryByText("0/100")).not.toBeInTheDocument();
  });

  it("does not create workflow history entries for unchanged repeated layout results", async () => {
    const user = setupCanvasUser();

    renderWorkflowPage();

    const canvas = await screen.findByRole("application");
    expect(getUndoButton(canvas)).toBeDisabled();

    await user.click(within(canvas).getByRole("button", { name: "自动整理画布" }));
    expect(getUndoButton(canvas)).toBeEnabled();

    await user.click(getUndoButton(canvas));
    expect(getUndoButton(canvas)).toBeDisabled();

    await user.click(within(canvas).getByRole("button", { name: "自动整理画布" }));
    expect(getUndoButton(canvas)).toBeEnabled();

    await user.click(within(canvas).getByRole("button", { name: "自动整理画布" }));
    expect(getUndoButton(canvas)).toBeEnabled();

    await user.click(getUndoButton(canvas));
    expect(getUndoButton(canvas)).toBeDisabled();
  });

  it("clears selected workflow nodes after pane clicks", async () => {
    const user = userEvent.setup();

    renderWorkflowPage();

    const canvas = await screen.findByRole("application");
    const branchNode = screen.getByTestId("workflow-node-branch-intent");

    await user.click(within(canvas).getByRole("button", { name: "意向判断" }));

    expect(branchNode).toHaveAttribute("data-selected", "true");
    expect(branchNode).toHaveAttribute("data-z-index", "20");

    await user.click(within(canvas).getByRole("button", { name: "点击画布空白处" }));

    expect(branchNode).not.toHaveAttribute("data-selected");
    expect(branchNode).not.toHaveAttribute("data-z-index");
  });

  it("lets users insert the next node from the canvas candidate menu", async () => {
    const user = setupCanvasUser();

    renderWorkflowPage();

    const canvas = await screen.findByRole("application");
    expect(within(canvas).getAllByText("添加节点").length).toBeGreaterThan(0);
    expect(within(canvas).getAllByText("连接节点").length).toBeGreaterThan(0);

    await user.click(within(canvas).getByRole("button", { name: "在发送欢迎消息后添加节点" }));
    expect(within(canvas).getByRole("menu", { name: "选择要添加的节点" })).toBeInTheDocument();

    await user.click(within(canvas).getByRole("button", { name: "点击画布空白处" }));
    expect(within(canvas).queryByRole("menu", { name: "选择要添加的节点" })).not.toBeInTheDocument();

    await user.click(within(canvas).getByRole("button", { name: "在发送欢迎消息后添加节点" }));
    await user.click(within(canvas).getByRole("menuitem", { name: /转人工/ }));

    const handoffNode = within(canvas).getByRole("button", { name: "转人工" });
    expect(workflowNodeX("message-welcome")).toBeLessThan(closestWorkflowNodeX(handoffNode));
    expect(closestWorkflowNodeX(handoffNode)).toBeLessThan(workflowNodeX("end"));
    expect(screen.getByRole("complementary", { name: "节点配置" })).toHaveTextContent(
      "转人工",
    );
  });

  it("lets users insert a node from the edge insertion menu", async () => {
    const user = userEvent.setup();

    renderWorkflowPage();

    const canvas = await screen.findByRole("application");
    await user.click(within(canvas).getByRole("button", { name: "在如果连线上添加节点" }));
    const picker = screen.getByRole("menu", { name: "选择要添加的节点" });
    await user.click(
      within(picker).getByRole("menuitem", {
        name: "添加 转人工节点",
      }),
    );

    const handoffNode = within(canvas).getByRole("button", { name: "转人工" });
    const handoffNodeWrapper = handoffNode.closest("[data-testid^='workflow-node-']");

    expect(handoffNodeWrapper).toHaveAttribute("data-selected", "true");
    expect(screen.queryAllByTestId(/^workflow-edge-/).some((edge) => edge.dataset.selected === "true")).toBe(false);
    expect(workflowNodeX("branch-intent")).toBeLessThan(closestWorkflowNodeX(handoffNode));
    expect(closestWorkflowNodeX(handoffNode)).toBeLessThan(workflowNodeX("message-welcome"));
    expect(screen.getByRole("complementary", { name: "节点配置" })).toHaveTextContent(
      "转人工",
    );
  });

  it("lets users insert a multi-outlet node from the edge insertion menu", async () => {
    const user = userEvent.setup();

    renderWorkflowPage();

    const canvas = await screen.findByRole("application");
    await user.click(within(canvas).getByRole("button", { name: "在如果连线上添加节点" }));
    const picker = screen.getByRole("menu", { name: "选择要添加的节点" });
    await user.click(
      within(picker).getByRole("menuitem", {
        name: "添加 条件分支节点",
      }),
    );

    expect(within(canvas).getByRole("button", { name: "条件分支" })).toBeInTheDocument();
  });

  it("closes edge insertion menus from canvas-level interactions", async () => {
    const user = userEvent.setup();

    renderWorkflowPage();

    const canvas = await screen.findByRole("application");
    await user.click(within(canvas).getByRole("button", { name: "在如果连线上添加节点" }));
    expect(screen.getByRole("menu", { name: "选择要添加的节点" })).toBeInTheDocument();

    await user.click(within(canvas).getByRole("button", { name: "点击画布空白处" }));
    expect(screen.queryByRole("menu", { name: "选择要添加的节点" })).not.toBeInTheDocument();

    await user.click(within(canvas).getByRole("button", { name: "在如果连线上添加节点" }));
    await user.click(within(canvas).getByRole("button", { name: "打开节点库" }));
    expect(screen.queryByRole("menu", { name: "选择要添加的节点" })).not.toBeInTheDocument();
  });

  it("keeps only one edge insertion menu open at a time", async () => {
    const user = userEvent.setup();

    renderWorkflowPage();

    const canvas = await screen.findByRole("application");
    await user.click(within(canvas).getByRole("button", { name: "在如果连线上添加节点" }));
    expect(screen.getAllByRole("menu", { name: "选择要添加的节点" })).toHaveLength(1);

    const edgeInsertButtons = within(canvas).getAllByRole("button", { name: /连线上添加节点/ });
    await user.click(edgeInsertButtons[1]!);
    expect(screen.getAllByRole("menu", { name: "选择要添加的节点" })).toHaveLength(1);
  });

  it("renders a source handle for each branch path on branch nodes", async () => {
    renderWorkflowPage();

    const branchNode = await screen.findByTestId("workflow-node-branch-intent");
    const sourceHandles = within(branchNode).getAllByTestId(/^workflow-handle-source-/);

    expect(sourceHandles.map((handle) => handle.dataset.handleId)).toEqual([
      "branch-high",
      "branch-default",
    ]);

    [
      ["branch-high", "如果"],
      ["branch-default", "否则"],
    ].forEach(([handleId, label]) => {
      const branchPath = within(branchNode).getByTestId(`workflow-branch-path-${handleId}`);

      expect(within(branchPath).queryByTestId(`workflow-handle-source-${handleId}`)).not.toBeInTheDocument();
      expect(within(branchNode).getByTestId(`workflow-handle-source-${handleId}`)).toBeInTheDocument();
      expect(within(branchPath).queryByRole("button", {
        name: `在意向判断的${label}分支后添加节点`,
      })).not.toBeInTheDocument();
      expect(within(branchNode).getByRole("button", {
        name: `在意向判断的${label}分支后添加节点`,
      })).toBeInTheDocument();
    });
  });

  it("shows all insertable nodes without a search control", async () => {
    const user = setupCanvasUser();

    renderWorkflowPage();

    const canvas = await screen.findByRole("application");
    await user.click(within(canvas).getByRole("button", { name: "打开节点库" }));
    const palette = await screen.findByRole("region", { name: "节点库" });

    expect(within(palette).getByRole("button", { name: "添加 转人工节点" })).toBeInTheDocument();
    expect(within(palette).getByRole("button", { name: "添加 发券节点" })).toBeInTheDocument();
    expect(within(palette).queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("inserts variables from nested context and upstream node menus", async () => {
    const user = setupCanvasUser();
    const draft = createInitialDraft();
    const llmNode = createNodeFromKind("llm", "llm-variable-source", 0);
    importWorkflowDraft("newcomer-conversion", {
      ...draft,
      edges: [
        ...draft.edges.filter((edge) => edge.target !== "message-welcome"),
        createEdge("branch-intent", llmNode.id, undefined, { sourceHandle: "branch-high" }),
        createEdge(llmNode.id, "message-welcome"),
      ],
      nodes: [
        ...draft.nodes,
        {
          ...llmNode,
          data: { ...llmNode.data, title: "生成营销文案" },
        },
      ],
    });

    renderWorkflowPage("/chat/workflows/newcomer-conversion");

    const canvas = await screen.findByRole("application");
    await user.click(within(canvas).getByRole("button", { name: "发送欢迎消息" }));

    const panel = screen.getByRole("complementary", { name: "节点配置" });
    await user.click(within(panel).getByRole("button", { name: "插入变量" }));
    expect(screen.queryByRole("menuitem", { name: /output/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "生成营销文案" }));
    fireEvent.pointerDown(await screen.findByRole("menuitem", { name: /output/ }));

    await waitFor(() => {
      expect(within(panel).getByText("生成营销文案.output")).toBeInTheDocument();
    });
    await user.click(within(panel).getByRole("button", { name: "插入变量" }));
    await user.click(screen.getByRole("menuitem", { name: "全局变量" }));
    fireEvent.pointerDown(await screen.findByRole("menuitem", { name: /^客户 ID文本$/ }));

    await waitFor(() => {
      expect(within(panel).getByText("全局变量.客户 ID")).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(within(canvas).getByRole("button", { name: "发送欢迎消息" }))
        .toHaveTextContent("生成营销文案.output 全局变量.客户 ID");
    });
    expect(within(panel).queryByRole("tab", { name: "变量" })).not.toBeInTheDocument();
  });

  it("configures message content and collected image attachments", async () => {
    const user = setupCanvasUser();
    const service = createMockWorkbenchService();
    setWorkbenchService({
      ...service,
      async listMaterialCollections(request) {
        if (request.bizType !== MATERIAL_COLLECTION_BIZ_TYPE.IMAGE) {
          return service.listMaterialCollections(request);
        }

        return {
          items: [{
            bizType: MATERIAL_COLLECTION_BIZ_TYPE.IMAGE,
            content: {
              alt: "新人活动图",
              fileUrl: "https://cdn.example.com/welcome.png",
            },
            contentType: "image",
            groupId: "mock-material-group-image",
            id: "material-image-1",
            msgInfoId: "9001",
            sort: 100,
            title: "新人活动图",
          }],
          pagination: { hasMore: false, page: 1, pageSize: 100, total: 1 },
        };
      },
    });

    renderWorkflowPage();
    const canvas = await screen.findByRole("application");
    await user.click(within(canvas).getByRole("button", { name: "发送欢迎消息" }));
    const panel = screen.getByRole("complementary", { name: "节点配置" });

    expect(within(panel).getByText(/\/1000$/)).toBeInTheDocument();
    expect(within(panel).getByRole("heading", { name: "配置须知" })).toBeInTheDocument();
    expect(within(panel).queryByLabelText("上传图片")).not.toBeInTheDocument();
    await user.click(within(panel).getByRole("button", { name: "添加附件" }));
    await user.click(screen.getByRole("menuitem", { name: "图片" }));
    expect(await screen.findByRole("dialog", { name: "收录的图片" })).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "选择图片 新人活动图" }));
    await user.click(screen.getByRole("button", { name: "确定" }));

    expect(within(panel).getByText("新人活动图")).toBeInTheDocument();
    expect(within(canvas).getByRole("button", { name: "发送欢迎消息" })).toHaveTextContent("附件：1 个");
    await user.click(within(panel).getByRole("button", { name: "删除附件 新人活动图" }));
    expect(within(panel).queryByText("新人活动图")).not.toBeInTheDocument();
  });

  it("uses a guaranteed upstream message output without discarding custom content", async () => {
    const user = setupCanvasUser();
    const draft = createInitialDraft();
    const llmNode = createNodeFromKind("llm", "llm-copy", 0);
    importWorkflowDraft("newcomer-conversion", {
      ...draft,
      edges: [
        ...draft.edges.filter((edge) => edge.target !== "message-welcome"),
        createEdge("branch-intent", llmNode.id, undefined, { sourceHandle: "branch-high" }),
        createEdge(llmNode.id, "message-welcome"),
      ],
      nodes: [
        ...draft.nodes,
        {
          ...llmNode,
          data: { ...llmNode.data, title: "生成营销文案" },
        },
      ],
    });

    renderWorkflowPage("/chat/workflows/newcomer-conversion");
    const canvas = await screen.findByRole("application");
    const messageNode = within(canvas).getByRole("button", { name: "发送欢迎消息" });
    await user.click(messageNode);
    const panel = screen.getByRole("complementary", { name: "节点配置" });

    await user.click(within(panel).getByRole("radio", { name: "节点输出" }));
    expect(within(panel).getByRole("button", { name: "添加附件" })).toBeInTheDocument();
    await user.click(within(panel).getByRole("combobox", { name: "节点输出" }));
    await user.click(await screen.findByRole("option", { name: "output" }));

    await waitFor(() => {
      expect(messageNode).toHaveTextContent("生成营销文案.output");
    });
    await user.click(within(panel).getByRole("radio", { name: "自定义消息" }));
    expect(messageNode).toHaveTextContent("欢迎加入，这是为你准备的新人活动");
    await user.click(within(panel).getByRole("radio", { name: "节点输出" }));
    expect(within(panel).getByRole("combobox", { name: "节点输出" })).toHaveTextContent("output");
  });

  it("closes and reopens the node config panel from canvas selection", async () => {
    const user = userEvent.setup();

    renderWorkflowPage();

    expect(screen.queryByRole("complementary", { name: "节点配置" })).not.toBeInTheDocument();

    const canvas = await screen.findByRole("application");
    await user.click(within(canvas).getByRole("button", { name: "观察期" }));

    const panel = screen.getByRole("complementary", { name: "节点配置" });
    expect(within(panel).getByText("观察期")).toBeInTheDocument();
    expect(within(panel).getByText("等待")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "关闭节点配置" }));

    expect(screen.queryByRole("complementary", { name: "节点配置" })).not.toBeInTheDocument();
  });

  it("configures fixed-time waits and reflects the schedule on the node", async () => {
    const user = userEvent.setup();

    renderWorkflowPage();

    const canvas = await screen.findByRole("application");
    await user.click(within(canvas).getByRole("button", { name: "观察期" }));

    const panel = screen.getByRole("complementary", { name: "节点配置" });
    expect(within(panel).getByRole("radio", { name: "常规时长等待" })).toBeChecked();
    await user.click(within(panel).getByRole("radio", { name: "固定时间等待" }));

    const dayOffsetInput = within(panel).getByRole("spinbutton", { name: "等待天数" });
    await user.clear(dayOffsetInput);
    await user.type(dayOffsetInput, "2");
    await user.click(within(panel).getByRole("button", { name: "执行时间" }));
    await user.click(screen.getByRole("button", { name: /20\s*时/ }));
    await user.click(screen.getByRole("button", { name: /00\s*分/ }));

    await waitFor(() => {
      expect(within(canvas).getByRole("button", { name: "观察期" }))
        .toHaveTextContent("等待时间：2 天后的 20:00，执行后续节点");
    });
  });

  it("limits regular wait duration by the selected unit", async () => {
    const user = userEvent.setup();

    renderWorkflowPage();

    const canvas = await screen.findByRole("application");
    await user.click(within(canvas).getByRole("button", { name: "观察期" }));
    const panel = screen.getByRole("complementary", { name: "节点配置" });
    const durationInput = within(panel).getByRole("spinbutton", { name: "等待时长" });

    await user.click(within(panel).getByRole("combobox", { name: "等待时间单位" }));
    await user.click(screen.getByRole("option", { name: "分钟" }));
    await user.clear(durationInput);
    await user.type(durationInput, "96");
    await user.click(within(panel).getByRole("combobox", { name: "等待时间单位" }));
    await user.click(screen.getByRole("option", { name: "小时" }));

    expect(durationInput).toHaveAttribute("max", "96");
    expect(durationInput).toHaveValue(96);

    await user.click(within(panel).getByRole("combobox", { name: "等待时间单位" }));
    await user.click(screen.getByRole("option", { name: "天" }));
    expect(durationInput).toHaveAttribute("max", "45");
    expect(durationInput).toHaveValue(45);
  });

  it("supports undo and redo for inserted canvas nodes", async () => {
    const user = userEvent.setup();

    renderWorkflowPage();

    const canvas = await screen.findByRole("application");
    expect(within(canvas).getByLabelText("画布工具")).toHaveClass("nodrag", "nopan");

    await user.click(within(canvas).getByRole("button", { name: "打开节点库" }));
    const palette = await screen.findByRole("region", { name: "节点库" });

    await user.click(within(palette).getByRole("button", { name: "添加 转人工节点" }));
    expect(within(canvas).getByRole("button", { name: "转人工" })).toBeInTheDocument();

    await user.click(getUndoButton(canvas));
    expect(within(canvas).queryByRole("button", { name: "转人工" })).not.toBeInTheDocument();

    await user.click(getRedoButton(canvas));
    expect(within(canvas).getByRole("button", { name: "转人工" })).toBeInTheDocument();
  });

  it("supports undo and redo keyboard shortcuts outside editable fields", async () => {
    const user = userEvent.setup();

    renderWorkflowPage();

    const canvas = await screen.findByRole("application");
    await user.click(within(canvas).getByRole("button", { name: "打开节点库" }));
    const palette = await screen.findByRole("region", { name: "节点库" });
    await user.click(within(palette).getByRole("button", { name: "添加 转人工节点" }));

    const undoEvent = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "z",
      metaKey: true,
    });
    const undoPreventDefault = vi.spyOn(undoEvent, "preventDefault");
    fireEvent(window, undoEvent);

    expect(undoPreventDefault).toHaveBeenCalled();
    await waitFor(() => {
      expect(within(canvas).queryByRole("button", { name: "转人工" })).not.toBeInTheDocument();
    });

    fireEvent.keyDown(window, { key: "y", metaKey: true });
    expect(await within(canvas).findByRole("button", { name: "转人工" })).toBeInTheDocument();
  });

  it("does not run workflow history shortcuts from editable fields", async () => {
    const user = userEvent.setup();

    renderWorkflowPage();

    const canvas = await screen.findByRole("application");
    await user.click(within(canvas).getByRole("button", { name: "观察期" }));
    const panel = screen.getByRole("complementary", { name: "节点配置" });
    fireEvent.keyDown(within(panel).getByLabelText("等待时长"), { key: "z", metaKey: true });

    expect(within(canvas).getByRole("button", { name: "观察期" })).toBeInTheDocument();
  });

  it("keeps canvas selection out of workflow undo history", async () => {
    const user = userEvent.setup();

    renderWorkflowPage();

    const canvas = await screen.findByRole("application");
    await user.click(within(canvas).getByRole("button", { name: "打开节点库" }));
    const palette = await screen.findByRole("region", { name: "节点库" });
    await user.click(within(palette).getByRole("button", { name: "添加 转人工节点" }));
    const insertedNode = within(canvas).getByRole("button", { name: "转人工" });
    const insertedNodeWrapper = insertedNode.closest("[data-testid^='workflow-node-']");

    expect(insertedNodeWrapper).not.toHaveAttribute("data-selected", "true");

    await user.click(within(canvas).getByRole("button", { name: "观察期" }));
    expect(insertedNodeWrapper).not.toHaveAttribute("data-selected", "true");

    await user.click(getUndoButton(canvas));

    expect(within(canvas).queryByRole("button", { name: "转人工" })).not.toBeInTheDocument();
    expect(screen.getByTestId("workflow-node-wait-2d")).toHaveAttribute("data-selected", "true");
  });

  it("keeps viewport changes out of workflow save and undo history", async () => {
    const user = userEvent.setup();

    renderWorkflowPage();

    const canvas = await screen.findByRole("application");
    const initialViewport = getWorkflowDocument("newcomer-conversion").draft.viewport;

    await user.click(within(canvas).getByRole("button", { name: "移动画布视角" }));

    expect(getWorkflowDocument("newcomer-conversion").draft.viewport).toEqual(initialViewport);
    expect(getUndoButton(canvas)).toBeDisabled();
  });

  it("merges rapid node config edits into a single undo step", async () => {
    renderWorkflowPage();

    const canvas = await screen.findByRole("application");
    fireEvent.click(within(canvas).getByRole("button", { name: "观察期" }));

    const configPanel = screen.getByRole("complementary", { name: "节点配置" });
    const durationInput = within(configPanel).getByLabelText("等待时长");
    const originalDuration = durationInput.getAttribute("value");

    vi.useFakeTimers();

    try {
      fireEvent.change(durationInput, { target: { value: "3" } });
      fireEvent.change(durationInput, { target: { value: "4" } });

      expect(durationInput).toHaveValue(4);
      expect(getUndoButton(canvas)).toBeEnabled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });

      expect(getUndoButton(canvas)).toBeEnabled();
      fireEvent.click(getUndoButton(canvas));

      expect(within(configPanel).getByLabelText("等待时长")).toHaveValue(Number(originalDuration));
    }
    finally {
      vi.useRealTimers();
    }
  });

  it("clears redo history after a new workflow edit", async () => {
    const user = setupCanvasUser();

    renderWorkflowPage();

    const canvas = await screen.findByRole("application");
    await user.click(within(canvas).getByRole("button", { name: "打开节点库" }));
    const palette = await screen.findByRole("region", { name: "节点库" });
    await user.click(within(palette).getByRole("button", { name: "添加 转人工节点" }));

    await user.click(getUndoButton(canvas));
    expect(getRedoButton(canvas)).toBeEnabled();

    await user.click(within(canvas).getByRole("button", { name: "在发送欢迎消息后添加节点" }));
    await user.click(within(canvas).getByRole("menuitem", { name: "添加 等待节点" }));

    expect(getRedoButton(canvas)).toBeDisabled();
    expect(within(canvas).queryByRole("button", { name: "转人工" })).not.toBeInTheDocument();
  });

  it("records final node position changes in workflow history", async () => {
    const user = userEvent.setup();

    renderWorkflowPage();

    const canvas = await screen.findByRole("application");
    const originalX = workflowNodeX("wait-2d");
    const originalY = Number(screen.getByTestId("workflow-node-wait-2d").dataset.positionY);

    await user.click(within(canvas).getByRole("button", { name: "移动观察期" }));

    expect(workflowNodeX("wait-2d")).toBe(420);
    expect(Number(screen.getByTestId("workflow-node-wait-2d").dataset.positionY)).toBe(120);
    expect(within(canvas).getByRole("button", { name: "撤销：移动节点" })).toBeEnabled();

    await user.click(getUndoButton(canvas));

    expect(workflowNodeX("wait-2d")).toBe(originalX);
    expect(Number(screen.getByTestId("workflow-node-wait-2d").dataset.positionY)).toBe(originalY);
  });

  it("keeps the canvas operator controls interactive", async () => {
    const user = userEvent.setup();

    renderWorkflowPage();

    const canvas = await screen.findByRole("application");

    await user.click(within(canvas).getByRole("button", { name: "打开节点库" }));
    const palette = within(canvas).getByRole("region", { name: "节点库" });
    await user.click(within(palette).getByRole("button", { name: "添加 转人工节点" }));
    expect(within(canvas).getByRole("button", { name: "转人工" })).toBeInTheDocument();

    await user.click(within(canvas).getByRole("button", { name: "自动整理画布" }));
    expect(getUndoButton(canvas)).toBeEnabled();

    await user.click(within(canvas).getByRole("button", { name: "缩小" }));
    await user.click(within(canvas).getByRole("button", { name: "放大" }));
    expect(screen.getByTestId("workflow-react-flow")).toHaveAttribute("data-min-zoom", "0.25");
    expect(screen.getByTestId("workflow-react-flow")).toHaveAttribute("data-max-zoom", "2");

    const zoomMenuTrigger = within(canvas).getByRole("button", {
      name: "当前缩放 100%，打开缩放菜单",
    });

    await user.click(zoomMenuTrigger);
    await user.click(await screen.findByRole("menuitem", { name: "200%" }));

    await user.click(zoomMenuTrigger);
    await user.click(await screen.findByRole("menuitem", { name: "25%" }));

    await user.click(zoomMenuTrigger);
    await user.click(await screen.findByRole("menuitem", { name: "适配画布" }));

    expect(screen.queryByTestId("workflow-minimap")).not.toBeInTheDocument();
    await user.click(within(canvas).getByRole("button", { name: "显示小地图" }));
    expect(screen.getByTestId("workflow-minimap")).toBeInTheDocument();

    await user.click(within(canvas).getByRole("button", { name: "显示小地图" }));
    expect(screen.queryByTestId("workflow-minimap")).not.toBeInTheDocument();

    expect(reactFlowControlMock.zoomOut).toHaveBeenCalledTimes(1);
    expect(reactFlowControlMock.zoomIn).toHaveBeenCalledTimes(1);
    expect(reactFlowControlMock.zoomTo).toHaveBeenNthCalledWith(1, 2);
    expect(reactFlowControlMock.zoomTo).toHaveBeenNthCalledWith(2, 0.25);
    expect(reactFlowControlMock.fitView).toHaveBeenCalledTimes(1);
  });

  it("arranges nodes by connection order after inserting a node in the middle", async () => {
    const user = userEvent.setup();

    renderWorkflowPage();

    const canvas = await screen.findByRole("application");
    await user.click(within(canvas).getByRole("button", { name: "在如果连线上添加节点" }));
    await user.click(screen.getByRole("menuitem", { name: /转人工/ }));
    await user.click(within(canvas).getByRole("button", { name: "自动整理画布" }));

    const branchX = workflowNodeX("branch-intent");
    const handoffNode = within(canvas).getByRole("button", { name: "转人工" });
    const handoffX = closestWorkflowNodeX(handoffNode);
    const messageX = workflowNodeX("message-welcome");

    expect(branchX).toBeLessThan(handoffX);
    expect(handoffX).toBeLessThan(messageX);
  });

  it("arranges branch paths by handle order instead of insertion order", async () => {
    const user = setupCanvasUser();

    renderWorkflowPage();

    const canvas = await screen.findByRole("application");
    await user.click(within(canvas).getByRole("button", { name: "在意向判断的否则分支后添加节点" }));
    await user.click(within(canvas).getByRole("menuitem", { name: /转人工/ }));
    await user.click(within(canvas).getByRole("button", { name: "在意向判断的如果分支后添加节点" }));
    await user.click(within(canvas).getByRole("menuitem", { name: /发券/ }));
    await user.click(within(canvas).getByRole("button", { name: "自动整理画布" }));

    const highY = workflowNodeYByButtonName(canvas, /^发券$/);
    const defaultY = workflowNodeYByButtonName(canvas, /^转人工$/);

    expect(highY).toBeLessThan(defaultY);
  });

  it("highlights incoming and outgoing edges when hovering a workflow node", async () => {
    const user = userEvent.setup();

    renderWorkflowPage();

    const messageNode = await screen.findByTestId("workflow-node-message-welcome");
    const incomingEdge = screen.getByTestId("workflow-base-edge-edge-branch-intent-branch-high-message-welcome");
    const outgoingEdge = screen.getByTestId("workflow-base-edge-edge-message-welcome-end");
    const unrelatedEdge = screen.getByTestId("workflow-base-edge-edge-wait-2d-branch-intent");

    await user.hover(messageNode);

    expect(incomingEdge).toHaveAttribute("data-stroke", "var(--workflow-blue)");
    expect(outgoingEdge).toHaveAttribute("data-stroke", "var(--workflow-blue)");
    expect(incomingEdge).toHaveAttribute("data-stroke-width", "2.5");
    expect(outgoingEdge).toHaveAttribute("data-stroke-width", "2.5");
    expect(unrelatedEdge).toHaveAttribute("data-opacity", "0.32");

    await user.unhover(messageNode);

    expect(incomingEdge).toHaveAttribute("data-opacity", "0.72");
    expect(outgoingEdge).toHaveAttribute("data-opacity", "0.72");
    expect(unrelatedEdge).toHaveAttribute("data-opacity", "0.72");
  });

  it("opens node actions from the floating more button", async () => {
    const user = userEvent.setup();

    renderWorkflowPage();

    const canvas = await screen.findByRole("application");
    await user.click(within(canvas).getByRole("button", { name: "发送欢迎消息" }));
    await user.click(within(canvas).getByRole("button", { name: "更多操作：发送欢迎消息" }));

    const actionMenu = await screen.findByRole("menu");
    expect(actionMenu).toBeInTheDocument();
    expect(within(actionMenu).getByRole("menuitem", { name: "重命名" })).toBeInTheDocument();
    expect(within(actionMenu).getByRole("menuitem", { name: "复制节点" })).toBeInTheDocument();
    expect(within(actionMenu).getByRole("separator")).toBeInTheDocument();
    expect(within(actionMenu).getByRole("menuitem", { name: "删除节点" })).toBeInTheDocument();
    expect(within(actionMenu).queryByRole("menuitem", { name: "打开配置" })).not.toBeInTheDocument();
    expect(within(actionMenu).queryByRole("menuitem", { name: "添加后续节点" })).not.toBeInTheDocument();

    await user.click(within(canvas).getByRole("button", { name: "点击画布空白处" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("renames editable nodes inline without opening node settings and limits names to 10 characters", async () => {
    const user = userEvent.setup();

    renderWorkflowPage();

    const canvas = await screen.findByRole("application");
    const messageNode = within(canvas).getByTestId("workflow-node-message-welcome");
    await user.click(within(canvas).getByRole("button", { name: "发送欢迎消息" }));
    await user.click(screen.getByRole("button", { name: "关闭节点配置" }));
    await user.click(within(canvas).getByRole("button", { name: "更多操作：发送欢迎消息" }));
    await user.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "重命名" }));

    expect(screen.queryByRole("complementary", { name: "节点配置" })).not.toBeInTheDocument();
    const nameInput = within(messageNode).getByRole("textbox", { name: "节点名称" });
    await user.clear(nameInput);
    await user.type(nameInput, "12345678901{Enter}");

    expect(within(canvas).getByRole("button", { name: "1234567890" })).toBeInTheDocument();
    expect(getUndoButton(canvas)).toHaveAttribute("aria-label", "撤销：修改节点名称");

    await user.click(getUndoButton(canvas));
    expect(within(canvas).getByRole("button", { name: "发送欢迎消息" })).toBeInTheDocument();

    await user.click(getRedoButton(canvas));
    expect(within(canvas).getByRole("button", { name: "1234567890" })).toBeInTheDocument();
  });

  it("starts inline node renaming by double-clicking the title", async () => {
    const user = userEvent.setup();

    renderWorkflowPage();

    const canvas = await screen.findByRole("application");
    const messageNode = within(canvas).getByTestId("workflow-node-message-welcome");
    await user.dblClick(within(messageNode).getByText("发送欢迎消息"));

    const nameInput = within(messageNode).getByRole("textbox", { name: "节点名称" });
    await user.clear(nameInput);
    await user.type(nameInput, "双击重命名{Enter}");

    expect(within(canvas).getByRole("button", { name: "双击重命名" })).toBeInTheDocument();
  });

  it("renames a node from the settings panel menu and limits names to 10 characters", async () => {
    const user = userEvent.setup();

    renderWorkflowPage();

    const canvas = await screen.findByRole("application");
    await user.click(within(canvas).getByRole("button", { name: "观察期" }));
    const panel = screen.getByRole("complementary", { name: "节点配置" });
    await user.click(within(panel).getByRole("button", { name: "更多节点操作" }));
    await user.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "重命名" }));

    const nameInput = await within(panel).findByRole("textbox", { name: "节点名称" });
    await user.clear(nameInput);
    await user.type(nameInput, "12345678901{Enter}");

    expect(within(panel).getByRole("heading", { name: "1234567890" })).toBeInTheDocument();
    expect(within(canvas).getByRole("button", { name: "1234567890" })).toBeInTheDocument();
    expect(getUndoButton(canvas)).toHaveAttribute("aria-label", "撤销：修改节点名称");
  });

  it("clears settings rename state when selecting another node", async () => {
    const user = setupCanvasUser();

    renderWorkflowPage();

    const canvas = await screen.findByRole("application");
    await user.click(within(canvas).getByRole("button", { name: "观察期" }));
    let panel = screen.getByRole("complementary", { name: "节点配置" });
    await user.click(within(panel).getByRole("button", { name: "更多节点操作" }));
    await user.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "重命名" }));

    const nameInput = await within(panel).findByRole("textbox", { name: "节点名称" });
    await user.clear(nameInput);
    await user.type(nameInput, "观察期新名称");
    await user.click(within(canvas).getByRole("button", { name: "发送欢迎消息" }));

    panel = screen.getByRole("complementary", { name: "节点配置" });
    expect(within(panel).queryByRole("textbox", { name: "节点名称" })).not.toBeInTheDocument();
    expect(within(panel).getByRole("heading", { name: "发送欢迎消息" })).toBeInTheDocument();
    expect(within(canvas).getByRole("button", { name: "观察期新名称" })).toBeInTheDocument();
  });

  it("does not show the settings menu for protected nodes", async () => {
    const user = userEvent.setup();

    renderWorkflowPage();

    const canvas = await screen.findByRole("application");
    await user.click(within(canvas).getByRole("button", { name: "新人入会触发" }));
    const panel = screen.getByRole("complementary", { name: "节点配置" });

    expect(within(panel).queryByRole("button", { name: "更多节点操作" })).not.toBeInTheDocument();
  });

  it("does not rename protected node titles on double-click", async () => {
    const user = userEvent.setup();

    renderWorkflowPage();

    const canvas = await screen.findByRole("application");
    const startNode = within(canvas).getByTestId("workflow-node-start");
    const endNode = within(canvas).getByTestId("workflow-node-end");

    await user.dblClick(within(startNode).getByText("新人入会触发"));
    await user.dblClick(within(endNode).getByText("结束"));

    expect(within(startNode).queryByRole("textbox", { name: "节点名称" })).not.toBeInTheDocument();
    expect(within(endNode).queryByRole("textbox", { name: "节点名称" })).not.toBeInTheDocument();
  });

  it("cancels inline node renaming with Escape", async () => {
    const user = userEvent.setup();

    renderWorkflowPage();

    const canvas = await screen.findByRole("application");
    const waitNode = within(canvas).getByTestId("workflow-node-wait-2d");
    await user.click(within(canvas).getByRole("button", { name: "观察期" }));
    await user.click(within(canvas).getByRole("button", { name: "更多操作：观察期" }));
    await user.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "重命名" }));

    const nameInput = within(waitNode).getByRole("textbox", { name: "节点名称" });
    await user.clear(nameInput);
    await user.type(nameInput, "不应保存{Escape}");

    expect(within(canvas).getByRole("button", { name: "观察期" })).toBeInTheDocument();
    expect(getUndoButton(canvas)).toBeDisabled();
  });

  it("deletes non-terminal nodes from the message menu and records the change in history", async () => {
    const user = userEvent.setup();

    renderWorkflowPage();

    const canvas = await screen.findByRole("application");
    await user.click(within(canvas).getByRole("button", { name: "发送欢迎消息" }));
    await user.click(within(canvas).getByRole("button", { name: "更多操作：发送欢迎消息" }));
    const actionMenu = await screen.findByRole("menu");
    await user.click(within(actionMenu).getByRole("menuitem", { name: "删除节点" }));

    expect(within(canvas).queryByRole("button", { name: "发送欢迎消息" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("workflow-edge-edge-branch-intent-branch-high-message-welcome")).not.toBeInTheDocument();
    expect(screen.queryByTestId("workflow-edge-edge-message-welcome-end")).not.toBeInTheDocument();
    expect(getUndoButton(canvas)).toBeEnabled();

    await user.click(getUndoButton(canvas));

    expect(within(canvas).getByRole("button", { name: "发送欢迎消息" })).toBeInTheDocument();
    expect(screen.getByTestId("workflow-edge-edge-branch-intent-branch-high-message-welcome")).toBeInTheDocument();
    expect(screen.getByTestId("workflow-edge-edge-message-welcome-end")).toBeInTheDocument();
  });

  it("duplicates editable nodes from the message menu and records the change in history", async () => {
    const user = userEvent.setup();

    renderWorkflowPage();

    const canvas = await screen.findByRole("application");
    await user.click(within(canvas).getByRole("button", { name: "发送欢迎消息" }));
    await user.click(within(canvas).getByRole("button", { name: "更多操作：发送欢迎消息" }));
    const actionMenu = await screen.findByRole("menu");
    await user.click(within(actionMenu).getByRole("menuitem", { name: "复制节点" }));

    const duplicatedNode = within(canvas).getByRole("button", { name: "发送欢迎消息 (1)" });
    const duplicatedNodeWrapper = duplicatedNode.closest("[data-testid^='workflow-node-']");

    expect(duplicatedNode).toBeInTheDocument();
    expect(duplicatedNodeWrapper).toHaveAttribute("data-selected", "true");
    expect(closestWorkflowNodeX(duplicatedNode)).toBeGreaterThan(workflowNodeX("message-welcome"));
    expect(screen.getByRole("complementary", { name: "节点配置" })).toHaveTextContent("发送欢迎消息 (1)");
    expect(screen.queryByTestId("workflow-edge-edge-message-welcome-message")).not.toBeInTheDocument();

    await user.click(getUndoButton(canvas));

    expect(within(canvas).queryByRole("button", { name: "发送欢迎消息 (1)" })).not.toBeInTheDocument();

    await user.click(getRedoButton(canvas));

    expect(within(canvas).getByRole("button", { name: "发送欢迎消息 (1)" })).toBeInTheDocument();
  });

  it("keeps duplicated workflow node titles unique", async () => {
    const user = userEvent.setup();

    renderWorkflowPage();

    const canvas = await screen.findByRole("application");
    await user.click(within(canvas).getByRole("button", { name: "发送欢迎消息" }));
    await user.click(within(canvas).getByRole("button", { name: "更多操作：发送欢迎消息" }));
    await user.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "复制节点" }));

    await user.click(within(canvas).getByRole("button", { name: "发送欢迎消息 (1)" }));
    await user.click(within(canvas).getByRole("button", { name: "更多操作：发送欢迎消息 (1)" }));
    await user.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "复制节点" }));

    expect(within(canvas).getByRole("button", { name: "发送欢迎消息 (1)" })).toBeInTheDocument();
    expect(within(canvas).getByRole("button", { name: "发送欢迎消息 (2)" })).toBeInTheDocument();
  });

  it("does not duplicate the selected node with keyboard shortcuts", async () => {
    const user = userEvent.setup();

    renderWorkflowPage();

    const canvas = await screen.findByRole("application");
    await user.click(within(canvas).getByRole("button", { name: "发送欢迎消息" }));
    fireEvent.keyDown(window, { key: "d", metaKey: true });

    expect(within(canvas).queryByRole("button", { name: "发送欢迎消息 (1)" })).not.toBeInTheDocument();
  });

  it("deletes the selected node with keyboard shortcuts and records the change in history", async () => {
    const user = userEvent.setup();

    renderWorkflowPage();

    const canvas = await screen.findByRole("application");
    await user.click(within(canvas).getByRole("button", { name: "观察期" }));
    fireEvent.keyDown(window, { key: "Delete" });

    expect(within(canvas).queryByRole("button", { name: "观察期" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("workflow-edge-edge-start-wait-2d")).not.toBeInTheDocument();
    expect(screen.queryByTestId("workflow-edge-edge-wait-2d-branch-intent")).not.toBeInTheDocument();

    await user.click(getUndoButton(canvas));

    expect(within(canvas).getByRole("button", { name: "观察期" })).toBeInTheDocument();
    expect(screen.getByTestId("workflow-edge-edge-start-wait-2d")).toBeInTheDocument();
    expect(screen.getByTestId("workflow-edge-edge-wait-2d-branch-intent")).toBeInTheDocument();
  });

  it("does not delete protected nodes or editable-field content with delete shortcuts", async () => {
    const user = userEvent.setup();

    renderWorkflowPage();

    const canvas = await screen.findByRole("application");
    await user.click(within(canvas).getByRole("button", { name: "新人入会触发" }));
    fireEvent.keyDown(window, { key: "Delete" });

    expect(within(canvas).getByRole("button", { name: "新人入会触发" })).toBeInTheDocument();
    expect(getUndoButton(canvas)).toBeDisabled();

    await user.click(within(canvas).getByRole("button", { name: "观察期" }));
    const panel = screen.getByRole("complementary", { name: "节点配置" });
    fireEvent.keyDown(within(panel).getByLabelText("等待时长"), { key: "Backspace" });

    expect(within(canvas).getByRole("button", { name: "观察期" })).toBeInTheDocument();
  });

  it("keeps start and end nodes protected from deletion", async () => {
    renderWorkflowPage();

    const canvas = await screen.findByRole("application");
    expect(within(canvas).queryByRole("button", { name: "更多操作：新人入会触发" }))
      .not.toBeInTheDocument();

    expect(within(canvas).queryByRole("button", { name: "更多操作：结束" }))
      .not.toBeInTheDocument();
  });

  it("selects the end node without opening node settings", async () => {
    const user = userEvent.setup();

    renderWorkflowPage();

    const canvas = await screen.findByRole("application");
    await user.click(within(canvas).getByRole("button", { name: "发送欢迎消息" }));
    expect(screen.getByRole("complementary", { name: "节点配置" })).toBeInTheDocument();

    await user.click(within(canvas).getByRole("button", { name: "结束" }));

    expect(screen.queryByRole("complementary", { name: "节点配置" })).not.toBeInTheDocument();
    expect(screen.getByTestId("workflow-node-end")).toHaveAttribute("data-selected", "true");
  });

  it("lets users create a manual connection between nodes", async () => {
    const user = userEvent.setup();

    renderWorkflowPage();

    const canvas = await screen.findByRole("application");
    await user.click(screen.getByTestId("workflow-edge-edge-message-welcome-end"));
    fireEvent.keyDown(window, { key: "Delete" });

    await user.click(within(canvas).getByRole("button", { name: "连接否则分支到结束" }));

    expect(screen.getByTestId("workflow-edge-edge-branch-intent-branch-default-end")).toBeInTheDocument();
    expect(getUndoButton(canvas)).toBeEnabled();
  });

  it("deletes only the selected edge with keyboard shortcuts and records the change in history", async () => {
    const user = userEvent.setup();

    renderWorkflowPage();
    const canvas = await screen.findByRole("application");
    const reactFlow = screen.getByTestId("workflow-react-flow");

    expect(reactFlow).toHaveAttribute("data-delete-key-code", "disabled");
    expect(reactFlow).toHaveAttribute("data-multi-selection-key-code", "disabled");

    await user.click(within(canvas).getByRole("button", { name: "观察期" }));
    expect(screen.getByTestId("workflow-node-wait-2d")).toHaveAttribute("data-selected", "true");
    expect(screen.queryByRole("button", { name: "更多操作：高意向连线" })).not.toBeInTheDocument();

    await user.click(screen.getByTestId("workflow-edge-edge-branch-intent-branch-high-message-welcome"));

    expect(screen.getByTestId("workflow-edge-edge-branch-intent-branch-high-message-welcome")).toHaveAttribute(
      "data-selected",
      "true",
    );
    expect(screen.getByTestId("workflow-node-wait-2d")).not.toHaveAttribute("data-selected", "true");

    fireEvent.keyDown(window, { key: "Delete" });

    expect(screen.queryByTestId("workflow-edge-edge-branch-intent-branch-high-message-welcome")).not.toBeInTheDocument();
    expect(within(canvas).getByRole("button", { name: "观察期" })).toBeInTheDocument();

    fireEvent.click(getUndoButton(canvas));

    expect(screen.getByTestId("workflow-edge-edge-branch-intent-branch-high-message-welcome")).toBeInTheDocument();
  });
});
