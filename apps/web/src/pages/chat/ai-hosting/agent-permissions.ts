import type { AuthSubUser } from "@chatai/contracts";
import { isReadOnlySubUser } from "@/pages/chat/lib/sub-user-permissions";

export function canManageAiHostingAgents(subUser: AuthSubUser | undefined) {
  return (
    !isReadOnlySubUser(subUser) &&
    (subUser?.role === "owner" || subUser?.role === "admin")
  );
}

export function canMaintainUserMemory(subUser: AuthSubUser | undefined) {
  return (
    !isReadOnlySubUser(subUser) &&
    (subUser?.role === "owner" ||
      subUser?.role === "admin" ||
      subUser?.role === "operator")
  );
}
