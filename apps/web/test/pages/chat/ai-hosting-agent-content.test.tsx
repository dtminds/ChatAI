import type { ReactElement } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentManagementContent } from "@/pages/chat/ai-hosting/agent-management-page";
import { SingleChatHostingSettingsTab } from "@/pages/chat/ai-hosting/single-chat-hosting-settings-tab";
import { AgentOptimizationSuggestionsContent } from "@/pages/chat/ai-hosting/agent-optimization-suggestions-page";
import { AgentSettingsEditor } from "@/pages/chat/ai-hosting/agent-settings-page";
import { resetAiHostingQuotaCacheForTest } from "@/pages/chat/ai-hosting/ai-hosting-quota-store";
import { resetMockKbData } from "./kb-service-mock-data";
import * as agentService from "@/pages/chat/ai-hosting/agent-service";
import * as agentLearningService from "@/pages/chat/ai-hosting/api/agent-learning-service";
import * as kbService from "@/pages/chat/ai-hosting/api/kb-service";
import * as customFieldService from "@/pages/chat/ai-hosting/api/custom-field-service";
import * as agentSkillService from "@/pages/chat/ai-hosting/api/agent-skill-service";
import * as systemVariableService from "@/pages/chat/ai-hosting/api/system-variable-service";
import { useAuthStore } from "@/store/auth-store";
import {
  AI_HOSTING_AGENT_KB_MAX_COUNT,
  AI_HOSTING_AGENT_SKILL_MAX_COUNT,
} from "@chatai/contracts";
import type { AccountRole, AiHostingSettingsResponse } from "@chatai/contracts";
import {
  createMockKbDocsResponse,
  createMockKbListResponse,
} from "./kb-service-mock-data";

const uploadKbImageMock = vi.hoisted(() => vi.fn());

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

vi.mock("@/pages/chat/ai-hosting/api/kb-doc-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/pages/chat/ai-hosting/api/kb-doc-service")>();

  return {
    ...actual,
    uploadKbImage: uploadKbImageMock,
  };
});

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

function createDeferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, reject, resolve };
}

function installSharedMocks() {
    for (const service of [
      agentServiceMock,
      agentLearningServiceMock,
      kbServiceMock,
      customFieldServiceMock,
      systemVariableServiceMock,
      agentSkillServiceMock,
      skillTemplateServiceMock,
      workTagServiceMock,
      cdpTagServiceMock,
    ]) {
      for (const mock of Object.values(service)) mock.mockReset();
    }
    mockSession();
    resetAiHostingQuotaCacheForTest();
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
    vi.mocked(agentService.getAiHostingQuota).mockResolvedValue({
      agents: { limit: 20, used: mockAgents.length },
      kbDocs: { limit: 1024 * 1024 * 1024, used: 20 * 1024 * 1024 },
      kbs: { limit: 20, used: 3 },
    });
}

function installAgentManagementMocks() {
    vi.mocked(agentService.listAiHostingAgents).mockResolvedValue({
      agents: mockAgents,
      pagination: {
        page: 1,
        pageSize: 10,
        total: mockAgents.length,
      },
    });
    vi.mocked(agentService.removeAiHostingAgent).mockResolvedValue({ deleted: true });
    vi.mocked(agentService.updateAiHostingAgentAutoLearn).mockResolvedValue({
      autoLearnEnabled: true,
      pendingSuggestionCount: 0,
    });
}

function installAgentEditorMocks() {
    vi.mocked(agentService.listAiHostingModels).mockResolvedValue({ models: mockModels });
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
}

function installHostingSettingsMocks() {
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
}

function installAgentLearningMocks() {
    vi.mocked(agentService.getAiHostingAgent).mockResolvedValue(mockAgentDetail);
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
}

function installKnowledgeBaseListMocks() {
    resetMockKbData();
    vi.mocked(kbService.listKbs).mockImplementation(async (params) =>
      createMockKbListResponse(params?.query),
    );
}

function installVariableMocks() {
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
}

function installSkillListMocks() {
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
}

function installKnowledgeBaseDocumentMocks() {
  vi.mocked(kbService.listKbDocs).mockImplementation(async (kbId, params) =>
    createMockKbDocsResponse(kbId, params?.query),
  );
}

function installImageMocks() {
    uploadKbImageMock.mockReset();
    uploadKbImageMock.mockResolvedValue({
      docUrl: "kb-docs/demo/preview.png",
      url: "https://cdn.example.com/kb-docs/demo/preview.png",
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
}

describe("AI hosting agent content", () => {
  beforeEach(installSharedMocks);

  describe("Agent management", () => {
    beforeEach(installAgentManagementMocks);

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

      renderWithRoute("/chat/ai-hosting/agents", <AgentManagementContent />);

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
      expect(within(popover).getAllByTitle("知识库图标")).toHaveLength(4);
      expect(
        within(popover).getByTitle("测试超长测试超长测试知识库"),
      ).toHaveAttribute("href", "/chat/ai-hosting/kb/2");
    });

    it("shows pending suggestion count and enabled self-learning on agent cards", async () => {
      renderWithRoute("/chat/ai-hosting/agents", <AgentManagementContent />);

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

      renderWithRoute("/chat/ai-hosting/agents", <AgentManagementContent />);

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

      renderWithRoute("/chat/ai-hosting/agents", <AgentManagementContent />);

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

      renderWithRoute("/chat/ai-hosting/agents", <AgentManagementContent />);

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

      renderWithRoute("/chat/ai-hosting/agents", <AgentManagementContent />);

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

      renderWithRoute("/chat/ai-hosting/agents", <AgentManagementContent />);

      expect(screen.getByRole("status", { name: "正在加载" })).toBeInTheDocument();
    });

    it("shows agent list load failures in a toast instead of the page", async () => {
      vi.mocked(agentService.listAiHostingAgents).mockRejectedValueOnce(
        new Error("timeout of 15000ms exceeded"),
      );

      renderWithRoute("/chat/ai-hosting/agents", <AgentManagementContent />);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("Agent 列表加载失败，请稍后重试");
      });
      expect(screen.queryByText("timeout of 15000ms exceeded")).not.toBeInTheDocument();
    });

    it("filters agents by search query", async () => {
      const user = userEvent.setup();

      renderWithRoute("/chat/ai-hosting/agents", <AgentManagementContent />);

      await screen.findByRole("heading", { level: 1, name: "Agent" });

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

      renderWithRoute("/chat/ai-hosting/agents", <AgentManagementContent />);

      expect(await screen.findByRole("heading", { level: 1, name: "Agent" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "添加 Agent" })).toBeDisabled();
      const moreActions = screen.getAllByRole("button", { name: /更多操作/ });
      await user.click(moreActions[0]);
      expect(screen.getByRole("menuitem", { name: "查看" })).toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: "删除" })).toHaveAttribute("aria-disabled", "true");
    });

    it("removes agents from the management page after confirmation", async () => {
      const user = userEvent.setup();

      renderWithRoute("/chat/ai-hosting/agents", <AgentManagementContent />);

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

      renderWithRoute("/chat/ai-hosting/agents", <AgentManagementContent />);

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

      renderWithRoute("/chat/ai-hosting/agents", <AgentManagementContent />);

      await screen.findByRole("link", { name: "护肤小助理" });
      await user.click(screen.getAllByRole("button", { name: /更多操作/ })[0]);
      await user.click(screen.getByRole("menuitem", { name: "删除" }));
      await user.click(screen.getByRole("button", { name: "确认删除" }));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("Agent 已被托管设置引用，不能删除");
      });
      expect(screen.queryByRole("alertdialog", { name: "删除 Agent 失败" })).not.toBeInTheDocument();
    });
  });

  describe("Agent learning", () => {
    beforeEach(installAgentLearningMocks);
    beforeEach(installKnowledgeBaseListMocks);
    beforeEach(installKnowledgeBaseDocumentMocks);
    beforeEach(installImageMocks);

    it("confirms before ignoring an optimization suggestion", async () => {
      const user = userEvent.setup();

      renderWithRoute(
        "/chat/ai-hosting/agents/301/optimization-suggestions",
        <AgentOptimizationSuggestionsContent />,
        "/chat/ai-hosting/agents/:agentId/optimization-suggestions",
      );

      await user.click((await screen.findAllByRole("button", { name: "忽略" }))[0]);

      expect(screen.getByRole("alertdialog", { name: "是否确认忽略?" })).toHaveTextContent(
        "已忽略的，后续也可前往已忽略列表中重新入库",
      );
    });

    it("loads knowledge match details from the candidate card and ingest dialog", async () => {
      const user = userEvent.setup();

      renderWithRoute(
        "/chat/ai-hosting/agents/301/optimization-suggestions",
        <AgentOptimizationSuggestionsContent />,
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
        <AgentOptimizationSuggestionsContent />,
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
        <AgentOptimizationSuggestionsContent />,
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
        <AgentOptimizationSuggestionsContent />,
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
        <AgentOptimizationSuggestionsContent />,
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
        <AgentOptimizationSuggestionsContent />,
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
        <AgentOptimizationSuggestionsContent />,
        "/chat/ai-hosting/agents/:agentId/optimization-suggestions",
      );

      expect(await screen.findAllByText("这个商品现在还有货吗？")).toHaveLength(2);
      expect(screen.queryByRole("button", { name: "采纳" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "忽略" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "批量操作" })).not.toBeInTheDocument();
      expect(agentLearningService.approveAgentLearningCandidate).not.toHaveBeenCalled();
      expect(agentLearningService.rejectAgentLearningCandidate).not.toHaveBeenCalled();
    });
  });

  describe("Hosting settings", () => {
    beforeEach(installHostingSettingsMocks);

    it("opens the group chat settings dialog from row action", async () => {
      const user = userEvent.setup();

      renderWithRoute("/chat/ai-hosting/hosting-settings", <SingleChatHostingSettingsTab />);

      await screen.findByRole("button", { name: "打开 小助理2 托管设置菜单" });
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

      renderWithRoute("/chat/ai-hosting/hosting-settings", <SingleChatHostingSettingsTab />);

      await screen.findByRole("button", { name: "打开 小助理2 托管设置菜单" });
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

      renderWithRoute("/chat/ai-hosting/hosting-settings", <SingleChatHostingSettingsTab />);

      await screen.findByRole("button", { name: "打开 小助理2 托管设置菜单" });
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

      renderWithRoute("/chat/ai-hosting/hosting-settings", <SingleChatHostingSettingsTab />);

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

      renderWithRoute("/chat/ai-hosting/hosting-settings", <SingleChatHostingSettingsTab />);

      await screen.findByRole("button", { name: "打开 小助理2 托管设置菜单" });
      await user.type(screen.getByRole("textbox", { name: "搜索托管账号" }), "小助理2");

      expect(screen.getByText("小助理2")).toBeInTheDocument();
      expect(screen.queryByText("小助理1")).not.toBeInTheDocument();
      expect(screen.queryByText("小助理3")).not.toBeInTheDocument();
    });

    it("opens the settings dialog from row settings", async () => {
      const user = userEvent.setup();

      renderWithRoute("/chat/ai-hosting/hosting-settings", <SingleChatHostingSettingsTab />);

      await screen.findByRole("button", { name: "打开 小助理2 托管设置菜单" });
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

      renderWithRoute("/chat/ai-hosting/hosting-settings", <SingleChatHostingSettingsTab />);

      await screen.findByRole("button", { name: "打开 小助理2 托管设置菜单" });
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

      renderWithRoute("/chat/ai-hosting/hosting-settings", <SingleChatHostingSettingsTab />);

      await screen.findByRole("button", { name: "打开 小助理2 托管设置菜单" });
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

      renderWithRoute("/chat/ai-hosting/hosting-settings", <SingleChatHostingSettingsTab />);

      await screen.findByRole("button", { name: "打开 小助理2 托管设置菜单" });
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

      renderWithRoute("/chat/ai-hosting/hosting-settings", <SingleChatHostingSettingsTab />);

      await screen.findByRole("button", { name: "打开 小助理2 托管设置菜单" });
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

      renderWithRoute("/chat/ai-hosting/hosting-settings", <SingleChatHostingSettingsTab />);

      await screen.findByRole("button", { name: "打开 小助理2 托管设置菜单" });
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
  });

  describe("Agent editor", () => {
    beforeEach(installAgentEditorMocks);
    beforeEach(installKnowledgeBaseListMocks);
    beforeEach(installSkillListMocks);
    beforeEach(installVariableMocks);
    beforeEach(installImageMocks);

    it("blocks the agent editor after an initial load failure and retries in place", async () => {
      const user = userEvent.setup();
      vi.mocked(agentService.getAiHostingAgent).mockRejectedValueOnce(
        new Error("timeout of 15000ms exceeded"),
      );

      renderWithRoute(
        "/chat/ai-hosting/agents/301",
        <AgentSettingsEditor />,
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
        <AgentSettingsEditor />,
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
        <AgentSettingsEditor />,
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
        <AgentSettingsEditor />,
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
        <AgentSettingsEditor />,
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
        <AgentSettingsEditor />,
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
          <AgentSettingsEditor />,
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

    it("clears Agent field errors when the related field changes", async () => {
      const user = userEvent.setup();

      renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsEditor />);

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

      renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsEditor />);

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

      renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsEditor />);

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

      renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsEditor />);

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

      renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsEditor />);

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

      renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsEditor />);

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

      renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsEditor />);

      await screen.findByRole("heading", { level: 1, name: "创建 Agent" });
      await user.click(screen.getByRole("button", { name: "查看模板" }));
      await user.click(screen.getByRole("menuitem", { name: "活泼种草" }));

      expect(screen.getByLabelText("沟通风格")).toHaveValue(
        "语气轻快有感染力，适度突出亮点和使用体验，适合新品介绍、活动推荐和种草转化，但不要过度催促客户。",
      );
    });

    it("trims conditional logic input at 8000 visible characters", async () => {
      const user = userEvent.setup();

      renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsEditor />);

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

      renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsEditor />);

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
        <AgentSettingsEditor />,
        "/chat/ai-hosting/agents/:agentId",
      );

      const editor = await screen.findByLabelText("行为指引描述");

      await waitFor(() => {
        expect(editor).toHaveTextContent(allowedText);
      });
      expect(screen.getByText("8000/8000")).toBeInTheDocument();
    });

    it("defaults user memory off and saves the enabled setting", async () => {
      const user = userEvent.setup();

      renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsEditor />);

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

      renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsEditor />);

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
            element: <AgentSettingsEditor />,
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

      renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsEditor />);

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

      renderWithRoute("/chat/ai-hosting/agents/301", <AgentSettingsEditor />, "/chat/ai-hosting/agents/:agentId");

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

      renderWithRoute("/chat/ai-hosting/agents/301", <AgentSettingsEditor />, "/chat/ai-hosting/agents/:agentId");

      expect(await screen.findByText("有尚未发布的修改")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "还原为正式版" })).not.toBeInTheDocument();
    });

    it("saves and publishes agent settings through the API without changing the name", async () => {
      const user = userEvent.setup();
      const publish = createDeferred<typeof mockAgentDetail>();

      vi.mocked(agentService.publishAiHostingAgent).mockReturnValueOnce(publish.promise);

      renderWithRoute("/chat/ai-hosting/agents/301", <AgentSettingsEditor />, "/chat/ai-hosting/agents/:agentId");

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

      renderWithRoute("/chat/ai-hosting/agents/301", <AgentSettingsEditor />, "/chat/ai-hosting/agents/:agentId");

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

      renderWithRoute("/chat/ai-hosting/agents/301", <AgentSettingsEditor />, "/chat/ai-hosting/agents/:agentId");

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

      renderWithRoute("/chat/ai-hosting/agents/301", <AgentSettingsEditor />, "/chat/ai-hosting/agents/:agentId");

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

      renderWithRoute("/chat/ai-hosting/agents/301", <AgentSettingsEditor />, "/chat/ai-hosting/agents/:agentId");

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

      renderWithRoute("/chat/ai-hosting/agents/301", <AgentSettingsEditor />, "/chat/ai-hosting/agents/:agentId");

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

      renderWithRoute("/chat/ai-hosting/agents/301", <AgentSettingsEditor />, "/chat/ai-hosting/agents/:agentId");

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

      renderWithRoute("/chat/ai-hosting/agents/301", <AgentSettingsEditor />, "/chat/ai-hosting/agents/:agentId");

      await screen.findByDisplayValue("护肤小助理");

      expect(screen.getByRole("button", { name: "发布正式版" })).toBeDisabled();

      await user.clear(screen.getByLabelText("角色描述"));
      await user.type(screen.getByLabelText("角色描述"), "你是资深护肤顾问");

      expect(screen.getByRole("button", { name: "发布正式版" })).toBeEnabled();
    });

    it("renders agent settings as read-only for non-manage roles", async () => {
      mockSession("operator");

      renderWithRoute("/chat/ai-hosting/agents/301", <AgentSettingsEditor />, "/chat/ai-hosting/agents/:agentId");

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

      renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsEditor />);

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

      renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsEditor />);

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
        <AgentSettingsEditor />,
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

      renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsEditor />);

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

      renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsEditor />);

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

      renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsEditor />);

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

      renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsEditor />);

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

      renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsEditor />);

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

  });
});
