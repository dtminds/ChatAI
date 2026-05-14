import { afterEach, describe, expect, it, vi } from "vitest";
import { buildSidebarIframeSrc } from "@/pages/chat/lib/sidebar-iframe-url";

describe("buildSidebarIframeSrc", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the base URL unchanged when no identifiers are provided", () => {
    expect(buildSidebarIframeSrc("https://example.com/page", {})).toBe("https://example.com/page");
  });

  it("appends third-party user ids as query parameters", () => {
    vi.stubGlobal("window", { location: { origin: "http://localhost:5173" } });

    expect(
      buildSidebarIframeSrc("https://example.com/assets", {
        thirdExternalUserId: "ext-1",
        thirdUserId: "u-1",
      }),
    ).toBe("https://example.com/assets?thirdUserId=u-1&thirdExternalUserId=ext-1");
  });

  it("preserves existing search params and encodes values", () => {
    vi.stubGlobal("window", { location: { origin: "http://localhost:5173" } });

    expect(
      buildSidebarIframeSrc("https://example.com/x?foo=1", {
        thirdUserId: "a/b",
        thirdExternalUserId: "x y",
      }),
    ).toBe("https://example.com/x?foo=1&thirdUserId=a%2Fb&thirdExternalUserId=x+y");
  });

  it("appends rd, fsw and ts search params when provided", () => {
    vi.stubGlobal("window", { location: { origin: "http://localhost:5173" } });

    expect(
      buildSidebarIframeSrc("https://example.com/embed", {
        thirdUserId: "u1",
        thirdExternalUserId: "e1",
        rd: "cipher+rd/x==",
        fsw: "cipher fsw",
        ts: "cipher+ts/x==",
      }),
    ).toBe(
      "https://example.com/embed?thirdUserId=u1&thirdExternalUserId=e1&rd=cipher%2Brd%2Fx%3D%3D&fsw=cipher+fsw&ts=cipher%2Bts%2Fx%3D%3D",
    );
  });
});
