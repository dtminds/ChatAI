export const CURRENT_WORKBENCH_PLATFORM = 5;

export type WorkbenchPlatformScope = {
  platform: number;
};

export type AuthenticatedWorkbenchScope = WorkbenchPlatformScope & {
  uid: number;
};

export function getCurrentWorkbenchPlatformScope(): WorkbenchPlatformScope {
  return {
    platform: CURRENT_WORKBENCH_PLATFORM,
  };
}

export function getAuthenticatedWorkbenchScope(user: { uid: number }): AuthenticatedWorkbenchScope {
  return {
    ...getCurrentWorkbenchPlatformScope(),
    uid: user.uid,
  };
}
