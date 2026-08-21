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
import { AiSkillsPage } from "@/pages/chat/ai-hosting/ai-skills-page";
import { SKILL_CREATE_DRAFT_STATE_KEY } from "@/pages/chat/ai-hosting/ai-skill-create-draft";
import { AiSkillSettingsPage } from "@/pages/chat/ai-hosting/ai-skill-settings-page";
import { KbDetailPage } from "@/pages/chat/ai-hosting/kb-detail-page";
import { KbDocDetailPage } from "@/pages/chat/ai-hosting/kb-doc-detail-page";
import { KbListPage } from "@/pages/chat/ai-hosting/kb-list-page";
import { resetAiHostingQuotaCacheForTest } from "@/pages/chat/ai-hosting/ai-hosting-quota-store";
import { notifyAiHostingQuotaChanged } from "@/pages/chat/ai-hosting/ai-hosting-layout";
import { resetMockKbData } from "./kb-service-mock-data";
import * as agentService from "@/pages/chat/ai-hosting/agent-service";
import * as agentLearningService from "@/pages/chat/ai-hosting/api/agent-learning-service";
import * as kbService from "@/pages/chat/ai-hosting/api/kb-service";
import * as cdpTagService from "@/pages/chat/ai-hosting/api/cdp-tag-service";
import * as customFieldService from "@/pages/chat/ai-hosting/api/custom-field-service";
import * as agentSkillService from "@/pages/chat/ai-hosting/api/agent-skill-service";
import * as skillTemplateService from "@/pages/chat/ai-hosting/api/skill-template-service";
import * as systemVariableService from "@/pages/chat/ai-hosting/api/system-variable-service";
import * as workTagService from "@/pages/chat/ai-hosting/api/work-tag-service";
import { useAuthStore } from "@/store/auth-store";
import {
  AI_HOSTING_AGENT_KB_MAX_COUNT,
  AI_HOSTING_AGENT_SKILL_MAX_COUNT,
  AGENT_SKILL_TAG_MAX_COUNT,
  AGENT_SKILL_TOOL_MAX_COUNT,
  AGENT_SKILL_VARIABLE_MAX_COUNT,
} from "@chatai/contracts";
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
const customFieldServiceMock = vi.hoisted(() => ({
  listCustomFields: vi.fn(),
}));
const systemVariableServiceMock = vi.hoisted(() => ({
  listSystemVariables: vi.fn(),
}));
const agentSkillServiceMock = vi.hoisted(() => ({
  authorizeAgentSkillResource: vi.fn(),
  createAgentSkill: vi.fn(),
  deleteAgentSkill: vi.fn(),
  getAgentSkill: vi.fn(),
  getAgentSkillResourceAuth: vi.fn(),
  listAgentSkills: vi.fn(),
  updateAgentSkill: vi.fn(),
  updateAgentSkillStatus: vi.fn(),
}));
const skillTemplateServiceMock = vi.hoisted(() => ({
  getSkillTemplate: vi.fn(),
  listSkillTemplates: vi.fn(),
}));
const workTagServiceMock = vi.hoisted(() => ({
  listWorkTagGroups: vi.fn(),
  listWorkTags: vi.fn(),
}));
const cdpTagServiceMock = vi.hoisted(() => ({
  listCdpTagGroups: vi.fn(),
}));

vi.mock("read-excel-file/browser", () => ({
  default: readXlsxFileMock,
}));
vi.mock("@/pages/chat/ai-hosting/agent-service", () => agentServiceMock);
vi.mock("@/pages/chat/ai-hosting/api/agent-learning-service", () => agentLearningServiceMock);
vi.mock("@/pages/chat/ai-hosting/api/agent-skill-service", () => agentSkillServiceMock);
vi.mock("@/pages/chat/ai-hosting/api/skill-template-service", () => skillTemplateServiceMock);
vi.mock("@/pages/chat/ai-hosting/api/custom-field-service", () => customFieldServiceMock);
vi.mock("@/pages/chat/ai-hosting/api/system-variable-service", () => systemVariableServiceMock);
vi.mock("@/pages/chat/ai-hosting/api/work-tag-service", () => workTagServiceMock);
vi.mock("@/pages/chat/ai-hosting/api/cdp-tag-service", () => cdpTagServiceMock);
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
  availableKbs: [],
  availableSkills: [],
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
    availableSkillIds: [],
    conditionLogic: "如果客户咨询成分，那么说明功效",
    replyStyle: {
      length: "简洁",
      styleInstruction: "亲切自然",
    },
    handoffRules: "客户要求真人",
    role: "你是护肤顾问",
    useUserMemory: false,
  },
  publishedAt: 1_718_006_400_000,
  updatedAt: 1_718_006_460_000,
};

const mockInvalidAgentDetail = {
  ...mockAgentDetail,
  availableKbs: [
    {
      id: "100",
      invalidReason: "deleted" as const,
      name: "已删除知识库",
      status: "invalid" as const,
    },
  ],
  availableSkills: [
    {
      id: "3",
      invalidReason: "disabled" as const,
      name: "已停用技能",
      status: "invalid" as const,
    },
  ],
  promptConfig: {
    ...mockAgentDetail.promptConfig,
    availableKbIds: [100],
    availableSkillIds: [3],
    conditionLogic:
      '先核实<resource type="knowledge_base" kbId="100" name="已删除知识库" />再调用<resource type="skill" skillId="3" name="已停用技能" />',
  },
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

async function openAgentPreview(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "打开预览调试" }));
  return screen.getByRole("region", { name: "Agent 预览调试" });
}

async function addAgentKnowledgeBases(
  user: ReturnType<typeof userEvent.setup>,
  names: readonly string[],
) {
  await user.click(screen.getByRole("button", { name: "添加知识库" }));
  const dialog = await screen.findByRole("dialog", { name: "添加知识库" });

  for (const name of names) {
    await user.click(await within(dialog).findByRole("checkbox", { name: `选择${name}` }));
  }

  await user.click(within(dialog).getByRole("button", { name: "确认" }));
}

async function addAgentSkills(
  user: ReturnType<typeof userEvent.setup>,
  names: readonly string[],
) {
  await user.click(screen.getByRole("button", { name: "添加技能" }));
  const dialog = await screen.findByRole("dialog", { name: "添加技能" });

  for (const name of names) {
    await user.click(await within(dialog).findByRole("checkbox", { name: `选择${name}` }));
  }

  await user.click(within(dialog).getByRole("button", { name: "确认" }));
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
    vi.mocked(agentSkillService.getAgentSkillResourceAuth).mockResolvedValue({
      authorized: true,
    });
    vi.mocked(agentSkillService.authorizeAgentSkillResource).mockResolvedValue({
      authorized: true,
    });
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
    vi.mocked(customFieldService.listCustomFields).mockResolvedValue({
      fields: [
        {
          id: 1,
          key: "gender",
          options: [],
          sort: 10,
          title: "性别",
          type: 1,
        },
        {
          id: 2,
          key: "level",
          options: [],
          sort: 20,
          title: "客户等级",
          type: 1,
        },
      ],
    });
    vi.mocked(systemVariableService.listSystemVariables).mockResolvedValue({
      variables: [
        { key: "last_handoff_time", name: "上一次转人工时间" },
        { key: "customer_nickname", name: "客户昵称" },
        { key: "current_agent_name", name: "当前接待 Agent" },
      ],
    });
    vi.mocked(agentSkillService.listAgentSkills).mockResolvedValue({
      pagination: { page: 1, pageSize: 10, total: 2 },
      skills: [
        {
          applyScene:
            "根据订单号或手机号查询订单状态和物流进度，处理物流异常情况",
          createdAt: "2026-06-18 23:22:22",
          id: "1",
          name: "订单与物流场景查询",
          status: "enabled",
          updatedAt: "2026-06-20 23:22:22",
        },
        {
          applyScene:
            "处理用户的退货、换货、维修等售后申请，判断是否符合售后条件并引导处理流程",
          createdAt: "2026-06-17 23:22:22",
          id: "2",
          name: "退换货",
          status: "disabled",
          updatedAt: "2026-06-19 23:22:22",
        },
      ],
    });
    vi.mocked(skillTemplateService.listSkillTemplates).mockResolvedValue({
      groups: [
        {
          id: "1",
          name: "私域通用技能",
          templates: [
            {
              id: "101",
              name: "订单信息查询",
              icon: "",
              description: "客户的订单信息查询技能，可在特定场景下自动查询并回复",
              tip: "这个订单发货了吗？",
            },
          ],
        },
        {
          id: "2",
          name: "「美妆个护」行业严选技能",
          templates: [
            {
              id: "201",
              name: "肤质适配推荐",
              icon: "",
              description: "针对客户咨询的成分、功效、适用场景进行解读与说明",
              tip: "这个烟酰胺有什么作用？敏感肌能用吗？",
            },
          ],
        },
      ],
    });
    vi.mocked(skillTemplateService.getSkillTemplate).mockImplementation(
      async (templateId) =>
        templateId === "201"
          ? {
              id: "201",
              name: "肤质适配推荐",
              icon: "",
              description: "针对客户咨询的成分、功效、适用场景进行解读与说明",
              tip: "这个烟酰胺有什么作用？敏感肌能用吗？",
              applyScene: "当客户咨询商品是否适合自己的肤质时使用",
              content:
                '结合肤质标签给出推荐说明，可调用 <resource type="tool" toolId="order_query" name="订单查询" />',
              recommendResources: [
                {
                  type: "variable",
                  title: "客户标签查询",
                  description: "建议选择包含客户肤质等信息的标签分组",
                },
                {
                  type: "tool",
                  title: "订单查询",
                  description: "根据客户聊天消息中给到的订单号查询订单信息",
                },
                {
                  type: "knowledge_base",
                  title: "美妆护肤",
                  description: "这是描述",
                },
              ],
            }
          : {
              id: "101",
              name: "订单信息查询",
              icon: "",
              description: "客户的订单信息查询技能，可在特定场景下自动查询并回复",
              tip: "这个订单发货了吗？",
              applyScene: "当客户询问订单是否发货、物流进度时使用",
              content: "根据订单号查询并回复订单状态",
              recommendResources: [
                {
                  type: "variable",
                  title: "客户标签查询",
                  description: "建议选择包含客户订单相关信息的标签分组",
                },
                {
                  type: "tool",
                  title: "订单查询",
                  description: "根据订单号查询订单信息",
                  toolId: "search_order",
                },
                {
                  type: "knowledge_base",
                  title: "订单履约",
                  description: "订单与售后相关知识",
                },
              ],
            },
    );
    vi.mocked(agentSkillService.createAgentSkill).mockResolvedValue({ id: "3" });
    vi.mocked(agentSkillService.updateAgentSkill).mockResolvedValue({ id: "1" });
    vi.mocked(agentSkillService.getAgentSkill).mockResolvedValue({
      applyScene:
        "根据订单号或手机号查询订单状态和物流进度，处理物流异常情况",
      content: "查询订单物流",
      createdAt: "2026-06-18 23:22:22",
      id: "1",
      kbs: [],
      name: "订单与物流场景查询",
      resources: {
        knowledgeBases: [],
        tools: [],
        variables: [],
      },
      status: "enabled",
      tools: [],
      updatedAt: "2026-06-20 23:22:22",
      variables: [],
    });
    vi.mocked(agentSkillService.updateAgentSkillStatus).mockResolvedValue({ id: "1" });
    vi.mocked(agentSkillService.deleteAgentSkill).mockResolvedValue({ id: "1" });
    vi.mocked(workTagService.listWorkTagGroups).mockResolvedValue({
      groups: [
        {
          attr: 1,
          id: 11,
          name: "意向标签组",
          tagCount: 3,
        },
        {
          attr: 2,
          id: 21,
          name: "会员等级组",
          tagCount: 3,
        },
      ],
    });
    vi.mocked(cdpTagService.listCdpTagGroups).mockResolvedValue({
      groups: [
        {
          groupName: "价值分组",
          groupTag: "value_group",
          tags: [
            { name: "高价值", tag: "high_value" },
            { name: "低价值", tag: "low_value" },
          ],
        },
        {
          groupName: "消费分组",
          groupTag: "consume_group",
          tags: [{ name: "复购", tag: "repurchase" }],
        },
      ],
    });
    vi.mocked(workTagService.listWorkTags).mockImplementation(async (params) => {
      const type = params?.type ?? 0;
      const allTags =
        type === 12
          ? [
              {
                groupAttr: 1 as const,
                groupId: 31,
                groupName: "基础会员标签",
                groupSort: 20,
                id: 311,
                name: "银卡会员",
                type: 12 as const,
              },
              {
                groupAttr: 1 as const,
                groupId: 31,
                groupName: "基础会员标签",
                groupSort: 20,
                id: 312,
                name: "金卡会员",
                type: 12 as const,
              },
              {
                groupAttr: 1 as const,
                groupId: 32,
                groupName: "消费行为",
                groupSort: 10,
                id: 321,
                name: "复购用户",
                type: 12 as const,
              },
            ]
          : [
              {
                groupAttr: 1 as const,
                groupId: 11,
                groupName: "意向标签组",
                groupSort: 10,
                id: 111,
                name: "高意向",
                type: 0 as const,
              },
              {
                groupAttr: 1 as const,
                groupId: 11,
                groupName: "意向标签组",
                groupSort: 10,
                id: 112,
                name: "中意向",
                type: 0 as const,
              },
              {
                groupAttr: 1 as const,
                groupId: 11,
                groupName: "意向标签组",
                groupSort: 10,
                id: 113,
                name: "低意向",
                type: 0 as const,
              },
            ];

      const tags = allTags.filter((tag) => {
        if (params?.groupId != null && tag.groupId !== params.groupId) {
          return false;
        }

        const keyword = params?.keyword?.trim();
        if (keyword && !tag.name.includes(keyword)) {
          return false;
        }

        return true;
      });

      return {
        pagination: {
          hasNext: false,
          page: params?.page ?? 1,
          pageSize: params?.pageSize ?? 100,
          total: tags.length,
        },
        tags,
      };
    });
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
        private readonly listeners = new Map<string, Set<(event: Event) => void>>();

        complete = false;
        naturalWidth = 0;
        onerror: ((event: Event) => void) | null = null;
        onload: ((event: Event) => void) | null = null;

        addEventListener(type: string, listener: (event: Event) => void) {
          const listeners =
            this.listeners.get(type) ?? new Set<(event: Event) => void>();
          listeners.add(listener);
          this.listeners.set(type, listeners);
        }

        removeEventListener(type: string, listener: (event: Event) => void) {
          this.listeners.get(type)?.delete(listener);
        }

        set src(_value: string) {
          queueMicrotask(() => {
            this.complete = true;
            this.naturalWidth = 1;
            const event = {
              currentTarget: this,
              target: this,
            } as unknown as Event;

            this.onload?.(event);
            this.listeners.get("load")?.forEach((listener) => listener(event));
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
    expect(screen.getByRole("link", { name: "技能" })).toHaveAttribute(
      "href",
      "/chat/ai-hosting/skills",
    );
    expect(screen.getByRole("link", { name: "记忆" })).toHaveAttribute(
      "href",
      "/chat/ai-hosting/user-memory",
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
    const carousel = within(dialog).getByTestId("self-learning-carousel");
    expect(carousel.querySelector("img")).toHaveAttribute(
      "src",
      "https://b5.bokr.com.cn/dist/ui/learn_banner_bg.png",
    );
    expect(within(carousel).getByText("对话挖掘")).toBeInTheDocument();
    expect(within(carousel).getByText("FAQ候选")).toBeInTheDocument();
    expect(within(carousel).getByText("智能评测")).toBeInTheDocument();
    expect(within(carousel).getByText("建议入库")).toBeInTheDocument();
    expect(carousel.querySelectorAll("svg")).toHaveLength(4);
    expect(
      within(carousel).getByTestId("self-learning-carousel-item-dialog-mining"),
    ).toHaveAttribute("data-state", "active");
  });

  it("advances the AI self-learning carousel every 3 seconds", async () => {
    vi.useFakeTimers();

    try {
      await act(async () => {
        renderWithRoute("/chat/ai-hosting/agents", <AgentManagementPage />);
        await Promise.resolve();
        await Promise.resolve();
      });

      fireEvent.click(screen.getByRole("button", { name: "护肤小助理 自主进化" }));

      const carousel = screen.getByTestId("self-learning-carousel");
      expect(
        within(carousel).getByTestId("self-learning-carousel-item-dialog-mining"),
      ).toHaveAttribute("data-state", "active");

      act(() => {
        vi.advanceTimersByTime(2_999);
      });
      expect(
        within(carousel).getByTestId("self-learning-carousel-item-dialog-mining"),
      ).toHaveAttribute("data-state", "active");

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(
        within(carousel).getByTestId("self-learning-carousel-item-faq-candidate"),
      ).toHaveAttribute("data-state", "active");
    } finally {
      vi.useRealTimers();
    }
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

  it("renders the AI skills marketplace as a flat example template list", async () => {
    const user = userEvent.setup();

    renderWithRoute("/chat/ai-hosting/skills", <AiSkillsPage />);

    expect(screen.getByRole("heading", { level: 1, name: "技能" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "技能" })).toHaveAttribute(
      "href",
      "/chat/ai-hosting/skills",
    );
    const introGuide = screen.getByRole("region", { name: "技能使用引导" });
    expect(within(introGuide).getAllByRole("heading", { level: 2 })).toHaveLength(3);
    expect(within(introGuide).getAllByRole("img").map((image) => image.getAttribute("src"))).toEqual([
      "https://b5.bokr.com.cn/dist/ui/skill_f1.png",
      "https://b5.bokr.com.cn/dist/ui/skill_f2.png",
      "https://b5.bokr.com.cn/dist/ui/skill_f3.png",
    ]);
    expect(
      within(screen.getByRole("tablist", { name: "AI技能视图" }))
        .getAllByRole("tab")
        .map((tab) => tab.textContent),
    ).toEqual(["我的技能", "技能示例"]);
    expect(screen.getByRole("tab", { name: "我的技能" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "技能示例" })).toHaveAttribute(
      "aria-selected",
      "false",
    );

    await user.click(screen.getByRole("tab", { name: "技能示例" }));
    expect(screen.getByRole("tab", { name: "技能示例" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(await screen.findByRole("heading", { level: 2, name: "示例模板" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "示例模板" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /订单信息查询/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /肤质适配推荐/ })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "私域通用技能" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "「美妆个护」行业严选技能" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "收起" })).not.toBeInTheDocument();
    expect(skillTemplateService.listSkillTemplates).toHaveBeenCalled();
    expect(skillTemplateService.getSkillTemplate).not.toHaveBeenCalled();

    const deliveryTrigger = screen.getByRole("button", { name: /交付专家深度共创服务/ });
    await user.click(deliveryTrigger);
    const deliveryDialog = screen.getByRole("dialog");
    expect(within(deliveryDialog).getByRole("heading", { level: 2 })).toBeInTheDocument();
    expect(within(deliveryDialog).getAllByRole("heading", { level: 3 })).toHaveLength(5);
    expect(within(deliveryDialog).getAllByRole("heading", { level: 4 })).toHaveLength(4);
    const deliveryDialogCloseButton = within(deliveryDialog).getByRole("button", {
      name: "关闭",
    });
    expect(deliveryDialogCloseButton).not.toHaveFocus();
    await user.click(deliveryDialogCloseButton);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "我的技能" }));
    expect(screen.getByRole("tab", { name: "我的技能" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("region", { name: "我的技能" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "搜索技能" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "添加技能" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "我的技能列表" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "技能名称" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "应用场景" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "状态" })).toBeInTheDocument();
    expect(
      await screen.findByRole("link", { name: "订单与物流场景查询" }),
    ).toHaveAttribute("href", "/chat/ai-hosting/skills/1/edit");
    expect(screen.getAllByText("已启用").length).toBeGreaterThan(0);
    expect(screen.getAllByText("未启用").length).toBeGreaterThan(0);

    await user.click(
      screen.getByRole("button", { name: "打开 订单与物流场景查询 操作菜单" }),
    );
    expect(screen.getByRole("menuitem", { name: "编辑" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "停用" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "删除" })).toBeInTheDocument();
  });

  it("renders skill management as read-only for non-manage roles", async () => {
    const user = userEvent.setup();
    mockSession("operator");
    const router = createMemoryRouter(
      [
        {
          path: "/chat/ai-hosting/skills",
          element: <AiSkillsPage />,
        },
        {
          path: "/chat/ai-hosting/skills/:skillId/edit",
          element: <AiSkillSettingsPage />,
        },
      ],
      { initialEntries: ["/chat/ai-hosting/skills?tab=mine"] },
    );

    render(<RouterProvider router={router} />);

    expect(screen.queryByRole("button", { name: "添加技能" })).not.toBeInTheDocument();
    await screen.findByRole("link", { name: "订单与物流场景查询" });

    await user.click(
      screen.getByRole("button", { name: "打开 订单与物流场景查询 操作菜单" }),
    );
    expect(screen.getByRole("menuitem", { name: "查看" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "编辑" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "停用" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "删除" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("menuitem", { name: "查看" }));

    expect(router.state.location.pathname).toBe("/chat/ai-hosting/skills/1/edit");
    expect(await screen.findByLabelText(/技能名称/)).toBeDisabled();
    expect(screen.getByLabelText("技能应用场景")).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "技能描述" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("button", { name: "添加变量" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "保存" })).not.toBeInTheDocument();
    expect(agentSkillService.createAgentSkill).not.toHaveBeenCalled();
    expect(agentSkillService.updateAgentSkill).not.toHaveBeenCalled();
    expect(agentSkillService.updateAgentSkillStatus).not.toHaveBeenCalled();
    expect(agentSkillService.deleteAgentSkill).not.toHaveBeenCalled();
  });

  it("toggles my skill status from the skills list", async () => {
    const user = userEvent.setup();
    vi.mocked(agentSkillService.updateAgentSkillStatus).mockImplementation(
      async (skillId, status) => {
        const skills: Awaited<
          ReturnType<typeof agentSkillService.listAgentSkills>
        >["skills"] = [
          {
            applyScene:
              "根据订单号或手机号查询订单状态和物流进度，处理物流异常情况",
            createdAt: "2026-06-18 23:22:22",
            id: "1",
            name: "订单与物流场景查询",
            status: skillId === "1" ? status : "enabled",
            updatedAt: "2026-06-20 23:22:22",
          },
          {
            applyScene:
              "处理用户的退货、换货、维修等售后申请，判断是否符合售后条件并引导处理流程",
            createdAt: "2026-06-17 23:22:22",
            id: "2",
            name: "退换货",
            status: "disabled",
            updatedAt: "2026-06-19 23:22:22",
          },
        ];
        vi.mocked(agentSkillService.listAgentSkills).mockResolvedValue({
          pagination: { page: 1, pageSize: 10, total: 2 },
          skills,
        });
        return { id: skillId };
      },
    );

    renderWithRoute("/chat/ai-hosting/skills", <AiSkillsPage />);
    await user.click(screen.getByRole("tab", { name: "我的技能" }));
    expect(await screen.findByText("订单与物流场景查询")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "打开 订单与物流场景查询 操作菜单" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "停用" }));

    await waitFor(() => {
      expect(agentSkillService.updateAgentSkillStatus).toHaveBeenCalledWith(
        "1",
        "disabled",
      );
    });
    await user.click(
      screen.getByRole("button", { name: "打开 订单与物流场景查询 操作菜单" }),
    );
    expect(await screen.findByRole("menuitem", { name: "启用" })).toBeInTheDocument();
  });

  it("confirms enabling a skill from the my skills list", async () => {
    const user = userEvent.setup();

    renderWithRoute("/chat/ai-hosting/skills", <AiSkillsPage />);
    await user.click(screen.getByRole("tab", { name: "我的技能" }));
    expect(await screen.findByText("退换货")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "打开 退换货 操作菜单" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "启用" }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "是否确认启用？" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "确定" }));
    await waitFor(() => {
      expect(agentSkillService.updateAgentSkillStatus).toHaveBeenCalledWith(
        "2",
        "enabled",
      );
    });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("confirms deleting a skill from the my skills list", async () => {
    const user = userEvent.setup();
    vi.mocked(agentSkillService.deleteAgentSkill).mockImplementation(async (skillId) => {
      vi.mocked(agentSkillService.listAgentSkills).mockResolvedValue({
        pagination: { page: 1, pageSize: 10, total: skillId === "1" ? 1 : 0 },
        skills:
          skillId === "1"
            ? [
                {
                  applyScene:
                    "处理用户的退货、换货、维修等售后申请，判断是否符合售后条件并引导处理流程",
                  createdAt: "2026-06-17 23:22:22",
                  id: "2",
                  name: "退换货",
                  status: "disabled",
                  updatedAt: "2026-06-19 23:22:22",
                },
              ]
            : [],
      });
      return { id: skillId };
    });

    renderWithRoute("/chat/ai-hosting/skills", <AiSkillsPage />);
    await user.click(screen.getByRole("tab", { name: "我的技能" }));

    expect(await screen.findByText("订单与物流场景查询")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "打开 订单与物流场景查询 操作菜单" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "删除" }));
    expect(screen.getByRole("heading", { name: "是否确认删除？" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "确定" }));
    await waitFor(() => {
      expect(agentSkillService.deleteAgentSkill).toHaveBeenCalledWith("1");
    });
    expect(screen.queryByText("订单与物流场景查询")).not.toBeInTheDocument();
  });

  it("returns to the previous page after deleting the only skill on a later page", async () => {
    const user = userEvent.setup();
    let deleted = false;
    const firstPageSkill = {
      applyScene: "第一页场景",
      createdAt: "2026-06-18 23:22:22",
      id: "1",
      name: "第一页技能",
      status: "enabled" as const,
      updatedAt: "2026-06-20 23:22:22",
    };
    const secondPageSkill = {
      applyScene: "第二页场景",
      createdAt: "2026-06-17 23:22:22",
      id: "11",
      name: "第二页唯一技能",
      status: "enabled" as const,
      updatedAt: "2026-06-19 23:22:22",
    };

    vi.mocked(agentSkillService.listAgentSkills).mockImplementation(async (params) => {
      if (params?.page === 2 && !deleted) {
        return {
          pagination: { page: 2, pageSize: 10, total: 11 },
          skills: [secondPageSkill],
        };
      }

      return {
        pagination: { page: 1, pageSize: 10, total: deleted ? 10 : 11 },
        skills: [firstPageSkill],
      };
    });
    vi.mocked(agentSkillService.deleteAgentSkill).mockImplementation(async (skillId) => {
      deleted = true;
      return { id: skillId };
    });

    renderWithRoute("/chat/ai-hosting/skills", <AiSkillsPage />);
    expect(await screen.findByText("第一页技能")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "2" }));
    expect(await screen.findByText("第二页唯一技能")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "打开 第二页唯一技能 操作菜单" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "删除" }));
    await user.click(screen.getByRole("button", { name: "确定" }));

    expect(await screen.findByText("第一页技能")).toBeInTheDocument();
    expect(screen.queryByText("第二页唯一技能")).not.toBeInTheDocument();
    expect(agentSkillService.listAgentSkills).toHaveBeenLastCalledWith({
      page: 1,
      pageSize: 10,
      query: undefined,
    });
  });

  it("opens a skill detail dialog when a marketplace skill card is clicked", async () => {
    const user = userEvent.setup();

    renderWithRoute("/chat/ai-hosting/skills", <AiSkillsPage />);

    await user.click(screen.getByRole("tab", { name: "技能示例" }));
    await user.click(await screen.findByRole("button", { name: /肤质适配推荐/ }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByRole("heading", { name: "肤质适配推荐" })).toBeInTheDocument();
    expect(skillTemplateService.getSkillTemplate).toHaveBeenCalledWith("201");
    const tipRegion = within(dialog).getByRole("region", { name: "示例问题" });
    expect(tipRegion).toHaveTextContent("这个烟酰胺有什么作用？敏感肌能用吗？");
    expect(await within(dialog).findByRole("tab", { name: "技能应用场景" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      await within(dialog).findByRole("region", { name: "建议关联配置资源" }),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("客户标签查询")).toBeInTheDocument();
    expect(within(dialog).getByText("订单查询")).toBeInTheDocument();
    expect(within(dialog).getByText("美妆护肤")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "预览技能" })).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "选择客户标签查询" }),
    ).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole("tab", { name: "技能描述" }));
    expect(within(dialog).getByRole("tab", { name: "技能描述" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      within(dialog).getByText("订单查询", {
        selector: "[data-skill-resource-chip='true']",
      }),
    ).toHaveAttribute("data-skill-resource-kind", "tool");
    expect(
      within(dialog).getByRole("region", { name: "建议关联配置资源" }),
    ).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "关闭" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("previews a skill template directly into create page with recommend resources tips", async () => {
    const user = userEvent.setup();
    const router = createMemoryRouter(
      [
        {
          path: "/chat/ai-hosting/skills",
          element: <AiSkillsPage />,
        },
        {
          path: "/chat/ai-hosting/skills/new",
          element: <AiSkillSettingsPage />,
        },
      ],
      { initialEntries: ["/chat/ai-hosting/skills"] },
    );

    render(<RouterProvider router={router} />);

    await user.click(screen.getByRole("tab", { name: "技能示例" }));
    await user.click(await screen.findByRole("button", { name: /订单信息查询/ }));

    const detailDialog = screen.getByRole("dialog");
    expect(
      await within(detailDialog).findByRole("region", {
        name: "建议关联配置资源",
      }),
    ).toBeInTheDocument();
    expect(
      within(detailDialog).queryByRole("button", { name: "选择客户标签查询" }),
    ).not.toBeInTheDocument();

    await user.click(within(detailDialog).getByRole("button", { name: "预览技能" }));
    expect(screen.queryByRole("heading", { name: "编辑资源" })).not.toBeInTheDocument();

    expect(await screen.findByRole("heading", { name: "资源管理" })).toBeInTheDocument();
    expect(screen.getByText("订单查询")).toBeInTheDocument();
    const recommendTips = screen.getByRole("region", { name: "推荐资源" });
    expect(recommendTips).toHaveTextContent("客户标签查询");
    expect(recommendTips).toHaveTextContent("订单履约");
    expect(
      within(recommendTips).queryByRole("button"),
    ).not.toBeInTheDocument();
  });

  it("opens my skills tab from the tab query and navigates to skill settings", async () => {
    const user = userEvent.setup();
    const router = createMemoryRouter(
      [
        {
          path: "/chat/ai-hosting/skills",
          element: <AiSkillsPage />,
        },
        {
          path: "/chat/ai-hosting/skills/new",
          element: <AiSkillSettingsPage />,
        },
      ],
      { initialEntries: ["/chat/ai-hosting/skills?tab=mine"] },
    );

    render(<RouterProvider router={router} />);

    expect(screen.getByRole("tab", { name: "我的技能" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await user.click(screen.getByRole("button", { name: "添加技能" }));

    expect(router.state.location.pathname).toBe("/chat/ai-hosting/skills/new");
    expect(
      await screen.findByRole("heading", { level: 1, name: "技能设置" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "返回我的技能" })).toHaveAttribute(
      "href",
      "/chat/ai-hosting/skills?tab=mine",
    );
    const skillName = screen.getByLabelText(/技能名称/);
    expect(skillName).toHaveAttribute("maxLength", "30");
    expect(screen.getByText("0/30")).toBeInTheDocument();
    const basicSettings = screen.getByRole("region", { name: "基本设置" });
    const applicationScenario = within(basicSettings).getByLabelText("技能应用场景");
    expect(applicationScenario).toHaveAttribute("maxLength", "500");
    expect(within(basicSettings).getByText("0/500")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "技能描述" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "资源管理" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "添加引用资源" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();

    await user.type(applicationScenario, "查询订单");
    expect(within(basicSettings).getByText("4/500")).toBeInTheDocument();
    await user.type(skillName, "测试技能");
    expect(screen.getByRole("button", { name: "保存" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => {
      expect(agentSkillService.createAgentSkill).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "测试技能",
        }),
      );
    });
    expect(router.state.location.pathname).toBe("/chat/ai-hosting/skills");
    expect(router.state.location.search).toBe("?tab=mine");
  });

  it("navigates to skill edit settings from my skills table", async () => {
    const user = userEvent.setup();
    vi.mocked(agentSkillService.getAgentSkill).mockResolvedValueOnce({
      applyScene:
        "根据订单号或手机号查询订单状态和物流进度，处理物流异常情况",
      content: "查询订单物流",
      createdAt: "2026-06-18 23:22:22",
      id: "1",
      kbs: [],
      name: "订单与物流场景查询",
      resources: {
        knowledgeBases: [],
        tools: [],
        variables: [
          {
            id: "system_variable:chat_type",
            name: "系统变量 · 会话类型",
            status: "available",
            variable: {
              name: "会话类型",
              select_key: "chat_type",
              type: "system_variable",
            },
          },
        ],
      },
      status: "enabled",
      tools: [],
      updatedAt: "2026-06-20 23:22:22",
      variables: [
        {
          name: "系统变量 · 系统变量 · 会话类型",
          select_key: "chat_type",
          type: "system_variable",
        },
      ],
    });
    const router = createMemoryRouter(
      [
        {
          path: "/chat/ai-hosting/skills",
          element: <AiSkillsPage />,
        },
        {
          path: "/chat/ai-hosting/skills/:skillId/edit",
          element: <AiSkillSettingsPage />,
        },
      ],
      { initialEntries: ["/chat/ai-hosting/skills?tab=mine"] },
    );

    render(<RouterProvider router={router} />);

    const knowledgeBaseCallCount = vi.mocked(kbService.listKbs).mock.calls.length;

    await user.click(
      await screen.findByRole("link", { name: "订单与物流场景查询" }),
    );

    expect(router.state.location.pathname).toBe("/chat/ai-hosting/skills/1/edit");
    expect(await screen.findByLabelText(/技能名称/)).toHaveValue(
      "订单与物流场景查询",
    );
    expect(agentSkillService.getAgentSkill).toHaveBeenCalledWith("1");
    expect(kbService.listKbs).toHaveBeenCalledTimes(knowledgeBaseCallCount);
    expect(screen.getByRole("list", { name: "已添加变量" })).toHaveTextContent(
      "系统变量 · 会话类型",
    );
    expect(screen.getByRole("list", { name: "已添加变量" })).not.toHaveTextContent(
      "系统变量 · 系统变量 · 会话类型",
    );

    await user.clear(screen.getByLabelText(/技能名称/));
    await user.type(screen.getByLabelText(/技能名称/), "订单物流查询改");
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(agentSkillService.updateAgentSkill).toHaveBeenCalledWith(
        "1",
        expect.objectContaining({
          name: "订单物流查询改",
          variables: [
            {
              name: "会话类型",
              select_key: "chat_type",
              type: "system_variable",
            },
          ],
        }),
      );
    });
    expect(router.state.location.pathname).toBe("/chat/ai-hosting/skills");
    expect(router.state.location.search).toBe("?tab=mine");
  });

  it("shows invalid skill resources in the panel and description and blocks saving", async () => {
    const user = userEvent.setup();
    vi.mocked(agentSkillService.getAgentSkill).mockResolvedValueOnce({
      applyScene: "引用知识库回答",
      content:
        '<resource type="knowledge_base" kbId="9" name="已删除知识库" />',
      createdAt: "2026-06-18 23:22:22",
      id: "1",
      kbs: [9],
      name: "失效资源技能",
      resources: {
        knowledgeBases: [
          {
            id: "kb:9",
            invalidReason: "deleted",
            kbId: 9,
            name: "已删除知识库",
            status: "invalid",
          },
        ],
        tools: [],
        variables: [],
      },
      status: "enabled",
      tools: [],
      updatedAt: "2026-06-20 23:22:22",
      variables: [],
    });

    renderWithRoute(
      "/chat/ai-hosting/skills/1/edit",
      <AiSkillSettingsPage />,
      "/chat/ai-hosting/skills/:skillId/edit",
    );

    expect(await screen.findByText("保存前请移除失效资源")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "已删除知识库已失效" }),
    ).toBeInTheDocument();
    const invalidChip = screen.getByText("已删除知识库", {
      selector: "[data-skill-resource-chip='true']",
    });
    expect(invalidChip).toHaveAttribute("data-resource-invalid", "true");

    await user.hover(invalidChip);
    expect((await screen.findAllByText("知识库已被删除")).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "保存" }));
    const dialog = screen.getByRole("alertdialog", { name: "无法保存技能" });
    expect(within(dialog).getByText("已删除知识库")).toBeInTheDocument();
    expect(agentSkillService.updateAgentSkill).not.toHaveBeenCalled();
  });

  it("marks resources invalid when the save API rejects stale resource state", async () => {
    const user = userEvent.setup();
    vi.mocked(agentSkillService.getAgentSkill).mockResolvedValueOnce({
      applyScene: "引用知识库回答",
      content: "",
      createdAt: "2026-06-18 23:22:22",
      id: "1",
      kbs: [9],
      name: "资源状态变化技能",
      resources: {
        knowledgeBases: [
          {
            id: "kb:9",
            kbId: 9,
            name: "产品知识库",
            status: "available",
          },
        ],
        tools: [],
        variables: [],
      },
      status: "enabled",
      tools: [],
      updatedAt: "2026-06-20 23:22:22",
      variables: [],
    });
    vi.mocked(agentSkillService.updateAgentSkill).mockRejectedValueOnce({
      code: "SKILL_RESOURCES_INVALID",
      details: {
        knowledgeBases: [
          {
            id: "kb:9",
            invalidReason: "deleted",
            kbId: 9,
            name: "产品知识库",
            status: "invalid",
          },
        ],
        tools: [],
        variables: [],
      },
      message: "技能依赖的资源已失效，请移除后重试",
    });

    renderWithRoute(
      "/chat/ai-hosting/skills/1/edit",
      <AiSkillSettingsPage />,
      "/chat/ai-hosting/skills/:skillId/edit",
    );

    await screen.findByLabelText(/技能名称/);
    await user.click(screen.getByRole("button", { name: "保存" }));

    const dialog = await screen.findByRole("alertdialog", {
      name: "无法保存技能",
    });
    expect(dialog).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "知道了" }));
    expect(screen.getByText("保存前请移除失效资源")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "产品知识库已失效" }),
    ).toBeInTheDocument();
  });

  it("shows the validation reason when saving a skill fails", async () => {
    const user = userEvent.setup();
    vi.mocked(agentSkillService.updateAgentSkill).mockRejectedValueOnce({
      code: "BAD_REQUEST",
      message: "最多添加 10 个变量",
      status: 400,
    });

    renderWithRoute(
      "/chat/ai-hosting/skills/1/edit",
      <AiSkillSettingsPage />,
      "/chat/ai-hosting/skills/:skillId/edit",
    );

    await screen.findByLabelText(/技能名称/);
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(toast.error).toHaveBeenCalledWith("最多添加 10 个变量");
  });

  it("trims skill description input at 8000 visible characters", async () => {
    const user = userEvent.setup();

    renderWithRoute("/chat/ai-hosting/skills/new", <AiSkillSettingsPage />);

    const editor = await screen.findByRole("textbox", { name: "技能描述" });
    await user.click(editor);
    await user.paste("a".repeat(8001));

    await waitFor(() => {
      expect(editor).toHaveTextContent("a".repeat(8000));
    });
    expect(screen.getByText("8000/8000")).toBeInTheDocument();
  });

  it("trims oversized skill description while hydrating an existing skill", async () => {
    const user = userEvent.setup();
    const allowedText = "a".repeat(8000);

    vi.mocked(agentSkillService.getAgentSkill).mockResolvedValueOnce({
      applyScene: "查询订单物流",
      content: `${allowedText}多`,
      createdAt: "2026-06-18 23:22:22",
      id: "1",
      kbs: [],
      name: "订单与物流场景查询",
      resources: {
        knowledgeBases: [],
        tools: [],
        variables: [],
      },
      status: "enabled",
      tools: [],
      updatedAt: "2026-06-20 23:22:22",
      variables: [],
    });

    const router = createMemoryRouter(
      [
        {
          path: "/chat/ai-hosting/skills/:skillId/edit",
          element: <AiSkillSettingsPage />,
        },
        {
          path: "/chat/ai-hosting/skills",
          element: <div>技能列表</div>,
        },
      ],
      { initialEntries: ["/chat/ai-hosting/skills/1/edit"] },
    );

    render(<RouterProvider router={router} />);

    const editor = await screen.findByRole("textbox", { name: "技能描述" });

    await waitFor(() => {
      expect(editor).toHaveTextContent(allowedText);
    });
    expect(screen.getByText("8000/8000")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => {
      expect(agentSkillService.updateAgentSkill).toHaveBeenCalledWith(
        "1",
        expect.objectContaining({ content: allowedText }),
      );
    });
    expect(router.state.location.pathname).toBe("/chat/ai-hosting/skills");
  });

  it("requires resource authorization before first variable or tool add", async () => {
    const user = userEvent.setup();
    vi.mocked(agentSkillService.getAgentSkillResourceAuth).mockResolvedValue({
      authorized: false,
    });
    vi.mocked(agentSkillService.authorizeAgentSkillResource).mockResolvedValue({
      authorized: true,
    });

    renderWithRoute("/chat/ai-hosting/skills/new", <AiSkillSettingsPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "添加变量" })).toBeEnabled();
    });

    await user.click(screen.getByRole("button", { name: "添加变量" }));
    expect(screen.getByRole("heading", { name: "授权三方接入" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "添加变量" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(screen.queryByRole("heading", { name: "授权三方接入" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "添加变量" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "添加工具" }));
    expect(screen.getByRole("heading", { name: "授权三方接入" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "同意并授权" }));
    await waitFor(() => {
      expect(agentSkillService.authorizeAgentSkillResource).toHaveBeenCalled();
    });
    expect(screen.queryByRole("heading", { name: "授权三方接入" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "插入工具" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "关闭" }));
    await user.click(screen.getByRole("button", { name: "添加变量" }));
    expect(screen.queryByRole("heading", { name: "授权三方接入" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "添加变量" })).toBeInTheDocument();
  });

  it("opens insert resource dialogs from skill settings", async () => {
    const user = userEvent.setup();

    renderWithRoute("/chat/ai-hosting/skills/new", <AiSkillSettingsPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "添加变量" })).toBeEnabled();
    });
    await user.click(screen.getByRole("button", { name: "添加变量" }));
    expect(screen.getByRole("heading", { name: "添加变量" })).toBeInTheDocument();
    expect(screen.getByRole("tablist", { name: "变量类型" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "企微标签" })).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(screen.getByRole("tab", { name: "小店标签" })).toBeEnabled();
    expect(screen.getByRole("tab", { name: "自动化标签" })).toBeEnabled();
    expect(screen.getByRole("tab", { name: "自定义属性" })).toBeEnabled();
    expect(screen.getByRole("tab", { name: "系统变量" })).toBeEnabled();

    await user.click(screen.getByRole("tab", { name: "自定义属性" }));
    expect(await screen.findByRole("group", { name: "字段" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "搜索字段" })).not.toBeInTheDocument();
    expect(customFieldService.listCustomFields).toHaveBeenCalledWith({ status: 1 });
    expect(screen.getByRole("button", { name: "确认" })).toBeDisabled();

    expect(screen.getByRole("checkbox", { name: "性别" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "客户等级" })).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "性别" }));
    await user.click(screen.getByRole("checkbox", { name: "客户等级" }));
    expect(screen.getByRole("button", { name: "确认" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "确认" }));
    expect(screen.queryByRole("heading", { name: "添加变量" })).not.toBeInTheDocument();
    expect(screen.getByRole("list", { name: "已添加变量" })).toHaveTextContent(
      "自定义属性 · 性别",
    );
    expect(screen.getByRole("list", { name: "已添加变量" })).toHaveTextContent(
      "自定义属性 · 客户等级",
    );
    // 右侧添加只进入可选池，不会直接写入技能描述
    expect(screen.getByRole("textbox", { name: "技能描述" })).not.toHaveTextContent("性别");

    await user.click(screen.getByRole("button", { name: "添加变量" }));
    await user.click(screen.getByRole("tab", { name: "自定义属性" }));
    expect(await screen.findByRole("checkbox", { name: "性别" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "性别" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "客户等级" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "客户等级" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "确认" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "取消" }));

    expect(
      screen.queryByRole("button", { name: "编辑自定义属性 · 性别" }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "删除自定义属性 · 性别" }),
    );
    expect(screen.getByRole("heading", { name: "删除变量" })).toBeInTheDocument();
    expect(screen.getByText("将删除技能描述中引用的变量，确认删除吗？")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(screen.getByRole("list", { name: "已添加变量" })).toHaveTextContent(
      "自定义属性 · 性别",
    );

    await user.click(screen.getByRole("button", { name: "添加变量" }));
    await user.click(screen.getByRole("tab", { name: "系统变量" }));
    expect(await screen.findByRole("group", { name: "变量" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "搜索变量" })).not.toBeInTheDocument();
    expect(systemVariableService.listSystemVariables).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "确认" })).toBeDisabled();

    expect(screen.getByRole("checkbox", { name: "客户昵称" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "上一次转人工时间" })).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "客户昵称" }));
    await user.click(screen.getByRole("checkbox", { name: "上一次转人工时间" }));
    expect(screen.getByRole("button", { name: "确认" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "确认" }));
    expect(screen.getByRole("list", { name: "已添加变量" })).toHaveTextContent(
      "系统变量 · 客户昵称",
    );
    expect(screen.getByRole("list", { name: "已添加变量" })).toHaveTextContent(
      "系统变量 · 上一次转人工时间",
    );
    expect(
      screen.queryByRole("button", { name: "编辑系统变量 · 客户昵称" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "添加变量" }));
    await user.click(screen.getByRole("tab", { name: "系统变量" }));
    expect(await screen.findByRole("checkbox", { name: "客户昵称" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "客户昵称" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "上一次转人工时间" })).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "上一次转人工时间" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "确认" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "取消" }));

    await user.click(screen.getByRole("button", { name: "添加变量" }));
    await user.click(screen.getByRole("tab", { name: "企微标签" }));
    expect(screen.queryByText("标签类型")).not.toBeInTheDocument();
    expect(await screen.findByLabelText("选择标签")).toBeInTheDocument();
    expect(await screen.findByRole("tab", { name: "普通标签" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "互斥标签" })).toBeInTheDocument();
    expect(workTagService.listWorkTagGroups).toHaveBeenCalledWith({
      attr: 1,
      type: 0,
    });
    expect(await screen.findByRole("button", { name: "意向标签组" })).toBeInTheDocument();
    const wecomTagCall = vi
      .mocked(workTagService.listWorkTags)
      .mock.calls.find(([params]) => params?.groupId === 11 && params?.type === 0);
    expect(wecomTagCall?.[0]).toMatchObject({
      groupId: 11,
      type: 0,
    });
    expect(wecomTagCall?.[0]).not.toHaveProperty("attr");
    await user.click(await screen.findByRole("checkbox", { name: "高意向" }));
    await user.click(screen.getByRole("button", { name: "确认" }));
    expect(screen.getByRole("list", { name: "已添加变量" })).toHaveTextContent(
      "企微标签 · 意向标签组 · 1个标签",
    );
    const wecomTagRow = screen.getByLabelText(
      "企微标签 · 意向标签组 · 1个标签标签详情",
    );
    await user.hover(wecomTagRow);
    expect((await screen.findAllByText("高意向")).length).toBeGreaterThan(0);

    await user.click(
      screen.getByRole("button", {
        name: "编辑企微标签 · 意向标签组 · 1个标签",
      }),
    );
    expect(await screen.findByRole("heading", { name: "编辑变量" })).toBeInTheDocument();
    expect(await screen.findByRole("list", { name: "标签组" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "搜索标签组" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "意向标签组" })).toBeDisabled();
    expect(screen.queryByRole("tab", { name: "普通标签" })).not.toBeInTheDocument();
    expect(await screen.findByRole("list", { name: "标签列表" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "高意向" })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "取消" }));

    await user.click(screen.getByRole("button", { name: "添加变量" }));
    expect(
      await screen.findByRole("button", { name: "意向标签组" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "确认" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "取消" }));

    await user.click(screen.getByRole("button", { name: "添加变量" }));
    await user.click(screen.getByRole("tab", { name: "小店标签" }));
    expect(await screen.findByLabelText("选择标签")).toBeInTheDocument();
    expect(workTagService.listWorkTags).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 12,
      }),
    );
    expect(await screen.findByRole("button", { name: "基础会员标签" })).toBeInTheDocument();
    await user.click(await screen.findByRole("checkbox", { name: "银卡会员" }));
    await user.click(screen.getByRole("button", { name: "确认" }));
    expect(screen.getByRole("list", { name: "已添加变量" })).toHaveTextContent(
      "小店标签 · 基础会员标签 · 1个标签",
    );
    const mallTagRow = screen.getByLabelText(
      "小店标签 · 基础会员标签 · 1个标签标签详情",
    );
    await user.hover(mallTagRow);
    expect((await screen.findAllByText("银卡会员")).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "添加变量" }));
    await user.click(screen.getByRole("tab", { name: "自动化标签" }));
    expect(await screen.findByLabelText("选择自动化标签")).toBeInTheDocument();
    expect(cdpTagService.listCdpTagGroups).toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: "价值分组" })).toBeInTheDocument();
    expect(await screen.findByRole("radio", { name: "高价值" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "低价值" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认" })).toBeDisabled();
    await user.click(screen.getByRole("radio", { name: "高价值" }));
    expect(screen.getByRole("button", { name: "确认" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "消费分组" }));
    expect(screen.getByRole("button", { name: "确认" })).toBeDisabled();
    expect(await screen.findByRole("radio", { name: "复购" })).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "复购" }));
    await user.click(screen.getByRole("button", { name: "确认" }));
    expect(screen.getByRole("list", { name: "已添加变量" })).toHaveTextContent(
      "自动化标签 · 消费分组 · 复购",
    );
    expect(
      screen.queryByRole("button", {
        name: "编辑自动化标签 · 消费分组 · 复购",
      }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "添加引用资源" }));
    let referenceList = await screen.findByRole("listbox", {
      name: "选择引用资源",
    });
    expect(within(referenceList).getByText("变量")).toBeInTheDocument();
    expect(
      within(referenceList).getByRole("option", {
        name: "企微标签 · 意向标签组 · 1个标签",
      }),
    ).toBeInTheDocument();
    expect(
      within(referenceList).getByRole("option", {
        name: "小店标签 · 基础会员标签 · 1个标签",
      }),
    ).toBeInTheDocument();
    expect(within(referenceList).queryByText("工具")).not.toBeInTheDocument();
    expect(within(referenceList).queryByText("知识库")).not.toBeInTheDocument();
    await user.click(
      within(referenceList).getByRole("option", {
        name: "自定义属性 · 性别",
      }),
    );
    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "技能描述" })).toHaveTextContent(
        "自定义属性 · 性别",
      );
    });
    expect(screen.getByRole("textbox", { name: "技能描述" })).not.toHaveTextContent(
      "variableType=",
    );

    await user.click(screen.getByRole("button", { name: "添加工具" }));
    expect(screen.getByRole("heading", { name: "插入工具" })).toBeInTheDocument();
    expect(screen.queryByText("绑定订单")).not.toBeInTheDocument();
    expect(screen.queryByText("物业查询")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "添加订单查询" }));
    await user.click(screen.getByRole("button", { name: "关闭" }));
    expect(screen.getByRole("list", { name: "已添加工具" })).toHaveTextContent("订单查询");

    await user.click(screen.getByRole("button", { name: "添加引用资源" }));
    referenceList = await screen.findByRole("listbox", {
      name: "选择引用资源",
    });
    await user.click(
      within(referenceList).getByRole("option", { name: "订单查询" }),
    );
    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "技能描述" })).toHaveTextContent("订单查询");
    });

    await user.click(screen.getByRole("button", { name: "添加知识库" }));
    expect(screen.getByRole("heading", { name: "选择知识库" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "前往知识库管理" })).toHaveAttribute(
      "href",
      "/chat/ai-hosting/kb",
    );
    expect(screen.getByRole("textbox", { name: "搜索知识库" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "知识库名称" })).toBeInTheDocument();
    expect(await screen.findByText("华为产品知识")).toBeInTheDocument();
    expect(screen.getByText("售后问题解答")).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "选择华为产品知识" }));
    expect(screen.getByText("已选择 1/10")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "确认" }));
    expect(screen.getByRole("list", { name: "已添加知识库" })).toHaveTextContent(
      "华为产品知识",
    );
    expect(kbService.listKbs).toHaveBeenCalledWith({
      page: 1,
      pageSize: 10,
      query: "",
    });

    await user.click(screen.getByRole("button", { name: "添加引用资源" }));
    referenceList = await screen.findByRole("listbox", {
      name: "选择引用资源",
    });
    await user.click(
      within(referenceList).getByRole("option", { name: "华为产品知识" }),
    );
    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "技能描述" })).toHaveTextContent(
        "华为产品知识",
      );
    });

    await user.click(screen.getByRole("button", { name: "添加知识库" }));
    const selectedKnowledgeBase = await screen.findByRole("checkbox", {
      name: "选择华为产品知识",
    });
    expect(selectedKnowledgeBase).toBeChecked();
    expect(selectedKnowledgeBase).toBeEnabled();
    await user.click(selectedKnowledgeBase);
    expect(screen.getByText("已选择 0/10")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "确认" }));
    expect(
      screen.queryByRole("list", { name: "已添加知识库" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "技能描述" })).not.toHaveTextContent(
      "华为产品知识",
    );
  });

  it("keeps the variable picker open when adding more than ten variables", async () => {
    const user = userEvent.setup();
    vi.mocked(customFieldService.listCustomFields).mockResolvedValueOnce({
      fields: Array.from(
        { length: AGENT_SKILL_VARIABLE_MAX_COUNT + 1 },
        (_, index) => ({
          id: index + 1,
          key: `field_${index + 1}`,
          options: [],
          sort: index + 1,
          title: `字段 ${index + 1}`,
          type: 1,
        }),
      ),
    });

    renderWithRoute("/chat/ai-hosting/skills/new", <AiSkillSettingsPage />);

    await user.click(screen.getByRole("button", { name: "添加变量" }));
    await user.click(screen.getByRole("tab", { name: "自定义属性" }));
    const variableDialog = screen.getByRole("dialog");
    const fields = await within(variableDialog).findAllByRole("checkbox");
    expect(fields).toHaveLength(AGENT_SKILL_VARIABLE_MAX_COUNT + 1);
    for (const field of fields) {
      await user.click(field);
    }
    await user.click(within(variableDialog).getByRole("button", { name: "确认" }));

    expect(toast.error).toHaveBeenCalledWith("最多添加 10 个变量");
    expect(screen.getByRole("heading", { name: "添加变量" })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "已添加变量" })).not.toBeInTheDocument();
  });

  it("disables the tool picker after adding ten tools", async () => {
    const user = userEvent.setup();
    const existingTools = Array.from(
      { length: AGENT_SKILL_TOOL_MAX_COUNT },
      (_, index) => ({
        description: "",
        id: `existing-tool-${index}`,
        placeholder: `<resource type="tool" toolId="existing-tool-${index}" name="已有工具 ${index}" />`,
        status: "available" as const,
        title: `已有工具 ${index}`,
        toolKey: `existing-tool-${index}`,
      }),
    );
    const router = createMemoryRouter(
      [
        {
          path: "/chat/ai-hosting/skills/new",
          element: <AiSkillSettingsPage />,
        },
      ],
      {
        initialEntries: [
          {
            pathname: "/chat/ai-hosting/skills/new",
            state: {
              [SKILL_CREATE_DRAFT_STATE_KEY]: {
                content: "已有工具",
                resources: {
                  "knowledge-bases": [],
                  tools: existingTools,
                  variables: [],
                },
              },
            },
          },
        ],
      },
    );

    render(<RouterProvider router={router} />);

    const addToolButton = screen.getByRole("button", { name: "添加工具" });
    expect(screen.getByText("10/10")).toBeInTheDocument();
    expect(addToolButton).toBeDisabled();
    await user.click(addToolButton);
    expect(screen.queryByRole("heading", { name: "插入工具" })).not.toBeInTheDocument();
  });

  it("disables the variable picker when existing variables exceed ten", async () => {
    const user = userEvent.setup();
    const existingVariables = Array.from(
      { length: AGENT_SKILL_VARIABLE_MAX_COUNT + 1 },
      (_, index) => ({
        description: "",
        id: `system_variable:existing_${index}`,
        placeholder: `<resource type="variable" variableType="system_variable" selectKey="existing_${index}" name="已有变量 ${index}" />`,
        status: "available" as const,
        title: `已有变量 ${index}`,
        variable: {
          name: `已有变量 ${index}`,
          select_key: `existing_${index}`,
          type: "system_variable" as const,
        },
      }),
    );
    const router = createMemoryRouter(
      [
        {
          path: "/chat/ai-hosting/skills/new",
          element: <AiSkillSettingsPage />,
        },
      ],
      {
        initialEntries: [
          {
            pathname: "/chat/ai-hosting/skills/new",
            state: {
              [SKILL_CREATE_DRAFT_STATE_KEY]: {
                content: "已有变量",
                resources: {
                  "knowledge-bases": [],
                  tools: [],
                  variables: existingVariables,
                },
              },
            },
          },
        ],
      },
    );

    render(<RouterProvider router={router} />);

    const addVariableButton = screen.getByRole("button", { name: "添加变量" });
    expect(screen.getByText("11/10")).toBeInTheDocument();
    expect(addVariableButton).toBeDisabled();
    await user.click(addVariableButton);
    expect(
      screen.queryByRole("heading", { name: "添加变量" }),
    ).not.toBeInTheDocument();
  });

  it.each([
    ["企微普通标签", "企微标签", "普通标签", "普通标签"],
    ["企微互斥标签", "企微标签", "互斥标签", "互斥标签"],
    ["小店标签", "小店标签", null, "小店标签"],
  ])(
    "limits %s to ten selections per group",
    async (_label, variableTab, wecomTab, tagPrefix) => {
      const user = userEvent.setup();

      vi.mocked(workTagService.listWorkTagGroups).mockImplementation(
        async ({ attr = 1 } = {}) => ({
          groups: [
            {
              attr,
              id: attr === 2 ? 21 : 11,
              name: attr === 2 ? "互斥标签组" : "普通标签组",
              tagCount: AGENT_SKILL_TAG_MAX_COUNT + 1,
            },
          ],
        }),
      );
      vi.mocked(workTagService.listWorkTags).mockImplementation(async (params) => {
        const isMallTag = params?.type === 12;
        const groupId = isMallTag ? 31 : (params?.groupId ?? 11);
        const groupAttr = groupId === 21 ? 2 : 1;
        const prefix = isMallTag
          ? "小店标签"
          : groupAttr === 2
            ? "互斥标签"
            : "普通标签";
        const tags = Array.from(
          { length: AGENT_SKILL_TAG_MAX_COUNT + 1 },
          (_, index) => ({
            groupAttr: groupAttr as 1 | 2,
            groupId,
            groupName: `${prefix}组`,
            groupSort: 10,
            id: groupId * 100 + index + 1,
            name: `${prefix} ${index + 1}`,
            type: (isMallTag ? 12 : 0) as 0 | 12,
          }),
        );

        return {
          pagination: {
            hasNext: false,
            page: params?.page ?? 1,
            pageSize: params?.pageSize ?? 50,
            total: tags.length,
          },
          tags,
        };
      });

      renderWithRoute("/chat/ai-hosting/skills/new", <AiSkillSettingsPage />);

      await user.click(screen.getByRole("button", { name: "添加变量" }));
      await user.click(screen.getByRole("tab", { name: variableTab }));
      if (wecomTab === "互斥标签") {
        await user.click(screen.getByRole("tab", { name: wecomTab }));
      }

      const dialog = screen.getByRole("dialog");
      for (let index = 1; index <= AGENT_SKILL_TAG_MAX_COUNT; index += 1) {
        await user.click(
          await within(dialog).findByRole("checkbox", {
            name: `${tagPrefix} ${index}`,
          }),
        );
      }

      const eleventhTag = await within(dialog).findByRole("checkbox", {
        name: `${tagPrefix} ${AGENT_SKILL_TAG_MAX_COUNT + 1}`,
      });
      await user.click(eleventhTag);

      expect(eleventhTag).not.toBeChecked();
      expect(toast.error).toHaveBeenCalledWith("最多选择 10 个标签");
    },
  );

  it("loads more WeCom tags without losing selections from previous pages", async () => {
    const user = userEvent.setup();

    vi.mocked(workTagService.listWorkTags).mockImplementation(async (params) => {
      const page = params?.page ?? 1;
      const tags =
        page === 1
          ? [
              {
                groupAttr: 1 as const,
                groupId: 11,
                groupName: "意向标签组",
                groupSort: 10,
                id: 111,
                name: "高意向",
                type: 0 as const,
              },
            ]
          : [
              {
                groupAttr: 1 as const,
                groupId: 11,
                groupName: "意向标签组",
                groupSort: 10,
                id: 112,
                name: "中意向",
                type: 0 as const,
              },
            ];

      return {
        pagination: {
          hasNext: page === 1,
          page,
          pageSize: params?.pageSize ?? 50,
          total: 2,
        },
        tags,
      };
    });

    renderWithRoute("/chat/ai-hosting/skills/new", <AiSkillSettingsPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "添加变量" })).toBeEnabled();
    });
    await user.click(screen.getByRole("button", { name: "添加变量" }));
    const firstPageTag = await screen.findByRole("checkbox", { name: "高意向" });
    await user.click(firstPageTag);

    await user.click(screen.getByRole("button", { name: "加载更多" }));

    expect(await screen.findByRole("checkbox", { name: "中意向" })).toBeInTheDocument();
    expect(firstPageTag).toBeChecked();
    expect(workTagService.listWorkTags).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: 11,
        page: 1,
        pageSize: 50,
        type: 0,
      }),
    );
    expect(workTagService.listWorkTags).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: 11,
        page: 2,
        pageSize: 50,
        type: 0,
      }),
    );
    expect(screen.queryByRole("button", { name: "加载更多" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "中意向" }));
    await user.click(screen.getByRole("button", { name: "确认" }));
    expect(screen.getByRole("list", { name: "已添加变量" })).toHaveTextContent(
      "企微标签 · 意向标签组 · 2个标签",
    );
  });

  it("searches, paginates, and limits knowledge base selection to ten", async () => {
    const user = userEvent.setup();
    const knowledgeBases = Array.from({ length: 11 }, (_, index) => {
      const sequence = String(index + 1).padStart(2, "0");

      return {
        createdAt: "2026-07-01 10:00:00",
        description: `测试描述 ${sequence}`,
        kbId: String(index + 1),
        name: `测试知识库 ${sequence}`,
        updatedAt: "2026-07-02 10:00:00",
      };
    });

    vi.mocked(kbService.listKbs).mockImplementation(async (params) => {
      const page = params?.page ?? 1;
      const pageSize = params?.pageSize ?? 10;
      const query = params?.query?.trim() ?? "";
      const filteredItems = knowledgeBases.filter(
        (item) => !query || item.name.includes(query),
      );
      const start = (page - 1) * pageSize;

      return {
        kbs: filteredItems.slice(start, start + pageSize),
        pagination: {
          page,
          pageSize,
          total: filteredItems.length,
        },
      };
    });

    renderWithRoute("/chat/ai-hosting/skills/new", <AiSkillSettingsPage />);

    await user.click(screen.getByRole("button", { name: "添加知识库" }));
    const dialog = screen.getByRole("dialog");
    const searchInput = within(dialog).getByRole("textbox", {
      name: "搜索知识库",
    });

    await user.type(searchInput, "11");
    await waitFor(() => {
      expect(kbService.listKbs).toHaveBeenLastCalledWith({
        page: 1,
        pageSize: 10,
        query: "11",
      });
    });
    expect(await within(dialog).findByText("测试知识库 11")).toBeInTheDocument();
    expect(within(dialog).queryByText("测试知识库 01")).not.toBeInTheDocument();

    await user.clear(searchInput);
    await waitFor(() => {
      expect(kbService.listKbs).toHaveBeenLastCalledWith({
        page: 1,
        pageSize: 10,
        query: "",
      });
    });
    expect(await within(dialog).findByText("测试知识库 01")).toBeInTheDocument();

    const firstPageCheckboxes = within(dialog).getAllByRole("checkbox");
    expect(firstPageCheckboxes).toHaveLength(10);
    for (const checkbox of firstPageCheckboxes) {
      await user.click(checkbox);
    }
    expect(within(dialog).getByText("已选择 10/10")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "下一页" }));
    await waitFor(() => {
      expect(kbService.listKbs).toHaveBeenLastCalledWith({
        page: 2,
        pageSize: 10,
        query: "",
      });
    });
    const eleventhCheckbox = await within(dialog).findByRole("checkbox", {
      name: "选择测试知识库 11",
    });
    expect(eleventhCheckbox).toBeDisabled();

    await user.click(within(dialog).getByRole("button", { name: "确认" }));
    expect(
      within(screen.getByRole("list", { name: "已添加知识库" })).getAllByRole(
        "listitem",
      ),
    ).toHaveLength(10);

    await user.click(screen.getByRole("button", { name: "添加知识库" }));
    const reopenedDialog = screen.getByRole("dialog");
    const addedCheckbox = await within(reopenedDialog).findByRole("checkbox", {
      name: "选择测试知识库 01",
    });
    expect(addedCheckbox).toBeChecked();
    expect(addedCheckbox).toBeEnabled();
    await user.click(addedCheckbox);
    expect(within(reopenedDialog).getByText("已选择 9/10")).toBeInTheDocument();
    await user.click(
      within(reopenedDialog).getByRole("button", { name: "下一页" }),
    );
    const replacementCheckbox = await within(reopenedDialog).findByRole(
      "checkbox",
      {
        name: "选择测试知识库 11",
      },
    );
    expect(replacementCheckbox).toBeEnabled();
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
      within(loadFailureDialog).getByRole("button", { name: "返回列表" }),
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

  it("renders bound resources from the agent detail without per-resource requests", async () => {
    vi.mocked(kbService.getKb).mockClear();
    vi.mocked(kbService.listKbs).mockClear();
    vi.mocked(agentSkillService.getAgentSkill).mockClear();
    vi.mocked(agentSkillService.listAgentSkills).mockClear();
    vi.mocked(agentService.getAiHostingAgent).mockResolvedValueOnce({
      ...mockAgentDetail,
      availableKbs: [
        { id: "3", name: "真实彩妆知识库", status: "available" },
      ],
      availableSkills: [
        { id: "1", name: "订单与物流场景查询", status: "available" },
      ],
      promptConfig: {
        ...mockAgentDetail.promptConfig,
        availableKbIds: [3],
        availableSkillIds: [1],
      },
    });

    renderWithRoute(
      "/chat/ai-hosting/agents/301",
      <AgentSettingsPage />,
      "/chat/ai-hosting/agents/:agentId",
    );

    expect(
      within(await screen.findByRole("list", { name: "已添加知识库" })).getByText(
        "真实彩妆知识库",
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("list", { name: "已添加技能" })).getByText(
        "订单与物流场景查询",
      ),
    ).toBeInTheDocument();
    expect(kbService.getKb).not.toHaveBeenCalled();
    expect(kbService.listKbs).not.toHaveBeenCalled();
    expect(agentSkillService.getAgentSkill).not.toHaveBeenCalled();
    expect(agentSkillService.listAgentSkills).not.toHaveBeenCalled();
  });

  it("shows invalid resources in the panel and conditional logic without false publish changes", async () => {
    const user = userEvent.setup();

    vi.mocked(agentService.getAiHostingAgent).mockResolvedValueOnce({
      ...mockInvalidAgentDetail,
      hasUnpublishedChanges: false,
    });

    renderWithRoute(
      "/chat/ai-hosting/agents/301",
      <AgentSettingsPage />,
      "/chat/ai-hosting/agents/:agentId",
    );

    await screen.findByRole("img", {
      name: "已删除知识库已失效",
    });
    const invalidSkillIcon = screen.getByRole("img", {
      name: "已停用技能已失效",
    });

    await user.hover(invalidSkillIcon);
    await waitFor(() => {
      expect(
        Array.from(
          document.querySelectorAll('[data-slot="tooltip-content"]'),
        ).some((element) => element.textContent?.includes("技能已停用")),
      ).toBe(true);
    });
    await user.unhover(invalidSkillIcon);

    const invalidKbChip = await screen.findByLabelText(
      "已删除知识库，知识库已被删除",
    );
    const invalidSkillChip = screen.getByLabelText("已停用技能，技能已停用");

    expect(invalidKbChip).toHaveAttribute("data-resource-invalid", "true");
    expect(invalidKbChip).not.toHaveAttribute("title");
    expect(invalidSkillChip).toHaveAttribute("data-resource-invalid", "true");
    expect(invalidSkillChip).not.toHaveAttribute("title");

    await user.hover(invalidKbChip);
    await waitFor(() => {
      expect(
        Array.from(
          document.querySelectorAll('[data-slot="tooltip-content"]'),
        ).some((element) => element.textContent?.includes("知识库已被删除")),
      ).toBe(true);
    });
    expect(screen.getByRole("button", { name: "发布正式版" })).toBeDisabled();
  });

  it("blocks saving and publishing while invalid resources remain", async () => {
    const user = userEvent.setup();

    vi.mocked(agentService.getAiHostingAgent).mockResolvedValueOnce(
      mockInvalidAgentDetail,
    );

    renderWithRoute(
      "/chat/ai-hosting/agents/301",
      <AgentSettingsPage />,
      "/chat/ai-hosting/agents/:agentId",
    );

    await screen.findByRole("img", { name: "已删除知识库已失效" });
    await user.click(screen.getByRole("button", { name: "保存" }));

    let blockedDialog = await screen.findByRole("alertdialog", {
      name: "无法保存 Agent",
    });
    expect(within(blockedDialog).getByText("已删除知识库")).toBeInTheDocument();
    expect(within(blockedDialog).getByText("已停用技能")).toBeInTheDocument();
    expect(agentService.updateAiHostingAgent).not.toHaveBeenCalled();

    await user.click(within(blockedDialog).getByRole("button", { name: "知道了" }));
    await user.click(screen.getByRole("button", { name: "发布正式版" }));
    const publishDialog = await screen.findByRole("dialog", {
      name: "是否确认发布到正式版？",
    });
    await user.click(within(publishDialog).getByRole("button", { name: "发布" }));

    blockedDialog = await screen.findByRole("alertdialog", {
      name: "无法发布 Agent",
    });
    expect(within(blockedDialog).getByText("已删除知识库")).toBeInTheDocument();
    expect(agentService.updateAiHostingAgent).not.toHaveBeenCalled();
    expect(agentService.publishAiHostingAgent).not.toHaveBeenCalled();
  });

  it("marks resources invalid when the backend detects deletion during save", async () => {
    const user = userEvent.setup();

    vi.mocked(agentService.getAiHostingAgent).mockResolvedValueOnce({
      ...mockAgentDetail,
      availableKbs: [
        { id: "100", name: "活动知识库", status: "available" },
      ],
      promptConfig: {
        ...mockAgentDetail.promptConfig,
        availableKbIds: [100],
        conditionLogic:
          '<resource type="knowledge_base" kbId="100" name="活动知识库" />',
      },
    });
    vi.mocked(agentService.updateAiHostingAgent).mockRejectedValueOnce({
      code: "AGENT_RESOURCES_INVALID",
      details: {
        knowledgeBases: [
          {
            id: "100",
            invalidReason: "deleted",
            name: "活动知识库",
            status: "invalid",
          },
        ],
        skills: [],
      },
      message: "Agent 依赖的资源已失效，请移除后重试",
      status: 400,
    });

    renderWithRoute(
      "/chat/ai-hosting/agents/301",
      <AgentSettingsPage />,
      "/chat/ai-hosting/agents/:agentId",
    );

    await waitFor(() => {
      expect(screen.getByLabelText("行为指引描述")).toHaveTextContent(
        "活动知识库",
      );
    });
    await user.click(screen.getByRole("button", { name: "保存" }));

    const blockedDialog = await screen.findByRole("alertdialog", {
      name: "无法保存 Agent",
    });
    expect(blockedDialog).toHaveTextContent("活动知识库");
    await user.click(within(blockedDialog).getByRole("button", { name: "知道了" }));
    expect(
      await screen.findByRole("img", { name: "活动知识库已失效" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByLabelText("活动知识库，知识库已被删除"),
    ).toHaveAttribute("data-resource-invalid", "true");
    expect(
      screen.queryByRole("alertdialog", { name: "保存 Agent 失败" }),
    ).not.toBeInTheDocument();
  });

  it("returns to the agent list from the initial load failure dialog", async () => {
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
      within(loadFailureDialog).getByRole("button", { name: "返回列表" }),
    );

    expect(router.state.location.pathname).toBe("/chat/ai-hosting/agents");
  });

  it("does not focus the conditional logic editor while restoring agent settings", async () => {
    const focusedConditionalLogicEditors: HTMLElement[] = [];
    const focusSpy = vi
      .spyOn(HTMLElement.prototype, "focus")
      .mockImplementation(function focus(this: HTMLElement) {
        if (this.getAttribute("aria-label") === "行为指引描述") {
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
      expect(screen.getByRole("group", { name: "行为指引" })).toHaveTextContent(
        "如果客户咨询成分",
      );

      expect(focusedConditionalLogicEditors).toHaveLength(0);
      expect(screen.getByLabelText("行为指引描述")).not.toBe(document.activeElement);
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

  it("reports a list refresh failure separately after an agent is deleted", async () => {
    const user = userEvent.setup();

    renderWithRoute("/chat/ai-hosting/agents", <AgentManagementPage />);

    await screen.findByRole("link", { name: "护肤小助理" });
    vi.mocked(agentService.listAiHostingAgents).mockRejectedValueOnce(
      new Error("refresh failed"),
    );
    await user.click(screen.getAllByRole("button", { name: /更多操作/ })[0]);
    await user.click(screen.getByRole("menuitem", { name: "删除" }));
    await user.click(screen.getByRole("button", { name: "确认删除" }));

    await waitFor(() => {
      expect(agentService.removeAiHostingAgent).toHaveBeenCalledWith("301");
    });
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("加载失败，请稍后重试");
    });
    expect(toast.error).not.toHaveBeenCalledWith("删除 Agent 失败");
  });

  it("toasts when an agent cannot be deleted", async () => {
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

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Agent 已被托管设置引用，不能删除");
    });
    expect(screen.queryByRole("alertdialog", { name: "删除 Agent 失败" })).not.toBeInTheDocument();
  });

  it("renders the hosting settings page", async () => {
    renderWithRoute("/chat/ai-hosting/hosting-settings", <AgentHostingSettingsPage />);

    expect(await screen.findByRole("heading", { level: 1, name: "托管设置" })).toBeInTheDocument();
    await waitFor(() => {
      expect(agentService.listAiHostingSettings).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText("配置托管账号关联的 Agent 和托管策略")).toBeInTheDocument();
    const featureOverview = screen.getByRole("region", { name: "托管功能说明" });

    expect(
      within(featureOverview).getByRole("heading", { name: "AI 自动回复" }),
    ).toBeInTheDocument();
    expect(
      within(featureOverview).getByRole("heading", { name: "话术推荐" }),
    ).toBeInTheDocument();
    expect(within(featureOverview).getByText("已为 1 个账号开启")).toBeInTheDocument();
    expect(within(featureOverview).getByText("已为 2 个账号开启")).toBeInTheDocument();
    expect(
      within(featureOverview).getByRole("img", { name: "AI 自动回复功能插图" }),
    ).toHaveAttribute("src", "https://b5.bokr.com.cn/dist/ui/hosting-f1.png");
    expect(
      within(featureOverview).getByRole("img", { name: "话术推荐功能插图" }),
    ).toHaveAttribute("src", "https://b5.bokr.com.cn/dist/ui/hosting-f2.png");
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
    expect(
      within(dialog).getByRole("radiogroup", { name: "回复规则" }),
    ).toBeInTheDocument();

    await user.click(within(dialog).getByRole("switch", { name: "允许开启 AI回复" }));

    expect(
      within(dialog).queryByRole("radiogroup", { name: "回复规则" }),
    ).not.toBeInTheDocument();
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

  it("toasts group chat save errors while keeping the dialog open", async () => {
    const user = userEvent.setup();
    vi.mocked(agentService.updateAiHostingGroupSettings).mockRejectedValueOnce(
      new Error("保存失败"),
    );

    renderWithRoute("/chat/ai-hosting/hosting-settings", <AgentHostingSettingsPage />);

    await screen.findByRole("heading", { level: 1, name: "托管设置" });
    await user.click(screen.getByRole("button", { name: "打开 小助理2 托管设置菜单" }));
    await user.click(screen.getByRole("menuitem", { name: "群聊设置" }));
    await user.click(screen.getByRole("button", { name: "保存设置" }));

    expect(screen.getByRole("dialog", { name: "群聊设置" })).toBeInTheDocument();
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("保存失败");
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
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

  it("toasts save errors while keeping the hosting settings dialog open", async () => {
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
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("保存失败，请稍后重试");
    });
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
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
    const user = userEvent.setup();

    renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsPage />);

    expect(await screen.findByRole("heading", { level: 1, name: "创建 Agent" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "智能生成" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "发布正式版" })).not.toBeInTheDocument();
    expect(screen.getByText("基本设置")).toBeInTheDocument();
    expect(screen.queryByText("回复基调")).not.toBeInTheDocument();
    expect(screen.getByText("角色定义")).toBeInTheDocument();
    expect(screen.getByText("角色")).toBeInTheDocument();
    expect(screen.getByText("沟通风格")).toBeInTheDocument();
    expect(screen.queryByText("语气风格")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看模板" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看角色说明" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看沟通风格说明" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "😊 亲切自然" })).not.toBeInTheDocument();
    expect(screen.getByText("回复长度")).toBeInTheDocument();
    expect(
      screen.getByText("沟通风格").compareDocumentPosition(screen.getByRole("button", { name: "查看模板" })),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    await user.hover(screen.getByRole("button", { name: "查看角色说明" }));
    expect(await screen.findByRole("tooltip")).toBeInTheDocument();
    expect(screen.getByText("行为指引")).toBeInTheDocument();
    expect(screen.getByText("转人工条件")).toBeInTheDocument();
    expect(await screen.findByTitle("模型图标：默认模型")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "资源管理" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "添加技能" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "添加知识库" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Agent 预览调试" })).not.toBeInTheDocument();

    const previewPanel = await openAgentPreview(user);

    const clearButton = within(previewPanel).getByRole("button", { name: "清空上下文" });
    expect(clearButton).toBeInTheDocument();
    expect(within(previewPanel).getByRole("button", { name: "关闭预览调试" })).toBeInTheDocument();
    expect(within(previewPanel).queryByRole("button", { name: "收起预览调试" })).not.toBeInTheDocument();
    expect(within(previewPanel).getByLabelText("选择图片")).toBeInTheDocument();

    await user.hover(clearButton);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("清空上下文");
  });

  it("clears Agent field errors when the related field changes", async () => {
    const user = userEvent.setup();

    renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsPage />);

    await screen.findByRole("heading", { level: 1, name: "创建 Agent" });
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(screen.getByText("请输入 Agent 名称")).toBeInTheDocument();
    expect(screen.getByLabelText("Agent 名称")).toHaveAttribute("aria-invalid", "true");

    await user.type(screen.getByLabelText("Agent 名称"), "护肤助理");

    expect(screen.queryByText("请输入 Agent 名称")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Agent 名称")).not.toHaveAttribute("aria-invalid");
  });

  it("clears preview chat messages and input draft", async () => {
    const user = userEvent.setup();

    renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsPage />);

    await screen.findByRole("heading", { level: 1, name: "创建 Agent" });
    await openAgentPreview(user);
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

    await user.click(screen.getByRole("button", { name: "清空上下文" }));

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
    await openAgentPreview(user);
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
    await openAgentPreview(user);
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

    const previewPanel = screen.getByRole("region", { name: "Agent 预览调试" });

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
    await openAgentPreview(user);
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
    await openAgentPreview(user);
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

  it("uses the frontend name length limit for agent names", async () => {
    renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsPage />);

    await screen.findByRole("heading", { level: 1, name: "创建 Agent" });

    expect(screen.getByLabelText("Agent 名称")).toHaveAttribute("maxLength", "20");
  });

  it("uses the field-specific agent settings character limits", async () => {
    renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsPage />);

    await screen.findByRole("heading", { level: 1, name: "创建 Agent" });

    expect(screen.getByLabelText("角色描述")).toHaveAttribute("maxLength", "400");
    expect(screen.getByLabelText("沟通风格")).toHaveAttribute("maxLength", "800");
    expect(screen.getByLabelText("转人工条件")).toHaveAttribute("maxLength", "2000");
    expect(screen.getByText("0/400")).toBeInTheDocument();
    expect(screen.getByText("0/800")).toBeInTheDocument();
    expect(screen.getByText("0/8000")).toBeInTheDocument();
    expect(screen.getByText("0/2000")).toBeInTheDocument();
  });

  it("trims conditional logic input at 8000 visible characters", async () => {
    const user = userEvent.setup();

    renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsPage />);

    const editor = await screen.findByLabelText("行为指引描述");
    await user.click(editor);
    await user.paste("a".repeat(8001));

    await waitFor(() => {
      expect(editor).toHaveTextContent("a".repeat(8000));
    });
    expect(screen.getByText("8000/8000")).toBeInTheDocument();
  });

  it("rejects a conditional logic resource atomically when its chip does not fit", async () => {
    const user = userEvent.setup();
    const knowledgeBaseName = "超长知识库名称测试";

    vi.mocked(kbService.listKbs).mockResolvedValue({
      kbs: [
        {
          createdAt: "2026-06-20T08:00:00.000Z",
          description: "",
          kbId: "3",
          name: knowledgeBaseName,
          updatedAt: "2026-06-20T08:00:00.000Z",
        },
      ],
      pagination: {
        page: 1,
        pageSize: 10,
        total: 1,
      },
    });

    renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsPage />);

    const editor = await screen.findByLabelText("行为指引描述");
    await user.click(editor);
    await user.paste("a".repeat(7995));
    await addAgentKnowledgeBases(user, [knowledgeBaseName]);
    await user.click(screen.getByRole("button", { name: "添加引用资源" }));
    await user.click(await screen.findByRole("option", { name: knowledgeBaseName }));

    await waitFor(() => {
      expect(editor).toHaveTextContent("a".repeat(7995));
    });
    expect(editor.querySelector("[data-knowledge-base-chip='true']")).toBeNull();
    expect(screen.getByText("7995/8000")).toBeInTheDocument();
  });

  it("trims oversized conditional logic while hydrating an existing agent", async () => {
    const allowedText = "a".repeat(8000);

    vi.mocked(agentService.getAiHostingAgent).mockResolvedValueOnce({
      ...mockAgentDetail,
      promptConfig: {
        ...mockAgentDetail.promptConfig,
        conditionLogic: `${allowedText}多`,
      },
    });

    renderWithRoute(
      "/chat/ai-hosting/agents/301",
      <AgentSettingsPage />,
      "/chat/ai-hosting/agents/:agentId",
    );

    const editor = await screen.findByLabelText("行为指引描述");

    await waitFor(() => {
      expect(editor).toHaveTextContent(allowedText);
    });
    expect(screen.getByText("8000/8000")).toBeInTheDocument();
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

  it("defaults user memory off and saves the enabled setting", async () => {
    const user = userEvent.setup();

    renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsPage />);

    await screen.findByRole("heading", { level: 1, name: "创建 Agent" });
    const userMemorySwitch = screen.getByRole("switch", { name: "客户记忆" });

    expect(userMemorySwitch).not.toBeChecked();
    await user.click(userMemorySwitch);
    await user.clear(screen.getByLabelText("Agent 名称"));
    await user.type(screen.getByLabelText("Agent 名称"), "记忆小助理");
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(agentService.createAiHostingAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          promptConfig: expect.objectContaining({
            useUserMemory: true,
          }),
        }),
      );
    });
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
    expect(screen.getByRole("button", { name: "添加知识库" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "添加技能" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "添加引用资源" }),
    ).toBeDisabled();

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
    const user = userEvent.setup();

    renderWithRoute("/chat/ai-hosting/agents/301", <AgentSettingsPage />, "/chat/ai-hosting/agents/:agentId");

    await screen.findByRole("heading", { level: 1, name: "护肤小助理" });

    const previewPanel = await openAgentPreview(user);

    expect(within(previewPanel).getByRole("heading", { level: 2, name: "预览调试" })).toBeInTheDocument();
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

  it("toasts Agent save failures", async () => {
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

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("请选择有效的大模型");
    });
    expect(screen.queryByRole("alertdialog", { name: "保存 Agent 失败" })).not.toBeInTheDocument();
  });

  it("toasts Agent publish failures", async () => {
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

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Agent 未发布");
    });
    expect(screen.queryByRole("alertdialog", { name: "发布 Agent 失败" })).not.toBeInTheDocument();
  });

  it("toasts Agent rename failures", async () => {
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

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Agent 名称已存在");
    });
    expect(screen.queryByRole("alertdialog", { name: "保存 Agent 名称失败" })).not.toBeInTheDocument();
  });

  it("toasts Agent restore failures", async () => {
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

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("暂无正式版内容");
    });
    expect(screen.queryByRole("alertdialog", { name: "还原正式版失败" })).not.toBeInTheDocument();
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
    expect(screen.queryByRole("button", { name: "保存" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "智能生成" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "发布正式版" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "编辑 Agent 名称" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "还原为正式版" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Agent 名称")).toBeDisabled();
    expect(screen.getByLabelText("角色描述")).toBeDisabled();
    expect(screen.getByLabelText("沟通风格")).toBeDisabled();
    expect(screen.getByLabelText("转人工条件")).toBeDisabled();
    expect(screen.getByLabelText("行为指引描述")).toHaveAttribute("aria-disabled", "true");
  });

  it("selects knowledge bases across pages and saves them without conditional logic chips", async () => {
    const user = userEvent.setup();
    vi.mocked(kbService.listKbs).mockImplementation(async (params = {}) => ({
      kbs: [
        (params.page ?? 1) === 1
          ? {
              createdAt: "2026-06-20T08:00:00.000Z",
              description: "护肤内容",
              kbId: "1",
              name: "真实护肤知识库",
              updatedAt: "2026-06-20T08:00:00.000Z",
            }
          : {
              createdAt: "2026-06-20T08:00:00.000Z",
              description: "彩妆内容",
              kbId: "3",
              name: "真实彩妆知识库",
              updatedAt: "2026-06-20T08:00:00.000Z",
            },
      ],
      pagination: { page: params.page ?? 1, pageSize: 10, total: 11 },
    }));

    renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsPage />);

    await screen.findByRole("heading", { level: 1, name: "创建 Agent" });
    await user.click(screen.getByRole("button", { name: "添加知识库" }));
    const dialog = await screen.findByRole("dialog", { name: "添加知识库" });

    await user.click(await within(dialog).findByRole("checkbox", { name: "选择真实护肤知识库" }));
    await user.click(within(dialog).getByRole("button", { name: "下一页" }));
    await user.click(await within(dialog).findByRole("checkbox", { name: "选择真实彩妆知识库" }));
    expect(within(dialog).getByText("已选择 2/10")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "确认" }));

    const addedKnowledgeBases = screen.getByRole("list", { name: "已添加知识库" });
    expect(within(addedKnowledgeBases).getByText("真实护肤知识库")).toBeInTheDocument();
    expect(within(addedKnowledgeBases).getByText("真实彩妆知识库")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Agent 名称"));
    await user.type(screen.getByLabelText("Agent 名称"), "新品小助理");
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(agentService.createAiHostingAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          promptConfig: expect.objectContaining({
            availableKbIds: [1, 3],
            availableSkillIds: [],
            conditionLogic: "",
          }),
        }),
      );
    });
  });

  it("loads resource picker search on the server and keeps added items selected", async () => {
    const user = userEvent.setup();
    vi.mocked(kbService.listKbs).mockImplementation(async (params = {}) => ({
      kbs: [
        {
          createdAt: "2026-06-20T08:00:00.000Z",
          description: "彩妆内容",
          kbId: "3",
          name: "真实彩妆知识库",
          updatedAt: "2026-06-20T08:00:00.000Z",
        },
      ],
      pagination: {
        page: params.page ?? 1,
        pageSize: params.pageSize ?? 10,
        total: 1,
      },
    }));

    renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsPage />);

    await screen.findByRole("heading", { level: 1, name: "创建 Agent" });
    await user.click(screen.getByRole("button", { name: "添加知识库" }));
    let dialog = await screen.findByRole("dialog", { name: "添加知识库" });
    await user.type(within(dialog).getByRole("textbox", { name: "搜索知识库" }), "彩妆");

    await waitFor(() => {
      expect(kbService.listKbs).toHaveBeenLastCalledWith({
        page: 1,
        pageSize: 10,
        query: "彩妆",
      });
    });
    await user.click(await within(dialog).findByRole("checkbox", { name: "选择真实彩妆知识库" }));
    await user.click(within(dialog).getByRole("button", { name: "确认" }));

    await user.click(screen.getByRole("button", { name: "添加知识库" }));
    dialog = await screen.findByRole("dialog", { name: "添加知识库" });
    expect(await within(dialog).findByRole("checkbox", { name: "选择真实彩妆知识库" })).toBeChecked();
  });

  it("limits agent knowledge bases and skills to 10", async () => {
    const user = userEvent.setup();
    const availableKbs = Array.from(
      { length: AI_HOSTING_AGENT_KB_MAX_COUNT },
      (_, index) => ({
        id: String(index + 1),
        name: `知识库${index + 1}`,
        status: "available" as const,
      }),
    );
    const availableSkills = Array.from(
      { length: AI_HOSTING_AGENT_SKILL_MAX_COUNT },
      (_, index) => ({
        id: String(index + 1),
        name: `技能${index + 1}`,
        status: "available" as const,
      }),
    );
    vi.mocked(agentService.getAiHostingAgent).mockResolvedValueOnce({
      ...mockAgentDetail,
      availableKbs,
      availableSkills,
      promptConfig: {
        ...mockAgentDetail.promptConfig,
        availableKbIds: availableKbs.map((item) => Number(item.id)),
        availableSkillIds: availableSkills.map((item) => Number(item.id)),
      },
    });
    vi.mocked(kbService.listKbs).mockResolvedValueOnce({
      kbs: [
        {
          createdAt: "2026-06-20T08:00:00.000Z",
          description: "",
          kbId: "11",
          name: "第十一个知识库",
          updatedAt: "2026-06-20T08:00:00.000Z",
        },
      ],
      pagination: { page: 1, pageSize: 10, total: 1 },
    });
    vi.mocked(agentSkillService.listAgentSkills).mockResolvedValueOnce({
      pagination: { page: 1, pageSize: 10, total: 1 },
      skills: [
        {
          applyScene: "超过 Agent 技能数量限制",
          createdAt: "2026-06-18 23:22:22",
          id: "11",
          name: "第十一个技能",
          status: "enabled",
          updatedAt: "2026-06-20 23:22:22",
        },
      ],
    });

    renderWithRoute(
      "/chat/ai-hosting/agents/301",
      <AgentSettingsPage />,
      "/chat/ai-hosting/agents/:agentId",
    );

    await screen.findByRole("heading", { level: 1, name: mockAgentDetail.name });
    expect(screen.getAllByText("10/10")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "添加知识库" }));
    let dialog = await screen.findByRole("dialog", { name: "添加知识库" });
    expect(within(dialog).getByText("已选择 10/10")).toBeInTheDocument();
    expect(
      await within(dialog).findByRole("checkbox", { name: "选择第十一个知识库" }),
    ).toBeDisabled();
    await user.click(within(dialog).getByRole("button", { name: "取消" }));

    await user.click(screen.getByRole("button", { name: "添加技能" }));
    dialog = await screen.findByRole("dialog", { name: "添加技能" });
    expect(within(dialog).getByText("已选择 10/10")).toBeInTheDocument();
    expect(
      await within(dialog).findByRole("checkbox", { name: "选择第十一个技能" }),
    ).toBeDisabled();
  });

  it("shows resource list failures inside the knowledge base picker", async () => {
    const user = userEvent.setup();
    vi.mocked(kbService.listKbs).mockRejectedValueOnce(
      new Error("timeout of 15000ms exceeded"),
    );

    renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsPage />);

    await screen.findByRole("heading", { level: 1, name: "创建 Agent" });
    await user.click(screen.getByRole("button", { name: "添加知识库" }));
    const dialog = await screen.findByRole("dialog", { name: "添加知识库" });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("知识库列表加载失败，请稍后重试");
    });
    expect(within(dialog).getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText("timeout of 15000ms exceeded")).not.toBeInTheDocument();
  });

  it("shows only explicitly added resources in one grouped conditional logic list", async () => {
    const user = userEvent.setup();
    vi.mocked(kbService.listKbs).mockResolvedValue({
      kbs: [
        {
          createdAt: "2026-06-20T08:00:00.000Z",
          description: "",
          kbId: "3",
          name: "真实彩妆知识库",
          updatedAt: "2026-06-20T08:00:00.000Z",
        },
      ],
      pagination: { page: 1, pageSize: 10, total: 1 },
    });

    renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsPage />);

    await screen.findByRole("heading", { level: 1, name: "创建 Agent" });
    await addAgentKnowledgeBases(user, ["真实彩妆知识库"]);
    await addAgentSkills(user, ["订单与物流场景查询"]);
    const kbCallCount = vi.mocked(kbService.listKbs).mock.calls.length;
    const skillCallCount = vi.mocked(agentSkillService.listAgentSkills).mock.calls.length;

    await user.click(screen.getByRole("button", { name: "添加引用资源" }));
    const listbox = await screen.findByRole("listbox", { name: "选择引用资源" });

    expect(within(listbox).getByText("技能")).toBeInTheDocument();
    expect(within(listbox).getByText("知识库")).toBeInTheDocument();
    expect(within(listbox).getByRole("option", { name: "订单与物流场景查询" })).toBeInTheDocument();
    expect(within(listbox).getByRole("option", { name: "真实彩妆知识库" })).toBeInTheDocument();
    expect(kbService.listKbs).toHaveBeenCalledTimes(kbCallCount);
    expect(agentSkillService.listAgentSkills).toHaveBeenCalledTimes(skillCallCount);

    await user.click(within(listbox).getByRole("option", { name: "真实彩妆知识库" }));
    expect(screen.getByRole("group", { name: "行为指引" })).toHaveTextContent("真实彩妆知识库");
  });

  it("omits empty conditional logic groups and closes the list when clicking outside", async () => {
    const user = userEvent.setup();

    renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsPage />);

    await screen.findByRole("heading", { level: 1, name: "创建 Agent" });
    await addAgentSkills(user, ["订单与物流场景查询"]);
    await user.click(screen.getByRole("button", { name: "添加引用资源" }));
    const listbox = await screen.findByRole("listbox", { name: "选择引用资源" });

    expect(within(listbox).getByText("技能")).toBeInTheDocument();
    expect(within(listbox).queryByText("知识库")).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("Agent 名称"));

    await waitFor(() => {
      expect(screen.queryByRole("listbox", { name: "选择引用资源" })).not.toBeInTheDocument();
    });
  });

  it("removes conditional logic chips when an added resource is deleted", async () => {
    const user = userEvent.setup();
    vi.mocked(kbService.listKbs).mockResolvedValue({
      kbs: [
        {
          createdAt: "2026-06-20T08:00:00.000Z",
          description: "",
          kbId: "3",
          name: "真实彩妆知识库",
          updatedAt: "2026-06-20T08:00:00.000Z",
        },
      ],
      pagination: { page: 1, pageSize: 10, total: 1 },
    });

    renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsPage />);

    await screen.findByRole("heading", { level: 1, name: "创建 Agent" });
    await addAgentKnowledgeBases(user, ["真实彩妆知识库"]);
    await user.click(screen.getByRole("button", { name: "添加引用资源" }));
    await user.click(await screen.findByRole("option", { name: "真实彩妆知识库" }));
    expect(screen.getByRole("group", { name: "行为指引" })).toHaveTextContent("真实彩妆知识库");

    await user.click(screen.getByRole("button", { name: "删除真实彩妆知识库" }));
    const removeDialog = screen.getByRole("alertdialog", { name: "删除知识库" });
    await user.click(within(removeDialog).getByRole("button", { name: "删除" }));

    expect(screen.getByRole("group", { name: "行为指引" })).not.toHaveTextContent("真实彩妆知识库");
    expect(screen.queryByRole("list", { name: "已添加知识库" })).not.toBeInTheDocument();
  });

  it("adds enabled skills through the dialog and saves them independently", async () => {
    const user = userEvent.setup();

    renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsPage />);

    await screen.findByRole("heading", { level: 1, name: "创建 Agent" });
    await user.click(screen.getByRole("button", { name: "添加技能" }));
    const dialog = await screen.findByRole("dialog", { name: "添加技能" });

    expect(await within(dialog).findByRole("checkbox", { name: "选择退换货" })).toBeDisabled();
    await user.type(within(dialog).getByRole("textbox", { name: "搜索技能" }), "订单");
    await waitFor(() => {
      expect(agentSkillService.listAgentSkills).toHaveBeenLastCalledWith({
        page: 1,
        pageSize: 10,
        query: "订单",
      });
    });
    await user.click(
      await within(dialog).findByRole("checkbox", {
        name: "选择订单与物流场景查询",
      }),
    );
    await user.click(within(dialog).getByRole("button", { name: "确认" }));

    await user.clear(screen.getByLabelText("Agent 名称"));
    await user.type(screen.getByLabelText("Agent 名称"), "技能小助理");
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(agentService.createAiHostingAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          promptConfig: expect.objectContaining({
            availableKbIds: [],
            availableSkillIds: [1],
            conditionLogic: "",
          }),
        }),
      );
    });
  });

  it("collapses and expands agent settings sections", async () => {
    const user = userEvent.setup();

    renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsPage />);

    await screen.findByRole("heading", { level: 1, name: "创建 Agent" });
    expect(screen.getByLabelText("角色描述")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "角色定义设置", expanded: true }));

    expect(screen.queryByLabelText("角色描述")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("沟通风格")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "角色定义设置", expanded: false }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "角色定义设置", expanded: false }));

    expect(screen.getByLabelText("角色描述")).toBeInTheDocument();
    expect(screen.getByLabelText("沟通风格")).toBeInTheDocument();
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
    const actionTrigger = screen.getByRole("button", {
      name: "打开 华为产品知识 操作菜单",
    });
    await userEvent.setup().click(actionTrigger);
    expect(screen.getByRole("menuitem", { name: "详情" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "编辑" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "删除" })).toBeInTheDocument();
  });

  it("disables knowledge base write actions for non-manage roles", async () => {
    const user = userEvent.setup();
    mockSession("operator");

    renderWithRoute("/chat/ai-hosting/kb", <KbListPage />);

    expect(await screen.findByRole("heading", { level: 1, name: "知识库" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "创建知识库" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "打开 华为产品知识 操作菜单" }));
    expect(screen.getByRole("menuitem", { name: "详情" })).toBeEnabled();
    expect(screen.getByRole("menuitem", { name: "编辑" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("menuitem", { name: "删除" })).toHaveAttribute("aria-disabled", "true");
    expect(kbService.createKb).not.toHaveBeenCalled();
  });

  it("shows a toast when creating a knowledge base fails", async () => {
    const user = userEvent.setup();
    vi.mocked(kbService.createKb).mockRejectedValueOnce({
      message: "当前账号无操作权限",
    });

    renderWithRoute("/chat/ai-hosting/kb", <KbListPage />);

    await screen.findByRole("heading", { level: 1, name: "知识库" });
    await user.click(screen.getByRole("button", { name: "创建知识库" }));
    await screen.findByRole("dialog", { name: "创建知识库" });
    await user.type(screen.getByLabelText(/知识库名称/), "新品培训知识");
    await user.click(screen.getByRole("button", { name: "确定" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("当前账号无操作权限");
    });
    expect(screen.getByRole("dialog", { name: "创建知识库" })).toBeInTheDocument();
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
    await user.click(screen.getByRole("button", { name: "打开 华为产品知识 操作菜单" }));
    await user.click(screen.getByRole("menuitem", { name: "删除" }));

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
    await user.click(screen.getByRole("button", { name: "打开 华为产品知识 操作菜单" }));
    await user.click(screen.getByRole("menuitem", { name: "删除" }));

    const deleteDialog = await screen.findByRole("alertdialog", { name: "删除知识库？" });
    expect(deleteDialog).toHaveTextContent(
      "删除「华为产品知识」后，知识内容和附件将一并删除，且无法恢复",
    );
    expect(
      within(deleteDialog).getByText("输入知识库名称以确认"),
    ).toBeInTheDocument();

    const deleteButton = screen.getByRole("button", { name: "永久删除" });
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

  it("closes the knowledge base delete dialog from the close button", async () => {
    const user = userEvent.setup();
    vi.mocked(kbService.checkKbDelete).mockResolvedValueOnce({
      hasDocuments: true,
      linkedAgentCount: 0,
    });

    renderWithRoute("/chat/ai-hosting/kb", <KbListPage />);

    await screen.findByRole("heading", { level: 1, name: "知识库" });
    await user.click(screen.getByRole("button", { name: "打开 华为产品知识 操作菜单" }));
    await user.click(screen.getByRole("menuitem", { name: "删除" }));
    await user.click(
      within(await screen.findByRole("alertdialog", { name: "删除知识库？" })).getByRole(
        "button",
        { name: "关闭" },
      ),
    );

    expect(screen.queryByRole("alertdialog", { name: "删除知识库？" })).not.toBeInTheDocument();
    expect(kbService.deleteKb).not.toHaveBeenCalled();
  });

  it("requires typing the knowledge base name before deleting an empty kb", async () => {
    const user = userEvent.setup();
    vi.mocked(kbService.checkKbDelete).mockResolvedValueOnce({
      hasDocuments: false,
      linkedAgentCount: 0,
    });

    renderWithRoute("/chat/ai-hosting/kb", <KbListPage />);

    await screen.findByRole("heading", { level: 1, name: "知识库" });
    await user.click(screen.getByRole("button", { name: "打开 华为产品知识 操作菜单" }));
    await user.click(screen.getByRole("menuitem", { name: "删除" }));

    const deleteDialog = await screen.findByRole("alertdialog", { name: "删除知识库？" });
    expect(deleteDialog).toHaveTextContent(
      "删除「华为产品知识」后将无法恢复",
    );
    expect(deleteDialog).not.toHaveTextContent("知识内容和附件将一并删除");

    const deleteButton = screen.getByRole("button", { name: "永久删除" });
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
    await userEvent.click(
      screen.getByRole("button", { name: "打开 产品说明大全.doc 操作菜单" }),
    );
    expect(screen.getByRole("menuitem", { name: "切片详情" })).toHaveAttribute(
      "href",
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w/docs/knowledge-1",
    );
    await userEvent.click(screen.getByRole("menuitem", { name: "删除" }));
    const deleteDialog = screen.getByRole("alertdialog", { name: "确定删除该知识吗" });
    expect(deleteDialog).toBeInTheDocument();
    await userEvent.click(within(deleteDialog).getByRole("button", { name: "取消" }));
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
  });

  it("disables knowledge write actions for non-manage roles", async () => {
    const user = userEvent.setup();
    mockSession("operator");

    renderWithRoute(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w",
      <KbDetailPage />,
      "/chat/ai-hosting/kb/:kbId/*",
    );

    expect(await screen.findByRole("heading", { level: 1, name: "华为产品知识" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "添加知识" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "重试 文本知识集合" })).toBeDisabled();

    await user.click(
      screen.getByRole("button", { name: "打开 产品说明大全.doc 操作菜单" }),
    );
    expect(screen.getByRole("menuitem", { name: "切片详情" })).toBeEnabled();
    expect(screen.getByRole("menuitem", { name: "删除" })).toHaveAttribute("aria-disabled", "true");
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
    expect(await screen.findByText("20260630131921038-3")).toBeInTheDocument();
    expect(screen.queryByText("ID 20260630131921038-3")).not.toBeInTheDocument();
    expect(screen.queryByText("#1")).not.toBeInTheDocument();
    expect(screen.queryByText("chunk-qa-1")).not.toBeInTheDocument();
    expect(screen.getByText("如何恢复出厂设置")).toBeInTheDocument();
    expect(screen.getByText("保修期多久")).toBeInTheDocument();
  });

  it("disables knowledge chunk write actions for non-manage roles", async () => {
    mockSession("operator");

    renderWithRoute(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w/docs/knowledge-3",
      <KbDocDetailPage />,
      "/chat/ai-hosting/kb/:kbId/docs/:docId",
    );

    expect(await screen.findByRole("heading", { level: 1, name: "常见问题解答.faq" })).toBeInTheDocument();
    expect(await screen.findByText("如何恢复出厂设置")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "添加问答" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "添加切片" })).not.toBeInTheDocument();
    for (const button of screen.getAllByRole("button", { name: "编辑" })) {
      expect(button).toBeDisabled();
    }
    for (const button of screen.getAllByRole("button", { name: "删除" })) {
      expect(button).toBeDisabled();
    }
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

  it("disables document chunk write actions for non-manage roles", async () => {
    const user = userEvent.setup();
    mockSession("operator");

    renderWithRoute(
      "/chat/ai-hosting/kb/W7zU2fWkVSp65OTAjDd3-w/docs/knowledge-1",
      <KbDocDetailPage />,
      "/chat/ai-hosting/kb/:kbId/docs/:docId",
    );

    await screen.findByRole("heading", { level: 1, name: "产品说明大全.doc" });
    const chunkList = await screen.findByRole("list", { name: "切片列表" });
    expect(screen.getByRole("button", { name: "添加切片" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "编辑 chunk-doc-1" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "删除 chunk-doc-1" })).toBeDisabled();

    await user.click(within(chunkList).getByText("第一章 产品介绍"));
    expect(screen.queryByRole("dialog", { name: "编辑切片" })).not.toBeInTheDocument();
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
