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
import type { AgentKbTenant } from "./kb-tenant-utils.js";

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
        await getKbChunkService(app).addKbChunk(getAgentKbTenant(request), request.body),
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
          getAgentKbTenant(request),
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
          getAgentKbTenant(request),
          request.params.chunkId,
        ),
      );
    },
  );
}

function getKbChunkService(app: FastifyInstance) {
  return new KbChunkService(app.db, app.log, createAgentKbJavaClient(app.log));
}

function getAgentKbTenant(request: { user: { subUserId: string; uid: number } }): AgentKbTenant {
  return {
    subUserId: request.user.subUserId,
    uid: request.user.uid,
  };
}

function assertAiHostingWriteAccess(request: FastifyRequest) {
  const roles = request.user?.roles ?? [];

  if (roles.includes("owner") || roles.includes("admin")) {
    return;
  }

  throw new ForbiddenError("FORBIDDEN", "当前账号无操作权限");
}
