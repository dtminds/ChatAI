import {
  apiSuccess,
  InsightActionStatusSchema,
  InsightMessageContextRequestSchema,
  InsightsRescanRequestSchema,
  type AccountRole,
  type InsightActionStatus,
  type InsightsRescanRequest,
} from "@chatai/contracts";
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { InsightsRepository } from "./insights.repository.js";
import { InsightsService, type InsightsUidScope } from "./insights.service.js";
import { UnauthorizedError } from "../../shared/errors.js";

const FollowUpsQuerySchema = Type.Object({
  priority: Type.Optional(Type.Union([
    Type.Literal("low"),
    Type.Literal("medium"),
    Type.Literal("high"),
  ])),
  status: Type.Optional(InsightActionStatusSchema),
  type: Type.Optional(Type.String()),
});

const SessionParamsSchema = Type.Object({
  sessionId: Type.String({ minLength: 1 }),
});

const ActionItemParamsSchema = Type.Object({
  actionItemId: Type.String({ minLength: 1 }),
});

const ActionStatusBodySchema = Type.Object({
  status: InsightActionStatusSchema,
});

type FollowUpsQuery = Static<typeof FollowUpsQuerySchema>;
type SessionParams = Static<typeof SessionParamsSchema>;
type ActionItemParams = Static<typeof ActionItemParamsSchema>;
type ActionStatusBody = Static<typeof ActionStatusBodySchema>;
type MessageContextQuery = Static<typeof InsightMessageContextRequestSchema>;

export async function registerInsightsRoutes(app: FastifyInstance) {
  app.get(
    "/api/server/insights/overview",
    {
      preHandler: app.authenticate,
    },
    async (request) => {
      return apiSuccess(
        await createInsightsService(app).getOverview(await getUidScope(app, request)),
      );
    },
  );

  app.get(
    "/api/server/insights/quality",
    {
      preHandler: app.authenticate,
    },
    async (request) => {
      return apiSuccess(
        await createInsightsService(app).getQuality(await getUidScope(app, request)),
      );
    },
  );

  app.get<{ Querystring: FollowUpsQuery }>(
    "/api/server/insights/follow-ups",
    {
      preHandler: app.authenticate,
      schema: {
        querystring: FollowUpsQuerySchema,
      },
    },
    async (request) => {
      return apiSuccess(
        await createInsightsService(app).getFollowUps(
          await getUidScope(app, request),
          request.query,
        ),
      );
    },
  );

  app.get<{ Params: SessionParams }>(
    "/api/server/insights/sessions/:sessionId",
    {
      preHandler: app.authenticate,
      schema: {
        params: SessionParamsSchema,
      },
    },
    async (request) => {
      return apiSuccess(
        await createInsightsService(app).getDetail(
          await getUidScope(app, request),
          request.params.sessionId,
        ),
      );
    },
  );

  app.get<{ Querystring: MessageContextQuery }>(
    "/api/server/insights/messages/context",
    {
      preHandler: app.authenticate,
      schema: {
        querystring: InsightMessageContextRequestSchema,
      },
    },
    async (request) => {
      return apiSuccess(
        await createInsightsService(app).getMessageContext(
          await getUidScope(app, request),
          request.query.conversationId,
          request.query.messageId,
        ),
      );
    },
  );

  app.patch<{ Body: ActionStatusBody; Params: ActionItemParams }>(
    "/api/server/insights/action-items/:actionItemId/status",
    {
      preHandler: app.authenticate,
      schema: {
        body: ActionStatusBodySchema,
        params: ActionItemParamsSchema,
      },
    },
    async (request) => {
      return apiSuccess(
        await createInsightsService(app).updateActionStatus(
          await getUidScope(app, request),
          request.params.actionItemId,
          request.body.status,
        ),
      );
    },
  );

  app.get(
    "/api/server/insights/settings",
    {
      preHandler: app.authenticate,
    },
    async (request) => {
      return apiSuccess(
        await createInsightsService(app).getSettings(
          await getUidScope(app, request),
          request.user?.roles?.[0] as AccountRole | undefined,
        ),
      );
    },
  );

  app.post<{ Body: InsightsRescanRequest }>(
    "/api/server/insights/jobs/rescan",
    {
      preHandler: app.authenticate,
      schema: {
        body: InsightsRescanRequestSchema,
      },
    },
    async (request) => {
      return apiSuccess(
        await createInsightsService(app).createRescanJob(
          await getUidScope(app, request),
          request.body,
        ),
      );
    },
  );
}

function createInsightsService(app: FastifyInstance) {
  return new InsightsService(new InsightsRepository(app.db));
}

async function getUidScope(
  app: FastifyInstance,
  request: FastifyRequest,
): Promise<InsightsUidScope> {
  const subUserId = request.user?.subUserId;

  if (!subUserId) {
    throw new UnauthorizedError();
  }

  const row = await app.db
    .selectFrom("xy_wap_embed_sub_user")
    .select(["uid"])
    .where("id", "=", Number(subUserId))
    .where("status", "=", 1)
    .executeTakeFirst();

  if (!row) {
    throw new UnauthorizedError();
  }

  return {
    uid: Number(row.uid),
  };
}
