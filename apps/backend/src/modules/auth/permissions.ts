import type { AccountPermission, AccountRole, AccountType } from "@chatai/contracts";

const ownerPermissions = [
  "chat.access",
  "chat.send",
  "chat.takeover",
  "settings.access",
  "settings.subAccounts.manage",
  "settings.managedAccounts.manage",
  "settings.sidebar.manage",
] as const satisfies AccountPermission[];

const adminPermissions = ownerPermissions;

const operatorPermissions = [
  "chat.access",
  "chat.send",
  "chat.takeover",
] as const satisfies AccountPermission[];

const viewerPermissions = [
  "chat.access",
] as const satisfies AccountPermission[];

export const dbSubAccountType = {
  main: 1,
  sub: 0,
} as const;

export function deriveAccountType(type: number | null | undefined): AccountType {
  return type === dbSubAccountType.main ? "main" : "sub";
}

export function deriveAccountRole(input: {
  role?: string | null;
  type?: number | null;
}): AccountRole {
  if (deriveAccountType(input.type) === "main") {
    return "owner";
  }

  if (input.role === "admin") {
    return "admin";
  }

  if (input.role === "viewer") {
    return "viewer";
  }

  return "operator";
}

export function normalizeAccountRole(value: string | null | undefined): AccountRole | undefined {
  if (
    value === "owner" ||
    value === "admin" ||
    value === "operator" ||
    value === "viewer"
  ) {
    return value;
  }

  return undefined;
}

export function getRolePermissions(role: AccountRole): AccountPermission[] {
  if (role === "owner") {
    return [...ownerPermissions];
  }

  if (role === "admin") {
    return [...adminPermissions];
  }

  if (role === "operator") {
    return [...operatorPermissions];
  }

  return [...viewerPermissions];
}

export function hasPermission(
  permissions: readonly AccountPermission[],
  permission: AccountPermission,
) {
  return permissions.includes(permission);
}
