import { describe, expect, it } from "vitest";
import {
  assertWorkflowRuntimeValue,
  WORKFLOW_NODE_OUTPUT_MAX_BYTES,
  WorkflowRuntimeValueError,
} from "../src/index.js";

describe("workflow runtime value limits", () => {
  it("accepts exactly 4 KiB and rejects one additional UTF-8 byte", () => {
    const emptyObjectBytes = Buffer.byteLength(JSON.stringify({ value: "" }), "utf8");
    const exact = { value: "x".repeat(WORKFLOW_NODE_OUTPUT_MAX_BYTES - emptyObjectBytes) };
    const oversized = { value: `${exact.value}x` };

    expect(assertWorkflowRuntimeValue(
      exact,
      "node-output",
      WORKFLOW_NODE_OUTPUT_MAX_BYTES,
    )).toBe(WORKFLOW_NODE_OUTPUT_MAX_BYTES);
    expect(() => assertWorkflowRuntimeValue(
      oversized,
      "node-output",
      WORKFLOW_NODE_OUTPUT_MAX_BYTES,
    )).toThrow(expect.objectContaining({
      actualBytes: WORKFLOW_NODE_OUTPUT_MAX_BYTES + 1,
      reason: "too-large",
    }));
  });

  it.each([
    { label: "BigInt", value: { amount: 1n } },
    { label: "accessor property", value: { get amount() { return 1; } } },
    { label: "non-finite number", value: { amount: Number.POSITIVE_INFINITY } },
    { label: "symbol property", value: { [Symbol("amount")]: 1 } },
    { label: "undefined property", value: { amount: undefined } },
  ])("rejects a non-JSON $label", ({ value }) => {
    expect(() => assertWorkflowRuntimeValue(
      value,
      "node-output",
      WORKFLOW_NODE_OUTPUT_MAX_BYTES,
    )).toThrow(expect.objectContaining({ reason: "invalid" }));
  });

  it("rejects cyclic objects without leaking the value", () => {
    const value: Record<string, unknown> = {};
    value.self = value;

    try {
      assertWorkflowRuntimeValue(value, "node-output", WORKFLOW_NODE_OUTPUT_MAX_BYTES);
      throw new Error("Expected cyclic output to be rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(WorkflowRuntimeValueError);
      expect(error).toMatchObject({ actualBytes: null, reason: "invalid" });
      expect((error as Error).message).not.toContain("self");
    }
  });
});
