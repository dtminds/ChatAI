import {
  apiSuccess,
  SettingsManagedAccountSubAccountsUpdateRequestSchema,
  SettingsManagedAccountSyncSeatGroupsRequestSchema,
  SettingsSidebarItemCreateRequestSchema,
  SettingsSidebarItemsSortUpdateRequestSchema,
  SettingsSidebarItemStatusUpdateRequestSchema,
  SettingsSidebarItemUpdateRequestSchema,
  SettingsSubAccountCreateRequestSchema,
  SettingsSubAccountStatusUpdateRequestSchema,
  SettingsSubAccountUpdateRequestSchema,
  type SettingsManagedAccountSubAccountsUpdateRequest,
  type SettingsManagedAccountSyncSeatGroupsRequest,
  type SettingsSidebarItemCreateRequest,
  type SettingsSidebarItemsSortUpdateRequest,
  type SettingsSidebarItemStatusUpdateRequest,
  type SettingsSidebarItemUpdateRequest,
  type SettingsSubAccountCreateRequest,
  type SettingsSubAccountStatusUpdateRequest,
  type SettingsSubAccountUpdateRequest,
} from "@chatai/contracts";
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { ForbiddenError } from "../../shared/errors.js";
import { getAuthenticatedWorkbenchScope } from "../workbench-platform-scope.js";
import { createWorkbenchJavaClient } from "../chat/workbench-java-client.js";
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
  app.get("/api/server/settings/managed-accounts", {
    preHandler: app.authenticate,
  }, async (request) => {
    return apiSuccess(
      await createManagedAccountSettingsService(app.db, app.cache, app.cacheKeys).list(
        getSettingsScope(request),
      ),
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
        await createManagedAccountSettingsService(app.db, app.cache, app.cacheKeys).updateSubAccounts(
          getSettingsScope(request),
          request.params.managedAccountId,
          request.body,
        ),
      );
    },
  );

  app.post<{
    Body: SettingsManagedAccountSyncSeatGroupsRequest;
    Params: ManagedAccountParams;
  }>(
    "/api/server/settings/managed-accounts/:managedAccountId/sync-seat-groups",
    {
      preHandler: app.authenticate,
      schema: {
        body: SettingsManagedAccountSyncSeatGroupsRequestSchema,
        params: ManagedAccountParamsSchema,
      },
    },
    async (request) => {
      assertSettingsManage(request);
      return apiSuccess(
        await createManagedAccountSettingsService(app.db, app.cache, app.cacheKeys).syncSeatGroups(
          getSettingsScope(request),
          request.params.managedAccountId,
          request.body,
          createWorkbenchJavaClient(app.log),
        ),
      );
    },
  );

  app.get("/api/server/settings/sub-accounts", {
    preHandler: app.authenticate,
  }, async (request) => {
    return apiSuccess(
      await createSubAccountSettingsService(app.db, app.cache, app.cacheKeys).list(
        getSettingsScope(request),
      ),
    );
  });

  app.get("/api/server/settings/sidebar-items", {
    preHandler: app.authenticate,
  }, async (request) => {
    return apiSuccess(
      await createSidebarItemsSettingsService(app.db).list(getSettingsScope(request)),
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
          getSettingsScope(request),
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
          getSettingsScope(request),
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
          getSettingsScope(request),
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
          getSettingsScope(request),
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
          getSettingsScope(request),
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
        await createSubAccountSettingsService(app.db, app.cache, app.cacheKeys).create(
          getSettingsScope(request),
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
        await createSubAccountSettingsService(app.db, app.cache, app.cacheKeys).update(
          getSettingsScope(request),
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
        await createSubAccountSettingsService(app.db, app.cache, app.cacheKeys).updateStatus(
          getSettingsScope(request),
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
        await createSubAccountSettingsService(app.db, app.cache, app.cacheKeys).remove(
          getSettingsScope(request),
          request.params.subAccountId,
        ),
      );
    },
  );
}

function getSettingsScope(request: FastifyRequest) {
  return getAuthenticatedWorkbenchScope(request.user);
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
