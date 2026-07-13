import {
  apiSuccess,
  WorkflowCreateRequestSchema,
  WorkflowMetadataUpdateRequestSchema,
  WorkflowPublishRequestSchema,
  WorkflowRenameRequestSchema,
  WorkflowRestoreRequestSchema,
  WorkflowSaveDraftRequestSchema,
  WorkflowEntryRecordStatusSchema,
  type WorkflowCreateRequest,
  type WorkflowMetadataUpdateRequest,
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
import { MysqlWorkflowDataReader } from "./workflow-data-mysql.repository.js";
import { WorkflowDataService } from "./workflow-data.service.js";

const WorkflowParamsSchema = Type.Object({
  workflowId: Type.String({ pattern: "^[1-9][0-9]*$" }),
});

const WorkflowRevisionParamsSchema = Type.Intersect([
  WorkflowParamsSchema,
  Type.Object({ revision: Type.Integer({ minimum: 1 }) }),
]);

type WorkflowParams = Static<typeof WorkflowParamsSchema>;
type WorkflowRevisionParams = Static<typeof WorkflowRevisionParamsSchema>;

const WorkflowDataQuerySchema = Type.Object({ revision: Type.Integer({ minimum: 1 }) });
const WorkflowRecordsQuerySchema = Type.Object({
  cursor: Type.Optional(Type.String({ pattern: "^[1-9][0-9]*$" })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
  nodeId: Type.Optional(Type.String({ minLength: 1, maxLength: 128 })),
  revision: Type.Integer({ minimum: 1 }),
  status: Type.Optional(WorkflowEntryRecordStatusSchema),
});
const WorkflowRecordParamsSchema = Type.Intersect([
  WorkflowParamsSchema,
  Type.Object({ recordId: Type.String({ pattern: "^[1-9][0-9]*$" }) }),
]);

export async function registerWorkflowRoutes(
  app: FastifyInstance,
  options: { dataService?: WorkflowDataService; service?: WorkflowService } = {},
) {
  const service = options.service ?? new WorkflowService(
    new MysqlWorkflowRepository(app.db as unknown as Kysely<WorkflowDatabase>),
  );
  const authenticated = { preHandler: app.authenticate };
  const dataService = options.dataService ?? new WorkflowDataService(
    new MysqlWorkflowDataReader(app.db),
  );

  app.get<{ Params: WorkflowParams; Querystring: Static<typeof WorkflowDataQuerySchema> }>(
    "/api/server/workflows/:workflowId/data",
    { ...authenticated, schema: { params: WorkflowParamsSchema, querystring: WorkflowDataQuerySchema } },
    async request => apiSuccess(await dataService.getOverview(
      getWorkflowScope(request), request.params.workflowId, request.query.revision,
    )),
  );

  app.get<{ Params: WorkflowParams; Querystring: Static<typeof WorkflowRecordsQuerySchema> }>(
    "/api/server/workflows/:workflowId/records",
    { ...authenticated, schema: { params: WorkflowParamsSchema, querystring: WorkflowRecordsQuerySchema } },
    async request => apiSuccess(await dataService.listRecords(getWorkflowScope(request), {
      cursor: request.query.cursor,
      limit: request.query.limit ?? 50,
      nodeId: request.query.nodeId,
      revision: request.query.revision,
      status: request.query.status,
      workflowId: request.params.workflowId,
    })),
  );

  app.get<{ Params: Static<typeof WorkflowRecordParamsSchema> }>(
    "/api/server/workflows/:workflowId/records/:recordId",
    { ...authenticated, schema: { params: WorkflowRecordParamsSchema } },
    async request => apiSuccess(await dataService.getRecord(
      getWorkflowScope(request), request.params.workflowId, request.params.recordId,
    )),
  );

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

  app.patch<{ Body: WorkflowMetadataUpdateRequest; Params: WorkflowParams }>(
    "/api/server/workflows/:workflowId/metadata",
    {
      ...authenticated,
      schema: { body: WorkflowMetadataUpdateRequestSchema, params: WorkflowParamsSchema },
    },
    async (request) => apiSuccess(await service.updateMetadata(
      getWorkflowScope(request),
      request.params.workflowId,
      request.body,
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
