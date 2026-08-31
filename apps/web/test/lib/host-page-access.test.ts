import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isPagePathAllowedForHostname } from "@/lib/host-page-access";

describe("host page access", () => {
  beforeEach(() => {
    vi.stubEnv(
      "VITE_CHAT_EMBED_HOSTNAMES",
      "embed.example.com,embed-test.example.com,embed-dev.example.com",
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("only exposes embed pages on configured embed hosts", () => {
    expect(isPagePathAllowedForHostname(
      "embed.example.com",
      "/embed/workflows",
    )).toBe(true);
    expect(isPagePathAllowedForHostname(
      "embed-test.example.com",
      "/chat/workflows",
    )).toBe(false);
    expect(isPagePathAllowedForHostname(
      "embed-dev.example.com",
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

  it("disables embed pages when no embed hosts are configured", () => {
    vi.stubEnv("VITE_CHAT_EMBED_HOSTNAMES", "");

    expect(isPagePathAllowedForHostname(
      "embed.example.com",
      "/embed/workflows",
    )).toBe(false);
    expect(isPagePathAllowedForHostname(
      "embed.example.com",
      "/chat/workflows",
    )).toBe(true);
  });
});
