import {
  apiSuccess,
  InsightsWorkerUidStateSchema,
} from "@chatai/contracts";
import { Type, type Static } from "@sinclair/typebox";
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import {
  ForbiddenError,
  UnauthorizedError,
} from "../../shared/errors.js";
import {
  canViewInsightsWorkerObservability,
} from "./insights-worker-observer-access.js";
import { InsightsWorkerObservabilityRepository } from "./insights-worker-observability.repository.js";
import {
  InsightsWorkerObservabilityService,
  type WorkerUidListQuery,
} from "./insights-worker-observability.service.js";

const UidListQuerySchema = Type.Object({
  analysisState: Type.Optional(InsightsWorkerUidStateSchema),
  page: Type.Optional(Type.Integer({ minimum: 1 })),
  pageSize: Type.Optional(Type.Integer({ maximum: 100, minimum: 1 })),
  sessionizationState: Type.Optional(InsightsWorkerUidStateSchema),
  state: Type.Optional(InsightsWorkerUidStateSchema),
  uid: Type.Optional(Type.Integer({ minimum: 1 })),
}, { additionalProperties: false });

const UidParamsSchema = Type.Object({
  uid: Type.Integer({ minimum: 1 }),
}, { additionalProperties: false });

type UidListQuery = Static<typeof UidListQuerySchema>;
type UidParams = Static<typeof UidParamsSchema>;

export async function registerInsightsWorkerObservabilityRoutes(
  app: FastifyInstance,
  observerSubjects: ReadonlySet<string>,
) {
  const authorizeObserver = async (request: FastifyRequest) => {
    const uid = request.user?.uid;
    const subUserId = request.user?.subUserId;

    if (!Number.isSafeInteger(uid) || (uid ?? 0) <= 0 || !subUserId) {
      throw new UnauthorizedError();
    }
    if (!canViewInsightsWorkerObservability(observerSubjects, {
      subUserId,
      uid,
    })) {
      throw new ForbiddenError(
        "INSIGHTS_WORKER_OBSERVABILITY_FORBIDDEN",
        "无权限查看 Worker 运行观测",
      );
    }
  };
  const onRequest = [
    setNoStore,
    app.authenticate,
    authorizeObserver,
  ];

  app.get(
    "/api/server/insights/worker-observability/summary",
    { onRequest },
    async () => {
      return apiSuccess(
        await createService(app).getSummary(),
      );
    },
  );

  app.get<{ Querystring: UidListQuery }>(
    "/api/server/insights/worker-observability/uids",
    {
      onRequest,
      schema: {
        querystring: UidListQuerySchema,
      },
    },
    async (request) => {
      return apiSuccess(
        await createService(app).listUids(
          normalizeListQuery(request.query),
        ),
      );
    },
  );

  app.get<{ Params: UidParams }>(
    "/api/server/insights/worker-observability/uids/:uid",
    {
      onRequest,
      schema: {
        params: UidParamsSchema,
      },
    },
    async (request) => {
      return apiSuccess(
        await createService(app).getUidDetail(request.params.uid),
      );
    },
  );
}

async function setNoStore(_request: FastifyRequest, reply: FastifyReply) {
  reply.header("Cache-Control", "no-store");
}

function createService(app: FastifyInstance) {
  return new InsightsWorkerObservabilityService(
    new InsightsWorkerObservabilityRepository(app.db),
  );
}

function normalizeListQuery(query: UidListQuery): WorkerUidListQuery {
  return {
    analysisState: query.analysisState,
    page: query.page,
    pageSize: query.pageSize,
    sessionizationState: query.sessionizationState,
    state: query.state,
    uid: query.uid,
  };
}
