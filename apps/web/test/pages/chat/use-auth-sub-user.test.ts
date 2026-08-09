import { describe, expect, it } from "vitest";
import {
  isChatReadOnlySubUser,
  isReadOnlySubUser,
} from "@/pages/chat/lib/sub-user-permissions";
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

  it("allows operators with chat.send permission outside support mode", () => {
    expect(isChatReadOnlySubUser(operator)).toBe(false);
  });

  it("treats support mode as chat read-only", () => {
    expect(
      isChatReadOnlySubUser({
        ...operator,
        accessMode: "support_readonly",
      }),
    ).toBe(true);
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

describe("isReadOnlySubUser", () => {
  it("treats viewers and support sessions as read-only", () => {
    expect(isReadOnlySubUser(viewer)).toBe(true);
    expect(
      isReadOnlySubUser({
        ...operator,
        accessMode: "support_readonly",
      }),
    ).toBe(true);
  });

  it("keeps standard operators writable", () => {
    expect(isReadOnlySubUser(operator)).toBe(false);
  });
});
