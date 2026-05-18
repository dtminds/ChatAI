import type { AuthSubUser } from "@chatai/contracts";
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
  return {
    canManageManagedAccounts: subUser.permissions.includes("settings.managedAccounts.manage"),
    canManageSidebar: subUser.permissions.includes("settings.sidebar.manage"),
    canManageSubAccounts: subUser.permissions.includes("settings.subAccounts.manage"),
  };
}
