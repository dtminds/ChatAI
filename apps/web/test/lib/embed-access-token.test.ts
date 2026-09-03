import { afterEach, describe, expect, it } from "vitest";
import {
  clearEmbedAuthHandoff,
  consumeEmbedAuthHandoffFromSearch,
  getEmbedAccessToken,
  getRememberedEmbedHandoffToken,
  restoreEmbedAuthHandoff,
  setEmbedAccessToken,
  stripEmbedHandoffTokenFromSearch,
} from "@/lib/embed-access-token";

describe("embed access token handoff", () => {
  afterEach(() => {
    clearEmbedAuthHandoff();
  });

  it("captures the handoff token without treating it as an access token", () => {
    const search = consumeEmbedAuthHandoffFromSearch(
      "?tab=overview&token=handoff-token",
    );

    expect(search).toBe("?tab=overview");
    expect(getEmbedAccessToken()).toBeNull();
    expect(getRememberedEmbedHandoffToken()).toBe("handoff-token");
  });

  it("strips the token from a search string", () => {
    expect(stripEmbedHandoffTokenFromSearch("?tab=overview&token=secret")).toBe(
      "?tab=overview",
    );
  });

  it("persists the access token without persisting the short-lived handoff token", () => {
    setEmbedAccessToken("stored-token");
    consumeEmbedAuthHandoffFromSearch("?token=handoff-token");

    const stored = sessionStorage.getItem("chatai.embed-auth-handoff");
    expect(stored).toBeTruthy();
    expect(stored).not.toContain("handoff-token");

    clearEmbedAuthHandoff();
    sessionStorage.setItem("chatai.embed-auth-handoff", stored ?? "");

    restoreEmbedAuthHandoff();

    expect(getEmbedAccessToken()).toBe("stored-token");
    expect(getRememberedEmbedHandoffToken()).toBeNull();
  });
});
