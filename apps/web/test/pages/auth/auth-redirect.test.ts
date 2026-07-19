import { describe, expect, it } from "vitest";
import {
  buildLoginRedirectPath,
  resolveLoginRedirect,
} from "@/pages/auth/auth-redirect";

describe("auth redirect", () => {
  it("preserves the private pathname, search, and hash in the login URL", () => {
    expect(
      buildLoginRedirectPath({
        hash: "#matrix",
        pathname: "/chat/settings/roles",
        search: "?tab=permissions",
      }),
    ).toBe(
      "/login?redirect=%2Fchat%2Fsettings%2Froles%3Ftab%3Dpermissions%23matrix",
    );
  });

  it("resolves a safe internal redirect", () => {
    expect(
      resolveLoginRedirect(
        "?redirect=%2Fchat%2Fai-hosting%2Fagents%2Fagent-1%3Ftab%3Dprompt%23editor",
      ),
    ).toBe("/chat/ai-hosting/agents/agent-1?tab=prompt#editor");
  });

  it.each([
    "https://example.com/phishing",
    "//example.com/phishing",
    "/\\example.com/phishing",
    "/login",
    "/login?redirect=%2Fchat",
    "/LOGIN",
    "/LOGIN?redirect=%2Fchat",
    "/%6Cogin",
    "/%6C%6F%67%69%6E",
    "/login%2Fchild",
    "/%E0%A4%A",
  ])("falls back to chat for unsafe redirect %s", (redirect) => {
    expect(
      resolveLoginRedirect(`?redirect=${encodeURIComponent(redirect)}`),
    ).toBe("/chat");
  });
});
