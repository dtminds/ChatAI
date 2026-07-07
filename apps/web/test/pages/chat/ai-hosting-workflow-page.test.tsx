import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent, { PointerEventsCheckLevel } from "@testing-library/user-event";
import type React from "react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AgentWorkflowEditorPage,
  AgentWorkflowPage,
} from "@/pages/chat/ai-hosting/agent-workflow-page";
import {
  canDeleteNodeKind,
  canDuplicateNodeKind,
  canInsertAfterNodeKind,
  createDefaultNodeData,
  insertableNodeKinds,
  nodeDefinitions,
  orderedNodeDefinitions,
  paletteItems,
} from "@/pages/chat/ai-hosting/workflow/node-definitions";
import { NodeComponentMap } from "@/pages/chat/ai-hosting/workflow/nodes/registry";
import { PanelComponentMap } from "@/pages/chat/ai-hosting/workflow/panels/registry";
import type { MarketingNodeKind } from "@/pages/chat/ai-hosting/workflow/types";
import { resetWorkflowDocumentsForTest } from "@/pages/chat/ai-hosting/workflow/workflow-draft-service";
import { useAuthStore } from "@/store/auth-store";

const agentServiceMock = vi.hoisted(() => ({
  getAiHostingQuota: vi.fn(),
}));

const reactFlowControlMock = vi.hoisted(() => ({
  fitView: vi.fn(),
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
      onConnect,
      onEdgeClick,
      onNodeClick,
      onNodeMouseEnter,
      onNodeMouseLeave,
      onNodesChange,
      onPaneClick,
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
      onConnect?: (connection: { source: string; target: string }) => void;
      onEdgeClick?: (_event: unknown, edge: { id: string }) => void;
      onNodeClick?: (_event: unknown, node: { id: string }) => void;
      onNodeMouseEnter?: (_event: unknown, node: { id: string }) => void;
      onNodeMouseLeave?: (_event: unknown, node: { id: string }) => void;
      onNodesChange?: (changes: Array<{
        dragging?: boolean;
        id: string;
        position?: { x: number; y: number };
        type: string;
      }>) => void;
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
          disabled={!nodesConnectable}
          onClick={() => {
            const connection = { source: "wait-2d", target: "goal" };
            if (isValidConnection?.(connection) ?? true) {
              onConnect?.(connection);
            }
          }}
          type="button"
        >
          连接观察期到首单转化
        </button>
        <button
          onClick={() => {
            onNodesChange?.([
              {
                dragging: true,
                id: "wait-2d",
                position: { x: 420, y: 120 },
                type: "position",
              },
            ]);
            onNodesChange?.([
              {
                dragging: false,
                id: "wait-2d",
                position: { x: 420, y: 120 },
                type: "position",
              },
            ]);
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

function renderWorkflowPage(initialEntry = "/chat/ai-hosting/workflows/new") {
  const router = createMemoryRouter(
    [
      {
        path: "/chat/ai-hosting/workflows",
        element: <AgentWorkflowPage />,
      },
      {
        path: "/chat/ai-hosting/workflows/new",
        element: <AgentWorkflowEditorPage />,
      },
      {
        path: "/chat/ai-hosting/workflows/:workflowId",
        element: <AgentWorkflowEditorPage />,
      },
    ],
    { initialEntries: [initialEntry] },
  );

  return {
    router,
    ...render(<RouterProvider router={router} />),
  };
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

describe("Agent workflow page", () => {
  beforeEach(() => {
    vi.useRealTimers();
    resetWorkflowDocumentsForTest();
    reactFlowControlMock.fitView.mockClear();
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
  });

  it("keeps node metadata, default data, renderers, settings panels and palette in sync", () => {
    const nodeKinds = Object.keys(nodeDefinitions) as MarketingNodeKind[];
    const paletteNodeIds = paletteItems.map((item) => item.id);

    expect(nodeKinds).toEqual(["action", "ai", "branch", "goal", "trigger", "wait"]);

    for (const kind of nodeKinds) {
      const definition = nodeDefinitions[kind];
      const defaultData = createDefaultNodeData(kind);

      expect(defaultData.kind).toBe(kind);
      expect(defaultData.title).toBeTruthy();
      expect(defaultData.label).toBeTruthy();
      expect(defaultData.summary).toBeTruthy();
      expect(defaultData.metric).toBeTruthy();
      expect(defaultData.status).toBeTruthy();
      expect(NodeComponentMap[kind]).toBe(definition.body);
      expect(PanelComponentMap[kind]).toBe(definition.settings);
      expect(canDeleteNodeKind(kind)).toBe(definition.canDelete);
      expect(canDuplicateNodeKind(kind)).toBe(definition.canDuplicate);
      expect(canInsertAfterNodeKind(kind)).toBe(definition.canInsertAfter);
    }

    expect(insertableNodeKinds).toEqual(["wait", "branch", "action", "ai"]);
    expect(paletteNodeIds).toEqual(insertableNodeKinds);
    expect(orderedNodeDefinitions.map((definition) => definition.kind)).toEqual([
      "trigger",
      "wait",
      "branch",
      "action",
      "ai",
      "goal",
    ]);
  });

  it("opens the Workflow menu on the list page instead of the canvas editor", async () => {
    renderWorkflowPage("/chat/ai-hosting/workflows");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Workflow" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Workflow" })).toHaveAttribute(
      "href",
      "/chat/ai-hosting/workflows",
    );
    expect(screen.getByRole("textbox", { name: "搜索 Workflow" })).toBeInTheDocument();
    const createLink = screen.getByRole("link", { name: "新建 Workflow" });

    expect(createLink).toHaveAttribute("href", "/chat/ai-hosting/workflows/new");
    expect(createLink).toHaveAttribute("target", "_blank");
    expect(createLink).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText("新人转化旅程")).toBeInTheDocument();
    expect(screen.queryByRole("application", { name: "营销 Workflow 画布" })).not.toBeInTheDocument();
  });

  it("renders the direct editor route as a fullscreen canvas without a list back link", async () => {
    renderWorkflowPage("/chat/ai-hosting/workflows/new");

    expect(await screen.findByRole("application", { name: "营销 Workflow 画布" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "节点库" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开节点库" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "节点配置" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "返回列表" })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "智能体导航" })).not.toBeInTheDocument();
  });

  it("opens workflow row edit actions in a new window", async () => {
    renderWorkflowPage("/chat/ai-hosting/workflows");

    const editLink = (await screen.findAllByRole("link", { name: "编辑" }))[0];

    expect(editLink).toHaveAttribute("href", "/chat/ai-hosting/workflows/newcomer-conversion");
    expect(editLink).toHaveAttribute("target", "_blank");
    expect(editLink).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders a named workflow editor route with the floating canvas header", async () => {
    renderWorkflowPage("/chat/ai-hosting/workflows/newcomer-conversion");

    expect(await screen.findByRole("application", { name: "营销 Workflow 画布" })).toBeInTheDocument();
    expect(screen.getByText("已保存")).toBeInTheDocument();
    expect(screen.getByText("新人转化旅程")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "返回列表" })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "智能体导航" })).not.toBeInTheDocument();
  });

  it("keeps checks as a dismissible overlay instead of a workspace tab", async () => {
    const user = userEvent.setup();

    renderWorkflowPage();

    expect(await screen.findByRole("application", { name: "营销 Workflow 画布" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "编排" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "预览" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "检查" })).not.toBeInTheDocument();
    expect(screen.queryByText("客户路径模拟")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /发布检查/ }));

    expect(screen.getByRole("region", { name: "发布检查" })).toBeInTheDocument();
    expect(screen.getByRole("application", { name: "营销 Workflow 画布" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "关闭发布检查" }));

    expect(screen.queryByRole("region", { name: "发布检查" })).not.toBeInTheDocument();
  });

  it("lets users insert an AI reception action and configure it from the panel", async () => {
    const user = setupCanvasUser();

    renderWorkflowPage();

    const canvas = await screen.findByRole("application", { name: "营销 Workflow 画布" });
    await user.click(within(canvas).getByRole("button", { name: "打开节点库" }));
    const palette = await screen.findByRole("region", { name: "节点库" });
    await user.click(within(palette).getByRole("button", { name: "添加 AI 接待节点" }));

    const aiNode = within(canvas).getByRole("button", { name: /^AI 接待 / });
    expect(aiNode).toHaveTextContent("护肤小助理");

    const panel = screen.getByRole("complementary", { name: "节点配置" });
    expect(panel).toHaveTextContent("AI 接待");

    await user.click(within(panel).getByRole("button", { name: "选择售后小助理" }));

    expect(within(canvas).getByRole("button", { name: /^AI 接待 / })).toHaveTextContent(
      "售后小助理",
    );
    expect(panel).toHaveTextContent("售后小助理");
  });

  it("does not create workflow history entries for unchanged layout results", async () => {
    const user = setupCanvasUser();

    renderWorkflowPage();

    const canvas = await screen.findByRole("application", { name: "营销 Workflow 画布" });
    expect(within(canvas).getByRole("button", { name: "撤销" })).toBeDisabled();

    await user.click(within(canvas).getByRole("button", { name: "自动整理画布" }));

    expect(within(canvas).getByRole("button", { name: "撤销" })).toBeDisabled();
  });

  it("keeps the selected workflow node above neighboring nodes after pane clicks", async () => {
    const user = userEvent.setup();

    renderWorkflowPage();

    const canvas = await screen.findByRole("application", { name: "营销 Workflow 画布" });
    const branchNode = screen.getByTestId("workflow-node-branch-intent");

    await user.click(within(canvas).getByRole("button", { name: /^意向判断 / }));

    expect(branchNode).toHaveAttribute("data-selected", "true");
    expect(branchNode).toHaveAttribute("data-z-index", "20");

    await user.click(within(canvas).getByRole("button", { name: "点击画布空白处" }));

    expect(branchNode).toHaveAttribute("data-selected", "true");
    expect(branchNode).toHaveAttribute("data-z-index", "20");
  });

  it("lets users insert the next node from the canvas candidate menu", async () => {
    const user = setupCanvasUser();

    renderWorkflowPage();

    const canvas = await screen.findByRole("application", { name: "营销 Workflow 画布" });
    expect(within(canvas).getAllByText("添加节点").length).toBeGreaterThan(0);
    expect(within(canvas).getAllByText("连接节点").length).toBeGreaterThan(0);

    await user.click(within(canvas).getByRole("button", { name: "在发送欢迎消息后添加节点" }));
    expect(within(canvas).getByRole("menu", { name: "选择要添加的节点" })).toBeInTheDocument();

    await user.click(within(canvas).getByRole("button", { name: "点击画布空白处" }));
    expect(within(canvas).queryByRole("menu", { name: "选择要添加的节点" })).not.toBeInTheDocument();

    await user.click(within(canvas).getByRole("button", { name: "在发送欢迎消息后添加节点" }));
    await user.click(within(canvas).getByRole("menuitem", { name: /AI 接待/ }));

    const aiNode = within(canvas).getByRole("button", { name: /^AI 接待 / });
    expect(aiNode).toHaveTextContent(
      "护肤小助理",
    );
    expect(workflowNodeX("action-message")).toBeLessThan(closestWorkflowNodeX(aiNode));
    expect(closestWorkflowNodeX(aiNode)).toBeLessThan(workflowNodeX("goal"));
    expect(screen.getByRole("complementary", { name: "节点配置" })).toHaveTextContent(
      "AI 接待",
    );
  });

  it("lets users insert a node from the edge insertion menu", async () => {
    const user = userEvent.setup();

    renderWorkflowPage();

    const canvas = await screen.findByRole("application", { name: "营销 Workflow 画布" });
    await user.click(within(canvas).getByRole("button", { name: "在高意向连线上添加节点" }));
    await user.click(
      within(canvas).getByRole("menuitem", {
        name: /AI 接待/,
      }),
    );

    const aiNode = within(canvas).getByRole("button", { name: /^AI 接待 / });
    const aiNodeWrapper = aiNode.closest("[data-testid^='workflow-node-']");

    expect(aiNode).toHaveTextContent(
      "护肤小助理",
    );
    expect(aiNodeWrapper).toHaveAttribute("data-selected", "true");
    expect(screen.queryAllByTestId(/^workflow-edge-/).some((edge) => edge.dataset.selected === "true")).toBe(false);
    expect(workflowNodeX("branch-intent")).toBeLessThan(closestWorkflowNodeX(aiNode));
    expect(closestWorkflowNodeX(aiNode)).toBeLessThan(workflowNodeX("action-message"));
    expect(screen.getByRole("complementary", { name: "节点配置" })).toHaveTextContent(
      "AI 接待",
    );
  });

  it("closes edge insertion menus from canvas-level interactions", async () => {
    const user = userEvent.setup();

    renderWorkflowPage();

    const canvas = await screen.findByRole("application", { name: "营销 Workflow 画布" });
    await user.click(within(canvas).getByRole("button", { name: "在高意向连线上添加节点" }));
    expect(within(canvas).getByRole("menu", { name: "从连线添加节点" })).toBeInTheDocument();

    await user.click(within(canvas).getByRole("button", { name: "点击画布空白处" }));
    expect(within(canvas).queryByRole("menu", { name: "从连线添加节点" })).not.toBeInTheDocument();

    await user.click(within(canvas).getByRole("button", { name: "在高意向连线上添加节点" }));
    await user.click(within(canvas).getByRole("button", { name: "打开节点库" }));
    expect(within(canvas).queryByRole("menu", { name: "从连线添加节点" })).not.toBeInTheDocument();
  });

  it("keeps only one edge insertion menu open at a time", async () => {
    const user = userEvent.setup();

    renderWorkflowPage();

    const canvas = await screen.findByRole("application", { name: "营销 Workflow 画布" });
    await user.click(within(canvas).getByRole("button", { name: "在高意向连线上添加节点" }));
    expect(within(canvas).getAllByRole("menu", { name: "从连线添加节点" })).toHaveLength(1);

    const edgeInsertButtons = within(canvas).getAllByRole("button", { name: /连线上添加节点/ });
    await user.click(edgeInsertButtons[1]!);
    expect(within(canvas).getAllByRole("menu", { name: "从连线添加节点" })).toHaveLength(1);
  });

  it("renders a source handle for each branch path on branch nodes", async () => {
    renderWorkflowPage();

    const branchNode = await screen.findByTestId("workflow-node-branch-intent");
    const sourceHandles = within(branchNode).getAllByTestId(/^workflow-handle-source-/);

    expect(sourceHandles.map((handle) => handle.dataset.handleId)).toEqual([
      "branch-high",
      "branch-normal",
      "branch-default",
    ]);

    [
      ["branch-high", "高意向客户"],
      ["branch-normal", "普通客户"],
      ["branch-default", "默认路径"],
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

  it("filters the node palette from the search input", async () => {
    const user = setupCanvasUser();

    renderWorkflowPage();

    const canvas = await screen.findByRole("application", { name: "营销 Workflow 画布" });
    await user.click(within(canvas).getByRole("button", { name: "打开节点库" }));
    const palette = await screen.findByRole("region", { name: "节点库" });
    await user.type(within(palette).getByRole("textbox", { name: "搜索节点" }), "AI");

    expect(within(palette).getByRole("button", { name: "添加 AI 接待节点" })).toBeInTheDocument();
    expect(within(palette).queryByRole("button", { name: "添加 营销动作节点" })).not.toBeInTheDocument();

    await user.clear(within(palette).getByRole("textbox", { name: "搜索节点" }));
    await user.type(within(palette).getByRole("textbox", { name: "搜索节点" }), "不存在");

    expect(within(palette).getByText("未找到匹配节点")).toBeInTheDocument();
  });

  it("runs the selected node and opens the variable inspector from the canvas operator", async () => {
    const user = setupCanvasUser();

    renderWorkflowPage();

    const panel = await screen.findByRole("complementary", { name: "节点配置" });
    await user.click(within(panel).getByRole("button", { name: "运行当前节点" }));

    expect(panel).toHaveTextContent("运行成功");
    expect(panel).toHaveTextContent("读取上游客户上下文");

    const canvas = screen.getByRole("application", { name: "营销 Workflow 画布" });
    await user.click(within(canvas).getByRole("button", { name: "Variables" }));

    expect(panel).toHaveTextContent("输入变量");
    expect(panel).toHaveTextContent("customer.profile");
  });

  it("closes and reopens the node config panel from canvas selection", async () => {
    const user = userEvent.setup();

    renderWorkflowPage();

    expect(await screen.findByRole("complementary", { name: "节点配置" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "关闭节点配置" }));

    expect(screen.queryByRole("complementary", { name: "节点配置" })).not.toBeInTheDocument();

    const canvas = screen.getByRole("application", { name: "营销 Workflow 画布" });
    await user.click(within(canvas).getByRole("button", { name: /^观察期 / }));

    expect(screen.getByRole("complementary", { name: "节点配置" })).toHaveTextContent("观察期");
  });

  it("supports undo and redo for inserted canvas nodes", async () => {
    const user = userEvent.setup();

    renderWorkflowPage();

    const canvas = await screen.findByRole("application", { name: "营销 Workflow 画布" });
    expect(within(canvas).getByLabelText("画布操作")).toHaveClass("nodrag", "nopan");
    expect(within(canvas).getByLabelText("画布工具")).toHaveClass("nodrag", "nopan");

    await user.click(within(canvas).getByRole("button", { name: "打开节点库" }));
    const palette = await screen.findByRole("region", { name: "节点库" });

    await user.click(within(palette).getByRole("button", { name: "添加 AI 接待节点" }));
    expect(within(canvas).getByRole("button", { name: /^AI 接待 / })).toBeInTheDocument();

    await user.click(within(canvas).getByRole("button", { name: "撤销" }));
    expect(within(canvas).queryByRole("button", { name: /^AI 接待 / })).not.toBeInTheDocument();

    await user.click(within(canvas).getByRole("button", { name: "重做" }));
    expect(within(canvas).getByRole("button", { name: /^AI 接待 / })).toBeInTheDocument();
  });

  it("supports undo and redo keyboard shortcuts outside editable fields", async () => {
    const user = userEvent.setup();

    renderWorkflowPage();

    const canvas = await screen.findByRole("application", { name: "营销 Workflow 画布" });
    await user.click(within(canvas).getByRole("button", { name: "打开节点库" }));
    const palette = await screen.findByRole("region", { name: "节点库" });
    await user.click(within(palette).getByRole("button", { name: "添加 AI 接待节点" }));

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
      expect(within(canvas).queryByRole("button", { name: /^AI 接待 / })).not.toBeInTheDocument();
    });

    fireEvent.keyDown(window, { key: "y", metaKey: true });
    expect(await within(canvas).findByRole("button", { name: /^AI 接待 / })).toBeInTheDocument();
  });

  it("does not run workflow history shortcuts from editable fields", async () => {
    const user = userEvent.setup();

    renderWorkflowPage();

    const canvas = await screen.findByRole("application", { name: "营销 Workflow 画布" });
    await user.click(within(canvas).getByRole("button", { name: "打开节点库" }));
    const palette = await screen.findByRole("region", { name: "节点库" });
    await user.click(within(palette).getByRole("button", { name: "添加 AI 接待节点" }));

    const searchInput = within(palette).getByRole("textbox", { name: "搜索节点" });
    fireEvent.keyDown(searchInput, { key: "z", metaKey: true });

    expect(within(canvas).getByRole("button", { name: /^AI 接待 / })).toBeInTheDocument();
  });

  it("keeps canvas selection out of workflow undo history", async () => {
    const user = userEvent.setup();

    renderWorkflowPage();

    const canvas = await screen.findByRole("application", { name: "营销 Workflow 画布" });
    await user.click(within(canvas).getByRole("button", { name: "打开节点库" }));
    const palette = await screen.findByRole("region", { name: "节点库" });
    await user.click(within(palette).getByRole("button", { name: "添加 AI 接待节点" }));
    const insertedNode = within(canvas).getByRole("button", { name: /^AI 接待 / });
    const insertedNodeWrapper = insertedNode.closest("[data-testid^='workflow-node-']");

    expect(insertedNodeWrapper).toHaveAttribute("data-selected", "true");

    await user.click(within(canvas).getByRole("button", { name: /^观察期 / }));
    expect(insertedNodeWrapper).not.toHaveAttribute("data-selected", "true");

    await user.click(within(canvas).getByRole("button", { name: "撤销" }));

    expect(within(canvas).queryByRole("button", { name: /^AI 接待 / })).not.toBeInTheDocument();
    expect(screen.getByTestId("workflow-node-wait-2d")).toHaveAttribute("data-selected", "true");
  });

  it("merges rapid node config edits into a single undo step", async () => {
    renderWorkflowPage();

    const canvas = await screen.findByRole("application", { name: "营销 Workflow 画布" });
    fireEvent.click(within(canvas).getByRole("button", { name: /^发送欢迎消息 / }));

    const configPanel = screen.getByRole("complementary", { name: "节点配置" });
    const titleInput = within(configPanel).getByLabelText("节点名称");

    vi.useFakeTimers();

    try {
      fireEvent.change(titleInput, { target: { value: "第一次改名" } });
      fireEvent.change(titleInput, { target: { value: "第二次改名" } });

      expect(within(canvas).getByRole("button", { name: /^第二次改名 / })).toBeInTheDocument();
      expect(within(canvas).getByRole("button", { name: "撤销" })).toBeDisabled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });

      expect(within(canvas).getByRole("button", { name: "撤销" })).toBeEnabled();
      fireEvent.click(within(canvas).getByRole("button", { name: "撤销" }));

      expect(within(canvas).getByRole("button", { name: /^发送欢迎消息 / })).toBeInTheDocument();
      expect(within(canvas).queryByRole("button", { name: /^第一次改名 / })).not.toBeInTheDocument();
      expect(within(canvas).queryByRole("button", { name: /^第二次改名 / })).not.toBeInTheDocument();
    }
    finally {
      vi.useRealTimers();
    }
  });

  it("clears redo history after a new workflow edit", async () => {
    const user = setupCanvasUser();

    renderWorkflowPage();

    const canvas = await screen.findByRole("application", { name: "营销 Workflow 画布" });
    await user.click(within(canvas).getByRole("button", { name: "打开节点库" }));
    const palette = await screen.findByRole("region", { name: "节点库" });
    await user.click(within(palette).getByRole("button", { name: "添加 AI 接待节点" }));

    await user.click(within(canvas).getByRole("button", { name: "撤销" }));
    expect(within(canvas).getByRole("button", { name: "重做" })).toBeEnabled();

    await user.click(within(canvas).getByRole("button", { name: "在发送欢迎消息后添加节点" }));
    await user.click(within(canvas).getByRole("menuitem", { name: /等待/ }));

    expect(within(canvas).getByRole("button", { name: "重做" })).toBeDisabled();
    expect(within(canvas).queryByRole("button", { name: /^AI 接待 / })).not.toBeInTheDocument();
  });

  it("records final node position changes in workflow history", async () => {
    const user = userEvent.setup();

    renderWorkflowPage();

    const canvas = await screen.findByRole("application", { name: "营销 Workflow 画布" });
    const originalX = workflowNodeX("wait-2d");
    const originalY = Number(screen.getByTestId("workflow-node-wait-2d").dataset.positionY);

    await user.click(within(canvas).getByRole("button", { name: "移动观察期" }));

    expect(workflowNodeX("wait-2d")).toBe(420);
    expect(Number(screen.getByTestId("workflow-node-wait-2d").dataset.positionY)).toBe(120);
    expect(within(canvas).getByRole("button", { name: "撤销" })).toBeEnabled();

    await user.click(within(canvas).getByRole("button", { name: "撤销" }));

    expect(workflowNodeX("wait-2d")).toBe(originalX);
    expect(Number(screen.getByTestId("workflow-node-wait-2d").dataset.positionY)).toBe(originalY);
  });

  it("keeps the canvas operator controls interactive", async () => {
    const user = userEvent.setup();

    renderWorkflowPage();

    const canvas = await screen.findByRole("application", { name: "营销 Workflow 画布" });

    await user.click(within(canvas).getByRole("button", { name: "打开节点库" }));
    const palette = within(canvas).getByRole("region", { name: "节点库" });
    await user.click(within(palette).getByRole("button", { name: "添加 AI 接待节点" }));
    expect(within(canvas).getByRole("button", { name: /^AI 接待 / })).toBeInTheDocument();

    await user.click(within(canvas).getByRole("button", { name: "自动整理画布" }));
    expect(within(canvas).getByRole("button", { name: "撤销" })).toBeEnabled();

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

    expect(screen.getByTestId("workflow-minimap")).toBeInTheDocument();
    await user.click(zoomMenuTrigger);
    await user.click(await screen.findByRole("menuitem", { name: "显示小地图" }));
    expect(screen.queryByTestId("workflow-minimap")).not.toBeInTheDocument();

    await user.click(zoomMenuTrigger);
    await user.click(await screen.findByRole("menuitem", { name: "显示小地图" }));
    expect(screen.getByTestId("workflow-minimap")).toBeInTheDocument();

    expect(reactFlowControlMock.zoomOut).toHaveBeenCalledTimes(1);
    expect(reactFlowControlMock.zoomIn).toHaveBeenCalledTimes(1);
    expect(reactFlowControlMock.zoomTo).toHaveBeenNthCalledWith(1, 2);
    expect(reactFlowControlMock.zoomTo).toHaveBeenNthCalledWith(2, 0.25);
    expect(reactFlowControlMock.fitView).toHaveBeenCalledTimes(1);
  });

  it("arranges nodes by connection order after inserting a node in the middle", async () => {
    const user = userEvent.setup();

    renderWorkflowPage();

    const canvas = await screen.findByRole("application", { name: "营销 Workflow 画布" });
    await user.click(within(canvas).getByRole("button", { name: "在高意向连线上添加节点" }));
    await user.click(within(canvas).getByRole("menuitem", { name: /AI 接待/ }));
    await user.click(within(canvas).getByRole("button", { name: "自动整理画布" }));

    const branchX = workflowNodeX("branch-intent");
    const aiNode = within(canvas).getByRole("button", { name: /^AI 接待 / });
    const aiX = closestWorkflowNodeX(aiNode);
    const actionX = workflowNodeX("action-message");

    expect(branchX).toBeLessThan(aiX);
    expect(aiX).toBeLessThan(actionX);
  });

  it("arranges branch paths by handle order instead of insertion order", async () => {
    const user = setupCanvasUser();

    renderWorkflowPage();

    const canvas = await screen.findByRole("application", { name: "营销 Workflow 画布" });
    await user.click(within(canvas).getByRole("button", { name: "在意向判断的默认路径分支后添加节点" }));
    await user.click(within(canvas).getByRole("menuitem", { name: /AI 接待/ }));
    await user.click(within(canvas).getByRole("button", { name: "在意向判断的普通客户分支后添加节点" }));
    await user.click(within(canvas).getByRole("menuitem", { name: /等待/ }));
    await user.click(within(canvas).getByRole("button", { name: "在意向判断的高意向客户分支后添加节点" }));
    await user.click(within(canvas).getByRole("menuitem", { name: /营销动作/ }));
    await user.click(within(canvas).getByRole("button", { name: "自动整理画布" }));

    const highY = workflowNodeYByButtonName(canvas, /^发优惠券 /);
    const normalY = workflowNodeYByButtonName(canvas, /^等待 /);
    const defaultY = workflowNodeYByButtonName(canvas, /^AI 接待 /);

    expect(highY).toBeLessThan(normalY);
    expect(normalY).toBeLessThan(defaultY);
  });

  it("highlights incoming and outgoing edges when hovering a workflow node", async () => {
    const user = userEvent.setup();

    renderWorkflowPage();

    const actionNode = await screen.findByTestId("workflow-node-action-message");
    const incomingEdge = screen.getByTestId("workflow-base-edge-edge-branch-intent-branch-high-action-message");
    const outgoingEdge = screen.getByTestId("workflow-base-edge-edge-action-message-goal");
    const unrelatedEdge = screen.getByTestId("workflow-base-edge-edge-wait-2d-branch-intent");

    await user.hover(actionNode);

    expect(incomingEdge).toHaveAttribute("data-stroke", "var(--workflow-blue)");
    expect(outgoingEdge).toHaveAttribute("data-stroke", "var(--workflow-blue)");
    expect(incomingEdge).toHaveAttribute("data-stroke-width", "2.5");
    expect(outgoingEdge).toHaveAttribute("data-stroke-width", "2.5");
    expect(unrelatedEdge).toHaveAttribute("data-opacity", "0.32");

    await user.unhover(actionNode);

    expect(incomingEdge).toHaveAttribute("data-opacity", "0.72");
    expect(outgoingEdge).toHaveAttribute("data-opacity", "0.72");
    expect(unrelatedEdge).toHaveAttribute("data-opacity", "0.72");
  });

  it("opens node actions from the floating more button", async () => {
    const user = userEvent.setup();

    renderWorkflowPage();

    const canvas = await screen.findByRole("application", { name: "营销 Workflow 画布" });
    await user.click(within(canvas).getByRole("button", { name: "更多操作：发送欢迎消息" }));

    const actionMenu = await screen.findByRole("menu");
    expect(actionMenu).toBeInTheDocument();

    await user.click(within(canvas).getByRole("button", { name: "点击画布空白处" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await user.click(within(canvas).getByRole("button", { name: "更多操作：发送欢迎消息" }));
    const reopenedActionMenu = await screen.findByRole("menu");
    await user.click(within(reopenedActionMenu).getByRole("menuitem", { name: "添加后续节点" }));
    expect(within(canvas).getByRole("menu", { name: "选择要添加的节点" })).toBeInTheDocument();
  });

  it("deletes non-terminal nodes from the action menu and records the change in history", async () => {
    const user = userEvent.setup();

    renderWorkflowPage();

    const canvas = await screen.findByRole("application", { name: "营销 Workflow 画布" });
    await user.click(within(canvas).getByRole("button", { name: "更多操作：发送欢迎消息" }));
    const actionMenu = await screen.findByRole("menu");
    await user.click(within(actionMenu).getByRole("menuitem", { name: "删除节点" }));

    expect(within(canvas).queryByRole("button", { name: /^发送欢迎消息 / })).not.toBeInTheDocument();
    expect(screen.queryByTestId("workflow-edge-edge-branch-intent-branch-high-action-message")).not.toBeInTheDocument();
    expect(screen.queryByTestId("workflow-edge-edge-action-message-goal")).not.toBeInTheDocument();
    expect(within(canvas).getByRole("button", { name: "撤销" })).toBeEnabled();

    await user.click(within(canvas).getByRole("button", { name: "撤销" }));

    expect(within(canvas).getByRole("button", { name: /^发送欢迎消息 / })).toBeInTheDocument();
    expect(screen.getByTestId("workflow-edge-edge-branch-intent-branch-high-action-message")).toBeInTheDocument();
    expect(screen.getByTestId("workflow-edge-edge-action-message-goal")).toBeInTheDocument();
  });

  it("duplicates editable nodes from the action menu and records the change in history", async () => {
    const user = userEvent.setup();

    renderWorkflowPage();

    const canvas = await screen.findByRole("application", { name: "营销 Workflow 画布" });
    await user.click(within(canvas).getByRole("button", { name: "更多操作：发送欢迎消息" }));
    const actionMenu = await screen.findByRole("menu");
    await user.click(within(actionMenu).getByRole("menuitem", { name: "复制节点" }));

    const duplicatedNode = within(canvas).getByRole("button", { name: /^发送欢迎消息 \(1\) / });
    const duplicatedNodeWrapper = duplicatedNode.closest("[data-testid^='workflow-node-']");

    expect(duplicatedNode).toBeInTheDocument();
    expect(duplicatedNodeWrapper).toHaveAttribute("data-selected", "true");
    expect(closestWorkflowNodeX(duplicatedNode)).toBeGreaterThan(workflowNodeX("action-message"));
    expect(screen.getByRole("complementary", { name: "节点配置" })).toHaveTextContent("发送欢迎消息 (1)");
    expect(screen.queryByTestId("workflow-edge-edge-action-message-action")).not.toBeInTheDocument();

    await user.click(within(canvas).getByRole("button", { name: "撤销" }));

    expect(within(canvas).queryByRole("button", { name: /^发送欢迎消息 \(1\) / })).not.toBeInTheDocument();

    await user.click(within(canvas).getByRole("button", { name: "重做" }));

    expect(within(canvas).getByRole("button", { name: /^发送欢迎消息 \(1\) / })).toBeInTheDocument();
  });

  it("keeps duplicated workflow node titles unique", async () => {
    const user = userEvent.setup();

    renderWorkflowPage();

    const canvas = await screen.findByRole("application", { name: "营销 Workflow 画布" });
    await user.click(within(canvas).getByRole("button", { name: "更多操作：发送欢迎消息" }));
    await user.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "复制节点" }));

    await user.click(within(canvas).getByRole("button", { name: /^发送欢迎消息 发送欢迎语/ }));
    await user.click(within(canvas).getByRole("button", { name: "更多操作：发送欢迎消息" }));
    await user.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "复制节点" }));

    expect(within(canvas).getByRole("button", { name: /^发送欢迎消息 \(1\) / })).toBeInTheDocument();
    expect(within(canvas).getByRole("button", { name: /^发送欢迎消息 \(2\) / })).toBeInTheDocument();
  });

  it("duplicates the selected node with keyboard shortcuts outside editable fields", async () => {
    const user = userEvent.setup();

    renderWorkflowPage();

    const canvas = await screen.findByRole("application", { name: "营销 Workflow 画布" });
    await user.click(within(canvas).getByRole("button", { name: /^发送欢迎消息 / }));
    fireEvent.keyDown(window, { key: "d", metaKey: true });

    expect(within(canvas).getByRole("button", { name: /^发送欢迎消息 \(1\) / })).toBeInTheDocument();

    const panel = screen.getByRole("complementary", { name: "节点配置" });
    fireEvent.keyDown(within(panel).getByLabelText("节点名称"), { key: "d", metaKey: true });

    expect(within(canvas).queryByRole("button", { name: /^发送欢迎消息 \(2\) / })).not.toBeInTheDocument();
  });

  it("deletes the selected node with keyboard shortcuts and records the change in history", async () => {
    const user = userEvent.setup();

    renderWorkflowPage();

    const canvas = await screen.findByRole("application", { name: "营销 Workflow 画布" });
    await user.click(within(canvas).getByRole("button", { name: /^观察期 / }));
    fireEvent.keyDown(window, { key: "Delete" });

    expect(within(canvas).queryByRole("button", { name: /^观察期 / })).not.toBeInTheDocument();
    expect(screen.queryByTestId("workflow-edge-edge-trigger-wait-2d")).not.toBeInTheDocument();
    expect(screen.queryByTestId("workflow-edge-edge-wait-2d-branch-intent")).not.toBeInTheDocument();

    await user.click(within(canvas).getByRole("button", { name: "撤销" }));

    expect(within(canvas).getByRole("button", { name: /^观察期 / })).toBeInTheDocument();
    expect(screen.getByTestId("workflow-edge-edge-trigger-wait-2d")).toBeInTheDocument();
    expect(screen.getByTestId("workflow-edge-edge-wait-2d-branch-intent")).toBeInTheDocument();
  });

  it("does not delete protected nodes or editable-field content with delete shortcuts", async () => {
    const user = userEvent.setup();

    renderWorkflowPage();

    const canvas = await screen.findByRole("application", { name: "营销 Workflow 画布" });
    await user.click(within(canvas).getByRole("button", { name: /^新人入会触发 / }));
    fireEvent.keyDown(window, { key: "Delete" });

    expect(within(canvas).getByRole("button", { name: /^新人入会触发 / })).toBeInTheDocument();
    expect(within(canvas).getByRole("button", { name: "撤销" })).toBeDisabled();

    await user.click(within(canvas).getByRole("button", { name: /^观察期 / }));
    await user.click(within(canvas).getByRole("button", { name: "打开节点库" }));
    const palette = await screen.findByRole("region", { name: "节点库" });
    fireEvent.keyDown(within(palette).getByRole("textbox", { name: "搜索节点" }), { key: "Backspace" });

    expect(within(canvas).getByRole("button", { name: /^观察期 / })).toBeInTheDocument();
  });

  it("keeps trigger and goal nodes protected from deletion", async () => {
    const user = userEvent.setup();

    renderWorkflowPage();

    const canvas = await screen.findByRole("application", { name: "营销 Workflow 画布" });
    await user.click(within(canvas).getByRole("button", { name: /^新人入会触发 / }));
    await user.click(within(canvas).getByRole("button", { name: "更多操作：新人入会触发" }));

    expect(screen.queryByRole("menuitem", { name: "删除节点" })).not.toBeInTheDocument();

    await user.click(within(canvas).getByRole("button", { name: "点击画布空白处" }));
    await user.click(within(canvas).getByRole("button", { name: /^首单转化 / }));
    await user.click(within(canvas).getByRole("button", { name: "更多操作：首单转化" }));

    expect(screen.queryByRole("menuitem", { name: "删除节点" })).not.toBeInTheDocument();
  });

  it("lets users create a manual connection between nodes", async () => {
    const user = userEvent.setup();

    renderWorkflowPage();

    const canvas = await screen.findByRole("application", { name: "营销 Workflow 画布" });
    await user.click(within(canvas).getByRole("button", { name: "连接观察期到首单转化" }));

    expect(screen.getByTestId("workflow-edge-edge-wait-2d-goal")).toBeInTheDocument();
    expect(within(canvas).getByRole("button", { name: "撤销" })).toBeEnabled();
  });

  it("deletes only the selected edge with keyboard shortcuts and records the change in history", async () => {
    const user = userEvent.setup();

    renderWorkflowPage();
    const canvas = await screen.findByRole("application", { name: "营销 Workflow 画布" });
    const reactFlow = screen.getByTestId("workflow-react-flow");

    expect(reactFlow).toHaveAttribute("data-delete-key-code", "disabled");
    expect(reactFlow).toHaveAttribute("data-multi-selection-key-code", "disabled");

    await user.click(within(canvas).getByRole("button", { name: /^观察期 / }));
    expect(screen.getByTestId("workflow-node-wait-2d")).toHaveAttribute("data-selected", "true");
    expect(screen.queryByRole("button", { name: "更多操作：高意向连线" })).not.toBeInTheDocument();

    await user.click(screen.getByTestId("workflow-edge-edge-branch-intent-branch-high-action-message"));

    expect(screen.getByTestId("workflow-edge-edge-branch-intent-branch-high-action-message")).toHaveAttribute(
      "data-selected",
      "true",
    );
    expect(screen.getByTestId("workflow-node-wait-2d")).not.toHaveAttribute("data-selected", "true");

    fireEvent.keyDown(window, { key: "Delete" });

    expect(screen.queryByTestId("workflow-edge-edge-branch-intent-branch-high-action-message")).not.toBeInTheDocument();
    expect(within(canvas).getByRole("button", { name: /^观察期 / })).toBeInTheDocument();

    fireEvent.click(within(canvas).getByRole("button", { name: "撤销" }));

    expect(screen.getByTestId("workflow-edge-edge-branch-intent-branch-high-action-message")).toBeInTheDocument();
  });
});
