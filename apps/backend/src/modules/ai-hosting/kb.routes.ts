import {
  apiSuccess,
  KB_SEARCH_QUERY_MAX_LENGTH,
  KbCreateRequestSchema,
  KbDocTypeSchema,
  KbUpdateRequestSchema,
  type KbCreateRequest,
  type KbDocType,
  type KbUpdateRequest,
} from "@chatai/contracts";
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { ForbiddenError } from "../../shared/errors.js";
import { createKbReadService } from "./kb-read.service.js";
import { createKbWriteService } from "./kb-write.service.js";
import { getAgentKbTenant } from "./kb-tenant-utils.js";

const NumericStringSchema = Type.String({ pattern: "^[0-9]+$" });
const ChunkDisplayIdSchema = Type.String({
  maxLength: KB_SEARCH_QUERY_MAX_LENGTH,
  pattern: "^[^_]+$",
});

const KbListQuerySchema = Type.Object({
  page: Type.Optional(NumericStringSchema),
  pageSize: Type.Optional(NumericStringSchema),
  query: Type.Optional(Type.String({ maxLength: KB_SEARCH_QUERY_MAX_LENGTH })),
});

const KbParamsSchema = Type.Object({
  kbId: NumericStringSchema,
});

const KbDocListQuerySchema = Type.Object({
  docType: Type.Optional(KbDocTypeSchema),
  page: Type.Optional(NumericStringSchema),
  pageSize: Type.Optional(NumericStringSchema),
  query: Type.Optional(Type.String({ maxLength: KB_SEARCH_QUERY_MAX_LENGTH })),
});

const KbDocParamsSchema = Type.Object({
  docId: NumericStringSchema,
});

const KbDocChunkListQuerySchema = Type.Object({
  chunkId: Type.Optional(ChunkDisplayIdSchema),
  content: Type.Optional(Type.String({ maxLength: KB_SEARCH_QUERY_MAX_LENGTH })),
  docType: KbDocTypeSchema,
  entryId: Type.Optional(NumericStringSchema),
  page: Type.Optional(NumericStringSchema),
  pageSize: Type.Optional(NumericStringSchema),
  title: Type.Optional(Type.String({ maxLength: KB_SEARCH_QUERY_MAX_LENGTH })),
});

type KbListQuery = Static<typeof KbListQuerySchema>;
type KbParams = Static<typeof KbParamsSchema>;
type KbDocListQuery = Static<typeof KbDocListQuerySchema>;
type KbDocParams = Static<typeof KbDocParamsSchema>;
type KbDocChunkListQuery = Static<typeof KbDocChunkListQuerySchema>;

export async function registerKbRoutes(app: FastifyInstance) {
  app.post<{ Body: KbCreateRequest }>(
    "/api/server/ai-hosting/kbs",
    {
      preHandler: app.authenticate,
      schema: {
        body: KbCreateRequestSchema,
      },
    },
    async (request) => {
      assertAiHostingWriteAccess(request);

      return apiSuccess(
        await createKbWriteService(app.db, app.log).createKb(getAgentKbTenant(request), request.body),
      );
    },
  );

  app.post<{ Params: KbParams; Body: KbUpdateRequest }>(
    "/api/server/ai-hosting/kbs/:kbId/update",
    {
      preHandler: app.authenticate,
      schema: {
        body: KbUpdateRequestSchema,
        params: KbParamsSchema,
      },
    },
    async (request) => {
      assertAiHostingWriteAccess(request);

      return apiSuccess(
        await createKbWriteService(app.db, app.log).updateKb(
          getAgentKbTenant(request),
          request.params.kbId,
          request.body,
        ),
      );
    },
  );

  app.get<{ Params: KbParams }>(
    "/api/server/ai-hosting/kbs/:kbId/delete-check",
    {
      preHandler: app.authenticate,
      schema: {
        params: KbParamsSchema,
      },
    },
    async (request) => {
      assertAiHostingWriteAccess(request);

      return apiSuccess(
        await createKbWriteService(app.db, app.log).checkKbDelete(
          getAgentKbTenant(request),
          request.params.kbId,
        ),
      );
    },
  );

  app.post<{ Params: KbParams }>(
    "/api/server/ai-hosting/kbs/:kbId/delete",
    {
      preHandler: app.authenticate,
      schema: {
        params: KbParamsSchema,
      },
    },
    async (request) => {
      assertAiHostingWriteAccess(request);

      return apiSuccess(
        await createKbWriteService(app.db, app.log).deleteKb(
          getAgentKbTenant(request),
          request.params.kbId,
        ),
      );
    },
  );

  app.get<{ Querystring: KbListQuery }>(
    "/api/server/ai-hosting/kbs",
    {
      preHandler: app.authenticate,
      schema: {
        querystring: KbListQuerySchema,
      },
    },
    async (request) => {
      return apiSuccess(
        await createKbReadService(app.db, app.log).listKbs(getAgentKbTenant(request), {
          page: parseOptionalInteger(request.query.page),
          pageSize: parseOptionalInteger(request.query.pageSize),
          query: request.query.query,
        }),
      );
    },
  );

  app.get<{ Params: KbParams }>(
    "/api/server/ai-hosting/kbs/:kbId",
    {
      preHandler: app.authenticate,
      schema: {
        params: KbParamsSchema,
      },
    },
    async (request) => {
      return apiSuccess(
        await createKbReadService(app.db, app.log).getKb(
          getAgentKbTenant(request),
          request.params.kbId,
        ),
      );
    },
  );

  app.get<{ Params: KbParams; Querystring: KbDocListQuery }>(
    "/api/server/ai-hosting/kbs/:kbId/docs",
    {
      preHandler: app.authenticate,
      schema: {
        params: KbParamsSchema,
        querystring: KbDocListQuerySchema,
      },
    },
    async (request) => {
      return apiSuccess(
        await createKbReadService(app.db, app.log).listKbDocs(
          getAgentKbTenant(request),
          request.params.kbId,
          {
            docType: request.query.docType as KbDocType | undefined,
            page: parseOptionalInteger(request.query.page),
            pageSize: parseOptionalInteger(request.query.pageSize),
            query: request.query.query,
          },
        ),
      );
    },
  );

  app.get<{ Params: KbDocParams }>(
    "/api/server/ai-hosting/kb-docs/:docId",
    {
      preHandler: app.authenticate,
      schema: {
        params: KbDocParamsSchema,
      },
    },
    async (request) => {
      return apiSuccess(
        await createKbReadService(app.db, app.log).getKbDoc(
          getAgentKbTenant(request),
          request.params.docId,
        ),
      );
    },
  );

  app.get<{ Params: KbDocParams; Querystring: KbDocChunkListQuery }>(
    "/api/server/ai-hosting/kb-docs/:docId/chunks",
    {
      preHandler: app.authenticate,
      schema: {
        params: KbDocParamsSchema,
        querystring: KbDocChunkListQuerySchema,
      },
    },
    async (request) => {
      return apiSuccess(
        await createKbReadService(app.db, app.log).listKbDocChunks(
          getAgentKbTenant(request),
          request.params.docId,
          {
            chunkId: request.query.chunkId,
            page: parseOptionalInteger(request.query.page),
            pageSize: parseOptionalInteger(request.query.pageSize),
            content: request.query.content,
            docType: request.query.docType,
            entryId: request.query.entryId,
            title: request.query.title,
          },
        ),
      );
    },
  );
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
