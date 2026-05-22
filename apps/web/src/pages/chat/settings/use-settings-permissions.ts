import type { AuthSubUser } from "@chatai/contracts";
import { useMemo } from "react";

import { useAuthSubUser } from "@/pages/chat/hooks/use-auth-sub-user";

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
  const subUser = useAuthSubUser();

  return useMemo(
    () => (subUser ? resolveSettingsPermissions(subUser) : readOnlyPermissions),
    [subUser],
  );
}

function resolveSettingsPermissions(subUser: AuthSubUser): SettingsPermissionState {
  return {
    canManageManagedAccounts: subUser.permissions.includes("settings.managedAccounts.manage"),
    canManageSidebar: subUser.permissions.includes("settings.sidebar.manage"),
    canManageSubAccounts: subUser.permissions.includes("settings.subAccounts.manage"),
  };
}
