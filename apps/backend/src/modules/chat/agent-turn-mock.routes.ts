import {
  ResolveAgentTurnDecisionRequestSchema,
  ResolveAgentTurnKfClarificationRequestSchema,
  StartAgentTurnMockRequestSchema,
  type ResolveAgentTurnDecisionRequest,
  type ResolveAgentTurnKfClarificationRequest,
  type StartAgentTurnMockRequest,
} from "@chatai/contracts";
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { ForbiddenError } from "../../shared/errors.js";
import { withRequestId } from "../../shared/logger.js";
import { getAuthenticatedWorkbenchScope } from "../workbench-platform-scope.js";
import type { WorkbenchService } from "./workbench.service.js";
import { AgentTurnMockService } from "./agent-turn-mock.service.js";

const AgentTurnParamsSchema = Type.Object({
  turnId: Type.String({ minLength: 1 }),
});

const AgentTurnConversationParamsSchema = Type.Object({
  conversationId: Type.String({ minLength: 1 }),
});

const AgentTurnDecisionParamsSchema = Type.Object({
  decisionId: Type.String({ minLength: 1 }),
  turnId: Type.String({ minLength: 1 }),
});

const AgentTurnToolCallParamsSchema = Type.Object({
  callId: Type.String({ minLength: 1 }),
  turnId: Type.String({ minLength: 1 }),
});

const AgentTurnEventsQuerySchema = Type.Object({
  after_sequence: Type.Optional(Type.String({ pattern: "^[0-9]+$" })),
});

type AgentTurnParams = Static<typeof AgentTurnParamsSchema>;
type AgentTurnConversationParams = Static<
  typeof AgentTurnConversationParamsSchema
>;
type AgentTurnDecisionParams = Static<typeof AgentTurnDecisionParamsSchema>;
type AgentTurnToolCallParams = Static<typeof AgentTurnToolCallParamsSchema>;
type AgentTurnEventsQuery = Static<typeof AgentTurnEventsQuerySchema>;

export async function registerAgentTurnMockRoutes(
  app: FastifyInstance,
  service = new AgentTurnMockService(),
) {
  app.addHook("onClose", async () => service.dispose());

  app.post<{ Body: StartAgentTurnMockRequest }>(
    "/api/server/debug/agent-turn-mock/turns",
    {
      preHandler: app.authenticate,
      schema: { body: StartAgentTurnMockRequestSchema },
    },
    async (request) => {
      assertAgentTurnWriteAccess(request);
      const subUserId = getSubUserId(request);
      await getWorkbenchService(app, request).assertConversationOperable(
        subUserId,
        request.body.conversationId,
      );
      return service.start(subUserId, request.body);
    },
  );

  app.get<{ Params: AgentTurnConversationParams }>(
    "/api/server/conversations/:conversationId/agent-turns/latest",
    {
      preHandler: app.authenticate,
      schema: { params: AgentTurnConversationParamsSchema },
    },
    async (request) => {
      return service.getLatest(
        getSubUserId(request),
        request.params.conversationId,
      );
    },
  );

  app.get<{
    Params: AgentTurnParams;
    Querystring: AgentTurnEventsQuery;
  }>(
    "/api/server/agent-turns/:turnId/events",
    {
      preHandler: app.authenticate,
      schema: {
        params: AgentTurnParamsSchema,
        querystring: AgentTurnEventsQuerySchema,
      },
    },
    async (request, reply) => {
      const subUserId = getSubUserId(request);
      const afterSequence = resolveAfterSequence(request);
      let closed = false;
      let heartbeat: ReturnType<typeof setInterval> | undefined;
      let unsubscribe = () => {};

      const close = () => {
        if (closed) return;
        closed = true;
        unsubscribe();
        if (heartbeat) clearInterval(heartbeat);
        if (!reply.raw.writableEnded) reply.raw.end();
      };
      const writeEvent = (event: Parameters<typeof serializeSseEvent>[0]) => {
        if (closed || reply.raw.writableEnded) return;
        reply.raw.write(serializeSseEvent(event));
        if (isTerminalEvent(event.event.type)) close();
      };

      const subscription = service.subscribe(
        request.params.turnId,
        subUserId,
        afterSequence,
        writeEvent,
      );
      unsubscribe = subscription.unsubscribe;

      reply.hijack();
      reply.raw.writeHead(200, {
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "content-type": "text/event-stream; charset=utf-8",
        "x-accel-buffering": "no",
      });
      reply.raw.flushHeaders();
      reply.raw.write(": connected\n\n");

      request.raw.once("aborted", close);
      reply.raw.once("close", close);

      for (const event of subscription.events) {
        writeEvent(event);
      }

      if (subscription.isTerminal) {
        close();
        return;
      }

      heartbeat = setInterval(() => {
        if (!closed && !reply.raw.writableEnded) {
          reply.raw.write(": keep-alive\n\n");
        }
      }, 15_000);
    },
  );

  app.post<{
    Body: ResolveAgentTurnDecisionRequest;
    Params: AgentTurnDecisionParams;
  }>(
    "/api/server/agent-turns/:turnId/decisions/:decisionId",
    {
      preHandler: app.authenticate,
      schema: {
        body: ResolveAgentTurnDecisionRequestSchema,
        params: AgentTurnDecisionParamsSchema,
      },
    },
    async (request) => {
      assertAgentTurnWriteAccess(request);
      return service.resolveDecision(
        request.params.turnId,
        getSubUserId(request),
        request.params.decisionId,
        request.body,
      );
    },
  );

  app.post<{
    Body: ResolveAgentTurnKfClarificationRequest;
    Params: AgentTurnToolCallParams;
  }>(
    "/api/server/agent-turns/:turnId/tool-calls/:callId/responses",
    {
      preHandler: app.authenticate,
      schema: {
        body: ResolveAgentTurnKfClarificationRequestSchema,
        params: AgentTurnToolCallParamsSchema,
      },
    },
    async (request) => {
      assertAgentTurnWriteAccess(request);
      return service.resolveClarification(
        request.params.turnId,
        getSubUserId(request),
        request.params.callId,
        request.body,
      );
    },
  );

  app.post<{ Params: AgentTurnParams }>(
    "/api/server/agent-turns/:turnId/cancel",
    {
      preHandler: app.authenticate,
      schema: { params: AgentTurnParamsSchema },
    },
    async (request) => {
      assertAgentTurnWriteAccess(request);
      return service.cancel(request.params.turnId, getSubUserId(request));
    },
  );
}

function serializeSseEvent(event: import("@chatai/contracts").AgentTurnEventEnvelope) {
  return `id: ${event.eventId}\nevent: agent-turn\ndata: ${JSON.stringify(event)}\n\n`;
}

function isTerminalEvent(type: import("@chatai/contracts").AgentTurnEvent["type"]) {
  return (
    type === "turn.completed" ||
    type === "turn.cancelled" ||
    type === "turn.failed"
  );
}

function resolveAfterSequence(request: FastifyRequest<{
  Params: AgentTurnParams;
  Querystring: AgentTurnEventsQuery;
}>) {
  const querySequence = parseNonNegativeInteger(request.query.after_sequence);
  if (querySequence != null) return querySequence;

  const lastEventId = request.headers["last-event-id"];
  if (typeof lastEventId !== "string") return 0;

  const prefix = `${request.params.turnId}:`;
  if (!lastEventId.startsWith(prefix)) return 0;

  return parseNonNegativeInteger(lastEventId.slice(prefix.length)) ?? 0;
}

function parseNonNegativeInteger(value: string | undefined) {
  if (value == null || value === "") return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function assertAgentTurnWriteAccess(request: FastifyRequest) {
  if (request.user?.roles?.[0] === "viewer") {
    throw new ForbiddenError("FORBIDDEN", "无权限访问");
  }
}

function getSubUserId(request: { user?: { subUserId: string } }) {
  return request.user?.subUserId ?? "";
}

function getWorkbenchService(
  app: FastifyInstance,
  request: FastifyRequest,
): WorkbenchService {
  return app.createWorkbenchService?.(
    withRequestId(request.log, request.id),
    getAuthenticatedWorkbenchScope(request.user),
  ) ?? app.workbenchService;
}
