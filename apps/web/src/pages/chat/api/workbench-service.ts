import {
  seedAccounts,
  seedConversations,
  seedGroupMembersByConversationId,
  seedMessages,
} from "@/pages/chat/mock-data";
import { fetchWorkbenchSidebarIframeParams } from "@/pages/chat/api/sidebar-iframe-params";
import { http } from "@/lib/request";
import {
  CONVERSATION_CUSTODY_MODE,
  type ApiSuccessEnvelope,
  type WorkbenchConversationDeleteResponse,
  type WorkbenchConversationListResponse,
  type WorkbenchSeatChangeDto,
  type WorkbenchSeatDto,
  type WorkbenchConversationChangeDto,
  type WorkbenchConversationPinResponse,
  type WorkbenchConversationReadResponse,
  type WorkbenchConversationUnpinResponse,
  type WorkbenchConversationUnreadResponse,
  type WorkbenchConversationSummaryDto,
  type WorkbenchCustomerListResponse,
  type WorkbenchCustomerLastConversationResponse,
  type WorkbenchCustomerRelationConversationsResponse,
  type WorkbenchHistoryMessagePageDto,
  type WorkbenchHistoryMessageQuery,
  type WorkbenchHistoryMessageScope,
  type WorkbenchChatRecordDetailResponse,
  type WorkbenchGroupMembersResponse,
  type WorkbenchSubUserDto,
  type WorkbenchMessageDto,
  type WorkbenchMessageQueryByIdsRequest,
  type WorkbenchMessageQueryByIdsResponse,
  type WorkbenchMessageFileDownloadResponse,
  type WorkbenchMessageFileDownloadStatusResponse,
  type WorkbenchMessagePageDto,
  type WorkbenchMessageStatus,
  type WorkbenchPollRequest,
  type WorkbenchPollResponse,
  type WorkbenchSmartReplyAttachmentsRequest,
  type WorkbenchSmartReplyAttachmentsResponse,
  type WorkbenchSmartReplyAutoGeneralAnswerRequest,
  type WorkbenchSmartReplyAutoGeneralAnswerResponse,
  type WorkbenchSmartReplyGeneralAnswerRequest,
  type WorkbenchSmartReplyGeneralAnswerResponse,
  type WorkbenchSmartReplyMakeShorterRequest,
  type WorkbenchSmartReplyMakeShorterResponse,
  type WorkbenchSmartReplySendAnswerRequest,
  type WorkbenchSmartReplySendAnswerResponse,
  type WorkbenchSmartReplyPollRequest,
  type WorkbenchSmartReplyPollResponse,
  type WorkbenchKnowledgePageRequest,
  type WorkbenchKnowledgePageResponse,
  type WorkbenchKnowledgeConfigRequest,
  type WorkbenchKnowledgeConfigResponse,
  type WorkbenchKnowledgeDocPageRequest,
  type WorkbenchKnowledgeDocPageResponse,
  type WorkbenchKnowledgeFaqAddRequest,
  type WorkbenchKnowledgeFaqAddResponse,
  type WorkbenchSmartHeartbeatRequest,
  type WorkbenchSmartHeartbeatResponse,
  type WorkbenchSmartReplyTextModerationRequest,
  type WorkbenchSmartReplyTextModerationResponse,
  type WorkbenchRevokeMessageRequest,
  type WorkbenchRevokeMessageResponse,
  type WorkbenchVoicePlaybackConfirmRequest,
  type WorkbenchVoicePlaybackConfirmResponse,
  type WorkbenchVoiceTranscriptionRequest,
  type WorkbenchVoiceTranscriptionResponse,
  type WorkbenchMessageUpdateEventDto,
  type WorkbenchSendMessagePayload,
  type SettingsSidebarItemsResponse,
  type WorkbenchSidebarIframeParamsDto,
  type WorkbenchSendMessageResponse,
  type WorkbenchTakeOverSeatResponse,
  type WorkbenchUploadCredentialResponse,
  type WorkbenchSearchResponseDto,
  type WorkbenchGetOrCreateConversationRequestDto,
  MATERIAL_COLLECTION_BIZ_TYPE,
  type MaterialCollectionBizType,
  type WorkbenchMaterialCollectionCreateRequest,
  type WorkbenchMaterialCollectionCreateResponse,
  type WorkbenchMaterialCollectionGroupCreateRequest,
  type WorkbenchMaterialCollectionGroupCreateResponse,
  type WorkbenchMaterialCollectionGroupListRequest,
  type WorkbenchMaterialCollectionGroupListResponse,
  type WorkbenchMaterialCollectionGroupUpdateRequest,
  type WorkbenchMaterialCollectionGroupDto,
  type WorkbenchMaterialCollectionItemDto,
  type WorkbenchMaterialCollectionListRequest,
  type WorkbenchMaterialCollectionListResponse,
  type WorkbenchMaterialCollectionMoveRequest,
  type WorkbenchMaterialCollectionOkResponse,
  type WorkbenchMaterialCollectionUpdateRequest,
  type WorkbenchQuickReplyCategoryCreateRequest,
  type WorkbenchQuickReplyCategoryContentRequest,
  type WorkbenchQuickReplyCategoryContentResponse,
  type WorkbenchQuickReplyCategoryDto,
  type WorkbenchQuickReplyCategoryListRequest,
  type WorkbenchQuickReplyCategoryListResponse,
  type WorkbenchQuickReplyCategoryUpdateRequest,
  type WorkbenchQuickReplyCreateRequest,
  type WorkbenchQuickReplyDto,
  type WorkbenchQuickReplyListRequest,
  type WorkbenchQuickReplyListResponse,
  type WorkbenchQuickReplyOkResponse,
  type WorkbenchQuickReplyUpdateRequest,
  buildMaterialFileContentJson,
  buildMaterialH5ContentJson,
  patchMaterialFileContentJson,
  patchMaterialH5ContentJson,
  resolveMaterialFileCollectFields,
  resolveMaterialH5CollectFields,
  normalizeQuickReplyAttachments,
  validateQuickReplyPayload,
} from "@chatai/contracts";
import type {
  ChatMode,
  FileMessageContent,
  Message,
  VideoMessageContent,
} from "@/pages/chat/chat-types";

export type WorkbenchConversationListOptions = {
  cursor?: string;
  limit?: number;
  mode?: ChatMode;
};

export type WorkbenchService = {
  __mock?: {
    revokeMessage: (conversationId: string, messageId: string) => Promise<void>;
  };
  deleteConversation: (conversationId: string) => Promise<WorkbenchConversationDeleteResponse>;
  getSeats: () => Promise<WorkbenchSeatDto[]>;
  getConversations: (
    seatId: string,
    options?: WorkbenchConversationListOptions,
  ) => Promise<WorkbenchConversationListResponse>;
  getMe: () => Promise<WorkbenchSubUserDto>;
  getCustomers: (options: {
    cursor?: string;
    keyword?: string;
    limit?: number;
    scope: "all" | "mine";
    seatIds?: string[];
  }) => Promise<WorkbenchCustomerListResponse>;
  getCustomerLastConversation: (
    thirdExternalUserId: string,
  ) => Promise<WorkbenchCustomerLastConversationResponse>;
  getCustomerRelationConversations: (
    thirdExternalUserId: string,
    thirdUserIds: string[],
  ) => Promise<WorkbenchCustomerRelationConversationsResponse>;
  /** 未配置或未接入数据库时可为 `null` */
  getSidebarIframeParams: (input: {
    conversationId: string;
    seatId: string;
  }) => Promise<WorkbenchSidebarIframeParamsDto | null>;
  getHistoryMessages: (
    conversationId: string,
    options?: WorkbenchHistoryMessageQuery,
  ) => Promise<WorkbenchHistoryMessagePageDto>;
  getSidebarItems: () => Promise<SettingsSidebarItemsResponse>;
  getMessages: (conversationId: string, options?: { beforeSeq?: number; limit?: number }) => Promise<WorkbenchMessagePageDto>;
  getMessagesByIds: (
    input: WorkbenchMessageQueryByIdsRequest,
  ) => Promise<WorkbenchMessageQueryByIdsResponse>;
  getChatRecordDetail: (input: {
    conversationId: string;
    messageId: string;
  }) => Promise<WorkbenchChatRecordDetailResponse>;
  revokeMessage: (input: {
    conversationId: string;
    messageId: string;
  }) => Promise<WorkbenchRevokeMessageResponse>;
  downloadMessageFile: (input: {
    conversationId: string;
    messageId: string;
    messageSeq: number;
  }) => Promise<WorkbenchMessageFileDownloadResponse>;
  getMessageFileDownloadStatus: (input: {
    conversationId: string;
    messageSeq: number;
  }) => Promise<WorkbenchMessageFileDownloadStatusResponse | undefined>;
  confirmVoicePlaybackReady: (
    input: WorkbenchVoicePlaybackConfirmRequest,
  ) => Promise<WorkbenchVoicePlaybackConfirmResponse>;
  transcribeVoiceMessage: (
    input: WorkbenchVoiceTranscriptionRequest,
  ) => Promise<WorkbenchVoiceTranscriptionResponse>;
  getGroupMembers: (conversationId: string) => Promise<WorkbenchGroupMembersResponse>;
  getUploadCredential: (conversationId: string) => Promise<WorkbenchUploadCredentialResponse>;
  markConversationRead: (conversationId: string) => Promise<WorkbenchConversationReadResponse>;
  markConversationUnread: (conversationId: string) => Promise<WorkbenchConversationUnreadResponse>;
  pinConversation: (conversationId: string) => Promise<WorkbenchConversationPinResponse>;
  poll: (request: WorkbenchPollRequest) => Promise<WorkbenchPollResponse>;
  pollSmartReplies: (
    request: WorkbenchSmartReplyPollRequest,
  ) => Promise<WorkbenchSmartReplyPollResponse>;
  requestSmartReplyGeneralAnswer: (
    request: WorkbenchSmartReplyGeneralAnswerRequest,
  ) => Promise<WorkbenchSmartReplyGeneralAnswerResponse>;
  requestSmartReplyAutoGeneralAnswer: (
    request: WorkbenchSmartReplyAutoGeneralAnswerRequest,
  ) => Promise<WorkbenchSmartReplyAutoGeneralAnswerResponse>;
  requestSmartReplyMakeShorter: (
    request: WorkbenchSmartReplyMakeShorterRequest,
  ) => Promise<WorkbenchSmartReplyMakeShorterResponse>;
  sendSmartReplyAnswer: (
    request: WorkbenchSmartReplySendAnswerRequest,
  ) => Promise<WorkbenchSmartReplySendAnswerResponse>;
  listSmartReplyAttachments: (
    request: WorkbenchSmartReplyAttachmentsRequest,
  ) => Promise<WorkbenchSmartReplyAttachmentsResponse>;
  checkSmartReplyTextModeration: (
    request: WorkbenchSmartReplyTextModerationRequest,
  ) => Promise<WorkbenchSmartReplyTextModerationResponse>;
  listKnowledgePage: (
    request: WorkbenchKnowledgePageRequest,
  ) => Promise<WorkbenchKnowledgePageResponse>;
  getKnowledgeConfig: (
    request: WorkbenchKnowledgeConfigRequest,
  ) => Promise<WorkbenchKnowledgeConfigResponse>;
  listKnowledgeDocPage: (
    request: WorkbenchKnowledgeDocPageRequest,
  ) => Promise<WorkbenchKnowledgeDocPageResponse>;
  addSmartReplyKnowledgeFaq: (
    request: WorkbenchKnowledgeFaqAddRequest,
  ) => Promise<WorkbenchKnowledgeFaqAddResponse>;
  sendSmartHeartbeat: (
    request: WorkbenchSmartHeartbeatRequest,
  ) => Promise<WorkbenchSmartHeartbeatResponse>;
  sendMessage: (payload: WorkbenchSendMessagePayload) => Promise<WorkbenchSendMessageResponse>;
  takeOverSeat: (seatId: string) => Promise<WorkbenchTakeOverSeatResponse>;
  unpinConversation: (conversationId: string) => Promise<WorkbenchConversationUnpinResponse>;
  search: (seatId: string, keyword: string) => Promise<WorkbenchSearchResponseDto>;
  getOrCreateConversation: (payload: WorkbenchGetOrCreateConversationRequestDto) => Promise<WorkbenchConversationSummaryDto>;
  listMaterialCollections: (
    request: WorkbenchMaterialCollectionListRequest,
  ) => Promise<WorkbenchMaterialCollectionListResponse>;
  listMaterialGroups: (
    request: WorkbenchMaterialCollectionGroupListRequest,
  ) => Promise<WorkbenchMaterialCollectionGroupListResponse>;
  collectMaterial: (
    request: WorkbenchMaterialCollectionCreateRequest,
  ) => Promise<WorkbenchMaterialCollectionCreateResponse>;
  deleteMaterialCollection: (
    collectionId: string,
  ) => Promise<WorkbenchMaterialCollectionOkResponse>;
  topMaterialCollection: (
    collectionId: string,
  ) => Promise<WorkbenchMaterialCollectionOkResponse>;
  moveMaterialCollection: (
    collectionId: string,
    request: WorkbenchMaterialCollectionMoveRequest,
  ) => Promise<WorkbenchMaterialCollectionOkResponse>;
  updateMaterialCollection: (
    collectionId: string,
    request: WorkbenchMaterialCollectionUpdateRequest,
  ) => Promise<WorkbenchMaterialCollectionOkResponse>;
  createMaterialGroup: (
    request: WorkbenchMaterialCollectionGroupCreateRequest,
  ) => Promise<WorkbenchMaterialCollectionGroupCreateResponse>;
  renameMaterialGroup: (
    groupId: string,
    bizType: WorkbenchMaterialCollectionGroupCreateRequest["bizType"],
    request: WorkbenchMaterialCollectionGroupUpdateRequest,
  ) => Promise<WorkbenchMaterialCollectionOkResponse>;
  topMaterialGroup: (
    groupId: string,
    bizType: WorkbenchMaterialCollectionGroupCreateRequest["bizType"],
  ) => Promise<WorkbenchMaterialCollectionOkResponse>;
  deleteMaterialGroup: (
    groupId: string,
    bizType: WorkbenchMaterialCollectionGroupCreateRequest["bizType"],
  ) => Promise<WorkbenchMaterialCollectionOkResponse>;
  listQuickReplyCategories: (
    request: WorkbenchQuickReplyCategoryListRequest,
  ) => Promise<WorkbenchQuickReplyCategoryListResponse>;
  listQuickReplyCategoryContent: (
    request: WorkbenchQuickReplyCategoryContentRequest,
  ) => Promise<WorkbenchQuickReplyCategoryContentResponse>;
  listQuickReplies: (
    request: WorkbenchQuickReplyListRequest,
  ) => Promise<WorkbenchQuickReplyListResponse>;
  createQuickReplyCategory: (
    request: WorkbenchQuickReplyCategoryCreateRequest,
  ) => Promise<WorkbenchQuickReplyOkResponse>;
  renameQuickReplyCategory: (
    categoryId: string,
    scopeType: WorkbenchQuickReplyCategoryListRequest["scopeType"],
    request: WorkbenchQuickReplyCategoryUpdateRequest,
  ) => Promise<WorkbenchQuickReplyOkResponse>;
  topQuickReplyCategory: (
    categoryId: string,
    scopeType: WorkbenchQuickReplyCategoryListRequest["scopeType"],
  ) => Promise<WorkbenchQuickReplyOkResponse>;
  bottomQuickReplyCategory: (
    categoryId: string,
    scopeType: WorkbenchQuickReplyCategoryListRequest["scopeType"],
  ) => Promise<WorkbenchQuickReplyOkResponse>;
  deleteQuickReplyCategory: (
    categoryId: string,
    scopeType: WorkbenchQuickReplyCategoryListRequest["scopeType"],
  ) => Promise<WorkbenchQuickReplyOkResponse>;
  createQuickReply: (
    request: WorkbenchQuickReplyCreateRequest,
  ) => Promise<WorkbenchQuickReplyOkResponse>;
  updateQuickReply: (
    quickReplyId: string,
    request: WorkbenchQuickReplyUpdateRequest,
  ) => Promise<WorkbenchQuickReplyOkResponse>;
  topQuickReply: (
    quickReplyId: string,
    scopeType: WorkbenchQuickReplyListRequest["scopeType"],
  ) => Promise<WorkbenchQuickReplyOkResponse>;
  bottomQuickReply: (
    quickReplyId: string,
    scopeType: WorkbenchQuickReplyListRequest["scopeType"],
  ) => Promise<WorkbenchQuickReplyOkResponse>;
  deleteQuickReply: (
    quickReplyId: string,
    scopeType: WorkbenchQuickReplyListRequest["scopeType"],
  ) => Promise<WorkbenchQuickReplyOkResponse>;
};

export type WorkbenchServiceMode = "mock" | "http";

type WorkbenchEvent =
  | {
      version: number;
      type: "seat";
      payload: WorkbenchSeatChangeDto;
    }
  | {
      version: number;
      type: "conversation";
      payload: WorkbenchConversationChangeDto;
    }
  | {
      version: number;
      type: "message";
      payload: WorkbenchMessageDto;
    }
  | {
      version: number;
      type: "message-update";
      payload: WorkbenchMessageUpdateEventDto;
    };

type MockState = {
  seats: WorkbenchSeatDto[];
  conversationsByAccount: Record<string, WorkbenchConversationSummaryDto[]>;
  subUser: WorkbenchSubUserDto;
  events: WorkbenchEvent[];
  groupMembersByConversationId: Record<string, WorkbenchGroupMembersResponse["items"]>;
  materialGroups: WorkbenchMaterialCollectionGroupDto[];
  materialItems: WorkbenchMaterialCollectionItemDto[];
  messagesByConversationId: Record<string, WorkbenchMessageDto[]>;
  nextId: number;
  quickReplyCategories: WorkbenchQuickReplyCategoryDto[];
  quickReplies: WorkbenchQuickReplyDto[];
  version: number;
};

const CURRENT_SUB_USER_ID = "sub-user-001";
const INITIAL_VERSION = 1_778_400_000_000;
const MOCK_POLL_OVERLAP_MS = 1;
const MOCK_SEAT_UNREAD_COUNTS: Record<string, number> = {
  drc: 13,
  ndt: 1,
};

let activeWorkbenchService: WorkbenchService = createWorkbenchService();

export function getWorkbenchService() {
  return activeWorkbenchService;
}

export function setWorkbenchService(service: WorkbenchService) {
  activeWorkbenchService = service;
}

export function resetWorkbenchService() {
  activeWorkbenchService = createMockWorkbenchService();
}

export function createWorkbenchService(): WorkbenchService {
  return createHttpWorkbenchService();
}

export function createMockWorkbenchService(): WorkbenchService {
  const state = buildInitialState();

  return {
    __mock: {
      async revokeMessage(conversationId, messageId) {
        revokeMessage(state, conversationId, messageId);
      },
    },
    async getSeats() {
      return clone(state.seats);
    },
    async deleteConversation(conversationId) {
      return removeConversation(state, conversationId);
    },
    async getConversations(seatId, options) {
      const conversations = state.conversationsByAccount[seatId] ?? [];
      const snapshotAt = Date.now();
      state.version = Math.max(state.version, snapshotAt);

      return {
        hasMore: false,
        items: clone(
          sortConversations(conversations)
            .filter((conversation) => options?.mode == null || conversation.mode === options.mode)
            .slice(0, options?.limit),
        ),
        snapshotAt,
      };
    },
    async getMe() {
      return clone(state.subUser);
    },
    async getCustomers() {
      return {
        hasMore: false,
        items: [],
        total: 0,
      };
    },
    async getCustomerLastConversation() {
      return {};
    },
    async getCustomerRelationConversations() {
      return { items: [] };
    },
    async listMaterialCollections(request) {
      const page = request.page ?? 1;
      const pageSize = request.pageSize ?? 100;
      const matchingItems = state.materialItems
        .filter(
          (item) =>
            item.bizType === request.bizType &&
            item.groupId === request.groupId,
        )
        .sort(sortMaterialItems);

      return {
        items: clone(matchingItems.slice((page - 1) * pageSize, page * pageSize)),
        pagination: {
          hasMore: page * pageSize < matchingItems.length,
          page,
          pageSize,
          total: matchingItems.length,
        },
      };
    },
    async listMaterialGroups(request) {
      return {
        groups: clone(
          state.materialGroups.filter(
            (group) => group.bizType === request.bizType,
          ),
        ),
      };
    },
    async collectMaterial(request) {
      if (
        request.bizType !== MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION &&
        (request.groupId === undefined || request.groupId === 0 || request.groupId === "0")
      ) {
        return {
          success: false,
          errorMsg: "请选择分组",
        };
      }

      if (
        request.bizType !== MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION &&
        !state.materialGroups.some(
          (group) => group.id === request.groupId && group.bizType === request.bizType,
        )
      ) {
        return {
          success: false,
          errorMsg: "请选择有效分组",
        };
      }

      const existing = state.materialItems.find(
        (item) =>
          item.bizType === request.bizType &&
          item.messageId === request.messageId,
      );

      if (existing) {
        return {
          success: true,
          duplicated: true,
        };
      }

      const sourceMessage = Object.values(state.messagesByConversationId)
        .flat()
        .find((message) => message.messageId === request.messageId);

      const normalized = resolveMockMaterialCollect(sourceMessage, request);

      if ("errorMsg" in normalized) {
        return {
          success: false,
          errorMsg: normalized.errorMsg,
        };
      }

      const item = sourceMessage
        ? {
            ...buildMaterialItemFromMessage(state, sourceMessage, request),
            content: normalized.content,
            title: normalized.title,
          }
        : buildFallbackMaterialItem(state, request);
      state.materialItems = [item, ...state.materialItems];

      return {
        success: true,
      };
    },
    async deleteMaterialCollection(collectionId) {
      state.materialItems = state.materialItems.filter((item) => item.id !== collectionId);
      return { ok: true };
    },
    async topMaterialCollection(collectionId) {
      const sort = Date.now();
      state.materialItems = state.materialItems.map((item) =>
        item.id === collectionId ? { ...item, sort } : item,
      );
      return { ok: true };
    },
    async moveMaterialCollection(collectionId, request) {
      const sort = Date.now();
      state.materialItems = state.materialItems.map((item) =>
        item.id === collectionId
          ? { ...item, groupId: request.groupId, sort }
          : item,
      );
      return { ok: true };
    },
    async updateMaterialCollection(collectionId, request) {
      const item = state.materialItems.find(
        (materialItem) => materialItem.id === collectionId,
      );

      if (!item) {
        throw new Error("MATERIAL_COLLECTION_NOT_FOUND");
      }

      const rawContent = JSON.stringify(getMaterialContentRecordFromItem(item));
      const patchResult =
        item.bizType === MATERIAL_COLLECTION_BIZ_TYPE.FILE
          ? patchMaterialFileContentJson(rawContent, request.fileName ?? "")
          : item.bizType === MATERIAL_COLLECTION_BIZ_TYPE.H5
            ? patchMaterialH5ContentJson(rawContent, {
                description: request.description,
                title: request.title ?? "",
              })
            : null;

      if (!patchResult) {
        return { ok: true };
      }

      if ("errorMsg" in patchResult) {
        throw new Error(patchResult.errorMsg);
      }

      state.materialItems = state.materialItems.map((materialItem) =>
        materialItem.id === collectionId
          ? {
              ...materialItem,
              content: JSON.parse(patchResult.content) as WorkbenchMaterialCollectionItemDto["content"],
              title: patchResult.title,
            }
          : materialItem,
      );

      return { ok: true };
    },
    async createMaterialGroup(request) {
      const group = {
        bizType: request.bizType,
        id: `material-group-${state.nextId++}`,
        sort: Date.now(),
        title: request.title,
      };
      state.materialGroups = [group, ...state.materialGroups];
      return clone(group);
    },
    async renameMaterialGroup(groupId, bizType, request) {
      state.materialGroups = state.materialGroups.map((group) =>
        group.id === groupId && group.bizType === bizType
          ? { ...group, title: request.title }
          : group,
      );
      return { ok: true };
    },
    async topMaterialGroup(groupId, bizType) {
      const sort = Date.now();
      state.materialGroups = state.materialGroups.map((group) =>
        group.id === groupId && group.bizType === bizType ? { ...group, sort } : group,
      );
      return { ok: true };
    },
    async deleteMaterialGroup(groupId, bizType) {
      if (
        state.materialItems.some(
          (item) => item.bizType === bizType && item.groupId === groupId,
        )
      ) {
        throw new Error("请先移走或删除分组内素材");
      }

      state.materialGroups = state.materialGroups.filter(
        (group) => !(group.id === groupId && group.bizType === bizType),
      );
      return { ok: true };
    },
    async listQuickReplyCategories(request) {
      return {
        categories: clone(
          state.quickReplyCategories
            .filter((category) => category.scopeType === request.scopeType)
            .sort(sortQuickReplyEntries),
        ),
      };
    },
    async listQuickReplyCategoryContent(request) {
      const categories = state.quickReplyCategories
        .filter(
          (category) =>
            category.scopeType === request.scopeType &&
            category.parentId === request.parentCategoryId,
        )
        .sort(sortQuickReplyEntries)
        .slice(0, 500);
      const categoryIds = new Set(categories.map((category) => category.id));
      const quickReplies = state.quickReplies
        .filter(
          (reply) =>
            reply.scopeType === request.scopeType &&
            typeof reply.categoryId === "string" &&
            categoryIds.has(reply.categoryId),
        )
        .sort((left, right) => {
          if (left.categoryId !== right.categoryId) {
            return String(left.categoryId).localeCompare(String(right.categoryId));
          }

          return sortQuickReplyEntries(left, right);
        })
        .slice(0, 10_000);
      const quickRepliesByCategoryId: Record<string, WorkbenchQuickReplyDto[]> = {};

      for (const category of categories) {
        quickRepliesByCategoryId[category.id] = [];
      }

      for (const quickReply of quickReplies) {
        if (typeof quickReply.categoryId !== "string") {
          continue;
        }

        quickRepliesByCategoryId[quickReply.categoryId] ??= [];
        quickRepliesByCategoryId[quickReply.categoryId]?.push(clone(quickReply));
      }

      return {
        categories: clone(categories),
        limits: {
          categories: 500,
          quickReplies: 10_000,
        },
        quickRepliesByCategoryId,
        truncated: {
          categories:
            state.quickReplyCategories.filter(
              (category) =>
                category.scopeType === request.scopeType &&
                category.parentId === request.parentCategoryId,
            ).length > 500,
          quickReplies:
            state.quickReplies.filter(
              (reply) =>
                reply.scopeType === request.scopeType &&
                typeof reply.categoryId === "string" &&
                categoryIds.has(reply.categoryId),
            ).length > 10_000,
        },
      };
    },
    async listQuickReplies(request) {
      const page = request.page ?? 1;
      const pageSize = request.pageSize ?? 50;
      const keyword = request.keyword?.trim();
      const matchingItems = state.quickReplies
        .filter(
          (reply) =>
            reply.scopeType === request.scopeType &&
            (request.categoryId === undefined ||
              reply.categoryId === request.categoryId) &&
            (!keyword ||
              reply.contentText.includes(keyword) ||
              reply.labelText.includes(keyword)),
        )
        .sort(sortQuickReplyEntries);

      return {
        items: clone(matchingItems.slice((page - 1) * pageSize, page * pageSize)),
        pagination: {
          hasMore: page * pageSize < matchingItems.length,
          page,
          pageSize,
          total: matchingItems.length,
        },
      };
    },
    async createQuickReplyCategory(request) {
      const parentId = request.parentId ?? 0;
      const category = {
        id: `quick-reply-category-${state.nextId++}`,
        parentId,
        scopeType: request.scopeType,
        sort: getAppendQuickReplyCategorySort(
          state.quickReplyCategories,
          request.scopeType,
          parentId,
        ),
        title: request.title,
      };
      state.quickReplyCategories = [...state.quickReplyCategories, category];
      return { ok: true };
    },
    async renameQuickReplyCategory(categoryId, scopeType, request) {
      const hasCategory = state.quickReplyCategories.some(
        (category) => category.id === categoryId && category.scopeType === scopeType,
      );

      if (!hasCategory) {
        throw new Error("分类不存在");
      }

      state.quickReplyCategories = state.quickReplyCategories.map((category) =>
        category.id === categoryId && category.scopeType === scopeType
          ? { ...category, title: request.title }
          : category,
      );
      return { ok: true };
    },
    async topQuickReplyCategory(categoryId, scopeType) {
      const hasCategory = state.quickReplyCategories.some(
        (category) => category.id === categoryId && category.scopeType === scopeType,
      );

      if (!hasCategory) {
        throw new Error("分类不存在");
      }

      const category = state.quickReplyCategories.find(
        (item) => item.id === categoryId && item.scopeType === scopeType,
      );
      const sort = getPrependQuickReplyCategorySort(
        state.quickReplyCategories,
        scopeType,
        category?.parentId ?? 0,
      );
      state.quickReplyCategories = state.quickReplyCategories.map((category) =>
        category.id === categoryId && category.scopeType === scopeType
          ? { ...category, sort }
          : category,
      );
      return { ok: true };
    },
    async bottomQuickReplyCategory(categoryId, scopeType) {
      const category = state.quickReplyCategories.find(
        (item) => item.id === categoryId && item.scopeType === scopeType,
      );

      if (!category) {
        throw new Error("分类不存在");
      }

      const sort = getAppendQuickReplyCategorySort(
        state.quickReplyCategories,
        scopeType,
        category.parentId,
      );
      state.quickReplyCategories = state.quickReplyCategories.map((category) =>
        category.id === categoryId && category.scopeType === scopeType
          ? { ...category, sort }
          : category,
      );
      return { ok: true };
    },
    async deleteQuickReplyCategory(categoryId, scopeType) {
      if (
        state.quickReplyCategories.some(
          (category) =>
            category.scopeType === scopeType && category.parentId === categoryId,
        )
      ) {
        throw new Error("请先删除子分类");
      }

      if (
        state.quickReplies.some(
          (reply) =>
            reply.scopeType === scopeType && reply.categoryId === categoryId,
        )
      ) {
        throw new Error("请先删除分类下的话术");
      }

      const hasCategory = state.quickReplyCategories.some(
        (category) => category.id === categoryId && category.scopeType === scopeType,
      );

      if (!hasCategory) {
        throw new Error("分类不存在");
      }

      state.quickReplyCategories = state.quickReplyCategories.filter(
        (category) => !(category.id === categoryId && category.scopeType === scopeType),
      );
      return { ok: true };
    },
    async createQuickReply(request) {
      const validation = validateQuickReplyPayload({
        attachments: request.attachments ?? [],
        contentText: request.contentText ?? "",
      });

      if (!validation.ok) {
        throw new Error(validation.errorMsg);
      }

      const categoryId = request.categoryId ?? 0;
      state.quickReplies = [
        ...state.quickReplies,
        {
          attachments: normalizeQuickReplyAttachments(request.attachments ?? []),
          categoryId,
          contentText: request.contentText?.trim() ?? "",
          id: `quick-reply-${state.nextId++}`,
          labelColor: request.labelColor ?? "",
          labelText: request.labelText ?? "",
          scopeType: request.scopeType,
          sort: getAppendQuickReplySort(
            state.quickReplies,
            request.scopeType,
            categoryId,
          ),
        },
      ];
      return { ok: true };
    },
    async updateQuickReply(quickReplyId, request) {
      const validation = validateQuickReplyPayload({
        attachments: request.attachments ?? [],
        contentText: request.contentText ?? "",
      });

      if (!validation.ok) {
        throw new Error(validation.errorMsg);
      }

      const hasQuickReply = state.quickReplies.some(
        (reply) => reply.id === quickReplyId && reply.scopeType === request.scopeType,
      );

      if (!hasQuickReply) {
        throw new Error("话术不存在");
      }

      state.quickReplies = state.quickReplies.map((reply) =>
        reply.id === quickReplyId && reply.scopeType === request.scopeType
          ? {
              ...reply,
              attachments: normalizeQuickReplyAttachments(request.attachments ?? []),
              categoryId: request.categoryId ?? 0,
              contentText: request.contentText?.trim() ?? "",
              labelColor: request.labelColor ?? "",
              labelText: request.labelText ?? "",
            }
          : reply,
      );
      return { ok: true };
    },
    async topQuickReply(quickReplyId, scopeType) {
      const hasQuickReply = state.quickReplies.some(
        (reply) => reply.id === quickReplyId && reply.scopeType === scopeType,
      );

      if (!hasQuickReply) {
        throw new Error("话术不存在");
      }

      const quickReply = state.quickReplies.find(
        (reply) => reply.id === quickReplyId && reply.scopeType === scopeType,
      );
      const sort = getPrependQuickReplySort(
        state.quickReplies,
        scopeType,
        quickReply?.categoryId ?? 0,
      );
      state.quickReplies = state.quickReplies.map((reply) =>
        reply.id === quickReplyId && reply.scopeType === scopeType
          ? { ...reply, sort }
          : reply,
      );
      return { ok: true };
    },
    async bottomQuickReply(quickReplyId, scopeType) {
      const quickReply = state.quickReplies.find(
        (reply) => reply.id === quickReplyId && reply.scopeType === scopeType,
      );

      if (!quickReply) {
        throw new Error("话术不存在");
      }

      const sort = getAppendQuickReplySort(
        state.quickReplies,
        scopeType,
        quickReply.categoryId,
      );
      state.quickReplies = state.quickReplies.map((reply) =>
        reply.id === quickReplyId && reply.scopeType === scopeType
          ? { ...reply, sort }
          : reply,
      );
      return { ok: true };
    },
    async deleteQuickReply(quickReplyId, scopeType) {
      const hasQuickReply = state.quickReplies.some(
        (reply) => reply.id === quickReplyId && reply.scopeType === scopeType,
      );

      if (!hasQuickReply) {
        throw new Error("话术不存在");
      }

      state.quickReplies = state.quickReplies.filter(
        (reply) => !(reply.id === quickReplyId && reply.scopeType === scopeType),
      );
      return { ok: true };
    },
    async getSidebarIframeParams() {
      return null;
    },
    async getHistoryMessages(conversationId, options) {
      const messages = [...(state.messagesByConversationId[conversationId] ?? [])].sort(
        (left, right) => left.seq - right.seq || (left.createdAt ?? 0) - (right.createdAt ?? 0),
      );
      const filteredMessages = filterMockHistoryMessages(state, conversationId, messages, options);
      const limit = normalizeHistoryLimit(options?.limit);

      if (limit <= 0) {
        return {
          hasNext: false,
          hasPrev: false,
          messages: [],
        };
      }

      const page = sliceMockHistoryMessages(filteredMessages, {
        cursor: decodeMockHistoryCursor(options?.cursor),
        day: options?.day,
        limit,
      });

      return {
        hasNext: page.hasNext,
        hasPrev: page.hasPrev,
        messages: clone(page.messages),
        nextCursor: page.nextCursor,
        prevCursor: page.prevCursor,
      };
    },
    async getSidebarItems() {
      return {
        items: [],
      };
    },
    async getMessages(conversationId, options) {
      const messages = [...(state.messagesByConversationId[conversationId] ?? [])].sort(
        (left, right) => left.seq - right.seq,
      );
      const beforeSeq = options?.beforeSeq;
      const limit = options?.limit ?? 30;
      if (limit <= 0) {
        return {
          filteredCount: 0,
          hasMore: false,
          messages: [],
          scannedCount: 0,
        };
      }

      const candidateMessages =
        beforeSeq == null
          ? messages
          : messages.filter((message) => message.seq < beforeSeq);
      const scannedMessages = candidateMessages.slice(-(limit + 1)).slice(-limit);
      return {
        filteredCount: 0,
        hasMore: candidateMessages.length > limit,
        messages: clone(scannedMessages),
        nextBeforeSeq: scannedMessages[0]?.seq,
        scannedCount: scannedMessages.length,
      };
    },
    async getMessagesByIds(input) {
      const messages = state.messagesByConversationId[input.conversationId] ?? [];
      const normalizedIds = new Set(input.messageIds);

      return {
        messages: clone(
          messages.filter((message) => normalizedIds.has(message.messageId)),
        ),
      };
    },
    async getChatRecordDetail(input) {
      return {
        messageId: input.messageId,
        messages: [],
      };
    },
    async revokeMessage(input) {
      const message = revokeMessage(state, input.conversationId, input.messageId);

      return {
        accepted: true,
        conversationId: input.conversationId,
        messageId: input.messageId,
        revokeMsgId: message?.seq ?? 0,
      };
    },
    async downloadMessageFile(input) {
      const message = findMessageByIdOrSeq(
        state,
        input.conversationId,
        input.messageId,
        input.messageSeq,
      );

      if (!message) {
        throw new Error("Message not found");
      }

      updateMessageDownloadContent(state, input.conversationId, input.messageId, {
        downloadStatus: "ing",
      });

      return {
        messageId: input.messageId,
        status: "accepted",
      };
    },
    async getMessageFileDownloadStatus(input) {
      const message = findMessageByIdOrSeq(
        state,
        input.conversationId,
        undefined,
        input.messageSeq,
      );

      if (!message) {
        return undefined;
      }

      const content = message.content;

      if (!isFileDownloadContent(content)) {
        return undefined;
      }

      return {
        downloadStatus: content.downloadStatus,
        fileUrlExpireTime: content.type === "video" ? content.fileUrlExpireTime : undefined,
        fileSerialNo: content.fileSerialNo,
        fileUrl: content.type === "file" ? content.fileUrl : content.videoUrl,
      };
    },
    async confirmVoicePlaybackReady(input) {
      updateVoicePlaybackContent(state, input.conversationId, input.messageSeq, {
        playbackUrl: input.playbackUrl,
        transFileUrl: input.playbackUrl,
        transFileUrlPersisted: true,
      });

      return {
        messageSeq: input.messageSeq,
        playbackUrl: input.playbackUrl,
        transFileUrlPersisted: true,
      };
    },
    async transcribeVoiceMessage(input) {
      const transVoiceText = "这是一段语音转文字测试文本";

      updateVoiceTranscriptionContent(state, input.conversationId, input.messageSeq, {
        transVoiceText,
      });

      return {
        messageSeq: input.messageSeq,
        transVoiceText,
        transVoiceTextPersisted: true,
      };
    },
    async getGroupMembers(conversationId) {
      const members =
        state.groupMembersByConversationId[conversationId] ??
        state.groupMembersByConversationId["conv-004"];

      return clone({
        conversationId,
        groupSeatId: `group-seat-${conversationId}`,
        items: members,
        thirdGroupId: `third-group-${conversationId}`,
      });
    },
    async getUploadCredential(conversationId) {
      if (!findConversation(state, conversationId)) {
        throw new Error("Conversation not found");
      }

      return {
        allowPerfixs: ["chat-images/"],
        bucket: "mock-bucket-1250000000",
        credentials: {
          sessionToken: "mock-session-token",
          tmpSecretId: "mock-tmp-secret-id",
          tmpSecretKey: "mock-tmp-secret-key",
          token: "mock-token",
        },
        expiration: "2026-05-13T12:00:00Z",
        expiredTime: 1778673600,
        region: "ap-guangzhou",
        requestId: "mock-upload-credential-request",
        startTime: 1778670000,
      };
    },
    async markConversationRead(conversationId) {
      const conversation = findConversation(state, conversationId);

      if (!conversation) {
        throw new Error("Conversation not found");
      }

      const nextConversation = {
        ...conversation,
        unreadCount: 0,
      };

      upsertConversation(state, nextConversation);
      setAccountUnreadCount(
        state,
        nextConversation.seatId,
        Math.max(0, getAccountUnreadCountValue(state, nextConversation.seatId) - conversation.unreadCount),
      );
      syncAccountLastMessageTime(state, nextConversation.seatId);
      pushConversationEvent(state, nextConversation);
      pushAccountEvent(state, nextConversation.seatId);

      return {
        seatId: nextConversation.seatId,
        conversationId,
        unreadCount: 0,
      };
    },
    async markConversationUnread(conversationId) {
      const conversation = findConversation(state, conversationId);

      if (!conversation) {
        throw new Error("Conversation not found");
      }

      const nextConversation = {
        ...conversation,
        unreadCount: 1,
      };

      upsertConversation(state, nextConversation);
      setAccountUnreadCount(
        state,
        nextConversation.seatId,
        Math.max(0, getAccountUnreadCountValue(state, nextConversation.seatId) + 1 - conversation.unreadCount),
      );
      syncAccountLastMessageTime(state, nextConversation.seatId);
      pushConversationEvent(state, nextConversation);
      pushAccountEvent(state, nextConversation.seatId);

      return {
        seatId: nextConversation.seatId,
        conversationId,
        unreadCount: 1,
      };
    },
    async pinConversation(conversationId) {
      return setConversationPinned(state, conversationId, true);
    },
    async unpinConversation(conversationId) {
      return setConversationPinned(state, conversationId, false);
    },
    async poll(request) {
      const sinceVersion = Math.max(
        0,
        request.sinceVersion - (request.freshBaseline ? 0 : MOCK_POLL_OVERLAP_MS),
      );
      const relevantEvents = state.events.filter((event) => event.version > sinceVersion);
      const seatUpdateCursor = request.seatUpdateCursor ?? request.sinceVersion;
      const messageUpdateCursor = request.messageUpdateCursor ?? request.sinceVersion;
      const seatUpdateEvents = collapseLatest(
        state.events.filter(
          (event): event is Extract<WorkbenchEvent, { type: "seat" }> =>
            event.type === "seat" && event.version > seatUpdateCursor,
        ),
        (event) => event.payload.seatId,
      );
      const seatChanges = seatUpdateEvents.map((event) => event.payload);

      const messageUpdateEventRecords = state.events.filter(
        (event): event is Extract<WorkbenchEvent, { type: "message-update" }> =>
          event.type === "message-update" &&
          event.payload.conversationId === request.activeConversationId &&
          event.version > messageUpdateCursor,
      );
      const messageUpdateEvents = messageUpdateEventRecords.map((event) => event.payload);

      const conversationChanges = collapseLatest(
        relevantEvents.filter(
          (event): event is Extract<WorkbenchEvent, { type: "conversation" }> =>
            event.type === "conversation" &&
            event.payload.seatId === request.currentSeatId,
        ),
        (event) => event.payload.conversationId,
      ).map((event) => event.payload);

      const activeConversationMessages = relevantEvents
        .filter(
          (event): event is Extract<WorkbenchEvent, { type: "message" }> =>
            event.type === "message" &&
            event.payload.conversationId === request.activeConversationId &&
            event.payload.seq > (request.activeMessageSeq ?? 0),
        )
        .map((event) => event.payload);

      return {
        seatChanges: clone(seatChanges),
        activeConversationMessages: clone(activeConversationMessages),
        conversationChanges: clone(conversationChanges),
        messageUpdateEvents: clone(messageUpdateEvents),
        nextMessageUpdateCursor: getNextMockEventCursor(
          messageUpdateCursor,
          messageUpdateEventRecords,
        ),
        nextSeatUpdateCursor: getNextMockEventCursor(seatUpdateCursor, seatUpdateEvents),
        nextVersion: state.version,
      };
    },
    async pollSmartReplies() {
      return { suggestions: [] };
    },
    async requestSmartReplyGeneralAnswer() {
      return { suggestion: null };
    },
    async requestSmartReplyAutoGeneralAnswer() {
      return { id: "1" };
    },
    async requestSmartReplyMakeShorter(request) {
      const trimmed = request.content.trim();

      return { content: trimmed ? `${trimmed.slice(0, Math.max(8, Math.floor(trimmed.length / 2)))}…` : "更短的话术" };
    },
    async sendSmartReplyAnswer() {
      return { ok: true };
    },
    async listSmartReplyAttachments(request) {
      return {
        attachments: request.ids.flatMap((id) => {
          const numericId = Number.parseInt(id, 10);

          if (!Number.isSafeInteger(numericId) || numericId <= 0) {
            return [];
          }

          return [
            {
              fileName: `素材-${id}`,
              fileType: 1,
              id: numericId,
            },
          ];
        }),
      };
    },
    async checkSmartReplyTextModeration(request) {
      const demoWords = ["太好用了", "最好", "第一", "极致"];
      const words = demoWords.filter((word) => request.content.includes(word));

      if (words.length === 0) {
        return { result: null };
      }

      return {
        result: {
          categoryLabel: "广告法_通用禁用极限词",
          words,
        },
      };
    },
    async listKnowledgePage() {
      return {
        list: [
          {
            id: "ks-default",
            name: "默认知识集",
          },
        ],
      };
    },
    async getKnowledgeConfig() {
      return {
        config: {
          automaticCheckIllegalWords: 0,
        },
      };
    },
    async listKnowledgeDocPage() {
      return {
        list: [
          {
            id: "faq-default",
            name: "默认 FAQ",
          },
        ],
      };
    },
    async addSmartReplyKnowledgeFaq(request) {
      return {
        docId: request.docId,
      };
    },
    async sendSmartHeartbeat() {
      return { ok: true };
    },
    async sendMessage(payload) {
      const conversation = findConversation(state, payload.conversationId);

      if (!conversation) {
        throw new Error("Conversation not found");
      }

      const now = Date.now();
      const segments = getPayloadSegments(payload);
      const outcome = resolveSendOutcome(state, payload.seatId, segments);
      let hasAppliedQuote = false;
      const backendMessages = segments.map((segment, index) => {
        const messageId = `msg-server-${state.nextId++}`;
        const nextSeq = getNextMessageSeq(state, payload.conversationId) + index;
        const quoteForSegment =
          !hasAppliedQuote && segment.type === "text" ? payload.quote : undefined;
        hasAppliedQuote = hasAppliedQuote || Boolean(quoteForSegment);

        return {
          seatId: payload.seatId,
          clientMessageId: buildSegmentClientMessageId(payload.clientMessageId, index),
          content: buildPayloadSegmentContent(state, segment, quoteForSegment),
          contentType: quoteForSegment
            ? "quote"
            : getPayloadSegmentContentType(segment),
          conversationId: payload.conversationId,
          createdAt: now + index,
          customerId: conversation.customerId,
          failReason: outcome.reason,
          messageId,
          rawMsgtype: quoteForSegment ? "quote" : getPayloadSegmentRawMsgtype(segment),
          senderType: "agent" as const,
          seq: nextSeq,
          status: outcome.status,
        } satisfies WorkbenchMessageDto;
      });

      const messages = state.messagesByConversationId[payload.conversationId] ?? [];
      state.messagesByConversationId[payload.conversationId] = [
        ...messages,
        ...backendMessages,
      ];

      const nextConversation = {
        ...conversation,
        lastMessage: getPayloadPreview(segments),
        lastMessageTime: now,
      };

      upsertConversation(state, nextConversation);
      syncAccountLastMessageTime(state, payload.seatId);
      pushConversationEvent(state, nextConversation);
      pushAccountEvent(state, payload.seatId);
      backendMessages.forEach((message) => {
        pushMessageEvent(state, message);
      });

      return {
        clientMessageId: payload.clientMessageId,
        messageId: backendMessages[0]?.messageId ?? payload.clientMessageId,
        messages: backendMessages.map((message) => ({
          clientMessageId: message.clientMessageId ?? payload.clientMessageId,
          messageId: message.messageId,
          status: "accepted" as const,
        })),
        status: "accepted",
      };
    },
    async takeOverSeat(seatId) {
      const seat = findAccount(state, seatId);

      if (!seat) {
        throw new Error("Account not found");
      }

      const nextAccount = {
        ...seat,
        hostSubUserId: CURRENT_SUB_USER_ID,
      };

      state.seats = state.seats.map((item) =>
        item.seatId === seatId ? nextAccount : item,
      );
      pushAccountEvent(state, seatId);

      return {
        hostSubUserId: CURRENT_SUB_USER_ID,
        seatId: nextAccount.seatId,
      };
    },
    async search(seatId, keyword) {
      return {
        contacts: [],
        groups: [],
      };
    },
    async getOrCreateConversation(payload) {
      const conversations = state.conversationsByAccount[payload.seatId] ?? [];
      const existingConversation = conversations.find((conversation) =>
        payload.chatType === 2
          ? conversation.thirdGroupId === payload.thirdGroupId
          : conversation.thirdExternalUserId === payload.thirdExternalUserId,
      );

      if (existingConversation) {
        return {
          bizStatus: existingConversation.bizStatus ?? 1,
          conversationId: existingConversation.conversationId,
          customerAvatar: existingConversation.customerAvatar,
          customerId: existingConversation.customerId,
          customerName: existingConversation.customerName,
          lastMessage: existingConversation.lastMessage,
          lastMessageTime: existingConversation.lastMessageTime,
          mode: existingConversation.mode,
          priority: existingConversation.priority,
          seatId: existingConversation.seatId,
          thirdExternalUserId: existingConversation.thirdExternalUserId,
          thirdGroupId: existingConversation.thirdGroupId,
          thirdUserId: existingConversation.thirdUserId,
          unreadCount: existingConversation.unreadCount,
          custodyMode:
            existingConversation.custodyMode ?? CONVERSATION_CUSTODY_MODE.SEMI,
        };
      }

      const now = Date.now();
      const conversationId = `mock-conversation-${state.nextId++}`;

      return {
        bizStatus: 1,
        conversationId,
        customerAvatar: "",
        customerId: payload.thirdExternalUserId ?? payload.thirdGroupId ?? conversationId,
        customerName: payload.chatType === 2 ? "未知群聊" : "未知客户",
        lastMessage: "",
        lastMessageTime: now,
        mode: payload.chatType === 2 ? "group" : "single",
        priority: "medium",
        seatId: payload.seatId,
        thirdExternalUserId: payload.thirdExternalUserId,
        thirdGroupId: payload.thirdGroupId,
        thirdUserId: `third-user-${payload.seatId}`,
        unreadCount: 0,
        custodyMode: CONVERSATION_CUSTODY_MODE.SEMI,
      };
    },
  };
}

export function createHttpWorkbenchService(): WorkbenchService {
  return {
    getSeats() {
      return http.get<WorkbenchSeatDto[]>("/server/seats");
    },
    deleteConversation(conversationId) {
      return http.post<WorkbenchConversationDeleteResponse>(
        `/server/conversations/${conversationId}/delete`,
      );
    },
    getConversations(seatId, options) {
      return http.get<WorkbenchConversationListResponse>("/server/conversations", {
        params: {
          cursor: options?.cursor,
          limit: options?.limit,
          mode: options?.mode,
          seatId,
        },
      });
    },
    getMe() {
      return http.get<WorkbenchSubUserDto>("/server/me");
    },
    getCustomers(options) {
      return http.get<WorkbenchCustomerListResponse>("/server/customers", {
        params: {
          cursor: options.cursor,
          keyword: options.keyword,
          limit: options.limit,
          scope: options.scope,
          seat_ids:
            options.scope === "mine" && options.seatIds?.length
              ? options.seatIds.join(",")
              : undefined,
        },
      });
    },
    getCustomerLastConversation(thirdExternalUserId) {
      return http.get<WorkbenchCustomerLastConversationResponse>(
        `/server/customers/${encodeURIComponent(thirdExternalUserId)}/last-conversation`,
      );
    },
    getCustomerRelationConversations(thirdExternalUserId, thirdUserIds) {
      return http.get<WorkbenchCustomerRelationConversationsResponse>(
        `/server/customers/${encodeURIComponent(thirdExternalUserId)}/relation-conversations`,
        {
          params: {
            third_userids: thirdUserIds.join(","),
          },
        },
      );
    },
    listMaterialCollections(request) {
      return http.get<WorkbenchMaterialCollectionListResponse>(
        "/server/material-collections/materials",
        {
          params: {
            biz_type: request.bizType,
            group_id: request.groupId,
            page: request.page,
            page_size: request.pageSize,
          },
        },
      );
    },
    listMaterialGroups(request) {
      return http.get<WorkbenchMaterialCollectionGroupListResponse>(
        "/server/material-collections/groups",
        {
          params: {
            biz_type: request.bizType,
          },
        },
      );
    },
    collectMaterial(request) {
      return http.post<
        WorkbenchMaterialCollectionCreateResponse,
        WorkbenchMaterialCollectionCreateRequest
      >("/server/material-collections", request);
    },
    deleteMaterialCollection(collectionId) {
      return http.delete<WorkbenchMaterialCollectionOkResponse>(
        `/server/material-collections/${collectionId}`,
      );
    },
    topMaterialCollection(collectionId) {
      return http.post<WorkbenchMaterialCollectionOkResponse>(
        `/server/material-collections/${collectionId}/top`,
      );
    },
    moveMaterialCollection(collectionId, request) {
      return http.post<
        WorkbenchMaterialCollectionOkResponse,
        WorkbenchMaterialCollectionMoveRequest
      >(`/server/material-collections/${collectionId}/move`, request);
    },
    updateMaterialCollection(collectionId, request) {
      return http.patch<
        WorkbenchMaterialCollectionOkResponse,
        WorkbenchMaterialCollectionUpdateRequest
      >(`/server/material-collections/${collectionId}`, request);
    },
    createMaterialGroup(request) {
      return http.post<
        WorkbenchMaterialCollectionGroupCreateResponse,
        WorkbenchMaterialCollectionGroupCreateRequest
      >("/server/material-collections/groups", request);
    },
    renameMaterialGroup(groupId, bizType, request) {
      return http.patch<
        WorkbenchMaterialCollectionOkResponse,
        WorkbenchMaterialCollectionGroupUpdateRequest
      >(`/server/material-collections/groups/${groupId}`, request, {
        params: {
          biz_type: bizType,
        },
      });
    },
    topMaterialGroup(groupId, bizType) {
      return http.post<WorkbenchMaterialCollectionOkResponse>(
        `/server/material-collections/groups/${groupId}/top`,
        undefined,
        {
          params: {
            biz_type: bizType,
          },
        },
      );
    },
    deleteMaterialGroup(groupId, bizType) {
      return http.delete<WorkbenchMaterialCollectionOkResponse>(
        `/server/material-collections/groups/${groupId}`,
        {
          params: {
            biz_type: bizType,
          },
        },
      );
    },
    listQuickReplyCategories(request) {
      return http.get<WorkbenchQuickReplyCategoryListResponse>(
        "/server/quick-replies/categories",
        {
          params: {
            scope_type: request.scopeType,
          },
        },
      );
    },
    listQuickReplyCategoryContent(request) {
      return http.get<WorkbenchQuickReplyCategoryContentResponse>(
        "/server/quick-replies/category-content",
        {
          params: {
            parent_category_id: request.parentCategoryId,
            scope_type: request.scopeType,
          },
        },
      );
    },
    listQuickReplies(request) {
      return http.get<WorkbenchQuickReplyListResponse>("/server/quick-replies", {
        params: {
          category_id: request.categoryId,
          keyword: request.keyword,
          page: request.page,
          page_size: request.pageSize,
          scope_type: request.scopeType,
        },
      });
    },
    createQuickReplyCategory(request) {
      return http.post<WorkbenchQuickReplyOkResponse, WorkbenchQuickReplyCategoryCreateRequest>(
        "/server/quick-replies/categories",
        request,
      );
    },
    renameQuickReplyCategory(categoryId, scopeType, request) {
      return http.patch<
        WorkbenchQuickReplyOkResponse,
        WorkbenchQuickReplyCategoryUpdateRequest
      >(`/server/quick-replies/categories/${categoryId}`, request, {
        params: {
          scope_type: scopeType,
        },
      });
    },
    topQuickReplyCategory(categoryId, scopeType) {
      return http.post<WorkbenchQuickReplyOkResponse>(
        `/server/quick-replies/categories/${categoryId}/top`,
        undefined,
        {
          params: {
            scope_type: scopeType,
          },
        },
      );
    },
    bottomQuickReplyCategory(categoryId, scopeType) {
      return http.post<WorkbenchQuickReplyOkResponse>(
        `/server/quick-replies/categories/${categoryId}/bottom`,
        undefined,
        {
          params: {
            scope_type: scopeType,
          },
        },
      );
    },
    deleteQuickReplyCategory(categoryId, scopeType) {
      return http.delete<WorkbenchQuickReplyOkResponse>(
        `/server/quick-replies/categories/${categoryId}`,
        {
          params: {
            scope_type: scopeType,
          },
        },
      );
    },
    createQuickReply(request) {
      return http.post<WorkbenchQuickReplyOkResponse, WorkbenchQuickReplyCreateRequest>(
        "/server/quick-replies",
        request,
      );
    },
    updateQuickReply(quickReplyId, request) {
      return http.patch<WorkbenchQuickReplyOkResponse, WorkbenchQuickReplyUpdateRequest>(
        `/server/quick-replies/${quickReplyId}`,
        request,
      );
    },
    topQuickReply(quickReplyId, scopeType) {
      return http.post<WorkbenchQuickReplyOkResponse>(
        `/server/quick-replies/${quickReplyId}/top`,
        undefined,
        {
          params: {
            scope_type: scopeType,
          },
        },
      );
    },
    bottomQuickReply(quickReplyId, scopeType) {
      return http.post<WorkbenchQuickReplyOkResponse>(
        `/server/quick-replies/${quickReplyId}/bottom`,
        undefined,
        {
          params: {
            scope_type: scopeType,
          },
        },
      );
    },
    deleteQuickReply(quickReplyId, scopeType) {
      return http.delete<WorkbenchQuickReplyOkResponse>(
        `/server/quick-replies/${quickReplyId}`,
        {
          params: {
            scope_type: scopeType,
          },
        },
      );
    },
    getSidebarIframeParams(input) {
      return fetchWorkbenchSidebarIframeParams(input);
    },
    getHistoryMessages(conversationId, options) {
      return http.get<WorkbenchHistoryMessagePageDto>(
        `/server/conversations/${conversationId}/history-messages`,
        {
          params: {
            cursor: options?.cursor,
            day: options?.day,
            limit: options?.limit,
            scope: options?.scope,
            sender_id: options?.senderId,
          },
        },
      );
    },
    async getSidebarItems() {
      const response = await http.get<ApiSuccessEnvelope<SettingsSidebarItemsResponse>>(
        "/server/settings/sidebar-items",
      );

      return response.data;
    },
    getMessages(conversationId, options) {
      return http.get<WorkbenchMessagePageDto>(
        `/server/conversations/${conversationId}/messages`,
        {
          params: {
            before_seq: options?.beforeSeq,
            limit: options?.limit ?? 30,
          },
        },
      );
    },
    getMessagesByIds(input) {
      return http.post<WorkbenchMessageQueryByIdsResponse, WorkbenchMessageQueryByIdsRequest>(
        "/server/messages/query-by-ids",
        input,
      );
    },
    getChatRecordDetail(input) {
      return http.get<WorkbenchChatRecordDetailResponse>(
        `/server/messages/${encodeURIComponent(input.messageId)}/chat-record`,
        {
          params: {
            conversation_id: input.conversationId,
          },
        },
      );
    },
    revokeMessage(input) {
      return http.post<WorkbenchRevokeMessageResponse, WorkbenchRevokeMessageRequest>(
        `/server/messages/${input.messageId}/revoke`,
        {
          conversationId: input.conversationId,
        },
      );
    },
    downloadMessageFile(input) {
      return http.post<
        WorkbenchMessageFileDownloadResponse,
        { conversationId: string; messageSeq: number }
      >(`/server/messages/${input.messageId}/download`, {
        conversationId: input.conversationId,
        messageSeq: input.messageSeq,
      });
    },
    getMessageFileDownloadStatus(input) {
      return http.post<
        WorkbenchMessageFileDownloadStatusResponse | undefined,
        { conversationId: string; messageSeq: number }
      >("/server/messages/download-status", {
        conversationId: input.conversationId,
        messageSeq: input.messageSeq,
      });
    },
    confirmVoicePlaybackReady(input) {
      return http.post<
        WorkbenchVoicePlaybackConfirmResponse,
        WorkbenchVoicePlaybackConfirmRequest
      >("/server/media/voice-playback-confirmed", input);
    },
    transcribeVoiceMessage(input) {
      return http.post<
        WorkbenchVoiceTranscriptionResponse,
        WorkbenchVoiceTranscriptionRequest
      >("/server/media/voice-transcription", input);
    },
    getGroupMembers(conversationId) {
      return http.get<WorkbenchGroupMembersResponse>(
        `/server/conversations/${conversationId}/group-members`,
      );
    },
    getUploadCredential(conversationId) {
      return http.post<
        WorkbenchUploadCredentialResponse,
        { conversationId: string }
      >("/server/media/upload-credential", {
        conversationId,
      });
    },
    markConversationRead(conversationId) {
      return http.post<WorkbenchConversationReadResponse>(
        `/server/conversations/${conversationId}/read`,
      );
    },
    markConversationUnread(conversationId) {
      return http.post<WorkbenchConversationUnreadResponse>(
        `/server/conversations/${conversationId}/unread`,
      );
    },
    pinConversation(conversationId) {
      return http.post<WorkbenchConversationPinResponse>(
        `/server/conversations/${conversationId}/pin`,
      );
    },
    poll(request) {
      const activeConversationId = request.activeConversationId || undefined;
      return http.get<WorkbenchPollResponse>("/server/poll", {
        params: {
          active_conversation_id: activeConversationId,
          active_message_seq:
            activeConversationId && request.activeMessageSeq != null
              ? request.activeMessageSeq
              : undefined,
          current_seat_id: request.currentSeatId,
          fresh_baseline: request.freshBaseline ? "1" : undefined,
          message_update_cursor: request.messageUpdateCursor,
          seat_update_cursor: request.seatUpdateCursor,
          since_version: request.sinceVersion,
        },
      });
    },
    pollSmartReplies(request) {
      return http.post<WorkbenchSmartReplyPollResponse, WorkbenchSmartReplyPollRequest>(
        "/server/smart-reply/poll",
        request,
      );
    },
    requestSmartReplyGeneralAnswer(request) {
      return http.post<
        WorkbenchSmartReplyGeneralAnswerResponse,
        WorkbenchSmartReplyGeneralAnswerRequest
      >("/server/smart-reply/general-answer", request);
    },
    requestSmartReplyAutoGeneralAnswer(request) {
      return http.post<
        WorkbenchSmartReplyAutoGeneralAnswerResponse,
        WorkbenchSmartReplyAutoGeneralAnswerRequest
      >("/server/smart-reply/auto-general-answer", request);
    },
    requestSmartReplyMakeShorter(request) {
      return http.post<
        WorkbenchSmartReplyMakeShorterResponse,
        WorkbenchSmartReplyMakeShorterRequest
      >("/server/smart-reply/make-shorter", request);
    },
    sendSmartReplyAnswer(request) {
      return http.post<
        WorkbenchSmartReplySendAnswerResponse,
        WorkbenchSmartReplySendAnswerRequest
      >("/server/smart-reply/send-answer", request);
    },
    listSmartReplyAttachments(request) {
      return http.post<
        WorkbenchSmartReplyAttachmentsResponse,
        WorkbenchSmartReplyAttachmentsRequest
      >("/server/smart-reply/attachments", request);
    },
    checkSmartReplyTextModeration(request) {
      return http.post<
        WorkbenchSmartReplyTextModerationResponse,
        WorkbenchSmartReplyTextModerationRequest
      >("/server/smart-reply/text-moderation", request);
    },
    listKnowledgePage(request) {
      return http.post<WorkbenchKnowledgePageResponse, WorkbenchKnowledgePageRequest>(
        "/server/smart-reply/knowledge-page",
        request,
      );
    },
    getKnowledgeConfig(request) {
      return http.post<WorkbenchKnowledgeConfigResponse, WorkbenchKnowledgeConfigRequest>(
        "/server/smart-reply/knowledge-config",
        request,
      );
    },
    listKnowledgeDocPage(request) {
      return http.post<WorkbenchKnowledgeDocPageResponse, WorkbenchKnowledgeDocPageRequest>(
        "/server/smart-reply/knowledge-doc-page",
        request,
      );
    },
    addSmartReplyKnowledgeFaq(request) {
      return http.post<WorkbenchKnowledgeFaqAddResponse, WorkbenchKnowledgeFaqAddRequest>(
        "/server/smart-reply/knowledge-faq/add",
        request,
      );
    },
    sendSmartHeartbeat(request) {
      return http.post<WorkbenchSmartHeartbeatResponse, WorkbenchSmartHeartbeatRequest>(
        "/server/conversations/smart-heartbeat",
        request,
      );
    },
    sendMessage(payload) {
      return http.post<WorkbenchSendMessageResponse, WorkbenchSendMessagePayload>(
        "/server/messages/send",
        payload,
      );
    },
    takeOverSeat(seatId) {
      return http.post<WorkbenchTakeOverSeatResponse>(
        `/server/seats/${seatId}/take-over`,
      );
    },
    unpinConversation(conversationId) {
      return http.post<WorkbenchConversationUnpinResponse>(
        `/server/conversations/${conversationId}/unpin`,
      );
    },
    search(seatId, keyword) {
      return http.get<WorkbenchSearchResponseDto>("/server/search", {
        params: { seatId, keyword },
      });
    },
    getOrCreateConversation(payload) {
      return http.post<WorkbenchConversationSummaryDto>(
        "/server/conversations/get-or-create",
        payload,
      );
    },
  };
}

type MockHistoryCursor = {
  anchorSeq?: number;
  direction?: "next" | "prev";
};

function filterMockHistoryMessages(
  state: MockState,
  conversationId: string,
  messages: WorkbenchMessageDto[],
  options?: WorkbenchHistoryMessageQuery,
) {
  const conversation = findConversation(state, conversationId);

  return messages.filter((message) => {
    if (!matchesMockHistoryScope(message, options?.scope)) {
      return false;
    }

    if (options?.day && !matchesMockHistoryDay(message, options.day)) {
      return false;
    }

    if (options?.senderId && !matchesMockHistorySender(conversation, message, options.senderId)) {
      return false;
    }

    return true;
  });
}

function matchesMockHistoryScope(
  message: WorkbenchMessageDto,
  scope: WorkbenchHistoryMessageScope | undefined,
) {
  if (!scope || scope === "all") {
    return true;
  }

  if (scope === "file") {
    return message.contentType === "file";
  }

  if (scope === "media") {
    return message.contentType === "image" || message.contentType === "video";
  }

  if (scope === "h5") {
    return message.contentType === "h5";
  }

  return message.contentType === "mini-program";
}

function matchesMockHistoryDay(message: WorkbenchMessageDto, day: string) {
  const createdAt = message.createdAt ?? 0;

  if (createdAt <= 0) {
    return false;
  }

  const date = new Date(createdAt);
  const localDay = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");

  return localDay === day;
}

function matchesMockHistorySender(
  conversation: WorkbenchConversationSummaryDto | undefined,
  message: WorkbenchMessageDto,
  senderId: string,
) {
  const candidateSenderIds = new Set<string>([
    message.thirdFromId ?? "",
    message.thirdUserId ?? "",
    message.thirdExternalUserId ?? "",
  ]);

  if (conversation?.mode === "single") {
    if (message.senderType === "customer") {
      candidateSenderIds.add(conversation.thirdExternalUserId ?? "");
    }

    if (message.senderType === "agent") {
      candidateSenderIds.add(conversation.thirdUserId ?? "");
    }
  }

  return candidateSenderIds.has(senderId);
}

function normalizeHistoryLimit(limit?: number) {
  if (limit == null || !Number.isFinite(limit) || limit <= 0) {
    return 30;
  }

  return Math.min(100, Math.floor(limit));
}

function decodeMockHistoryCursor(cursor?: string): MockHistoryCursor | undefined {
  if (!cursor) {
    return undefined;
  }

  try {
    return JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as MockHistoryCursor;
  } catch {
    return undefined;
  }
}

function encodeMockHistoryCursor(cursor: MockHistoryCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function sliceMockHistoryMessages(
  messages: WorkbenchMessageDto[],
  input: {
    cursor?: MockHistoryCursor;
    day?: string;
    limit: number;
  },
) {
  const { cursor, day, limit } = input;
  const direction = cursor?.direction ?? (day ? "next" : "prev");
  const anchorSeq = cursor?.anchorSeq;
  const anchorIndex =
    anchorSeq == null ? -1 : messages.findIndex((message) => message.seq === anchorSeq);

  let startIndex: number;

  if (anchorSeq == null) {
    startIndex = direction === "next" ? 0 : Math.max(0, messages.length - limit);
  } else if (direction === "next") {
    startIndex = Math.max(0, anchorIndex + 1);
  } else {
    startIndex = Math.max(0, anchorIndex - limit);
  }

  const pageMessages = messages.slice(startIndex, startIndex + limit);
  const hasPrev = startIndex > 0;
  const hasNext = startIndex + pageMessages.length < messages.length;

  return {
    hasNext,
    hasPrev,
    messages: pageMessages,
    nextCursor: hasNext
      ? encodeMockHistoryCursor({
          anchorSeq: pageMessages.at(-1)?.seq,
          direction: "next",
        })
      : undefined,
    prevCursor: hasPrev
      ? encodeMockHistoryCursor({
          anchorSeq: pageMessages[0]?.seq,
          direction: "prev",
        })
      : undefined,
  };
}

function buildInitialState(): MockState {
  const conversationsByAccount = Object.fromEntries(
    Object.entries(seedConversations).map(([seatId, conversations]) => [
      seatId,
      sortConversations(
        conversations.map((conversation) => ({
          seatId: conversation.accountId,
          conversationId: conversation.id,
          bizStatus: conversation.bizStatus ?? 1,
          custodyMode: conversation.custodyMode,
          customerAvatar: conversation.customerAvatarUrl,
          customerId: conversation.customerId,
          customerName: conversation.customerName,
          lastMessage: conversation.preview,
          lastMessageTime: new Date(conversation.updatedAt.replace(" ", "T")).getTime(),
          isPinned: conversation.isPinned,
          mode: conversation.mode,
          priority: conversation.priority,
          unreadCount: conversation.unread,
          thirdUserId: `third-user-${seatId}`,
          ...(conversation.mode === "group"
            ? { thirdGroupId: `third-group-${conversation.id}` }
            : {}),
        })),
      ),
    ]),
  ) as Record<string, WorkbenchConversationSummaryDto[]>;

  const seats: WorkbenchSeatDto[] = seedAccounts.map((seat) => ({
    seatId: seat.id,
    avatar: seat.avatarUrl,
    description: seat.description,
    lastMessageTime: getAccountLastMessageTime(conversationsByAccount[seat.id] ?? []),
    loginStatus: "online",
    name: seat.name,
    operatorName: seat.operator,
    phone: seat.phone,
    hostSubUserId: seat.id === "drc" ? CURRENT_SUB_USER_ID : undefined,
    unreadCount: seat.unreadCount ?? MOCK_SEAT_UNREAD_COUNTS[seat.id] ?? 0,
  }));

  const messagesByConversationId = Object.fromEntries(
    Object.entries(seedMessages).map(([conversationId, messages]) => [
      conversationId,
      messages.map((message, index) =>
        buildMessageDto({
          message,
          seq: index + 1,
        }),
      ),
    ]),
  ) as Record<string, WorkbenchMessageDto[]>;
  const groupMembersByConversationId = Object.fromEntries(
    Object.entries(seedGroupMembersByConversationId).map(([conversationId, members]) => [
      conversationId,
      members.map((member) => ({
        avatarUrl: member.avatarUrl ?? "",
        displayName: member.displayName,
        thirdUserId: member.id,
        type: member.type,
      })),
    ]),
  ) as MockState["groupMembersByConversationId"];

  return {
    seats,
    conversationsByAccount,
    subUser: {
      displayName: "林洒",
      subUserId: CURRENT_SUB_USER_ID,
    },
    events: [],
    groupMembersByConversationId,
    materialGroups: [
      {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
        id: "mock-material-group-file",
        sort: 200,
        title: "常用文件",
      },
      {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM,
        id: "mock-material-group-mini-program",
        sort: 200,
        title: "常用小程序",
      },
      {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.H5,
        id: "mock-material-group-h5",
        sort: 200,
        title: "常用链接",
      },
      {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.SPHFEED,
        id: "mock-material-group-sphfeed",
        sort: 200,
        title: "常用视频号",
      },
    ],
    materialItems: buildInitialMaterialItems(messagesByConversationId),
    messagesByConversationId,
    nextId: 1,
    quickReplyCategories: [],
    quickReplies: [],
    version: INITIAL_VERSION,
  };
}

function buildInitialMaterialItems(
  messagesByConversationId: Record<string, WorkbenchMessageDto[]>,
): WorkbenchMaterialCollectionItemDto[] {
  return Object.values(messagesByConversationId)
    .flat()
    .flatMap((message) => {
      const bizType = getMaterialBizTypeForContentType(message.contentType);

      if (!bizType) {
        return [];
      }

      const groupId = getMockMaterialGroupId(bizType);

      return [
        {
          bizType,
          content: getMaterialContentRecord(message),
          contentType: getMaterialContentType(bizType),
          groupId,
          id: `mock-material-${message.messageId}`,
          messageId: message.messageId,
          sort: (message.createdAt ?? 0) + bizType,
          title: getMaterialTitle(message),
        },
      ];
    })
    .sort(sortMaterialItems);
}

function buildMessageDto({
  message,
  seq,
}: {
  message: Message;
  seq: number;
}): WorkbenchMessageDto {
  const seatId = getSeatIdByConversationId(message.conversationId);
  const customerId = getCustomerIdByConversationId(message.conversationId);
  const isGroupConversation = isGroupConversationId(message.conversationId);

  return {
    seatId,
    clientMessageId: message.clientMessageId,
    content: buildContent(message),
    contentType: message.content.type,
    conversationId: message.conversationId,
    createdAt: new Date(message.sentAt.replace(" ", "T")).getTime(),
    customerId,
    failReason: message.failReason,
    isRevoked: message.isRevoked,
    messageId: message.remoteMessageId ?? message.id,
    rawMsgtype: getMockRawMsgtype(message.content.type),
    senderAvatar: message.role === "system" ? undefined : message.sender.avatarUrl,
    senderName: message.role === "system" ? undefined : message.sender.name,
    senderType: message.role,
    seq,
    status: normalizeBackendStatus(message.status),
    thirdFromId: message.role === "system"
      ? undefined
      : message.sender.groupMemberId ?? (isGroupConversation ? message.sender.id : undefined),
    thirdGroupId: isGroupConversation
      ? `third-group-${message.conversationId}`
      : undefined,
    thirdUserId: isGroupConversation
      ? `third-user-${seatId}`
      : undefined,
  };
}

function buildMaterialItemFromMessage(
  state: MockState,
  message: WorkbenchMessageDto,
  request: WorkbenchMaterialCollectionCreateRequest,
): WorkbenchMaterialCollectionItemDto {
  const bizType = request.bizType;
  const contentType = getMaterialContentType(bizType);
  const groupId =
    bizType === MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION
      ? 0
      : String(request.groupId);

  return {
    bizType,
    content: getMaterialContentRecord(message),
    contentType,
    groupId,
    id: `mock-material-${state.nextId++}`,
    messageId: request.messageId,
    sort: Date.now(),
    title: getMaterialTitle(message),
  };
}

function buildFallbackMaterialItem(
  state: MockState,
  request: WorkbenchMaterialCollectionCreateRequest,
): WorkbenchMaterialCollectionItemDto {
  const contentType = getMaterialContentType(request.bizType);
  const groupId =
    request.bizType === MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION
      ? 0
      : String(request.groupId);

  return {
    bizType: request.bizType,
    content: {},
    contentType,
    groupId,
    id: `mock-material-${state.nextId++}`,
    messageId: request.messageId,
    sort: Date.now(),
    title: request.messageId,
  };
}

function getMaterialBizTypeForContentType(
  contentType: WorkbenchMessageDto["contentType"],
): MaterialCollectionBizType | undefined {
  switch (contentType) {
    case "emotion":
      return MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION;
    case "file":
      return MATERIAL_COLLECTION_BIZ_TYPE.FILE;
    case "mini-program":
      return MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM;
    case "h5":
      return MATERIAL_COLLECTION_BIZ_TYPE.H5;
    case "sphfeed":
      return MATERIAL_COLLECTION_BIZ_TYPE.SPHFEED;
    default:
      return undefined;
  }
}

function getMaterialContentType(
  bizType: MaterialCollectionBizType,
): WorkbenchMaterialCollectionItemDto["contentType"] {
  switch (bizType) {
    case MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION:
      return "emotion";
    case MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM:
      return "mini-program";
    case MATERIAL_COLLECTION_BIZ_TYPE.H5:
      return "h5";
    case MATERIAL_COLLECTION_BIZ_TYPE.SPHFEED:
      return "sphfeed";
    case MATERIAL_COLLECTION_BIZ_TYPE.FILE:
      return "file";
  }
}

function getMockMaterialGroupId(bizType: MaterialCollectionBizType): string | 0 {
  switch (bizType) {
    case MATERIAL_COLLECTION_BIZ_TYPE.FILE:
      return "mock-material-group-file";
    case MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM:
      return "mock-material-group-mini-program";
    case MATERIAL_COLLECTION_BIZ_TYPE.H5:
      return "mock-material-group-h5";
    case MATERIAL_COLLECTION_BIZ_TYPE.SPHFEED:
      return "mock-material-group-sphfeed";
    case MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION:
      return 0;
  }
}

function getMaterialContentRecord(message: WorkbenchMessageDto) {
  return isRecord(message.content) ? message.content : {};
}

function getMaterialContentRecordFromItem(item: WorkbenchMaterialCollectionItemDto) {
  return isRecord(item.content) ? item.content : {};
}

function resolveMockMaterialCollect(
  message: WorkbenchMessageDto | undefined,
  request: WorkbenchMaterialCollectionCreateRequest,
):
  | { content: WorkbenchMaterialCollectionItemDto["content"]; title: string }
  | { errorMsg: string } {
  const rawContent = message ? JSON.stringify(getMaterialContentRecord(message)) : "{}";

  if (request.bizType === MATERIAL_COLLECTION_BIZ_TYPE.FILE) {
    const resolved = resolveMaterialFileCollectFields(rawContent, {
      fileName: request.fileName,
    });

    if ("errorMsg" in resolved) {
      return resolved;
    }

    return {
      content: JSON.parse(
        buildMaterialFileContentJson(rawContent, resolved),
      ) as WorkbenchMaterialCollectionItemDto["content"],
      title: resolved.fileName,
    };
  }

  if (request.bizType === MATERIAL_COLLECTION_BIZ_TYPE.H5) {
    const resolved = resolveMaterialH5CollectFields(rawContent, {
      description: request.description,
      title: request.title,
    });

    if ("errorMsg" in resolved) {
      return resolved;
    }

    return {
      content: JSON.parse(
        buildMaterialH5ContentJson(rawContent, resolved),
      ) as WorkbenchMaterialCollectionItemDto["content"],
      title: resolved.title,
    };
  }

  return {
    content: message ? getMaterialContentRecord(message) : {},
    title: message ? getMaterialTitle(message) : request.messageId,
  };
}

function getMaterialTitle(message: WorkbenchMessageDto) {
  const content = getMaterialContentRecord(message);

  if (message.contentType === "emotion") {
    return "表情";
  }

  return (
    readString(content.fileName) ||
    readString(content.title) ||
    readString(content.appName) ||
    message.messageId
  );
}

function sortMaterialItems(
  left: WorkbenchMaterialCollectionItemDto,
  right: WorkbenchMaterialCollectionItemDto,
) {
  return right.sort - left.sort || right.id.localeCompare(left.id, "zh-Hans-CN");
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function buildContent(message: Message) {
  switch (message.content.type) {
    case "system":
      return { text: message.content.text };
    case "revoke":
      return {
        revokeMsgId: message.content.revokeMsgId,
        revokeOriginMsgId: message.content.revokeOriginMsgId,
        text: message.content.text,
        type: "revoke",
      };
    case "text":
      return { text: message.content.text };
    case "voice":
      return {
        audioUrl: message.content.audioUrl,
        durationLabel: message.content.durationLabel,
      };
    case "image":
      return {
        alt: message.content.alt,
        downloadStatus: message.content.downloadStatus,
        fileSerialNo: message.content.fileSerialNo,
        height: message.content.height,
        imageUrl: message.content.imageUrl,
        width: message.content.width,
      };
    case "video":
      return {
        alt: message.content.alt,
        coverImageUrl: message.content.coverImageUrl,
        downloadStatus: message.content.downloadStatus,
        durationLabel: message.content.durationLabel,
        fileSerialNo: message.content.fileSerialNo,
        fileUrlExpireTime: message.content.fileUrlExpireTime,
        height: message.content.height,
        videoUrl: message.content.videoUrl,
        width: message.content.width,
      };
    case "file":
      return {
        downloadStatus: message.content.downloadStatus,
        extension: message.content.extension,
        fileName: message.content.fileName,
        fileSerialNo: message.content.fileSerialNo,
        fileSizeLabel: message.content.fileSizeLabel,
        fileUrl: message.content.fileUrl,
        sourceLabel: message.content.sourceLabel,
      };
    case "h5":
      return {
        description: message.content.description,
        previewImageUrl: message.content.previewImageUrl,
        sourceLabel: message.content.sourceLabel,
        title: message.content.title,
        url: message.content.url,
      };
    case "mini-program":
      return {
        appName: message.content.appName,
        coverImageUrl: message.content.coverImageUrl,
        logoUrl: message.content.logoUrl,
        sourceLabel: message.content.sourceLabel,
        title: message.content.title,
      };
    case "contact-card":
      return {
        avatarUrl: message.content.avatarUrl,
        company: message.content.company,
        contactSerialNo: message.content.contactSerialNo,
        groupSerialNo: message.content.groupSerialNo,
        name: message.content.name,
        sourceLabel: message.content.sourceLabel,
      };
    case "location":
      return {
        address: message.content.address,
        latitude: message.content.latitude,
        longitude: message.content.longitude,
        title: message.content.title,
        zoom: message.content.zoom,
      };
    case "sphfeed":
      return {
        description: message.content.description,
        imageUrl: message.content.imageUrl,
        sourceLabel: message.content.sourceLabel,
        title: message.content.title,
        url: message.content.url,
      };
    case "solitaire":
      return {
        createMemberSerialNo: message.content.createMemberSerialNo,
        example: message.content.example,
        items: message.content.items,
        tail: message.content.tail,
        title: message.content.title,
      };
    case "redpacket":
      return {
        description: message.content.description,
        title: message.content.title,
        totalAmount: message.content.totalAmount,
        totalCnt: message.content.totalCnt,
      };
    case "quote":
      return {
        quoteMsgId: message.content.quoteMsgId,
        quotedMessage: message.content.quotedMessage,
        text: message.content.text,
      };
    case "chatrecord":
      return {
        msgContent: message.content.msgContent,
        msgTitle: message.content.msgTitle,
        unsupportedDisplayText: message.content.unsupportedDisplayText,
      };
  }
}

function normalizeBackendStatus(status: Message["status"]): WorkbenchMessageStatus {
  switch (status) {
    case "pending":
      return "queued";
    case "sending":
      return "sending";
    case "failed":
      return "failed";
    case "sent":
    default:
      return "sent";
  }
}

function getSeatIdByConversationId(conversationId: string) {
  const conversation = Object.values(seedConversations)
    .flat()
    .find((item) => item.id === conversationId);

  return conversation?.accountId ?? "drc";
}

function getCustomerIdByConversationId(conversationId: string) {
  const conversation = Object.values(seedConversations)
    .flat()
    .find((item) => item.id === conversationId);

  return conversation?.customerId ?? "cust-001";
}

function isGroupConversationId(conversationId: string) {
  return Object.values(seedConversations)
    .flat()
    .some((item) => item.id === conversationId && item.mode === "group");
}

function getAccountLastMessageTime(conversations: WorkbenchConversationSummaryDto[]) {
  return conversations.reduce(
    (latest, conversation) => Math.max(latest, conversation.lastMessageTime ?? 0),
    0,
  );
}

function findConversation(state: MockState, conversationId: string) {
  return Object.values(state.conversationsByAccount)
    .flat()
    .find((conversation) => conversation.conversationId === conversationId);
}

function findAccount(state: MockState, seatId: string) {
  return state.seats.find((seat) => seat.seatId === seatId);
}

function upsertConversation(state: MockState, nextConversation: WorkbenchConversationSummaryDto) {
  const currentConversations = state.conversationsByAccount[nextConversation.seatId] ?? [];
  state.conversationsByAccount[nextConversation.seatId] = sortConversations([
    nextConversation,
    ...currentConversations.filter(
      (conversation) => conversation.conversationId !== nextConversation.conversationId,
    ),
  ]);
}

function setConversationPinned(
  state: MockState,
  conversationId: string,
  isPinned: boolean,
) {
  const conversation = findConversation(state, conversationId);

  if (!conversation) {
    throw new Error("Conversation not found");
  }

  const nextConversation = {
    ...conversation,
    isPinned: isPinned ? true : undefined,
  };

  upsertConversation(state, nextConversation);
  pushConversationEvent(state, {
    ...nextConversation,
    isPinned,
  });

  return {
    conversationId,
    isPinned,
    seatId: nextConversation.seatId,
  };
}

function removeConversation(
  state: MockState,
  conversationId: string,
): WorkbenchConversationDeleteResponse {
  const conversation = findConversation(state, conversationId);

  if (!conversation) {
    throw new Error("Conversation not found");
  }

  state.conversationsByAccount[conversation.seatId] = (
    state.conversationsByAccount[conversation.seatId] ?? []
  ).filter((item) => item.conversationId !== conversationId);
  setAccountUnreadCount(
    state,
    conversation.seatId,
    Math.max(0, getAccountUnreadCountValue(state, conversation.seatId) - conversation.unreadCount),
  );
  syncAccountLastMessageTime(state, conversation.seatId);
  pushConversationRemoveEvent(state, conversation.seatId, conversationId);
  pushAccountEvent(state, conversation.seatId);

  return {
    conversationId,
    seatId: conversation.seatId,
  };
}

function getAccountUnreadCountValue(state: MockState, seatId: string) {
  return findAccount(state, seatId)?.unreadCount ?? 0;
}

function setAccountUnreadCount(
  state: MockState,
  seatId: string,
  unreadCount: number,
) {
  const seat = findAccount(state, seatId);

  if (!seat) {
    return;
  }

  seat.unreadCount = unreadCount;
}

function syncAccountLastMessageTime(state: MockState, seatId: string) {
  const seat = findAccount(state, seatId);

  if (!seat) {
    return;
  }

  const conversations = state.conversationsByAccount[seatId] ?? [];
  seat.lastMessageTime = getAccountLastMessageTime(conversations);
}

function pushAccountEvent(state: MockState, seatId: string) {
  const seat = findAccount(state, seatId);

  if (!seat) {
    return;
  }

  state.version = Math.max(state.version + 1, Date.now());
  state.events.push({
    payload: {
      seatId,
      lastMessageTime: seat.lastMessageTime,
      unreadCount: seat.unreadCount,
    },
    type: "seat",
    version: state.version,
  });
}

function pushConversationEvent(state: MockState, conversation: WorkbenchConversationSummaryDto) {
  state.version = Math.max(state.version + 1, Date.now(), conversation.lastMessageTime ?? 0);
  state.events.push({
    payload: {
      ...conversation,
      type: "upsert",
    },
    type: "conversation",
    version: state.version,
  });
}

function pushConversationRemoveEvent(
  state: MockState,
  seatId: string,
  conversationId: string,
) {
  state.version = Math.max(state.version + 1, Date.now());
  state.events.push({
    payload: {
      conversationId,
      seatId,
      type: "remove",
    },
    type: "conversation",
    version: state.version,
  });
}

function pushMessageEvent(state: MockState, message: WorkbenchMessageDto) {
  state.version = Math.max(state.version + 1, Date.now(), message.createdAt ?? 0);
  state.events.push({
    payload: message,
    type: "message",
    version: state.version,
  });
}

function pushMessageUpdateEvent(
  state: MockState,
  event: WorkbenchMessageUpdateEventDto,
) {
  state.version = Math.max(state.version + 1, Date.now());
  state.events.push({
    payload: event,
    type: "message-update",
    version: state.version,
  });
}

function getNextMockEventCursor(
  currentCursor: number,
  events: Array<{
    version?: number;
  }>,
) {
  if (!Number.isFinite(currentCursor)) {
    return undefined;
  }

  return events.reduce(
    (latest, event) => Math.max(latest, event.version ?? currentCursor),
    currentCursor,
  );
}

function revokeMessage(
  state: MockState,
  conversationId: string,
  messageId: string,
) {
  const messages = state.messagesByConversationId[conversationId] ?? [];
  const originalMessage = messages.find((message) =>
    message.messageId === messageId || String(message.seq) === messageId,
  );

  if (!originalMessage) {
    return undefined;
  }

  const nextMessage = {
    ...originalMessage,
    isRevoked: true,
  };

  state.messagesByConversationId[conversationId] = messages.map((message) =>
    message.messageId === originalMessage.messageId ? nextMessage : message,
  );

  const revokeSignal = {
    content: {
      revokeMsgId: String(originalMessage.seq),
      revokeOriginMsgId: String(originalMessage.seq),
      type: "revoke",
    },
    contentType: "revoke",
    conversationId,
    createdAt: Date.now(),
    customerId: originalMessage.customerId,
    messageId: `revoke-${originalMessage.messageId}`,
    rawMsgtype: "revoke",
    seatId: originalMessage.seatId,
    senderType: "system" as const,
    seq: getNextMessageSeq(state, conversationId),
    status: "sent" as const,
  } satisfies WorkbenchMessageDto;

  state.messagesByConversationId[conversationId] = [
    ...state.messagesByConversationId[conversationId],
    revokeSignal,
  ];

  pushMessageUpdateEvent(state, {
    conversationId,
    eventId: state.version + 1,
    messageId: originalMessage.messageId,
  });
  pushMessageEvent(state, revokeSignal);

  return originalMessage;
}

function getNextMessageSeq(state: MockState, conversationId: string) {
  const messages = state.messagesByConversationId[conversationId] ?? [];

  return (messages.at(-1)?.seq ?? 0) + 1;
}

function getPayloadSegments(payload: WorkbenchSendMessagePayload) {
  if (payload.segment) {
    return [payload.segment];
  }

  if (payload.segments?.length) {
    return payload.segments;
  }

  return [
    {
      text: payload.content ?? "",
      type: "text" as const,
    },
  ];
}

function buildPayloadSegmentContent(
  state: MockState,
  segment: ReturnType<typeof getPayloadSegments>[number],
  quote?: WorkbenchSendMessagePayload["quote"],
) {
  if (quote && segment.type === "text") {
    return {
      quoteMsgId: quote.quoteMsgId,
      quotedMessageId: quote.quotedMessageId,
      quotedMessage: quote.quotedMessage,
      text: segment.text,
    };
  }

  if (segment.type === "image") {
    return {
      alt: segment.alt,
      height: segment.height,
      imageUrl: segment.url ?? segment.localUrl ?? "",
      width: segment.width,
    };
  }

  if (segment.type === "emotion") {
    const materialContent = getMockMaterialContentRecord(state, segment.materialCollectionId);
    const fileUrl = readString(materialContent.fileUrl);

    return {
      alt: "自定义表情",
      fileUrl: fileUrl ?? "mock://material-expression",
    };
  }

  if (segment.type === "file") {
    const materialContent = segment.materialCollectionId && !segment.msgid
      ? getMockMaterialContentRecord(state, segment.materialCollectionId)
      : {};
    const fileName = readString(materialContent.fileName) ?? segment.fileName;
    const fileUrl = readString(materialContent.fileUrl) ?? segment.url;

    return {
      extension: readString(materialContent.extension) ?? segment.extension,
      fileName,
      fileSizeLabel: readString(materialContent.fileSizeLabel) ?? segment.fileSizeLabel ?? "",
      fileUrl,
      sourceLabel: "文件",
    };
  }

  if (segment.type === "h5") {
    const materialContent = segment.materialCollectionId && !segment.msgid
      ? getMockMaterialContentRecord(state, segment.materialCollectionId)
      : {};

    return {
      description:
        readString(materialContent.description) ??
        readString(materialContent.desc) ??
        segment.desc ??
        "",
      previewImageUrl:
        readString(materialContent.previewImageUrl) ??
        readString(materialContent.coverUrl) ??
        segment.coverUrl,
      sourceLabel: "链接",
      title: readString(materialContent.title) ?? segment.title,
      url:
        readString(materialContent.url) ??
        readString(materialContent.href) ??
        segment.href,
    };
  }

  if (segment.type === "weapp") {
    const materialContent = segment.msgid
      ? {}
      : getMockMaterialContentRecord(state, segment.materialCollectionId);

    return {
      appName: readString(materialContent.appName) ?? segment.appName ?? "小程序",
      coverImageUrl:
        readString(materialContent.coverImageUrl) ??
        readString(materialContent.imageUrl) ??
        segment.coverImageUrl,
      logoUrl: readString(materialContent.logoUrl) ?? segment.logoUrl,
      sourceLabel: readString(materialContent.sourceLabel) ?? segment.sourceLabel ?? "小程序",
      title: readString(materialContent.title) ?? segment.title ?? "小程序",
    };
  }

  if (segment.type === "sphfeed") {
    const materialContent = segment.msgid
      ? {}
      : getMockMaterialContentRecord(state, segment.materialCollectionId);

    return {
      description: readString(materialContent.description) ?? segment.description ?? "",
      imageUrl: readString(materialContent.imageUrl) ?? segment.imageUrl,
      sourceLabel: readString(materialContent.sourceLabel) ?? segment.sourceLabel ?? "视频号",
      title: readString(materialContent.title) ?? segment.title ?? "视频号",
      url: readString(materialContent.url) ?? segment.url,
    };
  }

  if (segment.type === "text") {
    return {
      text: segment.text,
    };
  }

  return {
    text: "",
  };
}

function getMockMaterialContentRecord(state: MockState, materialCollectionId: string) {
  const item = state.materialItems.find((materialItem) => materialItem.id === materialCollectionId);

  return item ? getMaterialContentRecordFromItem(item) : {};
}

function getPayloadSegmentContentType(
  segment: ReturnType<typeof getPayloadSegments>[number],
): WorkbenchMessageDto["contentType"] {
  if (segment.type === "emotion") {
    return "image";
  }

  if (segment.type === "weapp") {
    return "mini-program";
  }

  return segment.type;
}

function getPayloadSegmentRawMsgtype(
  segment: ReturnType<typeof getPayloadSegments>[number],
) {
  return segment.type;
}

function findMessageByIdOrSeq(
  state: MockState,
  conversationId: string,
  messageId: string | undefined,
  messageSeq: number,
) {
  const messages = state.messagesByConversationId[conversationId] ?? [];

  return messages.find(
    (message) =>
      (messageId && message.messageId === messageId) || message.seq === messageSeq,
  );
}

function updateMessageDownloadContent(
  state: MockState,
  conversationId: string,
  messageId: string,
  patch: {
    downloadStatus: "ing" | "finished" | "failed";
    fileUrl?: string;
    fileUrlExpireTime?: number;
  },
) {
  const messages = state.messagesByConversationId[conversationId] ?? [];

  state.messagesByConversationId[conversationId] = messages.map((message) => {
    if (message.messageId !== messageId || !isFileDownloadContent(message.content)) {
      return message;
    }

    return {
      ...message,
      content: {
        ...message.content,
        ...stripUndefinedFields(patch),
      },
    };
  });
}

function updateVoicePlaybackContent(
  state: MockState,
  conversationId: string,
  messageSeq: number,
  patch: {
    playbackUrl: string;
    transFileUrl: string;
    transFileUrlPersisted: true;
  },
) {
  const messages = state.messagesByConversationId[conversationId] ?? [];

  state.messagesByConversationId[conversationId] = messages.map((message) => {
    if (message.seq !== messageSeq || message.contentType !== "voice") {
      return message;
    }

    return {
      ...message,
      content: {
        ...message.content,
        ...patch,
      },
    };
  });
}

function updateVoiceTranscriptionContent(
  state: MockState,
  conversationId: string,
  messageSeq: number,
  patch: {
    transVoiceText: string;
  },
) {
  const messages = state.messagesByConversationId[conversationId] ?? [];

  state.messagesByConversationId[conversationId] = messages.map((message) => {
    if (message.seq !== messageSeq || message.contentType !== "voice") {
      return message;
    }

    return {
      ...message,
      content: {
        ...message.content,
        ...patch,
      },
    };
  });
}

function stripUndefinedFields<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined),
  ) as Partial<T>;
}

function getMockRawMsgtype(contentType: Message["content"]["type"]) {
  switch (contentType) {
    case "h5":
      return "link";
    case "mini-program":
      return "weapp";
    case "contact-card":
      return "card";
    default:
      return contentType;
  }
}

function isFileDownloadContent(
  content: WorkbenchMessageDto["content"],
): content is (FileMessageContent | VideoMessageContent) & Record<string, unknown> {
  return content.type === "file" || content.type === "video";
}

function getPayloadPreview(segments: ReturnType<typeof getPayloadSegments>) {
  const firstTextSegment = segments.find((segment) => segment.type === "text");

  if (firstTextSegment?.text) {
    return firstTextSegment.text;
  }

  if (segments.some((segment) => segment.type === "image")) {
    return "[图片]";
  }

  if (segments.some((segment) => segment.type === "emotion")) {
    return "[表情]";
  }

  if (segments.some((segment) => segment.type === "file")) {
    return "[文件]";
  }

  if (segments.some((segment) => segment.type === "h5")) {
    return "[链接]";
  }

  if (segments.some((segment) => segment.type === "weapp")) {
    return "[小程序]";
  }

  return segments.some((segment) => segment.type === "sphfeed") ? "[视频号]" : "";
}

function buildSegmentClientMessageId(clientMessageId: string, index: number) {
  return index === 0 ? clientMessageId : `${clientMessageId}_${index + 1}`;
}

function resolveSendOutcome(
  state: MockState,
  seatId: string,
  segments: ReturnType<typeof getPayloadSegments>,
) {
  const seat = findAccount(state, seatId);
  const shouldFail =
    seat?.loginStatus === "offline" ||
    segments.some((segment) => segment.type === "text" && /\[fail\]/i.test(segment.text));

  if (shouldFail) {
    return {
      reason: seat?.loginStatus === "offline" ? "企微账号离线" : "模拟发送失败",
      status: "failed" as const,
    };
  }

  return {
    status: "sent" as const,
  };
}

function sortConversations(conversations: WorkbenchConversationSummaryDto[]) {
  return [...conversations].sort(
    (left, right) =>
      Number(Boolean(right.isPinned)) - Number(Boolean(left.isPinned)) ||
      (right.lastMessageTime ?? 0) - (left.lastMessageTime ?? 0),
  );
}

function sortQuickReplyEntries<T extends { id: string; sort: number }>(left: T, right: T) {
  return right.sort - left.sort || right.id.localeCompare(left.id);
}

function getAppendQuickReplyCategorySort(
  categories: WorkbenchQuickReplyCategoryDto[],
  scopeType: WorkbenchQuickReplyCategoryDto["scopeType"],
  parentId: WorkbenchQuickReplyCategoryDto["parentId"],
) {
  const siblingSorts = categories
    .filter((category) => category.scopeType === scopeType && category.parentId === parentId)
    .map((category) => category.sort);

  return siblingSorts.length ? Math.min(...siblingSorts) - 1 : Date.now();
}

function getPrependQuickReplyCategorySort(
  categories: WorkbenchQuickReplyCategoryDto[],
  scopeType: WorkbenchQuickReplyCategoryDto["scopeType"],
  parentId: WorkbenchQuickReplyCategoryDto["parentId"],
) {
  const siblingSorts = categories
    .filter((category) => category.scopeType === scopeType && category.parentId === parentId)
    .map((category) => category.sort);

  return siblingSorts.length ? Math.max(...siblingSorts) + 1 : Date.now();
}

function getAppendQuickReplySort(
  quickReplies: WorkbenchQuickReplyDto[],
  scopeType: WorkbenchQuickReplyDto["scopeType"],
  categoryId: WorkbenchQuickReplyDto["categoryId"],
) {
  const siblingSorts = quickReplies
    .filter((reply) => reply.scopeType === scopeType && reply.categoryId === categoryId)
    .map((reply) => reply.sort);

  return siblingSorts.length ? Math.min(...siblingSorts) - 1 : Date.now();
}

function getPrependQuickReplySort(
  quickReplies: WorkbenchQuickReplyDto[],
  scopeType: WorkbenchQuickReplyDto["scopeType"],
  categoryId: WorkbenchQuickReplyDto["categoryId"],
) {
  const siblingSorts = quickReplies
    .filter((reply) => reply.scopeType === scopeType && reply.categoryId === categoryId)
    .map((reply) => reply.sort);

  return siblingSorts.length ? Math.max(...siblingSorts) + 1 : Date.now();
}

function collapseLatest<T>(
  items: T[],
  getKey: (item: T) => string,
) {
  const latestByKey = new Map<string, T>();

  for (const item of items) {
    latestByKey.set(getKey(item), item);
  }

  return [...latestByKey.values()];
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
