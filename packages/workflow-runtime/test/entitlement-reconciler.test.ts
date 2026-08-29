import { describe, expect, it, vi } from "vitest";
import {
  WorkflowEntitlementUnavailableError,
  WorkflowRuntimeReconciler,
} from "../src/index.js";

describe("Workflow entitlement reconciliation", () => {
  it("scans positive-capacity tenants and deactivates only workflows with active Runs", async () => {
    const listActiveRunWorkflowIds = vi.fn(async () => [
      { workflowId: "workflow-1", workflowType: "chatai_sop" as const },
      { workflowId: "workflow-2", workflowType: "chatai_sop" as const },
    ]);
    const deactivateWorkflowForEntitlementLoss = vi.fn(async () => ({ affectedDefinitions: 1 }));
    const check = vi.fn(async (input: { forceRefresh?: boolean; workflowType: string }) => {
      if (input.workflowType === "chatai_sop") return { entitled: false as const };
      if (input.workflowType === "wecom_sop" && !input.forceRefresh) {
        return { entitled: false as const };
      }
      if (input.workflowType === "wecom_sop") {
        return { activeRunLimit: 10_000, entitled: true as const };
      }
      throw new WorkflowEntitlementUnavailableError();
    });
    const reconciler = new WorkflowRuntimeReconciler({
      deactivateWorkflowForEntitlementLoss,
      listActiveCapacityTenants: vi.fn(async () => ({
        hasMore: true,
        lastUid: 9,
        uids: [9],
      })),
      listActiveRunWorkflowIds,
    } as never, { entitlementPort: { check } });

    await expect(reconciler.deactivateUnentitledWorkflows({ limit: 100 })).resolves.toEqual({
      checksUnavailable: 1,
      hasMore: true,
      lastUid: 9,
      tenantsChecked: 1,
      workflowsDeactivated: 2,
    });
    expect(listActiveRunWorkflowIds).toHaveBeenCalledWith({
      uid: 9,
      workflowTypes: ["chatai_sop"],
    });
    expect(deactivateWorkflowForEntitlementLoss).toHaveBeenCalledTimes(2);
    expect(deactivateWorkflowForEntitlementLoss).toHaveBeenCalledWith({
      opSubUserId: "0",
      uid: 9,
      workflowId: "workflow-1",
      workflowType: "chatai_sop",
    });
  });
});
