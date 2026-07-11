import {
  apiSuccess,
  WorkflowCreateRequestSchema,
  WorkflowPublishRequestSchema,
  WorkflowRenameRequestSchema,
  WorkflowRestoreRequestSchema,
  WorkflowSaveDraftRequestSchema,
  type WorkflowCreateRequest,
  type WorkflowPublishRequest,
  type WorkflowRenameRequest,
  type WorkflowRestoreRequest,
  type WorkflowSaveDraftRequest,
} from "@chatai/contracts";
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Kysely } from "kysely";
import type { WorkflowDatabase } from "@chatai/workflow-runtime";
import { MysqlWorkflowRepository } from "./workflow-mysql.repository.js";
import { WorkflowService } from "./workflow.service.js";

const WorkflowParamsSchema = Type.Object({
  workflowId: Type.String({ pattern: "^[1-9][0-9]*$" }),
});

const WorkflowRevisionParamsSchema = Type.Intersect([
  WorkflowParamsSchema,
  Type.Object({ revision: Type.Integer({ minimum: 1 }) }),
]);

type WorkflowParams = Static<typeof WorkflowParamsSchema>;
type WorkflowRevisionParams = Static<typeof WorkflowRevisionParamsSchema>;

export async function registerWorkflowRoutes(
  app: FastifyInstance,
  options: { service?: WorkflowService } = {},
) {
  const service = options.service ?? new WorkflowService(
    new MysqlWorkflowRepository(app.db as unknown as Kysely<WorkflowDatabase>),
  );
  const authenticated = { preHandler: app.authenticate };

  app.get("/api/server/workflows", authenticated, async (request) =>
    apiSuccess(await service.list(getWorkflowScope(request))),
  );

  app.post<{ Body: WorkflowCreateRequest }>(
    "/api/server/workflows",
    { ...authenticated, schema: { body: WorkflowCreateRequestSchema } },
    async (request) => apiSuccess(await service.create(getWorkflowScope(request), request.body)),
  );

  app.get<{ Params: WorkflowParams }>(
    "/api/server/workflows/:workflowId",
    { ...authenticated, schema: { params: WorkflowParamsSchema } },
    async (request) => apiSuccess(await service.get(getWorkflowScope(request), request.params.workflowId)),
  );

  app.put<{ Body: WorkflowSaveDraftRequest; Params: WorkflowParams }>(
    "/api/server/workflows/:workflowId/draft",
    {
      ...authenticated,
      schema: { body: WorkflowSaveDraftRequestSchema, params: WorkflowParamsSchema },
    },
    async (request) => apiSuccess(await service.saveDraft(
      getWorkflowScope(request),
      request.params.workflowId,
      request.body,
    )),
  );

  app.patch<{ Body: WorkflowRenameRequest; Params: WorkflowParams }>(
    "/api/server/workflows/:workflowId/name",
    {
      ...authenticated,
      schema: { body: WorkflowRenameRequestSchema, params: WorkflowParamsSchema },
    },
    async (request) => apiSuccess(await service.rename(
      getWorkflowScope(request),
      request.params.workflowId,
      request.body.name,
    )),
  );

  app.delete<{ Params: WorkflowParams }>(
    "/api/server/workflows/:workflowId",
    { ...authenticated, schema: { params: WorkflowParamsSchema } },
    async (request) => {
      await service.delete(getWorkflowScope(request), request.params.workflowId);
      return apiSuccess({ deleted: true });
    },
  );

  app.post<{ Body: WorkflowPublishRequest; Params: WorkflowParams }>(
    "/api/server/workflows/:workflowId/publish",
    {
      ...authenticated,
      schema: { body: WorkflowPublishRequestSchema, params: WorkflowParamsSchema },
    },
    async (request) => apiSuccess(await service.publish(
      getWorkflowScope(request),
      request.params.workflowId,
      request.body,
    )),
  );

  app.post<{ Params: WorkflowParams }>(
    "/api/server/workflows/:workflowId/enable",
    { ...authenticated, schema: { params: WorkflowParamsSchema } },
    async (request) => apiSuccess(await service.enable(getWorkflowScope(request), request.params.workflowId)),
  );

  app.post<{ Params: WorkflowParams }>(
    "/api/server/workflows/:workflowId/pause",
    { ...authenticated, schema: { params: WorkflowParamsSchema } },
    async (request) => apiSuccess(await service.pause(getWorkflowScope(request), request.params.workflowId)),
  );

  app.post<{ Params: WorkflowParams }>(
    "/api/server/workflows/:workflowId/resume",
    { ...authenticated, schema: { params: WorkflowParamsSchema } },
    async (request) => apiSuccess(await service.resume(getWorkflowScope(request), request.params.workflowId)),
  );

  app.post<{ Params: WorkflowParams }>(
    "/api/server/workflows/:workflowId/stop",
    { ...authenticated, schema: { params: WorkflowParamsSchema } },
    async (request) => apiSuccess(await service.stop(getWorkflowScope(request), request.params.workflowId)),
  );

  app.get<{ Params: WorkflowParams }>(
    "/api/server/workflows/:workflowId/revisions",
    { ...authenticated, schema: { params: WorkflowParamsSchema } },
    async (request) => apiSuccess(await service.listRevisions(
      getWorkflowScope(request),
      request.params.workflowId,
    )),
  );

  app.post<{
    Body: WorkflowRestoreRequest;
    Params: WorkflowRevisionParams;
  }>(
    "/api/server/workflows/:workflowId/revisions/:revision/restore",
    {
      ...authenticated,
      schema: { body: WorkflowRestoreRequestSchema, params: WorkflowRevisionParamsSchema },
    },
    async (request) => apiSuccess(await service.restoreRevision(
      getWorkflowScope(request),
      request.params.workflowId,
      request.params.revision,
      request.body,
    )),
  );
}

function getWorkflowScope(request: FastifyRequest) {
  return {
    roles: request.user.roles,
    subUserId: request.user.subUserId,
    uid: request.user.uid,
  };
}
