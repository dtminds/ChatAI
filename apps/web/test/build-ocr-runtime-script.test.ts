import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// @vitest-environment node

describe("build OCR runtime script", () => {
  it("emits dynamic JavaScript chunks beside the runtime entry so module-relative imports stay valid", () => {
    const script = readFileSync(
      resolve(__dirname, "../scripts/build-ocr-runtime.mjs"),
      "utf8",
    );

    expect(script).toContain('chunkFileNames: "[name]-[hash].js"');
  });
});
