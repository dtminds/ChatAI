import type { AccountPermission, AccountRole, AuthSubUser } from "@chatai/contracts";
import { useEffect, useState } from "react";

import { getAuthSession } from "@/pages/auth/auth-service";

type SettingsPermissionState = {
  canManageManagedAccounts: boolean;
  canManageSidebar: boolean;
  canManageSubAccounts: boolean;
};

const readOnlyPermissions: SettingsPermissionState = {
  canManageManagedAccounts: false,
  canManageSidebar: false,
  canManageSubAccounts: false,
};

export function useSettingsPermissions() {
  const [permissions, setPermissions] =
    useState<SettingsPermissionState>(readOnlyPermissions);

  useEffect(() => {
    let ignore = false;

    async function load() {
      try {
        const response = await getAuthSession();

        if (!ignore) {
          setPermissions(resolveSettingsPermissions(response.data.subUser));
        }
      } catch {
        if (!ignore) {
          setPermissions(readOnlyPermissions);
        }
      }
    }

    void load();

    return () => {
      ignore = true;
    };
  }, []);

  return permissions;
}

function resolveSettingsPermissions(subUser: AuthSubUser): SettingsPermissionState {
  const role = subUser.role;

  return {
    canManageManagedAccounts: canManageByRoleOrPermission(
      role,
      subUser.permissions,
      "settings.managedAccounts.manage",
    ),
    canManageSidebar: canManageByRoleOrPermission(
      role,
      subUser.permissions,
      "settings.sidebar.manage",
    ),
    canManageSubAccounts: canManageByRoleOrPermission(
      role,
      subUser.permissions,
      "settings.subAccounts.manage",
    ),
  };
}

function canManageByRoleOrPermission(
  role: AccountRole,
  permissions: readonly AccountPermission[],
  permission: AccountPermission,
) {
  return role === "owner" || role === "admin" || permissions.includes(permission);
}
