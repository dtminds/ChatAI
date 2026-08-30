import { describe, expect, it } from "vitest";
import { decodeJavaInternalApiEnvelope } from "../src/index.js";

describe("Java internal API envelope", () => {
  it("returns only business data when success is true", () => {
    const expected = { data: { id: 88 }, kind: "success" };
    expect(decodeJavaInternalApiEnvelope({ data: { id: 88 }, success: true }))
      .toEqual(expected);
    expect(decodeJavaInternalApiEnvelope({
      data: { id: 88 },
      error: null,
      errorMsg: null,
      success: true,
    })).toEqual(expected);
    expect(decodeJavaInternalApiEnvelope({
      data: { id: 88 },
      error: 40001,
      errorMsg: "ignored on success",
      success: true,
    })).toEqual(expected);
  });

  it("returns Java diagnostics only when success is false", () => {
    expect(decodeJavaInternalApiEnvelope({
      data: null,
      error: 40001,
      errorMsg: "参数无效",
      success: false,
    })).toEqual({
      error: 40001,
      errorMsg: "参数无效",
      kind: "rejected",
    });
  });

  it.each([
    [null, "envelope must be an object"],
    [[], "envelope must be an object"],
    [{ error: 0, errorMsg: "" }, "success must be a boolean"],
    [{ error: 0, errorMsg: "", success: 1 }, "success must be a boolean"],
    [{ errorMsg: "", success: false }, "error must be a safe integer"],
    [{ error: 0.5, errorMsg: "", success: false }, "error must be a safe integer"],
    [{ error: 0, success: false }, "errorMsg must be a string"],
  ])("rejects an invalid failure envelope", (value, reason) => {
    expect(decodeJavaInternalApiEnvelope(value)).toEqual({ kind: "invalid", reason });
  });
});
