import { fetchWorkbenchSidebarIframeParams } from "@/pages/chat/api/sidebar-iframe-params";
import { http } from "@/lib/request";
import {
  type ApiSuccessEnvelope,
  type WorkbenchConversationDeleteResponse,
  type WorkbenchConversationListResponse,
  type WorkbenchSeatDto,
  type WorkbenchConversationFullAutoResponse,
  type WorkbenchConversationClearHandoffResponse,
  type WorkbenchFullAutoAnswerStatusResponse,
  type WorkbenchConversationPinResponse,
  type WorkbenchConversationReadResponse,
  type WorkbenchConversationUnpinResponse,
  type WorkbenchConversationUnreadResponse,
  type WorkbenchConversationSummaryDto,
  type WorkbenchCustomerListResponse,
  type WorkbenchCustomerLastConversationResponse,
  type WorkbenchCustomerRelationConversationsResponse,
  type WorkbenchCustomerSeatRelationsResponse,
  type WorkbenchHistoryMessagePageDto,
  type WorkbenchChatRecordDetailResponse,
  type WorkbenchGroupMembersResponse,
  type WorkbenchEnterpriseMemberListResponse,
  type WorkbenchKickGroupMemberRequest,
  type WorkbenchKickGroupMemberResponse,
  type WorkbenchPullGroupMembersRequest,
  type WorkbenchPullGroupMembersResponse,
  type WorkbenchSubUserDto,
  type WorkbenchMessageQueryBySeqsRequest,
  type WorkbenchMessageQueryBySeqsResponse,
  type WorkbenchMessageFileDownloadResponse,
  type WorkbenchMessageFileDownloadStatusResponse,
  type WorkbenchMessagePageDto,
  type WorkbenchPollResponse,
  type WorkbenchSmartReplyAttachmentsRequest,
  type WorkbenchSmartReplyAttachmentsResponse,
  type WorkbenchSmartReplyAutoGeneralAnswerRequest,
  type WorkbenchSmartReplyAutoGeneralAnswerResponse,
  type WorkbenchSmartReplyGeneralAnswerRequest,
  type WorkbenchSmartReplyGeneralAnswerResponse,
  type WorkbenchSmartReplyMakeShorterRequest,
  type WorkbenchSmartReplyMakeShorterResponse,
  type ComposerAiEditRequest,
  type ComposerAiEditResponse,
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
  type WorkbenchRetryMessageRequest,
  type WorkbenchSendFailReasonRequest,
  type WorkbenchSendFailReasonResponse,
  type WorkbenchVoicePlaybackConfirmRequest,
  type WorkbenchVoicePlaybackConfirmResponse,
  type WorkbenchVoiceTranscriptionRequest,
  type WorkbenchVoiceTranscriptionResponse,
  type WorkbenchSendMessagePayload,
  type SettingsSidebarItemsResponse,
  type WorkbenchSendMessageResponse,
  type WorkbenchTakeOverSeatResponse,
  type WorkbenchUploadCredentialResponse,
  type WorkbenchSearchResponseDto,
  type WorkbenchSeatAgentModeSwitchRequest,
  type WorkbenchSeatAgentModeSwitchResponse,
  MATERIAL_COLLECTION_BIZ_TYPE,
  type WorkbenchMaterialCollectionCreateRequest,
  type WorkbenchMaterialCollectionCreateResponse,
  type WorkbenchMaterialCollectionGroupCreateRequest,
  type WorkbenchMaterialCollectionGroupCreateResponse,
  type WorkbenchMaterialCollectionGroupListResponse,
  type WorkbenchMaterialCollectionGroupUpdateRequest,
  type WorkbenchMaterialCollectionListResponse,
  type WorkbenchMaterialCollectionMoveRequest,
  type WorkbenchMaterialCollectionOkResponse,
  type WorkbenchMaterialCollectionUpdateRequest,
  type WorkbenchQuickReplyCategoryCreateRequest,
  type WorkbenchQuickReplyBatchCreateRequest,
  type WorkbenchQuickReplyBatchCreateResponse,
  type WorkbenchQuickReplyCategoryContentResponse,
  type WorkbenchQuickReplyCategoryEnsureRequest,
  type WorkbenchQuickReplyCategoryEnsureResponse,
  type WorkbenchQuickReplyCategoryListResponse,
  type WorkbenchQuickReplyCategoryMoveRequest,
  type WorkbenchQuickReplyCategorySortRequest,
  type WorkbenchQuickReplyCategoryUpdateRequest,
  type WorkbenchQuickReplyCreateRequest,
  type WorkbenchQuickReplyListResponse,
  type WorkbenchQuickReplyMoveRequest,
  type WorkbenchQuickReplyOkResponse,
  type WorkbenchQuickReplySortRequest,
  type WorkbenchQuickReplyUpdateRequest,
} from "@chatai/contracts";

import type { WorkbenchService } from "./workbench-contract";

const COMPOSER_AI_EDIT_TIMEOUT_MS = 35_000;
const VIDEO_MATERIAL_COLLECT_TIMEOUT_MS = 130000;

export function createHttpWorkbenchService(): WorkbenchService {
  return {
    getSeats() {
      return http.get<WorkbenchSeatDto[]>("/server/seats");
    },
    getEnterpriseMembers() {
      return http.get<WorkbenchEnterpriseMemberListResponse>("/server/employees");
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
          unread_only: options?.unreadOnly ? "1" : undefined,
        },
      });
    },
    getConversation(conversationId) {
      return http.get<WorkbenchConversationSummaryDto>(
        `/server/conversations/${conversationId}`,
      );
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
    getCustomerSeatRelations(thirdExternalUserId) {
      return http.get<WorkbenchCustomerSeatRelationsResponse>(
        `/server/customers/${encodeURIComponent(thirdExternalUserId)}/seat-relations`,
      );
    },
    listMaterialCollections(request) {
      return http.get<WorkbenchMaterialCollectionListResponse>(
        "/server/material-collections/materials",
        {
          params: {
            biz_type: request.bizType,
            group_id: request.groupId,
            keyword: request.keyword,
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
      >("/server/material-collections", request, {
        ...(request.bizType === MATERIAL_COLLECTION_BIZ_TYPE.VIDEO
          ? { timeout: VIDEO_MATERIAL_COLLECT_TIMEOUT_MS }
          : {}),
      });
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
    ensureQuickReplyCategories(request) {
      return http.post<
        WorkbenchQuickReplyCategoryEnsureResponse,
        WorkbenchQuickReplyCategoryEnsureRequest
      >("/server/quick-replies/categories/ensure", request);
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
    moveQuickReplyCategory(categoryId, scopeType, request) {
      return http.post<
        WorkbenchQuickReplyOkResponse,
        WorkbenchQuickReplyCategoryMoveRequest
      >(`/server/quick-replies/categories/${categoryId}/move`, request, {
        params: {
          scope_type: scopeType,
        },
      });
    },
    sortQuickReplyCategories(request) {
      return http.post<
        WorkbenchQuickReplyOkResponse,
        WorkbenchQuickReplyCategorySortRequest
      >("/server/quick-replies/categories/sort", request);
    },
    createQuickReply(request) {
      return http.post<WorkbenchQuickReplyOkResponse, WorkbenchQuickReplyCreateRequest>(
        "/server/quick-replies",
        request,
      );
    },
    batchCreateQuickReplies(request) {
      return http.post<
        WorkbenchQuickReplyBatchCreateResponse,
        WorkbenchQuickReplyBatchCreateRequest
      >("/server/quick-replies/batch", request);
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
    moveQuickReply(quickReplyId, scopeType, request) {
      return http.post<WorkbenchQuickReplyOkResponse, WorkbenchQuickReplyMoveRequest>(
        `/server/quick-replies/${quickReplyId}/move`,
        request,
        {
          params: {
            scope_type: scopeType,
          },
        },
      );
    },
    sortQuickReplies(request) {
      return http.post<WorkbenchQuickReplyOkResponse, WorkbenchQuickReplySortRequest>(
        "/server/quick-replies/sort",
        request,
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
    getMessagesBySeqs(input) {
      return http.post<WorkbenchMessageQueryBySeqsResponse, WorkbenchMessageQueryBySeqsRequest>(
        "/server/messages/query-by-seqs",
        input,
        { supportReadonlyAllowed: true },
      );
    },
    getChatRecordDetail(input) {
      return http.get<WorkbenchChatRecordDetailResponse>(
        `/server/messages/${input.messageSeq}/chat-record`,
        {
          params: {
            conversation_id: input.conversationId,
          },
        },
      );
    },
    revokeMessage(input) {
      return http.post<WorkbenchRevokeMessageResponse, WorkbenchRevokeMessageRequest>(
        `/server/messages/${input.messageSeq}/revoke`,
        {
          conversationId: input.conversationId,
        },
      );
    },
    downloadMessageFile(input) {
      return http.post<
        WorkbenchMessageFileDownloadResponse,
        { conversationId: string; msgInfoId: number }
      >("/server/messages/download", {
        conversationId: input.conversationId,
        msgInfoId: input.msgInfoId,
      }, { supportReadonlyAllowed: true });
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
    pullGroupMembers(conversationId, request) {
      return http.post<
        WorkbenchPullGroupMembersResponse,
        WorkbenchPullGroupMembersRequest
      >(`/server/conversations/${conversationId}/group-members`, request);
    },
    kickGroupMember(conversationId, request) {
      return http.post<
        WorkbenchKickGroupMemberResponse,
        WorkbenchKickGroupMemberRequest
      >(`/server/conversations/${conversationId}/group-members/remove`, request);
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
    changeConversationFullAuto(conversationId, request) {
      return http.post<WorkbenchConversationFullAutoResponse, { enabled: boolean }>(
        `/server/conversations/${conversationId}/full-auto`,
        request,
      );
    },
    clearConversationHandoff(conversationId) {
      return http.post<WorkbenchConversationClearHandoffResponse>(
        `/server/conversations/${conversationId}/handoff/clear`,
      );
    },
    updateSeatAgentMode(seatId, request) {
      return http.patch<
        WorkbenchSeatAgentModeSwitchResponse,
        WorkbenchSeatAgentModeSwitchRequest
      >(`/server/seats/${seatId}/agent-mode-switch`, request);
    },
    getFullAutoAnswerStatus(conversationId) {
      return http.get<WorkbenchFullAutoAnswerStatusResponse>(
        `/server/conversations/${conversationId}/full-auto/answer-status`,
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
    rewriteComposerText(request, options) {
      return http.post<ComposerAiEditResponse, ComposerAiEditRequest>(
        "/server/composer/ai-edit",
        request,
        {
          signal: options?.signal,
          timeout: COMPOSER_AI_EDIT_TIMEOUT_MS,
        },
      );
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
    retryMessage(request) {
      return http.post<WorkbenchSendMessageResponse, WorkbenchRetryMessageRequest>(
        "/server/messages/retry",
        request,
      );
    },
    getSendFailReason(request) {
      return http.post<WorkbenchSendFailReasonResponse, WorkbenchSendFailReasonRequest>(
        "/server/messages/send-fail-reason",
        request,
        { supportReadonlyAllowed: true },
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
