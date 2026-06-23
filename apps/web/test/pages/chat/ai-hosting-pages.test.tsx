import type { ReactElement } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentManagementPage } from "@/pages/chat/ai-hosting/agent-management-page";
import { AgentHostingSettingsPage } from "@/pages/chat/ai-hosting/agent-hosting-settings-page";
import { AgentSettingsPage } from "@/pages/chat/ai-hosting/agent-settings-page";
import { KbDetailPage } from "@/pages/chat/ai-hosting/kb-detail-page";
import { KbDocDetailPage } from "@/pages/chat/ai-hosting/kb-doc-detail-page";
import { KbListPage } from "@/pages/chat/ai-hosting/kb-list-page";
import { resetMockKnowledgeData } from "@/pages/chat/ai-hosting/kb-mock-data";
import * as kbMockData from "@/pages/chat/ai-hosting/kb-mock-data";
import * as agentService from "@/pages/chat/ai-hosting/agent-service";

const readXlsxFileMock = vi.hoisted(() => vi.fn());
const agentServiceMock = vi.hoisted(() => ({
  createAiHostingAgent: vi.fn(),
  getAiHostingAgent: vi.fn(),
  listAiHostingAgents: vi.fn(),
  listAiHostingModels: vi.fn(),
  publishAiHostingAgent: vi.fn(),
  removeAiHostingAgent: vi.fn(),
  restoreAiHostingAgent: vi.fn(),
  updateAiHostingAgent: vi.fn(),
}));

vi.mock("read-excel-file/browser", () => ({
  default: readXlsxFileMock,
}));
vi.mock("@/pages/chat/ai-hosting/agent-service", () => agentServiceMock);

let mockImageDimensions = { height: 800, width: 800 };

const mockModels = [
  {
    description: "系统默认",
    id: "10",
    label: "默认模型",
    model: "default-model",
    name: "默认模型",
    supportMultimodal: false,
  },
  {
    description: "租户自定义",
    id: "11",
    label: "Doubao-2.0-lite",
    model: "doubao-2.0-lite",
    name: "Doubao-2.0-lite",
    supportMultimodal: true,
  },
];

const mockAgents = [
  {
    id: "301",
    knowledgeBases: [],
    model: {
      id: "11",
      label: "Doubao-2.0-lite",
      model: "doubao-2.0-lite",
      name: "Doubao-2.0-lite",
    },
    name: "护肤小助理",
    updatedAt: 1_718_006_460_000,
  },
  {
    id: "302",
    knowledgeBases: [],
    model: {
      id: "11",
      label: "Doubao-2.0-lite",
      model: "doubao-2.0-lite",
      name: "Doubao-2.0-lite",
    },
    name: "售后小助理",
    updatedAt: 1_718_006_470_000,
  },
];

const mockAgentDetail = {
  hasUnpublishedChanges: true,
  id: "301",
  model: {
    id: "11",
    label: "Doubao-2.0-lite",
    model: "doubao-2.0-lite",
    name: "Doubao-2.0-lite",
  },
  modelId: "11",
  name: "护肤小助理",
  promptConfig: {
    conditionLogic: "如果客户咨询成分，那么说明功效",
    keynote: {
      length: "简洁",
      style: ["亲切自然"],
    },
    role: "你是护肤顾问",
    style: "亲切自然",
    transferToHuman: "客户要求真人",
  },
  publishedAt: 1_718_006_400_000,
  updatedAt: 1_718_006_460_000,
};

function renderWithRoute(path: string, element: ReactElement, routePath = "*") {
  const router = createMemoryRouter(
    [
      {
        path: routePath,
        element,
      },
    ],
    { initialEntries: [path] },
  );

  return render(<RouterProvider router={router} />);
}

function createDropData(file: File) {
  return {
    dataTransfer: {
      files: [file],
      items: [
        {
          getAsFile: () => file,
          kind: "file",
          type: file.type,
        },
      ],
      types: ["Files"],
    },
  };
}

describe("AI hosting pages", () => {
  beforeEach(() => {
    resetMockKnowledgeData();
    vi.mocked(agentService.listAiHostingAgents).mockResolvedValue({
      agents: mockAgents,
      pagination: {
        page: 1,
        pageSize: 10,
        total: mockAgents.length,
      },
    });
    vi.mocked(agentService.listAiHostingModels).mockResolvedValue({ models: mockModels });
    vi.mocked(agentService.getAiHostingAgent).mockResolvedValue(mockAgentDetail);
    vi.mocked(agentService.createAiHostingAgent).mockResolvedValue({
      ...mockAgentDetail,
      id: "303",
      name: "新品小助理",
    });
    vi.mocked(agentService.updateAiHostingAgent).mockResolvedValue(mockAgentDetail);
    vi.mocked(agentService.publishAiHostingAgent).mockResolvedValue({
      ...mockAgentDetail,
      hasUnpublishedChanges: false,
    });
    vi.mocked(agentService.restoreAiHostingAgent).mockResolvedValue({
      ...mockAgentDetail,
      hasUnpublishedChanges: false,
    });
    vi.mocked(agentService.removeAiHostingAgent).mockResolvedValue({ deleted: true });
    mockImageDimensions = { height: 800, width: 800 };
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:mock-image"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    vi.stubGlobal(
      "Image",
      class {
        naturalHeight = mockImageDimensions.height;
        naturalWidth = mockImageDimensions.width;
        onerror: (() => void) | null = null;
        onload: (() => void) | null = null;

        set src(_value: string) {
          queueMicrotask(() => this.onload?.());
        }
      },
    );
    readXlsxFileMock.mockResolvedValue([
      {
        data: [
          ["问题", "答案"],
          ["晨间护肤怎么做", "先清洁再保湿"],
        ],
        sheet: "Sheet1",
      },
    ]);
  });

  it("renders the agent management page", async () => {
    renderWithRoute("/chat/ai-hosting/agents", <AgentManagementPage />);

    expect(await screen.findByRole("heading", { level: 1, name: "Agent 管理" })).toBeInTheDocument();
    expect(
      screen.getByText("创建和管理负责客户接待的智能体"),
    ).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "智能体导航" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Agent 管理" })).toHaveAttribute(
      "href",
      "/chat/ai-hosting/agents",
    );
    expect(screen.getByRole("link", { name: "知识库" })).toHaveAttribute(
      "href",
      "/chat/ai-hosting/kb",
    );
    expect(screen.getByRole("link", { name: "托管设置" })).toHaveAttribute(
      "href",
      "/chat/ai-hosting/hosting-settings",
    );
    expect(screen.getByRole("button", { name: "帮助手册" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "数据总览" })).toBeInTheDocument();
    expect(screen.getByText("会话总数")).toBeInTheDocument();
    expect(screen.getAllByText("0")[0]).toBeInTheDocument();
    expect(screen.getByText("人工发送消息数")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Agent列表" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Agent列表区块" })).toBeInTheDocument();
    expect(await screen.findByText("共 2 条")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "应用范围" })).not.toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "护肤小助理" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "售后小助理" })).toBeInTheDocument();
    const doubaoIcons = screen.getAllByTitle("模型图标：Doubao-2.0-lite");

    expect(doubaoIcons).toHaveLength(2);
    expect(doubaoIcons[0].querySelector("img")).toHaveAttribute(
      "src",
      "https://b5.bokr.com.cn/dist/llm/doubao-color.svg",
    );
    expect(screen.getAllByRole("cell", { name: "-" })).toHaveLength(2);
    expect(screen.getByRole("link", { name: "添加 Agent" })).toHaveAttribute(
      "href",
      "/chat/ai-hosting/agents/new",
    );
    expect(agentService.listAiHostingAgents).toHaveBeenCalledWith({
      page: 1,
      pageSize: 10,
      query: "",
    });
  });

  it("keeps the agent table header visible while loading", async () => {
    vi.mocked(agentService.listAiHostingAgents).mockReturnValueOnce(
      new Promise(() => undefined),
    );

    renderWithRoute("/chat/ai-hosting/agents", <AgentManagementPage />);

    expect(screen.getByRole("table", { name: "Agent列表" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Agent名称" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "大模型" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "关联知识库" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "操作" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "正在加载Agent列表" })).toBeInTheDocument();
  });

  it("resets the ai-hosting viewport when opening an agent editor", async () => {
    const user = userEvent.setup();
    const scrollTo = vi.fn();
    const originalScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollTo");

    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: scrollTo,
    });

    try {
      const router = createMemoryRouter(
        [
          {
            path: "/chat/ai-hosting/agents",
            element: <AgentManagementPage />,
          },
          {
            path: "/chat/ai-hosting/agents/:agentId",
            element: <AgentSettingsPage />,
          },
        ],
        { initialEntries: ["/chat/ai-hosting/agents"] },
      );

      render(<RouterProvider router={router} />);

      await screen.findByRole("cell", { name: "护肤小助理" });
      scrollTo.mockClear();

      await user.click(screen.getAllByRole("link", { name: "编辑" })[0]);

      await screen.findByRole("heading", { level: 1, name: "Agent设置" });

      expect(scrollTo).toHaveBeenCalledWith({ left: 0, top: 0 });
    } finally {
      if (originalScrollTo) {
        Object.defineProperty(HTMLElement.prototype, "scrollTo", originalScrollTo);
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, "scrollTo");
      }
    }
  });

  it("filters agents by search query", async () => {
    const user = userEvent.setup();

    renderWithRoute("/chat/ai-hosting/agents", <AgentManagementPage />);

    await screen.findByRole("heading", { level: 1, name: "Agent 管理" });

    await user.type(screen.getByRole("textbox", { name: "搜索 Agent 名称" }), "售后");

    await waitFor(() => {
      expect(agentService.listAiHostingAgents).toHaveBeenLastCalledWith({
        page: 1,
        pageSize: 10,
        query: "售后",
      });
    });
  });

  it("removes agents from the management page after confirmation", async () => {
    const user = userEvent.setup();

    renderWithRoute("/chat/ai-hosting/agents", <AgentManagementPage />);

    await screen.findByRole("cell", { name: "护肤小助理" });
    await user.click(screen.getAllByRole("button", { name: "删除" })[0]);

    expect(screen.getByRole("alertdialog", { name: "确认删除Agent？" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "确认" }));

    await waitFor(() => {
      expect(agentService.removeAiHostingAgent).toHaveBeenCalledWith("301");
    });
  });

  it("renders the hosting settings page", async () => {
    renderWithRoute("/chat/ai-hosting/hosting-settings", <AgentHostingSettingsPage />);

    expect(await screen.findByRole("heading", { level: 1, name: "托管设置" })).toBeInTheDocument();
    expect(screen.getByText("配置企微账号关联的 Agent 和托管能力")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "搜索企微账号" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "批量设置" })).toBeDisabled();
    expect(screen.getByRole("table", { name: "托管设置列表" })).toBeInTheDocument();
    expect(screen.getByText("共 3 条")).toBeInTheDocument();
    expect(screen.getByText("小助理1")).toBeInTheDocument();
    expect(screen.getByText("小助理2")).toBeInTheDocument();
    expect(screen.getByText("小助理3")).toBeInTheDocument();
    expect(screen.getAllByText("启用")).toHaveLength(4);
    expect(screen.getAllByText("关闭")).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "设置" })).toHaveLength(3);
  });

  it("filters application scope accounts by search query", async () => {
    const user = userEvent.setup();

    renderWithRoute("/chat/ai-hosting/hosting-settings", <AgentHostingSettingsPage />);

    await screen.findByRole("heading", { level: 1, name: "托管设置" });
    await user.type(screen.getByRole("textbox", { name: "搜索企微账号" }), "小助理2");

    expect(screen.getByText("小助理2")).toBeInTheDocument();
    expect(screen.queryByText("小助理1")).not.toBeInTheDocument();
    expect(screen.queryByText("小助理3")).not.toBeInTheDocument();
  });

  it("opens the batch settings dialog from row settings", async () => {
    const user = userEvent.setup();

    renderWithRoute("/chat/ai-hosting/hosting-settings", <AgentHostingSettingsPage />);

    await screen.findByRole("heading", { level: 1, name: "托管设置" });
    await user.click(screen.getAllByRole("button", { name: "设置" })[0]);

    const dialog = screen.getByRole("dialog", { name: "批量设置" });

    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveTextContent("已选企微账号");
    expect(dialog).toHaveTextContent("小助理1");
    expect(dialog).toHaveTextContent("全自动托管权限");
    expect(dialog).toHaveTextContent("话术推荐");
    expect(screen.getByRole("button", { name: "保存设置" })).toBeInTheDocument();
  });

  it("opens the batch settings dialog from batch action", async () => {
    const user = userEvent.setup();

    renderWithRoute("/chat/ai-hosting/hosting-settings", <AgentHostingSettingsPage />);

    await screen.findByRole("heading", { level: 1, name: "托管设置" });
    await user.click(screen.getByRole("checkbox", { name: "选择小助理2" }));
    await user.click(screen.getByRole("checkbox", { name: "选择小助理3" }));
    await user.click(screen.getByRole("button", { name: "批量设置 2" }));

    const dialog = screen.getByRole("dialog", { name: "批量设置" });

    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveTextContent("小助理2");
    expect(dialog).toHaveTextContent("小助理3");
  });

  it("saves application scope settings from the dialog", async () => {
    const user = userEvent.setup();

    renderWithRoute("/chat/ai-hosting/hosting-settings", <AgentHostingSettingsPage />);

    await screen.findByRole("heading", { level: 1, name: "托管设置" });
    await user.click(screen.getAllByRole("button", { name: "设置" })[0]);
    await user.click(screen.getByRole("switch", { name: "全自动托管权限" }));
    await user.click(screen.getByRole("switch", { name: "话术推荐" }));
    await user.click(screen.getByRole("button", { name: "保存设置" }));

    expect(screen.queryByRole("dialog", { name: "批量设置" })).not.toBeInTheDocument();
    expect(screen.getAllByText("启用")).toHaveLength(6);
    expect(screen.queryAllByText("关闭")).toHaveLength(0);
  });

  it("navigates to agent settings page from add agent link", async () => {
    renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsPage />);

    expect(await screen.findByRole("heading", { level: 1, name: "Agent设置" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "智能生成" })).toHaveAttribute(
      "data-agent-generate-gradient-button",
      "true",
    );
    expect(screen.getByRole("button", { name: "发布正式版" })).toBeInTheDocument();
    expect(screen.getByText("基本设置")).toBeInTheDocument();
    expect(screen.getByText("回复基调")).toBeInTheDocument();
    expect(screen.getByText("角色")).toBeInTheDocument();
    expect(screen.getByText("沟通风格")).toBeInTheDocument();
    expect(screen.getByText("条件逻辑")).toBeInTheDocument();
    expect(screen.getByText("转人工条件")).toBeInTheDocument();
    expect(await screen.findByTitle("模型图标：默认模型")).toBeInTheDocument();
    expect(screen.getByLabelText("Agent 模拟测试")).toBeInTheDocument();
    expect(screen.getByText("我想了解下晨间护肤")).toBeInTheDocument();
  });

  it("uses the database name length limit for agent names", async () => {
    renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsPage />);

    await screen.findByRole("heading", { level: 1, name: "Agent设置" });

    expect(screen.getByLabelText("Agent名称")).toHaveAttribute("maxLength", "50");
  });

  it("keeps the selected model icon and label in one trigger row", async () => {
    renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsPage />);

    await screen.findByRole("heading", { level: 1, name: "Agent设置" });
    await screen.findByTitle("模型图标：默认模型");

    const trigger = screen.getByRole("combobox", { name: "大模型" });

    expect(trigger.querySelector("[data-agent-model-trigger-value]")).toBeInTheDocument();
  });

  it("renders model icons in the model selector options", async () => {
    const user = userEvent.setup();

    renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsPage />);

    await screen.findByRole("heading", { level: 1, name: "Agent设置" });
    await screen.findByTitle("模型图标：默认模型");
    await user.click(screen.getByRole("combobox", { name: "大模型" }));

    expect(screen.getAllByTitle("模型图标：默认模型")).toHaveLength(2);
    expect(screen.getByTitle("模型图标：Doubao-2.0-lite")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "默认模型" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Doubao-2.0-lite" })).toBeInTheDocument();
  });

  it("opens generate dialog from the generate button", async () => {
    const user = userEvent.setup();

    renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsPage />);

    await screen.findByRole("heading", { level: 1, name: "Agent设置" });
    await user.click(screen.getByRole("button", { name: "智能生成" }));

    const dialog = screen.getByRole("dialog", { name: "智能生成" });

    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveTextContent("按实际情况填写表单后，AI会帮您自动生成Agent的配置内容");
    expect(screen.getByLabelText("行业")).toBeInTheDocument();
    expect(screen.getByLabelText("请问您为客户提供哪些服务/商品?")).toBeInTheDocument();
    expect(screen.getByLabelText("您希望AI扮演什么样的角色?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "开始生成" })).toHaveAttribute(
      "data-agent-generate-gradient-button",
      "true",
    );
    expect(screen.getByRole("button", { name: "开始生成" })).toBeDisabled();
  });

  it("shows generation progress after starting generate", async () => {
    const user = userEvent.setup();

    renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsPage />);

    await screen.findByRole("heading", { level: 1, name: "Agent设置" });
    await user.click(screen.getByRole("button", { name: "智能生成" }));

    await user.click(screen.getByRole("combobox", { name: "行业" }));
    await user.click(screen.getByRole("option", { name: "美妆护肤" }));
    await user.type(screen.getByLabelText("请问您为客户提供哪些服务/商品?"), "护肤咨询");
    await user.click(screen.getByRole("combobox", { name: "您希望AI扮演什么样的角色?" }));
    await user.click(screen.getByRole("option", { name: "品牌客服" }));
    await user.click(screen.getByRole("button", { name: "开始生成" }));

    expect(screen.getByText("生成进度")).toBeInTheDocument();
    expect(screen.getByText("15%")).toBeInTheDocument();
    expect(screen.getByText("输入文本")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "生成进度" })).toBeInTheDocument();
  });

  it("opens publish dialog from the publish button", async () => {
    const user = userEvent.setup();

    renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsPage />);

    await screen.findByRole("heading", { level: 1, name: "Agent设置" });
    await screen.findByTitle("模型图标：默认模型");
    await user.click(screen.getByRole("button", { name: "发布正式版" }));

    const dialog = screen.getByRole("dialog", { name: "是否确认发布到正式版？" });

    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveTextContent("确认发布后，Agent配置将立即生效。");
    expect(screen.getByRole("button", { name: "取消" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认" })).toBeInTheDocument();
  });

  it("opens restore draft dialog from the draft banner", async () => {
    const user = userEvent.setup();

    renderWithRoute("/chat/ai-hosting/agents/301", <AgentSettingsPage />, "/chat/ai-hosting/agents/:agentId");

    expect(await screen.findByText(/当前为未发布的草稿/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "还原为正式版内容" }));

    const dialog = screen.getByRole("dialog", { name: "是否还原到正式版内容？" });

    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveTextContent("确认还原后，将无法恢复当前草稿内容");
    expect(screen.getByRole("button", { name: "取消" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认" })).toBeInTheDocument();
  });

  it("saves and publishes agent settings through the API", async () => {
    const user = userEvent.setup();

    renderWithRoute("/chat/ai-hosting/agents/301", <AgentSettingsPage />, "/chat/ai-hosting/agents/:agentId");

    await screen.findByDisplayValue("护肤小助理");
    await user.clear(screen.getByLabelText("Agent名称"));
    await user.type(screen.getByLabelText("Agent名称"), "护肤专家");
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(agentService.updateAiHostingAgent).toHaveBeenCalledWith(
        "301",
        expect.objectContaining({
          modelId: "11",
          name: "护肤专家",
        }),
      );
    });

    await user.click(screen.getByRole("button", { name: "发布正式版" }));
    await user.click(screen.getByRole("button", { name: "确认" }));

    await waitFor(() => {
      expect(agentService.publishAiHostingAgent).toHaveBeenCalledWith("301");
    });
  });

  it("does not publish the previous draft when saving changes fails", async () => {
    const user = userEvent.setup();

    vi.mocked(agentService.updateAiHostingAgent).mockRejectedValueOnce(new Error("save failed"));

    renderWithRoute("/chat/ai-hosting/agents/301", <AgentSettingsPage />, "/chat/ai-hosting/agents/:agentId");

    await screen.findByDisplayValue("护肤小助理");
    await user.clear(screen.getByLabelText("角色描述"));
    await user.type(screen.getByLabelText("角色描述"), "你是资深护肤顾问");
    await user.click(screen.getByRole("button", { name: "发布正式版" }));
    await user.click(screen.getByRole("button", { name: "确认" }));

    await waitFor(() => {
      expect(agentService.updateAiHostingAgent).toHaveBeenCalledWith(
        "301",
        expect.objectContaining({
          promptConfig: expect.objectContaining({
            role: "你是资深护肤顾问",
          }),
        }),
      );
    });

    expect(agentService.publishAiHostingAgent).not.toHaveBeenCalled();
  });

  it("enables publishing when local model or prompt config differs from the latest published version", async () => {
    const user = userEvent.setup();

    vi.mocked(agentService.getAiHostingAgent).mockResolvedValueOnce({
      ...mockAgentDetail,
      hasUnpublishedChanges: false,
    });

    renderWithRoute("/chat/ai-hosting/agents/301", <AgentSettingsPage />, "/chat/ai-hosting/agents/:agentId");

    await screen.findByDisplayValue("护肤小助理");

    expect(screen.getByRole("button", { name: "发布正式版" })).toBeDisabled();

    await user.clear(screen.getByLabelText("角色描述"));
    await user.type(screen.getByLabelText("角色描述"), "你是资深护肤顾问");

    expect(screen.getByRole("button", { name: "发布正式版" })).toBeEnabled();
  });

  it("inserts knowledge bases inline with conditional logic text", async () => {
    const user = userEvent.setup();

    renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsPage />);

    await screen.findByRole("heading", { level: 1, name: "Agent设置" });
    expect(
      screen.getByText(
        "配置 Agent 在不同客户问题、业务场景或会话状态下的处理方式，例如商品咨询调用知识库",
      ),
    ).toBeInTheDocument();

    const descriptionInput = screen.getByLabelText("条件逻辑描述");

    await user.click(descriptionInput);
    await user.paste("111 ");
    await user.click(screen.getByRole("button", { name: "添加关联知识库" }));
    await user.click(screen.getByRole("button", { name: "美妆知识大全" }));

    const conditionalLogicGroup = screen.getByRole("group", { name: "条件逻辑" });

    expect(conditionalLogicGroup).toHaveTextContent("111");
    expect(conditionalLogicGroup).toHaveTextContent("美妆知识大全");

    await user.click(descriptionInput);
    await user.paste("xxx 333 ");
    await user.click(screen.getByRole("button", { name: "添加关联知识库" }));
    await user.click(screen.getByRole("button", { name: "彩妆精选" }));

    expect(conditionalLogicGroup).toHaveTextContent("彩妆精选");
    expect(conditionalLogicGroup).toHaveTextContent("xxx 333");
  });

  it("collapses and expands agent settings sections", async () => {
    const user = userEvent.setup();

    renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsPage />);

    await screen.findByRole("heading", { level: 1, name: "Agent设置" });
    expect(screen.getByLabelText("角色描述")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "角色设置", expanded: true }));

    expect(screen.queryByLabelText("角色描述")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "角色设置", expanded: false })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "角色设置", expanded: false }));

    expect(screen.getByLabelText("角色描述")).toBeInTheDocument();
  });

  it("renders the knowledge base page", async () => {
    const user = userEvent.setup();

    renderWithRoute("/chat/ai-hosting/kb", <KbListPage />);

    expect(await screen.findByRole("heading", { level: 1, name: "知识库" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "创建知识库" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "华为产品知识" })).toHaveAttribute(
      "href",
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w",
    );
    expect(screen.getAllByRole("link", { name: "查看" })[0]).toHaveAttribute(
      "href",
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w",
    );

    await user.click(screen.getAllByRole("button", { name: "编辑" })[0]);

    const dialog = screen.getByRole("dialog", { name: "编辑知识库" });

    expect(dialog).toBeInTheDocument();
    expect(screen.getByLabelText(/知识库名称/)).toHaveValue("华为产品知识");
    expect(screen.getByLabelText("知识库描述")).toHaveValue("华为各系列产品规格、功能与常见问题");
    expect(screen.getByLabelText(/知识库名称/)).toHaveAttribute("maxLength", "30");
    expect(screen.getByLabelText("知识库描述")).toHaveAttribute("maxLength", "1000");
    expect(screen.getByText("6/30")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存" })).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/知识库名称/));
    await user.type(screen.getByLabelText(/知识库名称/), "华为知识库");
    await user.click(screen.getByRole("button", { name: "取消" }));

    expect(screen.queryByRole("dialog", { name: "编辑知识库" })).not.toBeInTheDocument();
    expect(screen.getByText(/华为产品知识/)).toBeInTheDocument();
    expect(screen.queryByText(/华为知识库/)).not.toBeInTheDocument();
  });

  it("renders the knowledge base management page", async () => {
    renderWithRoute(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w",
      <KbDetailPage />,
    );

    expect(await screen.findByRole("heading", { level: 1, name: "华为产品知识" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "返回知识库" })).toHaveAttribute(
      "href",
      "/chat/ai-hosting/kb",
    );
    expect(screen.getByLabelText("知识库管理头部").firstElementChild).toHaveAccessibleName(
      "返回知识库",
    );
    expect(screen.getByRole("textbox", { name: "搜索知识" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "添加知识" }));
    expect(screen.getByRole("menuitem", { name: /问答/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /图片/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /文档/ })).toBeInTheDocument();
    expect(screen.getByText("高质量人工知识")).toBeInTheDocument();
    expect(screen.getByText("原始文档")).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /纯文本/ })).not.toBeInTheDocument();
    expect(screen.getByText("上传问答表格，批量导入精准知识")).toBeInTheDocument();
    expect(screen.getByText("上传图片并添加描述，按描述精准召回")).toBeInTheDocument();
    expect(screen.getByText("自动解析文档内容，效果取决于文档质量")).toBeInTheDocument();
    expect(screen.queryByText("直接录入文本片段或说明")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("knowledge-add-option-icon")).toHaveLength(3);
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("table", { name: "知识列表" })).toBeInTheDocument();
    expect(screen.getByText("产品说明大全")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Word 文件" })).toHaveAttribute(
      "src",
      "https://b5.bokr.com.cn/dist/word.png",
    );
    expect(screen.getByRole("img", { name: "PDF 文件" })).toHaveAttribute(
      "src",
      "https://b5.bokr.com.cn/dist/pdf.png",
    );
    expect(screen.getAllByRole("img", { name: "文件" })[0]).toHaveAttribute(
      "src",
      "https://b5.bokr.com.cn/dist/file.png",
    );
    expect(screen.getByText("文件（.doc）")).toBeInTheDocument();
    expect(screen.getAllByText("已完成")).toHaveLength(3);
    expect(screen.getByText("解析中")).toBeInTheDocument();
    expect(screen.getByText("失败")).toBeInTheDocument();
    expect(screen.getByText("排队中")).toBeInTheDocument();
    expect(screen.getByText("共 6 条")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "查看" })[0]).toHaveAttribute(
      "href",
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w/docs/knowledge-1",
    );
  });

  it("uses created mock knowledge bases on the management page", async () => {
    const user = userEvent.setup();
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_789_000_000_000);
    const listView = renderWithRoute("/chat/ai-hosting/kb", <KbListPage />);

    await user.click(await screen.findByRole("button", { name: "创建知识库" }));
    await user.type(screen.getByLabelText(/知识库名称/), "新品培训知识");
    await user.type(screen.getByLabelText("知识库描述"), "用于新品上市培训");
    await user.click(screen.getByRole("button", { name: "确定" }));

    expect(screen.getByRole("link", { name: "新品培训知识" })).toHaveAttribute(
      "href",
      "/chat/ai-hosting/kb/1789000000000",
    );

    listView.unmount();
    renderWithRoute(
      "/chat/ai-hosting/kb/1789000000000",
      <KbDetailPage />,
      "/chat/ai-hosting/kb/:knowledgeBaseId",
    );

    expect(await screen.findByRole("heading", { level: 1, name: "新品培训知识" })).toBeInTheDocument();
    expect(screen.getByText("用于新品上市培训")).toBeInTheDocument();
    expect(screen.getByText("暂无数据")).toBeInTheDocument();

    nowSpy.mockRestore();
  });

  it("shows an empty state for unknown knowledge base ids", async () => {
    renderWithRoute(
      "/chat/ai-hosting/kb/not-exist",
      <KbDetailPage />,
      "/chat/ai-hosting/kb/:knowledgeBaseId",
    );

    expect(await screen.findByRole("heading", { level: 1, name: "未找到知识库" })).toBeInTheDocument();
    expect(screen.getByText("当前知识库不存在或已被删除")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1, name: "华为产品知识" })).not.toBeInTheDocument();
  });

  it("opens the QA import dialog and shows the selected faq xlsx file", async () => {
    const user = userEvent.setup();

    renderWithRoute(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w",
      <KbDetailPage />,
    );

    await screen.findByRole("heading", { level: 1, name: "华为产品知识" });
    await user.click(screen.getByRole("button", { name: "添加知识" }));
    await user.click(screen.getByRole("menuitem", { name: /问答/ }));

    const dialog = screen.getByRole("dialog", { name: "批量导入问答" });

    expect(dialog).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Q&A问答对示例.faq.xlsx" }),
    ).toHaveAttribute(
      "href",
      "https://b5.bokr.com.cn/dist/Q&A问答对示例.faq.xlsx",
    );
    expect(
      screen.getByRole("link", { name: "Q&A问答对示例.faq.xlsx" }),
    ).toHaveAttribute("download");
    expect(
      screen.getByRole("link", { name: "Q&A问答对示例.faq.xlsx" }),
    ).toHaveAttribute("target", "_blank");
    expect(
      screen.getByRole("link", { name: "Q&A问答对示例.faq.xlsx" }),
    ).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByRole("button", { name: "上传问答文件" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看导入说明" })).not.toHaveFocus();
    expect(screen.getByText("文档支持 .faq.xlsx，最多 30 个 sheet，文件行数总和不超过 30000 行")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "导入文档" })).toBeDisabled();
    await user.hover(screen.getByRole("button", { name: "查看导入说明" }));
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "上传文档时，需要通过特殊的后缀 .faq 进行标识",
    );
    expect(screen.getByRole("tooltip")).toHaveTextContent(
      "对于问题或答案为空的行会跳过不做处理",
    );
    expect(screen.getByRole("tooltip")).toHaveTextContent(
      "每个可解析的切片（即原文档中单行或单列）字符长度最多为 65535",
    );

    await user.upload(
      screen.getByLabelText("选择问答导入文件"),
      new File(["question,answer"], "快捷话术导入.faq.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );

    expect(screen.getByRole("region", { name: "已选择文件" })).toHaveTextContent(
      "快捷话术导入.faq.xlsx",
    );
    expect(screen.getByRole("img", { name: "Excel 文件" })).toHaveAttribute(
      "src",
      "https://b5.bokr.com.cn/dist/excel.png",
    );
    expect(screen.getByRole("button", { name: "上传问答文件" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "已选择文件" })).toHaveTextContent(
      "共 1 个 sheet，2 行",
    );
    expect(screen.getByRole("button", { name: "导入文档" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "移除已选择文件" }));

    expect(screen.queryByRole("region", { name: "已选择文件" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "导入文档" })).toBeDisabled();
  });

  it("accepts QA import files with valid sheet data", async () => {
    const user = userEvent.setup();

    readXlsxFileMock.mockResolvedValueOnce([
      {
        data: [
          ["问题", "答案"],
          ["晨间护肤怎么做", "先清洁再保湿"],
        ],
        sheet: "Sheet1",
      },
    ]);

    renderWithRoute(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w",
      <KbDetailPage />,
    );

    await screen.findByRole("heading", { level: 1, name: "华为产品知识" });
    await user.click(screen.getByRole("button", { name: "添加知识" }));
    await user.click(screen.getByRole("menuitem", { name: /问答/ }));
    await user.upload(
      screen.getByLabelText("选择问答导入文件"),
      new File(["question,answer"], "快捷话术导入.faq.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );

    expect(screen.getByRole("region", { name: "已选择文件" })).toHaveTextContent(
      "共 1 个 sheet，2 行",
    );
    expect(screen.getByRole("button", { name: "导入文档" })).toBeEnabled();
  });

  it("shows an error when QA import resolves to zero valid rows", async () => {
    const user = userEvent.setup();

    readXlsxFileMock.mockResolvedValue([
      {
        data: [["问题", "答案"]],
        sheet: "Sheet1",
      },
    ]);

    renderWithRoute(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w",
      <KbDetailPage />,
    );

    await screen.findByRole("heading", { level: 1, name: "华为产品知识" });
    await user.click(screen.getByRole("button", { name: "添加知识" }));
    await user.click(screen.getByRole("menuitem", { name: /问答/ }));

    const dialog = screen.getByRole("dialog", { name: "批量导入问答" });
    await user.upload(
      screen.getByLabelText("选择问答导入文件"),
      new File(["question,answer"], "空内容导入.faq.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );
    await user.click(screen.getByRole("button", { name: "导入文档" }));

    expect(await screen.findByText("未解析到有效问答，请检查文件内容")).toBeInTheDocument();
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "导入文档" })).toBeEnabled();
  });

  it("rejects QA import files with more than 30 sheets", async () => {
    const user = userEvent.setup();

    readXlsxFileMock.mockResolvedValueOnce(
      Array.from({ length: 31 }, (_, index) => ({
        data: [["问题", "答案"]],
        sheet: `Sheet${index + 1}`,
      })),
    );

    renderWithRoute(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w",
      <KbDetailPage />,
    );

    await screen.findByRole("heading", { level: 1, name: "华为产品知识" });
    await user.click(screen.getByRole("button", { name: "添加知识" }));
    await user.click(screen.getByRole("menuitem", { name: /问答/ }));
    await user.upload(
      screen.getByLabelText("选择问答导入文件"),
      new File(["question,answer"], "快捷话术导入.faq.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );

    expect(await screen.findByText("最多支持 30 个 sheet")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "已选择文件" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "导入文档" })).toBeDisabled();
  });

  it("shows an error when QA files are rejected by the dropzone accept rule", async () => {
    const user = userEvent.setup();

    renderWithRoute(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w",
      <KbDetailPage />,
    );

    await screen.findByRole("heading", { level: 1, name: "华为产品知识" });
    await user.click(screen.getByRole("button", { name: "添加知识" }));
    await user.click(screen.getByRole("menuitem", { name: /问答/ }));

    fireEvent.drop(
      screen.getByRole("button", { name: "上传问答文件" }),
      createDropData(new File(["pdf"], "产品说明.pdf", { type: "application/pdf" })),
    );

    expect(await screen.findByText("仅支持 .faq.xlsx 文件")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "已选择文件" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "导入文档" })).toBeDisabled();
  });

  it("rejects QA import files with more than 30000 total rows", async () => {
    const user = userEvent.setup();

    readXlsxFileMock.mockResolvedValueOnce([
      {
        data: Array.from({ length: 30001 }, () => ["问题", "答案"]),
        sheet: "Sheet1",
      },
    ]);

    renderWithRoute(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w",
      <KbDetailPage />,
    );

    await screen.findByRole("heading", { level: 1, name: "华为产品知识" });
    await user.click(screen.getByRole("button", { name: "添加知识" }));
    await user.click(screen.getByRole("menuitem", { name: /问答/ }));
    await user.upload(
      screen.getByLabelText("选择问答导入文件"),
      new File(["question,answer"], "快捷话术导入.faq.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );

    expect(await screen.findByText("文件行数总和不能超过 30000 行")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "已选择文件" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "导入文档" })).toBeDisabled();
  });

  it("opens the document import dialog and switches chunk strategy options", async () => {
    const user = userEvent.setup();

    renderWithRoute(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w",
      <KbDetailPage />,
    );

    await screen.findByRole("heading", { level: 1, name: "华为产品知识" });
    await user.click(screen.getByRole("button", { name: "添加知识" }));
    await user.click(screen.getByRole("menuitem", { name: /文档/ }));

    const dialog = screen.getByRole("dialog", { name: "导入文档" });

    expect(dialog).toBeInTheDocument();
    expect(screen.queryByText("限免")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "上传文档文件" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "上传文档文件" })).not.toHaveFocus();
    expect(screen.getByRole("button", { name: "确认提交" })).toBeDisabled();

    await user.upload(
      screen.getByLabelText("选择文档知识文件"),
      new File(["document"], "产品手册.pptx", {
        type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      }),
    );

    expect(screen.getByRole("region", { name: "已选择文档" })).toHaveTextContent(
      "产品手册.pptx",
    );
    expect(screen.getByRole("img", { name: "PPT 文件" })).toHaveAttribute(
      "src",
      "https://b5.bokr.com.cn/dist/ppt.png",
    );
    expect(screen.queryByRole("button", { name: "上传文档文件" })).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /通用解析/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /增强解析/ })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: /按固定长度切分/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /2,000/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /1,000/ })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "确认提交" })).toBeEnabled();

    await user.click(screen.getByRole("radio", { name: /增强解析/ }));

    expect(screen.getByRole("button", { name: "确认提交（限免）" })).toBeEnabled();

    await user.click(screen.getByRole("radio", { name: /按分隔符切分/ }));

    expect(screen.getByText("分段标识符")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /换行符/ })).toBeChecked();
    expect(screen.queryByText("切片最长字符数")).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /2,000/ })).not.toBeInTheDocument();
  });

  it("shows an error when document files are rejected by the dropzone accept rule", async () => {
    const user = userEvent.setup();

    renderWithRoute(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w",
      <KbDetailPage />,
    );

    await screen.findByRole("heading", { level: 1, name: "华为产品知识" });
    await user.click(screen.getByRole("button", { name: "添加知识" }));
    await user.click(screen.getByRole("menuitem", { name: /文档/ }));

    fireEvent.drop(
      screen.getByRole("button", { name: "上传文档文件" }),
      createDropData(new File(["zip"], "资料包.zip", { type: "application/zip" })),
    );

    expect(await screen.findByText("仅支持 PDF、Word、PPT、Markdown、TXT 文档")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "已选择文档" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认提交" })).toBeDisabled();
  });

  it("disables enhanced parsing for plain text document files", async () => {
    const user = userEvent.setup();

    renderWithRoute(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w",
      <KbDetailPage />,
    );

    await screen.findByRole("heading", { level: 1, name: "华为产品知识" });
    await user.click(screen.getByRole("button", { name: "添加知识" }));
    await user.click(screen.getByRole("menuitem", { name: /文档/ }));
    await user.upload(
      screen.getByLabelText("选择文档知识文件"),
      new File(["plain text"], "产品说明.txt", { type: "text/plain" }),
    );

    expect(screen.getByRole("region", { name: "已选择文档" })).toHaveTextContent(
      "产品说明.txt",
    );
    expect(screen.getByRole("radio", { name: /通用解析/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /增强解析/ })).toBeDisabled();
  });

  it("opens the image knowledge dialog and fills the default image name", async () => {
    const user = userEvent.setup();

    renderWithRoute(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w",
      <KbDetailPage />,
    );

    await screen.findByRole("heading", { level: 1, name: "华为产品知识" });
    await user.click(screen.getByRole("button", { name: "添加知识" }));
    await user.click(screen.getByRole("menuitem", { name: /图片/ }));

    const dialog = screen.getByRole("dialog", { name: "添加图片知识" });

    expect(dialog).toBeInTheDocument();
    expect(screen.queryByText("限免")).not.toBeInTheDocument();
    expect(screen.queryByText("注意事项")).not.toBeInTheDocument();
    expect(
      screen.queryByText("描述会参与图片检索，可填写图片对应的商品说明、售卖亮点或价格等"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "上传图片" })).toBeInTheDocument();
    expect(screen.getByLabelText(/知识名称/)).toHaveAttribute("maxLength", "16");
    expect(screen.getByLabelText(/知识名称/)).toHaveAttribute(
      "placeholder",
      "请输入知识名称",
    );
    expect(screen.getByLabelText(/图片描述/)).toHaveAttribute(
      "placeholder",
      "描述会参与图片检索，可填写图片对应的商品说明、售卖亮点或价格等",
    );
    expect(screen.getByText("0/16")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认提交" })).toBeDisabled();

    await user.upload(
      screen.getByLabelText("选择图片知识文件"),
      new File(["image"], "商品主图.png", { type: "image/png" }),
    );

    expect(screen.getByRole("region", { name: "已选择图片" })).toHaveTextContent(
      "商品主图.png",
    );
    expect(screen.getByLabelText(/知识名称/)).toHaveValue("商品主图");
    expect(screen.getByText("4/16")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认提交" })).toBeDisabled();

    await user.type(screen.getByLabelText(/图片描述/), "晨间护肤套装商品主图");

    expect(screen.getByRole("button", { name: "确认提交" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "移除已选择图片" }));

    expect(screen.queryByRole("region", { name: "已选择图片" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认提交" })).toBeDisabled();
  });

  it("accepts image knowledge files with supported extensions when MIME type is empty", async () => {
    const user = userEvent.setup();

    renderWithRoute(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w",
      <KbDetailPage />,
    );

    await screen.findByRole("heading", { level: 1, name: "华为产品知识" });
    await user.click(screen.getByRole("button", { name: "添加知识" }));
    await user.click(screen.getByRole("menuitem", { name: /图片/ }));
    await user.upload(
      screen.getByLabelText("选择图片知识文件"),
      new File(["image"], "商品主图.png"),
    );

    expect(screen.getByRole("region", { name: "已选择图片" })).toHaveTextContent(
      "商品主图.png",
    );
    expect(screen.queryByText("仅支持 jpg、jpeg、png、webp 格式的图片")).not.toBeInTheDocument();
  });

  it("ignores stale image validation after the dialog is closed", async () => {
    const user = userEvent.setup();
    let resolvePendingImageLoad: (() => void) | undefined;

    vi.stubGlobal(
      "Image",
      class {
        naturalHeight = mockImageDimensions.height;
        naturalWidth = mockImageDimensions.width;
        onerror: (() => void) | null = null;
        onload: (() => void) | null = null;

        set src(_value: string) {
          resolvePendingImageLoad = () => {
            this.onload?.();
          };
        }
      },
    );

    renderWithRoute(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w",
      <KbDetailPage />,
    );

    await screen.findByRole("heading", { level: 1, name: "华为产品知识" });
    await user.click(screen.getByRole("button", { name: "添加知识" }));
    await user.click(screen.getByRole("menuitem", { name: /图片/ }));
    await user.upload(
      screen.getByLabelText("选择图片知识文件"),
      new File(["image"], "商品主图.png", { type: "image/png" }),
    );

    expect(screen.getByText("正在校验图片")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(screen.queryByRole("dialog", { name: "添加图片知识" })).not.toBeInTheDocument();

    resolvePendingImageLoad?.();
    await Promise.resolve();

    await user.click(screen.getByRole("button", { name: "添加知识" }));
    await user.click(screen.getByRole("menuitem", { name: /图片/ }));

    expect(screen.queryByRole("region", { name: "已选择图片" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "上传图片" })).toBeInTheDocument();
    expect(screen.queryByText("正在校验图片")).not.toBeInTheDocument();
  });

  it("ignores stale image validation after the page unmounts", async () => {
    const user = userEvent.setup();
    let resolvePendingImageLoad: (() => void) | undefined;

    vi.stubGlobal(
      "Image",
      class {
        naturalHeight = mockImageDimensions.height;
        naturalWidth = mockImageDimensions.width;
        onerror: (() => void) | null = null;
        onload: (() => void) | null = null;

        set src(_value: string) {
          resolvePendingImageLoad = () => {
            this.onload?.();
          };
        }
      },
    );

    const view = renderWithRoute(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w",
      <KbDetailPage />,
    );

    await screen.findByRole("heading", { level: 1, name: "华为产品知识" });
    await user.click(screen.getByRole("button", { name: "添加知识" }));
    await user.click(screen.getByRole("menuitem", { name: /图片/ }));
    await user.upload(
      screen.getByLabelText("选择图片知识文件"),
      new File(["image"], "商品主图.png", { type: "image/png" }),
    );

    expect(screen.getByText("正在校验图片")).toBeInTheDocument();
    view.unmount();

    resolvePendingImageLoad?.();
    await Promise.resolve();

    renderWithRoute(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w",
      <KbDetailPage />,
    );

    await screen.findByRole("heading", { level: 1, name: "华为产品知识" });
    await user.click(screen.getByRole("button", { name: "添加知识" }));
    await user.click(screen.getByRole("menuitem", { name: /图片/ }));

    expect(screen.queryByRole("region", { name: "已选择图片" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "上传图片" })).toBeInTheDocument();
    expect(screen.queryByText("正在校验图片")).not.toBeInTheDocument();
  });

  it("clears image checking state when a subsequent invalid file is selected", async () => {
    const user = userEvent.setup();
    let resolvePendingImageLoad: (() => void) | undefined;

    vi.stubGlobal(
      "Image",
      class {
        naturalHeight = mockImageDimensions.height;
        naturalWidth = mockImageDimensions.width;
        onerror: (() => void) | null = null;
        onload: (() => void) | null = null;

        set src(_value: string) {
          resolvePendingImageLoad = () => {
            this.onload?.();
          };
        }
      },
    );

    renderWithRoute(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w",
      <KbDetailPage />,
    );

    await screen.findByRole("heading", { level: 1, name: "华为产品知识" });
    await user.click(screen.getByRole("button", { name: "添加知识" }));
    await user.click(screen.getByRole("menuitem", { name: /图片/ }));

    const fileInput = screen.getByLabelText("选择图片知识文件");

    await user.upload(
      fileInput,
      new File(["image"], "商品主图.png", { type: "image/png" }),
    );

    expect(screen.getByText("正在校验图片")).toBeInTheDocument();

    await user.upload(
      fileInput,
      new File([new Uint8Array(5 * 1024 * 1024 + 1)], "超大图片.png", {
        type: "image/png",
      }),
    );

    expect(await screen.findByText("图片大小不能超过 5MB")).toBeInTheDocument();
    expect(screen.queryByText("正在校验图片")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "已选择图片" })).not.toBeInTheDocument();

    resolvePendingImageLoad?.();
    await Promise.resolve();

    expect(screen.queryByText("正在校验图片")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "已选择图片" })).not.toBeInTheDocument();
  });

  it("rejects image knowledge files larger than 5MB", async () => {
    const user = userEvent.setup();

    renderWithRoute(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w",
      <KbDetailPage />,
    );

    await screen.findByRole("heading", { level: 1, name: "华为产品知识" });
    await user.click(screen.getByRole("button", { name: "添加知识" }));
    await user.click(screen.getByRole("menuitem", { name: /图片/ }));
    await user.upload(
      screen.getByLabelText("选择图片知识文件"),
      new File([new Uint8Array(5 * 1024 * 1024 + 1)], "超大图片.png", {
        type: "image/png",
      }),
    );

    expect(await screen.findByText("图片大小不能超过 5MB")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "已选择图片" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认提交" })).toBeDisabled();
  });

  it("rejects image knowledge files outside the allowed dimensions", async () => {
    const user = userEvent.setup();

    mockImageDimensions = { height: 9, width: 800 };

    renderWithRoute(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w",
      <KbDetailPage />,
    );

    await screen.findByRole("heading", { level: 1, name: "华为产品知识" });
    await user.click(screen.getByRole("button", { name: "添加知识" }));
    await user.click(screen.getByRole("menuitem", { name: /图片/ }));
    await user.upload(
      screen.getByLabelText("选择图片知识文件"),
      new File(["image"], "尺寸过小.png", { type: "image/png" }),
    );

    expect(await screen.findByText("图片宽高必须在 10 到 6000 像素范围内")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "已选择图片" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认提交" })).toBeDisabled();
  });

  it("limits knowledge base creation fields", async () => {
    const user = userEvent.setup();

    renderWithRoute("/chat/ai-hosting/kb", <KbListPage />);

    await user.click(await screen.findByRole("button", { name: "创建知识库" }));

    expect(screen.getByLabelText(/知识库名称/)).toHaveAttribute("maxLength", "30");
    expect(screen.getByLabelText("知识库描述")).toHaveAttribute("maxLength", "1000");
  });

  it("shows knowledge base name character count", async () => {
    const user = userEvent.setup();

    renderWithRoute("/chat/ai-hosting/kb", <KbListPage />);

    await user.click(await screen.findByRole("button", { name: "创建知识库" }));

    expect(screen.getByText("0/30")).toBeInTheDocument();
    expect(screen.queryByText("0/1000")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(/知识库名称/), "产品知识库");

    expect(screen.getByText("5/30")).toBeInTheDocument();
  });

  it("renders the QA chunk detail page", async () => {
    renderWithRoute(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w/docs/knowledge-3",
      <KbDocDetailPage />,
      "/chat/ai-hosting/kb/:knowledgeBaseId/docs/:docId",
    );

    expect(await screen.findByRole("heading", { level: 1, name: "常见问题解答" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "文件" })).toBeInTheDocument();
    expect(screen.getByText("FAQ")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "华为产品知识" })).toHaveAttribute(
      "href",
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w",
    );
    expect(screen.queryByText("FAQ · 华为产品知识")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "返回知识列表" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "搜索切片标题" })).toBeInTheDocument();
    const addQaButton = screen.getByRole("button", { name: "添加问答" });
    expect(addQaButton).not.toHaveAttribute("aria-haspopup", "menu");
    expect(addQaButton).not.toHaveClass("bg-primary");
    expect(addQaButton).toHaveClass("border-border");
    expect(screen.queryByRole("button", { name: "添加切片" })).not.toBeInTheDocument();
    expect(screen.getByRole("table", { name: "切片列表" })).toBeInTheDocument();
    expect(screen.getByText("问题")).toBeInTheDocument();
    expect(screen.getByText("答案")).toBeInTheDocument();
    expect(screen.getByText("如何恢复出厂设置")).toBeInTheDocument();
    expect(screen.getByText("保修期多久")).toBeInTheDocument();
  });

  it("filters QA chunks by question title only", async () => {
    const user = userEvent.setup();

    renderWithRoute(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w/docs/knowledge-3",
      <KbDocDetailPage />,
      "/chat/ai-hosting/kb/:knowledgeBaseId/docs/:docId",
    );

    await screen.findByText("如何恢复出厂设置");
    await user.type(screen.getByRole("textbox", { name: "搜索切片标题" }), "物流");

    await waitFor(() => {
      expect(screen.getByText("如何查询物流")).toBeInTheDocument();
      expect(screen.queryByText("如何恢复出厂设置")).not.toBeInTheDocument();
      expect(screen.queryByText("保修期多久")).not.toBeInTheDocument();
    });
  });

  it("adds a QA chunk manually", async () => {
    const user = userEvent.setup();

    renderWithRoute(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w/docs/knowledge-3",
      <KbDocDetailPage />,
      "/chat/ai-hosting/kb/:knowledgeBaseId/docs/:docId",
    );

    await screen.findByRole("button", { name: "添加问答" });
    await user.click(screen.getByRole("button", { name: "添加问答" }));

    const dialog = screen.getByRole("dialog", { name: "添加问答" });
    await user.type(within(dialog).getByLabelText(/问题/), "支持 NFC 吗");
    await user.type(within(dialog).getByLabelText(/答案/), "支持，可在设置中开启");
    await user.click(within(dialog).getByRole("button", { name: "确定" }));

    expect(await screen.findByText("支持 NFC 吗")).toBeInTheDocument();
  });

  it("keeps the add QA chunk dialog open when submit fails", async () => {
    const user = userEvent.setup();
    const addChunkSpy = vi.spyOn(kbMockData, "addMockKnowledgeChunk").mockImplementation(() => {
      throw new Error("submit failed");
    });

    try {
      renderWithRoute(
        "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w/docs/knowledge-3",
        <KbDocDetailPage />,
        "/chat/ai-hosting/kb/:knowledgeBaseId/docs/:docId",
      );

      await screen.findByRole("button", { name: "添加问答" });
      await user.click(screen.getByRole("button", { name: "添加问答" }));

      const dialog = screen.getByRole("dialog", { name: "添加问答" });
      await user.type(within(dialog).getByLabelText(/问题/), "支持 NFC 吗");
      await user.type(within(dialog).getByLabelText(/答案/), "支持，可在设置中开启");
      await user.click(within(dialog).getByRole("button", { name: "确定" }));

      expect(dialog).toBeInTheDocument();
      expect(within(dialog).getByLabelText(/问题/)).toHaveValue("支持 NFC 吗");
      expect(within(dialog).getByLabelText(/答案/)).toHaveValue("支持，可在设置中开启");
      expect(addChunkSpy).toHaveBeenCalled();
    } finally {
      addChunkSpy.mockRestore();
    }
  });

  it("edits a QA chunk on the chunk detail page", async () => {
    const user = userEvent.setup();

    renderWithRoute(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w/docs/knowledge-3",
      <KbDocDetailPage />,
      "/chat/ai-hosting/kb/:knowledgeBaseId/docs/:docId",
    );

    await screen.findByText("如何恢复出厂设置");
    await user.click(screen.getAllByRole("button", { name: "编辑" })[0]);

    const dialog = screen.getByRole("dialog", { name: "编辑切片" });
    const questionField = within(dialog).getByLabelText(/问题/);
    await user.clear(questionField);
    await user.type(questionField, "如何重置手机");
    await user.click(within(dialog).getByRole("button", { name: "保存" }));

    expect(await screen.findByText("如何重置手机")).toBeInTheDocument();
    expect(screen.queryByText("如何恢复出厂设置")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "编辑切片" })).not.toBeInTheDocument();
  });

  it("renders the document chunk detail page and adds a chunk", async () => {
    const user = userEvent.setup();

    renderWithRoute(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w/docs/knowledge-1",
      <KbDocDetailPage />,
      "/chat/ai-hosting/kb/:knowledgeBaseId/docs/:docId",
    );

    await screen.findByRole("heading", { level: 1, name: "产品说明大全" });
    expect(screen.getByRole("img", { name: "Word 文件" })).toBeInTheDocument();
    expect(screen.getByText("文件（.doc）")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "华为产品知识" })).toHaveAttribute(
      "href",
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w",
    );
    expect(screen.queryByText("文档 · 华为产品知识")).not.toBeInTheDocument();
    expect(screen.getByText("切片标题")).toBeInTheDocument();
    expect(screen.getByText("切片内容")).toBeInTheDocument();
    expect(screen.getByText("第一章 产品介绍")).toBeInTheDocument();

    const addChunkButton = screen.getByRole("button", { name: "添加切片" });
    expect(addChunkButton).not.toHaveClass("bg-primary");
    expect(addChunkButton).toHaveClass("border-border");
    await user.click(addChunkButton);
    const dialog = screen.getByRole("dialog", { name: "添加切片" });
    await user.type(within(dialog).getByLabelText(/切片标题/), "第三章 配件说明");
    await user.type(within(dialog).getByLabelText(/切片内容/), "原装充电器与数据线需单独购买");
    await user.click(within(dialog).getByRole("button", { name: "确定" }));

    expect(await screen.findByText("第三章 配件说明")).toBeInTheDocument();
  });

  it("renders the image chunk detail page without add or delete actions", async () => {
    renderWithRoute(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w/docs/knowledge-8",
      <KbDocDetailPage />,
      "/chat/ai-hosting/kb/:knowledgeBaseId/docs/:docId",
    );

    await screen.findByRole("heading", { level: 1, name: "产品宣传图" });
    expect(screen.getByRole("img", { name: "文件" })).toBeInTheDocument();
    expect(screen.getByText("图片（.png）")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "华为产品知识" })).toHaveAttribute(
      "href",
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w",
    );
    expect(screen.queryByText("图片 · 华为产品知识")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "添加切片" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "添加问答" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "编辑" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "删除" })).not.toBeInTheDocument();
    expect(screen.getByRole("table", { name: "切片列表" })).toHaveTextContent("产品宣传图");
  });

  it("deletes a document chunk after confirmation", async () => {
    const user = userEvent.setup();

    renderWithRoute(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w/docs/knowledge-1",
      <KbDocDetailPage />,
      "/chat/ai-hosting/kb/:knowledgeBaseId/docs/:docId",
    );

    await screen.findByText("第一章 产品介绍");
    await user.click(screen.getAllByRole("button", { name: "删除" })[0]);
    const dialog = screen.getByRole("alertdialog", { name: "确定删除该切片吗" });
    const confirmDeleteButton = within(dialog).getByRole("button", { name: "删除" });
    expect(dialog).toBeInTheDocument();
    expect(confirmDeleteButton).toHaveClass("bg-destructive");
    await user.click(confirmDeleteButton);

    expect(screen.queryByText("第一章 产品介绍")).not.toBeInTheDocument();
    expect(screen.getByText("第二章 售后政策")).toBeInTheDocument();
  });
});
