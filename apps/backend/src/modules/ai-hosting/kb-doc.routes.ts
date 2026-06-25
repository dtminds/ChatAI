import {
  apiSuccess,
  KbDocCreateFaqRequestSchema,
  KbDocCreateImageRequestSchema,
  KbDocCreateRequestSchema,
  type KbDocCreateFaqRequest,
  type KbDocCreateImageRequest,
  type KbDocCreateRequest,
} from "@chatai/contracts";
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { ForbiddenError } from "../../shared/errors.js";
import { createAgentKbJavaClient } from "./agent-kb-java-client.js";
import { createWorkbenchJavaClient } from "../chat/workbench-java-client.js";
import { KbDocService } from "./kb-doc.service.js";

const NumericStringSchema = Type.String({ pattern: "^[0-9]+$" });

const KbDocParamsSchema = Type.Object({
  docId: NumericStringSchema,
});

type KbDocParams = Static<typeof KbDocParamsSchema>;

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
        await getKbDocService(app).createKbDoc(getSubUserId(request), request.body),
      );
    },
  );

  app.post<{ Body: KbDocCreateFaqRequest }>(
    "/api/server/ai-hosting/kb-docs/create-faq",
    {
      preHandler: app.authenticate,
      schema: {
        body: KbDocCreateFaqRequestSchema,
      },
    },
    async (request) => {
      assertAiHostingWriteAccess(request);

      return apiSuccess(
        await getKbDocService(app).createKbFaqDoc(getSubUserId(request), request.body),
      );
    },
  );

  app.post<{ Body: KbDocCreateImageRequest }>(
    "/api/server/ai-hosting/kb-docs/create-image",
    {
      preHandler: app.authenticate,
      schema: {
        body: KbDocCreateImageRequestSchema,
      },
    },
    async (request) => {
      assertAiHostingWriteAccess(request);

      return apiSuccess(
        await getKbDocService(app).createKbImageDoc(getSubUserId(request), request.body),
      );
    },
  );

  app.post<{ Params: KbDocParams }>(
    "/api/server/ai-hosting/kb-docs/:docId/delete",
    {
      preHandler: app.authenticate,
      schema: {
        params: KbDocParamsSchema,
      },
    },
    async (request) => {
      assertAiHostingWriteAccess(request);

      return apiSuccess(
        await getKbDocService(app).deleteKbDoc(
          getSubUserId(request),
          request.params.docId,
        ),
      );
    },
  );
}

function getKbDocService(app: FastifyInstance) {
  return new KbDocService(
    app.db,
    app.log,
    createWorkbenchJavaClient(app.log),
    createAgentKbJavaClient(app.log),
  );
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
