import { describe, expect, it } from "vitest";
import { normalizeMediaAssetUrl } from "@/pages/chat/lib/media-asset-url";

describe("normalizeMediaAssetUrl", () => {
  it("keeps absolute http and https URLs", () => {
    expect(normalizeMediaAssetUrl("https://cdn.example.com/video.mp4")).toBe(
      "https://cdn.example.com/video.mp4",
    );
    expect(normalizeMediaAssetUrl("http://cdn.example.com/video.mp4")).toBe(
      "http://cdn.example.com/video.mp4",
    );
  });

  it("normalizes internal relative media paths to playable host URLs", () => {
    expect(normalizeMediaAssetUrl("s5/msg/20260514/272/video.mp4")).toBe(
      "https://b5.bokr.com.cn/s5/msg/20260514/272/video.mp4",
    );
    expect(normalizeMediaAssetUrl("/s5/msg/20260514/272/cover.jpg")).toBe(
      "https://b5.bokr.com.cn/s5/msg/20260514/272/cover.jpg",
    );
  });

  it("rejects unsupported relative paths", () => {
    expect(normalizeMediaAssetUrl("mock/video.mp4")).toBe("");
    expect(normalizeMediaAssetUrl("javascript:alert(1)")).toBe("");
  });
});
