// @vitest-environment node

import { describe, expect, it } from "vitest";
import { isPagePathAllowedForHostname } from "@/lib/host-page-access";

describe("host page access", () => {
  it("only exposes embed pages on hosts following the embed naming convention", () => {
    expect(isPagePathAllowedForHostname(
      "chat-embed.example.com",
      "/embed/workflows",
    )).toBe(true);
    expect(isPagePathAllowedForHostname(
      "chat-embed-test.example.com",
      "/chat/workflows",
    )).toBe(false);
    expect(isPagePathAllowedForHostname(
      "chat-embed-dev.example.com",
      "/login",
    )).toBe(false);
  });

  it("rejects embed pages on normal hosts but keeps localhost usable", () => {
    expect(isPagePathAllowedForHostname(
      "chat.bokr.com.cn",
      "/embed/workflows",
    )).toBe(false);
    expect(isPagePathAllowedForHostname(
      "chat-test01.bokr.com.cn",
      "/chat/workflows",
    )).toBe(true);
    expect(isPagePathAllowedForHostname("localhost", "/embed/workflows")).toBe(true);
  });

  it("uses the embed layout on the zero-config local embed hostname", () => {
    expect(isPagePathAllowedForHostname(
      "chat-embed.localhost",
      "/embed/workflows",
    )).toBe(true);
    expect(isPagePathAllowedForHostname(
      "chat-embed.localhost",
      "/chat/workflows",
    )).toBe(false);
  });
});
