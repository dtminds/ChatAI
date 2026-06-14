import { describe, expect, it } from "vitest";
import {
  joinMaterialFileName,
  resolveMaterialFileExtension,
  splitMaterialFileName,
} from "@/pages/chat/components/material-collection/material-file-name";

describe("material file name helpers", () => {
  it("prefers the stored extension over the file name suffix", () => {
    expect(
      resolveMaterialFileExtension("报价单.docx", "pdf"),
    ).toBe("pdf");
  });

  it("splits and joins file names without changing the locked extension", () => {
    expect(splitMaterialFileName("报告.v2.pdf", "pdf")).toEqual({
      baseName: "报告.v2",
      extension: "pdf",
    });
    expect(joinMaterialFileName("售后方案", "pdf")).toBe("售后方案.pdf");
  });
});
