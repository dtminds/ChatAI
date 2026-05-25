import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildSidebarIframeSrc,
  resolveSidebarIframeSendStatus,
  resolveWorkbenchSendCapability,
} from "@/pages/chat/lib/sidebar-iframe-url";

describe("resolveSidebarIframeSendStatus", () => {
  it("returns 0 when the agent can send messages", () => {
    expect(
      resolveSidebarIframeSendStatus({
        hasActiveConversation: true,
        isAccountOffline: false,
        isAccountTakenOver: true,
        isConversationBizInactive: false,
        isReadOnly: false,
      }),
    ).toBe("0");
  });

  it("returns 4 for read-only agents before other blocking reasons", () => {
    expect(
      resolveSidebarIframeSendStatus({
        hasActiveConversation: true,
        isAccountOffline: true,
        isAccountTakenOver: false,
        isConversationBizInactive: true,
        isReadOnly: true,
      }),
    ).toBe("4");
  });

  it("returns 2 when the account is offline", () => {
    expect(
      resolveSidebarIframeSendStatus({
        hasActiveConversation: true,
        isAccountOffline: true,
        isAccountTakenOver: true,
        isConversationBizInactive: false,
        isReadOnly: false,
      }),
    ).toBe("2");
  });

  it("returns 1 when the account is not taken over", () => {
    expect(
      resolveSidebarIframeSendStatus({
        hasActiveConversation: true,
        isAccountOffline: false,
        isAccountTakenOver: false,
        isConversationBizInactive: false,
        isReadOnly: false,
      }),
    ).toBe("1");
  });

  it("returns 3 when the conversation is inactive", () => {
    expect(
      resolveSidebarIframeSendStatus({
        hasActiveConversation: true,
        isAccountOffline: false,
        isAccountTakenOver: true,
        isConversationBizInactive: true,
        isReadOnly: false,
      }),
    ).toBe("3");
  });
});

describe("resolveWorkbenchSendCapability", () => {
  it("disables sending for read-only agents", () => {
    const result = resolveWorkbenchSendCapability({
      bootstrapStatus: "ready",
      conversationBizStatus: 1,
      hasActiveConversation: true,
      isAccountOffline: false,
      isAccountTakenOver: true,
      isReadOnly: true,
    });

    expect(result.canSendMessage).toBe(false);
    expect(result.sidebarIframeSendStatus).toBe("4");
    expect(result.composerPlaceholder).toBe("当前账号为只读权限，无法发送消息");
  });

  it("treats missing conversation biz status as hidden (0)", () => {
    const result = resolveWorkbenchSendCapability({
      bootstrapStatus: "ready",
      conversationBizStatus: undefined,
      hasActiveConversation: true,
      isAccountOffline: false,
      isAccountTakenOver: true,
      isReadOnly: false,
    });

    expect(result.canSendMessage).toBe(false);
    expect(result.sidebarIframeSendStatus).toBe("3");
    expect(result.composerPlaceholder).toBe("当前会话已失效，暂时无法发送消息");
  });

  it("treats non-active conversation biz status as inactive", () => {
    const result = resolveWorkbenchSendCapability({
      bootstrapStatus: "ready",
      conversationBizStatus: 2,
      hasActiveConversation: true,
      isAccountOffline: false,
      isAccountTakenOver: true,
      isReadOnly: false,
    });

    expect(result.canSendMessage).toBe(false);
    expect(result.sidebarIframeSendStatus).toBe("3");
    expect(result.composerPlaceholder).toBe("当前会话已失效，暂时无法发送消息");
  });
});

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

  it("appends sendStatus when provided", () => {
    vi.stubGlobal("window", { location: { origin: "http://localhost:5173" } });

    expect(buildSidebarIframeSrc("https://example.com/assets", { sendStatus: "2" })).toBe(
      "https://example.com/assets?sendStatus=2",
    );
    expect(
      buildSidebarIframeSrc("https://example.com/assets", {
        sendStatus: "0",
        tos: "1",
      }),
    ).toBe("https://example.com/assets?tos=1&sendStatus=0");
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
