import { describe, expect, it } from "vitest";
import {
  createWorkflowEntitlementPort,
  WorkflowEntitlementUnavailableError,
} from "../src/entitlement.js";

describe("workflow entitlement port", () => {
  it("allows workflow operations when the explicit test mode is enabled", async () => {
    const port = createWorkflowEntitlementPort({ mode: "allow" });

    await expect(port.check({ uid: 9, workflowType: "chatai_sop" })).resolves.toEqual({
      entitled: true,
      unentitledSince: null,
    });
    await expect(port.check({ uid: 9, workflowType: "wecom_sop" })).resolves.toEqual({
      entitled: true,
      unentitledSince: null,
    });
  });

  it("fails closed by default when the Java endpoint is not configured", async () => {
    const port = createWorkflowEntitlementPort({});

    await expect(port.check({ uid: 9, workflowType: "chatai_sop" }))
      .rejects.toBeInstanceOf(WorkflowEntitlementUnavailableError);
  });

  it("rejects unknown entitlement modes", () => {
    expect(() => createWorkflowEntitlementPort({ mode: "disabled" }))
      .toThrow("WORKFLOW_ENTITLEMENT_MODE must be allow or enforce");
  });
});
