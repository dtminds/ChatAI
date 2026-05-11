import type {
  WorkbenchPollRequest,
  WorkbenchSendMessagePayload,
} from "@chatai/contracts";
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import type { WorkbenchService } from "./workbench.service.js";
import { fetchProxiedMediaAsset } from "./media-proxy.service.js";
import { ServiceUnavailableError } from "../../shared/errors.js";

const NumericStringSchema = Type.String({ pattern: "^[0-9]+$" });

const ConversationListQuerySchema = Type.Object({
  seatId: Type.Optional(Type.String()),
  page: Type.Optional(NumericStringSchema),
  pageSize: Type.Optional(NumericStringSchema),
});

const ConversationParamsSchema = Type.Object({
  conversationId: Type.String(),
});

const ConversationMessagesQuerySchema = Type.Object({
  before_seq: Type.Optional(NumericStringSchema),
  limit: Type.Optional(NumericStringSchema),
});

const MediaProxyQuerySchema = Type.Object({
  url: Type.String({ minLength: 1 }),
});

const PollQuerySchema = Type.Object({
  active_conversation_id: Type.Optional(Type.String()),
  active_message_seq: Type.Optional(NumericStringSchema),
  current_seat_id: Type.Optional(Type.String()),
  since_version: Type.Optional(NumericStringSchema),
});

const SendMessageBodySchema = Type.Object({
  clientMessageId: Type.String(),
  content: Type.Optional(Type.String()),
  contentType: Type.Optional(Type.Literal("text")),
  conversationId: Type.String(),
  seatId: Type.String(),
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
      ]),
    ),
  ),
});

const SeatParamsSchema = Type.Object({
  seatId: Type.String(),
});

type ConversationListQuery = Static<typeof ConversationListQuerySchema>;
type ConversationParams = Static<typeof ConversationParamsSchema>;
type ConversationMessagesQuery = Static<typeof ConversationMessagesQuerySchema>;
type MediaProxyQuery = Static<typeof MediaProxyQuerySchema>;
type PollQuery = Static<typeof PollQuerySchema>;
type SendMessageBody = Static<typeof SendMessageBodySchema>;
type SeatParams = Static<typeof SeatParamsSchema>;

export async function registerChatRoutes(app: FastifyInstance) {
  app.get("/api/server/me", { preHandler: app.authenticate }, async (request) =>
    getWorkbenchService(app).getMe(getSubUserId(request)),
  );

  app.get("/api/server/seats", { preHandler: app.authenticate }, async (request) =>
    getWorkbenchService(app).getSeats(getSubUserId(request)),
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
      const media = await fetchProxiedMediaAsset(request.query.url);

      reply.header("cache-control", "private, max-age=300");
      reply.header("content-type", media.contentType);

      if (media.contentLength) {
        reply.header("content-length", media.contentLength);
      }

      return reply.send(media.body);
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
      return getWorkbenchService(app).getConversations(
        getSubUserId(request),
        request.query.seatId ?? "",
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
      return getWorkbenchService(app).getMessages(
        getSubUserId(request),
        request.params.conversationId,
        {
          beforeSeq: parseOptionalInteger(request.query.before_seq),
          limit: parseOptionalInteger(request.query.limit),
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
      return getWorkbenchService(app).markConversationRead(
        getSubUserId(request),
        request.params.conversationId,
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
        sinceVersion: parseOptionalInteger(request.query.since_version) ?? 0,
      } satisfies WorkbenchPollRequest;

      return getWorkbenchService(app).poll(getSubUserId(request), pollRequest);
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
    async (request) =>
      getWorkbenchService(app).sendMessage(
        getSubUserId(request),
        request.body satisfies WorkbenchSendMessagePayload,
      ),
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
      return getWorkbenchService(app).takeOverSeat(
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

function getWorkbenchService(app: FastifyInstance): WorkbenchService {
  if (app.workbenchService) {
    return app.workbenchService;
  }

  throw new ServiceUnavailableError(
    "DATABASE_NOT_CONFIGURED",
    "工作台服务暂不可用",
  );
}
