import type { AccountRole } from "@chatai/contracts";

export function canManageAiHostingAgents(role: AccountRole | undefined) {
  return role === "owner" || role === "admin";
}
