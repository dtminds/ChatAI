import type {
  WorkbenchPollRequest,
  WorkbenchSendMessagePayload,
} from "@chatai/contracts";
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { WorkbenchService } from "./workbench.service.js";
import { fetchProxiedMediaAsset } from "./media-proxy.service.js";
import { ForbiddenError } from "../../shared/errors.js";
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

const MediaProxyQuerySchema = Type.Object({
  url: Type.String({ minLength: 1 }),
});

const MediaUploadCredentialBodySchema = Type.Object({
  conversationId: Type.String(),
});

const MessageDownloadParamsSchema = Type.Object({
  messageId: Type.String(),
});

const MessageDownloadStatusBodySchema = Type.Object({
  conversationId: Type.String(),
  messageSeq: Type.Number(),
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
  Type.Literal("quote"),
]);

const PollQuerySchema = Type.Object({
  active_conversation_id: Type.Optional(Type.String()),
  active_message_seq: Type.Optional(NumericStringSchema),
  current_seat_id: Type.Optional(Type.String()),
  fresh_baseline: Type.Optional(Type.Union([Type.Literal("0"), Type.Literal("1")])),
  since_version: Type.Optional(NumericStringSchema),
});

const SendMessageBodySchema = Type.Object({
  clientMessageId: Type.String(),
  content: Type.Optional(Type.String()),
  contentType: Type.Optional(Type.Literal("text")),
  conversationId: Type.String(),
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
        extension: Type.String(),
        fileId: Type.Optional(Type.String()),
        fileName: Type.String(),
        fileSize: Type.Optional(Type.Number()),
        fileSizeLabel: Type.Optional(Type.String()),
        type: Type.Literal("file"),
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
          extension: Type.String(),
          fileId: Type.Optional(Type.String()),
          fileName: Type.String(),
          fileSize: Type.Optional(Type.Number()),
          fileSizeLabel: Type.Optional(Type.String()),
          type: Type.Literal("file"),
          url: Type.Optional(Type.String()),
        }),
      ]),
    ),
  ),
});

const SeatParamsSchema = Type.Object({
  seatId: Type.String(),
});

const SidebarIframeParamsBodySchema = Type.Object({
  conversationId: Type.String(),
  seatId: Type.String(),
});

type ConversationListQuery = Static<typeof ConversationListQuerySchema>;
type ConversationParams = Static<typeof ConversationParamsSchema>;
type ConversationMessagesQuery = Static<typeof ConversationMessagesQuerySchema>;
type HistoryMessagesQuery = Static<typeof HistoryMessagesQuerySchema>;
type MediaProxyQuery = Static<typeof MediaProxyQuerySchema>;
type MediaUploadCredentialBody = Static<typeof MediaUploadCredentialBodySchema>;
type MessageDownloadParams = Static<typeof MessageDownloadParamsSchema>;
type MessageDownloadStatusBody = Static<typeof MessageDownloadStatusBodySchema>;
type PollQuery = Static<typeof PollQuerySchema>;
type SendMessageBody = Static<typeof SendMessageBodySchema>;
type SeatParams = Static<typeof SeatParamsSchema>;
type SidebarIframeParamsBody = Static<typeof SidebarIframeParamsBodySchema>;

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

  app.get<{ Querystring: MediaProxyQuery }>(
    "/api/server/media/proxy",
    {
      preHandler: app.authenticate,
      schema: {
        querystring: MediaProxyQuerySchema,
      },
    },
    async (request, reply) => {
      const media = await fetchProxiedMediaAsset(request.query.url, request.log);

      reply.header("cache-control", "private, max-age=300");
      reply.header("content-type", media.contentType);

      if (media.contentLength) {
        reply.header("content-length", media.contentLength);
      }

      return reply.send(media.body);
    },
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
        sinceVersion: parseOptionalInteger(request.query.since_version) ?? 0,
      } satisfies WorkbenchPollRequest;

      return getWorkbenchService(app, request).poll(getSubUserId(request), pollRequest);
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
      assertChatWriteAccess(request);
      return getWorkbenchService(app, request).downloadMessageFile(
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
