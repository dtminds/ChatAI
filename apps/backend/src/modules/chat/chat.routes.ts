import type {
  WorkbenchPollRequest,
  WorkbenchSendMessagePayload,
} from "@chatai/contracts";
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { createMemoryWorkbenchService } from "./workbench-memory.service.js";

const NumericStringSchema = Type.String({ pattern: "^[0-9]+$" });

const ConversationListQuerySchema = Type.Object({
  accountId: Type.Optional(Type.String()),
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

const PollQuerySchema = Type.Object({
  active_conversation_id: Type.Optional(Type.String()),
  active_message_seq: Type.Optional(NumericStringSchema),
  current_account_id: Type.Optional(Type.String()),
  since_version: Type.Optional(NumericStringSchema),
});

const SendMessageBodySchema = Type.Object({
  accountId: Type.String(),
  clientMessageId: Type.String(),
  content: Type.String(),
  contentType: Type.Literal("text"),
  conversationId: Type.String(),
});

const AccountParamsSchema = Type.Object({
  accountId: Type.String(),
});

type ConversationListQuery = Static<typeof ConversationListQuerySchema>;
type ConversationParams = Static<typeof ConversationParamsSchema>;
type ConversationMessagesQuery = Static<typeof ConversationMessagesQuerySchema>;
type PollQuery = Static<typeof PollQuerySchema>;
type SendMessageBody = Static<typeof SendMessageBodySchema>;
type AccountParams = Static<typeof AccountParamsSchema>;

export async function registerChatRoutes(app: FastifyInstance) {
  const workbench = createMemoryWorkbenchService();

  app.get("/api/server/me", { preHandler: app.authenticate }, async () =>
    workbench.getMe(),
  );

  app.get("/api/server/accounts", { preHandler: app.authenticate }, async () =>
    workbench.getAccounts(),
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
      return workbench.getConversations(request.query.accountId ?? "");
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
      return workbench.getMessages(request.params.conversationId, {
        beforeSeq: parseOptionalInteger(request.query.before_seq),
        limit: parseOptionalInteger(request.query.limit),
      });
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
      return workbench.markConversationRead(request.params.conversationId);
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
        currentAccountId: request.query.current_account_id,
        sinceVersion: parseOptionalInteger(request.query.since_version) ?? 0,
      } satisfies WorkbenchPollRequest;

      return workbench.poll(pollRequest);
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
      workbench.sendMessage(request.body satisfies WorkbenchSendMessagePayload),
  );

  app.post<{ Params: AccountParams }>(
    "/api/server/accounts/:accountId/take-over",
    {
      preHandler: app.authenticate,
      schema: {
        params: AccountParamsSchema,
      },
    },
    async (request) => {
      return workbench.takeOverAccount(request.params.accountId);
    },
  );
}

function parseOptionalInteger(value: string | undefined) {
  if (value == null || value === "") {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) ? parsed : undefined;
}
