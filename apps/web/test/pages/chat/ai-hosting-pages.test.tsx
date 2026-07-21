import type { ReactElement } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentManagementPage } from "@/pages/chat/ai-hosting/agent-management-page";
import { AgentHostingSettingsPage } from "@/pages/chat/ai-hosting/agent-hosting-settings-page";
import { AgentOptimizationSuggestionsPage } from "@/pages/chat/ai-hosting/agent-optimization-suggestions-page";
import { AgentSettingsPage } from "@/pages/chat/ai-hosting/agent-settings-page";
import { AgentSubscriptionPage } from "@/pages/chat/ai-hosting/agent-subscription-page";
import { KbDetailPage } from "@/pages/chat/ai-hosting/kb-detail-page";
import { KbDocDetailPage } from "@/pages/chat/ai-hosting/kb-doc-detail-page";
import { KbListPage } from "@/pages/chat/ai-hosting/kb-list-page";
import { resetAiHostingQuotaCacheForTest } from "@/pages/chat/ai-hosting/ai-hosting-quota-store";
import { notifyAiHostingQuotaChanged } from "@/pages/chat/ai-hosting/ai-hosting-layout";
import { resetMockKbData } from "./kb-service-mock-data";
import * as agentService from "@/pages/chat/ai-hosting/agent-service";
import * as agentLearningService from "@/pages/chat/ai-hosting/api/agent-learning-service";
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
  deleteMockKbListItem,
  updateMockKbChunk,
  updateMockKbListItem,
  updateMockKbDocStatus,
} from "./kb-service-mock-data";

const readXlsxFileMock = vi.hoisted(() => vi.fn());
const importKbDocMock = vi.hoisted(() => vi.fn());
const importKbQaDocMock = vi.hoisted(() => vi.fn());
const createBlankKbDocMock = vi.hoisted(() => vi.fn());
const createBlankKbFaqDocMock = vi.hoisted(() => vi.fn());
const uploadKbImageMock = vi.hoisted(() => vi.fn());
const retryKbDocMock = vi.hoisted(() => vi.fn());
const createKbChunkMock = vi.hoisted(() => vi.fn());
const updateKbChunkMock = vi.hoisted(() => vi.fn());
const deleteKbChunkMock = vi.hoisted(() => vi.fn());
const kbAttachmentServiceMock = vi.hoisted(() => ({
  getKbAttachmentStatus: vi.fn(),
  listKbAttachments: vi.fn(),
}));
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
  updateAiHostingAgentAutoLearn: vi.fn(),
  updateAiHostingSettings: vi.fn(),
  updateAiHostingGroupSettings: vi.fn(),
  updateAiHostingAgent: vi.fn(),
}));
const agentLearningServiceMock = vi.hoisted(() => ({
  approveAgentLearningCandidate: vi.fn(),
  batchApproveAgentLearningCandidates: vi.fn(),
  batchRejectAgentLearningCandidates: vi.fn(),
  getAgentLearningCandidateSearchDetail: vi.fn(),
  listAgentLearningCandidates: vi.fn(),
  rejectAgentLearningCandidate: vi.fn(),
}));
const kbServiceMock = vi.hoisted(() => ({
  checkKbDelete: vi.fn(),
  createKb: vi.fn(),
  deleteKb: vi.fn(),
  getKb: vi.fn(),
  getKbDoc: vi.fn(),
  listKbDocChunks: vi.fn(),
  listKbDocs: vi.fn(),
  listKbs: vi.fn(),
  updateKb: vi.fn(),
}));

vi.mock("read-excel-file/browser", () => ({
  default: readXlsxFileMock,
}));
vi.mock("@/pages/chat/ai-hosting/agent-service", () => agentServiceMock);
vi.mock("@/pages/chat/ai-hosting/api/agent-learning-service", () => agentLearningServiceMock);
vi.mock("@/pages/chat/ai-hosting/api/kb-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/pages/chat/ai-hosting/api/kb-service")>();

  return {
    ...actual,
    ...kbServiceMock,
  };
});

vi.mock("@/pages/chat/ai-hosting/api/kb-attachment-service", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/pages/chat/ai-hosting/api/kb-attachment-service")
  >();

  return {
    ...actual,
    ...kbAttachmentServiceMock,
  };
});

vi.mock("@/pages/chat/ai-hosting/api/kb-doc-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/pages/chat/ai-hosting/api/kb-doc-service")>();

  return {
    ...actual,
    createBlankKbDoc: createBlankKbDocMock,
    createBlankKbFaqDoc: createBlankKbFaqDocMock,
    importKbDoc: importKbDocMock,
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
    autoLearnEnabled: false,
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
    pendingSuggestionCount: 0,
    updatedAt: 1_718_006_460_000,
  },
  {
    autoLearnEnabled: true,
    id: "302",
    kbList: [],
    model: {
      id: "11",
      label: "Doubao-2.0-lite",
      model: "doubao-2.0-lite",
      name: "Doubao-2.0-lite",
    },
    name: "售后小助理",
    pendingSuggestionCount: 6,
    updatedAt: 1_718_006_470_000,
  },
];

const mockLearningCandidates = [
  {
    answer:
      "您好，这款商品是否有货需要以当前小程序或商品链接页面显示为准。如果页面可正常下单，一般表示当前有库存；如果显示售罄或无法购买，说明暂时无货",
    confidence: 0.92,
    createdAt: 1_725_000_000_000,
    id: "1",
    question: "这个商品现在还有货吗？",
    rationale: "这是一段理由说明这是一段理由说明这是一段理由说明这是一段理由说明",
    searchResults: [
      { docId: "1001", docName: "敏感肌护理", docSuffix: "faq.xlsx", kbId: "1" },
      { docId: "1002", docName: "油皮清洁", docSuffix: "pdf", kbId: "1" },
    ],
    seat: {
      avatar: "https://example.com/seat.png",
      id: "seat-1",
      name: "客服小王",
    },
    status: "pending" as const,
    user: {
      avatar: "https://example.com/user.png",
      id: "user-1",
      name: "客户小李",
    },
  },
  {
    answer:
      "您好，这款商品是否有货需要以当前小程序或商品链接页面显示为准。如果页面可正常下单，一般表示当前有库存；如果显示售罄或无法购买，说明暂时无货",
    confidence: 0.76,
    createdAt: 1_725_000_100_000,
    id: "2",
    question: "这个商品现在还有货吗？",
    rationale: "这是一段理由说明这是一段理由说明这是一段理由说明这是一段理由说明",
    status: "pending" as const,
  },
];

const mockLearningCandidateSearchDetail = {
  items: [
    {
      chunkId: "1024",
      chunkTitle: "25+的油皮痘肌如果皮肤不敏感，有什么护肤产品推荐？",
      content: "25+的油皮痘肌如果皮肤不敏感，可以使用酸C循环套组",
      docId: "102",
      docName: "护肤Q&A文档",
      docSuffix: "pdf",
      docType: 2,
      kbId: "5",
      kbName: "护肤知识库",
      score: 0.5689,
      volcChunkId: "doc_id_272_102_20260717105032070-6",
    },
  ],
  pagination: {
    page: 1,
    pageSize: 20,
    total: 1,
    totalPages: 1,
  },
};

const mockAttachmentLearningCandidateSearchDetail = {
  items: [
    {
      chunkId: "2048",
      chunkTitle: "产品说明书",
      content: "安装与使用说明",
      docId: "90",
      docName: "附件库",
      docSuffix: "attachment",
      docType: 4,
      kbId: "16",
      kbName: "产品知识库",
      score: 0.81,
      volcChunkId: "doc_id_272_90_20260717105032070-6",
    },
  ],
  pagination: {
    page: 1,
    pageSize: 20,
    total: 1,
    totalPages: 1,
  },
};

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

const emptyGroupChat = {
  agentId: null,
  fullAutoAuth: false,
  replyMode: null,
  semiAutoAuth: false,
} as const;

const mockHostingSettings: AiHostingSettingsResponse = {
  accounts: [
    {
      agentId: null,
      avatarUrl: "",
      fullAutoAuth: false,
      groupChat: emptyGroupChat,
      id: "101",
      name: "小助理1",
      semiAutoAuth: false,
    },
    {
      agentId: "301",
      avatarUrl: "https://example.com/avatar-102.png",
      fullAutoAuth: true,
      groupChat: {
        agentId: "301",
        fullAutoAuth: true,
        replyMode: 1,
        semiAutoAuth: false,
      },
      id: "102",
      name: "小助理2",
      semiAutoAuth: true,
    },
    {
      agentId: "303",
      avatarUrl: "",
      fullAutoAuth: false,
      groupChat: {
        agentId: "303",
        fullAutoAuth: false,
        replyMode: null,
        semiAutoAuth: true,
      },
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
  fullAutoAuthAvailable: true,
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

function createFileWithSize(content: string, name: string, size: number, options?: FilePropertyBag) {
  const file = new File([content], name, options);
  Object.defineProperty(file, "size", {
    configurable: true,
    value: size,
  });
  return file;
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
    resetAiHostingQuotaCacheForTest();
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
    vi.mocked(agentService.updateAiHostingGroupSettings).mockResolvedValue({
      ...mockHostingSettings,
      accounts: mockHostingSettings.accounts.map((account) =>
        account.id === "102"
          ? {
              ...account,
              groupChat: {
                agentId: "301",
                fullAutoAuth: true,
                replyMode: 2,
                semiAutoAuth: true,
              },
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
    vi.mocked(agentService.updateAiHostingAgentAutoLearn).mockResolvedValue({
      autoLearnEnabled: true,
      pendingSuggestionCount: 0,
    });
    vi.mocked(agentLearningService.listAgentLearningCandidates).mockImplementation(
      async (_agentId, params) => {
        if (params.status === "adopted") {
          return {
            candidates: [
              {
                ...mockLearningCandidates[0],
                status: "adopted",
                targetDocId: "1001",
                targetEntryId: "501",
                targetKbId: "1",
              },
            ],
            pagination: {
              page: 1,
              pageSize: 10,
              total: 1,
            },
          };
        }

        return {
          candidates: mockLearningCandidates.map((candidate) => ({
            ...candidate,
            status: params.status,
          })),
          pagination: {
            page: 1,
            pageSize: 10,
            total: mockLearningCandidates.length,
          },
        };
      },
    );
    vi.mocked(agentLearningService.approveAgentLearningCandidate).mockResolvedValue({ ok: true });
    vi.mocked(agentLearningService.getAgentLearningCandidateSearchDetail).mockResolvedValue(
      mockLearningCandidateSearchDetail,
    );
    vi.mocked(agentLearningService.rejectAgentLearningCandidate).mockResolvedValue({ ok: true });
    vi.mocked(agentLearningService.batchApproveAgentLearningCandidates).mockResolvedValue({
      failDetails: [],
      successCount: 2,
    });
    vi.mocked(agentLearningService.batchRejectAgentLearningCandidates).mockResolvedValue({
      updatedCount: 2,
    });
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
    vi.mocked(kbService.updateKb).mockImplementation(async (kbId, payload) => {
      updateMockKbListItem(kbId, {
        description: payload.description ?? "",
        name: payload.name,
      });

      return {
        updated: true,
      };
    });
    vi.mocked(kbService.checkKbDelete).mockImplementation(async (kbId) => {
      const docs = await kbService.listKbDocs(kbId, { page: 1, pageSize: 1 });
      return {
        hasDocuments: docs.pagination.total > 0,
        linkedAgentCount: 0,
      };
    });
    vi.mocked(kbService.deleteKb).mockImplementation(async (kbId) => {
      deleteMockKbListItem(kbId);
      return {
        deleted: true,
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
      createMockKbDocChunksResponse(
        docId,
        params?.title ?? params?.content,
        params?.chunkId,
      ),
    );
    kbAttachmentServiceMock.getKbAttachmentStatus.mockResolvedValue({
      docId: "attachment-doc-1",
      initialized: true,
      syncStatus: 0,
    });
    kbAttachmentServiceMock.listKbAttachments.mockResolvedValue({
      attachments: [],
      pagination: { page: 1, pageSize: 10, total: 0 },
    });
    retryKbDocMock.mockImplementation(async (docId: string) => {
      updateMockKbDocStatus(docId, "queued");
      return { retried: true };
    });
    vi.stubGlobal(
      "Image",
      class {
        private readonly listeners = new Map<string, Set<() => void>>();

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
    createBlankKbDocMock.mockReset();
    createBlankKbDocMock.mockResolvedValue({ docId: "mock-blank-doc" });
    createBlankKbFaqDocMock.mockReset();
    createBlankKbFaqDocMock.mockResolvedValue({ docId: "mock-blank-faq" });
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
    const introGuide = screen.getByRole("region", { name: "Agent 使用引导" });
    expect(within(introGuide).getAllByRole("heading", { level: 2 })).toHaveLength(3);
    expect(within(introGuide).getAllByRole("img").map((image) => image.getAttribute("src"))).toEqual([
      "https://b5.bokr.com.cn/dist/ui/agent_f1.png",
      "https://b5.bokr.com.cn/dist/ui/agent_f2.png",
      "https://b5.bokr.com.cn/dist/ui/agent_f3.png",
    ]);
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
    expect(screen.getByRole("link", { name: "订阅" })).toHaveAttribute(
      "href",
      "/chat/ai-hosting/subscription",
    );
    expect(screen.getByRole("button", { name: "打开账号菜单" })).toHaveTextContent(
      "客服主管",
    );
    expect(screen.queryByRole("button", { name: "帮助手册" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "数据总览" })).not.toBeInTheDocument();
    expect(screen.queryByText("会话总数")).not.toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Agent 列表" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Agent 列表区块" })).toBeInTheDocument();
    expect(await screen.findByText("共 2 条")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "智能体用量" })).toHaveTextContent("Agent");
    expect(screen.getByRole("region", { name: "智能体用量" })).toHaveTextContent("2/20");
    expect(screen.getByRole("region", { name: "智能体用量" })).toHaveTextContent("知识库");
    expect(screen.getByRole("region", { name: "智能体用量" })).toHaveTextContent("3/20");
    expect(screen.getByRole("region", { name: "智能体用量" })).toHaveTextContent("文档容量");
    expect(screen.getByRole("region", { name: "智能体用量" })).toHaveTextContent("20MB/1GB");
    expect(screen.queryByRole("tab", { name: "应用范围" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "护肤小助理" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "售后小助理" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "护肤小助理头像" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "售后小助理头像" })).toBeInTheDocument();
    const doubaoIcons = screen.getAllByTitle("模型图标：Doubao-2.0-lite");

    expect(doubaoIcons).toHaveLength(2);
    expect(doubaoIcons[0].querySelector("img")).toHaveAttribute(
      "src",
      "https://b5.bokr.com.cn/dist/llm/doubao-color.svg",
    );
    expect(screen.getByText("商品咨询知识库")).toBeInTheDocument();
    expect(screen.getByText("活动政策知识库")).toBeInTheDocument();
    expect(screen.getByText("未关联")).toBeInTheDocument();
    expect(screen.getByText("未开启")).toBeInTheDocument();
    expect(screen.getByText("已开启")).toBeInTheDocument();
    expect(
      document.querySelector(
        'img[src="https://b5.bokr.com.cn/dist/ui/shield-lightning.svg"]',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "6 条提升建议" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /自主进化/ })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "添加 Agent" })).toBeInTheDocument();
    expect(agentService.listAiHostingAgents).toHaveBeenCalledWith({
      page: 1,
      pageSize: 9,
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
            { id: "2", name: "测试超长测试超长测试知识库" },
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

    const trigger = await screen.findByLabelText("查看 护肤小助理 的全部关联知识库");

    expect(trigger).toHaveTextContent("商品咨询知识库");
    expect(trigger).toHaveTextContent("测试超长测试超长测试知识库");
    expect(trigger).toHaveTextContent("活动政策知识库");
    expect(trigger).toHaveTextContent("直播话术知识库");
    expect(trigger).not.toHaveTextContent("等 4 个");
    expect(
      screen.getByRole("link", { name: "商品咨询知识库" }),
    ).toHaveAttribute("href", "/chat/ai-hosting/kb/1");
    expect(
      screen.getByRole("link", { name: "测试超长测试超长测试知识库" }),
    ).toHaveAttribute("href", "/chat/ai-hosting/kb/2");

    await user.hover(trigger);

    const popover = await screen.findByRole("dialog");
    expect(popover).toHaveTextContent("关联知识库 · 4");
    expect(popover).toHaveTextContent("商品咨询知识库");
    expect(popover).toHaveTextContent("测试超长测试超长测试知识库");
    expect(popover).toHaveTextContent("活动政策知识库");
    expect(popover).toHaveTextContent("直播话术知识库");
    expect(
      within(popover).getByRole("link", { name: "测试超长测试超长测试知识库" }),
    ).toHaveAttribute("href", "/chat/ai-hosting/kb/2");
    expect(
      within(popover).getByRole("link", { name: "直播话术知识库" }),
    ).toHaveAttribute("href", "/chat/ai-hosting/kb/4");
    expect(within(popover).getByTestId("agent-kb-popover-scroll")).toHaveClass("max-h-48");
    expect(within(popover).getAllByTitle("知识库图标")).toHaveLength(4);
    expect(
      within(popover)
        .getByTestId("agent-kb-popover-scroll")
        .querySelector("[data-slot='scroll-area-viewport']"),
    ).toHaveClass("[&>div]:!block", "[&>div]:!min-w-0", "[&>div]:!w-full");
    expect(
      within(popover).getByTitle("测试超长测试超长测试知识库"),
    ).toHaveAttribute("href", "/chat/ai-hosting/kb/2");
  });

  it("opens the AI self-learning dialog from an agent card", async () => {
    const user = userEvent.setup();

    renderWithRoute("/chat/ai-hosting/agents", <AgentManagementPage />);

    await user.click(
      await screen.findByRole("button", { name: "护肤小助理 自主进化" }),
    );

    const dialog = screen.getByRole("dialog", { name: "Agent 自主进化" });
    expect(within(dialog).getByRole("button", { name: "启用自主进化" })).toBeInTheDocument();
    expect(within(dialog).getByText("未开启")).toBeInTheDocument();
    expect(within(dialog).queryByRole("switch")).not.toBeInTheDocument();
    expect(dialog.querySelector("img")).toHaveAttribute(
      "src",
      "https://b5.bokr.com.cn/dist/ui/autonomic_learning_1.png",
    );
  });

  it("renders the static AI optimization suggestions page", async () => {
    const user = userEvent.setup();

    renderWithRoute(
      "/chat/ai-hosting/agents/301/optimization-suggestions",
      <AgentOptimizationSuggestionsPage />,
      "/chat/ai-hosting/agents/:agentId/optimization-suggestions",
    );

    expect(screen.getByRole("heading", { level: 1, name: "Agent 自主进化" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "返回 Agent 管理" })).toHaveAttribute(
      "href",
      "/chat/ai-hosting/agents",
    );
    expect(screen.getByRole("tab", { name: "待处理" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "智能过滤" })).toBeInTheDocument();
    expect(await screen.findAllByText("这个商品现在还有货吗？")).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "采纳" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "忽略" })).toHaveLength(2);
    expect(screen.getByText("置信度：极高")).toBeInTheDocument();
    expect(screen.getByText("置信度：高")).toBeInTheDocument();
    expect(screen.getByText("知识对比")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "知识对比详情" })).toBeInTheDocument();
    expect(
      document.querySelectorAll(
        'img[src="https://b5.bokr.com.cn/dist/ui/shield-lightning.svg"]',
      ),
    ).toHaveLength(2);
    expect(screen.getByText("敏感肌护理")).toBeInTheDocument();
    expect(screen.getByText("油皮清洁")).toBeInTheDocument();
    expect(screen.getByText("敏感肌护理").previousElementSibling).toHaveAttribute(
      "alt",
      "Excel 文件",
    );
    expect(screen.getByText("油皮清洁").previousElementSibling).toHaveAttribute(
      "alt",
      "PDF 文件",
    );
    expect(screen.queryByRole("button", { name: "批量入库" })).not.toBeInTheDocument();
    expect(agentLearningService.listAgentLearningCandidates).toHaveBeenCalledWith("301", {
      page: 1,
      pageSize: 10,
      status: "pending",
    });
    await user.hover(screen.getAllByAltText("客服小王")[0]);
    expect(await screen.findByRole("tooltip", { name: "客服小王" })).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "采纳" })[0]);

    const singleIngestDialog = screen.getByRole("dialog", { name: "采纳入库" });
    const knowledgeBaseCombobox = within(singleIngestDialog).getByRole("combobox", {
      name: /选择知识库/,
    });
    expect(knowledgeBaseCombobox).toHaveFocus();
    expect(
      within(singleIngestDialog).getByRole("button", { name: "刷新知识库列表" }),
    ).not.toHaveFocus();
    expect(within(singleIngestDialog).getByLabelText(/问题/)).toBeInTheDocument();
    expect(within(singleIngestDialog).getByLabelText(/答案/)).toBeInTheDocument();
    expect(within(singleIngestDialog).getByRole("heading", { name: "AI 评测" })).toBeInTheDocument();
    expect(
      singleIngestDialog.querySelector(
        'img[src="https://b5.bokr.com.cn/dist/ui/shield-lightning.svg"]',
      ),
    ).toBeInTheDocument();
    expect(within(singleIngestDialog).getByText(mockLearningCandidates[0].rationale)).toBeInTheDocument();
    expect(within(singleIngestDialog).getByText("置信度：极高")).toBeInTheDocument();
    expect(
      within(singleIngestDialog).getByRole("heading", { level: 3, name: "对比已有知识" }),
    ).toBeInTheDocument();
    expect(
      within(singleIngestDialog).getByRole("button", { name: "知识对比详情" }),
    ).toBeInTheDocument();
    expect(within(singleIngestDialog).getByText("敏感肌护理")).toBeInTheDocument();
    expect(within(singleIngestDialog).getByText("油皮清洁")).toBeInTheDocument();
    expect(
      within(singleIngestDialog).getByRole("heading", { name: "来源会话" }),
    ).toBeInTheDocument();
    expect(within(singleIngestDialog).queryByText("客服小王")).not.toBeInTheDocument();
    expect(within(singleIngestDialog).queryByText("客户小李")).not.toBeInTheDocument();
    expect(within(singleIngestDialog).getByAltText("客户小李")).toBeInTheDocument();
    await user.hover(within(singleIngestDialog).getByAltText("客服小王"));
    expect(await screen.findByRole("tooltip", { name: "客服小王" })).toBeInTheDocument();
    await user.click(within(singleIngestDialog).getByRole("button", { name: "取消" }));

    await user.click(screen.getByRole("button", { name: "批量操作" }));

    expect(screen.queryByRole("button", { name: "采纳" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "忽略" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "批量入库" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "批量忽略" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "退出操作" })).toBeInTheDocument();

    await user.click(screen.getAllByRole("checkbox")[0]);
    await user.click(screen.getByRole("button", { name: "批量入库" }));

    const batchIngestDialog = screen.getByRole("dialog", { name: "采纳入库" });
    expect(within(batchIngestDialog).getByRole("combobox", { name: /选择知识库/ })).toBeInTheDocument();
    expect(within(batchIngestDialog).queryByLabelText(/问题/)).not.toBeInTheDocument();
    expect(within(batchIngestDialog).queryByLabelText(/答案/)).not.toBeInTheDocument();
    expect(within(batchIngestDialog).getByText("已选择 1 条建议")).toBeInTheDocument();
    expect(
      within(batchIngestDialog).queryByRole("heading", { name: "来源会话" }),
    ).not.toBeInTheDocument();
    await user.click(within(batchIngestDialog).getByRole("button", { name: "取消" }));

    await user.click(screen.getByRole("button", { name: "批量忽略" }));

    expect(screen.getByRole("alertdialog", { name: "是否确认忽略?" })).toHaveTextContent(
      "已忽略的，后续也可前往已忽略列表中重新入库",
    );
    await user.click(screen.getByRole("button", { name: "确认" }));

    await user.click(screen.getByRole("tab", { name: "已采纳" }));

    expect(screen.queryByRole("button", { name: "批量操作" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "批量入库" })).not.toBeInTheDocument();
    const knowledgeChunkLink = await screen.findByRole("link", { name: "查看知识切片" });
    expect(knowledgeChunkLink).toHaveAttribute(
      "href",
      "/chat/ai-hosting/kb/1/docs/1001?entryId=501",
    );
    expect(knowledgeChunkLink).toHaveAttribute("target", "_blank");
    expect(knowledgeChunkLink).toHaveAttribute("rel", "noopener noreferrer");

    await user.click(screen.getByRole("tab", { name: "已忽略" }));

    expect(screen.getAllByRole("button", { name: "采纳" })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "批量操作" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "批量操作" }));

    expect(screen.getByRole("button", { name: "批量入库" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "批量忽略" })).not.toBeInTheDocument();
  });

  it("confirms before ignoring an optimization suggestion", async () => {
    const user = userEvent.setup();

    renderWithRoute(
      "/chat/ai-hosting/agents/301/optimization-suggestions",
      <AgentOptimizationSuggestionsPage />,
      "/chat/ai-hosting/agents/:agentId/optimization-suggestions",
    );

    await user.click((await screen.findAllByRole("button", { name: "忽略" }))[0]);

    expect(screen.getByRole("alertdialog", { name: "是否确认忽略?" })).toHaveTextContent(
      "已忽略的，后续也可前往已忽略列表中重新入库",
    );
  });

  it("maps learning confidence into the three display levels", async () => {
    vi.mocked(agentLearningService.listAgentLearningCandidates).mockResolvedValueOnce({
      candidates: [
        { ...mockLearningCandidates[0], confidence: 0.9, id: "confidence-very-high" },
        { ...mockLearningCandidates[0], confidence: 0.7, id: "confidence-high" },
        { ...mockLearningCandidates[0], confidence: 0.69, id: "confidence-medium" },
      ],
      pagination: { page: 1, pageSize: 10, total: 3 },
    });

    renderWithRoute(
      "/chat/ai-hosting/agents/301/optimization-suggestions",
      <AgentOptimizationSuggestionsPage />,
      "/chat/ai-hosting/agents/:agentId/optimization-suggestions",
    );

    expect(await screen.findByText("置信度：极高")).toBeInTheDocument();
    expect(screen.getByText("置信度：高")).toBeInTheDocument();
    expect(screen.getByText("置信度：中")).toBeInTheDocument();
  });

  it("loads knowledge match details from the candidate card and ingest dialog", async () => {
    const user = userEvent.setup();

    renderWithRoute(
      "/chat/ai-hosting/agents/301/optimization-suggestions",
      <AgentOptimizationSuggestionsPage />,
      "/chat/ai-hosting/agents/:agentId/optimization-suggestions",
    );

    const cardTrigger = await screen.findByRole("button", { name: "知识对比详情" });
    await user.click(cardTrigger);

    const searchDetailDialog = await screen.findByRole("dialog", { name: "对比已有知识" });
    expect(agentLearningService.getAgentLearningCandidateSearchDetail).toHaveBeenCalledWith(
      "301",
      "1",
    );
    expect(
      within(searchDetailDialog).getByRole("heading", {
        name: mockLearningCandidateSearchDetail.items[0].chunkTitle,
      }),
    ).toBeInTheDocument();
    expect(searchDetailDialog).toHaveTextContent(mockLearningCandidateSearchDetail.items[0].content);
    expect(searchDetailDialog).toHaveTextContent("护肤知识库");
    expect(searchDetailDialog).toHaveTextContent("护肤Q&A文档");
    expect(searchDetailDialog).toHaveTextContent("0.5689");
    expect(searchDetailDialog).toHaveTextContent("NO.1");
    expect(within(searchDetailDialog).getByRole("link", { name: "查看切片" })).toHaveAttribute(
      "href",
      "/chat/ai-hosting/kb/5/docs/102?chunkId=20260717105032070-6",
    );
    expect(within(searchDetailDialog).getByRole("link", { name: "查看切片" })).toHaveAttribute(
      "target",
      "_blank",
    );

    await user.click(within(searchDetailDialog).getByRole("button", { name: "关闭" }));
    expect(screen.queryByRole("dialog", { name: "对比已有知识" })).not.toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "采纳" })[0]);
    const ingestDialog = screen.getByRole("dialog", { name: "采纳入库" });
    await user.click(
      within(ingestDialog).getByRole("button", { name: "知识对比详情" }),
    );

    expect(await screen.findByRole("dialog", { name: "对比已有知识" })).toBeInTheDocument();
    expect(agentLearningService.getAgentLearningCandidateSearchDetail).toHaveBeenLastCalledWith(
      "301",
      "1",
    );
  });

  it("routes attachment search details to the attachment library", async () => {
    const user = userEvent.setup();
    vi.mocked(agentLearningService.getAgentLearningCandidateSearchDetail).mockResolvedValueOnce(
      mockAttachmentLearningCandidateSearchDetail,
    );

    renderWithRoute(
      "/chat/ai-hosting/agents/301/optimization-suggestions",
      <AgentOptimizationSuggestionsPage />,
      "/chat/ai-hosting/agents/:agentId/optimization-suggestions",
    );

    await user.click(await screen.findByRole("button", { name: "知识对比详情" }));

    expect(
      within(await screen.findByRole("dialog", { name: "对比已有知识" })).getByRole("link", {
        name: "查看切片",
      }),
    ).toHaveAttribute(
      "href",
      "/chat/ai-hosting/kb/16?chunkId=20260717105032070-6&docId=90&tab=attachments",
    );
  });

  it("disables unfinished knowledge items in the knowledge picker", async () => {
    const user = userEvent.setup();

    renderWithRoute(
      "/chat/ai-hosting/agents/301/optimization-suggestions",
      <AgentOptimizationSuggestionsPage />,
      "/chat/ai-hosting/agents/:agentId/optimization-suggestions",
    );

    await user.click((await screen.findAllByRole("button", { name: "采纳" }))[0]);

    const dialog = screen.getByRole("dialog", { name: "采纳入库" });
    await user.click(within(dialog).getByRole("combobox", { name: /选择知识库/ }));
    await user.click(screen.getByRole("option", { name: "华为产品知识" }));

    await user.click(within(dialog).getByRole("button", { name: "选择知识" }));

    const picker = screen.getByRole("dialog", { name: "选择知识" });
    const completedRadio = await within(picker).findByRole("radio", {
      name: "选择 产品说明大全.doc",
    });
    const parsingRadio = within(picker).getByRole("radio", {
      name: "选择 图片解析大全.png",
    });
    const queuedRadio = within(picker).getByRole("radio", {
      name: "选择 售前场景话术.pdf",
    });
    const failedRadio = within(picker).getByRole("radio", {
      name: "选择 文本知识集合.txt",
    });

    expect(completedRadio).toBeEnabled();
    expect(parsingRadio).toBeDisabled();
    expect(queuedRadio).toBeDisabled();
    expect(failedRadio).toBeDisabled();
  });

  it("shows an empty state when the selected knowledge base has no knowledge", async () => {
    const user = userEvent.setup();
    vi.mocked(kbService.listKbDocs).mockResolvedValue({
      docs: [],
      pagination: {
        page: 1,
        pageSize: 10,
        total: 0,
      },
    });

    renderWithRoute(
      "/chat/ai-hosting/agents/301/optimization-suggestions",
      <AgentOptimizationSuggestionsPage />,
      "/chat/ai-hosting/agents/:agentId/optimization-suggestions",
    );

    await user.click((await screen.findAllByRole("button", { name: "采纳" }))[0]);

    const dialog = screen.getByRole("dialog", { name: "采纳入库" });
    await user.click(within(dialog).getByRole("combobox", { name: /选择知识库/ }));
    await user.click(screen.getByRole("option", { name: "华为产品知识" }));

    await user.click(within(dialog).getByRole("button", { name: "选择知识" }));

    const picker = screen.getByRole("dialog", { name: "选择知识" });
    expect(await within(picker).findByText("暂无数据")).toBeInTheDocument();
    expect(within(picker).queryByRole("radio")).not.toBeInTheDocument();
  });

  it("keeps the ingest context while adding and refreshing knowledge from the picker", async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);

    renderWithRoute(
      "/chat/ai-hosting/agents/301/optimization-suggestions",
      <AgentOptimizationSuggestionsPage />,
      "/chat/ai-hosting/agents/:agentId/optimization-suggestions",
    );

    await user.click((await screen.findAllByRole("button", { name: "采纳" }))[0]);

    const dialog = screen.getByRole("dialog", { name: "采纳入库" });
    const questionInput = within(dialog).getByLabelText(/问题/);
    const answerInput = within(dialog).getByLabelText(/答案/);

    await user.clear(questionInput);
    await user.type(questionInput, "编辑后的问题");
    await user.clear(answerInput);
    await user.type(answerInput, "编辑后的答案");

    await user.click(within(dialog).getByRole("combobox", { name: /选择知识库/ }));
    await user.click(screen.getByRole("option", { name: "华为产品知识" }));

    expect(kbService.listKbDocs).not.toHaveBeenCalled();
    expect(within(dialog).queryByRole("button", { name: "添加知识" })).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "刷新知识列表" }),
    ).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "选择知识" }));
    const picker = screen.getByRole("dialog", { name: "选择知识" });
    await waitFor(() => expect(kbService.listKbDocs).toHaveBeenCalledTimes(1));

    await user.click(within(picker).getByRole("button", { name: "添加知识" }));

    expect(openSpy).toHaveBeenCalledWith(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w?addKnowledge=qa:new",
      "_blank",
      "noopener,noreferrer",
    );
    expect(screen.getByRole("dialog", { name: "选择知识" })).toBeInTheDocument();
    expect(questionInput).toHaveValue("编辑后的问题");
    expect(answerInput).toHaveValue("编辑后的答案");
    expect(screen.queryByRole("option", { name: "添加知识" })).not.toBeInTheDocument();

    await user.click(within(picker).getByRole("button", { name: "刷新知识列表" }));
    await waitFor(() => expect(kbService.listKbDocs).toHaveBeenCalledTimes(2));

    await user.click(within(picker).getByRole("button", { name: "关闭" }));
    expect(screen.getByRole("dialog", { name: "采纳入库" })).toBeInTheDocument();
    expect(questionInput).toHaveValue("编辑后的问题");
    expect(answerInput).toHaveValue("编辑后的答案");

    await user.click(within(dialog).getByRole("button", { name: "刷新知识库列表" }));
    await waitFor(() => {
      expect(kbService.listKbs).toHaveBeenCalledTimes(2);
    });

    expect(within(dialog).getByRole("combobox", { name: /选择知识库/ })).toHaveTextContent(
      "华为产品知识",
    );
    openSpy.mockRestore();
  });

  it("searches and pages knowledge before selecting a row", async () => {
    const user = userEvent.setup();
    vi.mocked(kbService.listKbDocs).mockImplementation(async (_kbId, params) => {
      const page = params?.page ?? 1;
      const query = params?.query;
      const showTarget = page === 2 || query === "第 101 条";

      return {
        docs: showTarget
          ? [
              {
                briefSummary: "",
                createdAt: "2026-07-18T00:00:00.000Z",
                docId: "101",
                docSize: 0,
                docSuffix: "faq.xlsx",
                docType: "qa",
                hasDocSummary: false,
                kbId: "W7zU2fWkVSp65OTAjDd3-w",
                name: "第 101 条知识",
                sliceCount: 1,
                status: "completed",
                updatedAt: "2026-07-18T00:00:00.000Z",
              },
            ]
          : [],
        pagination: {
          page,
          pageSize: 10,
          total: query ? 1 : 101,
        },
      };
    });

    renderWithRoute(
      "/chat/ai-hosting/agents/301/optimization-suggestions",
      <AgentOptimizationSuggestionsPage />,
      "/chat/ai-hosting/agents/:agentId/optimization-suggestions",
    );

    await user.click((await screen.findAllByRole("button", { name: "采纳" }))[0]);
    const dialog = screen.getByRole("dialog", { name: "采纳入库" });
    await user.click(within(dialog).getByRole("combobox", { name: /选择知识库/ }));
    await user.click(screen.getByRole("option", { name: "华为产品知识" }));
    await user.click(within(dialog).getByRole("button", { name: "选择知识" }));

    await waitFor(() => {
      expect(kbService.listKbDocs).toHaveBeenCalledWith("W7zU2fWkVSp65OTAjDd3-w", {
        page: 1,
        pageSize: 10,
        query: undefined,
      });
    });

    let picker = screen.getByRole("dialog", { name: "选择知识" });
    await user.click(within(picker).getByRole("button", { name: "下一页" }));
    await waitFor(() => {
      expect(kbService.listKbDocs).toHaveBeenCalledWith("W7zU2fWkVSp65OTAjDd3-w", {
        page: 2,
        pageSize: 10,
        query: undefined,
      });
    });

    await user.click(
      await within(picker).findByRole("row", { name: /第 101 条知识\.faq\.xlsx/ }),
    );
    expect(screen.queryByRole("dialog", { name: "选择知识" })).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "选择知识" })).toHaveTextContent(
      "第 101 条知识.faq.xlsx",
    );

    await user.click(within(dialog).getByRole("button", { name: "选择知识" }));
    picker = screen.getByRole("dialog", { name: "选择知识" });
    await user.type(within(picker).getByRole("textbox", { name: "搜索知识" }), "第 101 条");
    await waitFor(() => {
      expect(kbService.listKbDocs).toHaveBeenCalledWith("W7zU2fWkVSp65OTAjDd3-w", {
        page: 1,
        pageSize: 10,
        query: "第 101 条",
      });
    });
    await user.click(
      await within(picker).findByRole("row", { name: /第 101 条知识\.faq\.xlsx/ }),
    );

    expect(screen.queryByRole("dialog", { name: "选择知识" })).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "选择知识" })).toHaveTextContent(
      "第 101 条知识.faq.xlsx",
    );
    await user.click(within(dialog).getByRole("button", { name: "确认入库" }));
    await waitFor(() => {
      expect(agentLearningService.approveAgentLearningCandidate).toHaveBeenCalledWith(
        "301",
        "1",
        expect.objectContaining({
          targetDocId: "101",
          targetKbId: "W7zU2fWkVSp65OTAjDd3-w",
        }),
      );
    });
  });

  it("renders optimization suggestions without write actions for non-manage roles", async () => {
    mockSession("viewer");

    renderWithRoute(
      "/chat/ai-hosting/agents/301/optimization-suggestions",
      <AgentOptimizationSuggestionsPage />,
      "/chat/ai-hosting/agents/:agentId/optimization-suggestions",
    );

    expect(await screen.findAllByText("这个商品现在还有货吗？")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "采纳" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "忽略" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "批量操作" })).not.toBeInTheDocument();
    expect(agentLearningService.approveAgentLearningCandidate).not.toHaveBeenCalled();
    expect(agentLearningService.rejectAgentLearningCandidate).not.toHaveBeenCalled();
  });

  it("shows pending suggestion count and enabled self-learning on agent cards", async () => {
    renderWithRoute("/chat/ai-hosting/agents", <AgentManagementPage />);

    expect(await screen.findByText("未开启")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "6 条提升建议" }),
    ).toHaveAttribute("href", "/chat/ai-hosting/agents/302/optimization-suggestions");
  });

  it("links enabled self-learning to suggestions when no suggestions are pending", async () => {
    vi.mocked(agentService.listAiHostingAgents).mockResolvedValue({
      agents: [
        {
          ...mockAgents[1],
          pendingSuggestionCount: 0,
        },
      ],
      pagination: {
        page: 1,
        pageSize: 10,
        total: 1,
      },
    });

    renderWithRoute("/chat/ai-hosting/agents", <AgentManagementPage />);

    expect(await screen.findByRole("link", { name: "已开启" })).toHaveAttribute(
      "href",
      "/chat/ai-hosting/agents/302/optimization-suggestions",
    );
    expect(
      screen.getByRole("link", { name: "已开启" }).querySelector(
        'img[src="https://b5.bokr.com.cn/dist/ui/shield-lightning.svg"]',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/条提升建议/)).not.toBeInTheDocument();
  });

  it("enables AI self-learning directly from the agent dialog", async () => {
    const user = userEvent.setup();

    renderWithRoute("/chat/ai-hosting/agents", <AgentManagementPage />);

    await user.click(
      await screen.findByRole("button", { name: "护肤小助理 自主进化" }),
    );

    const dialog = screen.getByRole("dialog", { name: "Agent 自主进化" });
    await user.click(within(dialog).getByRole("button", { name: "启用自主进化" }));

    await waitFor(() => {
      expect(agentService.updateAiHostingAgentAutoLearn).toHaveBeenCalledWith("301", {
        enabled: true,
      });
    });
    expect(agentService.listAiHostingAgents).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: "已开启" })).toHaveAttribute(
      "href",
      "/chat/ai-hosting/agents/301/optimization-suggestions",
    );
    expect(screen.queryByText("开启自主进化将同时开启会话洞察功能")).not.toBeInTheDocument();
  });

  it("disables AI self-learning directly from the agent dialog", async () => {
    const user = userEvent.setup();
    vi.mocked(agentService.updateAiHostingAgentAutoLearn).mockResolvedValueOnce({
      autoLearnEnabled: false,
      pendingSuggestionCount: 0,
    });

    renderWithRoute("/chat/ai-hosting/agents", <AgentManagementPage />);

    await user.click(
      await screen.findByRole("button", { name: "售后小助理 自主进化" }),
    );

    const dialog = screen.getByRole("dialog", { name: "Agent 自主进化" });
    expect(within(dialog).getByText("已开启")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "关闭自主进化" }));

    await waitFor(() => {
      expect(agentService.updateAiHostingAgentAutoLearn).toHaveBeenCalledWith("302", {
        enabled: false,
      });
    });
    expect(
      within(screen.getByRole("listitem", { name: "售后小助理" })).getByText("未开启"),
    ).toBeInTheDocument();
  });

  it("renders the static subscription page without loading usage data", async () => {
    const user = userEvent.setup();

    renderWithRoute("/chat/ai-hosting/subscription", <AgentSubscriptionPage />);

    expect(screen.getByRole("heading", { level: 1, name: "订阅" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "订阅" })).toHaveAttribute(
      "href",
      "/chat/ai-hosting/subscription",
    );
    expect(screen.getByRole("region", { name: "当前套餐" })).toHaveTextContent("当前计划：基础版");
    expect(screen.getByRole("region", { name: "当前套餐" })).toHaveTextContent(
      "内测期内无限额，内测结束后套餐限额将进行更新",
    );
    expect(screen.queryByRole("button", { name: "原有套餐说明" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "自动续费" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "管理套餐" })).toBeDisabled();
    expect(screen.getByText("总积分")).toBeInTheDocument();
    expect(screen.getByText("剩余 100%")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "总积分使用进度" })).toBeInTheDocument();
    expect(screen.getAllByText("当前为内测期，暂不计费")).toHaveLength(2);
    expect(screen.queryByText("订阅积分")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "增购积分" })).not.toBeInTheDocument();

    expect(screen.getByRole("heading", { level: 2, name: "全部用量" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "全部项目" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("table", { name: "用量消耗列表" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "名称" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "项目类型" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "最近使用时间" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "累计积分消耗" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "操作" })).toBeInTheDocument();
    expect(screen.getAllByText("当前为内测期，暂不计费")).toHaveLength(2);

    await user.click(screen.getByRole("tab", { name: "Agent" }));

    expect(screen.getByRole("tab", { name: "Agent" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByText("当前为内测期，暂不计费")).toHaveLength(2);
    expect(agentService.listAiHostingAgents).not.toHaveBeenCalled();
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

  it("reuses the sidebar quota when navigating between AI hosting pages", async () => {
    const router = createMemoryRouter(
      [
        {
          path: "/chat/ai-hosting/agents",
          element: <AgentManagementPage />,
        },
        {
          path: "/chat/ai-hosting/kb",
          element: <KbListPage />,
        },
      ],
      { initialEntries: ["/chat/ai-hosting/agents"] },
    );

    render(<RouterProvider router={router} />);

    expect(await screen.findByText("共 2 条")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "智能体用量" })).toHaveTextContent("20MB/1GB");

    await router.navigate("/chat/ai-hosting/kb");

    expect(await screen.findByRole("heading", { level: 1, name: "知识库" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "智能体用量" })).toHaveTextContent("20MB/1GB");
    expect(agentService.getAiHostingQuota).toHaveBeenCalledTimes(1);
  });

  it("does not retry the initial sidebar quota on every AI hosting page after a load failure", async () => {
    vi.mocked(agentService.getAiHostingQuota).mockRejectedValueOnce(new Error("quota failed"));
    const router = createMemoryRouter(
      [
        {
          path: "/chat/ai-hosting/agents",
          element: <AgentManagementPage />,
        },
        {
          path: "/chat/ai-hosting/kb",
          element: <KbListPage />,
        },
      ],
      { initialEntries: ["/chat/ai-hosting/agents"] },
    );

    render(<RouterProvider router={router} />);

    expect(await screen.findByText("共 2 条")).toBeInTheDocument();
    await waitFor(() => {
      expect(agentService.getAiHostingQuota).toHaveBeenCalledTimes(1);
    });

    await router.navigate("/chat/ai-hosting/kb");

    expect(await screen.findByRole("heading", { level: 1, name: "知识库" })).toBeInTheDocument();
    expect(agentService.getAiHostingQuota).toHaveBeenCalledTimes(1);
  });

  it("clears and reloads the sidebar quota when the account owner changes without unmounting", async () => {
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
          used: 7,
        },
        kbDocs: {
          limit: 1024 * 1024 * 1024,
          used: 64 * 1024 * 1024,
        },
        kbs: {
          limit: 20,
          used: 9,
        },
      });

    renderWithRoute("/chat/ai-hosting/agents", <AgentManagementPage />);

    expect(await screen.findByText("共 2 条")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "智能体用量" })).toHaveTextContent("20MB/1GB");

    act(() => {
      useAuthStore.getState().setSession({
        accountType: "sub",
        displayName: "客服二号",
        permissions: ["chat.access", "chat.send", "chat.takeover"],
        role: "admin",
        subUserId: "202",
        uid: 1,
      });
    });

    expect(screen.getByRole("region", { name: "智能体用量" })).not.toHaveTextContent("20MB/1GB");

    await waitFor(() => {
      expect(agentService.getAiHostingQuota).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByRole("region", { name: "智能体用量" })).toHaveTextContent("7/20");
    expect(screen.getByRole("region", { name: "智能体用量" })).toHaveTextContent("9/20");
    expect(screen.getByRole("region", { name: "智能体用量" })).toHaveTextContent("64MB/1GB");
  });

  it("ignores stale sidebar quota responses after the account owner changes", async () => {
    let resolveFirstQuota: (
      quota: Awaited<ReturnType<typeof agentService.getAiHostingQuota>>,
    ) => void = () => undefined;
    let resolveSecondQuota: (
      quota: Awaited<ReturnType<typeof agentService.getAiHostingQuota>>,
    ) => void = () => undefined;

    vi.mocked(agentService.getAiHostingQuota)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirstQuota = resolve;
        }),
      )
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveSecondQuota = resolve;
        }),
      );

    renderWithRoute("/chat/ai-hosting/agents", <AgentManagementPage />);

    expect(await screen.findByText("共 2 条")).toBeInTheDocument();

    act(() => {
      useAuthStore.getState().setSession({
        accountType: "sub",
        displayName: "客服二号",
        permissions: ["chat.access", "chat.send", "chat.takeover"],
        role: "admin",
        subUserId: "202",
        uid: 1,
      });
    });

    await waitFor(() => {
      expect(agentService.getAiHostingQuota).toHaveBeenCalledTimes(2);
    });

    await act(async () => {
      resolveSecondQuota({
        agents: {
          limit: 20,
          used: 7,
        },
        kbDocs: {
          limit: 1024 * 1024 * 1024,
          used: 64 * 1024 * 1024,
        },
        kbs: {
          limit: 20,
          used: 9,
        },
      });
    });

    expect(screen.getByRole("region", { name: "智能体用量" })).toHaveTextContent("7/20");
    expect(screen.getByRole("region", { name: "智能体用量" })).toHaveTextContent("64MB/1GB");

    await act(async () => {
      resolveFirstQuota({
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
      });
    });

    expect(screen.getByRole("region", { name: "智能体用量" })).toHaveTextContent("7/20");
    expect(screen.getByRole("region", { name: "智能体用量" })).toHaveTextContent("64MB/1GB");
    expect(screen.getByRole("region", { name: "智能体用量" })).not.toHaveTextContent("20MB/1GB");
  });

  it("ignores out-of-order force quota refreshes for the same account owner", async () => {
    let resolveFirstRefresh: (
      quota: Awaited<ReturnType<typeof agentService.getAiHostingQuota>>,
    ) => void = () => undefined;
    let resolveSecondRefresh: (
      quota: Awaited<ReturnType<typeof agentService.getAiHostingQuota>>,
    ) => void = () => undefined;

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
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirstRefresh = resolve;
        }),
      )
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveSecondRefresh = resolve;
        }),
      );

    renderWithRoute("/chat/ai-hosting/agents", <AgentManagementPage />);

    expect(await screen.findByText("共 2 条")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "智能体用量" })).toHaveTextContent("20MB/1GB");

    act(() => {
      notifyAiHostingQuotaChanged();
      notifyAiHostingQuotaChanged();
    });

    await waitFor(() => {
      expect(agentService.getAiHostingQuota).toHaveBeenCalledTimes(3);
    });

    await act(async () => {
      resolveSecondRefresh({
        agents: {
          limit: 20,
          used: 5,
        },
        kbDocs: {
          limit: 1024 * 1024 * 1024,
          used: 50 * 1024 * 1024,
        },
        kbs: {
          limit: 20,
          used: 6,
        },
      });
    });

    expect(screen.getByRole("region", { name: "智能体用量" })).toHaveTextContent("5/20");
    expect(screen.getByRole("region", { name: "智能体用量" })).toHaveTextContent("50MB/1GB");

    await act(async () => {
      resolveFirstRefresh({
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
      });
    });

    expect(screen.getByRole("region", { name: "智能体用量" })).toHaveTextContent("5/20");
    expect(screen.getByRole("region", { name: "智能体用量" })).toHaveTextContent("50MB/1GB");
    expect(screen.getByRole("region", { name: "智能体用量" })).not.toHaveTextContent("20MB/1GB");
  });

  it("keeps the sidebar quota when a quota refresh event fails", async () => {
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
      .mockRejectedValueOnce(new Error("quota failed"));

    renderWithRoute("/chat/ai-hosting/agents", <AgentManagementPage />);

    expect(await screen.findByText("共 2 条")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "智能体用量" })).toHaveTextContent("2/20");
    expect(screen.getByRole("region", { name: "智能体用量" })).toHaveTextContent("20MB/1GB");

    act(() => {
      notifyAiHostingQuotaChanged();
    });

    await waitFor(() => {
      expect(agentService.getAiHostingQuota).toHaveBeenCalledTimes(2);
    });

    expect(screen.getByRole("region", { name: "智能体用量" })).toHaveTextContent("2/20");
    expect(screen.getByRole("region", { name: "智能体用量" })).toHaveTextContent("20MB/1GB");
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

  it("shows an agent card list loading state", async () => {
    vi.mocked(agentService.listAiHostingAgents).mockReturnValueOnce(
      new Promise(() => undefined),
    );

    renderWithRoute("/chat/ai-hosting/agents", <AgentManagementPage />);

    expect(screen.getByRole("status", { name: "正在加载" })).toBeInTheDocument();
  });

  it("shows agent list load failures in a toast instead of the page", async () => {
    vi.mocked(agentService.listAiHostingAgents).mockRejectedValueOnce(
      new Error("timeout of 15000ms exceeded"),
    );

    renderWithRoute("/chat/ai-hosting/agents", <AgentManagementPage />);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Agent 列表加载失败，请稍后重试");
    });
    expect(screen.queryByText("timeout of 15000ms exceeded")).not.toBeInTheDocument();
  });

  it("blocks the agent editor after an initial load failure and retries in place", async () => {
    const user = userEvent.setup();
    vi.mocked(agentService.getAiHostingAgent).mockRejectedValueOnce(
      new Error("timeout of 15000ms exceeded"),
    );

    renderWithRoute(
      "/chat/ai-hosting/agents/301",
      <AgentSettingsPage />,
      "/chat/ai-hosting/agents/:agentId",
    );

    const loadFailureDialog = await screen.findByRole("alertdialog", {
      name: "Agent 设置加载失败",
    });

    expect(screen.queryByRole("button", { name: "保存" })).not.toBeInTheDocument();
    expect(screen.getByText("保存", { selector: "button" })).toBeDisabled();
    expect(
      within(loadFailureDialog).getByRole("button", { name: "返回 Agent 管理" }),
    ).toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalledWith("Agent 设置加载失败，请稍后重试");

    await user.click(within(loadFailureDialog).getByRole("button", { name: "刷新重试" }));

    await waitFor(() => {
      expect(agentService.getAiHostingAgent).toHaveBeenCalledTimes(2);
    });
    expect(
      await screen.findByRole("heading", { level: 1, name: mockAgentDetail.name }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("alertdialog", { name: "Agent 设置加载失败" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存" })).toBeEnabled();
  });

  it("returns to agent management from the initial load failure dialog", async () => {
    const user = userEvent.setup();
    vi.mocked(agentService.getAiHostingAgent).mockRejectedValueOnce(
      new Error("timeout of 15000ms exceeded"),
    );

    const { router } = renderWithRoute(
      "/chat/ai-hosting/agents/301",
      <AgentSettingsPage />,
      "/chat/ai-hosting/agents/:agentId",
    );

    const loadFailureDialog = await screen.findByRole("alertdialog", {
      name: "Agent 设置加载失败",
    });
    await user.click(
      within(loadFailureDialog).getByRole("button", { name: "返回 Agent 管理" }),
    );

    expect(router.state.location.pathname).toBe("/chat/ai-hosting/agents");
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
        pageSize: 9,
        query: "售后",
      });
    });
  });

  it("renders agent management as read-only for non-manage roles", async () => {
    const user = userEvent.setup();
    mockSession("operator");

    renderWithRoute("/chat/ai-hosting/agents", <AgentManagementPage />);

    expect(await screen.findByRole("heading", { level: 1, name: "Agent 管理" })).toBeInTheDocument();
    expect(screen.getByText("当前账号仅可查看 Agent，管理操作需管理员权限")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "添加 Agent" })).not.toBeInTheDocument();
    const moreActions = screen.getAllByRole("button", { name: /更多操作/ });
    await user.click(moreActions[0]);
    expect(screen.getByRole("menuitem", { name: "查看" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "删除" })).not.toBeInTheDocument();
  });

  it("removes agents from the management page after confirmation", async () => {
    const user = userEvent.setup();

    renderWithRoute("/chat/ai-hosting/agents", <AgentManagementPage />);

    await screen.findByRole("link", { name: "护肤小助理" });
    await user.click(screen.getAllByRole("button", { name: /更多操作/ })[0]);
    await user.click(screen.getByRole("menuitem", { name: "删除" }));

    expect(screen.getByRole("alertdialog", { name: "确认删除 Agent？" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "确认删除" }));

    await waitFor(() => {
      expect(agentService.removeAiHostingAgent).toHaveBeenCalledWith("301");
    });
  });

  it("shows a delete failure dialog when an agent is referenced by hosting settings", async () => {
    const user = userEvent.setup();
    vi.mocked(agentService.removeAiHostingAgent).mockRejectedValueOnce(
      {
        code: "AGENT_IN_USE",
        message: "Agent 已被托管设置引用，不能删除",
        status: 400,
      },
    );

    renderWithRoute("/chat/ai-hosting/agents", <AgentManagementPage />);

    await screen.findByRole("link", { name: "护肤小助理" });
    await user.click(screen.getAllByRole("button", { name: /更多操作/ })[0]);
    await user.click(screen.getByRole("menuitem", { name: "删除" }));
    await user.click(screen.getByRole("button", { name: "确认删除" }));

    expect(
      await screen.findByRole("alertdialog", { name: "删除 Agent 失败" }),
    ).toHaveTextContent("Agent 已被托管设置引用，不能删除");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
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
    expect(screen.getAllByRole("columnheader")).toHaveLength(5);
    expect(screen.getByRole("columnheader", { name: "全选账号" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "账号" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "单聊托管" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "群聊托管" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "操作" })).toBeInTheDocument();
    expect(screen.getByText("小助理1")).toBeInTheDocument();
    expect(screen.getByText("小助理2")).toBeInTheDocument();
    expect(screen.getByText("小助理3")).toBeInTheDocument();
    expect(screen.getByAltText("小助理2头像")).toHaveAttribute(
      "src",
      "https://example.com/avatar-102.png",
    );
    const hostedAgentNames = screen.getAllByText("护肤小助理");

    expect(hostedAgentNames).toHaveLength(2);
    hostedAgentNames.forEach((name) => {
      expect(name).toHaveAttribute("title", "护肤小助理");
    });
    expect(screen.getAllByText("未发布小助理")).toHaveLength(2);
    expect(screen.getAllByRole("img", { name: "护肤小助理头像" })).toHaveLength(2);
    expect(screen.getAllByRole("img", { name: "未发布小助理头像" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: /打开 .* 托管设置菜单/ })).toHaveLength(3);
  });

  it("opens the group chat settings dialog from row action", async () => {
    const user = userEvent.setup();

    renderWithRoute("/chat/ai-hosting/hosting-settings", <AgentHostingSettingsPage />);

    await screen.findByRole("heading", { level: 1, name: "托管设置" });
    await user.click(screen.getByRole("button", { name: "打开 小助理2 托管设置菜单" }));
    await user.click(screen.getByRole("menuitem", { name: "群聊设置" }));

    const dialog = screen.getByRole("dialog", { name: "群聊设置" });

    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText("小助理2")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("关联Agent")).toBeInTheDocument();
    expect(within(dialog).getByRole("switch", { name: "允许开启 AI回复" })).toBeInTheDocument();
    expect(within(dialog).getByRole("group", { name: "回复规则" })).toBeInTheDocument();

    await user.click(within(dialog).getByRole("switch", { name: "允许开启 AI回复" }));

    expect(within(dialog).queryByRole("group", { name: "回复规则" })).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "保存设置" })).toBeInTheDocument();
  });

  it("saves group chat settings from the dialog", async () => {
    const user = userEvent.setup();

    renderWithRoute("/chat/ai-hosting/hosting-settings", <AgentHostingSettingsPage />);

    await screen.findByRole("heading", { level: 1, name: "托管设置" });
    await user.click(screen.getByRole("button", { name: "打开 小助理2 托管设置菜单" }));
    await user.click(screen.getByRole("menuitem", { name: "群聊设置" }));

    const dialog = screen.getByRole("dialog", { name: "群聊设置" });

    await user.click(within(dialog).getByRole("switch", { name: "允许话术推荐" }));
    await user.click(within(dialog).getByText("回复时@客户"));
    await user.click(within(dialog).getByRole("button", { name: "保存设置" }));

    await waitFor(() => {
      expect(agentService.updateAiHostingGroupSettings).toHaveBeenCalledWith({
        agentId: "301",
        fullAutoAuth: true,
        replyMode: 2,
        semiAutoAuth: true,
        userSeatIds: ["102"],
      });
    });
    expect(screen.queryByRole("dialog", { name: "群聊设置" })).not.toBeInTheDocument();
  });

  it("keeps the hosting settings table header visible while loading", async () => {
    vi.mocked(agentService.listAiHostingSettings).mockReturnValueOnce(
      new Promise(() => undefined),
    );

    renderWithRoute("/chat/ai-hosting/hosting-settings", <AgentHostingSettingsPage />);

    expect(screen.getByRole("table", { name: "托管设置列表" })).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader")).toHaveLength(5);
    expect(screen.getByRole("columnheader", { name: "全选账号" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "账号" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "单聊托管" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "群聊托管" })).toBeInTheDocument();
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
    await user.click(screen.getByRole("button", { name: "打开 小助理2 托管设置菜单" }));
    await user.click(screen.getByRole("menuitem", { name: "单聊设置" }));

    const dialog = screen.getByRole("dialog", { name: "单聊设置" });

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
    await user.click(screen.getByRole("button", { name: "批量设置" }));
    await user.click(screen.getByRole("menuitem", { name: "单聊设置" }));

    const dialog = screen.getByRole("dialog", { name: "单聊批量设置" });

    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveTextContent("小助理2");
    expect(dialog).toHaveTextContent("小助理3");
  });

  it("saves application scope settings from the dialog", async () => {
    const user = userEvent.setup();

    renderWithRoute("/chat/ai-hosting/hosting-settings", <AgentHostingSettingsPage />);

    await screen.findByRole("heading", { level: 1, name: "托管设置" });
    await user.click(screen.getByRole("button", { name: "打开 小助理1 托管设置菜单" }));
    await user.click(screen.getByRole("menuitem", { name: "单聊设置" }));
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
    expect(screen.queryByRole("dialog", { name: "单聊设置" })).not.toBeInTheDocument();
    expect(screen.getAllByText("护肤小助理")).toHaveLength(3);
  });

  it("blocks enabling full-auto auth when it is unavailable but still allows disabling enabled accounts", async () => {
    const user = userEvent.setup();
    vi.mocked(agentService.listAiHostingSettings).mockResolvedValueOnce({
      ...mockHostingSettings,
      fullAutoAuthAvailable: false,
    });

    renderWithRoute("/chat/ai-hosting/hosting-settings", <AgentHostingSettingsPage />);

    await screen.findByRole("heading", { level: 1, name: "托管设置" });
    await user.click(screen.getByRole("button", { name: "打开 小助理1 托管设置菜单" }));
    await user.click(screen.getByRole("menuitem", { name: "单聊设置" }));

    const disabledSwitch = screen.getByRole("switch", { name: "允许开启 AI 回复" });

    expect(disabledSwitch).toBeDisabled();
    await user.hover(disabledSwitch);
    expect(await screen.findAllByText("该功能内测中，如需开通请联系客服")).not.toHaveLength(0);
    await user.click(disabledSwitch);
    expect(disabledSwitch).not.toBeChecked();

    await user.click(screen.getByRole("button", { name: "取消" }));
    await user.click(screen.getByRole("button", { name: "打开 小助理2 托管设置菜单" }));
    await user.click(screen.getByRole("menuitem", { name: "单聊设置" }));

    const enabledDialog = screen.getByRole("dialog", { name: "单聊设置" });
    const enabledSwitch = within(enabledDialog).getByRole("switch", { name: "允许开启 AI 回复" });

    expect(enabledSwitch).toBeEnabled();
    expect(enabledSwitch).toBeChecked();
  });

  it("keeps save errors inside the hosting settings dialog", async () => {
    const user = userEvent.setup();
    vi.mocked(agentService.updateAiHostingSettings).mockRejectedValueOnce(
      new Error("保存失败，请稍后重试"),
    );

    renderWithRoute("/chat/ai-hosting/hosting-settings", <AgentHostingSettingsPage />);

    await screen.findByRole("heading", { level: 1, name: "托管设置" });
    await user.click(screen.getByRole("button", { name: "打开 小助理1 托管设置菜单" }));
    await user.click(screen.getByRole("menuitem", { name: "单聊设置" }));
    await user.click(screen.getByRole("combobox", { name: "关联 Agent" }));
    await user.click(screen.getByRole("option", { name: "护肤小助理" }));
    await user.click(screen.getByRole("button", { name: "保存设置" }));

    const dialog = screen.getByRole("dialog", { name: "单聊设置" });

    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByRole("alert")).toHaveTextContent("保存失败，请稍后重试");
  });

  it("disables hosting settings submit while saving", async () => {
    const user = userEvent.setup();
    const saveRequest = new Promise<AiHostingSettingsResponse>(() => undefined);
    vi.mocked(agentService.updateAiHostingSettings).mockReturnValueOnce(saveRequest);

    renderWithRoute("/chat/ai-hosting/hosting-settings", <AgentHostingSettingsPage />);

    await screen.findByRole("heading", { level: 1, name: "托管设置" });
    await user.click(screen.getByRole("button", { name: "打开 小助理1 托管设置菜单" }));
    await user.click(screen.getByRole("menuitem", { name: "单聊设置" }));
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
    expect(screen.queryByRole("button", { name: "智能生成" })).not.toBeInTheDocument();
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

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("发布成功");
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

  it("keeps the preview chat title generic on the agent detail page", async () => {
    renderWithRoute("/chat/ai-hosting/agents/301", <AgentSettingsPage />, "/chat/ai-hosting/agents/:agentId");

    await screen.findByRole("heading", { level: 1, name: "护肤小助理" });

    const previewPanel = screen.getByRole("region", { name: "Agent 模拟测试" });

    expect(within(previewPanel).getByRole("heading", { level: 2, name: "模拟测试" })).toBeInTheDocument();
    expect(within(previewPanel).queryByRole("heading", { level: 2, name: "护肤小助理" })).not.toBeInTheDocument();
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
    expect(toast.success).toHaveBeenCalledWith("保存成功");

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

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("发布成功");
    });
    expect(toast.success).toHaveBeenCalledTimes(2);
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

  it("shows save failures in an operation dialog instead of the page alert", async () => {
    const user = userEvent.setup();

    vi.mocked(agentService.updateAiHostingAgent).mockRejectedValueOnce({
      code: "INVALID_AGENT_MODEL",
      message: "请选择有效的大模型",
      status: 400,
    });

    renderWithRoute("/chat/ai-hosting/agents/301", <AgentSettingsPage />, "/chat/ai-hosting/agents/:agentId");

    await screen.findByDisplayValue("护肤小助理");
    await user.clear(screen.getByLabelText("角色描述"));
    await user.type(screen.getByLabelText("角色描述"), "你是资深护肤顾问");
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(
      await screen.findByRole("alertdialog", { name: "保存 Agent 失败" }),
    ).toHaveTextContent("请选择有效的大模型");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows publish failures in an operation dialog instead of the page alert", async () => {
    const user = userEvent.setup();

    vi.mocked(agentService.publishAiHostingAgent).mockRejectedValueOnce({
      code: "AGENT_UNPUBLISHED",
      message: "Agent 未发布",
      status: 400,
    });

    renderWithRoute("/chat/ai-hosting/agents/301", <AgentSettingsPage />, "/chat/ai-hosting/agents/:agentId");

    await screen.findByDisplayValue("护肤小助理");
    await user.clear(screen.getByLabelText("角色描述"));
    await user.type(screen.getByLabelText("角色描述"), "你是资深护肤顾问");
    await user.click(screen.getByRole("button", { name: "发布正式版" }));
    await user.click(screen.getByRole("button", { name: "发布" }));

    expect(
      await screen.findByRole("alertdialog", { name: "发布 Agent 失败" }),
    ).toHaveTextContent("Agent 未发布");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows rename failures in an operation dialog instead of the page alert", async () => {
    const user = userEvent.setup();

    vi.mocked(agentService.renameAiHostingAgent).mockRejectedValueOnce({
      code: "INVALID_AGENT_NAME",
      message: "Agent 名称已存在",
      status: 400,
    });

    renderWithRoute("/chat/ai-hosting/agents/301", <AgentSettingsPage />, "/chat/ai-hosting/agents/:agentId");

    await screen.findByRole("heading", { level: 1, name: "护肤小助理" });
    await user.click(screen.getByRole("button", { name: "编辑 Agent 名称" }));

    const dialog = screen.getByRole("dialog", { name: "编辑 Agent 名称" });

    await user.clear(within(dialog).getByLabelText("Agent 名称"));
    await user.type(within(dialog).getByLabelText("Agent 名称"), "护肤专家");
    await user.click(within(dialog).getByRole("button", { name: "保存" }));

    expect(
      await screen.findByRole("alertdialog", { name: "保存 Agent 名称失败" }),
    ).toHaveTextContent("Agent 名称已存在");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows restore failures in an operation dialog instead of the page alert", async () => {
    const user = userEvent.setup();

    vi.mocked(agentService.restoreAiHostingAgent).mockRejectedValueOnce({
      code: "AGENT_HISTORY_EMPTY",
      message: "暂无正式版内容",
      status: 400,
    });

    renderWithRoute("/chat/ai-hosting/agents/301", <AgentSettingsPage />, "/chat/ai-hosting/agents/:agentId");

    expect(await screen.findByText(/有尚未发布的修改，你也可以/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "还原为正式版" }));
    await user.click(screen.getByRole("button", { name: "还原" }));

    expect(
      await screen.findByRole("alertdialog", { name: "还原正式版失败" }),
    ).toHaveTextContent("暂无正式版内容");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
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

  it("shows conditional logic knowledge base load failures in a toast", async () => {
    const user = userEvent.setup();
    vi.mocked(kbService.listKbs).mockRejectedValueOnce(
      new Error("timeout of 15000ms exceeded"),
    );

    renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsPage />);

    await screen.findByRole("heading", { level: 1, name: "创建 Agent" });
    await user.click(screen.getByRole("button", { name: "添加关联知识库" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("知识库加载失败，请稍后重试");
    });
    expect(screen.queryByRole("listbox", { name: "选择知识库" })).not.toBeInTheDocument();
    expect(screen.queryByText("timeout of 15000ms exceeded")).not.toBeInTheDocument();
  });

  it("keeps long conditional logic knowledge base names inside the fixed picker width", async () => {
    const user = userEvent.setup();
    const longKnowledgeBaseName = "测试超长测试超长测试超长测试超长测试超长测试超长";

    vi.mocked(kbService.listKbs).mockResolvedValue({
      kbs: [
        {
          createdAt: "2026-06-20T08:00:00.000Z",
          description: "",
          kbId: "kb-long-name",
          name: longKnowledgeBaseName,
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

    const listbox = await screen.findByRole("listbox", { name: "选择知识库" });
    const option = within(listbox).getByRole("option", {
      name: longKnowledgeBaseName,
    });
    const optionName = within(option).getByText(longKnowledgeBaseName);

    expect(listbox.querySelector("[data-slot='scroll-area-viewport']")?.parentElement)
      .toHaveClass(
        "w-full",
        "min-w-0",
        "max-w-full",
        "[&_[data-slot=scroll-area-viewport]>div]:!block",
        "[&_[data-slot=scroll-area-viewport]>div]:w-full",
        "[&_[data-slot=scroll-area-viewport]>div]:min-w-0",
        "[&_[data-slot=scroll-area-viewport]>div]:max-w-full",
      );
    expect(option).toHaveClass("min-w-0", "max-w-full", "overflow-hidden");
    expect(optionName).toHaveClass("min-w-0", "truncate");
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
    const introGuide = screen.getByRole("region", { name: "知识库使用引导" });
    expect(within(introGuide).getByText("第 1 步")).toBeInTheDocument();
    expect(within(introGuide).getByText("创建知识库")).toBeInTheDocument();
    expect(within(introGuide).getByText("第 2 步")).toBeInTheDocument();
    expect(within(introGuide).getByText("上传文档")).toBeInTheDocument();
    expect(within(introGuide).getByText("第 3 步")).toBeInTheDocument();
    expect(within(introGuide).getByText("Agent 集成")).toBeInTheDocument();
    expect(within(introGuide).getByAltText("创建知识库示意图")).toHaveAttribute(
      "src",
      "https://b5.bokr.com.cn/dist/ui/kb_f1.png",
    );
    expect(within(introGuide).getByAltText("上传文档示意图")).toHaveAttribute(
      "src",
      "https://b5.bokr.com.cn/dist/ui/kb_f2.png",
    );
    expect(within(introGuide).getByAltText("Agent 集成示意图")).toHaveAttribute(
      "src",
      "https://b5.bokr.com.cn/dist/ui/kb_f3.png",
    );
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
    expect(screen.getByRole("button", { name: "编辑 华为产品知识" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "删除 华为产品知识" })).toBeInTheDocument();
  });

  it("shows knowledge base list load failures in a toast", async () => {
    vi.mocked(kbService.listKbs).mockRejectedValueOnce(
      new Error("timeout of 15000ms exceeded"),
    );

    renderWithRoute("/chat/ai-hosting/kb", <KbListPage />);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("知识库列表加载失败，请稍后重试");
    });
    expect(screen.queryByText("timeout of 15000ms exceeded")).not.toBeInTheDocument();
  });

  it("blocks deleting a knowledge base linked to agents", async () => {
    const user = userEvent.setup();
    vi.mocked(kbService.checkKbDelete).mockResolvedValueOnce({
      hasDocuments: false,
      linkedAgentCount: 8,
    });

    renderWithRoute("/chat/ai-hosting/kb", <KbListPage />);

    await screen.findByRole("heading", { level: 1, name: "知识库" });
    await user.click(screen.getByRole("button", { name: "删除 华为产品知识" }));

    expect(
      await screen.findByText("当前知识库已关联8个Agent，不支持删除"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("检测到知识库中存在内容，是否确认要删除。删除后，知识内容和附件也将一并删除"),
    ).not.toBeInTheDocument();
    expect(kbService.deleteKb).not.toHaveBeenCalled();
  });

  it("requires typing the knowledge base name before deleting a kb with documents", async () => {
    const user = userEvent.setup();
    vi.mocked(kbService.checkKbDelete).mockResolvedValueOnce({
      hasDocuments: true,
      linkedAgentCount: 0,
    });

    renderWithRoute("/chat/ai-hosting/kb", <KbListPage />);

    await screen.findByRole("heading", { level: 1, name: "知识库" });
    await user.click(screen.getByRole("button", { name: "删除 华为产品知识" }));

    expect(
      await screen.findByText(
        "检测到知识库中存在内容，是否确认要删除。删除后，知识内容和附件也将一并删除",
      ),
    ).toBeInTheDocument();

    const deleteButton = screen.getByRole("button", { name: "删除" });
    expect(deleteButton).toBeDisabled();

    await user.type(
      screen.getByRole("textbox", { name: "输入知识库名称确认删除" }),
      "华为产品知识",
    );

    expect(deleteButton).toBeEnabled();
    await user.click(deleteButton);

    await waitFor(() => {
      expect(kbService.deleteKb).toHaveBeenCalledWith("W7zU2fWkVSp65OTAjDd3-w");
    });
  });

  it("requires typing the knowledge base name before deleting an empty kb", async () => {
    const user = userEvent.setup();
    vi.mocked(kbService.checkKbDelete).mockResolvedValueOnce({
      hasDocuments: false,
      linkedAgentCount: 0,
    });

    renderWithRoute("/chat/ai-hosting/kb", <KbListPage />);

    await screen.findByRole("heading", { level: 1, name: "知识库" });
    await user.click(screen.getByRole("button", { name: "删除 华为产品知识" }));

    expect(await screen.findByText("是否确认删除？")).toBeInTheDocument();
    expect(
      screen.queryByText(
        "检测到知识库中存在内容，是否确认要删除。删除后，知识内容和附件也将一并删除",
      ),
    ).not.toBeInTheDocument();

    const deleteButton = screen.getByRole("button", { name: "删除" });
    expect(deleteButton).toBeDisabled();

    await user.type(
      screen.getByRole("textbox", { name: "输入知识库名称确认删除" }),
      "华为产品知识",
    );

    expect(deleteButton).toBeEnabled();
    await user.click(deleteButton);

    await waitFor(() => {
      expect(kbService.deleteKb).toHaveBeenCalledWith("W7zU2fWkVSp65OTAjDd3-w");
    });
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
    expect(screen.queryByRole("columnheader", { name: "类型" })).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "文件大小" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "产品说明大全.doc" })).toBeInTheDocument();
    expect(screen.getByText("12MB")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "产品说明大全.doc" }));
    expect(router.state.location.pathname).toBe(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w/docs/knowledge-1",
    );
    expect(screen.queryByRole("button", { name: "文本知识集合.txt" })).not.toBeInTheDocument();
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
    expect(screen.queryByText("文件（.doc）")).not.toBeInTheDocument();
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

  it("shows knowledge list load failures in a toast", async () => {
    vi.mocked(kbService.listKbDocs).mockRejectedValueOnce(
      new Error("timeout of 15000ms exceeded"),
    );

    renderWithRoute(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w",
      <KbDetailPage />,
      "/chat/ai-hosting/kb/:kbId",
    );

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("知识列表加载失败，请稍后重试");
    });
    expect(screen.queryByText("timeout of 15000ms exceeded")).not.toBeInTheDocument();
  });

  it("shows knowledge base detail load failures in a toast instead of not found", async () => {
    vi.mocked(kbService.getKb).mockRejectedValueOnce({
      code: "ECONNABORTED",
      message: "timeout of 15000ms exceeded",
    });

    renderWithRoute(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w",
      <KbDetailPage />,
      "/chat/ai-hosting/kb/:kbId",
    );

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("知识库加载失败，请稍后重试");
    });
    expect(screen.queryByRole("heading", { name: "未找到知识库" })).not.toBeInTheDocument();
    expect(screen.queryByText("timeout of 15000ms exceeded")).not.toBeInTheDocument();
  });

  it("persists the knowledge and attachment views in the URL history", async () => {
    const user = userEvent.setup();
    const { router } = renderWithRoute(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w?tab=attachments&attachmentType=file",
      <KbDetailPage />,
      "/chat/ai-hosting/kb/:kbId/*",
    );

    expect(await screen.findByRole("tab", { name: "文件" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(router.state.location.search).toBe("?tab=attachments&attachmentType=file");
    expect(kbAttachmentServiceMock.listKbAttachments).toHaveBeenCalledWith(
      "W7zU2fWkVSp65OTAjDd3-w",
      expect.objectContaining({ attachmentType: 2 }),
    );

    await user.click(screen.getByRole("tab", { name: "链接" }));
    expect(router.state.location.search).toBe("?tab=attachments&attachmentType=link");
    expect(screen.getByRole("tab", { name: "链接" })).toHaveAttribute("aria-selected", "true");

    await user.click(screen.getByRole("tab", { name: "小程序" }));
    expect(router.state.location.search).toBe("?tab=attachments&attachmentType=miniProgram");

    await act(async () => {
      await router.navigate(-1);
    });
    expect(router.state.location.search).toBe("?tab=attachments&attachmentType=link");
    expect(screen.getByRole("tab", { name: "链接" })).toHaveAttribute("aria-selected", "true");

    await user.click(screen.getByRole("tab", { name: "知识" }));
    expect(router.state.location.search).toBe("");
    expect(screen.getByRole("tab", { name: "知识" })).toHaveAttribute("data-state", "active");
  });

  it("writes the default attachment view to the URL when switching from knowledge", async () => {
    const user = userEvent.setup();
    const { router } = renderWithRoute(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w",
      <KbDetailPage />,
      "/chat/ai-hosting/kb/:kbId/*",
    );

    await screen.findByRole("heading", { level: 1, name: "华为产品知识" });
    await user.click(screen.getByRole("tab", { name: "附件" }));

    expect(router.state.location.search).toBe("?tab=attachments&attachmentType=image");
    expect(await screen.findByRole("tab", { name: "图片" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("loads an attachment deep link and resolves its attachment type", async () => {
    const user = userEvent.setup();
    const { router } = renderWithRoute(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w?tab=attachments&docId=90&chunkId=20260717105032070-6",
      <KbDetailPage />,
      "/chat/ai-hosting/kb/:kbId/*",
    );
    kbAttachmentServiceMock.listKbAttachments.mockResolvedValueOnce({
      attachments: [
        {
          attachmentContent: {
            content: {
              fileName: "产品说明书.pdf",
              fileUrl: "https://example.com/manual.pdf",
            },
            materialCollectionId: "1",
            msgInfoId: "1",
            type: "file",
          },
          attachmentType: 2,
          chunkId: "503",
          createdAt: "2026-07-20 12:00:00",
          description: "安装与使用说明",
          materialCollectionId: "1",
          title: "产品说明书.pdf",
          updatedAt: "2026-07-20 12:00:00",
        },
      ],
      pagination: { page: 1, pageSize: 10, total: 1 },
    });

    expect(await screen.findByText("产品说明书.pdf")).toBeInTheDocument();
    expect(kbAttachmentServiceMock.listKbAttachments).toHaveBeenCalledWith(
      "W7zU2fWkVSp65OTAjDd3-w",
      {
        attachmentType: undefined,
        chunkId: "20260717105032070-6",
        docId: "90",
        page: 1,
        pageSize: 10,
        query: undefined,
      },
    );
    await waitFor(() => {
      expect(router.state.location.search).toBe(
        "?tab=attachments&docId=90&chunkId=20260717105032070-6&attachmentType=file",
      );
      expect(screen.getByRole("tab", { name: "文件" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    });

    expect(screen.getByText("切片 ID：20260717105032070-6")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "搜索附件" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "清除切片 ID 筛选" }));

    await waitFor(() => {
      expect(router.state.location.search).toBe("?tab=attachments&attachmentType=file");
      expect(screen.getByRole("textbox", { name: "搜索附件" })).toBeInTheDocument();
      expect(kbAttachmentServiceMock.listKbAttachments).toHaveBeenLastCalledWith(
        "W7zU2fWkVSp65OTAjDd3-w",
        {
          attachmentType: 2,
          chunkId: undefined,
          docId: "attachment-doc-1",
          page: 1,
          pageSize: 10,
          query: undefined,
        },
      );
    });
  });

  it("normalizes invalid knowledge base view parameters", async () => {
    const { router } = renderWithRoute(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w?tab=attachments&attachmentType=unknown&source=test",
      <KbDetailPage />,
      "/chat/ai-hosting/kb/:kbId/*",
    );

    expect(await screen.findByRole("tab", { name: "图片" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await waitFor(() => {
      expect(router.state.location.search).toBe(
        "?tab=attachments&attachmentType=image&source=test",
      );
    });
  });

  it("shows document summaries from the knowledge name hover card", async () => {
    const user = userEvent.setup();
    const { router } = renderWithRoute(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w",
      <KbDetailPage />,
      "/chat/ai-hosting/kb/:kbId/*",
    );

    const knowledgeName = await screen.findByRole("button", { name: "产品说明大全.doc" });
    expect(knowledgeName).not.toHaveAttribute("title");

    await user.hover(knowledgeName);

    const summaryPopover = await screen.findByRole("dialog", {
      name: "产品说明大全.doc 摘要",
    });
    expect(summaryPopover).toHaveTextContent("覆盖产品规格、售后政策和常见咨询场景");
    expect(within(summaryPopover).getByRole("button", { name: "全文摘要" })).toBeInTheDocument();
    expect(within(summaryPopover).getByRole("button", { name: "切片详情" })).toBeInTheDocument();

    await user.click(within(summaryPopover).getByRole("button", { name: "全文摘要" }));

    const summarySheet = await screen.findByRole("dialog", { name: "全文摘要" });
    expect(kbService.getKbDoc).toHaveBeenCalledWith("knowledge-1");
    expect(summarySheet).toHaveTextContent("产品说明大全.doc");
    expect(within(summarySheet).getByRole("heading", { level: 2, name: "文档概览" })).toBeInTheDocument();
    expect(within(summarySheet).getByRole("heading", { level: 3, name: "核心内容" })).toBeInTheDocument();
    expect(within(summarySheet).getByText("产品参数")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w",
    );

    await user.keyboard("{Escape}");
    const knowledgeNameWithoutSummary = screen.getByText("常见问题解答.faq");
    expect(knowledgeNameWithoutSummary).toHaveAttribute("title", "常见问题解答.faq");
    await user.hover(knowledgeNameWithoutSummary);
    expect(screen.queryByRole("dialog", { name: "常见问题解答.faq 摘要" })).not.toBeInTheDocument();

    await user.hover(knowledgeName);
    await user.click(
      within(await screen.findByRole("dialog", { name: "产品说明大全.doc 摘要" })).getByRole("button", {
        name: "切片详情",
      }),
    );
    expect(router.state.location.pathname).toBe(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w/docs/knowledge-1",
    );
  });

  it("shows document summary load failures in a toast", async () => {
    const user = userEvent.setup();
    vi.mocked(kbService.getKbDoc).mockRejectedValueOnce(
      new Error("timeout of 15000ms exceeded"),
    );

    renderWithRoute(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w",
      <KbDetailPage />,
      "/chat/ai-hosting/kb/:kbId",
    );

    const knowledgeName = await screen.findByRole("button", { name: "产品说明大全.doc" });
    await user.hover(knowledgeName);
    await user.click(
      within(await screen.findByRole("dialog", { name: "产品说明大全.doc 摘要" })).getByRole(
        "button",
        { name: "全文摘要" },
      ),
    );

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("摘要加载失败，请稍后重试");
    });
    expect(screen.queryByRole("dialog", { name: "全文摘要" })).not.toBeInTheDocument();
    expect(screen.queryByText("timeout of 15000ms exceeded")).not.toBeInTheDocument();
  });

  it("retries a failed knowledge record and refreshes the list status", async () => {
    const user = userEvent.setup();

    renderWithRoute(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w",
      <KbDetailPage />,
      "/chat/ai-hosting/kb/:kbId",
    );

    await screen.findByText("文本知识集合.txt");
    await user.click(screen.getByRole("button", { name: "重试 文本知识集合" }));

    await waitFor(() => {
      expect(retryKbDocMock).toHaveBeenCalledWith("knowledge-4");
      expect(toast.success).toHaveBeenCalledWith("已提交重试");
    });
    expect(screen.queryByRole("button", { name: "重试 文本知识集合" })).not.toBeInTheDocument();
    expect(screen.getAllByText("排队中")).toHaveLength(2);
  });

  it("allows creating zero-byte blank knowledge when storage quota is reached", async () => {
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
    await user.click(screen.getByRole("button", { name: /^新建/ }));
    await user.type(await screen.findByLabelText(/知识名称/), "额度已满时的新问答");
    await user.click(screen.getByRole("button", { name: "确认创建" }));

    await waitFor(() => {
      expect(createBlankKbFaqDocMock).toHaveBeenCalledWith({
        kbId: "W7zU2fWkVSp65OTAjDd3-w",
        name: "额度已满时的新问答",
      });
    });
    expect(toast.error).not.toHaveBeenCalledWith("知识库存储空间已达上限");
  });

  it("shows an empty state for unknown knowledge base ids", async () => {
    vi.mocked(kbService.getKb).mockRejectedValueOnce({
      code: "KB_NOT_FOUND",
      message: "知识库不存在",
      status: 404,
    });

    renderWithRoute(
      "/chat/ai-hosting/kb/not-exist",
      <KbDetailPage />,
      "/chat/ai-hosting/kb/:kbId",
    );

    expect(await screen.findByRole("heading", { level: 1, name: "未找到知识库" })).toBeInTheDocument();
    expect(screen.getByText("当前知识库不存在或已被删除")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1, name: "华为产品知识" })).not.toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalledWith("知识库加载失败，请稍后重试");
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

    const dialog = screen.getByRole("dialog", { name: "添加问答知识" });

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
    expect(screen.getByRole("button", { name: "确认提交" })).toBeDisabled();
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
    expect(screen.getByRole("button", { name: "确认提交" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "移除已选择文件" }));

    expect(screen.queryByRole("region", { name: "已选择文件" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认提交" })).toBeDisabled();
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
    expect(screen.getByRole("button", { name: "确认提交" })).toBeEnabled();
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
    await user.click(screen.getByRole("button", { name: "确认提交" }));

    await waitFor(() => {
      expect(importKbQaDocMock).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByRole("dialog", { name: "添加问答知识" })).not.toBeInTheDocument();
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
    await user.click(screen.getByRole("button", { name: "确认提交" }));

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

    const dialog = screen.getByRole("dialog", { name: "添加问答知识" });
    await user.upload(
      screen.getByLabelText("选择问答导入文件"),
      new File(["question,answer"], "空内容导入.faq.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );
    await user.click(screen.getByRole("button", { name: "确认提交" }));

    expect(await screen.findByText("未解析到有效问答，请检查文件内容")).toBeInTheDocument();
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认提交" })).toBeEnabled();
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
    expect(screen.getByRole("button", { name: "确认提交" })).toBeDisabled();
  });

  it("rejects QA import files larger than 100MB before parsing", async () => {
    const user = userEvent.setup();

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
      createFileWithSize(
        "question,answer",
        "超大问答.faq.xlsx",
        100 * 1024 * 1024 + 1,
        {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
      ),
    );

    expect(await screen.findByText("文件大小不能超过 100MB")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "已选择文件" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认提交" })).toBeDisabled();
    expect(readXlsxFileMock).not.toHaveBeenCalled();
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
    expect(screen.getByRole("button", { name: "确认提交" })).toBeDisabled();
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
    expect(screen.getByRole("button", { name: "确认提交" })).toBeDisabled();
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

    const dialog = screen.getByRole("dialog", { name: "添加文档" });

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
    expect(screen.queryByRole("dialog", { name: "添加文档" })).not.toBeInTheDocument();
  });

  it("shows document upload file size limits in a popover table", async () => {
    const user = userEvent.setup();

    renderWithRoute(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w",
      <KbDetailPage />,
      "/chat/ai-hosting/kb/:kbId",
    );

    await screen.findByRole("heading", { level: 1, name: "华为产品知识" });
    await user.click(screen.getByRole("button", { name: "添加知识" }));
    await user.click(screen.getByRole("menuitem", { name: /文档/ }));

    expect(screen.getByRole("button", { name: "文件大小限制" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "文件大小限制" }));

    const limitTable = await screen.findByRole("table", { name: "文档文件大小限制" });

    expect(within(limitTable).getByRole("columnheader", { name: "文档格式" })).toBeInTheDocument();
    expect(within(limitTable).getByRole("columnheader", { name: "大小限制" })).toBeInTheDocument();
    expect(within(limitTable).getByRole("row", { name: ".pdf 200MB" })).toBeInTheDocument();
    expect(within(limitTable).getByRole("row", { name: ".doc / .docx 200MB" })).toBeInTheDocument();
    expect(within(limitTable).getByRole("row", { name: ".ppt / .pptx 200MB" })).toBeInTheDocument();
    expect(within(limitTable).getByRole("row", { name: ".md 10MB" })).toBeInTheDocument();
    expect(within(limitTable).getByRole("row", { name: ".txt 10MB" })).toBeInTheDocument();
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

  it("rejects document files that exceed their suffix size limit", async () => {
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
      createFileWithSize("pdf", "超大手册.pdf", 200 * 1024 * 1024 + 1, {
        type: "application/pdf",
      }),
    );

    expect(await screen.findByText("文件大小不能超过 200MB")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "已选择文档" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认提交" })).toBeDisabled();

    await user.upload(
      screen.getByLabelText("选择文档知识文件"),
      createFileWithSize("plain text", "超大说明.txt", 10 * 1024 * 1024 + 1, {
        type: "text/plain",
      }),
    );

    expect(await screen.findByText("文件大小不能超过 10MB")).toBeInTheDocument();
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

  it("renders the QA chunk detail page", async () => {
    renderWithRoute(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w/docs/knowledge-3",
      <KbDocDetailPage />,
      "/chat/ai-hosting/kb/:kbId/docs/:docId",
    );

    expect(await screen.findByRole("heading", { level: 1, name: "常见问题解答.faq" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "文件" })).toBeInTheDocument();
    expect(screen.getByText("FAQ")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "华为产品知识" })).toHaveAttribute(
      "href",
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w",
    );
    expect(screen.queryByText("FAQ · 华为产品知识")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "返回知识列表" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "搜索切片 ID" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "搜索问题" })).toBeInTheDocument();
    const addQaButton = screen.getByRole("button", { name: "添加问答" });
    expect(addQaButton).not.toHaveAttribute("aria-haspopup", "menu");
    expect(screen.queryByRole("button", { name: "添加切片" })).not.toBeInTheDocument();
    expect(screen.getByRole("table", { name: "切片列表" })).toBeInTheDocument();
    expect(screen.getByText("切片ID")).toBeInTheDocument();
    expect(screen.getByText("问题")).toBeInTheDocument();
    expect(screen.getByText("答案")).toBeInTheDocument();
    expect(screen.getByText("更新时间")).toBeInTheDocument();
    expect(screen.getByText("20260630131921038-3")).toBeInTheDocument();
    expect(screen.queryByText("ID 20260630131921038-3")).not.toBeInTheDocument();
    expect(screen.queryByText("#1")).not.toBeInTheDocument();
    expect(screen.queryByText("chunk-qa-1")).not.toBeInTheDocument();
    expect(screen.getByText("如何恢复出厂设置")).toBeInTheDocument();
    expect(screen.getByText("保修期多久")).toBeInTheDocument();
  });

  it("shows document page load failures in a toast instead of not found", async () => {
    vi.mocked(kbService.getKbDoc).mockRejectedValueOnce({
      code: "ECONNABORTED",
      message: "timeout of 15000ms exceeded",
    });

    renderWithRoute(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w/docs/knowledge-3",
      <KbDocDetailPage />,
      "/chat/ai-hosting/kb/:kbId/docs/:docId",
    );

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("文档加载失败，请稍后重试");
    });
    expect(screen.queryByRole("heading", { name: "未找到文档" })).not.toBeInTheDocument();
    expect(screen.queryByText("timeout of 15000ms exceeded")).not.toBeInTheDocument();
  });

  it("shows chunk list load failures in a toast", async () => {
    vi.mocked(kbService.listKbDocChunks).mockRejectedValueOnce(
      new Error("timeout of 15000ms exceeded"),
    );

    renderWithRoute(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w/docs/knowledge-3",
      <KbDocDetailPage />,
      "/chat/ai-hosting/kb/:kbId/docs/:docId",
    );

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("切片列表加载失败，请稍后重试");
    });
    expect(screen.queryByText("timeout of 15000ms exceeded")).not.toBeInTheDocument();
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

  it("loads and locates a target chunk from the display-id deep link", async () => {
    vi.mocked(kbService.listKbDocChunks).mockResolvedValueOnce({
      chunks: [
        {
          chunkId: "501",
          chunkType: "faq",
          content: "进入设置后选择系统并点击重置",
          createdAt: "2026-06-20T23:22:22+08:00",
          docId: "knowledge-3",
          kbId: "W7zU2fWkVSp65OTAjDd3-w",
          source: "manual",
          title: "如何恢复出厂设置",
          updatedAt: "2026-06-20T23:22:22+08:00",
          volcChunkId: "doc_id_9001_1001_20260630131921038-3",
        },
      ],
      pagination: { page: 1, pageSize: 1, total: 1 },
    });

    renderWithRoute(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w/docs/knowledge-3?chunkId=20260630131921038-3",
      <KbDocDetailPage />,
      "/chat/ai-hosting/kb/:kbId/docs/:docId",
    );

    const row = await screen.findByRole("row", { name: /如何恢复出厂设置/ });
    expect(row).toHaveAttribute("aria-current", "true");
    expect(kbService.listKbDocChunks).toHaveBeenCalledWith("knowledge-3", {
      chunkId: "20260630131921038-3",
      docType: "qa",
      page: 1,
      pageSize: 10,
      title: undefined,
      content: undefined,
    });
  });

  it("loads and locates an adopted target from its local entry primary key", async () => {
    const user = userEvent.setup();

    vi.mocked(kbService.listKbDocChunks).mockResolvedValueOnce({
      chunks: [
        {
          chunkId: "501",
          chunkType: "faq",
          content: "进入设置后选择系统并点击重置",
          createdAt: "2026-06-20T23:22:22+08:00",
          docId: "knowledge-3",
          kbId: "W7zU2fWkVSp65OTAjDd3-w",
          source: "manual",
          title: "如何恢复出厂设置",
          updatedAt: "2026-06-20T23:22:22+08:00",
          volcChunkId: "doc_id_9001_1001_20260630131921038-3",
        },
      ],
      pagination: { page: 1, pageSize: 1, total: 1 },
    });

    renderWithRoute(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w/docs/knowledge-3?entryId=501",
      <KbDocDetailPage />,
      "/chat/ai-hosting/kb/:kbId/docs/:docId",
    );

    const row = await screen.findByRole("row", { name: /如何恢复出厂设置/ });
    expect(row).toHaveAttribute("aria-current", "true");
    expect(kbService.listKbDocChunks).toHaveBeenCalledWith("knowledge-3", {
      chunkId: undefined,
      content: undefined,
      docType: "qa",
      entryId: "501",
      page: 1,
      pageSize: 10,
      title: undefined,
    });

    await waitFor(() => {
      expect(screen.getByText("切片 ID：20260630131921038-3")).toBeInTheDocument();
      expect(screen.queryByRole("textbox", { name: "搜索问题" })).not.toBeInTheDocument();
      expect(kbService.listKbDocChunks).toHaveBeenLastCalledWith("knowledge-3", {
        chunkId: "20260630131921038-3",
        content: undefined,
        docType: "qa",
        entryId: undefined,
        page: 1,
        pageSize: 10,
        title: undefined,
      });
    });

    await user.click(screen.getByRole("button", { name: "清除切片 ID 筛选" }));

    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "搜索问题" })).toBeInTheDocument();
      expect(kbService.listKbDocChunks).toHaveBeenLastCalledWith("knowledge-3", {
        chunkId: undefined,
        content: undefined,
        docType: "qa",
        entryId: undefined,
        page: 1,
        pageSize: 10,
        title: undefined,
      });
    });
  });

  it("clears a failed adopted entry target and restores the regular chunk list", async () => {
    vi.mocked(kbService.listKbDocChunks).mockRejectedValueOnce({
      code: "KB_CHUNK_NOT_FOUND",
      message: "切片不存在",
      status: 404,
    });

    renderWithRoute(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w/docs/knowledge-3?entryId=501",
      <KbDocDetailPage />,
      "/chat/ai-hosting/kb/:kbId/docs/:docId",
    );

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("切片列表加载失败，请稍后重试");
      expect(screen.getByRole("textbox", { name: "搜索问题" })).toBeInTheDocument();
      expect(kbService.listKbDocChunks).toHaveBeenLastCalledWith("knowledge-3", {
        chunkId: undefined,
        content: undefined,
        docType: "qa",
        entryId: undefined,
        page: 1,
        pageSize: 10,
        title: undefined,
      });
    });

    expect(kbService.listKbDocChunks).toHaveBeenCalledWith("knowledge-3", {
      chunkId: undefined,
      content: undefined,
      docType: "qa",
      entryId: "501",
      page: 1,
      pageSize: 10,
      title: undefined,
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

    await screen.findByRole("heading", { level: 1, name: "产品说明大全.doc" });
    expect(screen.getByRole("img", { name: "Word 文件" })).toBeInTheDocument();
    expect(screen.getByText("文件")).toBeInTheDocument();
    expect(screen.queryByText("文件（.doc）")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "华为产品知识" })).toHaveAttribute(
      "href",
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w",
    );
    expect(screen.queryByText("文档 · 华为产品知识")).not.toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "切片列表" })).not.toBeInTheDocument();
    const chunkList = await screen.findByRole("list", { name: "切片列表" });
    expect(screen.queryByRole("textbox", { name: "搜索切片 ID" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "搜索切片内容" })).toBeInTheDocument();
    expect(screen.queryByText("切片标题")).not.toBeInTheDocument();
    expect(within(chunkList).queryByText("ID chunk-doc-1")).not.toBeInTheDocument();
    const firstChunkCard = within(chunkList).getByText("ID 20260630131921038-3").closest("li");
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

    await screen.findByText("ID 20260630131921038-3");
    await user.type(screen.getByRole("textbox", { name: "搜索切片内容" }), "核销物码");

    await waitFor(() => {
      expect(screen.getByText("ID 20260630131921038-3")).toBeInTheDocument();
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
      expect(screen.queryByText("ID 20260630131921038-3")).not.toBeInTheDocument();
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

    await screen.findByRole("heading", { level: 1, name: "产品宣传图.png" });
    expect(screen.getByRole("img", { name: "产品宣传图" })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("搜索切片 ID")).not.toBeInTheDocument();
    expect(screen.getByText("图片")).toBeInTheDocument();
    expect(screen.queryByText("图片（.png）")).not.toBeInTheDocument();
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

    await screen.findByText("ID 20260630131921038-3");
    await user.click(screen.getByRole("button", { name: "删除 chunk-doc-1" }));
    const dialog = screen.getByRole("alertdialog", { name: "确定删除该切片吗" });
    const confirmDeleteButton = within(dialog).getByRole("button", { name: "删除" });
    expect(dialog).toBeInTheDocument();
    await user.click(confirmDeleteButton);

    expect(screen.queryByText("ID 20260630131921038-3")).not.toBeInTheDocument();
    expect(screen.getByText("ID volc-chunk-warranty-1")).toBeInTheDocument();
    expect(screen.getByText("#1")).toBeInTheDocument();
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
