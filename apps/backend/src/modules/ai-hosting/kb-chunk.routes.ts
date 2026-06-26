import {
  apiSuccess,
  KbChunkCreateRequestSchema,
  KbChunkUpdateRequestSchema,
  type KbChunkCreateRequest,
  type KbChunkUpdateRequest,
} from "@chatai/contracts";
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { ForbiddenError } from "../../shared/errors.js";
import { createAgentKbJavaClient } from "./agent-kb-java-client.js";
import { KbChunkService } from "./kb-chunk.service.js";

const NumericStringSchema = Type.String({ pattern: "^[0-9]+$" });

const KbChunkParamsSchema = Type.Object({
  chunkId: NumericStringSchema,
});

type KbChunkParams = Static<typeof KbChunkParamsSchema>;

export async function registerKbChunkRoutes(app: FastifyInstance) {
  app.post<{ Body: KbChunkCreateRequest }>(
    "/api/server/ai-hosting/kb-chunks",
    {
      preHandler: app.authenticate,
      schema: {
        body: KbChunkCreateRequestSchema,
      },
    },
    async (request) => {
      assertAiHostingWriteAccess(request);

      return apiSuccess(
        await getKbChunkService(app).addKbChunk(getSubUserId(request), request.body),
      );
    },
  );

  app.post<{ Body: KbChunkUpdateRequest; Params: KbChunkParams }>(
    "/api/server/ai-hosting/kb-chunks/:chunkId/update",
    {
      preHandler: app.authenticate,
      schema: {
        body: KbChunkUpdateRequestSchema,
        params: KbChunkParamsSchema,
      },
    },
    async (request) => {
      assertAiHostingWriteAccess(request);

      return apiSuccess(
        await getKbChunkService(app).updateKbChunk(
          getSubUserId(request),
          request.params.chunkId,
          request.body,
        ),
      );
    },
  );

  app.post<{ Params: KbChunkParams }>(
    "/api/server/ai-hosting/kb-chunks/:chunkId/delete",
    {
      preHandler: app.authenticate,
      schema: {
        params: KbChunkParamsSchema,
      },
    },
    async (request) => {
      assertAiHostingWriteAccess(request);

      return apiSuccess(
        await getKbChunkService(app).deleteKbChunk(
          getSubUserId(request),
          request.params.chunkId,
        ),
      );
    },
  );
}

function getKbChunkService(app: FastifyInstance) {
  return new KbChunkService(app.db, app.log, createAgentKbJavaClient(app.log));
}

function getSubUserId(request: { user?: { subUserId: string } }) {
  return request.user?.subUserId ?? "";
}

function assertAiHostingWriteAccess(request: FastifyRequest) {
  const roles = request.user?.roles ?? [];

  if (roles.includes("owner") || roles.includes("admin")) {
    return;
  }

  throw new ForbiddenError("FORBIDDEN", "当前账号无操作权限");
}
