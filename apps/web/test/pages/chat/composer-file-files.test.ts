import { describe, expect, it } from "vitest";
import {
  isComposerFileSizeAllowed,
  isSupportedComposerFile,
  MAX_COMPOSER_FILE_SIZE_BYTES,
} from "@/pages/chat/lib/composer-file-files";

describe("composer file validation", () => {
  it("accepts supported document types and rejects unsupported files", () => {
    expect(isSupportedComposerFile(new File(["x"], "报价单.pdf", { type: "application/pdf" }))).toBe(true);
    expect(isSupportedComposerFile(new File(["x"], "报价单.docx", { type: "" }))).toBe(true);
    expect(isSupportedComposerFile(new File(["x"], "archive.zip", { type: "application/zip" }))).toBe(false);
  });

  it("accepts files at the 10 MB boundary and rejects larger files", () => {
    const allowed = new File(["x"], "报价单.pdf", { type: "application/pdf" });
    const oversized = new File(["x"], "报价单.pdf", { type: "application/pdf" });
    Object.defineProperty(allowed, "size", { configurable: true, value: MAX_COMPOSER_FILE_SIZE_BYTES });
    Object.defineProperty(oversized, "size", { configurable: true, value: MAX_COMPOSER_FILE_SIZE_BYTES + 1 });

    expect(isComposerFileSizeAllowed(allowed)).toBe(true);
    expect(isComposerFileSizeAllowed(oversized)).toBe(false);
  });
});
