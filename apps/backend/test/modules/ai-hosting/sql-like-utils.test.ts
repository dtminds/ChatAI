import { describe, expect, it } from "vitest";
import {
  buildContainsLikePattern,
  escapeLikePattern,
} from "../../../src/modules/ai-hosting/sql-like-utils.js";

describe("sql-like-utils", () => {
  it("escapes like wildcard characters", () => {
    expect(escapeLikePattern("%")).toBe("\\%");
    expect(escapeLikePattern("_")).toBe("\\_");
    expect(escapeLikePattern("a%b_c\\d")).toBe("a\\%b\\_c\\\\d");
  });

  it("wraps escaped text in contains pattern", () => {
    expect(buildContainsLikePattern("%")).toBe("%\\%%");
    expect(buildContainsLikePattern("系统")).toBe("%系统%");
  });
});
