import { describe, expect, it } from "vitest";
import { uniquePositiveIdStrings } from "../../src/shared/id-utils.js";

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
