import {
  CustomerResponseAssistanceMutationRequestSchema,
  CustomerResponsePreflightRequestSchema,
  type CustomerResponseAssistanceMutationRequest,
  type CustomerResponsePreflightRequest,
} from "@chatai/contracts";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { ForbiddenError } from "../../shared/errors.js";
import { withRequestId } from "../../shared/logger.js";
import { getAuthenticatedWorkbenchScope } from "../workbench-platform-scope.js";
import type { WorkbenchService } from "./workbench.service.js";

export async function registerCustomerResponsePreflightRoutes(
  app: FastifyInstance,
) {
  app.post<{ Body: CustomerResponsePreflightRequest }>(
    "/api/server/customer-response-preflight",
    {
      preHandler: app.authenticate,
      schema: { body: CustomerResponsePreflightRequestSchema },
    },
    async (request, reply) => {
      assertPreflightAccess(request);
      const subUserId = request.user?.subUserId ?? "";
      await getWorkbenchService(app, request).assertConversationOperable(
        subUserId,
        request.body.conversationId,
      );

      const abortController = new AbortController();
      const abortOnRequestAborted = () => abortController.abort();
      const abortOnResponseClosed = () => {
        if (!reply.raw.writableEnded) {
          abortController.abort();
        }
      };

      request.raw.once("aborted", abortOnRequestAborted);
      reply.raw.once("close", abortOnResponseClosed);

      try {
        return await app.customerResponsePreflightService.assess(
          request.user.uid,
          request.body,
          abortController.signal,
        );
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        throw error;
      } finally {
        request.raw.off("aborted", abortOnRequestAborted);
        reply.raw.off("close", abortOnResponseClosed);
      }
    },
  );

  app.post<{ Body: CustomerResponseAssistanceMutationRequest }>(
    "/api/server/customer-response-preflight/assistance",
    {
      preHandler: app.authenticate,
      schema: { body: CustomerResponseAssistanceMutationRequestSchema },
    },
    async (request) => {
      assertPreflightAccess(request);
      const subUserId = request.user?.subUserId ?? "";
      await getWorkbenchService(app, request).assertConversationOperable(
        subUserId,
        request.body.conversationId,
      );

      return app.customerResponsePreflightService.mutateAssistance(
        request.user.uid,
        subUserId,
        request.body,
      );
    },
  );
}

function assertPreflightAccess(request: FastifyRequest) {
  if (request.user?.roles?.[0] === "viewer") {
    throw new ForbiddenError("FORBIDDEN", "无权限访问");
  }
}

function getWorkbenchService(
  app: FastifyInstance,
  request: FastifyRequest,
): WorkbenchService {
  return app.createWorkbenchService?.(
    withRequestId(request.log, request.id),
    getAuthenticatedWorkbenchScope(request.user),
  ) ?? app.workbenchService;
}
