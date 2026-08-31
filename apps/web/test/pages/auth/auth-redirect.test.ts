import { afterEach, describe, expect, it } from "vitest";
import {
  clearEmbedAuthHandoff,
  rememberEmbedTickets,
} from "@/lib/embed-access-token";
import {
  buildLoginRedirectPath,
  isEmbedPath,
  readEmbedSsoAttempt,
  readEmbedSsoParams,
  resolveLoginRedirect,
} from "@/pages/auth/auth-redirect";

describe("auth redirect", () => {
  afterEach(() => {
    clearEmbedAuthHandoff();
  });

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

  it("strips an embed access token from the login redirect", () => {
    expect(
      buildLoginRedirectPath({
        pathname: "/embed/workflows/31",
        search: "?id=enc-id&uid=enc-uid&token=secret-token",
      }),
    ).toBe(
      "/login?redirect=%2Fembed%2Fworkflows%2F31%3Fid%3Denc-id%26uid%3Denc-uid",
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

  it("reads encrypted embed workflow tickets from the query string", () => {
    expect(isEmbedPath("/embed/workflows")).toBe(true);
    expect(isEmbedPath("/embed/future-module/31")).toBe(true);
    expect(isEmbedPath("/chat/workflows")).toBe(false);
    expect(readEmbedSsoParams("?id=enc-id&uid=enc-uid")).toEqual({
      id: "enc-id",
      uid: "enc-uid",
    });
    expect(readEmbedSsoParams("?id=enc-id")).toBeNull();
    expect(
      readEmbedSsoAttempt({
        pathname: "/login",
        search: "?redirect=%2Fembed%2Fworkflows%3Fid%3Denc-id%26uid%3Denc-uid",
      }),
    ).toEqual({
      params: { id: "enc-id", uid: "enc-uid" },
      returnPath: "/embed/workflows?id=enc-id&uid=enc-uid",
    });
  });

  it("reuses remembered embed tickets when the editor path has no query", () => {
    rememberEmbedTickets({ id: "enc-id", uid: "enc-uid" });

    expect(
      readEmbedSsoAttempt({
        pathname: "/embed/workflows/31",
        search: "?token=secret-token",
      }),
    ).toEqual({
      params: { id: "enc-id", uid: "enc-uid" },
      returnPath: "/embed/workflows/31",
    });
  });
});
