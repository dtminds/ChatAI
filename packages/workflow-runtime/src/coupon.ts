import {
  WorkflowCouponCommandSchema,
  WorkflowCouponResultSchema,
} from "@chatai/contracts";
import { Value } from "@sinclair/typebox/value";
import type { WorkflowCapabilityExecutionBinding } from "./capability-port.js";
import { createCapabilityCommandError } from "./capability-command-error.js";

const commandError = createCapabilityCommandError("WORKFLOW_COUPON_COMMAND_INVALID");

export const WORKFLOW_COUPON_CAPABILITY_BINDING = {
  nodeKind: "coupon",
  definition: {
    capabilityKey: "coupon.issue",
    contractVersion: 1,
    kind: "action",
    commandSchema: WorkflowCouponCommandSchema,
    resultSchema: WorkflowCouponResultSchema,
  },
  createCommand({ config, context }) {
    if (!Value.Check(WorkflowCouponCommandSchema, config)
      || !Number.isSafeInteger(context.identities.mallUserId)
      || (context.identities.mallUserId ?? 0) <= 0) {
      throw commandError("Coupon requires a valid coupon, quantity and prepared mallUserId");
    }
    return { couponId: config.couponId, number: config.number };
  },
  mapResult() { return {}; },
} satisfies WorkflowCapabilityExecutionBinding<
  typeof WorkflowCouponCommandSchema, typeof WorkflowCouponResultSchema, "action"
>;
