import { describe, expect, it, vi } from "vitest";
import {
  createWorkflowEntitlementPort,
  WorkflowEntitlementUnavailableError,
} from "../src/entitlement.js";

describe("workflow entitlement port", () => {
  it.each(["chatai_sop", "wecom_sop"] as const)(
    "allows workflow operations in test mode for %s",
    async (workflowType) => {
      const port = createWorkflowEntitlementPort({ mode: "allow" });

      await expect(port.check({ uid: 9, workflowType })).resolves.toEqual({
        activeRunLimit: Number.MAX_SAFE_INTEGER,
        entitled: true,
        unentitledSince: null,
      });
    },
  );

  it("allows workflow operations by default when entitlement mode is unset", async () => {
    const port = createWorkflowEntitlementPort({});

    await expect(port.check({ uid: 9, workflowType: "chatai_sop" })).resolves.toEqual({
      activeRunLimit: Number.MAX_SAFE_INTEGER,
      entitled: true,
      unentitledSince: null,
    });
    await expect(port.check({ uid: 9, workflowType: "wecom_sop" })).resolves.toEqual({
      activeRunLimit: Number.MAX_SAFE_INTEGER,
      entitled: true,
      unentitledSince: null,
    });
    await expect(port.getTenantCapacity({ uid: 9 })).resolves.toEqual({
      activeRunLimit: Number.MAX_SAFE_INTEGER,
    });
  });

  it("fails closed in enforce mode when the Java endpoint is not configured", async () => {
    const port = createWorkflowEntitlementPort({ mode: "enforce" });

    await expect(port.check({ uid: 9, workflowType: "chatai_sop" }))
      .rejects.toBeInstanceOf(WorkflowEntitlementUnavailableError);
    await expect(port.getTenantCapacity({ uid: 9 }))
      .rejects.toBeInstanceOf(WorkflowEntitlementUnavailableError);
  });

  it("reads tenant capacity without fabricating a Workflow Type", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      activeRunLimit: 10_000,
    }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    }));
    const port = createWorkflowEntitlementPort({
      endpoint: "https://java.example.com/internal/workflow/entitlement",
      fetch,
      mode: "enforce",
    });

    await expect(port.getTenantCapacity({ uid: 9 })).resolves.toEqual({
      activeRunLimit: 10_000,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetch.mock.calls[0]![1]?.body))).toEqual({ uid: 9 });
  });

  it.each([
    {},
    { activeRunLimit: -1 },
    { activeRunLimit: 1.5 },
    { activeRunLimit: Number.MAX_SAFE_INTEGER + 1 },
    { activeRunLimit: 10_000, workflowType: "chatai_sop" },
  ])("fails closed for an invalid tenant capacity response: %j", async (body) => {
    const port = createWorkflowEntitlementPort({
      endpoint: "https://java.example.com/internal/workflow/entitlement",
      fetch: async () => new Response(JSON.stringify(body), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }),
      mode: "enforce",
    });

    await expect(port.getTenantCapacity({ uid: 9 }))
      .rejects.toBeInstanceOf(WorkflowEntitlementUnavailableError);
  });

  it.each([
    { entitled: true, unentitledSince: null },
    { activeRunLimit: -1, entitled: true, unentitledSince: null },
    { activeRunLimit: 1.5, entitled: true, unentitledSince: null },
  ])("fails closed for an invalid entitled capacity response: %j", async (body) => {
    const port = createWorkflowEntitlementPort({
      endpoint: "https://java.example.com/internal/workflow/entitlement",
      fetch: async () => new Response(JSON.stringify(body), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }),
      mode: "enforce",
    });

    await expect(port.check({ uid: 9, workflowType: "chatai_sop" }))
      .rejects.toBeInstanceOf(WorkflowEntitlementUnavailableError);
  });

  it("rejects unknown entitlement modes", () => {
    expect(() => createWorkflowEntitlementPort({ mode: "disabled" }))
      .toThrow("WORKFLOW_ENTITLEMENT_MODE must be allow or enforce");
  });
});
