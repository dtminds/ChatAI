import {
  type WorkbenchMessageDto,
  MATERIAL_COLLECTION_BIZ_TYPE,
  type WorkbenchMaterialCollectionItemDto,
  type WorkbenchQuickReplyDto,
  patchMaterialFileContentJson,
  patchMaterialH5ContentJson,
  patchMaterialVideoContentJson,
  isQuickReplyLabelColor,
  normalizeQuickReplyAttachments,
  validateQuickReplyPayload,
} from "@chatai/contracts";
import type { WorkbenchService } from "./workbench-contract";
import {
  filterMockHistoryMessages,
  normalizeHistoryLimit,
  decodeMockHistoryCursor,
  sliceMockHistoryMessages,
  buildInitialState,
  buildMaterialItemFromMessage,
  buildFallbackMaterialItem,
  getMockMessageInfoId,
  getMaterialContentRecordFromItem,
  resolveMockMaterialCollect,
  sortMaterialItems,
  findConversation,
  findAccount,
  upsertConversation,
  setConversationPinned,
  setConversationFullAuto,
  removeConversation,
  getAccountUnreadCountValue,
  setAccountUnreadCount,
  getAccountUnreadSummary,
  syncAccountLastMessageTime,
  pushAccountEvent,
  pushConversationEvent,
  pushMessageEvent,
  getNextMockEventCursor,
  revokeMessage,
  getNextMessageSeq,
  getPayloadSegments,
  buildPayloadSegmentContent,
  getPayloadSegmentContentType,
  getPayloadSegmentRawMsgtype,
  findMessageByIdOrSeq,
  updateMessageDownloadContent,
  updateVoicePlaybackContent,
  updateVoiceTranscriptionContent,
  isFileDownloadContent,
  getPayloadPreview,
  buildMockOptNo,
  resolveSendOutcome,
  sortConversations,
  sortQuickReplyEntries,
  getAppendQuickReplyCategorySort,
  getPrependQuickReplyCategorySort,
  getAppendQuickReplySort,
  getPrependQuickReplySort,
  assertSameQuickReplySortScope,
  collapseLatest,
  clone,
  CURRENT_SUB_USER_ID,
  type WorkbenchEvent,
} from "./workbench-mock-helpers";

const MOCK_POLL_OVERLAP_MS = 1;

export function createMockWorkbenchService(): WorkbenchService {
  const state = buildInitialState();

  return {
    __mock: {
      async appendMessage(conversationId, message) {
        const messages = state.messagesByConversationId[conversationId] ?? [];
        const nextMessage = {
          ...message,
          conversationId,
          seq: message.seq ?? getNextMessageSeq(state, conversationId),
        } satisfies WorkbenchMessageDto;

        state.messagesByConversationId[conversationId] = [
          ...messages,
          nextMessage,
        ];
        pushMessageEvent(state, nextMessage);

        return clone(nextMessage);
      },
      async revokeMessage(conversationId, messageSeq) {
        revokeMessage(state, conversationId, messageSeq);
      },
    },
    async getSeats() {
      return clone(state.seats);
    },
    async getEnterpriseMembers() {
      return {
        items: clone(state.seats).flatMap((seat) => {
          const thirdUserId = seat.thirdUserId?.trim();

          if (!thirdUserId || seat.bizStatus === 0) {
            return [];
          }

          return [
            {
              avatarUrl: seat.avatar,
              displayName: seat.name.trim() || thirdUserId,
              thirdUserId,
            },
          ];
        }),
      };
    },
    async deleteConversation(conversationId) {
      return removeConversation(state, conversationId);
    },
    async getConversations(seatId, options) {
      const conversations = state.conversationsByAccount[seatId] ?? [];
      const snapshotAt = Date.now();
      state.version = Math.max(state.version, snapshotAt);
      const filteredConversations = sortConversations(conversations)
        .filter((conversation) => options?.mode == null || conversation.mode === options.mode)
        .filter((conversation) => !options?.unreadOnly || conversation.unreadCount > 0);

      return {
        hasMore: filteredConversations.length > (options?.limit ?? filteredConversations.length),
        items: clone(
          filteredConversations.slice(0, options?.limit),
        ),
        snapshotAt,
        unreadSummary: options?.unreadOnly
          ? getAccountUnreadSummary(state, seatId)
          : undefined,
      };
    },
    async getConversation(conversationId) {
      const conversation = findConversation(state, conversationId);

      if (!conversation) {
        throw new Error("Conversation not found");
      }

      return clone(conversation);
    },
    async rewriteComposerText(request) {
      return { content: request.content };
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
    async getCustomerSeatRelations() {
      return { items: [] };
    },
    async listMaterialCollections(request) {
      const page = request.page ?? 1;
      const pageSize = request.pageSize ?? 100;
      const keyword = request.keyword?.trim();
      const matchingItems = state.materialItems
        .filter(
          (item) =>
            item.bizType === request.bizType &&
            item.groupId === request.groupId &&
            (!keyword || item.title.includes(keyword)),
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

      const sourceMessage = Object.values(state.messagesByConversationId)
        .flat()
        .find((message) => getMockMessageInfoId(message) === request.msgInfoId);
      const sourceMsgInfoId = request.msgInfoId;
      const existing = state.materialItems.find(
        (item) =>
          item.bizType === request.bizType &&
          item.msgInfoId === sourceMsgInfoId,
      );

      if (existing) {
        return {
          success: true,
          duplicated: true,
        };
      }

      if (
        request.bizType === MATERIAL_COLLECTION_BIZ_TYPE.VIDEO &&
        sourceMessage?.senderType !== "agent"
      ) {
        return {
          success: false,
          errorMsg: "只能收录席位号发送的视频",
        };
      }

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
            : item.bizType === MATERIAL_COLLECTION_BIZ_TYPE.VIDEO
              ? patchMaterialVideoContentJson(rawContent, request.title ?? "")
              : null;

      if (item.bizType === MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM) {
        const title = request.title?.trim() ?? "";

        if (!title) {
          throw new Error("素材标题不能为空");
        }

        state.materialItems = state.materialItems.map((materialItem) =>
          materialItem.id === collectionId
            ? {
                ...materialItem,
                title,
              }
            : materialItem,
        );

        return { ok: true };
      }

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
    async ensureQuickReplyCategories(request) {
      const categories = [];
      let createdPrimaryCategoryCount = 0;
      let createdSecondaryCategoryCount = 0;

      for (const requestedCategory of request.categories) {
        const title = requestedCategory.title.trim();

        if (!title || title.length > 10) {
          return {
            errorMsg: "导入数据有误",
            errors: [
              {
                message: title ? "一级分类不能超过10个字" : "一级分类不能为空",
                rowNumber: 0,
              },
            ],
            ok: false,
          };
        }

        let primaryCategory = state.quickReplyCategories.find(
          (category) =>
            category.scopeType === request.scopeType &&
            category.parentId === 0 &&
            category.title === title,
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
            title,
          };
          state.quickReplyCategories = [
            ...state.quickReplyCategories,
            primaryCategory,
          ];
          createdPrimaryCategoryCount += 1;
        }

        const children = [];
        for (const childTitleValue of requestedCategory.children) {
          const childTitle = childTitleValue.trim();

          if (!childTitle || childTitle.length > 10) {
            return {
              errorMsg: "导入数据有误",
              errors: [
                {
                  message: childTitle
                    ? "二级分类不能超过10个字"
                    : "二级分类不能为空",
                  rowNumber: 0,
                },
              ],
              ok: false,
            };
          }

          let childCategory = state.quickReplyCategories.find(
            (category) =>
              category.scopeType === request.scopeType &&
              category.parentId === primaryCategory.id &&
              category.title === childTitle,
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
              title: childTitle,
            };
            state.quickReplyCategories = [
              ...state.quickReplyCategories,
              childCategory,
            ];
            createdSecondaryCategoryCount += 1;
          }

          children.push({ id: childCategory.id, title: childCategory.title });
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
    async listQuickReplyCategoryContent(request) {
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
        throw new Error("请先删除话术分组");
      }

      if (
        state.quickReplies.some(
          (reply) =>
            reply.scopeType === scopeType && reply.categoryId === categoryId,
        )
      ) {
        throw new Error("请先删除分组下的话术");
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
    async moveQuickReplyCategory(categoryId, scopeType, request) {
      const category = state.quickReplyCategories.find(
        (item) => item.id === categoryId && item.scopeType === scopeType,
      );
      const targetParent = state.quickReplyCategories.find(
        (item) => item.id === request.parentId && item.scopeType === scopeType,
      );

      if (!category || !targetParent) {
        throw new Error("分类不存在");
      }

      if (category.parentId === 0) {
        throw new Error("一级分类暂不支持移动");
      }

      if (targetParent.parentId !== 0) {
        throw new Error("请选择一级分类");
      }

      if (category.parentId === request.parentId) {
        return { ok: true };
      }

      const targetChildCount = state.quickReplyCategories.filter(
        (item) => item.scopeType === scopeType && item.parentId === request.parentId,
      ).length;

      if (targetChildCount >= 50) {
        throw new Error("二级分类最多50个");
      }

      const sort = getAppendQuickReplyCategorySort(
        state.quickReplyCategories,
        scopeType,
        request.parentId,
      );
      state.quickReplyCategories = state.quickReplyCategories.map((item) =>
        item.id === categoryId && item.scopeType === scopeType
          ? { ...item, parentId: request.parentId, sort }
          : item,
      );
      return { ok: true };
    },
    async sortQuickReplyCategories(request) {
      const categories = state.quickReplyCategories.filter(
        (category) =>
          category.scopeType === request.scopeType &&
          category.parentId === request.parentId,
      );

      assertSameQuickReplySortScope(
        categories.map((category) => category.id),
        request.categoryIds,
      );

      const sortById = new Map(
        request.categoryIds.map((id, index) => [
          id,
          (request.categoryIds.length - index) * 1000,
        ]),
      );

      state.quickReplyCategories = state.quickReplyCategories.map((category) =>
        category.scopeType === request.scopeType && sortById.has(category.id)
          ? { ...category, sort: sortById.get(category.id) ?? category.sort }
          : category,
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
    async batchCreateQuickReplies(request) {
      if (!Array.isArray(request.items) || request.items.length === 0) {
        return {
          errorMsg: "导入数据有误",
          errors: [{ message: "请填写话术", rowNumber: 0 }],
          ok: false,
        };
      }

      if (request.items.length > 100) {
        return {
          errorMsg: "导入数据有误",
          errors: [{ message: "单次最多导入100条话术", rowNumber: 0 }],
          ok: false,
        };
      }

      const errors: Array<{ message: string; rowNumber: number }> = [];

      for (const item of request.items) {
        const labelText = item.labelText.trim();
        const labelColor = item.labelColor.trim();
        const contentText = item.contentText.trim();
        const category = state.quickReplyCategories.find(
          (candidate) =>
            candidate.id === item.categoryId &&
            candidate.scopeType === request.scopeType,
        );

        if (labelText.length > 10) {
          errors.push({ message: "短标题不能超过10个字", rowNumber: item.rowNumber });
        }

        if (!isQuickReplyLabelColor(labelColor)) {
          errors.push({ message: "短标题颜色无效", rowNumber: item.rowNumber });
        }

        if (!contentText) {
          errors.push({ message: "话术内容不能为空", rowNumber: item.rowNumber });
        } else if (contentText.length > 1000) {
          errors.push({ message: "话术内容不能超过1000个字", rowNumber: item.rowNumber });
        }

        if (!category || category.parentId === 0) {
          errors.push({ message: "请选择二级分类", rowNumber: item.rowNumber });
        }
      }

      if (errors.length > 0) {
        return {
          errorMsg: "导入数据有误",
          errors,
          ok: false,
        };
      }

      for (const item of request.items) {
        const categoryId = item.categoryId.trim();
        state.quickReplies = [
          ...state.quickReplies,
          {
            attachments: [],
            categoryId,
            contentText: item.contentText.trim(),
            id: `quick-reply-${state.nextId++}`,
            labelColor: item.labelColor.trim(),
            labelText: item.labelText.trim(),
            scopeType: request.scopeType,
            sort: getAppendQuickReplySort(
              state.quickReplies,
              request.scopeType,
              categoryId,
            ),
          },
        ];
      }

      return {
        ok: true,
        summary: {
          createdQuickReplyCount: request.items.length,
        },
      };
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
    async moveQuickReply(quickReplyId, scopeType, request) {
      const quickReply = state.quickReplies.find(
        (reply) => reply.id === quickReplyId && reply.scopeType === scopeType,
      );

      if (!quickReply) {
        throw new Error("话术不存在");
      }

      if (quickReply.categoryId === request.categoryId) {
        return { ok: true };
      }

      const sourceCategory = state.quickReplyCategories.find(
        (category) =>
          category.id === quickReply.categoryId &&
          category.scopeType === scopeType,
      );
      const targetCategory = state.quickReplyCategories.find(
        (category) =>
          category.id === request.categoryId && category.scopeType === scopeType,
      );

      if (!sourceCategory || !targetCategory) {
        throw new Error("分类不存在");
      }

      if (
        sourceCategory.parentId === 0 ||
        targetCategory.parentId === 0
      ) {
        throw new Error("请选择二级分类");
      }

      if (sourceCategory.parentId !== targetCategory.parentId) {
        throw new Error("只能移动到当前一级分类下");
      }

      const sort = getAppendQuickReplySort(
        state.quickReplies,
        scopeType,
        request.categoryId,
      );
      state.quickReplies = state.quickReplies.map((reply) =>
        reply.id === quickReplyId && reply.scopeType === scopeType
          ? { ...reply, categoryId: request.categoryId, sort }
          : reply,
      );
      return { ok: true };
    },
    async sortQuickReplies(request) {
      const quickReplies = state.quickReplies.filter(
        (reply) =>
          reply.scopeType === request.scopeType &&
          reply.categoryId === request.categoryId,
      );

      assertSameQuickReplySortScope(
        quickReplies.map((reply) => reply.id),
        request.quickReplyIds,
      );

      const sortById = new Map(
        request.quickReplyIds.map((id, index) => [
          id,
          (request.quickReplyIds.length - index) * 1000,
        ]),
      );

      state.quickReplies = state.quickReplies.map((reply) =>
        reply.scopeType === request.scopeType && sortById.has(reply.id)
          ? { ...reply, sort: sortById.get(reply.id) ?? reply.sort }
          : reply,
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
    async getMessagesBySeqs(input) {
      const messages = state.messagesByConversationId[input.conversationId] ?? [];
      const normalizedSeqs = new Set(input.messageSeqs);

      return {
        messages: clone(
          messages.filter((message) => normalizedSeqs.has(message.seq)),
        ),
      };
    },
    async getChatRecordDetail(input) {
      return {
        messageSeq: input.messageSeq,
        messages: [],
      };
    },
    async revokeMessage(input) {
      const message = revokeMessage(state, input.conversationId, input.messageSeq);

      return {
        accepted: true,
        conversationId: input.conversationId,
        messageSeq: input.messageSeq,
        revokeMsgId: message?.seq ?? 0,
      };
    },
    async downloadMessageFile(input) {
      const message = findMessageByIdOrSeq(
        state,
        input.conversationId,
        undefined,
        input.msgInfoId,
      );

      if (!message) {
        throw new Error("Message not found");
      }

      updateMessageDownloadContent(state, input.conversationId, message.seq, {
        downloadStatus: "ing",
      });

      return {
        messageSeq: input.msgInfoId,
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
    async pullGroupMembers(conversationId) {
      return { conversationId };
    },
    async kickGroupMember(conversationId) {
      return { conversationId };
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
    async changeConversationFullAuto(conversationId, request) {
      return setConversationFullAuto(state, conversationId, request.enabled);
    },
    async clearConversationHandoff(conversationId) {
      const conversation = findConversation(state, conversationId);

      if (!conversation) {
        throw new Error("Conversation not found");
      }

      const nextConversation = {
        ...conversation,
        handoffMsgId: 0,
      };

      upsertConversation(state, nextConversation);
      pushConversationEvent(state, nextConversation);

      return {
        conversationId,
        seatId: conversation.seatId,
      };
    },
    async updateSeatAgentMode(seatId, request) {
      const seat = state.seats.find((item) => item.seatId === seatId);

      if (!seat) {
        return {
          fullAutoSwitch: false,
          seatId,
          semiAutoSwitch: false,
        };
      }

      seat.fullAutoSwitch = request.mode === "autoReply";
      seat.semiAutoSwitch = request.mode !== "off";
      seat.seatAIHostingEnabled =
        seat.seatAIHostingAuth === true && seat.fullAutoSwitch === true;
      seat.seatAIAssistantEnabled =
        seat.semiAutoAuth === true && seat.semiAutoSwitch === true;
      pushAccountEvent(state, seatId);

      return {
        fullAutoSwitch: seat.fullAutoSwitch === true,
        seatId,
        semiAutoSwitch: seat.semiAutoSwitch === true,
      };
    },
    async getFullAutoAnswerStatus() {
      return {};
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
          contentType: quoteForSegment
            ? "quote"
            : getPayloadSegmentContentType(segment),
          conversationId: payload.conversationId,
          createdAt: now + index,
          customerId: conversation.customerId,
          failReason: outcome.reason,
          msgid,
          optNo: segmentOptNo,
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
        lastMessageId:
          outcome.status === "sent"
            ? backendMessages.at(-1)?.seq
            : conversation.lastMessageId,
        lastMessageTime: now,
        replied: outcome.status === "sent" ? true : conversation.replied,
      };

      upsertConversation(state, nextConversation);
      syncAccountLastMessageTime(state, payload.seatId);
      pushConversationEvent(state, nextConversation);
      pushAccountEvent(state, payload.seatId);
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
    async retryMessage(request) {
      const message = findMessageByIdOrSeq(
        state,
        request.conversationId,
        undefined,
        request.messageSeq,
      );

      if (!message) {
        throw new Error("重发失败");
      }

      const retryOptNo = buildMockOptNo(state.nextId++);
      return {
        optNo: retryOptNo,
        status: "accepted",
      };
    },
    async getSendFailReason(request) {
      const message = findMessageByIdOrSeq(
        state,
        request.conversationId,
        undefined,
        request.messageSeq,
      );

      return {
        failReason: message?.failReason?.trim() ?? "",
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
          conversationAIHostingSwitch:
            existingConversation.conversationAIHostingSwitch ?? false,
          handoffMsgId: existingConversation.handoffMsgId,
          customerAvatar: existingConversation.customerAvatar,
          customerBindType: existingConversation.customerBindType,
          customerId: existingConversation.customerId,
          customerName: existingConversation.customerName,
          lastMessage: existingConversation.lastMessage,
          lastMessageId: existingConversation.lastMessageId,
          lastMessageTime: existingConversation.lastMessageTime,
          mode: existingConversation.mode,
          priority: existingConversation.priority,
          replied: existingConversation.replied,
          seatId: existingConversation.seatId,
          thirdExternalUserId: existingConversation.thirdExternalUserId,
          thirdGroupId: existingConversation.thirdGroupId,
          thirdUserId: existingConversation.thirdUserId,
          unreadCount: existingConversation.unreadCount,
        };
      }

      const now = Date.now();
      const conversationId = `mock-conversation-${state.nextId++}`;

      return {
        bizStatus: 1,
        conversationId,
        conversationAIHostingSwitch: false,
        handoffMsgId: 0,
        customerAvatar: "",
        customerBindType: payload.chatType === 2 ? undefined : 1,
        customerId: payload.thirdExternalUserId ?? payload.thirdGroupId ?? conversationId,
        customerName: payload.chatType === 2 ? "未知群聊" : "未知客户",
        lastMessage: "",
        lastMessageTime: now,
        mode: payload.chatType === 2 ? "group" : "single",
        priority: "medium",
        replied: false,
        seatId: payload.seatId,
        thirdExternalUserId: payload.thirdExternalUserId,
        thirdGroupId: payload.thirdGroupId,
        thirdUserId: `third-user-${payload.seatId}`,
        unreadCount: 0,
      };
    },
  };
}
