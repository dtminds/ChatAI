import { describe, expect, it, vi } from "vitest";
import { WorkflowRuntimeReconciler } from "../src/index.js";

describe("Workflow entitlement reconciliation", () => {
  it("does not force-refresh denied types without active Run workflows", async () => {
    const check = vi.fn(async () => ({ entitled: false as const }));
    const listActiveRunWorkflowIds = vi.fn(async () => []);
    const reconciler = new WorkflowRuntimeReconciler({
      deactivateWorkflowForEntitlementLoss: vi.fn(),
      listActiveCapacityTenants: vi.fn(async () => ({
        hasMore: false,
        lastUid: 9,
        uids: [9],
      })),
      listActiveRunWorkflowIds,
    } as never, { entitlementPort: { check } });

    await expect(reconciler.deactivateUnentitledWorkflows({ limit: 100 }))
      .resolves.toMatchObject({ workflowsDeactivated: 0 });

    expect(listActiveRunWorkflowIds).toHaveBeenCalledWith({
      uid: 9,
      workflowTypes: ["chatai_sop", "wecom_sop"],
    });
    expect(check).toHaveBeenCalledTimes(2);
    expect(check).not.toHaveBeenCalledWith(expect.objectContaining({ forceRefresh: true }));
  });

  it("scans positive-capacity tenants and deactivates only workflows with active Runs", async () => {
    const listActiveRunWorkflowIds = vi.fn(async () => [
      { workflowId: "workflow-1", workflowType: "chatai_sop" as const },
      { workflowId: "workflow-2", workflowType: "chatai_sop" as const },
      { workflowId: "workflow-3", workflowType: "wecom_sop" as const },
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
      throw new Error(`unexpected entitlement check for ${input.workflowType}`);
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
      checksUnavailable: 0,
      hasMore: true,
      lastUid: 9,
      tenantsChecked: 1,
      workflowsDeactivated: 2,
    });
    expect(listActiveRunWorkflowIds).toHaveBeenCalledWith({
      uid: 9,
      workflowTypes: ["chatai_sop", "wecom_sop"],
    });
    expect(check).not.toHaveBeenCalledWith(expect.objectContaining({ workflowType: "member_sop" }));
    expect(check).toHaveBeenCalledWith({ forceRefresh: true, uid: 9, workflowType: "chatai_sop" });
    expect(check).toHaveBeenCalledWith({ forceRefresh: true, uid: 9, workflowType: "wecom_sop" });
    expect(deactivateWorkflowForEntitlementLoss).toHaveBeenCalledTimes(2);
    expect(deactivateWorkflowForEntitlementLoss).toHaveBeenCalledWith({
      opSubUserId: "0",
      uid: 9,
      workflowId: "workflow-1",
      workflowType: "chatai_sop",
    });
  });
});
