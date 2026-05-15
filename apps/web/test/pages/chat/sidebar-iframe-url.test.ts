import { afterEach, describe, expect, it, vi } from "vitest";
import { buildSidebarIframeSrc } from "@/pages/chat/lib/sidebar-iframe-url";

describe("buildSidebarIframeSrc", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the base URL unchanged when no identifiers are provided", () => {
    expect(buildSidebarIframeSrc("https://example.com/page", {})).toBe("https://example.com/page");
  });

  it("appends takeover and group identifiers without crypto params when provided", () => {
    vi.stubGlobal("window", { location: { origin: "http://localhost:5173" } });

    expect(buildSidebarIframeSrc("https://example.com/assets", { tos: "0" })).toBe(
      "https://example.com/assets?tos=0",
    );
    expect(
      buildSidebarIframeSrc("https://example.com/group", {
        qd: "grp-xyz",
        tos: "1",
      }),
    ).toBe("https://example.com/group?tos=1&qd=grp-xyz");
  });

  it("preserves existing search params when appending takeover state", () => {
    vi.stubGlobal("window", { location: { origin: "http://localhost:5173" } });

    expect(
      buildSidebarIframeSrc("https://example.com/x?foo=1", {
        tos: "1",
      }),
    ).toBe("https://example.com/x?foo=1&tos=1");
  });

  it("appends rd, fsw and ts search params when provided", () => {
    vi.stubGlobal("window", { location: { origin: "http://localhost:5173" } });

    expect(
      buildSidebarIframeSrc("https://example.com/embed", {
        rd: "cipher+rd/x==",
        fsw: "cipher fsw",
        ts: "cipher+ts/x==",
      }),
    ).toBe(
      "https://example.com/embed?rd=cipher%2Brd%2Fx%3D%3D&fsw=cipher+fsw&ts=cipher%2Bts%2Fx%3D%3D",
    );
  });

  it("appends mid from app id when provided", () => {
    vi.stubGlobal("window", { location: { origin: "http://localhost:5173" } });

    expect(
      buildSidebarIframeSrc("https://example.com/embed", {
        mid: "app-xyz",
      }),
    ).toBe("https://example.com/embed?mid=app-xyz");
  });
});
