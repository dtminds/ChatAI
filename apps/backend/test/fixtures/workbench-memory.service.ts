import type {
  WorkbenchConversationDeleteResponse,
  WorkbenchConversationListResponse,
  WorkbenchSeatChangeDto,
  WorkbenchSeatDto,
  WorkbenchConversationChangeDto,
  WorkbenchConversationPinResponse,
  WorkbenchConversationReadResponse,
  WorkbenchConversationUnpinResponse,
  WorkbenchConversationUnreadResponse,
  WorkbenchConversationSummaryDto,
  WorkbenchGroupMembersResponse,
  WorkbenchHistoryMessagePageDto,
  WorkbenchHistoryMessageQuery,
  WorkbenchSubUserDto,
  WorkbenchMessageDto,
  WorkbenchMessageFileDownloadResponse,
  WorkbenchMessagePageDto,
  WorkbenchMessageStatus,
  WorkbenchPollRequest,
  WorkbenchPollResponse,
  WorkbenchSmartReplyAttachmentsRequest,
  WorkbenchSmartReplyAttachmentsResponse,
  WorkbenchSmartReplyAutoGeneralAnswerRequest,
  WorkbenchSmartReplyAutoGeneralAnswerResponse,
  WorkbenchSmartReplyGeneralAnswerRequest,
  WorkbenchSmartReplyGeneralAnswerResponse,
  WorkbenchSmartReplyMakeShorterRequest,
  WorkbenchSmartReplyMakeShorterResponse,
  WorkbenchSmartReplySendAnswerRequest,
  WorkbenchSmartReplySendAnswerResponse,
  WorkbenchSmartReplyPollRequest,
  WorkbenchSmartReplyPollResponse,
  WorkbenchKnowledgePageRequest,
  WorkbenchKnowledgePageResponse,
  WorkbenchKnowledgeConfigRequest,
  WorkbenchKnowledgeConfigResponse,
  WorkbenchKnowledgeDocPageRequest,
  WorkbenchKnowledgeDocPageResponse,
  WorkbenchKnowledgeFaqAddRequest,
  WorkbenchKnowledgeFaqAddResponse,
  WorkbenchSmartHeartbeatRequest,
  WorkbenchSmartHeartbeatResponse,
  WorkbenchSmartReplyTextModerationRequest,
  WorkbenchSmartReplyTextModerationResponse,
  WorkbenchRevokeMessageResponse,
  WorkbenchSendMessagePayload,
  WorkbenchSendMessageResponse,
  WorkbenchSidebarIframeParamsRequest,
  WorkbenchTakeOverSeatResponse,
  WorkbenchUploadCredentialResponse,
  WorkbenchVoicePlaybackConfirmRequest,
  WorkbenchVoicePlaybackConfirmResponse,
  WorkbenchVoiceTranscriptionRequest,
  WorkbenchVoiceTranscriptionResponse,
  type WorkbenchMaterialCollectionCreateRequest,
  type WorkbenchMaterialCollectionCreateResponse,
  type WorkbenchMaterialCollectionGroupCreateRequest,
  type WorkbenchMaterialCollectionGroupCreateResponse,
  type WorkbenchMaterialCollectionGroupDto,
  type WorkbenchMaterialCollectionGroupListRequest,
  type WorkbenchMaterialCollectionGroupListResponse,
  type WorkbenchMaterialCollectionGroupUpdateRequest,
  type WorkbenchMaterialCollectionItemDto,
  type WorkbenchMaterialCollectionListRequest,
  type WorkbenchMaterialCollectionListResponse,
  type WorkbenchMaterialCollectionMoveRequest,
  type WorkbenchMaterialCollectionOkResponse,
  type WorkbenchQuickReplyCategoryCreateRequest,
  type WorkbenchQuickReplyBatchCreateRequest,
  type WorkbenchQuickReplyBatchCreateResponse,
  type WorkbenchQuickReplyCategoryContentRequest,
  type WorkbenchQuickReplyCategoryContentResponse,
  type WorkbenchQuickReplyCategoryDto,
  type WorkbenchQuickReplyCategoryEnsureRequest,
  type WorkbenchQuickReplyCategoryEnsureResponse,
  type WorkbenchQuickReplyImportRowError,
  type WorkbenchQuickReplyCategoryListRequest,
  type WorkbenchQuickReplyCategoryListResponse,
  type WorkbenchQuickReplyCategoryMoveRequest,
  type WorkbenchQuickReplyCategoryUpdateRequest,
  type WorkbenchQuickReplyCreateRequest,
  type WorkbenchQuickReplyDto,
  type WorkbenchQuickReplyListRequest,
  type WorkbenchQuickReplyListResponse,
  type WorkbenchQuickReplyMoveRequest,
  type WorkbenchQuickReplyOkResponse,
  type WorkbenchQuickReplyUpdateRequest,
} from "@chatai/contracts";
import {
  MATERIAL_COLLECTION_BIZ_TYPE,
  MATERIAL_COLLECTION_GROUP_MAX_COUNT,
  QUICK_REPLY_BATCH_CREATE_LIMIT,
  QUICK_REPLY_CATEGORY_TITLE_MAX_LENGTH,
  QUICK_REPLY_CONTENT_TEXT_MAX_LENGTH,
  QUICK_REPLY_IMPORT_PRIMARY_CATEGORY_LIMIT,
  QUICK_REPLY_IMPORT_SECONDARY_CATEGORY_LIMIT,
  QUICK_REPLY_LABEL_TEXT_MAX_LENGTH,
  isQuickReplyLabelColor,
  normalizeQuickReplyAttachments,
  validateQuickReplyPayload,
} from "@chatai/contracts";
import { BadRequestError, NotFoundError } from "../../src/shared/errors.js";

const QUICK_REPLY_TOP_CATEGORY_LIMIT = 50;
const QUICK_REPLY_CHILD_CATEGORY_LIMIT = 50;

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
    };

type MemoryWorkbenchState = {
  seats: WorkbenchSeatDto[];
  conversationsBySeat: Record<string, WorkbenchConversationSummaryDto[]>;
  groupMembersByConversationId: Record<string, WorkbenchGroupMembersResponse>;
  subUser: WorkbenchSubUserDto;
  events: WorkbenchEvent[];
  materialGroups: WorkbenchMaterialCollectionGroupDto[];
  materialItems: WorkbenchMaterialCollectionItemDto[];
  messagesByConversationId: Record<string, WorkbenchMessageDto[]>;
  nextId: number;
  quickReplyCategories: WorkbenchQuickReplyCategoryDto[];
  quickReplies: WorkbenchQuickReplyDto[];
  version: number;
};

const CURRENT_SUB_USER_ID = "sub-user-001";
const INITIAL_VERSION = 1284;

const seatAvatarDrcUrl =
  "http://wework.qpic.cn/wwhead/duc2TvpEgSTewUnFO43HZ22H445fU0MTybfXZqjldjWlOArMJOM2GNsH3CUWyOuESHYdY5oHPhk/60";
const seatAvatarNdtUrl =
  "http://wework.qpic.cn/bizmail/GNtOLFv4zDw4EZia6Xg0YYvxibVQLtqfia5aRx5spGwaIm2vHgicBiarTuQ/60";
const customerAvatarUrl =
  "http://wx.qlogo.cn/mmhead/mOW261WJzibt0Sve4EmicjZbjRVJTuAYYHKCSNMriasW9CUOVVG9fsxicEeGrIuXnzkrbdgoAx7CEZI/64";
const customerAvatarRuiUrl =
  "http://wx.qlogo.cn/mmhead/5kc3roGJvWsakhB3k2hHcwC5eib6c9ialcF49rCibSQnz8/64";
const customerAvatarPlusUrl =
  "http://wx.qlogo.cn/mmhead/PiajxSqBRaEKoAfO0HnN90OicIskcZnJAeuFZ6zy6vErDJ1IeRzBtnXg/64";
const customerAvatarGroupUrl =
  "http://wx.qlogo.cn/mmhead/Q3auHgzwzM6CpFt8WP7GR5bh4xIwzjnaYTjhkNO0znVzMmcATUR4wg/64";
const customerAvatarXiaoyuUrl =
  "http://wx.qlogo.cn/mmhead/DoiajoZ3WVG6gOj80wYnYvb63wkempRp9licrvrymnbJk/64";
const customerAvatarSleepUrl =
  "http://wx.qlogo.cn/mmhead/6XFhg7ldObwgEHpMMpKicrLCNW2PgeAJFb4kRg3P5jn4dWbDceQ7kibA/64";

export type MemoryWorkbenchService = ReturnType<typeof createMemoryWorkbenchService>;

export function createMemoryWorkbenchService() {
  const state = buildInitialState();

  return {
    deleteConversation(
      _subUserId: string,
      conversationId: string,
    ): WorkbenchConversationDeleteResponse {
      return removeConversation(state, conversationId);
    },
    getSeats(_subUserId: string) {
      return clone(state.seats);
    },
    getConversations(
      _subUserId: string,
      seatId: string,
      options?: { cursor?: string; limit?: number; mode?: "single" | "group" },
    ): WorkbenchConversationListResponse {
      const snapshotAt = Date.now();
      const limit = options?.limit ?? 500;
      const conversations = sortConversations(state.conversationsBySeat[seatId] ?? [])
        .filter((conversation) => options?.mode == null || conversation.mode === options.mode)
        .slice(0, limit);

      return {
        hasMore: false,
        items: clone(conversations),
        snapshotAt,
      };
    },
    getMe(_subUserId: string) {
      return clone(state.subUser);
    },
    listMaterialCollections(
      _subUserId: string,
      request: WorkbenchMaterialCollectionListRequest,
    ): WorkbenchMaterialCollectionListResponse {
      if (
        request.bizType !== MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION &&
        request.groupId == null
      ) {
        throw new BadRequestError("MATERIAL_GROUP_REQUIRED", "请选择分组");
      }

      const page = request.page ?? 1;
      const pageSize = request.pageSize ?? 100;
      const matchingItems = state.materialItems.filter(
        (item) =>
          item.bizType === request.bizType &&
          item.groupId === request.groupId,
      );

      return {
        items: clone(
          matchingItems.slice((page - 1) * pageSize, page * pageSize),
        ),
        pagination: {
          hasMore: page * pageSize < matchingItems.length,
          page,
          pageSize,
          total: matchingItems.length,
        },
      };
    },
    listMaterialGroups(
      _subUserId: string,
      request: WorkbenchMaterialCollectionGroupListRequest,
    ): WorkbenchMaterialCollectionGroupListResponse {
      return {
        groups: clone(
          state.materialGroups.filter((group) => group.bizType === request.bizType),
        ),
      };
    },
    collectMaterial(
      _subUserId: string,
      request: WorkbenchMaterialCollectionCreateRequest,
    ): WorkbenchMaterialCollectionCreateResponse {
      if (
        request.bizType !== MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION &&
        (request.groupId === undefined || request.groupId === 0 || request.groupId === "0")
      ) {
        return {
          success: false,
          errorMsg: "请选择分组",
        };
      }

      const item = buildMemoryMaterialItem(state, request);
      state.materialItems = [
        item,
        ...state.materialItems.filter(
          (existing) => existing.msgInfoId !== request.msgInfoId,
        ),
      ];

      return { success: true };
    },
    deleteMaterialCollection(
      _subUserId: string,
      collectionId: string,
    ): WorkbenchMaterialCollectionOkResponse {
      state.materialItems = state.materialItems.filter((item) => item.id !== collectionId);
      return { ok: true };
    },
    topMaterialCollection(
      _subUserId: string,
      collectionId: string,
    ): WorkbenchMaterialCollectionOkResponse {
      const sort = Date.now();
      state.materialItems = state.materialItems.map((item) =>
        item.id === collectionId ? { ...item, sort } : item,
      );
      return { ok: true };
    },
    moveMaterialCollection(
      _subUserId: string,
      collectionId: string,
      request: WorkbenchMaterialCollectionMoveRequest,
    ): WorkbenchMaterialCollectionOkResponse {
      state.materialItems = state.materialItems.map((item) =>
        item.id === collectionId
          ? { ...item, groupId: request.groupId, sort: Date.now() }
          : item,
      );
      return { ok: true };
    },
    createMaterialGroup(
      _subUserId: string,
      request: WorkbenchMaterialCollectionGroupCreateRequest,
    ): WorkbenchMaterialCollectionGroupCreateResponse {
      if (request.bizType === MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION) {
        throw new BadRequestError("MATERIAL_GROUP_UNSUPPORTED", "表情不支持自定义分组");
      }

      const existingGroupCount = state.materialGroups.filter(
        (group) => group.bizType === request.bizType,
      ).length;

      if (existingGroupCount >= MATERIAL_COLLECTION_GROUP_MAX_COUNT) {
        throw new BadRequestError("MATERIAL_GROUP_LIMIT_REACHED", "分组数量已达上限");
      }

      const group = {
        bizType: request.bizType,
        id: String(state.nextId++),
        sort: Date.now(),
        title: request.title,
      };
      state.materialGroups.unshift(group);
      return clone(group);
    },
    renameMaterialGroup(
      _subUserId: string,
      groupId: string,
      _bizType: number,
      request: WorkbenchMaterialCollectionGroupUpdateRequest,
    ): WorkbenchMaterialCollectionOkResponse {
      state.materialGroups = state.materialGroups.map((group) =>
        group.id === groupId ? { ...group, title: request.title } : group,
      );
      return { ok: true };
    },
    topMaterialGroup(
      _subUserId: string,
      groupId: string,
      _bizType: number,
    ): WorkbenchMaterialCollectionOkResponse {
      state.materialGroups = state.materialGroups.map((group) =>
        group.id === groupId ? { ...group, sort: Date.now() } : group,
      );
      return { ok: true };
    },
    deleteMaterialGroup(
      _subUserId: string,
      groupId: string,
      bizType: number,
    ): WorkbenchMaterialCollectionOkResponse {
      if (
        state.materialItems.some(
          (item) => item.bizType === bizType && item.groupId === groupId,
        )
      ) {
        throw new BadRequestError(
          "MATERIAL_GROUP_NOT_EMPTY",
          "请先移走或删除分组内素材",
        );
      }

      state.materialGroups = state.materialGroups.filter((group) => group.id !== groupId);
      return { ok: true };
    },
    listQuickReplyCategories(
      _subUserId: string,
      request: WorkbenchQuickReplyCategoryListRequest,
    ): WorkbenchQuickReplyCategoryListResponse {
      return {
        categories: clone(
          state.quickReplyCategories
            .filter((category) => category.scopeType === request.scopeType)
            .sort(sortQuickReplyEntries),
        ),
      };
    },
    ensureQuickReplyCategories(
      _subUserId: string,
      request: WorkbenchQuickReplyCategoryEnsureRequest,
    ): WorkbenchQuickReplyCategoryEnsureResponse {
      const normalized = normalizeMemoryQuickReplyCategoryEnsureRequest(
        request.categories,
      );

      if (!normalized.ok) {
        return buildMemoryQuickReplyImportFailure(normalized.errors);
      }

      const limitErrors = validateMemoryQuickReplyCategoryEnsureLimits({
        categories: normalized.categories,
        scopeType: request.scopeType,
        stateCategories: state.quickReplyCategories,
      });

      if (limitErrors.length > 0) {
        return buildMemoryQuickReplyImportFailure(limitErrors);
      }

      const categories = [];
      let createdPrimaryCategoryCount = 0;
      let createdSecondaryCategoryCount = 0;

      for (const requestedCategory of normalized.categories) {
        let primaryCategory = state.quickReplyCategories.find(
          (category) =>
            category.scopeType === request.scopeType &&
            category.parentId === 0 &&
            category.title === requestedCategory.title,
        );

        if (!primaryCategory) {
          primaryCategory = {
            id: `quick-reply-category-${state.nextId++}`,
            parentId: 0,
            scopeType: request.scopeType,
            sort: getAppendQuickReplyCategorySort(
              state.quickReplyCategories,
              request.scopeType,
              0,
            ),
            title: requestedCategory.title,
          };
          state.quickReplyCategories = [
            ...state.quickReplyCategories,
            primaryCategory,
          ];
          createdPrimaryCategoryCount += 1;
        }

        const children = [];
        for (const requestedChild of requestedCategory.children) {
          let childCategory = state.quickReplyCategories.find(
            (category) =>
              category.scopeType === request.scopeType &&
              category.parentId === primaryCategory.id &&
              category.title === requestedChild,
          );

          if (!childCategory) {
            childCategory = {
              id: `quick-reply-category-${state.nextId++}`,
              parentId: primaryCategory.id,
              scopeType: request.scopeType,
              sort: getAppendQuickReplyCategorySort(
                state.quickReplyCategories,
                request.scopeType,
                primaryCategory.id,
              ),
              title: requestedChild,
            };
            state.quickReplyCategories = [
              ...state.quickReplyCategories,
              childCategory,
            ];
            createdSecondaryCategoryCount += 1;
          }

          children.push({
            id: childCategory.id,
            title: childCategory.title,
          });
        }

        categories.push({
          children,
          id: primaryCategory.id,
          title: primaryCategory.title,
        });
      }

      return {
        categories,
        ok: true,
        summary: {
          createdPrimaryCategoryCount,
          createdSecondaryCategoryCount,
        },
      };
    },
    createQuickReplyCategory(
      _subUserId: string,
      request: WorkbenchQuickReplyCategoryCreateRequest,
    ): WorkbenchQuickReplyOkResponse {
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
        title: request.title.trim(),
      };
      state.quickReplyCategories = [...state.quickReplyCategories, category];
      return { ok: true };
    },
    renameQuickReplyCategory(
      _subUserId: string,
      categoryId: string,
      scopeType: number,
      request: WorkbenchQuickReplyCategoryUpdateRequest,
    ): WorkbenchQuickReplyOkResponse {
      state.quickReplyCategories = state.quickReplyCategories.map((category) =>
        category.id === categoryId && category.scopeType === scopeType
          ? { ...category, title: request.title.trim() }
          : category,
      );
      return { ok: true };
    },
    topQuickReplyCategory(
      _subUserId: string,
      categoryId: string,
      scopeType: number,
    ): WorkbenchQuickReplyOkResponse {
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
    bottomQuickReplyCategory(
      _subUserId: string,
      categoryId: string,
      scopeType: number,
    ): WorkbenchQuickReplyOkResponse {
      const category = state.quickReplyCategories.find(
        (item) => item.id === categoryId && item.scopeType === scopeType,
      );
      const sort = getAppendQuickReplyCategorySort(
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
    deleteQuickReplyCategory(
      _subUserId: string,
      categoryId: string,
      scopeType: number,
    ): WorkbenchQuickReplyOkResponse {
      if (
        state.quickReplyCategories.some(
          (category) =>
            category.scopeType === scopeType && category.parentId === categoryId,
        )
      ) {
        throw new BadRequestError("QUICK_REPLY_CATEGORY_HAS_CHILDREN", "请先删除话术分组");
      }

      if (
        state.quickReplies.some(
          (reply) =>
            reply.scopeType === scopeType && reply.categoryId === categoryId,
        )
      ) {
        throw new BadRequestError("QUICK_REPLY_CATEGORY_NOT_EMPTY", "请先删除分组下的话术");
      }

      state.quickReplyCategories = state.quickReplyCategories.filter(
        (category) => !(category.id === categoryId && category.scopeType === scopeType),
      );
      return { ok: true };
    },
    moveQuickReplyCategory(
      _subUserId: string,
      categoryId: string,
      scopeType: number,
      request: WorkbenchQuickReplyCategoryMoveRequest,
    ): WorkbenchQuickReplyOkResponse {
      const category = state.quickReplyCategories.find(
        (item) => item.id === categoryId && item.scopeType === scopeType,
      );
      const targetParent = state.quickReplyCategories.find(
        (item) => item.id === request.parentId && item.scopeType === scopeType,
      );

      if (!category || !targetParent) {
        throw new NotFoundError("QUICK_REPLY_CATEGORY_NOT_FOUND", "分类不存在");
      }

      if (category.parentId === 0) {
        throw new BadRequestError(
          "QUICK_REPLY_CATEGORY_MOVE_INVALID",
          "一级分类暂不支持移动",
        );
      }

      if (targetParent.parentId !== 0) {
        throw new BadRequestError("QUICK_REPLY_CATEGORY_MOVE_INVALID", "请选择一级分类");
      }

      if (category.parentId === request.parentId) {
        return { ok: true };
      }

      state.quickReplyCategories = state.quickReplyCategories.map((item) =>
        item.id === categoryId && item.scopeType === scopeType
          ? {
              ...item,
              parentId: request.parentId,
              sort: getAppendQuickReplyCategorySort(
                state.quickReplyCategories,
                scopeType,
                request.parentId,
              ),
            }
          : item,
      );
      return { ok: true };
    },
    listQuickReplyCategoryContent(
      _subUserId: string,
      request: WorkbenchQuickReplyCategoryContentRequest,
    ): WorkbenchQuickReplyCategoryContentResponse {
      const categories = state.quickReplyCategories
        .filter(
          (category) =>
            category.scopeType === request.scopeType &&
            category.parentId === request.parentCategoryId,
        )
        .sort(sortQuickReplyEntries)
        .slice(0, 50);
      const categoryIds = new Set(categories.map((category) => category.id));
      const quickReplies = state.quickReplies
        .filter(
          (reply) =>
            reply.scopeType === request.scopeType &&
            typeof reply.categoryId === "string" &&
            categoryIds.has(reply.categoryId),
        )
        .sort(sortQuickReplyEntries)
        .slice(0, 10_000);
      const quickRepliesByCategoryId: Record<string, WorkbenchQuickReplyDto[]> = {};

      for (const category of categories) {
        quickRepliesByCategoryId[category.id] = [];
      }

      for (const quickReply of quickReplies) {
        if (typeof quickReply.categoryId === "string") {
          quickRepliesByCategoryId[quickReply.categoryId] ??= [];
          quickRepliesByCategoryId[quickReply.categoryId]?.push(clone(quickReply));
        }
      }

      return {
        categories: clone(categories),
        limits: {
          categories: 50,
          quickReplies: 10_000,
        },
        quickRepliesByCategoryId,
        truncated: {
          categories:
            state.quickReplyCategories.filter(
              (category) =>
                category.scopeType === request.scopeType &&
                category.parentId === request.parentCategoryId,
            ).length > 50,
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
    listQuickReplies(
      _subUserId: string,
      request: WorkbenchQuickReplyListRequest,
    ): WorkbenchQuickReplyListResponse {
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
    createQuickReply(
      _subUserId: string,
      request: WorkbenchQuickReplyCreateRequest,
    ): WorkbenchQuickReplyOkResponse {
      validateMemoryQuickReplyPayload(request);
      const now = Date.now();
      const categoryId = request.categoryId ?? 0;
      assertMemoryQuickReplyChildCategory(categoryId, request.scopeType, state.quickReplyCategories);

      state.quickReplies = [
        ...state.quickReplies,
        {
          attachments: normalizeQuickReplyAttachments(request.attachments ?? []),
          categoryId,
          contentText: request.contentText?.trim() ?? "",
          createdAt: now,
          id: `quick-reply-${state.nextId++}`,
          labelColor: request.labelColor?.trim() ?? "",
          labelText: request.labelText?.trim() ?? "",
          scopeType: request.scopeType,
          sort: getAppendQuickReplySort(
            state.quickReplies,
            request.scopeType,
            categoryId,
          ),
          updatedAt: now,
        },
      ];
      return { ok: true };
    },
    batchCreateQuickReplies(
      _subUserId: string,
      request: WorkbenchQuickReplyBatchCreateRequest,
    ): WorkbenchQuickReplyBatchCreateResponse {
      const normalized = normalizeMemoryQuickReplyBatchCreateRequest(request.items);

      if (!normalized.ok) {
        return buildMemoryQuickReplyImportFailure(normalized.errors);
      }

      const categoryErrors: WorkbenchQuickReplyImportRowError[] = [];

      for (const item of normalized.items) {
        const category = state.quickReplyCategories.find(
          (candidate) =>
            candidate.id === item.categoryId &&
            candidate.scopeType === request.scopeType,
        );

        if (!category || category.parentId === 0) {
          categoryErrors.push({
            message: "请选择二级分类",
            rowNumber: item.rowNumber,
          });
        }
      }

      if (categoryErrors.length > 0) {
        return buildMemoryQuickReplyImportFailure(categoryErrors);
      }

      const now = Date.now();
      for (const item of normalized.items) {
        state.quickReplies = [
          ...state.quickReplies,
          {
            attachments: [],
            categoryId: item.categoryId,
            contentText: item.contentText,
            createdAt: now,
            id: `quick-reply-${state.nextId++}`,
            labelColor: item.labelColor,
            labelText: item.labelText,
            scopeType: request.scopeType,
            sort: getAppendQuickReplySort(
              state.quickReplies,
              request.scopeType,
              item.categoryId,
            ),
            updatedAt: now,
          },
        ];
      }

      return {
        ok: true,
        summary: {
          createdQuickReplyCount: normalized.items.length,
        },
      };
    },
    updateQuickReply(
      _subUserId: string,
      quickReplyId: string,
      request: WorkbenchQuickReplyUpdateRequest,
    ): WorkbenchQuickReplyOkResponse {
      validateMemoryQuickReplyPayload(request);
      const now = Date.now();
      const categoryId = request.categoryId ?? 0;
      assertMemoryQuickReplyChildCategory(categoryId, request.scopeType, state.quickReplyCategories);

      state.quickReplies = state.quickReplies.map((reply) =>
        reply.id === quickReplyId && reply.scopeType === request.scopeType
          ? {
              ...reply,
              attachments: normalizeQuickReplyAttachments(request.attachments ?? []),
              categoryId,
              contentText: request.contentText?.trim() ?? "",
              labelColor: request.labelColor?.trim() ?? "",
              labelText: request.labelText?.trim() ?? "",
              updatedAt: now,
            }
          : reply,
      );
      return { ok: true };
    },
    topQuickReply(
      _subUserId: string,
      quickReplyId: string,
      scopeType: number,
    ): WorkbenchQuickReplyOkResponse {
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
    bottomQuickReply(
      _subUserId: string,
      quickReplyId: string,
      scopeType: number,
    ): WorkbenchQuickReplyOkResponse {
      const quickReply = state.quickReplies.find(
        (reply) => reply.id === quickReplyId && reply.scopeType === scopeType,
      );
      const sort = getAppendQuickReplySort(
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
    deleteQuickReply(
      _subUserId: string,
      quickReplyId: string,
      scopeType: number,
    ): WorkbenchQuickReplyOkResponse {
      state.quickReplies = state.quickReplies.filter(
        (reply) => !(reply.id === quickReplyId && reply.scopeType === scopeType),
      );
      return { ok: true };
    },
    moveQuickReply(
      _subUserId: string,
      quickReplyId: string,
      scopeType: number,
      request: WorkbenchQuickReplyMoveRequest,
    ): WorkbenchQuickReplyOkResponse {
      const quickReply = state.quickReplies.find(
        (reply) => reply.id === quickReplyId && reply.scopeType === scopeType,
      );

      if (!quickReply) {
        throw new NotFoundError("QUICK_REPLY_NOT_FOUND", "话术不存在");
      }

      if (quickReply.categoryId === request.categoryId) {
        return { ok: true };
      }

      const sourceCategory = state.quickReplyCategories.find(
        (category) =>
          category.id === quickReply.categoryId && category.scopeType === scopeType,
      );
      const targetCategory = state.quickReplyCategories.find(
        (category) =>
          category.id === request.categoryId && category.scopeType === scopeType,
      );

      if (!sourceCategory || !targetCategory) {
        throw new NotFoundError("QUICK_REPLY_CATEGORY_NOT_FOUND", "分类不存在");
      }

      if (sourceCategory.parentId !== targetCategory.parentId) {
        throw new BadRequestError(
          "QUICK_REPLY_MOVE_SCOPE_INVALID",
          "只能移动到当前一级分类下",
        );
      }

      state.quickReplies = state.quickReplies.map((reply) =>
        reply.id === quickReplyId && reply.scopeType === scopeType
          ? {
              ...reply,
              categoryId: request.categoryId,
              sort: getAppendQuickReplySort(
                state.quickReplies,
                scopeType,
                request.categoryId,
              ),
            }
          : reply,
      );
      return { ok: true };
    },
    async getSidebarIframeParams(_subUserId: string, _input: WorkbenchSidebarIframeParamsRequest) {
      throw new NotFoundError(
        "SIDEBAR_TUSE_CRYPTO_NOT_FOUND",
        "侧栏加密配置不存在或未启用",
      );
    },
    getMessages(
      _subUserId: string,
      conversationId: string,
      options?: { beforeSeq?: number; limit?: number },
    ) {
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
        } satisfies WorkbenchMessagePageDto;
      }

      const candidateMessages =
        beforeSeq == null
          ? messages
          : messages.filter((message) => message.seq < beforeSeq);
      const scannedMessages =
        sliceLatest(candidateMessages, limit + 1).slice(-limit);
      return {
        filteredCount: 0,
        hasMore: candidateMessages.length > limit,
        messages: clone(scannedMessages),
        nextBeforeSeq: scannedMessages[0]?.seq,
        scannedCount: scannedMessages.length,
      } satisfies WorkbenchMessagePageDto;
    },
    async getHistoryMessages(
      subUserId: string,
      conversationId: string,
      options?: WorkbenchHistoryMessageQuery,
    ): Promise<WorkbenchHistoryMessagePageDto> {
      const page = this.getMessages(subUserId, conversationId, {
        beforeSeq: undefined,
        limit: options?.limit ?? 30,
      });

      return {
        hasNext: false,
        hasPrev: false,
        messages: page.messages,
      };
    },
    getGroupMembers(
      _subUserId: string,
      conversationId: string,
    ): WorkbenchGroupMembersResponse {
      const response = state.groupMembersByConversationId[conversationId];

      if (!response) {
        throw new NotFoundError("CONVERSATION_NOT_FOUND", "会话不存在");
      }

      return clone(response);
    },
    getUploadCredential(
      _subUserId: string,
      conversationId: string,
    ): WorkbenchUploadCredentialResponse {
      const conversation = findConversation(state, conversationId);

      if (!conversation) {
        throw new NotFoundError("CONVERSATION_NOT_FOUND", "会话不存在");
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
    downloadMessageFile(
      _subUserId: string,
      conversationId: string,
      msgInfoId: number,
    ): WorkbenchMessageFileDownloadResponse {
      const conversation = findConversation(state, conversationId);

      if (!conversation) {
        throw new NotFoundError("CONVERSATION_NOT_FOUND", "会话不存在");
      }

      return {
        messageSeq: msgInfoId,
        status: "accepted",
      };
    },
    confirmVoicePlaybackReady(
      _subUserId: string,
      input: WorkbenchVoicePlaybackConfirmRequest,
    ): WorkbenchVoicePlaybackConfirmResponse {
      const conversation = findConversation(state, input.conversationId);

      if (!conversation) {
        throw new NotFoundError("CONVERSATION_NOT_FOUND", "会话不存在");
      }

      state.messagesByConversationId[input.conversationId] = (
        state.messagesByConversationId[input.conversationId] ?? []
      ).map((item) =>
        item.seq === input.messageSeq && item.contentType === "voice"
          ? {
              ...item,
              content: {
                ...item.content,
                playbackUrl: input.playbackUrl,
                transFileUrl: input.playbackUrl,
                transFileUrlPersisted: true,
              },
            }
          : item,
      );

      return {
        messageSeq: input.messageSeq,
        playbackUrl: input.playbackUrl,
        transFileUrlPersisted: true,
      };
    },
    transcribeVoiceMessage(
      _subUserId: string,
      input: WorkbenchVoiceTranscriptionRequest,
    ): WorkbenchVoiceTranscriptionResponse {
      const conversation = findConversation(state, input.conversationId);

      if (!conversation) {
        throw new NotFoundError("CONVERSATION_NOT_FOUND", "会话不存在");
      }

      state.messagesByConversationId[input.conversationId] = (
        state.messagesByConversationId[input.conversationId] ?? []
      ).map((item) =>
        item.seq === input.messageSeq && item.contentType === "voice"
          ? {
              ...item,
              content: {
                ...item.content,
                transVoiceText: "这是一段语音转文字测试文本",
              },
            }
          : item,
      );

      return {
        messageSeq: input.messageSeq,
        transVoiceText: "这是一段语音转文字测试文本",
        transVoiceTextPersisted: true,
      };
    },
    markConversationRead(
      _subUserId: string,
      conversationId: string,
    ): WorkbenchConversationReadResponse {
      const conversation = findConversation(state, conversationId);

      if (!conversation) {
        throw new NotFoundError("CONVERSATION_NOT_FOUND", "会话不存在");
      }

      const nextConversation = {
        ...conversation,
        unreadCount: 0,
      };

      upsertConversation(state, nextConversation);
      setSeatUnreadCount(
        state,
        nextConversation.seatId,
        Math.max(0, getSeatUnreadCountValue(state, nextConversation.seatId) - conversation.unreadCount),
      );
      syncSeatLastMessageTime(state, nextConversation.seatId);
      pushConversationEvent(state, nextConversation);
      pushSeatEvent(state, nextConversation.seatId);

      return {
        seatId: nextConversation.seatId,
        conversationId,
        unreadCount: 0,
      };
    },
    markConversationUnread(
      _subUserId: string,
      conversationId: string,
    ): WorkbenchConversationUnreadResponse {
      const conversation = findConversation(state, conversationId);

      if (!conversation) {
        throw new NotFoundError("CONVERSATION_NOT_FOUND", "会话不存在");
      }

      const nextConversation = {
        ...conversation,
        unreadCount: 1,
      };

      upsertConversation(state, nextConversation);
      setSeatUnreadCount(
        state,
        nextConversation.seatId,
        Math.max(0, getSeatUnreadCountValue(state, nextConversation.seatId) + 1 - conversation.unreadCount),
      );
      syncSeatLastMessageTime(state, nextConversation.seatId);
      pushConversationEvent(state, nextConversation);
      pushSeatEvent(state, nextConversation.seatId);

      return {
        seatId: nextConversation.seatId,
        conversationId,
        unreadCount: 1,
      };
    },
    pinConversation(
      _subUserId: string,
      conversationId: string,
    ): WorkbenchConversationPinResponse {
      return setConversationPinned(state, conversationId, true);
    },
    poll(_subUserId: string, request: WorkbenchPollRequest): WorkbenchPollResponse {
      const relevantEvents = state.events.filter((event) => event.version > request.sinceVersion);
      const seatUpdateCursor = request.seatUpdateCursor ?? request.sinceVersion;
      const seatUpdateEvents = collapseLatest(
        state.events.filter(
          (event): event is Extract<WorkbenchEvent, { type: "seat" }> =>
            event.type === "seat" && event.version > seatUpdateCursor,
        ),
        (event) => event.payload.seatId,
      );
      const seatChanges = seatUpdateEvents.map((event) => event.payload);
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
        nextSeatUpdateCursor: getNextMemoryEventCursor(seatUpdateCursor, seatUpdateEvents),
        nextVersion: state.version,
      };
    },
    pollSmartReplies(
      _subUserId: string,
      _request: WorkbenchSmartReplyPollRequest,
    ): WorkbenchSmartReplyPollResponse {
      return { suggestions: [] };
    },
    requestSmartReplyGeneralAnswer(
      _subUserId: string,
      _request: WorkbenchSmartReplyGeneralAnswerRequest,
    ): WorkbenchSmartReplyGeneralAnswerResponse {
      return { suggestion: null };
    },
    requestSmartReplyAutoGeneralAnswer(
      _subUserId: string,
      _request: WorkbenchSmartReplyAutoGeneralAnswerRequest,
    ): WorkbenchSmartReplyAutoGeneralAnswerResponse {
      return { id: "1" };
    },
    requestSmartReplyMakeShorter(
      _subUserId: string,
      _request: WorkbenchSmartReplyMakeShorterRequest,
    ): WorkbenchSmartReplyMakeShorterResponse {
      return { content: _request.content.trim() || "更短的话术" };
    },
    sendSmartReplyAnswer(
      _subUserId: string,
      _request: WorkbenchSmartReplySendAnswerRequest,
    ): WorkbenchSmartReplySendAnswerResponse {
      return { ok: true };
    },
    listKnowledgePage(
      _subUserId: string,
      _request: WorkbenchKnowledgePageRequest,
    ): WorkbenchKnowledgePageResponse {
      return {
        list: [
          {
            id: "ks-default",
            name: "默认知识集",
          },
        ],
      };
    },
    getKnowledgeConfig(
      _subUserId: string,
      _request: WorkbenchKnowledgeConfigRequest,
    ): WorkbenchKnowledgeConfigResponse {
      return {
        config: {
          automaticCheckIllegalWords: 0,
        },
      };
    },
    listKnowledgeDocPage(
      _subUserId: string,
      _request: WorkbenchKnowledgeDocPageRequest,
    ): WorkbenchKnowledgeDocPageResponse {
      return {
        list: [
          {
            id: "faq-default",
            name: "默认 FAQ",
          },
        ],
      };
    },
    addKnowledgeFaq(
      _subUserId: string,
      request: WorkbenchKnowledgeFaqAddRequest,
    ): WorkbenchKnowledgeFaqAddResponse {
      return {
        docId: request.docId,
      };
    },
    sendSmartHeartbeat(
      _subUserId: string,
      _request: WorkbenchSmartHeartbeatRequest,
    ): WorkbenchSmartHeartbeatResponse {
      return { ok: true };
    },
    checkSmartReplyTextModeration(
      _subUserId: string,
      request: WorkbenchSmartReplyTextModerationRequest,
    ): WorkbenchSmartReplyTextModerationResponse {
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
    listSmartReplyAttachments(
      _subUserId: string,
      request: WorkbenchSmartReplyAttachmentsRequest,
    ): WorkbenchSmartReplyAttachmentsResponse {
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
    sendMessage(
      _subUserId: string,
      payload: WorkbenchSendMessagePayload,
    ): WorkbenchSendMessageResponse {
      const conversation = findConversation(state, payload.conversationId);

      if (!conversation || conversation.seatId !== payload.seatId) {
        throw new NotFoundError("CONVERSATION_NOT_FOUND", "会话不存在");
      }

      const now = Date.now();
      const segments = getPayloadSegments(payload);
      const outcome = resolveSendOutcome(state, payload.seatId, segments);
      let hasAppliedQuote = false;
      const backendMessages = segments.map((segment, index) => {
        const messageId = state.nextId++;
        const msgid = `msg-server-${messageId}`;
        const segmentOptNo = buildMockOptNo(messageId);
        const nextSeq = getNextMessageSeq(state, payload.conversationId) + index;
        const quoteForSegment =
          !hasAppliedQuote && segment.type === "text" ? payload.quote : undefined;
        hasAppliedQuote = hasAppliedQuote || Boolean(quoteForSegment);

        return {
          seatId: payload.seatId,
          content: buildPayloadSegmentContent(state, segment, quoteForSegment),
          contentType: quoteForSegment ? "quote" : segment.type,
          conversationId: payload.conversationId,
          createdAt: now + index,
          customerId: conversation.customerId,
          failReason: outcome.reason,
          msgid,
          optNo: segmentOptNo,
          rawMsgtype: quoteForSegment ? "quote" : segment.type,
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
      syncSeatLastMessageTime(state, payload.seatId);
      pushConversationEvent(state, nextConversation);
      pushSeatEvent(state, payload.seatId);
      backendMessages.forEach((message) => {
        pushMessageEvent(state, message);
      });

      return {
        optNo: backendMessages[0]?.optNo ?? "",
        messages: backendMessages.map((message) => ({
          optNo: message.optNo ?? "",
          status: "accepted" as const,
        })),
        status: "accepted",
      };
    },
    revokeMessage(
      _subUserId: string,
      conversationId: string,
      messageSeq: number,
    ): WorkbenchRevokeMessageResponse {
      return revokeMessage(state, conversationId, messageSeq);
    },
    takeOverSeat(_subUserId: string, seatId: string): WorkbenchTakeOverSeatResponse {
      const seat = findSeat(state, seatId);

      if (!seat) {
        throw new NotFoundError("ACCOUNT_NOT_FOUND", "账号不存在");
      }

      const nextSeat = {
        ...seat,
        hostSubUserId: CURRENT_SUB_USER_ID,
      };

      state.seats = state.seats.map((item) =>
        item.seatId === seatId ? nextSeat : item,
      );
      pushSeatEvent(state, seatId);

      return {
        hostSubUserId: CURRENT_SUB_USER_ID,
        seatId: nextSeat.seatId,
      };
    },
    unpinConversation(
      _subUserId: string,
      conversationId: string,
    ): WorkbenchConversationUnpinResponse {
      return setConversationPinned(state, conversationId, false);
    },
  };
}

function buildInitialState(): MemoryWorkbenchState {
  const conversationsBySeat = {
    drc: sortConversations([
      conversation("conv-001", "drc", "cust-001", "丹阳草莓，得利市大樱桃", customerAvatarUrl, "这是最新的权益清单截图，你帮我确认下。", "2026-04-14 19:18:32", 2, "single", "high", true),
      conversation("conv-002", "drc", "cust-002", "睿白鸽", customerAvatarRuiUrl, "早餐能不能换成酸奶和坚果？", "2026-04-13 15:04:16", 0, "single", "medium"),
      conversation("conv-003", "drc", "cust-003", "+1.", customerAvatarPlusUrl, "体重平台期了，今天想加一次有氧。", "2026-04-13 05:09:59", 4, "single", "medium"),
      conversation("conv-004", "drc", "cust-004", "营养群-4月减脂冲刺", customerAvatarGroupUrl, "今天的打卡图请统一发到群公告下方。", "2026-04-11 09:44:38", 7, "group", "low"),
      conversation("conv-revoke-only", "drc", "cust-revoke-only", "撤回测试", customerAvatarUrl, "[撤回消息]", "2026-04-10 10:01:00", 0, "single", "low"),
    ]),
    ndt: sortConversations([
      conversation("conv-005", "ndt", "cust-005", "小宇._", customerAvatarXiaoyuUrl, "好，那我今天先从晚餐控碳开始。", "2026-04-14 10:39:38", 1, "single", "medium"),
      conversation("conv-006", "ndt", "cust-006", "睡觉", customerAvatarSleepUrl, "多喝水，明天继续打卡。", "2026-04-09 16:04:45", 0, "single", "low"),
    ]),
  } satisfies Record<string, WorkbenchConversationSummaryDto[]>;
  const seats = [
    seat("drc", "德瑞可", seatAvatarDrcUrl, "小可", "私域客户管理", "13296712905", "online", conversationsBySeat.drc, 13, CURRENT_SUB_USER_ID),
    seat("ndt", "念都堂", seatAvatarNdtUrl, "尚青", "门店社群维护", "18104084782", "online", conversationsBySeat.ndt, 1),
  ];

  return {
    seats,
    conversationsBySeat,
    groupMembersByConversationId: {
      "conv-004": {
        conversationId: "conv-004",
        groupSeatId: "group-seat-conv-004",
        thirdGroupId: "third-group-conv-004",
        items: [
          {
            avatarUrl: customerAvatarGroupUrl,
            displayName: "群主小可",
            thirdUserId: "member-owner",
            type: 2,
          },
          {
            avatarUrl: customerAvatarXiaoyuUrl,
            displayName: "小林",
            thirdUserId: "member-admin",
            type: 1,
          },
          {
            avatarUrl: customerAvatarUrl,
            displayName: "丹阳草莓",
            thirdUserId: "member-user",
            type: 0,
          },
          {
            avatarUrl: customerAvatarRuiUrl,
            displayName: "睿白鸽",
            thirdUserId: "member-rui",
            type: 0,
          },
          {
            avatarUrl: seatAvatarDrcUrl,
            displayName: "德瑞可-小可",
            thirdUserId: "member-agent",
            type: 0,
          },
        ],
      },
    },
    subUser: {
      displayName: "林洒",
      subUserId: CURRENT_SUB_USER_ID,
    },
    events: [],
    materialGroups: [
      {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
        id: "material-group-file-1",
        sort: 100,
        title: "文件分组",
      },
      {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.IMAGE,
        id: "material-group-image-1",
        sort: 90,
        title: "图片分组",
      },
    ],
    materialItems: [
      {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.IMAGE,
        content: {
          fileUrl: "https://example.com/materials/product.png",
        },
        contentType: "image",
        groupId: "material-group-image-1",
        id: "material-item-image-1",
        msgInfoId: "9",
        sort: 90,
        title: "商品图",
      },
      {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
        content: { fileName: "求未 AI 智能营销系统.pdf" },
        contentType: "file",
        groupId: "material-group-file-1",
        id: "material-item-file-1",
        msgInfoId: "3",
        sort: 100,
        title: "求未 AI 智能营销系统.pdf",
      },
    ],
    messagesByConversationId: {
      "conv-001": [
        message("msg-002", "conv-001", "drc", "cust-001", "customer", "mini-program", { appName: "学好惊喜社", title: "预约直播抽秋天的第一杯奶茶", coverImageUrl: imagePlaceholder("mini-program"), sourceLabel: "小程序" }, "2026-04-11 15:32:40", 1, "sent"),
        message("msg-003", "conv-001", "drc", "cust-001", "agent", "h5", { title: "5.0 版本新功能介绍", description: "智能搜索、智能总结、智能机器人全新发布", previewImageUrl: imagePlaceholder("h5"), sourceLabel: "H5 卡片" }, "2026-04-12 21:12:00", 2, "sent"),
        message("msg-004", "conv-001", "drc", "cust-001", "agent", "file", { fileName: "求未 AI 智能营销系统.pdf", fileSizeLabel: "6.10M", extension: "pdf", sourceLabel: "企业微信文件" }, "2026-04-13 09:10:00", 3, "sent"),
        message("msg-005", "conv-001", "drc", "cust-001", "customer", "text", { text: "Seedream 4.0 这张活动卡片我准备转给群里，你看标题会不会太满？" }, "2026-04-14 18:37:00", 4, "sent"),
        message("msg-006", "conv-001", "drc", "cust-001", "customer", "text", { text: "我先截了个竖图版本给你看。" }, "2026-04-14 18:37:18", 5, "sent"),
        message("msg-007", "conv-001", "drc", "cust-001", "customer", "image", { fileUrl: imagePlaceholder("phone"), alt: "手机截图", width: 300, height: 620 }, "2026-04-14 18:37:24", 6, "sent"),
        message("msg-008", "conv-001", "drc", "cust-001", "customer", "voice", { durationLabel: "11\"" }, "2026-04-14 18:38:12", 7, "sent"),
        message("msg-009", "conv-001", "drc", "cust-001", "customer", "text", { text: "这是最新的权益清单截图，你帮我确认下。" }, "2026-04-14 19:18:18", 8, "sent"),
        message("msg-010", "conv-001", "drc", "cust-001", "customer", "image", { fileUrl: imagePlaceholder("sheet"), alt: "权益清单截图", width: 1180, height: 540 }, "2026-04-14 19:18:32", 9, "sent"),
      ],
      "conv-002": [
        message("msg-011", "conv-002", "drc", "cust-002", "customer", "text", { text: "早餐能不能换成酸奶和坚果？" }, "2026-04-13 15:04:16", 1, "sent"),
        message("msg-011-video-horizontal", "conv-002", "drc", "cust-002", "customer", "video", { videoUrl: "/mock/video/stage-recital.mp4", coverImageUrl: imagePlaceholder("video-horizontal"), alt: "舞台活动视频", durationLabel: "1:01", width: 640, height: 360 }, "2026-04-13 15:04:28", 2, "sent"),
        message("msg-011-video-vertical", "conv-002", "drc", "cust-002", "customer", "video", { videoUrl: "/mock/video/lake-check.mp4", coverImageUrl: imagePlaceholder("video-vertical"), alt: "湖面竖版视频", durationLabel: "0:11", width: 360, height: 640 }, "2026-04-13 15:04:36", 3, "sent"),
      ],
      "conv-003": [
        message("msg-012", "conv-003", "drc", "cust-003", "customer", "text", { text: "体重平台期了，今天想加一次有氧。" }, "2026-04-13 05:09:59", 1, "sent"),
      ],
      "conv-004": [
        message("msg-013", "conv-004", "drc", "cust-004", "system", "system", { text: "群聊占位数据，后续可在轮询模型稳定后单独扩展。" }, "2026-04-11 09:44:38", 1, "sent"),
      ],
      "conv-revoke-only": [
        message("msg-revoke-009", "conv-revoke-only", "drc", "cust-revoke-only", "system", "revoke", { revokeMsgId: "516", revokeOriginMsgId: "1022531", type: "revoke" }, "2026-04-10 10:00:00", 9, "sent"),
        message("msg-revoke-010", "conv-revoke-only", "drc", "cust-revoke-only", "system", "revoke", { revokeMsgId: "517", revokeOriginMsgId: "1022532", type: "revoke" }, "2026-04-10 10:01:00", 10, "sent"),
        message("msg-revoke-older", "conv-revoke-only", "drc", "cust-revoke-only", "customer", "text", { text: "更早的可展示消息" }, "2026-04-10 09:59:00", 8, "sent"),
      ],
      "conv-005": [
        message("msg-014", "conv-005", "ndt", "cust-005", "customer", "text", { text: "好，那我今天先从晚餐控碳开始。" }, "2026-04-14 10:39:38", 1, "sent"),
      ],
      "conv-006": [
        message("msg-015", "conv-006", "ndt", "cust-006", "agent", "text", { text: "多喝水，明天继续打卡。" }, "2026-04-09 16:04:45", 1, "sent"),
      ],
    },
    nextId: 1,
    quickReplyCategories: [],
    quickReplies: [],
    version: INITIAL_VERSION,
  };
}

function seat(
  seatId: string,
  name: string,
  avatar: string,
  operatorName: string,
  description: string,
  phone: string,
  loginStatus: WorkbenchSeatDto["loginStatus"],
  conversations: WorkbenchConversationSummaryDto[],
  unreadCount: number,
  hostSubUserId?: string,
): WorkbenchSeatDto {
  return {
    seatId,
    avatar,
    description,
    lastMessageTime: getSeatLastMessageTime(conversations),
    loginStatus,
    name,
    operatorName,
    phone,
    hostSubUserId,
    unreadCount,
  };
}

function conversation(
  conversationId: string,
  seatId: string,
  customerId: string,
  customerName: string,
  customerAvatar: string,
  lastMessage: string,
  lastMessageTime: string,
  unreadCount: number,
  mode: WorkbenchConversationSummaryDto["mode"],
  priority: WorkbenchConversationSummaryDto["priority"],
  isPinned?: boolean,
): WorkbenchConversationSummaryDto {
  return {
    seatId,
    conversationId,
    custodyMode: "semi",
    customerAvatar,
    customerId,
    customerName,
    isPinned,
    lastMessage,
    lastMessageTime: toTimestamp(lastMessageTime),
    mode,
    priority,
    unreadCount,
  };
}

function message(
  msgid: string,
  conversationId: string,
  seatId: string,
  customerId: string,
  senderType: WorkbenchMessageDto["senderType"],
  contentType: WorkbenchMessageDto["contentType"],
  content: Record<string, unknown>,
  createdAt: string,
  seq: number,
  status: WorkbenchMessageStatus,
): WorkbenchMessageDto {
  return {
    seatId,
    content,
    contentType,
    conversationId,
    createdAt: toTimestamp(createdAt),
    customerId,
    msgid,
    rawMsgtype: getMemoryRawMsgtype(contentType),
    senderType,
    seq,
    status,
  };
}

function getMemoryRawMsgtype(contentType: WorkbenchMessageDto["contentType"]) {
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

function buildMemoryMaterialItem(
  state: MemoryWorkbenchState,
  request: WorkbenchMaterialCollectionCreateRequest,
): WorkbenchMaterialCollectionItemDto {
  const message = Object.values(state.messagesByConversationId)
    .flat()
    .find((item) => String(item.seq) === request.msgInfoId);

  if (!message) {
    throw new NotFoundError("MATERIAL_MESSAGE_NOT_FOUND", "消息不存在");
  }

  const contentType =
    request.bizType === MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION
      ? "emotion"
      : request.bizType === MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM
        ? "mini-program"
        : request.bizType === MATERIAL_COLLECTION_BIZ_TYPE.H5
          ? "h5"
          : "file";
  const groupId =
    request.bizType === MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION
      ? 0
      : String(request.groupId);

  return {
    bizType: request.bizType,
    content: message.content,
    contentType,
    groupId,
    id: `material-item-${state.nextId++}`,
    msgInfoId: String(message.seq),
    sort: Date.now(),
    title: readMemoryMaterialTitle(message.content, contentType, request.msgInfoId),
  };
}

function readMemoryMaterialTitle(
  content: unknown,
  contentType: WorkbenchMaterialCollectionItemDto["contentType"],
  msgInfoId: string,
) {
  if (contentType === "emotion") {
    return "表情";
  }

  if (!content || typeof content !== "object") {
    return msgInfoId;
  }

  const record = content as Record<string, unknown>;
  return (
    readString(record.fileName) ||
    readString(record.description) ||
    readString(record.title) ||
    msgInfoId
  );
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function imagePlaceholder(label: string) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" rx="16" fill="#eef2f7"/><text x="24" y="96" font-family="Arial" font-size="20" fill="#64748b">${label}</text></svg>`,
  )}`;
}

function toTimestamp(value: string) {
  return new Date(value.replace(" ", "T")).getTime();
}

function findConversation(state: MemoryWorkbenchState, conversationId: string) {
  return Object.values(state.conversationsBySeat)
    .flat()
    .find((conversation) => conversation.conversationId === conversationId);
}

function findSeat(state: MemoryWorkbenchState, seatId: string) {
  return state.seats.find((seat) => seat.seatId === seatId);
}

function upsertConversation(
  state: MemoryWorkbenchState,
  nextConversation: WorkbenchConversationSummaryDto,
) {
  const currentConversations = state.conversationsBySeat[nextConversation.seatId] ?? [];
  state.conversationsBySeat[nextConversation.seatId] = sortConversations([
    nextConversation,
    ...currentConversations.filter(
      (conversation) => conversation.conversationId !== nextConversation.conversationId,
    ),
  ]);
}

function setConversationPinned(
  state: MemoryWorkbenchState,
  conversationId: string,
  isPinned: boolean,
) {
  const conversation = findConversation(state, conversationId);

  if (!conversation) {
    throw new NotFoundError("CONVERSATION_NOT_FOUND", "会话不存在");
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
  state: MemoryWorkbenchState,
  conversationId: string,
): WorkbenchConversationDeleteResponse {
  const conversation = findConversation(state, conversationId);

  if (!conversation) {
    throw new NotFoundError("CONVERSATION_NOT_FOUND", "会话不存在");
  }

  state.conversationsBySeat[conversation.seatId] = (
    state.conversationsBySeat[conversation.seatId] ?? []
  ).filter((item) => item.conversationId !== conversationId);
  setSeatUnreadCount(
    state,
    conversation.seatId,
    Math.max(0, getSeatUnreadCountValue(state, conversation.seatId) - conversation.unreadCount),
  );
  syncSeatLastMessageTime(state, conversation.seatId);
  pushConversationRemoveEvent(state, conversation.seatId, conversationId);
  pushSeatEvent(state, conversation.seatId);

  return {
    conversationId,
    seatId: conversation.seatId,
  };
}

function revokeMessage(
  state: MemoryWorkbenchState,
  conversationId: string,
  messageSeq: number,
): WorkbenchRevokeMessageResponse {
  const conversation = findConversation(state, conversationId);

  if (!conversation) {
    throw new NotFoundError("CONVERSATION_NOT_FOUND", "会话不存在");
  }

  const messages = state.messagesByConversationId[conversationId] ?? [];
  const targetMessage = messages.find((message) => message.seq === messageSeq);

  if (!targetMessage) {
    throw new NotFoundError("MESSAGE_NOT_FOUND", "消息不存在");
  }

  const nextMessage = {
    ...targetMessage,
    isRevoked: true,
  };
  state.messagesByConversationId[conversationId] = messages.map((message) =>
    message.seq === targetMessage.seq ? nextMessage : message,
  );

  const revokeSignal = {
    content: {
      revokeMsgId: String(targetMessage.seq),
      revokeOriginMsgId: String(targetMessage.seq),
      type: "revoke",
    },
    contentType: "revoke",
    conversationId,
    createdAt: Date.now(),
    customerId: targetMessage.customerId,
    msgid: `revoke-${targetMessage.seq}`,
    rawMsgtype: "revoke",
    seatId: targetMessage.seatId,
    senderType: "system" as const,
    seq: getNextMessageSeq(state, conversationId),
    status: "sent" as const,
  } satisfies WorkbenchMessageDto;

  state.messagesByConversationId[conversationId] = [
    ...state.messagesByConversationId[conversationId],
    revokeSignal,
  ];
  pushMessageEvent(state, nextMessage);
  pushMessageEvent(state, revokeSignal);

  return {
    accepted: true,
    conversationId,
    messageSeq,
    revokeMsgId: targetMessage.seq,
  };
}

function getSeatUnreadCountValue(state: MemoryWorkbenchState, seatId: string) {
  return findSeat(state, seatId)?.unreadCount ?? 0;
}

function setSeatUnreadCount(
  state: MemoryWorkbenchState,
  seatId: string,
  unreadCount: number,
) {
  const seat = findSeat(state, seatId);

  if (!seat) {
    return;
  }

  seat.unreadCount = unreadCount;
}

function syncSeatLastMessageTime(state: MemoryWorkbenchState, seatId: string) {
  const seat = findSeat(state, seatId);

  if (!seat) {
    return;
  }

  const conversations = state.conversationsBySeat[seatId] ?? [];
  seat.lastMessageTime = getSeatLastMessageTime(conversations);
}

function pushSeatEvent(state: MemoryWorkbenchState, seatId: string) {
  const seat = findSeat(state, seatId);

  if (!seat) {
    return;
  }

  state.version += 1;
  state.events.push({
    payload: {
      hostSubUserId: seat.hostSubUserId ?? null,
      seatId,
      lastMessageTime: seat.lastMessageTime,
      unreadCount: seat.unreadCount,
    },
    type: "seat",
    version: state.version,
  });
}

function getNextMemoryEventCursor(
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

function pushConversationEvent(
  state: MemoryWorkbenchState,
  conversation: WorkbenchConversationSummaryDto,
) {
  state.version += 1;
  state.events.push({
    payload: {
      ...conversation,
      type: "upsert",
    },
    type: "conversation",
    version: state.version,
  });
}

function pushMessageEvent(state: MemoryWorkbenchState, message: WorkbenchMessageDto) {
  state.version += 1;
  state.events.push({
    payload: message,
    type: "message",
    version: state.version,
  });
}

function pushConversationRemoveEvent(
  state: MemoryWorkbenchState,
  seatId: string,
  conversationId: string,
) {
  state.version += 1;
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

function getNextMessageSeq(state: MemoryWorkbenchState, conversationId: string) {
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
  state: MemoryWorkbenchState,
  segment: ReturnType<typeof getPayloadSegments>[number],
  quote?: WorkbenchSendMessagePayload["quote"],
) {
  if (quote && segment.type === "text") {
    return {
      quoteMsgId: quote.quoteMsgId,
      quotedMessage: quote.quotedMessage,
      text: segment.text,
    };
  }

  if (segment.type === "image") {
    const materialContent = segment.materialCollectionId
      ? getMemoryMaterialContent(state, segment.materialCollectionId)
      : {};
    const materialFileUrl = readString(materialContent.fileUrl);

    return {
      alt: segment.alt,
      fileUrl: materialFileUrl || segment.url || segment.localUrl || "",
      height: segment.height,
      width: segment.width,
    };
  }

  if (segment.type === "file") {
    return {
      extension: segment.extension,
      fileName: segment.fileName,
      fileSizeLabel: segment.fileSizeLabel ?? "",
      sourceLabel: "文件",
    };
  }

  return {
    text: segment.text,
  };
}

function getMemoryMaterialContent(state: MemoryWorkbenchState, materialCollectionId: string) {
  const item = state.materialItems.find(
    (materialItem) => materialItem.id === materialCollectionId,
  );

  return item?.content && typeof item.content === "object"
    ? item.content as Record<string, unknown>
    : {};
}

function getPayloadPreview(segments: ReturnType<typeof getPayloadSegments>) {
  const firstTextSegment = segments.find((segment) => segment.type === "text");

  if (firstTextSegment?.text) {
    return firstTextSegment.text;
  }

  if (segments.some((segment) => segment.type === "image")) {
    return "[图片]";
  }

  return segments.some((segment) => segment.type === "file") ? "[文件]" : "";
}

function buildMockOptNo(messageId: number) {
  return `opt-${messageId}`;
}

function resolveSendOutcome(
  state: MemoryWorkbenchState,
  seatId: string,
  segments: ReturnType<typeof getPayloadSegments>,
) {
  const seat = findSeat(state, seatId);
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

function getSeatLastMessageTime(conversations: WorkbenchConversationSummaryDto[]) {
  return conversations.reduce(
    (latest, conversation) => Math.max(latest, conversation.lastMessageTime ?? 0),
    0,
  );
}

function sortConversations(conversations: WorkbenchConversationSummaryDto[]) {
  return [...conversations].sort((left, right) => {
    if (Boolean(left.isPinned) !== Boolean(right.isPinned)) {
      return left.isPinned ? -1 : 1;
    }

    return (right.lastMessageTime ?? 0) - (left.lastMessageTime ?? 0);
  });
}

function sliceLatest<T>(items: T[], limit: number) {
  if (limit <= 0) {
    return [];
  }

  return items.slice(-limit);
}

function collapseLatest<T>(items: T[], getKey: (item: T) => string) {
  const latestByKey = new Map<string, T>();

  for (const item of items) {
    latestByKey.set(getKey(item), item);
  }

  return [...latestByKey.values()];
}

function sortQuickReplyEntries<T extends { id: string; sort: number }>(
  left: T,
  right: T,
) {
  return right.sort - left.sort || left.id.localeCompare(right.id);
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

function buildMemoryQuickReplyImportFailure(
  errors: WorkbenchQuickReplyImportRowError[],
) {
  return {
    errorMsg: "导入数据有误",
    errors,
    ok: false as const,
  };
}

function normalizeMemoryQuickReplyCategoryEnsureRequest(
  categories: WorkbenchQuickReplyCategoryEnsureRequest["categories"],
):
  | {
      categories: Array<{ children: string[]; title: string }>;
      ok: true;
    }
  | { errors: WorkbenchQuickReplyImportRowError[]; ok: false } {
  if (!Array.isArray(categories) || categories.length === 0) {
    return {
      errors: [{ message: "分类不能为空", rowNumber: 0 }],
      ok: false,
    };
  }

  const errors: WorkbenchQuickReplyImportRowError[] = [];
  const byTitle = new Map<string, { children: string[]; title: string }>();

  categories.forEach((category, index) => {
    const rowNumber = index + 1;
    const title = category.title.trim();

    if (!title) {
      errors.push({ message: "一级分类名称不能为空", rowNumber });
      return;
    }

    if (title.length > QUICK_REPLY_CATEGORY_TITLE_MAX_LENGTH) {
      errors.push({
        message: "一级分类名称不能超过10个字",
        rowNumber,
      });
    }

    const normalizedChildren: string[] = [];
    for (const child of category.children) {
      const childTitle = child.trim();

      if (!childTitle) {
        errors.push({ message: "二级分类名称不能为空", rowNumber });
        continue;
      }

      if (childTitle.length > QUICK_REPLY_CATEGORY_TITLE_MAX_LENGTH) {
        errors.push({
          message: "二级分类名称不能超过10个字",
          rowNumber,
        });
        continue;
      }

      if (!normalizedChildren.includes(childTitle)) {
        normalizedChildren.push(childTitle);
      }
    }

    const existing = byTitle.get(title);
    if (existing) {
      for (const childTitle of normalizedChildren) {
        if (!existing.children.includes(childTitle)) {
          existing.children.push(childTitle);
        }
      }
    } else {
      byTitle.set(title, { children: normalizedChildren, title });
    }
  });

  const normalizedCategories = [...byTitle.values()];
  const secondaryCategoryCount = normalizedCategories.reduce(
    (count, category) => count + category.children.length,
    0,
  );

  if (normalizedCategories.length > QUICK_REPLY_IMPORT_PRIMARY_CATEGORY_LIMIT) {
    errors.push({ message: "一级分类最多导入100个", rowNumber: 0 });
  }

  if (secondaryCategoryCount > QUICK_REPLY_IMPORT_SECONDARY_CATEGORY_LIMIT) {
    errors.push({ message: "二级分类最多导入500个", rowNumber: 0 });
  }

  if (errors.length > 0) {
    return { errors, ok: false };
  }

  return { categories: normalizedCategories, ok: true };
}

function validateMemoryQuickReplyCategoryEnsureLimits(input: {
  categories: Array<{ children: string[]; title: string }>;
  scopeType: WorkbenchQuickReplyCategoryEnsureRequest["scopeType"];
  stateCategories: WorkbenchQuickReplyCategoryDto[];
}) {
  const errors: WorkbenchQuickReplyImportRowError[] = [];
  let primaryCategoryCount = input.stateCategories.filter(
    (category) => category.scopeType === input.scopeType && category.parentId === 0,
  ).length;
  const childCountByPrimaryTitle = new Map<string, number>();

  for (const primaryCategory of input.stateCategories) {
    if (
      primaryCategory.scopeType !== input.scopeType ||
      primaryCategory.parentId !== 0
    ) {
      continue;
    }

    childCountByPrimaryTitle.set(
      primaryCategory.title,
      input.stateCategories.filter(
        (category) =>
          category.scopeType === input.scopeType &&
          category.parentId === primaryCategory.id,
      ).length,
    );
  }

  for (const [index, category] of input.categories.entries()) {
    const rowNumber = index + 1;
    const existingPrimary = input.stateCategories.find(
      (stateCategory) =>
        stateCategory.scopeType === input.scopeType &&
        stateCategory.parentId === 0 &&
        stateCategory.title === category.title,
    );

    if (!existingPrimary) {
      primaryCategoryCount += 1;

      if (primaryCategoryCount > QUICK_REPLY_TOP_CATEGORY_LIMIT) {
        errors.push({ message: "一级分类最多50个", rowNumber });
      }
    }

    const existingChildTitles = new Set(
      existingPrimary
        ? input.stateCategories
            .filter(
              (stateCategory) =>
                stateCategory.scopeType === input.scopeType &&
                stateCategory.parentId === existingPrimary.id,
            )
            .map((stateCategory) => stateCategory.title)
        : [],
    );
    const pendingChildCount = childCountByPrimaryTitle.get(category.title) ?? 0;
    const missingChildCount = category.children.filter(
      (childTitle) => !existingChildTitles.has(childTitle),
    ).length;
    const nextChildCount = pendingChildCount + missingChildCount;

    if (nextChildCount > QUICK_REPLY_CHILD_CATEGORY_LIMIT) {
      errors.push({ message: "二级分类最多50个", rowNumber });
    }

    childCountByPrimaryTitle.set(category.title, nextChildCount);
  }

  return errors;
}

function normalizeMemoryQuickReplyBatchCreateRequest(
  items: WorkbenchQuickReplyBatchCreateRequest["items"],
):
  | {
      items: Array<{
        categoryId: string;
        contentText: string;
        labelColor: string;
        labelText: string;
        rowNumber: number;
      }>;
      ok: true;
    }
  | { errors: WorkbenchQuickReplyImportRowError[]; ok: false } {
  if (!Array.isArray(items) || items.length === 0) {
    return {
      errors: [{ message: "请填写话术", rowNumber: 0 }],
      ok: false,
    };
  }

  if (items.length > QUICK_REPLY_BATCH_CREATE_LIMIT) {
    return {
      errors: [{ message: "单次最多导入100条话术", rowNumber: 0 }],
      ok: false,
    };
  }

  const errors: WorkbenchQuickReplyImportRowError[] = [];
  const normalizedItems: Array<{
    categoryId: string;
    contentText: string;
    labelColor: string;
    labelText: string;
    rowNumber: number;
  }> = [];

  for (const [index, item] of items.entries()) {
    const rowNumber = Number.isSafeInteger(item.rowNumber)
      ? item.rowNumber
      : index + 1;
    const categoryId = item.categoryId.trim();
    const contentText = item.contentText.trim();
    const labelColor = item.labelColor.trim();
    const labelText = item.labelText.trim();

    if (!categoryId) {
      errors.push({ message: "请选择二级分类", rowNumber });
    }

    if (labelText.length > QUICK_REPLY_LABEL_TEXT_MAX_LENGTH) {
      errors.push({ message: "短标题不能超过10个字", rowNumber });
    }

    if (!isQuickReplyLabelColor(labelColor)) {
      errors.push({ message: "短标题颜色无效", rowNumber });
    }

    if (!contentText) {
      errors.push({ message: "话术内容不能为空", rowNumber });
    } else if (contentText.length > QUICK_REPLY_CONTENT_TEXT_MAX_LENGTH) {
      errors.push({ message: "话术内容不能超过1000个字", rowNumber });
    }

    normalizedItems.push({
      categoryId,
      contentText,
      labelColor,
      labelText,
      rowNumber,
    });
  }

  if (errors.length > 0) {
    return { errors, ok: false };
  }

  return { items: normalizedItems, ok: true };
}

function validateMemoryQuickReplyPayload(
  request: WorkbenchQuickReplyCreateRequest | WorkbenchQuickReplyUpdateRequest,
) {
  const validation = validateQuickReplyPayload({
    attachments: request.attachments ?? [],
    contentText: request.contentText ?? "",
  });

  if (!validation.ok) {
    throw new BadRequestError("INVALID_QUICK_REPLY_CONTENT", validation.errorMsg);
  }
}

function assertMemoryQuickReplyChildCategory(
  categoryId: string | 0,
  scopeType: WorkbenchQuickReplyDto["scopeType"],
  categories: WorkbenchQuickReplyCategoryDto[],
) {
  if (categoryId === 0) {
    throw new BadRequestError("QUICK_REPLY_CHILD_CATEGORY_REQUIRED", "请选择二级分类");
  }

  const category = categories.find(
    (item) => item.id === categoryId && item.scopeType === scopeType,
  );

  if (!category) {
    throw new BadRequestError("QUICK_REPLY_CATEGORY_NOT_FOUND", "分类不存在");
  }

  if (category.parentId === 0) {
    throw new BadRequestError("QUICK_REPLY_CHILD_CATEGORY_REQUIRED", "请选择二级分类");
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
