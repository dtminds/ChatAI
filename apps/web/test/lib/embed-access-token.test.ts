import { afterEach, describe, expect, it } from "vitest";
import {
  clearEmbedAuthHandoff,
  consumeEmbedAuthHandoffFromSearch,
  getEmbedAccessToken,
  getRememberedEmbedWorkflowTickets,
  restoreEmbedAuthHandoff,
  setEmbedAccessToken,
  stripEmbedAccessTokenFromSearch,
  withEmbedWorkflowHandoff,
} from "@/lib/embed-access-token";

describe("embed access token handoff", () => {
  afterEach(() => {
    clearEmbedAuthHandoff();
  });

  it("consumes the token and tickets from the query string", () => {
    const search = consumeEmbedAuthHandoffFromSearch(
      "?id=enc-id&uid=enc-uid&token=handoff-token",
    );

    expect(search).toBe("?id=enc-id&uid=enc-uid");
    expect(getEmbedAccessToken()).toBe("handoff-token");
    expect(getRememberedEmbedWorkflowTickets()).toEqual({
      id: "enc-id",
      uid: "enc-uid",
    });
  });

  it("appends remembered tickets onto an embed path without the access token", () => {
    consumeEmbedAuthHandoffFromSearch("?id=enc-id&uid=enc-uid&token=handoff-token");

    expect(withEmbedWorkflowHandoff("/embed/workflows/31")).toBe(
      "/embed/workflows/31?id=enc-id&uid=enc-uid",
    );
    expect(getEmbedAccessToken()).toBe("handoff-token");
  });

  it("strips the token from a search string", () => {
    expect(stripEmbedAccessTokenFromSearch("?id=enc-id&token=secret&uid=enc-uid")).toBe(
      "?id=enc-id&uid=enc-uid",
    );
  });

  it("restores a previously stored handoff", () => {
    setEmbedAccessToken("stored-token");
    consumeEmbedAuthHandoffFromSearch("?id=enc-id&uid=enc-uid");

    const stored = sessionStorage.getItem("chatai.embed-auth-handoff");
    expect(stored).toBeTruthy();

    clearEmbedAuthHandoff();
    sessionStorage.setItem("chatai.embed-auth-handoff", stored ?? "");

    restoreEmbedAuthHandoff();

    expect(getEmbedAccessToken()).toBe("stored-token");
    expect(getRememberedEmbedWorkflowTickets()).toEqual({
      id: "enc-id",
      uid: "enc-uid",
    });
  });
});
