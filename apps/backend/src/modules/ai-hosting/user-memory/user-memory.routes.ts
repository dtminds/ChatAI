import {
  AgentUserMemoryManualCreateRequestSchema,
  AgentUserMemoryManualDeleteRequestSchema,
  AgentUserMemoryManualUpdateRequestSchema,
  AgentUserMemorySettingsRequestSchema,
  apiSuccess,
  type AgentUserMemoryManualCreateRequest,
  type AgentUserMemoryManualDeleteRequest,
  type AgentUserMemoryManualUpdateRequest,
  type AgentUserMemorySettingsRequest,
} from "@chatai/contracts";
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { ForbiddenError, NotFoundError } from "../../../shared/errors.js";
import { withRequestId } from "../../../shared/logger.js";
import { getAuthenticatedWorkbenchScope } from "../../workbench-platform-scope.js";
import { createUserMemoryService } from "./user-memory-service.js";

const NumericStringSchema = Type.String({ pattern: "^[0-9]+$" });
const RunParamsSchema = Type.Object({ runId: NumericStringSchema });
const CustomerParamsSchema = Type.Object({ thirdExternalUserId: Type.String({ minLength: 1, maxLength: 128 }) });
const CustomerItemParamsSchema = Type.Object({ thirdExternalUserId: Type.String({ minLength: 1, maxLength: 128 }), itemId: NumericStringSchema });
const PlatformQuerySchema = Type.Object({ platform: NumericStringSchema });
const RunsQuerySchema = Type.Object({ cursor: Type.Optional(Type.String()), pageSize: Type.Optional(NumericStringSchema) });
const RunDetailQuerySchema = Type.Object({ itemCursor: Type.Optional(Type.String()), itemPageSize: Type.Optional(NumericStringSchema), status: Type.Optional(Type.String()) });
const CustomersQuerySchema = Type.Object({ cursor: Type.Optional(Type.String()), pageSize: Type.Optional(NumericStringSchema), query: Type.Optional(Type.String()) });

type RunParams = Static<typeof RunParamsSchema>;
type CustomerParams = Static<typeof CustomerParamsSchema>;
type CustomerItemParams = Static<typeof CustomerItemParamsSchema>;
type PlatformQuery = Static<typeof PlatformQuerySchema>;
type RunsQuery = Static<typeof RunsQuerySchema>;
type RunDetailQuery = Static<typeof RunDetailQuerySchema>;
type CustomersQuery = Static<typeof CustomersQuerySchema>;

export async function registerUserMemoryRoutes(app: FastifyInstance) {
  app.get("/api/server/ai-hosting/user-memory/overview", { preHandler: app.authenticate }, async (request) =>
    apiSuccess(await createService(app, request).getOverview(request.user.uid)));

  app.put<{ Body: AgentUserMemorySettingsRequest }>("/api/server/ai-hosting/user-memory/settings", {
    preHandler: app.authenticate, schema: { body: AgentUserMemorySettingsRequestSchema },
  }, async (request) => {
    assertManage(request);
    return apiSuccess(await createService(app, request).updateSettings(request.user.uid, request.body.enabled));
  });

  app.get<{ Querystring: RunsQuery }>("/api/server/ai-hosting/user-memory/runs", {
    preHandler: app.authenticate, schema: { querystring: RunsQuerySchema },
  }, async (request) => apiSuccess(await createService(app, request).listRuns(request.user.uid, {
    cursor: request.query.cursor, pageSize: parseOptionalInteger(request.query.pageSize),
  })));

  app.get<{ Params: RunParams; Querystring: RunDetailQuery }>("/api/server/ai-hosting/user-memory/runs/:runId", {
    preHandler: app.authenticate, schema: { params: RunParamsSchema, querystring: RunDetailQuerySchema },
  }, async (request) => apiSuccess(await createService(app, request).getRunDetail(request.user.uid, Number(request.params.runId), {
    itemCursor: request.query.itemCursor, itemPageSize: parseOptionalInteger(request.query.itemPageSize), status: request.query.status,
  })));

  app.post<{ Params: RunParams }>("/api/server/ai-hosting/user-memory/runs/:runId/retry-failed", {
    preHandler: app.authenticate, schema: { params: RunParamsSchema },
  }, async (request) => {
    assertManage(request);
    return apiSuccess(await createService(app, request).retryFailed(request.user.uid, Number(request.params.runId)));
  });

  app.get<{ Querystring: CustomersQuery }>("/api/server/ai-hosting/user-memory/customers", {
    preHandler: app.authenticate, schema: { querystring: CustomersQuerySchema },
  }, async (request) => apiSuccess(await createService(app, request).listCustomers(request.user.uid, request.user.subUserId, request.user.roles ?? [], {
    cursor: request.query.cursor, pageSize: parseOptionalInteger(request.query.pageSize), query: request.query.query,
  })));

  app.get<{ Params: CustomerParams; Querystring: PlatformQuery }>("/api/server/ai-hosting/user-memory/customers/:thirdExternalUserId", {
    preHandler: app.authenticate, schema: { params: CustomerParamsSchema, querystring: PlatformQuerySchema },
  }, async (request) => {
    const customer = await resolveAccessibleCustomer(app, request, Number(request.query.platform), request.params.thirdExternalUserId);
    return apiSuccess(await createService(app, request).getCustomer(request.user.uid, customer));
  });

  app.get<{ Params: CustomerItemParams; Querystring: PlatformQuery }>("/api/server/ai-hosting/user-memory/customers/:thirdExternalUserId/items/:itemId/evidence", {
    preHandler: app.authenticate, schema: { params: CustomerItemParamsSchema, querystring: PlatformQuerySchema },
  }, async (request) => {
    const customer = await resolveAccessibleCustomer(app, request, Number(request.query.platform), request.params.thirdExternalUserId);
    return apiSuccess(await createService(app, request).getEvidence(request.user.uid, request.user.subUserId, customer, Number(request.params.itemId)));
  });

  app.post<{ Body: AgentUserMemoryManualCreateRequest; Params: CustomerParams; Querystring: PlatformQuery }>("/api/server/ai-hosting/user-memory/customers/:thirdExternalUserId/items", {
    preHandler: app.authenticate, schema: { body: AgentUserMemoryManualCreateRequestSchema, params: CustomerParamsSchema, querystring: PlatformQuerySchema },
  }, async (request) => {
    assertManage(request);
    const customer = await resolveAccessibleCustomer(app, request, Number(request.query.platform), request.params.thirdExternalUserId);
    return apiSuccess(await createService(app, request).createManual(request.user.uid, customer, Number(request.user.subUserId), request.body));
  });

  app.patch<{ Body: AgentUserMemoryManualUpdateRequest; Params: CustomerItemParams; Querystring: PlatformQuery }>("/api/server/ai-hosting/user-memory/customers/:thirdExternalUserId/items/:itemId", {
    preHandler: app.authenticate, schema: { body: AgentUserMemoryManualUpdateRequestSchema, params: CustomerItemParamsSchema, querystring: PlatformQuerySchema },
  }, async (request) => {
    assertManage(request);
    const customer = await resolveAccessibleCustomer(app, request, Number(request.query.platform), request.params.thirdExternalUserId);
    return apiSuccess(await createService(app, request).updateManual(request.user.uid, customer, Number(request.params.itemId), Number(request.user.subUserId), request.body));
  });

  app.delete<{ Body: AgentUserMemoryManualDeleteRequest; Params: CustomerItemParams; Querystring: PlatformQuery }>("/api/server/ai-hosting/user-memory/customers/:thirdExternalUserId/items/:itemId", {
    preHandler: app.authenticate, schema: { body: AgentUserMemoryManualDeleteRequestSchema, params: CustomerItemParamsSchema, querystring: PlatformQuerySchema },
  }, async (request) => {
    assertManage(request);
    const customer = await resolveAccessibleCustomer(app, request, Number(request.query.platform), request.params.thirdExternalUserId);
    return apiSuccess(await createService(app, request).deleteManual(request.user.uid, customer, Number(request.params.itemId), Number(request.user.subUserId), request.body));
  });
}

function createService(app: FastifyInstance, request: FastifyRequest) {
  const workbench = app.createWorkbenchService(withRequestId(request.log, request.id), getAuthenticatedWorkbenchScope(request.user));
  return createUserMemoryService(app.db, workbench);
}
async function resolveAccessibleCustomer(app: FastifyInstance, request: FastifyRequest, platform: number, externalId: string) {
  const workbench = app.createWorkbenchService(withRequestId(request.log, request.id), getAuthenticatedWorkbenchScope(request.user));
  const roles = request.user.roles ?? [];
  const page = await workbench.getCustomers(request.user.subUserId, { keyword: externalId, limit: 100, scope: roles.includes("owner") || roles.includes("admin") ? "all" : "mine" });
  const item = page.items.find((candidate) => candidate.platform === platform && candidate.thirdExternalUserId === externalId);
  if (!item) throw new NotFoundError("AGENT_USER_MEMORY_CUSTOMER_NOT_FOUND", "客户不存在或无权访问");
  return { platform, thirdExternalUserId: externalId, customerName: item.name || item.realName || externalId, ...(item.avatar ? { avatarUrl: item.avatar } : {}) };
}
function assertManage(request: FastifyRequest) {
  const roles = request.user.roles ?? [];
  if (!roles.includes("owner") && !roles.includes("admin")) throw new ForbiddenError("FORBIDDEN", "无权限访问");
}
function parseOptionalInteger(value?: string) { if (!value) return undefined; const parsed = Number(value); return Number.isSafeInteger(parsed) ? parsed : undefined; }
