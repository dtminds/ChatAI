import {
  apiSuccess,
  SettingsManagedAccountSubAccountsUpdateRequestSchema,
  SettingsSubAccountCreateRequestSchema,
  SettingsSubAccountStatusUpdateRequestSchema,
  SettingsSubAccountUpdateRequestSchema,
  type SettingsManagedAccountSubAccountsUpdateRequest,
  type SettingsSubAccountCreateRequest,
  type SettingsSubAccountStatusUpdateRequest,
  type SettingsSubAccountUpdateRequest,
} from "@chatai/contracts";
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { createManagedAccountSettingsService } from "./managed-accounts.service.js";
import { createSubAccountSettingsService } from "./sub-accounts.service.js";

const SubAccountParamsSchema = Type.Object({
  subAccountId: Type.String(),
});

const ManagedAccountParamsSchema = Type.Object({
  managedAccountId: Type.String(),
});

type SubAccountParams = Static<typeof SubAccountParamsSchema>;
type ManagedAccountParams = Static<typeof ManagedAccountParamsSchema>;

export async function registerSettingsRoutes(app: FastifyInstance) {
  app.get("/api/server/settings/managed-accounts", {
    preHandler: app.authenticate,
  }, async (request) =>
    apiSuccess(
      await createManagedAccountSettingsService(app.db).list(getSubUserId(request)),
    ),
  );

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
    async (request) =>
      apiSuccess(
        await createManagedAccountSettingsService(app.db).updateSubAccounts(
          getSubUserId(request),
          request.params.managedAccountId,
          request.body,
        ),
      ),
  );

  app.get("/api/server/settings/sub-accounts", {
    preHandler: app.authenticate,
  }, async (request) =>
    apiSuccess(
      await createSubAccountSettingsService(app.db).list(getSubUserId(request)),
    ),
  );

  app.post<{ Body: SettingsSubAccountCreateRequest }>(
    "/api/server/settings/sub-accounts",
    {
      preHandler: app.authenticate,
      schema: {
        body: SettingsSubAccountCreateRequestSchema,
      },
    },
    async (request) =>
      apiSuccess(
        await createSubAccountSettingsService(app.db).create(
          getSubUserId(request),
          request.body,
        ),
      ),
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
    async (request) =>
      apiSuccess(
        await createSubAccountSettingsService(app.db).update(
          getSubUserId(request),
          request.params.subAccountId,
          request.body,
        ),
      ),
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
    async (request) =>
      apiSuccess(
        await createSubAccountSettingsService(app.db).updateStatus(
          getSubUserId(request),
          request.params.subAccountId,
          request.body.status,
        ),
      ),
  );

  app.delete<{ Params: SubAccountParams }>(
    "/api/server/settings/sub-accounts/:subAccountId",
    {
      preHandler: app.authenticate,
      schema: {
        params: SubAccountParamsSchema,
      },
    },
    async (request) =>
      apiSuccess(
        await createSubAccountSettingsService(app.db).remove(
          getSubUserId(request),
          request.params.subAccountId,
        ),
      ),
  );
}

function getSubUserId(request: { user?: { subUserId: string } }) {
  return request.user?.subUserId ?? "";
}
