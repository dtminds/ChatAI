import { describe, expect, it } from "vitest";
import { apiError, apiSuccess } from "../src";

describe("API envelope helpers", () => {
  it("creates success and error envelopes", () => {
    expect(apiSuccess({ status: "ok" })).toEqual({
      data: {
        status: "ok",
      },
      success: true,
    });

    expect(apiError("UNAUTHORIZED", "登录已失效")).toEqual({
      error: {
        code: "UNAUTHORIZED",
        message: "登录已失效",
      },
      success: false,
    });
  });
});
