import {
  MATERIAL_COLLECTION_BIZ_TYPE,
  type WorkbenchMaterialCollectionItemDto,
} from "@chatai/contracts";
import { vi } from "vitest";
import type { WorkbenchJavaClient } from "../../../src/modules/chat/workbench-java-client.js";
import { MysqlWorkbenchService } from "../../../src/modules/chat/workbench.service.js";
import type { WorkbenchRepository } from "../../../src/modules/chat/workbench-repository.js";

export function createWorkbenchService(
  repository: WorkbenchRepository,
  javaClient: WorkbenchJavaClient,
  logger?: ConstructorParameters<typeof MysqlWorkbenchService>[2],
  playableVoiceExists?: ConstructorParameters<typeof MysqlWorkbenchService>[3],
  scope: ConstructorParameters<typeof MysqlWorkbenchService>[4] = {
    platform: 5,
    uid: 9001,
  },
) {
  const repositoryWithActiveSubUser = {
    getConversationFullAutoCapability: vi.fn().mockResolvedValue({
      customerBindType: 1,
      seatGroupAIHostingEnabled: true,
      seatFullAutoAuth: true,
      seatFullAutoSwitch: true,
    }),
    getSubUser: vi.fn().mockResolvedValue(createActiveSubUser()),
    ...repository,
  } as WorkbenchRepository;

  return new MysqlWorkbenchService(
    repositoryWithActiveSubUser,
    javaClient,
    logger,
    playableVoiceExists,
    scope,
  );
}

export function createMaterialRepository(overrides: Partial<WorkbenchRepository> = {}) {
  return {
    bottomQuickReply: vi.fn().mockResolvedValue(true),
    bottomQuickReplyCategory: vi.fn().mockResolvedValue(true),
    countChildQuickReplyCategories: vi.fn().mockResolvedValue(0),
    countQuickRepliesUnderTopCategory: vi.fn().mockResolvedValue(0),
    createMaterialCollection: vi.fn().mockResolvedValue("66"),
    createMaterialGroup: vi.fn().mockResolvedValue(undefined),
    batchCreateQuickReplies: vi.fn().mockResolvedValue(undefined),
    createQuickReply: vi.fn().mockResolvedValue("501"),
    createQuickReplyCategory: vi.fn().mockResolvedValue("301"),
    canAccessSeat: vi.fn().mockResolvedValue(true),
    countMaterialGroups: vi.fn().mockResolvedValue(0),
    countQuickRepliesInCategory: vi.fn().mockResolvedValue(0),
    deleteMaterialCollection: vi.fn().mockResolvedValue(undefined),
    deleteMaterialGroup: vi.fn().mockResolvedValue(undefined),
    deleteQuickReply: vi.fn().mockResolvedValue(true),
    deleteQuickReplyCategory: vi.fn().mockResolvedValue(true),
    findMaterialCollectionScope: vi.fn().mockResolvedValue({
      bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
      subUid: 0,
    }),
    findMaterialCollectionByMessage: vi.fn().mockResolvedValue(undefined),
    findMaterialCollectionRecord: vi.fn().mockResolvedValue({
      content: JSON.stringify({
        fileName: "报价.pdf",
        fileUrl: "https://cdn.example.com/a.pdf",
      }),
      id: "66",
    }),
    findMaterialCollectionForForward: vi.fn().mockResolvedValue({
      content: JSON.stringify({ title: "客户跟进小程序" }),
      msgInfoId: "1025657",
    }),
    findMaterialMessage: vi.fn().mockResolvedValue(undefined),
    findQuickReplyCategoryScope: vi.fn().mockResolvedValue({ parentId: 0 }),
    findQuickReplyCategorySortBoundary: vi.fn().mockResolvedValue(undefined),
    findQuickReplyScope: vi.fn().mockResolvedValue({ categoryId: "11" }),
    findQuickReplySortBoundary: vi.fn().mockResolvedValue(undefined),
    getSubUser: vi.fn().mockResolvedValue({
      displayName: "客服一号",
      platform: 5,
      subUserId: "101",
      uid: 9001,
    }),
    hasActiveMaterialGroup: vi.fn().mockResolvedValue(true),
    hasActiveQuickReplyCategory: vi.fn().mockResolvedValue(true),
    isChildQuickReplyCategory: vi.fn().mockResolvedValue(false),
    isMaterialGroupEmpty: vi.fn().mockResolvedValue(true),
    listActiveQuickReplyCategorySortItems: vi.fn().mockResolvedValue([]),
    listActiveQuickReplySortItems: vi.fn().mockResolvedValue([]),
    listMaterialCollections: vi.fn().mockResolvedValue([]),
    listMaterialGroups: vi.fn().mockResolvedValue([]),
    listQuickReplies: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    listQuickReplyCategories: vi.fn().mockResolvedValue([]),
    moveMaterialCollection: vi.fn().mockResolvedValue(undefined),
    moveQuickReply: vi.fn().mockResolvedValue(true),
    moveQuickReplyCategory: vi.fn().mockResolvedValue(true),
    renameMaterialGroup: vi.fn().mockResolvedValue(undefined),
    renameQuickReplyCategory: vi.fn().mockResolvedValue(true),
    restoreMaterialCollection: vi.fn().mockResolvedValue(undefined),
    topMaterialCollection: vi.fn().mockResolvedValue(undefined),
    topMaterialGroup: vi.fn().mockResolvedValue(undefined),
    topQuickReply: vi.fn().mockResolvedValue(true),
    topQuickReplyCategory: vi.fn().mockResolvedValue(true),
    updateMaterialCollectionContent: vi.fn().mockResolvedValue(undefined),
    updateMaterialCollectionTitle: vi.fn().mockResolvedValue(undefined),
    updateQuickReply: vi.fn().mockResolvedValue(true),
    ...overrides,
  } as unknown as WorkbenchRepository;
}

export function createMaterialItem(
  overrides: Partial<WorkbenchMaterialCollectionItemDto> = {},
): WorkbenchMaterialCollectionItemDto {
  return {
    bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
    content: { fileName: "报价.pdf" },
    contentType: "file",
    groupId: 0,
    id: "66",
    msgInfoId: "9001",
    sort: 100,
    title: "报价.pdf",
    ...overrides,
  };
}

export function createMessageDto(input: {
  rawMsgtype?: string;
  senderType: "agent" | "customer" | "system";
  seq: number;
}) {
  return {
    content: {
      text: `消息 ${input.seq}`,
    },
    contentType: "text" as const,
    conversationId: "88",
    customerId: "external-001",
    messageId: `msg-${input.seq}`,
    rawMsgtype: input.rawMsgtype ?? "text",
    seatId: "12",
    senderType: input.senderType,
    seq: input.seq,
    status: "sent" as const,
  };
}

export function createActiveSubUser() {
  return {
    displayName: "客服一号",
    platform: 6,
    subUserId: "101",
    type: 0,
    uid: 9001,
  };
}

export function createJavaClient(): WorkbenchJavaClient {
  return {
    changeConversationFullAuto: vi.fn().mockResolvedValue(undefined),
    createConversation: vi.fn(),
    deleteConversation: vi.fn().mockResolvedValue(undefined),
    downloadMsgFile: vi.fn().mockResolvedValue(undefined),
    addKnowledgeFaq: vi.fn().mockResolvedValue({ success: true }),
    checkTextModerationPlus: vi.fn().mockResolvedValue({ result: "pass" }),
    getAiHelperTemplate: vi.fn().mockResolvedValue(1),
    getBroadcastProtectionStatus: vi.fn().mockResolvedValue({}),
    getKnowledgeConfig: vi.fn().mockResolvedValue({}),
    getUploadCredential: vi.fn(),
    insertSystemMessage: vi.fn().mockResolvedValue("1001"),
    listAttachments: vi.fn().mockResolvedValue({ attachments: [] }),
    listKnowledgeDocPage: vi.fn().mockResolvedValue({ list: [], total: 0 }),
    listKnowledgePage: vi.fn().mockResolvedValue({ list: [], total: 0 }),
    listUserHistoryAnswers: vi.fn().mockResolvedValue({ suggestions: [] }),
    markConversationRead: vi.fn().mockResolvedValue(undefined),
    markConversationUnread: vi.fn().mockResolvedValue(undefined),
    pinConversation: vi.fn().mockResolvedValue(undefined),
    kickOutOfGroup: vi.fn().mockResolvedValue(undefined),
    listEnterpriseDepartmentUsers: vi.fn().mockResolvedValue({ roots: [] }),
    pullFriendsInGroup: vi.fn().mockResolvedValue(undefined),
    requestAutoGeneralAnswer: vi.fn().mockResolvedValue({ id: "1" }),
    requestGeneralAnswer: vi.fn().mockResolvedValue({ suggestion: null }),
    recognizeSentence: vi.fn().mockResolvedValue("这是一段语音转文字测试文本"),
    revokeMessage: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn(),
    getAsyncOperationInfo: vi.fn().mockResolvedValue({
      failReason: "",
      optNo: "opt-001",
      status: 2,
    }),
    sendRecommendAnswer: vi.fn().mockResolvedValue(undefined),
    sendSmartHeartbeat: vi.fn().mockResolvedValue(undefined),
    setGroupSeatHostUserSeatIds: vi.fn().mockResolvedValue(undefined),
    streamAiHelperAsk: vi.fn().mockResolvedValue("改短后的内容"),
    submitAiHelperGenerateAsk: vi.fn().mockResolvedValue({ generateId: "generate-1" }),
    syncSeatGroups: vi.fn().mockResolvedValue(undefined),
    takeOverSeat: vi.fn().mockResolvedValue(undefined),
    testAgent: vi.fn(),
    transMsgFile: vi.fn(),
    updateMessageContent: vi.fn().mockResolvedValue(undefined),
    unpinConversation: vi.fn().mockResolvedValue(undefined),
  };
}

export function createLoggerMock() {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  };
}
