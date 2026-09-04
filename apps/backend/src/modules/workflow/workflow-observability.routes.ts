import {
  apiSuccess,
  WorkflowObservabilityListStateSchema,
} from "@chatai/contracts";
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Kysely } from "kysely";
import type { WorkflowDatabase } from "@chatai/workflow-runtime";
import {
  ForbiddenError,
  UnauthorizedError,
} from "../../shared/errors.js";
import { canViewInsightsWorkerObservability } from "../insights/insights-worker-observer-access.js";
import { WorkflowObservabilityRepository } from "./workflow-observability.repository.js";
import { WorkflowObservabilityService } from "./workflow-observability.service.js";

const WorkflowListQuerySchema = Type.Object({
  page: Type.Optional(Type.Integer({ minimum: 1 })),
  pageSize: Type.Optional(Type.Integer({ maximum: 100, minimum: 1 })),
  state: Type.Optional(WorkflowObservabilityListStateSchema),
  uid: Type.Optional(Type.Integer({ minimum: 1 })),
  workflowId: Type.Optional(Type.String({ pattern: "^[1-9][0-9]*$" })),
}, { additionalProperties: false });

const WorkflowParamsSchema = Type.Object({
  workflowId: Type.String({ pattern: "^[1-9][0-9]*$" }),
}, { additionalProperties: false });

type WorkflowListQuery = Static<typeof WorkflowListQuerySchema>;
type WorkflowParams = Static<typeof WorkflowParamsSchema>;

export async function registerWorkflowObservabilityRoutes(
  app: FastifyInstance,
  observerSubjects: ReadonlySet<string>,
) {
  const authorizeObserver = async (request: FastifyRequest) => {
    const uid = request.user?.uid;
    const subUserId = request.user?.subUserId;
    if (!Number.isSafeInteger(uid) || (uid ?? 0) <= 0 || !subUserId) {
      throw new UnauthorizedError();
    }
    if (!canViewInsightsWorkerObservability(observerSubjects, { subUserId, uid })) {
      throw new ForbiddenError(
        "WORKFLOW_OBSERVABILITY_FORBIDDEN",
        "无权限查看运行观测",
      );
    }
  };
  const onRequest = [setNoStore, app.authenticate, authorizeObserver];

  app.get("/api/server/workflows/observability/summary", { onRequest }, async () => {
    return apiSuccess(await createService(app).getSummary());
  });

  app.get<{ Querystring: WorkflowListQuery }>(
    "/api/server/workflows/observability/workflows",
    { onRequest, schema: { querystring: WorkflowListQuerySchema } },
    async (request) => {
      return apiSuccess(await createService(app).listWorkflows({
        page: request.query.page,
        pageSize: request.query.pageSize,
        state: request.query.state,
        uid: request.query.uid,
        workflowId: request.query.workflowId,
      }));
    },
  );

  app.get<{ Params: WorkflowParams }>(
    "/api/server/workflows/observability/workflows/:workflowId",
    { onRequest, schema: { params: WorkflowParamsSchema } },
    async (request) => {
      return apiSuccess(await createService(app).getWorkflowDetail(request.params.workflowId));
    },
  );
}

async function setNoStore(_request: FastifyRequest, reply: FastifyReply) {
  reply.header("Cache-Control", "no-store");
}

function createService(app: FastifyInstance) {
  return new WorkflowObservabilityService(
    new WorkflowObservabilityRepository(app.db as unknown as Kysely<WorkflowDatabase>),
  );
}
