import { describe, expect, it } from "vitest";
import { decodeJavaInternalApiEnvelope } from "../src/index.js";

describe("Java internal API envelope", () => {
  it("returns only business data when success is true", () => {
    const expected = { kind: "success", payload: { data: { id: 88 } } };
    expect(decodeJavaInternalApiEnvelope({ data: { id: 88 }, success: true }))
      .toEqual(expected);
    expect(decodeJavaInternalApiEnvelope({
      data: { id: 88 },
      error: null,
      errorMsg: null,
      success: true,
    })).toEqual(expected);
    expect(decodeJavaInternalApiEnvelope({
      count: 1,
      error: 0,
      errorMsg: "",
      list: [],
      success: true,
    })).toEqual({ kind: "success", payload: { count: 1, list: [] } });
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
    expect(decodeJavaInternalApiEnvelope({ success: false })).toEqual({
      error: -1,
      errorMsg: "",
      kind: "rejected",
    });
    expect(decodeJavaInternalApiEnvelope({
      error: 0.5,
      errorMsg: null,
      success: false,
    })).toEqual({
      error: 0.5,
      errorMsg: "",
      kind: "rejected",
    });
  });

  it.each([
    [null, "envelope must be an object"],
    [[], "envelope must be an object"],
    [{ error: 0, errorMsg: "" }, "success must be a boolean"],
    [{ error: 0, errorMsg: "", success: 1 }, "success must be a boolean"],
  ])("rejects an invalid envelope", (value, reason) => {
    expect(decodeJavaInternalApiEnvelope(value)).toEqual({ kind: "invalid", reason });
  });
});
