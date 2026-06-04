import { describe, expect, it } from "vitest";
import { isChatReadOnlySubUser } from "@/pages/chat/hooks/use-auth-sub-user";
import type { AuthSubUser } from "@chatai/contracts";

const operator: AuthSubUser = {
  accountType: "sub",
  displayName: "客服一号",
  permissions: ["chat.access", "chat.send", "chat.takeover"],
  role: "operator",
  subUserId: "sub-user-001",
  uid: 1,
};

const viewer: AuthSubUser = {
  accountType: "sub",
  displayName: "客服（只读）",
  permissions: ["chat.access"],
  role: "viewer",
  subUserId: "sub-user-002",
  uid: 2,
};

describe("isChatReadOnlySubUser", () => {
  it("treats missing sub user metadata as read-only", () => {
    expect(isChatReadOnlySubUser(undefined)).toBe(true);
  });

  it("allows operators with chat.send permission", () => {
    expect(isChatReadOnlySubUser(operator)).toBe(false);
  });

  it("blocks viewers and users without chat.send", () => {
    expect(isChatReadOnlySubUser(viewer)).toBe(true);
    expect(
      isChatReadOnlySubUser({
        ...operator,
        permissions: ["chat.access", "chat.takeover"],
      }),
    ).toBe(true);
  });
});
