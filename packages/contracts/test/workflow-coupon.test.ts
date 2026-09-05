import { describe, expect, it } from "vitest";
import { isWorkflowNodeDraftConfig, isWorkflowNodeExecutionConfig, getWorkflowNodeContract } from "../src/index.js";

describe("Coupon node contract", () => {
  it("allows an unselected draft but requires one coupon and 1-5 copies for execution", () => {
    expect(isWorkflowNodeDraftConfig("coupon", { number: 1 })).toBe(true);
    expect(isWorkflowNodeExecutionConfig("coupon", { number: 1 })).toBe(false);
    for (const number of [1, 5]) expect(isWorkflowNodeExecutionConfig("coupon", { couponId: 12, number })).toBe(true);
    for (const number of [0, 6, 1.5]) expect(isWorkflowNodeExecutionConfig("coupon", { couponId: 12, number })).toBe(false);
    expect(isWorkflowNodeExecutionConfig("coupon", { couponId: [12, 13], number: 1 })).toBe(false);
    expect(getWorkflowNodeContract("coupon").identityInputs).toEqual(["mallUserId"]);
  });
});
