import { afterEach, describe, expect, it } from "vitest";
import { resolveKbDocUrlForJava } from "../../../src/modules/ai-hosting/kb-doc-url.js";

describe("resolveKbDocUrlForJava", () => {
  afterEach(() => {
    delete process.env.PLAYABLE_MEDIA_HOST;
  });

  it("prefixes object keys with the playable media host", () => {
    process.env.PLAYABLE_MEDIA_HOST = "b5.bokr.com.cn";

    expect(resolveKbDocUrlForJava("kb-docs/demo.pdf")).toBe(
      "https://b5.bokr.com.cn/kb-docs/demo.pdf",
    );
  });

  it("keeps absolute https urls unchanged", () => {
    process.env.PLAYABLE_MEDIA_HOST = "b5.bokr.com.cn";

    expect(resolveKbDocUrlForJava("https://b5.bokr.com.cn/kb-docs/demo.pdf")).toBe(
      "https://b5.bokr.com.cn/kb-docs/demo.pdf",
    );
  });
});
