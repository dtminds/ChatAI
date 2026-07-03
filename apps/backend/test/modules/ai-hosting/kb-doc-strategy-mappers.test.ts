import { describe, expect, it } from "vitest";
import {
  resolveKbInitVolcStrategyResourceId,
  resolveVolcStrategyResourceId,
} from "../../../src/modules/ai-hosting/kb-doc-strategy-mappers.js";

describe("resolveVolcStrategyResourceId", () => {
  it("resolves the init strategy id for FAQ and image creates", () => {
    expect(resolveKbInitVolcStrategyResourceId()).toBe("kb-strategy-def92e30c1456c07");
  });

  it.each([
    [
      {
        chunkParams: { maxLength: 2000, strategy: "length" },
        chunkStrategy: "length",
        parseMode: "standard",
      },
      "kb-strategy-233abb0cd67b8429",
    ],
    [
      {
        chunkParams: { maxLength: 1000, strategy: "length" },
        chunkStrategy: "length",
        parseMode: "standard",
      },
      "kb-strategy-bb86846bd8964b93",
    ],
    [
      {
        chunkParams: { maxLength: 500, strategy: "length" },
        chunkStrategy: "length",
        parseMode: "standard",
      },
      "kb-strategy-309dc4df244db26d",
    ],
    [
      {
        chunkParams: { separator: "newline", strategy: "separator" },
        chunkStrategy: "separator",
        parseMode: "standard",
      },
      "kb-strategy-c0593b44acfbc5e8",
    ],
    [
      {
        chunkParams: { maxLength: 2000, strategy: "length" },
        chunkStrategy: "length",
        parseMode: "enhanced",
      },
      "kb-strategy-e1e2a815d50c4692",
    ],
    [
      {
        chunkParams: { maxLength: 1000, strategy: "length" },
        chunkStrategy: "length",
        parseMode: "enhanced",
      },
      "kb-strategy-d4a3777d577b8e32",
    ],
    [
      {
        chunkParams: { maxLength: 500, strategy: "length" },
        chunkStrategy: "length",
        parseMode: "enhanced",
      },
      "kb-strategy-51899c0babcd5d25",
    ],
    [
      {
        chunkParams: { separator: "newline", strategy: "separator" },
        chunkStrategy: "separator",
        parseMode: "enhanced",
      },
      "kb-strategy-76c06c05cf06ac2c",
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
