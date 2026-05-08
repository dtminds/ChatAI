import type {
  WorkbenchPollRequest,
  WorkbenchSendMessagePayload,
} from "@chatai/contracts";
import type { FastifyInstance } from "fastify";
import { createMemoryWorkbenchService } from "./workbench-memory.service.js";

export async function registerChatRoutes(app: FastifyInstance) {
  const workbench = createMemoryWorkbenchService();

  app.get("/api/server/me", { preHandler: app.authenticate }, async () =>
    workbench.getMe(),
  );

  app.get("/api/server/accounts", { preHandler: app.authenticate }, async () =>
    workbench.getAccounts(),
  );

  app.get(
    "/api/server/conversations",
    { preHandler: app.authenticate },
    async (request) => {
      const query = request.query as { accountId?: string };

      return workbench.getConversations(query.accountId ?? "");
    },
  );

  app.get(
    "/api/server/conversations/:conversationId/messages",
    { preHandler: app.authenticate },
    async (request) => {
      const params = request.params as { conversationId: string };
      const query = request.query as {
        before_seq?: string;
        limit?: string;
      };

      return workbench.getMessages(params.conversationId, {
        beforeSeq: parseOptionalInteger(query.before_seq),
        limit: parseOptionalInteger(query.limit),
      });
    },
  );

  app.post(
    "/api/server/conversations/:conversationId/read",
    { preHandler: app.authenticate },
    async (request) => {
      const params = request.params as { conversationId: string };

      return workbench.markConversationRead(params.conversationId);
    },
  );

  app.get("/api/server/poll", { preHandler: app.authenticate }, async (request) => {
    const query = request.query as {
      active_conversation_id?: string;
      active_message_seq?: string;
      current_account_id?: string;
      since_version?: string;
    };
    const pollRequest = {
      activeConversationId: query.active_conversation_id,
      activeMessageSeq: parseOptionalInteger(query.active_message_seq),
      currentAccountId: query.current_account_id,
      sinceVersion: parseOptionalInteger(query.since_version) ?? 0,
    } satisfies WorkbenchPollRequest;

    return workbench.poll(pollRequest);
  });

  app.post(
    "/api/server/messages/send",
    { preHandler: app.authenticate },
    async (request) => workbench.sendMessage(request.body as WorkbenchSendMessagePayload),
  );

  app.post(
    "/api/server/accounts/:accountId/take-over",
    { preHandler: app.authenticate },
    async (request) => {
      const params = request.params as { accountId: string };

      return workbench.takeOverAccount(params.accountId);
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
