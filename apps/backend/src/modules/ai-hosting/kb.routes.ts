import {
  apiSuccess,
  KB_SEARCH_QUERY_MAX_LENGTH,
  KbCreateRequestSchema,
  KbDocTypeSchema,
  type KbCreateRequest,
  type KbDocType,
} from "@chatai/contracts";
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { ForbiddenError } from "../../shared/errors.js";
import { createKbReadService } from "./kb-read.service.js";
import { createKbWriteService } from "./kb-write.service.js";
import { getAgentKbTenant } from "./kb-tenant-utils.js";

const NumericStringSchema = Type.String({ pattern: "^[0-9]+$" });

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
  page: Type.Optional(NumericStringSchema),
  pageSize: Type.Optional(NumericStringSchema),
  title: Type.Optional(Type.String()),
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
        await createKbWriteService(app.db).createKb(getAgentKbTenant(request), request.body),
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
            page: parseOptionalInteger(request.query.page),
            pageSize: parseOptionalInteger(request.query.pageSize),
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
