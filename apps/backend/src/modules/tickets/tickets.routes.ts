import {
  apiSuccess,
  ConversationTicketsQuerySchema,
  TicketActivityListQuerySchema,
  TicketCommentRequestSchema,
  TicketContextOptionsQuerySchema,
  TicketContextQuerySchema,
  TicketCreateRequestSchema,
  TicketListQuerySchema,
  TicketUpdateRequestSchema,
  type AccountRole,
  type ConversationTicketsQuery,
  type TicketActivityListQuery,
  type TicketCommentRequest,
  type TicketContextOptionsQuery,
  type TicketContextQuery,
  type TicketCreateRequest,
  type TicketListQuery,
  type TicketUpdateRequest,
} from "@chatai/contracts";
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { getRolePermissions } from "../auth/permissions.js";
import { InsightsRepository } from "../insights/insights.repository.js";
import { WorkbenchRepository } from "../chat/workbench-repository.js";
import { BadRequestError, UnauthorizedError } from "../../shared/errors.js";
import { TicketsRepository } from "./tickets.repository.js";
import { TicketsService, type TicketsActorScope } from "./tickets.service.js";

const TicketParamsSchema = Type.Object({
  ticketId: Type.String({ minLength: 1 }),
}, { additionalProperties: false });

const ConversationParamsSchema = Type.Object({
  conversationId: Type.String({ minLength: 1 }),
}, { additionalProperties: false });

type TicketParams = Static<typeof TicketParamsSchema>;
type ConversationParams = Static<typeof ConversationParamsSchema>;

export type TicketsServiceFactory = (app: FastifyInstance) => TicketsService;

export async function registerTicketsRoutes(
  app: FastifyInstance,
  serviceFactory: TicketsServiceFactory = createTicketsService,
) {
  const createService = () => serviceFactory(app);

  app.get<{ Querystring: TicketListQuery }>(
    "/api/server/tickets",
    {
      preHandler: app.authenticate,
      schema: { querystring: TicketListQuerySchema },
    },
    async (request) => apiSuccess(
      await createService().listTickets(getTicketsActor(request), request.query),
    ),
  );

  app.get(
    "/api/server/tickets/counts",
    { preHandler: app.authenticate },
    async (request) => apiSuccess(
      await createService().getCounts(getTicketsActor(request)),
    ),
  );

  app.get<{ Querystring: TicketContextOptionsQuery }>(
    "/api/server/tickets/context-options",
    {
      preHandler: app.authenticate,
      schema: { querystring: TicketContextOptionsQuerySchema },
    },
    async (request) => apiSuccess(
      await createService().getContextOptions(getTicketsActor(request), request.query),
    ),
  );

  app.get<{
    Params: ConversationParams;
    Querystring: ConversationTicketsQuery;
  }>(
    "/api/server/tickets/by-conversation/:conversationId",
    {
      preHandler: app.authenticate,
      schema: {
        params: ConversationParamsSchema,
        querystring: ConversationTicketsQuerySchema,
      },
    },
    async (request) => apiSuccess(
      await createService().listConversationTickets(
        getTicketsActor(request),
        request.params.conversationId,
        request.query,
      ),
    ),
  );

  app.get<{
    Params: TicketParams;
    Querystring: TicketActivityListQuery;
  }>(
    "/api/server/tickets/:ticketId/activities",
    {
      preHandler: app.authenticate,
      schema: {
        params: TicketParamsSchema,
        querystring: TicketActivityListQuerySchema,
      },
    },
    async (request) => apiSuccess(
      await createService().listTicketActivities(
        getTicketsActor(request),
        request.params.ticketId,
        request.query,
      ),
    ),
  );

  app.get<{ Params: TicketParams }>(
    "/api/server/tickets/:ticketId/assignee-options",
    {
      preHandler: app.authenticate,
      schema: { params: TicketParamsSchema },
    },
    async (request) => apiSuccess(
      await createService().getTicketAssigneeOptions(
        getTicketsActor(request),
        request.params.ticketId,
      ),
    ),
  );

  app.get<{ Params: TicketParams; Querystring: TicketContextQuery }>(
    "/api/server/tickets/:ticketId/context",
    {
      preHandler: app.authenticate,
      schema: { params: TicketParamsSchema, querystring: TicketContextQuerySchema },
    },
    async (request) => apiSuccess(
      await createService().getTicketContext(
        getTicketsActor(request),
        request.params.ticketId,
        request.query,
      ),
    ),
  );

  app.get<{ Params: TicketParams }>(
    "/api/server/tickets/:ticketId",
    {
      preHandler: app.authenticate,
      schema: { params: TicketParamsSchema },
    },
    async (request) => apiSuccess(
      await createService().getTicketDetail(getTicketsActor(request), request.params.ticketId),
    ),
  );

  app.post<{ Body: TicketCreateRequest }>(
    "/api/server/tickets",
    {
      preHandler: app.authenticate,
      schema: { body: TicketCreateRequestSchema },
    },
    async (request) => apiSuccess(
      await createService().createTicket(getTicketsActor(request), request.body),
    ),
  );

  app.patch<{ Body: TicketUpdateRequest; Params: TicketParams }>(
    "/api/server/tickets/:ticketId",
    {
      preHandler: app.authenticate,
      preValidation: validateTicketUpdateStatusPair,
      schema: {
        body: TicketUpdateRequestSchema,
        params: TicketParamsSchema,
      },
    },
    async (request) => apiSuccess(
      await createService().updateTicket(
        getTicketsActor(request),
        request.params.ticketId,
        request.body,
      ),
    ),
  );

  app.post<{ Params: TicketParams }>(
    "/api/server/tickets/:ticketId/claim",
    {
      preHandler: app.authenticate,
      schema: { params: TicketParamsSchema },
    },
    async (request) => apiSuccess(
      await createService().claimTicket(getTicketsActor(request), request.params.ticketId),
    ),
  );

  app.post<{ Body: TicketCommentRequest; Params: TicketParams }>(
    "/api/server/tickets/:ticketId/comments",
    {
      preHandler: app.authenticate,
      schema: {
        body: TicketCommentRequestSchema,
        params: TicketParamsSchema,
      },
    },
    async (request) => apiSuccess(
      await createService().addComment(
        getTicketsActor(request),
        request.params.ticketId,
        request.body,
      ),
    ),
  );
}

async function validateTicketUpdateStatusPair(request: FastifyRequest) {
  const body = request.body as { expectedStatus?: unknown; status?: unknown } | undefined;
  const hasStatus = body?.status !== undefined;
  const hasExpectedStatus = body?.expectedStatus !== undefined;

  if (hasStatus !== hasExpectedStatus) {
    throw new BadRequestError(
      "INVALID_TICKET_UPDATE",
      "修改工单状态时必须同时提交当前状态",
    );
  }
}

function createTicketsService(app: FastifyInstance) {
  const insightsRepository = new InsightsRepository(app.db);
  const workbenchRepository = new WorkbenchRepository(app.db);

  return new TicketsService(
    new TicketsRepository(app.db),
    {
      listMessageContext: (scope, conversationId, messageId, options) =>
        workbenchRepository.listMessageContext({
          ...options,
          conversationId,
          messageId,
          uid: scope.uid,
        }),
      listSessionMessageRecordPage: (scope, sessionId, options) =>
        insightsRepository.listSessionMessageRecordPage(scope, sessionId, options),
    },
  );
}

function getTicketsActor(request: FastifyRequest): TicketsActorScope {
  const uid = request.user?.uid;
  const subUserId = request.user?.subUserId;
  const role = getAccountRole(request);

  if (!Number.isSafeInteger(uid) || (uid ?? 0) <= 0 || !subUserId || !role) {
    throw new UnauthorizedError();
  }

  return {
    permissions: getRolePermissions(role),
    role,
    subUserId,
    uid: uid!,
  };
}

function getAccountRole(request: FastifyRequest): AccountRole | undefined {
  const roles = request.user?.roles ?? [];

  if (roles.includes("owner")) return "owner";
  if (roles.includes("admin")) return "admin";
  if (roles.includes("operator")) return "operator";
  if (roles.includes("viewer")) return "viewer";
  return undefined;
}
