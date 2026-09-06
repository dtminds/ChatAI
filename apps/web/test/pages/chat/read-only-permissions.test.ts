// @vitest-environment node

import type { AuthSubUser } from "@chatai/contracts";
import { describe, expect, it } from "vitest";
import {
  canMaintainUserMemory,
  canManageAiHostingAgents,
} from "@/pages/chat/ai-hosting/agent-permissions";
import { resolveSettingsPermissions } from "@/pages/chat/settings/use-settings-permissions";

const admin: AuthSubUser = {
  accountType: "sub",
  displayName: "管理员",
  permissions: [
    "chat.access",
    "chat.send",
    "chat.takeover",
    "settings.access",
    "settings.managedAccounts.manage",
    "settings.sidebar.manage",
    "settings.subAccounts.manage",
  ],
  role: "admin",
  subUserId: "101",
  uid: 1,
};

describe("read-only sub-user permissions", () => {
  it("preserves standard account management permissions", () => {
    expect(resolveSettingsPermissions(admin)).toEqual({
      canManageManagedAccounts: true,
      canManageSidebar: true,
      canManageSubAccounts: true,
    });
    expect(canManageAiHostingAgents(admin)).toBe(true);
    expect(canMaintainUserMemory(admin)).toBe(true);
  });

  it("treats support mode like a viewer for write capabilities", () => {
    const supportSubUser: AuthSubUser = {
      ...admin,
      accessMode: "support_readonly",
    };

    expect(resolveSettingsPermissions(supportSubUser)).toEqual({
      canManageManagedAccounts: false,
      canManageSidebar: false,
      canManageSubAccounts: false,
    });
    expect(canManageAiHostingAgents(supportSubUser)).toBe(false);
    expect(canMaintainUserMemory(supportSubUser)).toBe(false);
  });

  it("keeps viewers read-only and standard operators able to maintain memory", () => {
    expect(
      canManageAiHostingAgents({
        ...admin,
        role: "viewer",
      }),
    ).toBe(false);
    expect(
      canMaintainUserMemory({
        ...admin,
        role: "operator",
      }),
    ).toBe(true);
  });
});
