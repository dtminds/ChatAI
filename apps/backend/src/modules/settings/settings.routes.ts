import {
  apiSuccess,
  SettingsManagedAccountSubAccountsUpdateRequestSchema,
  SettingsManagedAccountsQuerySchema,
  SettingsSidebarItemCreateRequestSchema,
  SettingsSidebarItemsSortUpdateRequestSchema,
  SettingsSidebarItemStatusUpdateRequestSchema,
  SettingsSidebarItemUpdateRequestSchema,
  SettingsSubAccountsQuerySchema,
  SettingsSubAccountCreateRequestSchema,
  SettingsSubAccountStatusUpdateRequestSchema,
  SettingsSubAccountUpdateRequestSchema,
  type SettingsManagedAccountSubAccountsUpdateRequest,
  type SettingsManagedAccountsQuery,
  type SettingsSidebarItemCreateRequest,
  type SettingsSidebarItemsSortUpdateRequest,
  type SettingsSidebarItemStatusUpdateRequest,
  type SettingsSidebarItemUpdateRequest,
  type SettingsSubAccountsQuery,
  type SettingsSubAccountCreateRequest,
  type SettingsSubAccountStatusUpdateRequest,
  type SettingsSubAccountUpdateRequest,
} from "@chatai/contracts";
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { ForbiddenError } from "../../shared/errors.js";
import { createManagedAccountSettingsService } from "./managed-accounts.service.js";
import { createSidebarItemsSettingsService } from "./sidebar-items.service.js";
import { createSubAccountSettingsService } from "./sub-accounts.service.js";

const SubAccountParamsSchema = Type.Object({
  subAccountId: Type.String(),
});

const ManagedAccountParamsSchema = Type.Object({
  managedAccountId: Type.String(),
});

const SidebarItemParamsSchema = Type.Object({
  sidebarItemId: Type.String(),
});

type SubAccountParams = Static<typeof SubAccountParamsSchema>;
type ManagedAccountParams = Static<typeof ManagedAccountParamsSchema>;
type SidebarItemParams = Static<typeof SidebarItemParamsSchema>;

export async function registerSettingsRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: SettingsManagedAccountsQuery;
  }>("/api/server/settings/managed-accounts", {
    preHandler: app.authenticate,
    schema: {
      querystring: SettingsManagedAccountsQuerySchema,
    },
  }, async (request) => {
    return apiSuccess(
      await createManagedAccountSettingsService(app.db).list(getSubUserId(request), {
        keyword: request.query.keyword,
        page: request.query.page,
      }),
    );
  });

  app.put<{
    Body: SettingsManagedAccountSubAccountsUpdateRequest;
    Params: ManagedAccountParams;
  }>(
    "/api/server/settings/managed-accounts/:managedAccountId/sub-accounts",
    {
      preHandler: app.authenticate,
      schema: {
        body: SettingsManagedAccountSubAccountsUpdateRequestSchema,
        params: ManagedAccountParamsSchema,
      },
    },
    async (request) => {
      assertSettingsManage(request);
      return apiSuccess(
        await createManagedAccountSettingsService(app.db).updateSubAccounts(
          getSubUserId(request),
          request.params.managedAccountId,
          request.body,
        ),
      );
    },
  );

  app.get<{
    Querystring: SettingsSubAccountsQuery;
  }>("/api/server/settings/sub-accounts", {
    preHandler: app.authenticate,
    schema: {
      querystring: SettingsSubAccountsQuerySchema,
    },
  }, async (request) => {
    return apiSuccess(
      await createSubAccountSettingsService(app.db).list(getSubUserId(request), {
        keyword: request.query.keyword,
        page: request.query.page,
      }),
    );
  });

  app.get("/api/server/settings/sidebar-items", {
    preHandler: app.authenticate,
  }, async (request) => {
    return apiSuccess(
      await createSidebarItemsSettingsService(app.db).list(getSubUserId(request)),
    );
  });

  app.post<{ Body: SettingsSidebarItemCreateRequest }>(
    "/api/server/settings/sidebar-items",
    {
      preHandler: app.authenticate,
      schema: {
        body: SettingsSidebarItemCreateRequestSchema,
      },
    },
    async (request) => {
      assertSettingsManage(request);
      return apiSuccess(
        await createSidebarItemsSettingsService(app.db).create(
          getSubUserId(request),
          request.body,
        ),
      );
    },
  );

  app.put<{
    Body: SettingsSidebarItemsSortUpdateRequest;
  }>(
    "/api/server/settings/sidebar-items/sort",
    {
      preHandler: app.authenticate,
      schema: {
        body: SettingsSidebarItemsSortUpdateRequestSchema,
      },
    },
    async (request) => {
      assertSettingsManage(request);
      return apiSuccess(
        await createSidebarItemsSettingsService(app.db).updateSort(
          getSubUserId(request),
          request.body,
        ),
      );
    },
  );

  app.put<{
    Body: SettingsSidebarItemUpdateRequest;
    Params: SidebarItemParams;
  }>(
    "/api/server/settings/sidebar-items/:sidebarItemId",
    {
      preHandler: app.authenticate,
      schema: {
        body: SettingsSidebarItemUpdateRequestSchema,
        params: SidebarItemParamsSchema,
      },
    },
    async (request) => {
      assertSettingsManage(request);
      return apiSuccess(
        await createSidebarItemsSettingsService(app.db).update(
          getSubUserId(request),
          request.params.sidebarItemId,
          request.body,
        ),
      );
    },
  );

  app.patch<{
    Body: SettingsSidebarItemStatusUpdateRequest;
    Params: SidebarItemParams;
  }>(
    "/api/server/settings/sidebar-items/:sidebarItemId/status",
    {
      preHandler: app.authenticate,
      schema: {
        body: SettingsSidebarItemStatusUpdateRequestSchema,
        params: SidebarItemParamsSchema,
      },
    },
    async (request) => {
      assertSettingsManage(request);
      return apiSuccess(
        await createSidebarItemsSettingsService(app.db).updateStatus(
          getSubUserId(request),
          request.params.sidebarItemId,
          request.body.status,
        ),
      );
    },
  );

  app.delete<{ Params: SidebarItemParams }>(
    "/api/server/settings/sidebar-items/:sidebarItemId",
    {
      preHandler: app.authenticate,
      schema: {
        params: SidebarItemParamsSchema,
      },
    },
    async (request) => {
      assertSettingsManage(request);
      return apiSuccess(
        await createSidebarItemsSettingsService(app.db).remove(
          getSubUserId(request),
          request.params.sidebarItemId,
        ),
      );
    },
  );

  app.post<{ Body: SettingsSubAccountCreateRequest }>(
    "/api/server/settings/sub-accounts",
    {
      preHandler: app.authenticate,
      schema: {
        body: SettingsSubAccountCreateRequestSchema,
      },
    },
    async (request) => {
      assertSettingsManage(request);
      return apiSuccess(
        await createSubAccountSettingsService(app.db).create(
          getSubUserId(request),
          request.body,
        ),
      );
    },
  );

  app.put<{
    Body: SettingsSubAccountUpdateRequest;
    Params: SubAccountParams;
  }>(
    "/api/server/settings/sub-accounts/:subAccountId",
    {
      preHandler: app.authenticate,
      schema: {
        body: SettingsSubAccountUpdateRequestSchema,
        params: SubAccountParamsSchema,
      },
    },
    async (request) => {
      assertSettingsManage(request);
      return apiSuccess(
        await createSubAccountSettingsService(app.db).update(
          getSubUserId(request),
          request.params.subAccountId,
          request.body,
        ),
      );
    },
  );

  app.patch<{
    Body: SettingsSubAccountStatusUpdateRequest;
    Params: SubAccountParams;
  }>(
    "/api/server/settings/sub-accounts/:subAccountId/status",
    {
      preHandler: app.authenticate,
      schema: {
        body: SettingsSubAccountStatusUpdateRequestSchema,
        params: SubAccountParamsSchema,
      },
    },
    async (request) => {
      assertSettingsManage(request);
      return apiSuccess(
        await createSubAccountSettingsService(app.db).updateStatus(
          getSubUserId(request),
          request.params.subAccountId,
          request.body.status,
        ),
      );
    },
  );

  app.delete<{ Params: SubAccountParams }>(
    "/api/server/settings/sub-accounts/:subAccountId",
    {
      preHandler: app.authenticate,
      schema: {
        params: SubAccountParamsSchema,
      },
    },
    async (request) => {
      assertSettingsManage(request);
      return apiSuccess(
        await createSubAccountSettingsService(app.db).remove(
          getSubUserId(request),
          request.params.subAccountId,
        ),
      );
    },
  );
}

function getSubUserId(request: { user?: { subUserId: string } }) {
  return request.user?.subUserId ?? "";
}

function assertSettingsAccess(request: FastifyRequest) {
  const role = request.user?.roles?.[0];

  if (role === "owner" || role === "admin") {
    return;
  }

  throw new ForbiddenError("FORBIDDEN", "无权限访问");
}

function assertSettingsManage(request: FastifyRequest) {
  assertSettingsAccess(request);
}
