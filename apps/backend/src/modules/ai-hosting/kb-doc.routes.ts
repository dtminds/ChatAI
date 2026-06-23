import {
  apiSuccess,
  KbDocCreateRequestSchema,
  type KbDocCreateRequest,
} from "@chatai/contracts";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { ForbiddenError } from "../../shared/errors.js";
import { KbDocService } from "./kb-doc.service.js";

export async function registerAiHostingRoutes(app: FastifyInstance) {
  app.post(
    "/api/server/ai-hosting/kb-docs/upload-credential",
    {
      preHandler: app.authenticate,
    },
    async (request) => {
      assertAiHostingWriteAccess(request);

      return apiSuccess(
        await getKbDocService(app).getUploadCredential(getSubUserId(request)),
      );
    },
  );

  app.post<{ Body: KbDocCreateRequest }>(
    "/api/server/ai-hosting/kb-docs/create",
    {
      preHandler: app.authenticate,
      schema: {
        body: KbDocCreateRequestSchema,
      },
    },
    async (request) => {
      assertAiHostingWriteAccess(request);

      return apiSuccess(
        await getKbDocService(app).createKbDoc(
          getSubUserId(request),
          request.body,
        ),
      );
    },
  );
}

function getKbDocService(app: FastifyInstance) {
  return new KbDocService(app.db, app.log);
}

function getSubUserId(request: { user?: { subUserId: string } }) {
  return request.user?.subUserId ?? "";
}

function assertAiHostingWriteAccess(request: FastifyRequest) {
  if (request.user?.roles?.[0] === "viewer") {
    throw new ForbiddenError("FORBIDDEN", "当前账号无操作权限");
  }
}
