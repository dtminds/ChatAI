import type { ReactElement } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiSkillsPage } from "@/pages/chat/ai-hosting/ai-skills-page";
import { SKILL_CREATE_DRAFT_STATE_KEY } from "@/pages/chat/ai-hosting/ai-skill-create-draft";
import { AiSkillSettingsPage } from "@/pages/chat/ai-hosting/ai-skill-settings-page";
import { resetAiHostingQuotaCacheForTest } from "@/pages/chat/ai-hosting/ai-hosting-quota-store";
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
  getWorkTagsByIds: vi.fn(),
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
      class extends EventTarget {
        complete = true;
        crossOrigin: string | null = null;
        naturalWidth = 1;
        referrerPolicy = "";
        src = "";
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

    expect(screen.getByRole("button", { name: "添加技能" })).toBeDisabled();
    await screen.findByRole("link", { name: "订单与物流场景查询" });

    await user.click(
      screen.getByRole("button", { name: "打开 订单与物流场景查询 操作菜单" }),
    );
    expect(screen.getByRole("menuitem", { name: "查看" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "编辑" })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "停用" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("menuitem", { name: "删除" })).toHaveAttribute("aria-disabled", "true");

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


});
