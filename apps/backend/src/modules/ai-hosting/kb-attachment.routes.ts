import {
  apiSuccess,
  KB_SEARCH_QUERY_MAX_LENGTH,
  KbAttachmentBatchDeleteRequestSchema,
  KbAttachmentCreateRequestSchema,
  KbAttachmentImageMaterialCreateRequestSchema,
  KbAttachmentTypeSchema,
  KbAttachmentUpdateRequestSchema,
  type KbAttachmentBatchDeleteRequest,
  type KbAttachmentCreateRequest,
  type KbAttachmentImageMaterialCreateRequest,
  type KbAttachmentType,
  type KbAttachmentUpdateRequest,
} from "@chatai/contracts";
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { ForbiddenError } from "../../shared/errors.js";
import { createAgentKbJavaClient } from "./agent-kb-java-client.js";
import { KbAttachmentService } from "./kb-attachment.service.js";
import { getAgentKbTenant } from "./kb-tenant-utils.js";

const NumericStringSchema = Type.String({ pattern: "^[0-9]+$" });

const KbParamsSchema = Type.Object({
  kbId: NumericStringSchema,
});

const KbAttachmentParamsSchema = Type.Object({
  chunkId: NumericStringSchema,
});

const KbAttachmentListQuerySchema = Type.Object({
  attachmentType: KbAttachmentTypeSchema,
  page: Type.Optional(NumericStringSchema),
  pageSize: Type.Optional(NumericStringSchema),
  query: Type.Optional(Type.String({ maxLength: KB_SEARCH_QUERY_MAX_LENGTH })),
});

type KbParams = Static<typeof KbParamsSchema>;
type KbAttachmentParams = Static<typeof KbAttachmentParamsSchema>;
type KbAttachmentListQuery = Static<typeof KbAttachmentListQuerySchema>;

export async function registerKbAttachmentRoutes(app: FastifyInstance) {
  app.post<{ Params: KbParams }>(
    "/api/server/ai-hosting/kbs/:kbId/attachments/init",
    {
      preHandler: app.authenticate,
      schema: {
        params: KbParamsSchema,
      },
    },
    async (request) => {
      assertAiHostingWriteAccess(request);

      return apiSuccess(
        await getKbAttachmentService(app).initAttachments(
          getAgentKbTenant(request),
          request.params.kbId,
        ),
      );
    },
  );

  app.get<{ Params: KbParams; Querystring: KbAttachmentListQuery }>(
    "/api/server/ai-hosting/kbs/:kbId/attachments",
    {
      preHandler: app.authenticate,
      schema: {
        params: KbParamsSchema,
        querystring: KbAttachmentListQuerySchema,
      },
    },
    async (request) => {
      return apiSuccess(
        await getKbAttachmentService(app).listAttachments(
          getAgentKbTenant(request),
          request.params.kbId,
          {
            attachmentType: request.query.attachmentType as KbAttachmentType,
            page: parseOptionalInteger(request.query.page),
            pageSize: parseOptionalInteger(request.query.pageSize),
            query: request.query.query,
          },
        ),
      );
    },
  );

  app.post<{ Body: KbAttachmentCreateRequest; Params: KbParams }>(
    "/api/server/ai-hosting/kbs/:kbId/attachments",
    {
      preHandler: app.authenticate,
      schema: {
        body: KbAttachmentCreateRequestSchema,
        params: KbParamsSchema,
      },
    },
    async (request) => {
      assertAiHostingWriteAccess(request);

      return apiSuccess(
        await getKbAttachmentService(app).createAttachment(
          getAgentKbTenant(request),
          request.params.kbId,
          request.body,
        ),
      );
    },
  );

  app.post<{ Body: KbAttachmentImageMaterialCreateRequest; Params: KbParams }>(
    "/api/server/ai-hosting/kbs/:kbId/attachments/materials/image",
    {
      preHandler: app.authenticate,
      schema: {
        body: KbAttachmentImageMaterialCreateRequestSchema,
        params: KbParamsSchema,
      },
    },
    async (request) => {
      assertAiHostingWriteAccess(request);

      return apiSuccess(
        await getKbAttachmentService(app).createImageMaterial(
          getAgentKbTenant(request),
          request.params.kbId,
          request.body,
        ),
      );
    },
  );

  app.post<{ Body: KbAttachmentUpdateRequest; Params: KbAttachmentParams }>(
    "/api/server/ai-hosting/kb-attachments/:chunkId/update",
    {
      preHandler: app.authenticate,
      schema: {
        body: KbAttachmentUpdateRequestSchema,
        params: KbAttachmentParamsSchema,
      },
    },
    async (request) => {
      assertAiHostingWriteAccess(request);

      return apiSuccess(
        await getKbAttachmentService(app).updateAttachment(
          getAgentKbTenant(request),
          request.params.chunkId,
          request.body,
        ),
      );
    },
  );

  app.post<{ Body: KbAttachmentBatchDeleteRequest }>(
    "/api/server/ai-hosting/kb-attachments/batch-delete",
    {
      preHandler: app.authenticate,
      schema: {
        body: KbAttachmentBatchDeleteRequestSchema,
      },
    },
    async (request) => {
      assertAiHostingWriteAccess(request);

      return apiSuccess(
        await getKbAttachmentService(app).batchDeleteAttachments(
          getAgentKbTenant(request),
          request.body.chunkIds,
        ),
      );
    },
  );

  app.post<{ Params: KbAttachmentParams }>(
    "/api/server/ai-hosting/kb-attachments/:chunkId/delete",
    {
      preHandler: app.authenticate,
      schema: {
        params: KbAttachmentParamsSchema,
      },
    },
    async (request) => {
      assertAiHostingWriteAccess(request);

      return apiSuccess(
        await getKbAttachmentService(app).deleteAttachment(
          getAgentKbTenant(request),
          request.params.chunkId,
        ),
      );
    },
  );
}

function getKbAttachmentService(app: FastifyInstance) {
  return new KbAttachmentService(app.db, app.log, createAgentKbJavaClient(app.log));
}

function parseOptionalInteger(value?: string) {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function assertAiHostingWriteAccess(request: FastifyRequest) {
  const roles = request.user?.roles ?? [];

  if (roles.includes("owner") || roles.includes("admin")) {
    return;
  }

  throw new ForbiddenError("FORBIDDEN", "当前账号无操作权限");
}
