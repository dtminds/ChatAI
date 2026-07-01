import { describe, expect, it } from "vitest";
import { normalizeAvatarUrl } from "@/lib/avatar-url";

describe("normalizeAvatarUrl", () => {
  it("requests smaller images for WeCom avatar hosts", () => {
    expect(normalizeAvatarUrl("https://wework.qpic.cn/wwpic/abc/0")).toBe(
      "https://wework.qpic.cn/wwpic/abc/60",
    );
    expect(normalizeAvatarUrl("https://p.qlogo.cn/bizmail/abc/0")).toBe(
      "https://p.qlogo.cn/bizmail/abc/60",
    );
  });

  it("requests smaller images for WeChat avatar hosts", () => {
    expect(normalizeAvatarUrl("http://wx.qlogo.cn/mmhead/avatar/0")).toBe(
      "http://wx.qlogo.cn/mmhead/avatar/64",
    );
  });

  it("preserves query strings and hashes when replacing the trailing size", () => {
    expect(normalizeAvatarUrl("https://wework.qpic.cn/wwpic/abc/0?token=1#avatar")).toBe(
      "https://wework.qpic.cn/wwpic/abc/60?token=1#avatar",
    );
  });

  it("does not truncate non-size URL segments or non-avatar hosts", () => {
    expect(normalizeAvatarUrl("https://wework.qpic.cn/wwpic/abc/100")).toBe(
      "https://wework.qpic.cn/wwpic/abc/100",
    );
    expect(normalizeAvatarUrl("https://cdn.example.com/avatar/0")).toBe(
      "https://cdn.example.com/avatar/0",
    );
    expect(
      normalizeAvatarUrl("https://cdn.example.com/avatar/0?source=wework.qpic.cn"),
    ).toBe("https://cdn.example.com/avatar/0?source=wework.qpic.cn");
  });

  it("normalizes empty input to an empty string", () => {
    expect(normalizeAvatarUrl(undefined)).toBe("");
    expect(normalizeAvatarUrl(null)).toBe("");
    expect(normalizeAvatarUrl("   ")).toBe("");
  });
});
