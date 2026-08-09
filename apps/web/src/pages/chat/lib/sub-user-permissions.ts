import type { AuthSubUser } from "@chatai/contracts";

export function isReadOnlySubUser(subUser: AuthSubUser | undefined) {
  return !subUser
    || subUser.role === "viewer"
    || subUser.accessMode === "support_readonly";
}

export function isChatReadOnlySubUser(subUser: AuthSubUser | undefined) {
  return isReadOnlySubUser(subUser)
    || !subUser?.permissions.includes("chat.send");
}
