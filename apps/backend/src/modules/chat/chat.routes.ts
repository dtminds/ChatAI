import type {
  WorkbenchMessageQueryByIdsRequest,
  WorkbenchPollRequest,
  WorkbenchSendMessagePayload,
  WorkbenchGetOrCreateConversationRequestDto,
  WorkbenchSmartReplyAttachmentsRequest,
  WorkbenchSmartReplyAutoGeneralAnswerRequest,
  WorkbenchSmartReplyGeneralAnswerRequest,
  WorkbenchSmartReplyMakeShorterRequest,
  WorkbenchSmartReplyPollRequest,
  WorkbenchSmartReplySendAnswerRequest,
  WorkbenchKnowledgePageRequest,
  WorkbenchKnowledgeConfigRequest,
  WorkbenchKnowledgeDocPageRequest,
  WorkbenchKnowledgeFaqAddRequest,
  WorkbenchSmartHeartbeatRequest,
  WorkbenchSmartReplyTextModerationRequest,
  WorkbenchVoicePlaybackConfirmRequest,
  WorkbenchVoiceTranscriptionRequest,
  WorkbenchMaterialCollectionCreateRequest,
  WorkbenchMaterialCollectionGroupCreateRequest,
  WorkbenchMaterialCollectionGroupListRequest,
  WorkbenchMaterialCollectionGroupUpdateRequest,
  WorkbenchMaterialCollectionListRequest,
  WorkbenchMaterialCollectionMoveRequest,
  WorkbenchMaterialCollectionUpdateRequest,
} from "@chatai/contracts";
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { WorkbenchService } from "./workbench.service.js";
import { checkPlayableVoiceAsset } from "./media-proxy.service.js";
import { BadRequestError, ForbiddenError } from "../../shared/errors.js";
import { withRequestId } from "../../shared/logger.js";

const NumericStringSchema = Type.String({ pattern: "^[0-9]+$" });

const ConversationListQuerySchema = Type.Object({
  cursor: Type.Optional(Type.String()),
  limit: Type.Optional(NumericStringSchema),
  mode: Type.Optional(Type.Union([Type.Literal("single"), Type.Literal("group")])),
  seatId: Type.Optional(Type.String()),
});

const ConversationParamsSchema = Type.Object({
  conversationId: Type.String(),
});

const ConversationMessagesQuerySchema = Type.Object({
  before_seq: Type.Optional(NumericStringSchema),
  limit: Type.Optional(NumericStringSchema),
});

const HistoryMessagesQuerySchema = Type.Object({
  cursor: Type.Optional(Type.String()),
  day: Type.Optional(Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" })),
  limit: Type.Optional(NumericStringSchema),
  scope: Type.Optional(
    Type.Union([
      Type.Literal("all"),
      Type.Literal("file"),
      Type.Literal("media"),
      Type.Literal("h5"),
      Type.Literal("mini-program"),
    ]),
  ),
  sender_id: Type.Optional(Type.String()),
});

const PlayableVoiceQuerySchema = Type.Object({
  url: Type.String({ minLength: 1 }),
});

const MediaUploadCredentialBodySchema = Type.Object({
  conversationId: Type.String(),
});

const VoicePlaybackConfirmBodySchema = Type.Object({
  conversationId: Type.String(),
  messageSeq: Type.Integer({ minimum: 1 }),
  playbackUrl: Type.String({ minLength: 1 }),
});

const VoiceTranscriptionBodySchema = Type.Object({
  conversationId: Type.String(),
  messageSeq: Type.Integer({ minimum: 1 }),
});

const MessageDownloadParamsSchema = Type.Object({
  messageId: Type.String(),
});

const MessageChatRecordQuerySchema = Type.Object({
  conversation_id: Type.String(),
});

const MessageRevokeBodySchema = Type.Object({
  conversationId: Type.String(),
});

const MessageDownloadStatusBodySchema = Type.Object({
  conversationId: Type.String(),
  messageSeq: Type.Number(),
});

const MessageQueryByIdsBodySchema = Type.Object({
  conversationId: Type.String(),
  messageIds: Type.Array(Type.String()),
});

const SmartReplyPollBodySchema = Type.Object({
  conversationId: Type.String(),
  msgIds: Type.Array(Type.Integer({ minimum: 1 })),
});

const SmartReplyGeneralAnswerBodySchema = Type.Object({
  conversationId: Type.String(),
  msgId: Type.Integer({ minimum: 1 }),
  questionImgs: Type.Optional(Type.Array(Type.String())),
});

const SmartReplyAutoGeneralAnswerBodySchema = Type.Object({
  conversationId: Type.String(),
  msgId: Type.Integer({ minimum: 1 }),
});

const SmartReplyMakeShorterBodySchema = Type.Object({
  conversationId: Type.String(),
  content: Type.String({ minLength: 1 }),
});

const SmartReplySendAnswerBodySchema = Type.Object({
  conversationId: Type.String(),
  realAnswer: Type.String({ minLength: 1 }),
  realAttachIds: Type.Array(Type.String()),
  recordId: Type.String({ minLength: 1 }),
});

const SmartReplyAttachmentsBodySchema = Type.Object({
  conversationId: Type.String(),
  ids: Type.Array(Type.String()),
});

const SmartReplyTextModerationBodySchema = Type.Object({
  conversationId: Type.String(),
  content: Type.String(),
});

const SmartReplyKnowledgePageBodySchema = Type.Object({
  conversationId: Type.String(),
});

const SmartReplyKnowledgeConfigBodySchema = Type.Object({
  conversationId: Type.String(),
});

const SmartReplyKnowledgeDocPageBodySchema = Type.Object({
  conversationId: Type.String(),
  knowledgeId: Type.String(),
});

const SmartReplyKnowledgeFaqAddItemBodySchema = Type.Object({
  answer: Type.String(),
  attachIds: Type.String(),
  question: Type.String(),
  similarQuestion: Type.String(),
});

const SmartReplyKnowledgeFaqAddBodySchema = Type.Object({
  conversationId: Type.String(),
  docId: Type.String(),
  list: Type.Array(SmartReplyKnowledgeFaqAddItemBodySchema, { minItems: 1 }),
});

const SmartHeartbeatBodySchema = Type.Object({
  conversationId: Type.String(),
});

const WorkbenchMessageContentTypeSchema = Type.Union([
  Type.Literal("system"),
  Type.Literal("revoke"),
  Type.Literal("text"),
  Type.Literal("voice"),
  Type.Literal("image"),
  Type.Literal("emotion"),
  Type.Literal("video"),
  Type.Literal("file"),
  Type.Literal("h5"),
  Type.Literal("contact-card"),
  Type.Literal("location"),
  Type.Literal("solitaire"),
  Type.Literal("redpacket"),
  Type.Literal("sphfeed"),
  Type.Literal("mini-program"),
  Type.Literal("chatrecord"),
  Type.Literal("quote"),
]);

const PollQuerySchema = Type.Object({
  active_conversation_id: Type.Optional(Type.String()),
  active_message_seq: Type.Optional(NumericStringSchema),
  current_seat_id: Type.Optional(Type.String()),
  fresh_baseline: Type.Optional(Type.Union([Type.Literal("0"), Type.Literal("1")])),
  message_update_cursor: Type.Optional(NumericStringSchema),
  seat_update_cursor: Type.Optional(NumericStringSchema),
  since_version: Type.Optional(NumericStringSchema),
});

const SendMessageBodySchema = Type.Object({
  clientMessageId: Type.String(),
  content: Type.Optional(Type.String()),
  contentType: Type.Optional(Type.Literal("text")),
  conversationId: Type.String(),
  failMsgId: Type.Optional(Type.String()),
  mention: Type.Optional(
    Type.Object({
      all: Type.Optional(Type.Boolean()),
      location: Type.Union([Type.Literal("start"), Type.Literal("end")]),
      memberIds: Type.Array(Type.String()),
    }),
  ),
  quote: Type.Optional(
    Type.Object({
      quoteMsgId: Type.String(),
      quotedMessageId: Type.Optional(Type.String()),
      quotedMessage: Type.Optional(
        Type.Object({
          contentType: WorkbenchMessageContentTypeSchema,
          fallbackText: Type.Optional(Type.String()),
          imageUrl: Type.Optional(Type.String()),
          senderName: Type.String(),
          text: Type.Optional(Type.String()),
          title: Type.Optional(Type.String()),
        }),
      ),
    }),
  ),
  seatId: Type.String(),
  segment: Type.Optional(
    Type.Union([
      Type.Object({
        text: Type.String(),
        type: Type.Literal("text"),
      }),
      Type.Object({
        alt: Type.String(),
        fileId: Type.Optional(Type.String()),
        height: Type.Optional(Type.Number()),
        localUrl: Type.Optional(Type.String()),
        type: Type.Literal("image"),
        url: Type.Optional(Type.String()),
        width: Type.Optional(Type.Number()),
      }),
      Type.Object({
        materialCollectionId: Type.String(),
        type: Type.Literal("emotion"),
      }),
      Type.Object({
        extension: Type.Optional(Type.String()),
        fileId: Type.Optional(Type.String()),
        fileName: Type.Optional(Type.String()),
        materialCollectionId: Type.Optional(Type.String()),
        fileSize: Type.Optional(Type.Number()),
        fileSizeLabel: Type.Optional(Type.String()),
        type: Type.Literal("file"),
        url: Type.Optional(Type.String()),
      }),
      Type.Object({
        coverUrl: Type.Optional(Type.String()),
        desc: Type.Optional(Type.String()),
        href: Type.Optional(Type.String()),
        materialCollectionId: Type.Optional(Type.String()),
        title: Type.Optional(Type.String()),
        type: Type.Literal("h5"),
      }),
      Type.Object({
        appName: Type.Optional(Type.String()),
        coverImageUrl: Type.Optional(Type.String()),
        logoUrl: Type.Optional(Type.String()),
        materialCollectionId: Type.String(),
        sourceLabel: Type.Optional(Type.String()),
        title: Type.Optional(Type.String()),
        type: Type.Literal("weapp"),
      }),
      Type.Object({
        description: Type.Optional(Type.String()),
        imageUrl: Type.Optional(Type.String()),
        materialCollectionId: Type.String(),
        sourceLabel: Type.Optional(Type.String()),
        title: Type.Optional(Type.String()),
        type: Type.Literal("sphfeed"),
        url: Type.Optional(Type.String()),
      }),
    ]),
  ),
  segments: Type.Optional(
    Type.Array(
      Type.Union([
        Type.Object({
          text: Type.String(),
          type: Type.Literal("text"),
        }),
        Type.Object({
          alt: Type.String(),
          fileId: Type.Optional(Type.String()),
          height: Type.Optional(Type.Number()),
          localUrl: Type.Optional(Type.String()),
          type: Type.Literal("image"),
          url: Type.Optional(Type.String()),
          width: Type.Optional(Type.Number()),
        }),
        Type.Object({
          materialCollectionId: Type.String(),
          type: Type.Literal("emotion"),
        }),
        Type.Object({
          extension: Type.Optional(Type.String()),
          fileId: Type.Optional(Type.String()),
          fileName: Type.Optional(Type.String()),
          materialCollectionId: Type.Optional(Type.String()),
          fileSize: Type.Optional(Type.Number()),
          fileSizeLabel: Type.Optional(Type.String()),
          type: Type.Literal("file"),
          url: Type.Optional(Type.String()),
        }),
        Type.Object({
          coverUrl: Type.Optional(Type.String()),
          desc: Type.Optional(Type.String()),
          href: Type.Optional(Type.String()),
          materialCollectionId: Type.Optional(Type.String()),
          title: Type.Optional(Type.String()),
          type: Type.Literal("h5"),
        }),
        Type.Object({
          appName: Type.Optional(Type.String()),
          coverImageUrl: Type.Optional(Type.String()),
          logoUrl: Type.Optional(Type.String()),
          materialCollectionId: Type.String(),
          sourceLabel: Type.Optional(Type.String()),
          title: Type.Optional(Type.String()),
          type: Type.Literal("weapp"),
        }),
        Type.Object({
          description: Type.Optional(Type.String()),
          imageUrl: Type.Optional(Type.String()),
          materialCollectionId: Type.String(),
          sourceLabel: Type.Optional(Type.String()),
          title: Type.Optional(Type.String()),
          type: Type.Literal("sphfeed"),
          url: Type.Optional(Type.String()),
        }),
      ]),
    ),
  ),
});

const SeatParamsSchema = Type.Object({
  seatId: Type.String(),
});

const CustomersQuerySchema = Type.Object({
  cursor: Type.Optional(Type.String()),
  keyword: Type.Optional(Type.String()),
  limit: Type.Optional(NumericStringSchema),
  scope: Type.Optional(Type.Union([Type.Literal("mine"), Type.Literal("all")])),
  seat_ids: Type.Optional(Type.String()),
});

const CustomerParamsSchema = Type.Object({
  thirdExternalUserId: Type.String({ minLength: 1 }),
});

const CustomerRelationConversationsQuerySchema = Type.Object({
  third_userids: Type.String({ minLength: 1 }),
});

const SidebarIframeParamsBodySchema = Type.Object({
  conversationId: Type.String(),
  seatId: Type.String(),
});

const SearchQuerySchema = Type.Object({
  seatId: Type.String({ minLength: 1 }),
  keyword: Type.String({ minLength: 1 }),
});

const GetOrCreateConversationBodySchema = Type.Object({
  seatId: Type.String({ minLength: 1 }),
  chatType: Type.Union([Type.Literal(1), Type.Literal(2)]),
  thirdExternalUserId: Type.Optional(Type.String()),
  thirdGroupId: Type.Optional(Type.String()),
});

const MaterialBizTypeSchema = Type.Union([
  Type.Literal(1),
  Type.Literal(2),
  Type.Literal(3),
  Type.Literal(4),
  Type.Literal(5),
]);

const MaterialGroupBizTypeSchema = Type.Union([
  Type.Literal(2),
  Type.Literal(3),
  Type.Literal(4),
  Type.Literal(5),
]);

const MaterialCollectionsQuerySchema = Type.Object({
  biz_type: NumericStringSchema,
  group_id: Type.Optional(Type.String({ maxLength: 64, minLength: 1 })),
  page: Type.Optional(NumericStringSchema),
  page_size: Type.Optional(NumericStringSchema),
});

const MaterialGroupsQuerySchema = Type.Object({
  biz_type: NumericStringSchema,
});

const MaterialCollectionCreateBodySchema = Type.Object({
  bizType: MaterialBizTypeSchema,
  description: Type.Optional(Type.String()),
  fileName: Type.Optional(Type.String()),
  groupId: Type.Optional(Type.Union([Type.String({ maxLength: 64 }), Type.Literal(0)])),
  messageId: Type.String({ maxLength: 64, minLength: 1 }),
  title: Type.Optional(Type.String()),
});

const MaterialCollectionUpdateBodySchema = Type.Object({
  description: Type.Optional(Type.String()),
  fileName: Type.Optional(Type.String()),
  title: Type.Optional(Type.String()),
});

const MaterialCollectionParamsSchema = Type.Object({
  collectionId: Type.String({ maxLength: 64, minLength: 1 }),
});

const MaterialCollectionMoveBodySchema = Type.Object({
  groupId: Type.String({ maxLength: 64, minLength: 1 }),
});

const MaterialCollectionGroupCreateBodySchema = Type.Object({
  bizType: MaterialGroupBizTypeSchema,
  title: Type.String({ maxLength: 10, minLength: 1 }),
});

const MaterialCollectionGroupUpdateBodySchema = Type.Object({
  title: Type.String({ maxLength: 10, minLength: 1 }),
});

const MaterialCollectionGroupParamsSchema = Type.Object({
  groupId: Type.String({ maxLength: 64, minLength: 1 }),
});

const MaterialCollectionGroupQuerySchema = Type.Object({
  biz_type: NumericStringSchema,
});

type ConversationListQuery = Static<typeof ConversationListQuerySchema>;
type ConversationParams = Static<typeof ConversationParamsSchema>;
type ConversationMessagesQuery = Static<typeof ConversationMessagesQuerySchema>;
type HistoryMessagesQuery = Static<typeof HistoryMessagesQuerySchema>;
type PlayableVoiceQuery = Static<typeof PlayableVoiceQuerySchema>;
type MediaUploadCredentialBody = Static<typeof MediaUploadCredentialBodySchema>;
type VoicePlaybackConfirmBody = Static<typeof VoicePlaybackConfirmBodySchema>;
type VoiceTranscriptionBody = Static<typeof VoiceTranscriptionBodySchema>;
type MessageDownloadParams = Static<typeof MessageDownloadParamsSchema>;
type MessageChatRecordQuery = Static<typeof MessageChatRecordQuerySchema>;
type MessageRevokeBody = Static<typeof MessageRevokeBodySchema>;
type MessageDownloadStatusBody = Static<typeof MessageDownloadStatusBodySchema>;
type MessageQueryByIdsBody = Static<typeof MessageQueryByIdsBodySchema>;
type PollQuery = Static<typeof PollQuerySchema>;
type SendMessageBody = Static<typeof SendMessageBodySchema>;
type SeatParams = Static<typeof SeatParamsSchema>;
type CustomersQuery = Static<typeof CustomersQuerySchema>;
type CustomerParams = Static<typeof CustomerParamsSchema>;
type CustomerRelationConversationsQuery = Static<
  typeof CustomerRelationConversationsQuerySchema
>;
type SidebarIframeParamsBody = Static<typeof SidebarIframeParamsBodySchema>;
type SearchQuery = Static<typeof SearchQuerySchema>;
type GetOrCreateConversationBody = Static<typeof GetOrCreateConversationBodySchema>;
type MaterialCollectionsQuery = Static<typeof MaterialCollectionsQuerySchema>;
type MaterialGroupsQuery = Static<typeof MaterialGroupsQuerySchema>;
type MaterialCollectionCreateBody = Static<typeof MaterialCollectionCreateBodySchema>;
type MaterialCollectionUpdateBody = Static<typeof MaterialCollectionUpdateBodySchema>;
type MaterialCollectionParams = Static<typeof MaterialCollectionParamsSchema>;
type MaterialCollectionMoveBody = Static<typeof MaterialCollectionMoveBodySchema>;
type MaterialCollectionGroupCreateBody = Static<
  typeof MaterialCollectionGroupCreateBodySchema
>;
type MaterialCollectionGroupUpdateBody = Static<
  typeof MaterialCollectionGroupUpdateBodySchema
>;
type MaterialCollectionGroupParams = Static<typeof MaterialCollectionGroupParamsSchema>;
type MaterialCollectionGroupQuery = Static<typeof MaterialCollectionGroupQuerySchema>;


export async function registerChatRoutes(app: FastifyInstance) {
  app.get("/api/server/me", { preHandler: app.authenticate }, async (request) =>
    getWorkbenchService(app, request).getMe(getSubUserId(request)),
  );

  app.post<{ Body: SidebarIframeParamsBody }>(
    "/api/server/sidebar-iframe-params",
    {
      preHandler: app.authenticate,
      schema: {
        body: SidebarIframeParamsBodySchema,
      },
    },
    async (request) =>
      getWorkbenchService(app, request).getSidebarIframeParams(
        getSubUserId(request),
        request.body,
      ),
  );

  app.get("/api/server/seats", { preHandler: app.authenticate }, async (request) =>
    getWorkbenchService(app, request).getSeats(getSubUserId(request)),
  );

  app.get<{ Querystring: CustomersQuery }>(
    "/api/server/customers",
    {
      preHandler: app.authenticate,
      schema: {
        querystring: CustomersQuerySchema,
      },
    },
    async (request) =>
      getWorkbenchService(app, request).getCustomers(getSubUserId(request), {
        cursor: request.query.cursor,
        keyword: request.query.keyword,
        limit: parseOptionalInteger(request.query.limit),
        scope: request.query.scope ?? "mine",
        seatIds: parseSeatIdsQuery(request.query.seat_ids),
      }),
  );

  app.get<{ Params: CustomerParams }>(
    "/api/server/customers/:thirdExternalUserId/last-conversation",
    {
      preHandler: app.authenticate,
      schema: {
        params: CustomerParamsSchema,
      },
    },
    async (request) =>
      getWorkbenchService(app, request).getCustomerLastConversation(
        getSubUserId(request),
        request.params.thirdExternalUserId,
      ),
  );

  app.get<{
    Params: CustomerParams;
    Querystring: CustomerRelationConversationsQuery;
  }>(
    "/api/server/customers/:thirdExternalUserId/relation-conversations",
    {
      preHandler: app.authenticate,
      schema: {
        params: CustomerParamsSchema,
        querystring: CustomerRelationConversationsQuerySchema,
      },
    },
    async (request) =>
      getWorkbenchService(app, request).getCustomerRelationConversations(
        getSubUserId(request),
        request.params.thirdExternalUserId,
        parseCommaSeparatedQuery(request.query.third_userids),
      ),
  );

  app.get<{ Querystring: PlayableVoiceQuery }>(
    "/api/server/media/playable-voice",
    {
      preHandler: app.authenticate,
      schema: {
        querystring: PlayableVoiceQuerySchema,
      },
    },
    async (request) => ({
      data: await checkPlayableVoiceAsset(request.query.url, request.log),
      success: true,
    }),
  );

  app.post<{ Body: MediaUploadCredentialBody }>(
    "/api/server/media/upload-credential",
    {
      preHandler: app.authenticate,
      schema: {
        body: MediaUploadCredentialBodySchema,
      },
    },
    async (request) => {
      assertChatWriteAccess(request);
      return getWorkbenchService(app, request).getUploadCredential(
        getSubUserId(request),
        request.body.conversationId,
      );
    },
  );

  app.post<{ Body: VoicePlaybackConfirmBody }>(
    "/api/server/media/voice-playback-confirmed",
    {
      preHandler: app.authenticate,
      schema: {
        body: VoicePlaybackConfirmBodySchema,
      },
    },
    async (request) => {
      assertChatWriteAccess(request);
      return getWorkbenchService(app, request).confirmVoicePlaybackReady(
        getSubUserId(request),
        request.body satisfies WorkbenchVoicePlaybackConfirmRequest,
      );
    },
  );

  app.post<{ Body: VoiceTranscriptionBody }>(
    "/api/server/media/voice-transcription",
    {
      preHandler: app.authenticate,
      schema: {
        body: VoiceTranscriptionBodySchema,
      },
    },
    async (request) => {
      assertChatWriteAccess(request);
      return getWorkbenchService(app, request).transcribeVoiceMessage(
        getSubUserId(request),
        request.body satisfies WorkbenchVoiceTranscriptionRequest,
      );
    },
  );

  app.get<{ Querystring: ConversationListQuery }>(
    "/api/server/conversations",
    {
      preHandler: app.authenticate,
      schema: {
        querystring: ConversationListQuerySchema,
      },
    },
    async (request) => {
      return getWorkbenchService(app, request).getConversations(
        getSubUserId(request),
        request.query.seatId ?? "",
        {
          cursor: request.query.cursor,
          limit: parseOptionalInteger(request.query.limit),
          mode: request.query.mode,
        },
      );
    },
  );

  app.get<{
    Params: ConversationParams;
    Querystring: ConversationMessagesQuery;
  }>(
    "/api/server/conversations/:conversationId/messages",
    {
      preHandler: app.authenticate,
      schema: {
        params: ConversationParamsSchema,
        querystring: ConversationMessagesQuerySchema,
      },
    },
    async (request) => {
      return getWorkbenchService(app, request).getMessages(
        getSubUserId(request),
        request.params.conversationId,
        {
          beforeSeq: parseOptionalInteger(request.query.before_seq),
          limit: parseOptionalInteger(request.query.limit),
        },
      );
    },
  );

  app.post<{ Body: MessageQueryByIdsBody }>(
    "/api/server/messages/query-by-ids",
    {
      preHandler: app.authenticate,
      schema: {
        body: MessageQueryByIdsBodySchema,
      },
    },
    async (request) =>
      getWorkbenchService(app, request).getMessagesByIds(
        getSubUserId(request),
        request.body.conversationId,
        request.body.messageIds,
      ),
  );

  app.get<{
    Params: MessageDownloadParams;
    Querystring: MessageChatRecordQuery;
  }>(
    "/api/server/messages/:messageId/chat-record",
    {
      preHandler: app.authenticate,
      schema: {
        params: MessageDownloadParamsSchema,
        querystring: MessageChatRecordQuerySchema,
      },
    },
    async (request) =>
      getWorkbenchService(app, request).getChatRecordDetail(
        getSubUserId(request),
        request.query.conversation_id,
        request.params.messageId,
      ),
  );

  app.get<{
    Params: ConversationParams;
    Querystring: HistoryMessagesQuery;
  }>(
    "/api/server/conversations/:conversationId/history-messages",
    {
      preHandler: app.authenticate,
      schema: {
        params: ConversationParamsSchema,
        querystring: HistoryMessagesQuerySchema,
      },
    },
    async (request) => {
      return getWorkbenchService(app, request).getHistoryMessages(
        getSubUserId(request),
        request.params.conversationId,
        {
          cursor: request.query.cursor,
          day: request.query.day,
          limit: parseOptionalInteger(request.query.limit),
          scope: request.query.scope,
          senderId: request.query.sender_id,
        },
      );
    },
  );

  app.post<{ Params: ConversationParams }>(
    "/api/server/conversations/:conversationId/read",
    {
      preHandler: app.authenticate,
      schema: {
        params: ConversationParamsSchema,
      },
    },
    async (request) => {
      assertChatWriteAccess(request);
      return getWorkbenchService(app, request).markConversationRead(
        getSubUserId(request),
        request.params.conversationId,
      );
    },
  );

  app.post<{ Params: ConversationParams }>(
    "/api/server/conversations/:conversationId/unread",
    {
      preHandler: app.authenticate,
      schema: {
        params: ConversationParamsSchema,
      },
    },
    async (request) => {
      assertChatWriteAccess(request);
      return getWorkbenchService(app, request).markConversationUnread(
        getSubUserId(request),
        request.params.conversationId,
      );
    },
  );

  app.post<{ Params: ConversationParams }>(
    "/api/server/conversations/:conversationId/pin",
    {
      preHandler: app.authenticate,
      schema: {
        params: ConversationParamsSchema,
      },
    },
    async (request) => {
      assertChatWriteAccess(request);
      return getWorkbenchService(app, request).pinConversation(
        getSubUserId(request),
        request.params.conversationId,
      );
    },
  );

  app.post<{ Params: ConversationParams }>(
    "/api/server/conversations/:conversationId/unpin",
    {
      preHandler: app.authenticate,
      schema: {
        params: ConversationParamsSchema,
      },
    },
    async (request) => {
      assertChatWriteAccess(request);
      return getWorkbenchService(app, request).unpinConversation(
        getSubUserId(request),
        request.params.conversationId,
      );
    },
  );

  app.post<{ Params: ConversationParams }>(
    "/api/server/conversations/:conversationId/delete",
    {
      preHandler: app.authenticate,
      schema: {
        params: ConversationParamsSchema,
      },
    },
    async (request) => {
      assertChatWriteAccess(request);
      return getWorkbenchService(app, request).deleteConversation(
        getSubUserId(request),
        request.params.conversationId,
      );
    },
  );

  app.get<{ Params: ConversationParams }>(
    "/api/server/conversations/:conversationId/group-members",
    {
      preHandler: app.authenticate,
      schema: {
        params: ConversationParamsSchema,
      },
    },
    async (request) =>
      getWorkbenchService(app, request).getGroupMembers(
        getSubUserId(request),
        request.params.conversationId,
      ),
  );

  app.get<{ Querystring: MaterialGroupsQuery }>(
    "/api/server/material-collections/groups",
    {
      preHandler: app.authenticate,
      schema: {
        querystring: MaterialGroupsQuerySchema,
      },
    },
    async (request) =>
      getWorkbenchService(app, request).listMaterialGroups(
        getSubUserId(request),
        {
          bizType: parseMaterialGroupBizTypeQuery(request.query.biz_type),
        } satisfies WorkbenchMaterialCollectionGroupListRequest,
      ),
  );

  app.get<{ Querystring: MaterialCollectionsQuery }>(
    "/api/server/material-collections/materials",
    {
      preHandler: app.authenticate,
      schema: {
        querystring: MaterialCollectionsQuerySchema,
      },
    },
    async (request) =>
      getWorkbenchService(app, request).listMaterialCollections(
        getSubUserId(request),
        {
          bizType: parseMaterialBizTypeQuery(request.query.biz_type),
          groupId: parseMaterialGroupIdQuery(request.query.group_id),
          page: parsePositiveIntegerQuery(request.query.page) ?? 1,
          pageSize: Math.min(
            parsePositiveIntegerQuery(request.query.page_size) ?? 100,
            100,
          ),
        } satisfies WorkbenchMaterialCollectionListRequest,
      ),
  );

  app.post<{ Body: MaterialCollectionCreateBody }>(
    "/api/server/material-collections",
    {
      preHandler: app.authenticate,
      schema: {
        body: MaterialCollectionCreateBodySchema,
      },
    },
    async (request) => {
      assertChatWriteAccess(request);
      return getWorkbenchService(app, request).collectMaterial(
        getSubUserId(request),
        request.body satisfies WorkbenchMaterialCollectionCreateRequest,
      );
    },
  );

  app.delete<{ Params: MaterialCollectionParams }>(
    "/api/server/material-collections/:collectionId",
    {
      preHandler: app.authenticate,
      schema: {
        params: MaterialCollectionParamsSchema,
      },
    },
    async (request) => {
      assertChatWriteAccess(request);
      return getWorkbenchService(app, request).deleteMaterialCollection(
        getSubUserId(request),
        request.params.collectionId,
      );
    },
  );

  app.patch<{
    Body: MaterialCollectionUpdateBody;
    Params: MaterialCollectionParams;
  }>(
    "/api/server/material-collections/:collectionId",
    {
      preHandler: app.authenticate,
      schema: {
        body: MaterialCollectionUpdateBodySchema,
        params: MaterialCollectionParamsSchema,
      },
    },
    async (request) => {
      assertChatWriteAccess(request);
      return getWorkbenchService(app, request).updateMaterialCollection(
        getSubUserId(request),
        request.params.collectionId,
        request.body satisfies WorkbenchMaterialCollectionUpdateRequest,
      );
    },
  );

  app.post<{ Params: MaterialCollectionParams }>(
    "/api/server/material-collections/:collectionId/top",
    {
      preHandler: app.authenticate,
      schema: {
        params: MaterialCollectionParamsSchema,
      },
    },
    async (request) => {
      assertChatWriteAccess(request);
      return getWorkbenchService(app, request).topMaterialCollection(
        getSubUserId(request),
        request.params.collectionId,
      );
    },
  );

  app.post<{
    Body: MaterialCollectionMoveBody;
    Params: MaterialCollectionParams;
  }>(
    "/api/server/material-collections/:collectionId/move",
    {
      preHandler: app.authenticate,
      schema: {
        body: MaterialCollectionMoveBodySchema,
        params: MaterialCollectionParamsSchema,
      },
    },
    async (request) => {
      assertChatWriteAccess(request);
      return getWorkbenchService(app, request).moveMaterialCollection(
        getSubUserId(request),
        request.params.collectionId,
        request.body satisfies WorkbenchMaterialCollectionMoveRequest,
      );
    },
  );

  app.post<{ Body: MaterialCollectionGroupCreateBody }>(
    "/api/server/material-collections/groups",
    {
      preHandler: app.authenticate,
      schema: {
        body: MaterialCollectionGroupCreateBodySchema,
      },
    },
    async (request) => {
      assertChatWriteAccess(request);
      return getWorkbenchService(app, request).createMaterialGroup(
        getSubUserId(request),
        request.body satisfies WorkbenchMaterialCollectionGroupCreateRequest,
      );
    },
  );

  app.patch<{
    Body: MaterialCollectionGroupUpdateBody;
    Params: MaterialCollectionGroupParams;
    Querystring: MaterialCollectionGroupQuery;
  }>(
    "/api/server/material-collections/groups/:groupId",
    {
      preHandler: app.authenticate,
      schema: {
        body: MaterialCollectionGroupUpdateBodySchema,
        params: MaterialCollectionGroupParamsSchema,
        querystring: MaterialCollectionGroupQuerySchema,
      },
    },
    async (request) => {
      assertChatWriteAccess(request);
      return getWorkbenchService(app, request).renameMaterialGroup(
        getSubUserId(request),
        request.params.groupId,
        parseMaterialBizTypeQuery(request.query.biz_type),
        request.body satisfies WorkbenchMaterialCollectionGroupUpdateRequest,
      );
    },
  );

  app.delete<{
    Params: MaterialCollectionGroupParams;
    Querystring: MaterialCollectionGroupQuery;
  }>(
    "/api/server/material-collections/groups/:groupId",
    {
      preHandler: app.authenticate,
      schema: {
        params: MaterialCollectionGroupParamsSchema,
        querystring: MaterialCollectionGroupQuerySchema,
      },
    },
    async (request) => {
      assertChatWriteAccess(request);
      return getWorkbenchService(app, request).deleteMaterialGroup(
        getSubUserId(request),
        request.params.groupId,
        parseMaterialBizTypeQuery(request.query.biz_type),
      );
    },
  );

  app.post<{
    Params: MaterialCollectionGroupParams;
    Querystring: MaterialCollectionGroupQuery;
  }>(
    "/api/server/material-collections/groups/:groupId/top",
    {
      preHandler: app.authenticate,
      schema: {
        params: MaterialCollectionGroupParamsSchema,
        querystring: MaterialCollectionGroupQuerySchema,
      },
    },
    async (request) => {
      assertChatWriteAccess(request);
      return getWorkbenchService(app, request).topMaterialGroup(
        getSubUserId(request),
        request.params.groupId,
        parseMaterialBizTypeQuery(request.query.biz_type),
      );
    },
  );

  app.get<{ Querystring: PollQuery }>(
    "/api/server/poll",
    {
      preHandler: app.authenticate,
      schema: {
        querystring: PollQuerySchema,
      },
    },
    async (request) => {
      const pollRequest = {
        activeConversationId: request.query.active_conversation_id,
        activeMessageSeq: parseOptionalInteger(request.query.active_message_seq),
        currentSeatId: request.query.current_seat_id,
        freshBaseline: request.query.fresh_baseline === "1",
        messageUpdateCursor: parseOptionalInteger(request.query.message_update_cursor),
        seatUpdateCursor: parseOptionalInteger(request.query.seat_update_cursor),
        sinceVersion: parseOptionalInteger(request.query.since_version) ?? 0,
      } satisfies WorkbenchPollRequest;

      return getWorkbenchService(app, request).poll(getSubUserId(request), pollRequest);
    },
  );

  app.post<{ Body: Static<typeof SmartReplyPollBodySchema> }>(
    "/api/server/smart-reply/poll",
    {
      preHandler: app.authenticate,
      schema: {
        body: SmartReplyPollBodySchema,
      },
    },
    async (request) =>
      getWorkbenchService(app, request).pollSmartReplies(
        getSubUserId(request),
        request.body satisfies WorkbenchSmartReplyPollRequest,
      ),
  );

  app.post<{ Body: Static<typeof SmartReplyGeneralAnswerBodySchema> }>(
    "/api/server/smart-reply/general-answer",
    {
      preHandler: app.authenticate,
      schema: {
        body: SmartReplyGeneralAnswerBodySchema,
      },
    },
    async (request) =>
      getWorkbenchService(app, request).requestSmartReplyGeneralAnswer(
        getSubUserId(request),
        request.body satisfies WorkbenchSmartReplyGeneralAnswerRequest,
      ),
  );

  app.post<{ Body: Static<typeof SmartReplyAutoGeneralAnswerBodySchema> }>(
    "/api/server/smart-reply/auto-general-answer",
    {
      preHandler: app.authenticate,
      schema: {
        body: SmartReplyAutoGeneralAnswerBodySchema,
      },
    },
    async (request) =>
      getWorkbenchService(app, request).requestSmartReplyAutoGeneralAnswer(
        getSubUserId(request),
        request.body satisfies WorkbenchSmartReplyAutoGeneralAnswerRequest,
      ),
  );

  app.post<{ Body: Static<typeof SmartReplyMakeShorterBodySchema> }>(
    "/api/server/smart-reply/make-shorter",
    {
      preHandler: app.authenticate,
      schema: {
        body: SmartReplyMakeShorterBodySchema,
      },
    },
    async (request) =>
      getWorkbenchService(app, request).requestSmartReplyMakeShorter(
        getSubUserId(request),
        request.body satisfies WorkbenchSmartReplyMakeShorterRequest,
      ),
  );

  app.post<{ Body: Static<typeof SmartReplySendAnswerBodySchema> }>(
    "/api/server/smart-reply/send-answer",
    {
      preHandler: app.authenticate,
      schema: {
        body: SmartReplySendAnswerBodySchema,
      },
    },
    async (request) => {
      assertChatWriteAccess(request);
      return getWorkbenchService(app, request).sendSmartReplyAnswer(
        getSubUserId(request),
        request.body satisfies WorkbenchSmartReplySendAnswerRequest,
      );
    },
  );

  app.post<{ Body: Static<typeof SmartReplyAttachmentsBodySchema> }>(
    "/api/server/smart-reply/attachments",
    {
      preHandler: app.authenticate,
      schema: {
        body: SmartReplyAttachmentsBodySchema,
      },
    },
    async (request) =>
      getWorkbenchService(app, request).listSmartReplyAttachments(
        getSubUserId(request),
        request.body satisfies WorkbenchSmartReplyAttachmentsRequest,
      ),
  );

  app.post<{ Body: Static<typeof SmartReplyTextModerationBodySchema> }>(
    "/api/server/smart-reply/text-moderation",
    {
      preHandler: app.authenticate,
      schema: {
        body: SmartReplyTextModerationBodySchema,
      },
    },
    async (request) =>
      getWorkbenchService(app, request).checkSmartReplyTextModeration(
        getSubUserId(request),
        request.body satisfies WorkbenchSmartReplyTextModerationRequest,
      ),
  );

  app.post<{ Body: Static<typeof SmartReplyKnowledgePageBodySchema> }>(
    "/api/server/smart-reply/knowledge-page",
    {
      preHandler: app.authenticate,
      schema: {
        body: SmartReplyKnowledgePageBodySchema,
      },
    },
    async (request) =>
      getWorkbenchService(app, request).listKnowledgePage(
        getSubUserId(request),
        request.body satisfies WorkbenchKnowledgePageRequest,
      ),
  );

  app.post<{ Body: Static<typeof SmartReplyKnowledgeConfigBodySchema> }>(
    "/api/server/smart-reply/knowledge-config",
    {
      preHandler: app.authenticate,
      schema: {
        body: SmartReplyKnowledgeConfigBodySchema,
      },
    },
    async (request) =>
      getWorkbenchService(app, request).getKnowledgeConfig(
        getSubUserId(request),
        request.body satisfies WorkbenchKnowledgeConfigRequest,
      ),
  );

  app.post<{ Body: Static<typeof SmartReplyKnowledgeDocPageBodySchema> }>(
    "/api/server/smart-reply/knowledge-doc-page",
    {
      preHandler: app.authenticate,
      schema: {
        body: SmartReplyKnowledgeDocPageBodySchema,
      },
    },
    async (request) =>
      getWorkbenchService(app, request).listKnowledgeDocPage(
        getSubUserId(request),
        request.body satisfies WorkbenchKnowledgeDocPageRequest,
      ),
  );

  app.post<{ Body: Static<typeof SmartReplyKnowledgeFaqAddBodySchema> }>(
    "/api/server/smart-reply/knowledge-faq/add",
    {
      preHandler: app.authenticate,
      schema: {
        body: SmartReplyKnowledgeFaqAddBodySchema,
      },
    },
    async (request) => {
      assertChatWriteAccess(request);
      return getWorkbenchService(app, request).addKnowledgeFaq(
        getSubUserId(request),
        request.body satisfies WorkbenchKnowledgeFaqAddRequest,
      );
    },
  );

  app.post<{ Body: Static<typeof SmartHeartbeatBodySchema> }>(
    "/api/server/conversations/smart-heartbeat",
    {
      preHandler: app.authenticate,
      schema: {
        body: SmartHeartbeatBodySchema,
      },
    },
    async (request) => {
      assertChatWriteAccess(request);
      return getWorkbenchService(app, request).sendSmartHeartbeat(
        getSubUserId(request),
        request.body satisfies WorkbenchSmartHeartbeatRequest,
      );
    },
  );

  app.post<{ Body: SendMessageBody }>(
    "/api/server/messages/send",
    {
      preHandler: app.authenticate,
      schema: {
        body: SendMessageBodySchema,
      },
    },
    async (request) => {
      assertChatSendAccess(request);
      return getWorkbenchService(app, request).sendMessage(
        getSubUserId(request),
        request.body satisfies WorkbenchSendMessagePayload,
      );
    },
  );

  app.post<{
    Body: MessageDownloadStatusBody;
    Params: MessageDownloadParams;
  }>(
    "/api/server/messages/:messageId/download",
    {
      preHandler: app.authenticate,
      schema: {
        body: MessageDownloadStatusBodySchema,
        params: MessageDownloadParamsSchema,
      },
    },
    async (request) => {
      return getWorkbenchService(app, request).downloadMessageFile(
        getSubUserId(request),
        request.body.conversationId,
        request.params.messageId,
      );
    },
  );

  app.post<{
    Body: MessageRevokeBody;
    Params: MessageDownloadParams;
  }>(
    "/api/server/messages/:messageId/revoke",
    {
      preHandler: app.authenticate,
      schema: {
        body: MessageRevokeBodySchema,
        params: MessageDownloadParamsSchema,
      },
    },
    async (request) => {
      assertChatSendAccess(request);
      return getWorkbenchService(app, request).revokeMessage(
        getSubUserId(request),
        request.body.conversationId,
        request.params.messageId,
      );
    },
  );

  app.post<{ Body: MessageDownloadStatusBody }>(
    "/api/server/messages/download-status",
    {
      preHandler: app.authenticate,
      schema: {
        body: MessageDownloadStatusBodySchema,
      },
    },
    async (request) => {
      assertChatWriteAccess(request);
      return getWorkbenchService(app, request).getMessageFileDownloadStatus(
        getSubUserId(request),
        request.body.conversationId,
        request.body.messageSeq,
      );
    },
  );

  app.post<{ Params: SeatParams }>(
    "/api/server/seats/:seatId/take-over",
    {
      preHandler: app.authenticate,
      schema: {
        params: SeatParamsSchema,
      },
    },
    async (request) => {
      assertChatTakeoverAccess(request);
      return getWorkbenchService(app, request).takeOverSeat(
        getSubUserId(request),
        request.params.seatId,
      );
    },
  );

  app.get<{ Querystring: SearchQuery }>(
    "/api/server/search",
    {
      preHandler: app.authenticate,
      schema: {
        querystring: SearchQuerySchema,
      },
    },
    async (request) => {
      return getWorkbenchService(app, request).search(
        getSubUserId(request),
        request.query.seatId,
        request.query.keyword,
      );
    },
  );

  app.post<{ Body: GetOrCreateConversationBody }>(
    "/api/server/conversations/get-or-create",
    {
      preHandler: app.authenticate,
      schema: {
        body: GetOrCreateConversationBodySchema,
      },
    },
    async (request) => {
      assertChatWriteAccess(request);
      return getWorkbenchService(app, request).getOrCreateConversation(
        getSubUserId(request),
        request.body satisfies WorkbenchGetOrCreateConversationRequestDto,
      );
    },
  );
}

function getSubUserId(request: { user?: { subUserId: string } }) {
  return request.user?.subUserId ?? "";
}

function parseOptionalInteger(value: string | undefined) {
  if (value == null || value === "") {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseRequiredInteger(value: string) {
  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) ? parsed : 0;
}

function parseMaterialBizTypeQuery(value: string): 1 | 2 | 3 | 4 | 5 {
  const parsed = parseRequiredInteger(value);

  if (parsed === 1 || parsed === 2 || parsed === 3 || parsed === 4 || parsed === 5) {
    return parsed;
  }

  throw new BadRequestError("INVALID_MATERIAL_BIZ_TYPE", "素材类型无效");
}

function parseMaterialGroupBizTypeQuery(value: string): 2 | 3 | 4 | 5 {
  const parsed = parseRequiredInteger(value);

  if (parsed === 2 || parsed === 3 || parsed === 4 || parsed === 5) {
    return parsed;
  }

  throw new BadRequestError("INVALID_MATERIAL_BIZ_TYPE", "素材类型无效");
}

function parseMaterialGroupIdQuery(value: string | undefined) {
  if (value == null) {
    return undefined;
  }

  return value === "0" ? 0 : value;
}

function parsePositiveIntegerQuery(value: string | undefined) {
  if (value == null) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function parseSeatIdsQuery(value: string | undefined) {
  return parseCommaSeparatedQuery(value);
}

function parseCommaSeparatedQuery(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function assertChatSendAccess(request: FastifyRequest) {
  assertNotViewer(request);
}

function assertChatTakeoverAccess(request: FastifyRequest) {
  assertNotViewer(request);
}

function assertChatWriteAccess(request: FastifyRequest) {
  assertNotViewer(request);
}

function assertNotViewer(request: FastifyRequest) {
  if (request.user?.roles?.[0] === "viewer") {
    throw new ForbiddenError("FORBIDDEN", "无权限访问");
  }
}

function getWorkbenchService(
  app: FastifyInstance,
  request?: FastifyRequest,
): WorkbenchService {
  if (request) {
    return app.createWorkbenchService?.(withRequestId(request.log, request.id))
      ?? app.workbenchService;
  }

  return app.createWorkbenchService?.() ?? app.workbenchService;
}
