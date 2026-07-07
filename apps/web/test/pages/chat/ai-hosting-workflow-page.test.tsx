import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type React from "react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AgentWorkflowEditorPage,
  AgentWorkflowPage,
} from "@/pages/chat/ai-hosting/agent-workflow-page";
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
    BaseEdge: ({ id }: { id: string }) => (
      <svg aria-hidden="true" data-testid={`workflow-base-edge-${id}`} />
    ),
    EdgeLabelRenderer: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Handle: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
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
      maxZoom,
      minZoom,
      nodeTypes,
      nodes,
      nodesConnectable,
      onConnect,
      onNodeClick,
      onPaneClick,
    }: {
      children?: React.ReactNode;
      edges?: Array<{
        data?: Record<string, unknown>;
        id: string;
        source: string;
        target: string;
        type?: string;
      }>;
      edgeTypes?: Record<string, (props: any) => React.ReactNode>;
      maxZoom?: number;
      minZoom?: number;
      nodeTypes?: Record<string, (props: any) => React.ReactNode>;
      nodes: Array<{ data: Record<string, unknown>; id: string; type?: string }>;
      nodesConnectable?: boolean;
      onConnect?: (connection: { source: string; target: string }) => void;
      onNodeClick?: (_event: unknown, node: { id: string }) => void;
      onPaneClick?: () => void;
    }) => (
      <div
        data-max-zoom={maxZoom}
        data-min-zoom={minZoom}
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
          onClick={() => onConnect?.({ source: "wait-2d", target: "goal" })}
          type="button"
        >
          连接观察期到首单转化
        </button>
        {edges.map((edge, index) => {
          const EdgeComponent = edgeTypes?.[edge.type ?? ""];

          return (
            <div data-testid={`workflow-edge-${edge.id}`} key={edge.id}>
              {EdgeComponent ? (
                <EdgeComponent
                  data={edge.data}
                  id={edge.id}
                  selected={index === 0}
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
              data-testid={`workflow-node-${node.id}`}
              key={node.id}
              onClick={() => onNodeClick?.({}, node)}
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
    applyNodeChanges: (_changes: unknown, nodes: unknown) => nodes,
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

describe("Agent workflow demo page", () => {
  beforeEach(() => {
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
    expect(screen.getByRole("link", { name: "新建 Workflow" })).toHaveAttribute(
      "href",
      "/chat/ai-hosting/workflows/new",
    );
    expect(screen.getByText("新人转化旅程")).toBeInTheDocument();
    expect(screen.queryByRole("application", { name: "营销 Workflow 画布" })).not.toBeInTheDocument();
  });

  it("opens a fullscreen canvas editor from the create action", async () => {
    const user = userEvent.setup();
    const { router } = renderWorkflowPage("/chat/ai-hosting/workflows");

    await user.click(await screen.findByRole("link", { name: "新建 Workflow" }));

    expect(router.state.location.pathname).toBe("/chat/ai-hosting/workflows/new");
    expect(await screen.findByRole("application", { name: "营销 Workflow 画布" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "节点库" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开节点库" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "节点配置" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "返回列表" })).toHaveAttribute(
      "href",
      "/chat/ai-hosting/workflows",
    );
    expect(screen.queryByRole("navigation", { name: "智能体导航" })).not.toBeInTheDocument();
  });

  it("opens a fullscreen canvas editor from a workflow row edit action", async () => {
    const user = userEvent.setup();
    const { router } = renderWorkflowPage("/chat/ai-hosting/workflows");

    await user.click((await screen.findAllByRole("link", { name: "编辑" }))[0]);

    expect(router.state.location.pathname).toBe("/chat/ai-hosting/workflows/newcomer-conversion");
    expect(await screen.findByRole("application", { name: "营销 Workflow 画布" })).toBeInTheDocument();
    expect(screen.getByText(/新人转化旅程 · 自动保存于前端 DEMO/)).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "智能体导航" })).not.toBeInTheDocument();
  });

  it("lets users insert an AI reception action and configure it from the panel", async () => {
    const user = userEvent.setup();

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

  it("lets users insert the next node from the canvas candidate menu", async () => {
    const user = userEvent.setup();

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

    expect(within(canvas).getByRole("button", { name: /^AI 接待 / })).toHaveTextContent(
      "护肤小助理",
    );
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

    expect(within(canvas).getByRole("button", { name: /^AI 接待 / })).toHaveTextContent(
      "护肤小助理",
    );
    expect(screen.getByRole("complementary", { name: "节点配置" })).toHaveTextContent(
      "AI 接待",
    );
  });

  it("filters the node palette from the search input", async () => {
    const user = userEvent.setup();

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
    const user = userEvent.setup();

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

  it("supports undo and redo for inserted canvas nodes", async () => {
    const user = userEvent.setup();

    renderWorkflowPage();

    const canvas = await screen.findByRole("application", { name: "营销 Workflow 画布" });
    await user.click(within(canvas).getByRole("button", { name: "打开节点库" }));
    const palette = await screen.findByRole("region", { name: "节点库" });

    await user.click(within(palette).getByRole("button", { name: "添加 AI 接待节点" }));
    expect(within(canvas).getByRole("button", { name: /^AI 接待 / })).toBeInTheDocument();

    await user.click(within(canvas).getByRole("button", { name: "撤销" }));
    expect(within(canvas).queryByRole("button", { name: /^AI 接待 / })).not.toBeInTheDocument();

    await user.click(within(canvas).getByRole("button", { name: "重做" }));
    expect(within(canvas).getByRole("button", { name: /^AI 接待 / })).toBeInTheDocument();
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
    await user.click(await screen.findByRole("menuitemcheckbox", { name: "显示小地图" }));
    expect(screen.queryByTestId("workflow-minimap")).not.toBeInTheDocument();

    await user.click(zoomMenuTrigger);
    await user.click(await screen.findByRole("menuitemcheckbox", { name: "显示小地图" }));
    expect(screen.getByTestId("workflow-minimap")).toBeInTheDocument();

    expect(reactFlowControlMock.zoomOut).toHaveBeenCalledTimes(1);
    expect(reactFlowControlMock.zoomIn).toHaveBeenCalledTimes(1);
    expect(reactFlowControlMock.zoomTo).toHaveBeenNthCalledWith(1, 2);
    expect(reactFlowControlMock.zoomTo).toHaveBeenNthCalledWith(2, 0.25);
    expect(reactFlowControlMock.fitView).toHaveBeenCalledTimes(1);
  });

  it("opens node actions from the floating more button", async () => {
    const user = userEvent.setup();

    renderWorkflowPage();

    const canvas = await screen.findByRole("application", { name: "营销 Workflow 画布" });
    await user.click(within(canvas).getByRole("button", { name: "更多操作：发送欢迎消息" }));

    const actionMenu = within(canvas).getByRole("menu", { name: "节点操作" });
    expect(actionMenu).toBeInTheDocument();

    await user.click(within(actionMenu).getByRole("menuitem", { name: "添加后续节点" }));
    expect(within(canvas).getByRole("menu", { name: "选择要添加的节点" })).toBeInTheDocument();
  });

  it("lets users create a manual connection between nodes", async () => {
    const user = userEvent.setup();

    renderWorkflowPage();

    const canvas = await screen.findByRole("application", { name: "营销 Workflow 画布" });
    await user.click(within(canvas).getByRole("button", { name: "连接观察期到首单转化" }));

    expect(screen.getByTestId("workflow-edge-edge-wait-2d-goal")).toBeInTheDocument();
    expect(within(canvas).getByRole("button", { name: "撤销" })).toBeEnabled();
  });
});
