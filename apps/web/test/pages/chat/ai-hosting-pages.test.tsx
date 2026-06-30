import type { ReactElement } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentManagementPage } from "@/pages/chat/ai-hosting/agent-management-page";
import { AgentHostingSettingsPage } from "@/pages/chat/ai-hosting/agent-hosting-settings-page";
import { AgentSettingsPage } from "@/pages/chat/ai-hosting/agent-settings-page";
import { KbDetailPage } from "@/pages/chat/ai-hosting/kb-detail-page";
import { KbDocDetailPage } from "@/pages/chat/ai-hosting/kb-doc-detail-page";
import { KbListPage } from "@/pages/chat/ai-hosting/kb-list-page";
import { resetMockKbData } from "./kb-service-mock-data";
import * as agentService from "@/pages/chat/ai-hosting/agent-service";
import * as kbService from "@/pages/chat/ai-hosting/api/kb-service";
import { useAuthStore } from "@/store/auth-store";
import type { AccountRole, AiHostingSettingsResponse } from "@chatai/contracts";
import {
  createMockKbDocChunksResponse,
  createMockKbDocDetail,
  createMockKbDocsResponse,
  createMockKbItem,
  createMockKbListResponse,
  addMockKbChunk,
  addMockKbListItem,
  deleteMockKbChunk,
  updateMockKbChunk,
  updateMockKbDocStatus,
} from "./kb-service-mock-data";

const readXlsxFileMock = vi.hoisted(() => vi.fn());
const importKbDocMock = vi.hoisted(() => vi.fn());
const importKbQaDocMock = vi.hoisted(() => vi.fn());
const importKbImageDocMock = vi.hoisted(() => vi.fn());
const uploadKbImageMock = vi.hoisted(() => vi.fn());
const retryKbDocMock = vi.hoisted(() => vi.fn());
const createKbChunkMock = vi.hoisted(() => vi.fn());
const updateKbChunkMock = vi.hoisted(() => vi.fn());
const deleteKbChunkMock = vi.hoisted(() => vi.fn());
const chunkVectorizationTip =
  "保存编辑后的切片内容，需要重新向量化，并产生额外 tokens 消耗。";
const agentServiceMock = vi.hoisted(() => ({
  createAiHostingAgent: vi.fn(),
  getAiHostingQuota: vi.fn(),
  getAiHostingAgent: vi.fn(),
  listAiHostingSettings: vi.fn(),
  listAiHostingAgents: vi.fn(),
  listAiHostingModels: vi.fn(),
  publishAiHostingAgent: vi.fn(),
  removeAiHostingAgent: vi.fn(),
  restoreAiHostingAgent: vi.fn(),
  renameAiHostingAgent: vi.fn(),
  testAiHostingAgent: vi.fn(),
  updateAiHostingSettings: vi.fn(),
  updateAiHostingAgent: vi.fn(),
}));
const kbServiceMock = vi.hoisted(() => ({
  createKb: vi.fn(),
  getKb: vi.fn(),
  getKbDoc: vi.fn(),
  listKbDocChunks: vi.fn(),
  listKbDocs: vi.fn(),
  listKbs: vi.fn(),
}));

vi.mock("read-excel-file/browser", () => ({
  default: readXlsxFileMock,
}));
vi.mock("@/pages/chat/ai-hosting/agent-service", () => agentServiceMock);
vi.mock("@/pages/chat/ai-hosting/api/kb-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/pages/chat/ai-hosting/api/kb-service")>();

  return {
    ...actual,
    ...kbServiceMock,
  };
});

vi.mock("@/pages/chat/ai-hosting/api/kb-doc-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/pages/chat/ai-hosting/api/kb-doc-service")>();

  return {
    ...actual,
    importKbDoc: importKbDocMock,
    importKbImageDoc: importKbImageDocMock,
    importKbQaDoc: importKbQaDocMock,
    uploadKbImage: uploadKbImageMock,
    retryKbDoc: retryKbDocMock,
  };
});

vi.mock("@/pages/chat/ai-hosting/api/kb-chunk-service", () => ({
  createKbChunk: createKbChunkMock,
  deleteKbChunk: deleteKbChunkMock,
  updateKbChunk: updateKbChunkMock,
}));

vi.mock("sonner", async (importOriginal) => {
  const actual = await importOriginal<typeof import("sonner")>();

  return {
    ...actual,
    toast: {
      ...actual.toast,
      error: vi.fn(),
      success: vi.fn(),
    },
  };
});

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
    kbList: [
      {
        id: "1",
        name: "商品咨询知识库",
      },
      {
        id: "3",
        name: "活动政策知识库",
      },
    ],
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
    kbList: [],
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
    availableKbIds: [],
    conditionLogic: "如果客户咨询成分，那么说明功效",
    replyStyle: {
      length: "简洁",
      styleInstruction: "亲切自然",
    },
    handoffRules: "客户要求真人",
    role: "你是护肤顾问",
  },
  publishedAt: 1_718_006_400_000,
  updatedAt: 1_718_006_460_000,
};

const mockHostingSettings: AiHostingSettingsResponse = {
  accounts: [
    {
      agentId: null,
      avatarUrl: "",
      fullAutoAuth: false,
      id: "101",
      name: "小助理1",
      semiAutoAuth: false,
    },
    {
      agentId: "301",
      avatarUrl: "https://example.com/avatar-102.png",
      fullAutoAuth: true,
      id: "102",
      name: "小助理2",
      semiAutoAuth: true,
    },
    {
      agentId: "303",
      avatarUrl: "",
      fullAutoAuth: false,
      id: "103",
      name: "小助理3",
      semiAutoAuth: true,
    },
  ],
  agents: [
    {
      id: "301",
      isPublished: true,
      name: "护肤小助理",
    },
    {
      id: "303",
      isPublished: false,
      name: "未发布小助理",
    },
  ],
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

  return {
    ...render(<RouterProvider router={router} />),
    router,
  };
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

function mockSession(role: AccountRole = "admin") {
  useAuthStore.setState(useAuthStore.getInitialState(), true);
  useAuthStore.getState().setSession({
    accountType: "sub",
    displayName: "客服主管",
    permissions: ["chat.access", "chat.send", "chat.takeover"],
    role,
    subUserId: "101",
    uid: 1,
  });
}

describe("AI hosting pages", () => {
  beforeEach(() => {
    mockSession();
    resetMockKbData();
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
    vi.mocked(agentService.listAiHostingAgents).mockResolvedValue({
      agents: mockAgents,
      pagination: {
        page: 1,
        pageSize: 10,
        total: mockAgents.length,
      },
    });
    vi.mocked(agentService.getAiHostingQuota).mockResolvedValue({
      agents: {
        limit: 20,
        used: mockAgents.length,
      },
      kbDocs: {
        limit: 1024 * 1024 * 1024,
        used: 20 * 1024 * 1024,
      },
      kbs: {
        limit: 20,
        used: 3,
      },
    });
    vi.mocked(agentService.listAiHostingModels).mockResolvedValue({ models: mockModels });
    vi.mocked(agentService.listAiHostingSettings).mockResolvedValue(mockHostingSettings);
    vi.mocked(agentService.updateAiHostingSettings).mockResolvedValue({
      ...mockHostingSettings,
      accounts: mockHostingSettings.accounts.map((account) =>
        account.id === "101"
          ? {
              ...account,
              agentId: "301",
              fullAutoAuth: true,
              semiAutoAuth: true,
            }
          : account,
      ),
    });
    vi.mocked(agentService.getAiHostingAgent).mockResolvedValue(mockAgentDetail);
    vi.mocked(agentService.createAiHostingAgent).mockResolvedValue({
      ...mockAgentDetail,
      id: "303",
      name: "新品小助理",
    });
    vi.mocked(agentService.updateAiHostingAgent).mockResolvedValue(mockAgentDetail);
    vi.mocked(agentService.testAiHostingAgent).mockResolvedValue({
      action: "reply",
      reply: [{ type: "text", content: "你好，我是 Agent" }],
    });
    vi.mocked(agentService.publishAiHostingAgent).mockResolvedValue({
      ...mockAgentDetail,
      hasUnpublishedChanges: false,
    });
    vi.mocked(agentService.restoreAiHostingAgent).mockResolvedValue({
      ...mockAgentDetail,
      hasUnpublishedChanges: false,
    });
    vi.mocked(agentService.renameAiHostingAgent).mockResolvedValue({
      ...mockAgentDetail,
      name: "护肤专家",
    });
    vi.mocked(agentService.removeAiHostingAgent).mockResolvedValue({ deleted: true });
    vi.mocked(kbService.listKbs).mockImplementation(async (params) =>
      createMockKbListResponse(params?.query),
    );
    vi.mocked(kbService.createKb).mockImplementation(async (payload) => {
      const created = addMockKbListItem({
        description: payload.description ?? "",
        name: payload.name,
      });

      return {
        kbId: created.id,
      };
    });
    vi.mocked(kbService.getKb).mockImplementation(async (kbId) => createMockKbItem(kbId));
    vi.mocked(kbService.listKbDocs).mockImplementation(async (kbId, params) =>
      createMockKbDocsResponse(kbId, params?.query),
    );
    vi.mocked(kbService.getKbDoc).mockImplementation(async (docId) =>
      createMockKbDocDetail(docId),
    );
    vi.mocked(kbService.listKbDocChunks).mockImplementation(async (docId, params) =>
      createMockKbDocChunksResponse(docId, params?.title ?? params?.content),
    );
    retryKbDocMock.mockImplementation(async (docId: string) => {
      updateMockKbDocStatus(docId, "queued");
      return { retried: true };
    });
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
        private readonly listeners = new Map<string, Set<() => void>>();

        naturalHeight = mockImageDimensions.height;
        naturalWidth = mockImageDimensions.width;
        onerror: (() => void) | null = null;
        onload: (() => void) | null = null;

        addEventListener(type: string, listener: () => void) {
          const listeners = this.listeners.get(type) ?? new Set<() => void>();
          listeners.add(listener);
          this.listeners.set(type, listeners);
        }

        removeEventListener(type: string, listener: () => void) {
          this.listeners.get(type)?.delete(listener);
        }

        set src(_value: string) {
          queueMicrotask(() => {
            this.onload?.();
            this.listeners.get("load")?.forEach((listener) => listener());
          });
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
    importKbDocMock.mockReset();
    importKbDocMock.mockResolvedValue({ docId: "mock-doc-created" });
    importKbQaDocMock.mockReset();
    importKbQaDocMock.mockResolvedValue({ docId: "mock-qa-created" });
    importKbImageDocMock.mockReset();
    importKbImageDocMock.mockResolvedValue({ docId: "mock-image-created" });
    uploadKbImageMock.mockReset();
    uploadKbImageMock.mockResolvedValue({
      docUrl: "kb-docs/demo/preview.png",
      url: "https://cdn.example.com/kb-docs/demo/preview.png",
    });
    createKbChunkMock.mockReset();
    createKbChunkMock.mockImplementation(async (payload) => {
      const docDetail = createMockKbDocDetail(payload.docId);
      const chunkId = `chunk-created-${Date.now()}`;

      if (payload.chunkType === "faq") {
        addMockKbChunk({
          answer: payload.content,
          createdAt: "2026-06-20 12:00:00",
          docId: payload.docId,
          id: chunkId,
          kbId: docDetail.kbId,
          question: payload.title ?? "",
          source: "manual",
          type: "qa",
          updatedAt: "2026-06-20 12:00:00",
        });
      } else {
        addMockKbChunk({
          content: payload.content,
          createdAt: "2026-06-20 12:00:00",
          docId: payload.docId,
          id: chunkId,
          kbId: docDetail.kbId,
          source: "manual",
          title: payload.title ?? "",
          type: "document",
          updatedAt: "2026-06-20 12:00:00",
        });
      }

      return { chunkId };
    });
    updateKbChunkMock.mockReset();
    updateKbChunkMock.mockImplementation(async (chunkId, payload) => {
      updateMockKbChunk(chunkId, {
        answer: payload.content,
        content: payload.content,
        question: payload.title,
        title: payload.title,
      });
      return { updated: true };
    });
    deleteKbChunkMock.mockReset();
    deleteKbChunkMock.mockImplementation(async (chunkId) => {
      deleteMockKbChunk(chunkId);
      return { deleted: true };
    });
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
    expect(screen.getByRole("table", { name: "Agent 列表" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Agent 列表区块" })).toBeInTheDocument();
    expect(await screen.findByText("共 2 条")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "智能体用量" })).toHaveTextContent("Agent");
    expect(screen.getByRole("region", { name: "智能体用量" })).toHaveTextContent("2/20");
    expect(screen.getByRole("region", { name: "智能体用量" })).toHaveTextContent("知识库");
    expect(screen.getByRole("region", { name: "智能体用量" })).toHaveTextContent("3/20");
    expect(screen.getByRole("region", { name: "智能体用量" })).toHaveTextContent("文档容量");
    expect(screen.getByRole("region", { name: "智能体用量" })).toHaveTextContent("20MB/1GB");
    expect(screen.queryByRole("tab", { name: "应用范围" })).not.toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "护肤小助理" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "售后小助理" })).toBeInTheDocument();
    const doubaoIcons = screen.getAllByTitle("模型图标：Doubao-2.0-lite");

    expect(doubaoIcons).toHaveLength(2);
    expect(doubaoIcons[0].querySelector("img")).toHaveAttribute(
      "src",
      "https://b5.bokr.com.cn/dist/llm/doubao-color.svg",
    );
    expect(screen.getByText("商品咨询知识库")).toBeInTheDocument();
    expect(screen.getByText("活动政策知识库")).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "未关联" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "添加 Agent" })).toBeInTheDocument();
    expect(agentService.listAiHostingAgents).toHaveBeenCalledWith({
      page: 1,
      pageSize: 10,
      query: "",
    });
  });

  it("shows overflowing agent knowledge bases in a bounded hover popover", async () => {
    const user = userEvent.setup();

    vi.mocked(agentService.listAiHostingAgents).mockResolvedValue({
      agents: [
        {
          ...mockAgents[0],
          kbList: [
            { id: "1", name: "商品咨询知识库" },
            { id: "2", name: "售后政策知识库" },
            { id: "3", name: "活动政策知识库" },
            { id: "4", name: "直播话术知识库" },
          ],
        },
      ],
      pagination: {
        page: 1,
        pageSize: 10,
        total: 1,
      },
    });

    renderWithRoute("/chat/ai-hosting/agents", <AgentManagementPage />);

    const trigger = await screen.findByRole("button", {
      name: "查看 护肤小助理 的全部关联知识库",
    });

    expect(trigger).toHaveTextContent("商品咨询知识库");
    expect(trigger).toHaveTextContent("售后政策知识库");
    expect(trigger).toHaveTextContent("等 4 个知识库");
    expect(screen.queryByText("直播话术知识库")).not.toBeInTheDocument();

    await user.hover(trigger);

    const popover = await screen.findByRole("dialog");
    expect(popover).toHaveTextContent("关联知识库 · 4");
    expect(popover).toHaveTextContent("商品咨询知识库");
    expect(popover).toHaveTextContent("售后政策知识库");
    expect(popover).toHaveTextContent("活动政策知识库");
    expect(popover).toHaveTextContent("直播话术知识库");
    expect(within(popover).getByTestId("agent-kb-popover-scroll")).toHaveClass("h-[16rem]");
  });

  it("shows document storage below 1MB with one decimal place", async () => {
    vi.mocked(agentService.getAiHostingQuota).mockResolvedValue({
      agents: {
        limit: 20,
        used: 2,
      },
      kbDocs: {
        limit: 1024 * 1024 * 1024,
        used: 512 * 1024,
      },
      kbs: {
        limit: 20,
        used: 3,
      },
    });

    renderWithRoute("/chat/ai-hosting/agents", <AgentManagementPage />);

    expect(await screen.findByRole("heading", { level: 1, name: "Agent 管理" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "智能体用量" })).toHaveTextContent("文档容量");
    expect(screen.getByRole("region", { name: "智能体用量" })).toHaveTextContent("0.5MB/1GB");
  });

  it("shows document storage below 0.1MB as zero without a unit", async () => {
    vi.mocked(agentService.getAiHostingQuota).mockResolvedValue({
      agents: {
        limit: 20,
        used: 2,
      },
      kbDocs: {
        limit: 1024 * 1024 * 1024,
        used: 64 * 1024,
      },
      kbs: {
        limit: 20,
        used: 3,
      },
    });

    renderWithRoute("/chat/ai-hosting/agents", <AgentManagementPage />);

    expect(await screen.findByRole("heading", { level: 1, name: "Agent 管理" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "智能体用量" })).toHaveTextContent("文档容量");
    expect(screen.getByRole("region", { name: "智能体用量" })).toHaveTextContent("0/1GB");
  });

  it("prevents adding agents when the fixed agent quota is reached", async () => {
    const user = userEvent.setup();
    vi.mocked(agentService.getAiHostingQuota).mockResolvedValue({
      agents: {
        limit: 20,
        used: 20,
      },
      kbDocs: {
        limit: 1024 * 1024 * 1024,
        used: 20 * 1024 * 1024,
      },
      kbs: {
        limit: 20,
        used: 3,
      },
    });

    renderWithRoute("/chat/ai-hosting/agents", <AgentManagementPage />);

    await screen.findByText("共 2 条");
    await user.click(screen.getByRole("button", { name: "添加 Agent" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Agent 数量已达上限");
    });
  });

  it("keeps the agent table header visible while loading", async () => {
    vi.mocked(agentService.listAiHostingAgents).mockReturnValueOnce(
      new Promise(() => undefined),
    );

    renderWithRoute("/chat/ai-hosting/agents", <AgentManagementPage />);

    expect(screen.getByRole("table", { name: "Agent 列表" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Agent 名称" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "大模型" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "关联知识库" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "操作" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "正在加载" })).toBeInTheDocument();
  });

  it("does not focus the conditional logic editor while restoring agent settings", async () => {
    const focusedConditionalLogicEditors: HTMLElement[] = [];
    const focusSpy = vi
      .spyOn(HTMLElement.prototype, "focus")
      .mockImplementation(function focus(this: HTMLElement) {
        if (this.getAttribute("aria-label") === "条件逻辑描述") {
          focusedConditionalLogicEditors.push(this);
        }
      });

    try {
      renderWithRoute(
        "/chat/ai-hosting/agents/301",
        <AgentSettingsPage />,
        "/chat/ai-hosting/agents/:agentId",
      );

      await screen.findByDisplayValue("护肤小助理");
      expect(screen.getByRole("group", { name: "条件逻辑" })).toHaveTextContent(
        "如果客户咨询成分",
      );

      expect(focusedConditionalLogicEditors).toHaveLength(0);
      expect(screen.getByLabelText("条件逻辑描述")).not.toBe(document.activeElement);
    } finally {
      focusSpy.mockRestore();
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

  it("renders agent management as read-only for non-manage roles", async () => {
    mockSession("operator");

    renderWithRoute("/chat/ai-hosting/agents", <AgentManagementPage />);

    expect(await screen.findByRole("heading", { level: 1, name: "Agent 管理" })).toBeInTheDocument();
    expect(screen.getByText("当前账号仅可查看 Agent，管理操作需管理员权限")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "添加 Agent" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "查看" })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "删除" })).not.toBeInTheDocument();
  });

  it("removes agents from the management page after confirmation", async () => {
    const user = userEvent.setup();

    renderWithRoute("/chat/ai-hosting/agents", <AgentManagementPage />);

    await screen.findByRole("cell", { name: "护肤小助理" });
    await user.click(screen.getAllByRole("button", { name: "删除" })[0]);

    expect(screen.getByRole("alertdialog", { name: "确认删除 Agent？" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "确认" }));

    await waitFor(() => {
      expect(agentService.removeAiHostingAgent).toHaveBeenCalledWith("301");
    });
  });

  it("renders the hosting settings page", async () => {
    renderWithRoute("/chat/ai-hosting/hosting-settings", <AgentHostingSettingsPage />);

    expect(await screen.findByRole("heading", { level: 1, name: "托管设置" })).toBeInTheDocument();
    await waitFor(() => {
      expect(agentService.listAiHostingSettings).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText("配置托管账号关联的 Agent 和托管策略")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "搜索托管账号" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "批量设置" })).toBeDisabled();
    expect(screen.getByRole("table", { name: "托管设置列表" })).toBeInTheDocument();
    expect(screen.getByText("小助理1")).toBeInTheDocument();
    expect(screen.getByText("小助理2")).toBeInTheDocument();
    expect(screen.getByText("小助理3")).toBeInTheDocument();
    expect(screen.getByAltText("小助理2头像")).toHaveAttribute(
      "src",
      "https://example.com/avatar-102.png",
    );
    expect(screen.getByText("护肤小助理")).toBeInTheDocument();
    expect(screen.getByText("未发布小助理")).toBeInTheDocument();
    expect(screen.getAllByText("启用")).toHaveLength(3);
    expect(screen.getAllByText("关闭")).toHaveLength(3);
    expect(screen.getAllByRole("button", { name: "设置" })).toHaveLength(3);
  });

  it("keeps the hosting settings table header visible while loading", async () => {
    vi.mocked(agentService.listAiHostingSettings).mockReturnValueOnce(
      new Promise(() => undefined),
    );

    renderWithRoute("/chat/ai-hosting/hosting-settings", <AgentHostingSettingsPage />);

    expect(screen.getByRole("table", { name: "托管设置列表" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "托管账号" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "关联 Agent" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "允许开启 AI 回复" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "允许话术推荐" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "操作" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "正在加载" })).toBeInTheDocument();
    expect(screen.queryByText("暂无数据")).not.toBeInTheDocument();
  });

  it("filters application scope accounts by search query", async () => {
    const user = userEvent.setup();

    renderWithRoute("/chat/ai-hosting/hosting-settings", <AgentHostingSettingsPage />);

    await screen.findByRole("heading", { level: 1, name: "托管设置" });
    await user.type(screen.getByRole("textbox", { name: "搜索托管账号" }), "小助理2");

    expect(screen.getByText("小助理2")).toBeInTheDocument();
    expect(screen.queryByText("小助理1")).not.toBeInTheDocument();
    expect(screen.queryByText("小助理3")).not.toBeInTheDocument();
  });

  it("opens the settings dialog from row settings", async () => {
    const user = userEvent.setup();

    renderWithRoute("/chat/ai-hosting/hosting-settings", <AgentHostingSettingsPage />);

    await screen.findByRole("heading", { level: 1, name: "托管设置" });
    await user.click(screen.getAllByRole("button", { name: "设置" })[1]);

    const dialog = screen.getByRole("dialog", { name: "设置" });

    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveTextContent("小助理2");
    expect(within(dialog).getByAltText("小助理2头像")).toHaveAttribute(
      "src",
      "https://example.com/avatar-102.png",
    );
    expect(dialog).toHaveTextContent("允许开启 AI 回复");
    expect(dialog).toHaveTextContent("客服可开启 AI 回复， Agent 将自动回复客户的消息");
    expect(dialog).toHaveTextContent("允许话术推荐");
    expect(dialog).toHaveTextContent("Agent 会自动生成回复建议，提升客服服务效率");
    await user.click(screen.getByRole("combobox", { name: "关联 Agent" }));
    expect(screen.getByRole("option", { name: "护肤小助理" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "未发布小助理" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await user.keyboard("{Escape}");
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
    await user.click(screen.getByRole("switch", { name: "允许开启 AI 回复" }));
    await user.click(screen.getByRole("switch", { name: "允许话术推荐" }));
    await user.click(screen.getByRole("button", { name: "保存设置" }));

    expect(screen.getByRole("alert")).toHaveTextContent("请选择已发布 Agent");
    expect(agentService.updateAiHostingSettings).not.toHaveBeenCalled();

    await user.click(screen.getByRole("combobox", { name: "关联 Agent" }));
    await user.click(screen.getByRole("option", { name: "护肤小助理" }));
    await user.click(screen.getByRole("button", { name: "保存设置" }));

    await waitFor(() => {
      expect(agentService.updateAiHostingSettings).toHaveBeenCalledWith({
        agentId: "301",
        fullAutoAuth: true,
        semiAutoAuth: true,
        userSeatIds: ["101"],
      });
    });
    expect(screen.queryByRole("dialog", { name: "设置" })).not.toBeInTheDocument();
    expect(screen.getAllByText("启用")).toHaveLength(5);
    expect(screen.getAllByText("关闭")).toHaveLength(1);
  });

  it("keeps save errors inside the hosting settings dialog", async () => {
    const user = userEvent.setup();
    vi.mocked(agentService.updateAiHostingSettings).mockRejectedValueOnce(
      new Error("保存失败，请稍后重试"),
    );

    renderWithRoute("/chat/ai-hosting/hosting-settings", <AgentHostingSettingsPage />);

    await screen.findByRole("heading", { level: 1, name: "托管设置" });
    await user.click(screen.getAllByRole("button", { name: "设置" })[0]);
    await user.click(screen.getByRole("combobox", { name: "关联 Agent" }));
    await user.click(screen.getByRole("option", { name: "护肤小助理" }));
    await user.click(screen.getByRole("button", { name: "保存设置" }));

    const dialog = screen.getByRole("dialog", { name: "设置" });

    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByRole("alert")).toHaveTextContent("保存失败，请稍后重试");
  });

  it("disables hosting settings submit while saving", async () => {
    const user = userEvent.setup();
    const saveRequest = new Promise<AiHostingSettingsResponse>(() => undefined);
    vi.mocked(agentService.updateAiHostingSettings).mockReturnValueOnce(saveRequest);

    renderWithRoute("/chat/ai-hosting/hosting-settings", <AgentHostingSettingsPage />);

    await screen.findByRole("heading", { level: 1, name: "托管设置" });
    await user.click(screen.getAllByRole("button", { name: "设置" })[0]);
    await user.click(screen.getByRole("combobox", { name: "关联 Agent" }));
    await user.click(screen.getByRole("option", { name: "护肤小助理" }));
    await user.click(screen.getByRole("button", { name: "保存设置" }));

    const savingButton = screen.getByRole("button", { name: "保存中" });

    expect(savingButton).toBeDisabled();
    await user.click(savingButton);
    expect(agentService.updateAiHostingSettings).toHaveBeenCalledTimes(1);
  });

  it("navigates to agent settings page from add agent link", async () => {
    renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsPage />);

    expect(await screen.findByRole("heading", { level: 1, name: "创建 Agent" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "智能生成" })).toHaveAttribute(
      "data-agent-generate-gradient-button",
      "true",
    );
    expect(screen.queryByRole("button", { name: "发布正式版" })).not.toBeInTheDocument();
    expect(screen.getByText("基本设置")).toBeInTheDocument();
    expect(screen.queryByText("回复基调")).not.toBeInTheDocument();
    expect(screen.getByText("角色")).toBeInTheDocument();
    expect(screen.getByText("沟通风格")).toBeInTheDocument();
    expect(screen.queryByText("语气风格")).not.toBeInTheDocument();
    expect(screen.getByText("风格描述")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看模板" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "😊 亲切自然" })).not.toBeInTheDocument();
    expect(screen.getByText("回复长度")).toBeInTheDocument();
    expect(
      screen.getByText("沟通风格").compareDocumentPosition(screen.getByRole("button", { name: "查看模板" })),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(
      screen.getByRole("button", { name: "查看模板" }).compareDocumentPosition(screen.getByText("风格描述")),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(
      screen.getByText("风格描述").compareDocumentPosition(screen.getByLabelText("沟通风格")),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.getByText("条件逻辑")).toBeInTheDocument();
    expect(screen.getByText("转人工条件")).toBeInTheDocument();
    expect(await screen.findByTitle("模型图标：默认模型")).toBeInTheDocument();
    expect(screen.getByLabelText("Agent 模拟测试")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "清空" })).toBeInTheDocument();
    expect(screen.getByLabelText("选择图片")).toBeInTheDocument();
  });

  it("clears preview chat messages and input draft", async () => {
    const user = userEvent.setup();

    renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsPage />);

    await screen.findByRole("heading", { level: 1, name: "创建 Agent" });
    await user.type(screen.getByLabelText("预览输入框"), "测试消息{Enter}");

    expect(await screen.findByText("你好，我是 Agent")).toBeInTheDocument();
    expect(agentService.testAiHostingAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          {
            contents: [{ type: "text", text: "测试消息" }],
            role: "user",
          },
        ],
        modelId: "10",
      }),
    );

    await user.click(screen.getByRole("button", { name: "清空" }));

    expect(screen.queryByText("测试消息")).not.toBeInTheDocument();
    expect(screen.queryByText("你好，我是 Agent")).not.toBeInTheDocument();
    expect(screen.getByLabelText("预览输入框")).toHaveValue("");
  });

  it("clears the preview input immediately after sending a text message", async () => {
    const user = userEvent.setup();
    let resolveTest: ((value: Awaited<ReturnType<typeof agentService.testAiHostingAgent>>) => void) | undefined;

    vi.mocked(agentService.testAiHostingAgent).mockReturnValue(
      new Promise((resolve) => {
        resolveTest = resolve;
      }),
    );

    renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsPage />);

    await screen.findByRole("heading", { level: 1, name: "创建 Agent" });
    await user.type(screen.getByLabelText("预览输入框"), "测试消息{Enter}");

    expect(screen.getByLabelText("预览输入框")).toHaveValue("");
    expect(screen.getByText("测试消息")).toBeInTheDocument();

    resolveTest?.({
      action: "reply",
      reply: [{ type: "text", content: "你好，我是 Agent" }],
    });

    expect(await screen.findByText("你好，我是 Agent")).toBeInTheDocument();
  });

  it("sends selected images directly in the preview chat", async () => {
    const user = userEvent.setup();
    const imageFile = new File(["image"], "preview.png", { type: "image/png" });

    vi.mocked(uploadKbImageMock).mockResolvedValue({
      docUrl: "kb-docs/demo/preview.png",
      url: "https://cdn.example.com/kb-docs/demo/preview.png",
    });

    renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsPage />);

    await screen.findByRole("heading", { level: 1, name: "创建 Agent" });
    await user.upload(screen.getByLabelText("选择图片"), imageFile);

    expect(uploadKbImageMock).toHaveBeenCalledWith(imageFile);
    expect(await screen.findByText("你好，我是 Agent")).toBeInTheDocument();
    expect(agentService.testAiHostingAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          {
            contents: [
              {
                type: "image",
                url: "https://cdn.example.com/kb-docs/demo/preview.png",
              },
            ],
            role: "user",
          },
        ],
      }),
    );

    const previewPanel = screen.getByRole("region", { name: "Agent 模拟测试" });

    expect(within(previewPanel).getByRole("presentation")).toHaveAttribute(
      "src",
      "https://cdn.example.com/kb-docs/demo/preview.png",
    );
  });

  it("renders multiple agent replies from the test response", async () => {
    const user = userEvent.setup();

    vi.mocked(agentService.testAiHostingAgent).mockResolvedValue({
      action: "reply",
      reply: [
        { type: "text", content: "第一段回复" },
        { type: "text", content: "第二段回复" },
      ],
    });

    renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsPage />);

    await screen.findByRole("heading", { level: 1, name: "创建 Agent" });
    await user.type(screen.getByLabelText("预览输入框"), "测试消息{Enter}");

    expect(await screen.findByText("第一段回复")).toBeInTheDocument();
    expect(screen.getByText("第二段回复")).toBeInTheDocument();
  });

  it("shows feedback when the preview test returns no usable reply", async () => {
    const user = userEvent.setup();

    vi.mocked(agentService.testAiHostingAgent).mockResolvedValue({
      action: "reply",
      reply: [],
    });

    renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsPage />);

    await screen.findByRole("heading", { level: 1, name: "创建 Agent" });
    await user.type(screen.getByLabelText("预览输入框"), "测试消息{Enter}");

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Agent 暂无回复");
    });
    expect(screen.queryByText("测试消息", { selector: "p" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("预览输入框")).toHaveValue("测试消息");
  });

  it("fills communication style from the template menu", async () => {
    const user = userEvent.setup();

    renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsPage />);

    await screen.findByRole("heading", { level: 1, name: "创建 Agent" });
    await user.click(screen.getByRole("button", { name: "查看模板" }));
    await user.click(screen.getByRole("menuitem", { name: "活泼种草" }));

    expect(screen.getByLabelText("沟通风格")).toHaveValue(
      "语气轻快有感染力，适度突出亮点和使用体验，适合新品介绍、活动推荐和种草转化，但不要过度催促客户。",
    );
  });

  it("uses the database name length limit for agent names", async () => {
    renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsPage />);

    await screen.findByRole("heading", { level: 1, name: "创建 Agent" });

    expect(screen.getByLabelText("Agent 名称")).toHaveAttribute("maxLength", "50");
  });

  it("limits long text agent settings fields to 2000 characters", async () => {
    renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsPage />);

    await screen.findByRole("heading", { level: 1, name: "创建 Agent" });

    expect(screen.getByLabelText("角色描述")).toHaveAttribute("maxLength", "2000");
    expect(screen.getByLabelText("沟通风格")).toHaveAttribute("maxLength", "2000");
    expect(screen.getByLabelText("转人工条件")).toHaveAttribute("maxLength", "2000");
    expect(screen.getAllByText("0/2000")).toHaveLength(3);
  });

  it("keeps the selected model icon and label in one trigger row", async () => {
    renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsPage />);

    await screen.findByRole("heading", { level: 1, name: "创建 Agent" });
    await screen.findByTitle("模型图标：默认模型");

    const trigger = screen.getByRole("combobox", { name: "大模型" });

    expect(trigger.querySelector("[data-agent-model-trigger-value]")).toBeInTheDocument();
  });

  it("renders model icons in the model selector options", async () => {
    const user = userEvent.setup();

    renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsPage />);

    await screen.findByRole("heading", { level: 1, name: "创建 Agent" });
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

    await screen.findByRole("heading", { level: 1, name: "创建 Agent" });
    await user.click(screen.getByRole("button", { name: "智能生成" }));

    const dialog = screen.getByRole("dialog", { name: "智能生成" });

    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveTextContent("按实际情况填写表单后，AI 会帮您自动生成 Agent 的配置内容");
    expect(screen.getByLabelText("行业")).toBeInTheDocument();
    expect(screen.getByLabelText("请问您为客户提供哪些服务/商品?")).toBeInTheDocument();
    expect(screen.getByLabelText("您希望 AI 扮演什么样的角色?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "开始生成" })).toHaveAttribute(
      "data-agent-generate-gradient-button",
      "true",
    );
    expect(screen.getByRole("button", { name: "开始生成" })).toBeDisabled();
  });

  it("shows generation progress after starting generate", async () => {
    const user = userEvent.setup();

    renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsPage />);

    await screen.findByRole("heading", { level: 1, name: "创建 Agent" });
    await user.click(screen.getByRole("button", { name: "智能生成" }));

    await user.click(screen.getByRole("combobox", { name: "行业" }));
    await user.click(screen.getByRole("option", { name: "美妆护肤" }));
    await user.type(screen.getByLabelText("请问您为客户提供哪些服务/商品?"), "护肤咨询");
    await user.click(screen.getByRole("combobox", { name: "您希望 AI 扮演什么样的角色?" }));
    await user.click(screen.getByRole("option", { name: "品牌客服" }));
    await user.click(screen.getByRole("button", { name: "开始生成" }));

    expect(screen.getByText("生成进度")).toBeInTheDocument();
    expect(screen.getByText("15%")).toBeInTheDocument();
    expect(screen.getByText("输入文本")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "生成进度" })).toBeInTheDocument();
  });

  it("shows an unpublished draft dialog after creating an agent", async () => {
    const user = userEvent.setup();
    const create = createDeferred<typeof mockAgentDetail>();

    vi.mocked(agentService.createAiHostingAgent).mockReturnValueOnce(create.promise);

    renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsPage />);

    await screen.findByRole("heading", { level: 1, name: "创建 Agent" });
    await screen.findByTitle("模型图标：默认模型");
    await user.clear(screen.getByLabelText("Agent 名称"));
    await user.type(screen.getByLabelText("Agent 名称"), "新品小助理");
    await user.click(screen.getByRole("button", { name: "保存" }));

    const saveButton = screen.getByRole("button", { name: "保存中保存" });
    expect(saveButton).toBeDisabled();
    expect(saveButton.querySelector("[data-slot='spinner']")).toBeInTheDocument();

    create.resolve({
      ...mockAgentDetail,
      id: "303",
      name: "新品小助理",
    });

    const dialog = await screen.findByRole("dialog", { name: "保存成功" });

    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveTextContent("保存成功，尚未发布");
    expect(screen.getByRole("button", { name: "知道了" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "立即发布" })).toBeInTheDocument();

    await waitFor(() => {
      expect(agentService.createAiHostingAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "新品小助理",
        }),
      );
    });
  });

  it("returns to the agent list when acknowledging a newly saved draft", async () => {
    const user = userEvent.setup();

    const router = createMemoryRouter(
      [
        {
          path: "/chat/ai-hosting/agents/new",
          element: <AgentSettingsPage />,
        },
        {
          path: "/chat/ai-hosting/agents",
          element: <div>Agent 列表页</div>,
        },
      ],
      { initialEntries: ["/chat/ai-hosting/agents/new"] },
    );

    render(<RouterProvider router={router} />);

    await screen.findByRole("heading", { level: 1, name: "创建 Agent" });
    await screen.findByTitle("模型图标：默认模型");
    await user.clear(screen.getByLabelText("Agent 名称"));
    await user.type(screen.getByLabelText("Agent 名称"), "新品小助理");
    await user.click(screen.getByRole("button", { name: "保存" }));
    await user.click(await screen.findByRole("button", { name: "知道了" }));

    expect(await screen.findByText("Agent 列表页")).toBeInTheDocument();
  });

  it("publishes immediately from the newly saved draft dialog", async () => {
    const user = userEvent.setup();
    const publish = createDeferred<typeof mockAgentDetail>();

    vi.mocked(agentService.publishAiHostingAgent).mockReturnValueOnce(publish.promise);

    renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsPage />);

    await screen.findByRole("heading", { level: 1, name: "创建 Agent" });
    await screen.findByTitle("模型图标：默认模型");
    await user.clear(screen.getByLabelText("Agent 名称"));
    await user.type(screen.getByLabelText("Agent 名称"), "新品小助理");
    await user.click(screen.getByRole("button", { name: "保存" }));
    await user.click(await screen.findByRole("button", { name: "立即发布" }));

    const publishButton = screen.getByRole("button", { name: "发布中立即发布" });
    expect(publishButton).toBeDisabled();
    expect(publishButton.querySelector("[data-slot='spinner']")).toBeInTheDocument();

    await waitFor(() => {
      expect(agentService.publishAiHostingAgent).toHaveBeenCalledWith("303");
    });

    publish.resolve({
      ...mockAgentDetail,
      hasUnpublishedChanges: false,
      id: "303",
      name: "新品小助理",
    });
  });

  it("opens restore draft dialog from the draft banner", async () => {
    const user = userEvent.setup();

    renderWithRoute("/chat/ai-hosting/agents/301", <AgentSettingsPage />, "/chat/ai-hosting/agents/:agentId");

    expect(await screen.findByText(/有尚未发布的修改，你也可以/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "还原为正式版" }));

    const dialog = screen.getByRole("dialog", { name: "是否还原到正式版内容？" });

    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveTextContent("确认还原后，将无法恢复当前草稿内容");
    expect(screen.getByRole("button", { name: "取消" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "还原" })).toBeInTheDocument();
  });

  it("shows a non-restorable draft hint before the first publish", async () => {
    vi.mocked(agentService.getAiHostingAgent).mockResolvedValueOnce({
      ...mockAgentDetail,
      publishedAt: undefined,
    });

    renderWithRoute("/chat/ai-hosting/agents/301", <AgentSettingsPage />, "/chat/ai-hosting/agents/:agentId");

    expect(await screen.findByText("有尚未发布的修改")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "还原为正式版" })).not.toBeInTheDocument();
  });

  it("saves and publishes agent settings through the API without changing the name", async () => {
    const user = userEvent.setup();
    const publish = createDeferred<typeof mockAgentDetail>();

    vi.mocked(agentService.publishAiHostingAgent).mockReturnValueOnce(publish.promise);

    renderWithRoute("/chat/ai-hosting/agents/301", <AgentSettingsPage />, "/chat/ai-hosting/agents/:agentId");

    await screen.findByDisplayValue("护肤小助理");
    expect(screen.getByRole("heading", { level: 1, name: "护肤小助理" })).toBeInTheDocument();
    expect(screen.getByLabelText("Agent 名称")).toBeDisabled();

    await user.clear(screen.getByLabelText("角色描述"));
    await user.type(screen.getByLabelText("角色描述"), "你是资深护肤顾问");
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(agentService.updateAiHostingAgent).toHaveBeenCalledWith(
        "301",
        {
          modelId: "11",
          promptConfig: expect.objectContaining({
            role: "你是资深护肤顾问",
          }),
        },
      );
    });

    await user.click(screen.getByRole("button", { name: "发布正式版" }));
    await user.click(screen.getByRole("button", { name: "发布" }));

    const confirmButton = screen.getByRole("button", { name: "发布中发布" });
    expect(confirmButton).toBeDisabled();
    expect(confirmButton.querySelector("[data-slot='spinner']")).toBeInTheDocument();

    await waitFor(() => {
      expect(agentService.publishAiHostingAgent).toHaveBeenCalledWith("301");
    });

    publish.resolve({
      ...mockAgentDetail,
      hasUnpublishedChanges: false,
    });
  });

  it("renames an existing agent from the title edit dialog", async () => {
    const user = userEvent.setup();
    const rename = createDeferred<typeof mockAgentDetail>();

    vi.mocked(agentService.renameAiHostingAgent).mockReturnValueOnce(rename.promise);

    renderWithRoute("/chat/ai-hosting/agents/301", <AgentSettingsPage />, "/chat/ai-hosting/agents/:agentId");

    await screen.findByRole("heading", { level: 1, name: "护肤小助理" });
    await user.click(screen.getByRole("button", { name: "编辑 Agent 名称" }));

    const dialog = screen.getByRole("dialog", { name: "编辑 Agent 名称" });

    await user.clear(within(dialog).getByLabelText("Agent 名称"));
    await user.type(within(dialog).getByLabelText("Agent 名称"), "护肤专家");
    await user.click(within(dialog).getByRole("button", { name: "保存" }));

    const saveButton = within(dialog).getByRole("button", { name: "保存中保存" });
    expect(saveButton).toBeDisabled();
    expect(saveButton.querySelector("[data-slot='spinner']")).toBeInTheDocument();

    await waitFor(() => {
      expect(agentService.renameAiHostingAgent).toHaveBeenCalledWith("301", {
        name: "护肤专家",
      });
    });

    rename.resolve({
      ...mockAgentDetail,
      name: "护肤专家",
    });

    expect(await screen.findByRole("heading", { level: 1, name: "护肤专家" })).toBeInTheDocument();
  });

  it("does not publish the previous draft when saving changes fails", async () => {
    const user = userEvent.setup();

    vi.mocked(agentService.updateAiHostingAgent).mockRejectedValueOnce(new Error("save failed"));

    renderWithRoute("/chat/ai-hosting/agents/301", <AgentSettingsPage />, "/chat/ai-hosting/agents/:agentId");

    await screen.findByDisplayValue("护肤小助理");
    await user.clear(screen.getByLabelText("角色描述"));
    await user.type(screen.getByLabelText("角色描述"), "你是资深护肤顾问");
    await user.click(screen.getByRole("button", { name: "发布正式版" }));
    await user.click(screen.getByRole("button", { name: "发布" }));

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

  it("renders agent settings as read-only for non-manage roles", async () => {
    mockSession("operator");

    renderWithRoute("/chat/ai-hosting/agents/301", <AgentSettingsPage />, "/chat/ai-hosting/agents/:agentId");

    expect(await screen.findByRole("heading", { level: 1, name: "护肤小助理" })).toBeInTheDocument();
    expect(
      screen.getByText("当前账号仅可查看 Agent，保存、发布和还原操作需管理员权限"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "保存" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "智能生成" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "发布正式版" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "编辑 Agent 名称" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "还原为正式版" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Agent 名称")).toBeDisabled();
    expect(screen.getByLabelText("角色描述")).toBeDisabled();
    expect(screen.getByLabelText("沟通风格")).toBeDisabled();
    expect(screen.getByLabelText("转人工条件")).toBeDisabled();
    expect(screen.getByLabelText("条件逻辑描述")).toHaveAttribute("aria-disabled", "true");
  });

  it("inserts knowledge bases inline with conditional logic text", async () => {
    const user = userEvent.setup();
    vi.mocked(kbService.listKbs).mockResolvedValue({
      kbs: [
        {
          createdAt: "2026-06-20T08:00:00.000Z",
          description: "",
          kbId: "1",
          name: "真实护肤知识库",
          updatedAt: "2026-06-20T08:00:00.000Z",
        },
        {
          createdAt: "2026-06-20T08:00:00.000Z",
          description: "",
          kbId: "3",
          name: "真实彩妆知识库",
          updatedAt: "2026-06-20T08:00:00.000Z",
        },
      ],
      pagination: {
        page: 1,
        pageSize: 200,
        total: 2,
      },
    });

    renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsPage />);

    await screen.findByRole("heading", { level: 1, name: "创建 Agent" });
    expect(
      screen.getByText(
        "配置 Agent 在不同客户问题、业务场景或会话状态下的处理方式，例如商品咨询调用知识库",
      ),
    ).toBeInTheDocument();

    const descriptionInput = screen.getByLabelText("条件逻辑描述");

    await user.click(descriptionInput);
    await user.paste("111 ");
    await user.click(screen.getByRole("button", { name: "添加关联知识库" }));

    const listbox = await screen.findByRole("listbox", { name: "选择知识库" });

    expect(kbService.listKbs).toHaveBeenLastCalledWith({
      page: 1,
      pageSize: 200,
    });
    expect(screen.queryByRole("option", { name: "美妆知识大全" })).not.toBeInTheDocument();

    await user.type(within(listbox).getByRole("textbox", { name: "搜索知识库" }), "彩妆");

    expect(kbService.listKbs).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("option", { name: "真实护肤知识库" })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("option", { name: "真实彩妆知识库" }));

    const conditionalLogicGroup = screen.getByRole("group", { name: "条件逻辑" });

    expect(conditionalLogicGroup).toHaveTextContent("111");
    expect(conditionalLogicGroup).toHaveTextContent("真实彩妆知识库");

    await user.clear(screen.getByLabelText("Agent 名称"));
    await user.type(screen.getByLabelText("Agent 名称"), "新品小助理");
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(agentService.createAiHostingAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          promptConfig: expect.objectContaining({
            availableKbIds: [3],
            conditionLogic:
              '111 <resource type="knowledge_base" kbId="3" name="真实彩妆知识库" /> ',
          }),
        }),
      );
    });
  });

  it("closes the conditional logic knowledge base popover when clicking outside", async () => {
    const user = userEvent.setup();

    vi.mocked(kbService.listKbs).mockResolvedValue({
      kbs: [
        {
          createdAt: "2026-06-20T08:00:00.000Z",
          description: "",
          kbId: "kb-real-skincare",
          name: "真实护肤知识库",
          updatedAt: "2026-06-20T08:00:00.000Z",
        },
      ],
      pagination: {
        page: 1,
        pageSize: 200,
        total: 1,
      },
    });

    renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsPage />);

    await screen.findByRole("heading", { level: 1, name: "创建 Agent" });
    await user.click(screen.getByRole("button", { name: "添加关联知识库" }));

    expect(await screen.findByRole("listbox", { name: "选择知识库" })).toBeInTheDocument();

    await user.click(screen.getByLabelText("Agent 名称"));

    await waitFor(() => {
      expect(screen.queryByRole("listbox", { name: "选择知识库" })).not.toBeInTheDocument();
    });
  });

  it("collapses and expands agent settings sections", async () => {
    const user = userEvent.setup();

    renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsPage />);

    await screen.findByRole("heading", { level: 1, name: "创建 Agent" });
    expect(screen.getByLabelText("角色描述")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "角色设置", expanded: true }));

    expect(screen.queryByLabelText("角色描述")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "角色设置", expanded: false })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "角色设置", expanded: false }));

    expect(screen.getByLabelText("角色描述")).toBeInTheDocument();
  });

  it("renders the knowledge base page", async () => {
    renderWithRoute("/chat/ai-hosting/kb", <KbListPage />);

    expect(await screen.findByRole("heading", { level: 1, name: "知识库" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "搜索知识库" })).toHaveAttribute(
      "maxLength",
      "32",
    );
    expect(screen.getByRole("button", { name: "创建知识库" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "智能体用量" })).toHaveTextContent("知识库");
    expect(screen.getByRole("region", { name: "智能体用量" })).toHaveTextContent("3/20");
    expect(screen.queryByText("已用 3/20 个知识库")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "华为产品知识" })).toHaveAttribute(
      "href",
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w",
    );
    expect(screen.getAllByRole("link", { name: "查看" })[0]).toHaveAttribute(
      "href",
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w",
    );
    expect(screen.queryByRole("button", { name: "编辑" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "删除" })).not.toBeInTheDocument();
  });

  it("prevents creating knowledge bases when the fixed knowledge base quota is reached", async () => {
    const user = userEvent.setup();
    vi.mocked(agentService.getAiHostingQuota).mockResolvedValue({
      agents: {
        limit: 20,
        used: 2,
      },
      kbDocs: {
        limit: 1024 * 1024 * 1024,
        used: 20 * 1024 * 1024,
      },
      kbs: {
        limit: 20,
        used: 20,
      },
    });

    renderWithRoute("/chat/ai-hosting/kb", <KbListPage />);

    await screen.findByRole("heading", { level: 1, name: "知识库" });
    await user.click(screen.getByRole("button", { name: "创建知识库" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("知识库数量已达上限");
    });
  });

  it("renders the knowledge base management page", async () => {
    const { router } = renderWithRoute(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w",
      <KbDetailPage />,
      "/chat/ai-hosting/kb/:kbId/*",
    );

    expect(await screen.findByRole("heading", { level: 1, name: "华为产品知识" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "返回知识库" })).toHaveAttribute(
      "href",
      "/chat/ai-hosting/kb",
    );
    expect(screen.getByLabelText("知识库管理头部").firstElementChild).toHaveAccessibleName(
      "返回知识库",
    );
    expect(screen.getByRole("textbox", { name: "搜索知识" })).toHaveAttribute(
      "maxLength",
      "32",
    );
    await userEvent.click(screen.getByRole("button", { name: "添加知识" }));
    expect(screen.getByRole("menuitem", { name: /问答/ })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /图片/ })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /文档/ })).toBeInTheDocument();
    expect(screen.getByText("高质量人工知识")).toBeInTheDocument();
    expect(screen.getByText("原始文档")).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /纯文本/ })).not.toBeInTheDocument();
    expect(screen.getByText("上传问答表格，批量导入精准知识")).toBeInTheDocument();
    expect(screen.queryByText("上传图片并添加描述，按描述精准召回")).not.toBeInTheDocument();
    expect(screen.getByText("自动解析文档内容，效果取决于文档质量")).toBeInTheDocument();
    expect(screen.queryByText("直接录入文本片段或说明")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("knowledge-add-option-icon")).toHaveLength(2);
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("table", { name: "知识列表" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "产品说明大全" }));
    expect(router.state.location.pathname).toBe(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w/docs/knowledge-1",
    );
    expect(screen.queryByRole("button", { name: "文本知识集合" })).not.toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: "重试 文本知识集合" })).toBeInTheDocument();
    expect(screen.getByText("排队中")).toBeInTheDocument();
    expect(screen.getByText("共 6 条")).toBeInTheDocument();
    expect(screen.queryByText("已用 6/100 条知识")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "添加知识" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "查看" })[0]).toHaveAttribute(
      "href",
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w/docs/knowledge-1",
    );
  });

  it("retries a failed knowledge record and refreshes the list status", async () => {
    const user = userEvent.setup();

    renderWithRoute(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w",
      <KbDetailPage />,
      "/chat/ai-hosting/kb/:kbId",
    );

    await screen.findByText("文本知识集合");
    await user.click(screen.getByRole("button", { name: "重试 文本知识集合" }));

    await waitFor(() => {
      expect(retryKbDocMock).toHaveBeenCalledWith("knowledge-4");
      expect(toast.success).toHaveBeenCalledWith("已提交重试");
    });
    expect(screen.queryByRole("button", { name: "重试 文本知识集合" })).not.toBeInTheDocument();
    expect(screen.getAllByText("排队中")).toHaveLength(2);
  });

  it("prevents adding knowledge when document storage quota is reached", async () => {
    const user = userEvent.setup();
    vi.mocked(agentService.getAiHostingQuota).mockResolvedValue({
      agents: {
        limit: 20,
        used: 2,
      },
      kbDocs: {
        limit: 1024 * 1024 * 1024,
        used: 1024 * 1024 * 1024,
      },
      kbs: {
        limit: 20,
        used: 3,
      },
    });

    renderWithRoute(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w",
      <KbDetailPage />,
      "/chat/ai-hosting/kb/:kbId",
    );

    await screen.findByRole("heading", { level: 1, name: "华为产品知识" });
    await user.click(screen.getByRole("button", { name: "添加知识" }));
    await user.click(screen.getByRole("menuitem", { name: /问答/ }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("知识库存储空间已达上限");
    });
  });

  it("shows an empty state for unknown knowledge base ids", async () => {
    vi.mocked(kbService.getKb).mockRejectedValueOnce(new Error("KB_NOT_FOUND"));

    renderWithRoute(
      "/chat/ai-hosting/kb/not-exist",
      <KbDetailPage />,
      "/chat/ai-hosting/kb/:kbId",
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
      "/chat/ai-hosting/kb/:kbId",
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
    expect(within(dialog).getByRole("button", { name: "取消" })).toBeEnabled();
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
      "/chat/ai-hosting/kb/:kbId",
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

  it("uploads QA import files to COS and refreshes the list after submit", async () => {
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
      "/chat/ai-hosting/kb/:kbId",
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
    await user.click(screen.getByRole("button", { name: "导入文档" }));

    await waitFor(() => {
      expect(importKbQaDocMock).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByRole("dialog", { name: "批量导入问答" })).not.toBeInTheDocument();
  });

  it("prevents QA import when selected file exceeds the remaining storage quota", async () => {
    const user = userEvent.setup();
    vi.mocked(agentService.getAiHostingQuota)
      .mockResolvedValueOnce({
        agents: {
          limit: 20,
          used: 2,
        },
        kbDocs: {
          limit: 1024 * 1024 * 1024,
          used: 20 * 1024 * 1024,
        },
        kbs: {
          limit: 20,
          used: 3,
        },
      })
      .mockResolvedValueOnce({
        agents: {
          limit: 20,
          used: 2,
        },
        kbDocs: {
          limit: 1024 * 1024 * 1024,
          used: 20 * 1024 * 1024,
        },
        kbs: {
          limit: 20,
          used: 3,
        },
      })
      .mockResolvedValueOnce({
        agents: {
          limit: 20,
          used: 2,
        },
        kbDocs: {
          limit: 1024 * 1024 * 1024,
          used: 1024 * 1024 * 1024 - 8,
        },
        kbs: {
          limit: 20,
          used: 3,
        },
      });

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
      "/chat/ai-hosting/kb/:kbId",
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
    await user.click(screen.getByRole("button", { name: "导入文档" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("知识库存储空间已达上限");
    });
    expect(importKbQaDocMock).not.toHaveBeenCalled();
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
      "/chat/ai-hosting/kb/:kbId",
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
      "/chat/ai-hosting/kb/:kbId",
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
      "/chat/ai-hosting/kb/:kbId",
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
      "/chat/ai-hosting/kb/:kbId",
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
      "/chat/ai-hosting/kb/:kbId",
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
    expect(screen.queryByText("限免")).not.toBeInTheDocument();
    expect(screen.getByText("快速提取文档文字，满足大多数场景")).toBeInTheDocument();
    expect(screen.getByText("适合扫描件或图片中含有关键文字的文档")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /通用解析/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /增强解析/ })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: /按固定长度切分/ })).toBeChecked();
    expect(screen.getByText("按设定最大字符数生成切片")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /2,000/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /1,000/ })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "确认提交" })).toBeEnabled();

    await user.click(screen.getByRole("radio", { name: /增强解析/ }));

    expect(screen.getByRole("button", { name: "确认提交（限免）" })).toBeEnabled();

    await user.click(screen.getByRole("radio", { name: /按分隔符切分/ }));

    expect(screen.getByText("按指定分隔符生成切片")).toBeInTheDocument();
    expect(screen.getByText("分段标识符")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /换行符/ })).toBeChecked();
    expect(screen.queryByText("切片最长字符数")).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /2,000/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "确认提交（限免）" }));

    await waitFor(() => {
      expect(importKbDocMock).toHaveBeenCalledWith(
        expect.objectContaining({
          chunkParams: {
            separator: "newline",
            strategy: "separator",
          },
          chunkStrategy: "separator",
          file: expect.objectContaining({ name: "产品手册.pptx" }),
          kbId: "W7zU2fWkVSp65OTAjDd3-w",
          onProgress: expect.any(Function),
          parseMode: "enhanced",
        }),
      );
    });
    expect(screen.queryByRole("dialog", { name: "导入文档" })).not.toBeInTheDocument();
  });

  it("prevents document import when selected file exceeds the remaining storage quota", async () => {
    const user = userEvent.setup();
    vi.mocked(agentService.getAiHostingQuota)
      .mockResolvedValueOnce({
        agents: {
          limit: 20,
          used: 2,
        },
        kbDocs: {
          limit: 1024 * 1024 * 1024,
          used: 20 * 1024 * 1024,
        },
        kbs: {
          limit: 20,
          used: 3,
        },
      })
      .mockResolvedValueOnce({
        agents: {
          limit: 20,
          used: 2,
        },
        kbDocs: {
          limit: 1024 * 1024 * 1024,
          used: 20 * 1024 * 1024,
        },
        kbs: {
          limit: 20,
          used: 3,
        },
      })
      .mockResolvedValueOnce({
        agents: {
          limit: 20,
          used: 2,
        },
        kbDocs: {
          limit: 1024 * 1024 * 1024,
          used: 1024 * 1024 * 1024 - 4,
        },
        kbs: {
          limit: 20,
          used: 3,
        },
      });

    renderWithRoute(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w",
      <KbDetailPage />,
      "/chat/ai-hosting/kb/:kbId",
    );

    await screen.findByRole("heading", { level: 1, name: "华为产品知识" });
    await user.click(screen.getByRole("button", { name: "添加知识" }));
    await user.click(screen.getByRole("menuitem", { name: /文档/ }));
    await user.upload(
      screen.getByLabelText("选择文档知识文件"),
      new File(["document"], "产品手册.pptx", {
        type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      }),
    );
    await user.click(screen.getByRole("button", { name: "确认提交" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("知识库存储空间已达上限");
    });
    expect(importKbDocMock).not.toHaveBeenCalled();
  });

  it("shows an error when document files are rejected by the dropzone accept rule", async () => {
    const user = userEvent.setup();

    renderWithRoute(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w",
      <KbDetailPage />,
      "/chat/ai-hosting/kb/:kbId",
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
      "/chat/ai-hosting/kb/:kbId",
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

  // 图片添加入口暂时下线
  describe.skip("image knowledge import", () => {
  it("opens the image knowledge dialog and fills the default image name", async () => {
    const user = userEvent.setup();

    renderWithRoute(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w",
      <KbDetailPage />,
      "/chat/ai-hosting/kb/:kbId",
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

  it("refreshes the image knowledge name when uploading a new image", async () => {
    const user = userEvent.setup();

    renderWithRoute(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w",
      <KbDetailPage />,
      "/chat/ai-hosting/kb/:kbId",
    );

    await screen.findByRole("heading", { level: 1, name: "华为产品知识" });
    await user.click(screen.getByRole("button", { name: "添加知识" }));
    await user.click(screen.getByRole("menuitem", { name: /图片/ }));

    const fileInput = screen.getByLabelText("选择图片知识文件");

    await user.upload(
      fileInput,
      new File(["image"], "商品主图.png", { type: "image/png" }),
    );
    expect(screen.getByLabelText(/知识名称/)).toHaveValue("商品主图");

    await user.clear(screen.getByLabelText(/知识名称/));
    await user.type(screen.getByLabelText(/知识名称/), "手动修改名称");

    await user.upload(
      fileInput,
      new File(["image"], "新品海报.webp", { type: "image/webp" }),
    );

    expect(screen.getByLabelText(/知识名称/)).toHaveValue("新品海报");
    expect(screen.getByRole("region", { name: "已选择图片" })).toHaveTextContent(
      "新品海报.webp",
    );
  });

  it("uploads image knowledge to COS and refreshes the list after submit", async () => {
    const user = userEvent.setup();

    renderWithRoute(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w",
      <KbDetailPage />,
      "/chat/ai-hosting/kb/:kbId",
    );

    await screen.findByRole("heading", { level: 1, name: "华为产品知识" });
    await user.click(screen.getByRole("button", { name: "添加知识" }));
    await user.click(screen.getByRole("menuitem", { name: /图片/ }));
    await user.upload(
      screen.getByLabelText("选择图片知识文件"),
      new File(["image"], "商品主图.png", { type: "image/png" }),
    );
    await user.type(screen.getByLabelText(/图片描述/), "晨间护肤套装商品主图");
    await user.click(screen.getByRole("button", { name: "确认提交" }));

    await waitFor(() => {
      expect(importKbImageDocMock).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByRole("dialog", { name: "添加图片知识" })).not.toBeInTheDocument();
  });

  it("prevents image import when selected file exceeds the remaining storage quota", async () => {
    const user = userEvent.setup();
    vi.mocked(agentService.getAiHostingQuota)
      .mockResolvedValueOnce({
        agents: {
          limit: 20,
          used: 2,
        },
        kbDocs: {
          limit: 1024 * 1024 * 1024,
          used: 20 * 1024 * 1024,
        },
        kbs: {
          limit: 20,
          used: 3,
        },
      })
      .mockResolvedValueOnce({
        agents: {
          limit: 20,
          used: 2,
        },
        kbDocs: {
          limit: 1024 * 1024 * 1024,
          used: 20 * 1024 * 1024,
        },
        kbs: {
          limit: 20,
          used: 3,
        },
      })
      .mockResolvedValueOnce({
        agents: {
          limit: 20,
          used: 2,
        },
        kbDocs: {
          limit: 1024 * 1024 * 1024,
          used: 1024 * 1024 * 1024 - 4,
        },
        kbs: {
          limit: 20,
          used: 3,
        },
      });

    renderWithRoute(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w",
      <KbDetailPage />,
      "/chat/ai-hosting/kb/:kbId",
    );

    await screen.findByRole("heading", { level: 1, name: "华为产品知识" });
    await user.click(screen.getByRole("button", { name: "添加知识" }));
    await user.click(screen.getByRole("menuitem", { name: /图片/ }));
    await user.upload(
      screen.getByLabelText("选择图片知识文件"),
      new File(["image"], "商品主图.png", { type: "image/png" }),
    );
    await user.type(screen.getByLabelText(/图片描述/), "晨间护肤套装商品主图");
    await user.click(screen.getByRole("button", { name: "确认提交" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("知识库存储空间已达上限");
    });
    expect(importKbImageDocMock).not.toHaveBeenCalled();
  });

  it("accepts image knowledge files with supported extensions when MIME type is empty", async () => {
    const user = userEvent.setup();

    renderWithRoute(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w",
      <KbDetailPage />,
      "/chat/ai-hosting/kb/:kbId",
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
      "/chat/ai-hosting/kb/:kbId",
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
      "/chat/ai-hosting/kb/:kbId",
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
      "/chat/ai-hosting/kb/:kbId",
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
      "/chat/ai-hosting/kb/:kbId",
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
      "/chat/ai-hosting/kb/:kbId",
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
      "/chat/ai-hosting/kb/:kbId",
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
  });

  it("renders the QA chunk detail page", async () => {
    renderWithRoute(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w/docs/knowledge-3",
      <KbDocDetailPage />,
      "/chat/ai-hosting/kb/:kbId/docs/:docId",
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
    expect(screen.getByRole("textbox", { name: "搜索问题" })).toBeInTheDocument();
    const addQaButton = screen.getByRole("button", { name: "添加问答" });
    expect(addQaButton).not.toHaveAttribute("aria-haspopup", "menu");
    expect(screen.queryByRole("button", { name: "添加切片" })).not.toBeInTheDocument();
    expect(screen.getByRole("table", { name: "切片列表" })).toBeInTheDocument();
    expect(screen.getByText("切片ID")).toBeInTheDocument();
    expect(screen.getByText("问题")).toBeInTheDocument();
    expect(screen.getByText("答案")).toBeInTheDocument();
    expect(screen.getByText("更新时间")).toBeInTheDocument();
    expect(screen.getByText("chunk-qa-1")).toBeInTheDocument();
    expect(screen.getByText("如何恢复出厂设置")).toBeInTheDocument();
    expect(screen.getByText("保修期多久")).toBeInTheDocument();
  });

  it("filters QA chunks by question title only", async () => {
    const user = userEvent.setup();

    renderWithRoute(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w/docs/knowledge-3",
      <KbDocDetailPage />,
      "/chat/ai-hosting/kb/:kbId/docs/:docId",
    );

    await screen.findByText("如何恢复出厂设置");
    await user.type(screen.getByRole("textbox", { name: "搜索问题" }), "物流");

    await waitFor(() => {
      expect(screen.getByText("如何查询物流")).toBeInTheDocument();
      expect(screen.queryByText("如何恢复出厂设置")).not.toBeInTheDocument();
      expect(screen.queryByText("保修期多久")).not.toBeInTheDocument();
    });
    expect(kbService.listKbDocChunks).toHaveBeenLastCalledWith("knowledge-3", {
      docType: "qa",
      page: 1,
      pageSize: 10,
      title: "物流",
    });
  });

  it("does not filter QA chunks by answer content", async () => {
    const user = userEvent.setup();

    renderWithRoute(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w/docs/knowledge-3",
      <KbDocDetailPage />,
      "/chat/ai-hosting/kb/:kbId/docs/:docId",
    );

    await screen.findByText("如何恢复出厂设置");
    await user.type(screen.getByRole("textbox", { name: "搜索问题" }), "订单详情页");

    await waitFor(() => {
      expect(screen.queryByText("如何查询物流")).not.toBeInTheDocument();
      expect(screen.getByText("暂无切片数据")).toBeInTheDocument();
    });
  });

  it("adds a QA chunk manually", async () => {
    const user = userEvent.setup();

    renderWithRoute(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w/docs/knowledge-3",
      <KbDocDetailPage />,
      "/chat/ai-hosting/kb/:kbId/docs/:docId",
    );

    await screen.findByRole("button", { name: "添加问答" });
    await user.click(screen.getByRole("button", { name: "添加问答" }));

    const dialog = screen.getByRole("dialog", { name: "添加问答" });
    await user.type(within(dialog).getByLabelText(/问题/), "支持 NFC 吗");
    await user.type(within(dialog).getByLabelText(/答案/), "支持，可在设置中开启");
    await user.click(within(dialog).getByRole("button", { name: "确定" }));

    expect(await screen.findByText("支持 NFC 吗")).toBeInTheDocument();
  });

  it("requires question when adding a QA chunk", async () => {
    const user = userEvent.setup();

    renderWithRoute(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w/docs/knowledge-3",
      <KbDocDetailPage />,
      "/chat/ai-hosting/kb/:kbId/docs/:docId",
    );

    await screen.findByRole("button", { name: "添加问答" });
    await user.click(screen.getByRole("button", { name: "添加问答" }));

    const dialog = screen.getByRole("dialog", { name: "添加问答" });
    await user.type(within(dialog).getByLabelText(/答案/), "支持，可在设置中开启");

    expect(within(dialog).getByRole("button", { name: "确定" })).toBeDisabled();
  });

  it("keeps the add QA chunk dialog open when submit fails", async () => {
    const user = userEvent.setup();
    createKbChunkMock.mockRejectedValueOnce(new Error("submit failed"));

    renderWithRoute(
        "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w/docs/knowledge-3",
        <KbDocDetailPage />,
        "/chat/ai-hosting/kb/:kbId/docs/:docId",
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
      expect(createKbChunkMock).toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledWith("submit failed");
  });

  it("edits a QA chunk on the chunk detail page", async () => {
    const user = userEvent.setup();

    renderWithRoute(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w/docs/knowledge-3",
      <KbDocDetailPage />,
      "/chat/ai-hosting/kb/:kbId/docs/:docId",
    );

    await screen.findByText("如何恢复出厂设置");
    await user.click(screen.getAllByRole("button", { name: "编辑" })[0]);

    const dialog = screen.getByRole("dialog", { name: "编辑切片" });
    const questionField = within(dialog).getByLabelText(/问题/);
    expect(questionField.tagName).toBe("TEXTAREA");
    expect(within(dialog).getByText(chunkVectorizationTip)).toBeInTheDocument();
    await user.clear(questionField);
    await user.type(questionField, "如何重置手机");
    await user.click(within(dialog).getByRole("button", { name: "保存" }));

    expect(await screen.findByText("如何重置手机")).toBeInTheDocument();
    expect(screen.queryByText("如何恢复出厂设置")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "编辑切片" })).not.toBeInTheDocument();
  });

  it("shows an error toast when editing a chunk fails", async () => {
    const user = userEvent.setup();
    updateKbChunkMock.mockRejectedValueOnce(new Error("保存失败"));

    renderWithRoute(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w/docs/knowledge-3",
      <KbDocDetailPage />,
      "/chat/ai-hosting/kb/:kbId/docs/:docId",
    );

    await screen.findByText("如何恢复出厂设置");
    await user.click(screen.getAllByRole("button", { name: "编辑" })[0]);

    const dialog = screen.getByRole("dialog", { name: "编辑切片" });
    await user.click(within(dialog).getByRole("button", { name: "保存" }));

    expect(dialog).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith("保存失败");
  });

  it("renders the document chunk detail page and adds a chunk", async () => {
    const user = userEvent.setup();

    renderWithRoute(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w/docs/knowledge-1",
      <KbDocDetailPage />,
      "/chat/ai-hosting/kb/:kbId/docs/:docId",
    );

    await screen.findByRole("heading", { level: 1, name: "产品说明大全" });
    expect(screen.getByRole("img", { name: "Word 文件" })).toBeInTheDocument();
    expect(screen.getByText("文件（.doc）")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "华为产品知识" })).toHaveAttribute(
      "href",
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w",
    );
    expect(screen.queryByText("文档 · 华为产品知识")).not.toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "切片列表" })).not.toBeInTheDocument();
    const chunkList = screen.getByRole("list", { name: "切片列表" });
    expect(screen.getByRole("textbox", { name: "搜索切片内容" })).toBeInTheDocument();
    expect(screen.queryByText("切片标题")).not.toBeInTheDocument();
    expect(within(chunkList).queryByText("ID chunk-doc-1")).not.toBeInTheDocument();
    const firstChunkCard = within(chunkList).getByText("ID volc-chunk-doc").closest("li");
    expect(firstChunkCard).not.toBeNull();
    expect(within(firstChunkCard as HTMLElement).getByText("#1")).toBeInTheDocument();
    expect(within(firstChunkCard as HTMLElement).getByText("第一章 产品介绍")).toBeInTheDocument();
    const multilineChunkText =
      "新建限时任务，任务有效期增加 勾选项【仅任务有效期内核销计入】\n1）如果勾选了，统计任务是否完成只会统计任务有效期内核销的物码数据\n2）如果未勾选，统计任务是否完成会统计历史累计核销物码的数据";
    const multilineChunkContent = screen.getByText((_, element) =>
      element?.getAttribute("data-slot") === "chunk-content-preview" &&
      element.textContent === multilineChunkText,
    );
    expect(multilineChunkContent).toHaveClass("line-clamp-3", "max-h-[72px]", "whitespace-pre-line");
    expect(within(firstChunkCard as HTMLElement).getByText("字符")).toBeInTheDocument();
    expect(within(firstChunkCard as HTMLElement).getByText(String(("第一章 产品介绍" + multilineChunkText).length))).toBeInTheDocument();
    expect(within(firstChunkCard as HTMLElement).getByText("更新于 2026-06-20 23:22:22")).toBeInTheDocument();
    expect(
      within(chunkList).getByRole("img", { name: "对该图片的解析文字，展示产品外观与配色信息" }),
    ).toHaveAttribute("src", "https://b5.bokr.com.cn/dist/word.png");
    expect(screen.getByRole("button", { name: "编辑 chunk-doc-1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "删除 chunk-doc-1" })).toBeInTheDocument();
    await user.click(multilineChunkContent);
    let dialog = screen.getByRole("dialog", { name: "编辑切片" });
    expect(within(dialog).getByText(chunkVectorizationTip)).toBeInTheDocument();
    const titleField = within(dialog).getByLabelText(/切片标题/);
    await user.clear(titleField);
    await user.clear(within(dialog).getByLabelText(/切片内容/));
    await user.type(within(dialog).getByLabelText(/切片内容/), "更新后的切片内容");
    await user.click(within(dialog).getByRole("button", { name: "保存" }));

    expect(updateKbChunkMock).toHaveBeenLastCalledWith("chunk-doc-1", {
      content: "更新后的切片内容",
      title: "",
    });
    expect(screen.queryByRole("dialog", { name: "编辑切片" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^编辑 chunk-doc-/ })).toHaveLength(3);

    const addChunkButton = screen.getByRole("button", { name: "添加切片" });
    await user.click(addChunkButton);
    dialog = screen.getByRole("dialog", { name: "添加切片" });
    expect(within(dialog).queryByText(chunkVectorizationTip)).not.toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/切片内容/), "原装充电器与数据线需单独购买");
    await user.click(within(dialog).getByRole("button", { name: "确定" }));

    expect(createKbChunkMock).toHaveBeenLastCalledWith({
      chunkType: "text",
      content: "原装充电器与数据线需单独购买",
      docId: "knowledge-1",
      title: "",
    });
    expect(await screen.findByText("原装充电器与数据线需单独购买")).toBeInTheDocument();
  });

  it("filters document chunks by content only", async () => {
    const user = userEvent.setup();

    renderWithRoute(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w/docs/knowledge-1",
      <KbDocDetailPage />,
      "/chat/ai-hosting/kb/:kbId/docs/:docId",
    );

    await screen.findByText("ID volc-chunk-doc");
    await user.type(screen.getByRole("textbox", { name: "搜索切片内容" }), "核销物码");

    await waitFor(() => {
      expect(screen.getByText("ID volc-chunk-doc")).toBeInTheDocument();
      expect(screen.getByText("#1")).toBeInTheDocument();
      expect(screen.queryByText("ID volc-chunk-warranty")).not.toBeInTheDocument();
      expect(screen.queryByText("#2")).not.toBeInTheDocument();
    });
    expect(kbService.listKbDocChunks).toHaveBeenLastCalledWith("knowledge-1", {
      content: "核销物码",
      docType: "document",
      page: 1,
      pageSize: 10,
    });

    await user.clear(screen.getByRole("textbox", { name: "搜索切片内容" }));
    await user.type(screen.getByRole("textbox", { name: "搜索切片内容" }), "第二章");

    await waitFor(() => {
      expect(screen.queryByText("ID volc-chunk-doc")).not.toBeInTheDocument();
      expect(screen.queryByText("ID volc-chunk-warranty")).not.toBeInTheDocument();
      expect(screen.getByText("暂无切片数据")).toBeInTheDocument();
    });
  });

  it("renders the image chunk detail page without add actions", async () => {
    renderWithRoute(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w/docs/knowledge-8",
      <KbDocDetailPage />,
      "/chat/ai-hosting/kb/:kbId/docs/:docId",
    );

    await screen.findByRole("heading", { level: 1, name: "产品宣传图" });
    expect(screen.getByRole("img", { name: "产品宣传图" })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("搜索切片 ID")).not.toBeInTheDocument();
    expect(screen.getByText("图片（.png）")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "华为产品知识" })).toHaveAttribute(
      "href",
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w",
    );
    expect(screen.queryByText("图片 · 华为产品知识")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "添加切片" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "添加问答" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "编辑" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "删除" })).not.toBeInTheDocument();
    const chunkListRegion = await screen.findByRole("region", { name: "切片列表" });
    expect(
      await within(chunkListRegion).findByText("Mate 系列旗舰机型外观与核心卖点展示"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "切片列表" })).not.toBeInTheDocument();
  });

  it("deletes a document chunk after confirmation", async () => {
    const user = userEvent.setup();

    renderWithRoute(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w/docs/knowledge-1",
      <KbDocDetailPage />,
      "/chat/ai-hosting/kb/:kbId/docs/:docId",
    );

    await screen.findByText("ID volc-chunk-doc");
    await user.click(screen.getByRole("button", { name: "删除 chunk-doc-1" }));
    const dialog = screen.getByRole("alertdialog", { name: "确定删除该切片吗" });
    const confirmDeleteButton = within(dialog).getByRole("button", { name: "删除" });
    expect(dialog).toBeInTheDocument();
    expect(confirmDeleteButton).toHaveClass("bg-destructive");
    await user.click(confirmDeleteButton);

    expect(screen.queryByText("ID volc-chunk-doc")).not.toBeInTheDocument();
    expect(screen.getByText("ID volc-chunk-warranty")).toBeInTheDocument();
    expect(screen.getByText("#2")).toBeInTheDocument();
    expect(screen.getByText("全国联保一年，支持官方售后网点检测与维修")).toBeInTheDocument();
  });
});

function createDeferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, reject, resolve };
}
