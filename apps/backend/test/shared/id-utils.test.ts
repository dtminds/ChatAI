import { describe, expect, it } from "vitest";
import {
  parseMySqlId,
  uniquePositiveIdStrings,
} from "../../src/shared/id-utils.js";

describe("parseMySqlId", () => {
  it.each([
    ["501", 501],
    [501, 501],
    ["501abc", null],
    ["501.9", null],
    ["9007199254740992", null],
    [0, null],
  ])("parses %j as %j", (value, expected) => {
    expect(parseMySqlId(value)).toBe(expected);
  });
});

describe("uniquePositiveIdStrings", () => {
  it("ignores unsupported runtime values without throwing", () => {
    expect(() =>
      uniquePositiveIdStrings([{} as never, "42", null, undefined]),
    ).not.toThrow();
    expect(uniquePositiveIdStrings([{} as never, "42", null, undefined])).toEqual([
      "42",
    ]);
  });
});
