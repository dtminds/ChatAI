import { describe, expect, it } from "vitest";
import { WORKFLOW_COUPON_CAPABILITY_BINDING, executeWorkflowCapability, deriveWorkflowExecutionContextRequirements } from "../src/index.js";
import { projectWorkflowNodeExecutionConfig } from "@chatai/workflow-engine/node-contract-registry";
import { FakeWorkflowCapabilityAdapter } from "./support/fake-capability-adapter.js";

describe("Coupon execution", () => {
  const context = { customFields: {}, identities: { mallUserId: 303 }, currentNodeLifecycle: {}, nodeLifecycle: {}, outputs: {}, subjectId: "101", trigger: {}, workflow: {} };
  it("projects only issuance fields and requires the mall identity", () => {
    expect(projectWorkflowNodeExecutionConfig({ kind: "coupon", data: {
      number: 3, coupon: { couponId: 12 },
    } })).toEqual({ couponId: 12, number: 3 });
    expect(deriveWorkflowExecutionContextRequirements({ kind: "coupon", id: "coupon", config: { couponId: 12, number: 3 }, nodeSchemaVersion: 1 }).identities).toEqual(["mallUserId"]);
    expect(WORKFLOW_COUPON_CAPABILITY_BINDING.createCommand({ config: { couponId: 12, number: 3 }, context })).toEqual({ couponId: 12, number: 3 });
    expect(() => WORKFLOW_COUPON_CAPABILITY_BINDING.createCommand({ config: { couponId: 12, number: 3 }, context: { ...context, identities: {} } })).toThrow();
  });
  it("forwards a stable action idempotency key and exposes no invented outputs", async () => {
    const adapter = new FakeWorkflowCapabilityAdapter(async () => ({}));
    const result = await executeWorkflowCapability({
      binding: WORKFLOW_COUPON_CAPABILITY_BINDING, commandContext: context,
      config: { couponId: 12, number: 3 }, deadlineAt: new Date("2026-09-05T10:00:15Z"),
      execution: { nodeId: "coupon", revision: 1, runId: "run", sequence: 2, workflowId: "workflow" },
      executionKey: "9:run:coupon:2", port: adapter, signal: new AbortController().signal,
      subjectId: "101", subjectType: "wecom_contact", uid: 9,
    });
    expect(result).toEqual({});
    expect(adapter.calls).toHaveLength(1);
    expect(adapter.calls[0]?.request).toMatchObject({
      command: { couponId: 12, number: 3 }, idempotencyKey: "9:run:coupon:2", identities: { mallUserId: 303 },
    });
  });
});
