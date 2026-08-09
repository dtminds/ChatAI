import type { AuthSubUser } from "@chatai/contracts";
import { isReadOnlySubUser } from "@/pages/chat/lib/sub-user-permissions";
import { useAuthStore } from "@/store/auth-store";

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
  const subUser = useAuthStore((state) => state.subUser);

  return subUser ? resolveSettingsPermissions(subUser) : readOnlyPermissions;
}

export function resolveSettingsPermissions(
  subUser: AuthSubUser,
): SettingsPermissionState {
  if (isReadOnlySubUser(subUser)) {
    return readOnlyPermissions;
  }

  return {
    canManageManagedAccounts: subUser.permissions.includes("settings.managedAccounts.manage"),
    canManageSidebar: subUser.permissions.includes("settings.sidebar.manage"),
    canManageSubAccounts: subUser.permissions.includes("settings.subAccounts.manage"),
  };
}
