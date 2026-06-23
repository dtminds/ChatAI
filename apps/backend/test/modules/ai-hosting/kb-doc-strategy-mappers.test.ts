import { describe, expect, it } from "vitest";
import { resolveVolcStrategyResourceId } from "../../../src/modules/ai-hosting/kb-doc-strategy-mappers.js";

describe("resolveVolcStrategyResourceId", () => {
  it.each([
    [
      {
        chunkParams: { maxLength: 2000, strategy: "length" },
        chunkStrategy: "length",
        parseMode: "standard",
      },
      "chat_kd_common_2000",
    ],
    [
      {
        chunkParams: { maxLength: 1000, strategy: "length" },
        chunkStrategy: "length",
        parseMode: "standard",
      },
      "chat_kd_common_1000",
    ],
    [
      {
        chunkParams: { maxLength: 500, strategy: "length" },
        chunkStrategy: "length",
        parseMode: "standard",
      },
      "chat_kd_common_500",
    ],
    [
      {
        chunkParams: { separator: "newline", strategy: "separator" },
        chunkStrategy: "separator",
        parseMode: "standard",
      },
      "chat_kd_common_n",
    ],
    [
      {
        chunkParams: { maxLength: 2000, strategy: "length" },
        chunkStrategy: "length",
        parseMode: "enhanced",
      },
      "chat_kd_ocr_2000",
    ],
    [
      {
        chunkParams: { maxLength: 1000, strategy: "length" },
        chunkStrategy: "length",
        parseMode: "enhanced",
      },
      "chat_kd_ocr_1000",
    ],
    [
      {
        chunkParams: { maxLength: 500, strategy: "length" },
        chunkStrategy: "length",
        parseMode: "enhanced",
      },
      "chat_kd_ocr_500",
    ],
    [
      {
        chunkParams: { separator: "newline", strategy: "separator" },
        chunkStrategy: "separator",
        parseMode: "enhanced",
      },
      "chat_kd_ocr_n",
    ],
  ] as const)("maps %# to the expected strategy id", (input, expected) => {
    expect(resolveVolcStrategyResourceId(input)).toBe(expected);
  });

  it("rejects mismatched chunk strategy and params", () => {
    expect(() =>
      resolveVolcStrategyResourceId({
        chunkParams: { maxLength: 2000, strategy: "length" },
        chunkStrategy: "separator",
        parseMode: "standard",
      }),
    ).toThrowError("切片配置无效");
  });
});
