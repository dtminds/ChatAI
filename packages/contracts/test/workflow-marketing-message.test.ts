import { Value } from "@sinclair/typebox/value";
import { describe, expect, it } from "vitest";
import {
  getWorkflowNodeContract,
  getWorkflowNodeOutputContracts,
  isWorkflowNodeDraftConfig,
  isWorkflowNodeExecutionConfig,
  WorkflowMarketingPlanListResponseSchema,
} from "../src/index.js";

describe("Workflow Marketing Message contracts", () => {
  it("is runtime-ready for Java integration testing", () => {
    expect(getWorkflowNodeContract("marketing-message")).toMatchObject({
      executionClass: "composite",
      maturity: "runtime-ready",
    });
  });

  it("keeps plan optional in drafts and required for execution", () => {
    const wait = { mode: "fixed", duration: 30, unit: "minute" };
    expect(isWorkflowNodeDraftConfig("marketing-message", { wait })).toBe(true);
    expect(isWorkflowNodeExecutionConfig("marketing-message", { wait })).toBe(false);
    expect(isWorkflowNodeExecutionConfig("marketing-message", {
      plan: { planId: 701, planName: "双十一触达" },
      wait,
    })).toBe(true);
    expect(isWorkflowNodeExecutionConfig("marketing-message", {
      plan: { planId: 701, planName: "   " },
      wait,
    })).toBe(false);
    expect(isWorkflowNodeExecutionConfig("marketing-message", {
      plan: { planId: 701, planName: "双十一触达" },
      wait: { mode: "none" },
    })).toBe(true);
  });

  it("enforces minute and hour wait boundaries", () => {
    const plan = { planId: 701, planName: "双十一触达" };
    expect(isWorkflowNodeExecutionConfig("marketing-message", {
      plan,
      wait: { mode: "fixed", duration: 2_880, unit: "minute" },
    })).toBe(true);
    expect(isWorkflowNodeExecutionConfig("marketing-message", {
      plan,
      wait: { mode: "fixed", duration: 48, unit: "hour" },
    })).toBe(true);
    expect(isWorkflowNodeExecutionConfig("marketing-message", {
      plan,
      wait: { mode: "fixed", duration: 49, unit: "hour" },
    })).toBe(false);
    expect(isWorkflowNodeExecutionConfig("marketing-message", {
      plan,
      wait: { mode: "fixed", duration: 29, unit: "minute" },
    })).toBe(false);
  });

  it("publishes one boolean output and accepts SMS plus WeCom plan channels", () => {
    expect(getWorkflowNodeOutputContracts("marketing-message", {})).toEqual([
      { key: "pushSuccess", usages: ["variable"], valueType: { kind: "boolean" } },
    ]);
    expect(Value.Check(WorkflowMarketingPlanListResponseSchema, {
      pagination: { hasNext: false, page: 1, pageSize: 20, total: 1 },
      plans: [{ name: "双十一触达", planId: 701, sendChannels: [1, 3], status: 0 }],
    })).toBe(true);
  });
});
