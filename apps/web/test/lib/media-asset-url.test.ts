import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildMediaAssetUrl,
  encodeCosObjectKey,
  getPlayableMediaHost,
  resolveMediaAssetUrl,
} from "@/lib/media-asset-url";

describe("media-asset-url", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses default playable media host when env is unset", () => {
    expect(getPlayableMediaHost()).toBe("b5.bokr.com.cn");
    expect(buildMediaAssetUrl("chat-images/a b.png")).toBe(
      "https://b5.bokr.com.cn/chat-images/a%20b.png",
    );
  });

  it("normalizes configured playable media host", () => {
    vi.stubEnv("VITE_PLAYABLE_MEDIA_HOST", "https://media.example.com:8443/");

    expect(getPlayableMediaHost()).toBe("media.example.com:8443");
    expect(buildMediaAssetUrl("/kb-docs/report.pdf")).toBe(
      "https://media.example.com:8443/kb-docs/report.pdf",
    );
  });

  it("encodes each path segment for COS object keys", () => {
    expect(encodeCosObjectKey("folder/a b/c+d.txt")).toBe("folder/a%20b/c%2Bd.txt");
  });

  it("resolves relative media paths to playable host URLs", () => {
    expect(resolveMediaAssetUrl("files/spec.pdf")).toBe(
      "https://b5.bokr.com.cn/files/spec.pdf",
    );
    expect(resolveMediaAssetUrl("/files/guide.pdf")).toBe(
      "https://b5.bokr.com.cn/files/guide.pdf",
    );
    expect(resolveMediaAssetUrl("https://example.com/cover.png")).toBe(
      "https://example.com/cover.png",
    );
    expect(resolveMediaAssetUrl("  ")).toBeUndefined();
  });
});
