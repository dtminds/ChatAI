import { describe, expect, it, vi } from "vitest";
import {
  createWorkflowEntitlementPort,
  WorkflowEntitlementUnavailableError,
} from "../src/entitlement.js";

const success = (data: boolean) => new Response(JSON.stringify({
  data,
  success: true,
}), { headers: { "Content-Type": "application/json" }, status: 200 });

describe("workflow entitlement port", () => {
  it.each([
    ["chatai_sop", 1],
    ["wecom_sop", 2],
    ["member_sop", 3],
  ] as const)("calls the Java can-run contract for %s", async (workflowType, javaType) => {
    const fetch = vi.fn(async () => success(true));
    const port = createWorkflowEntitlementPort({
      baseUrl: "https://java.example.com/",
      fetch,
      token: "internal-token",
    });

    await expect(port.check({ uid: 9, workflowType })).resolves.toEqual({
      activeRunLimit: 10_000,
      entitled: true,
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://java.example.com/third-internal/wap-embed-workflow-definition/can-run",
      expect.objectContaining({
        body: JSON.stringify({ uid: 9, workflowType: javaType }),
        headers: {
          Authorization: "Bearer internal-token",
          "Content-Type": "application/json",
        },
        method: "POST",
      }),
    );
  });

  it("uses the configured capacity without asking Java for it", async () => {
    const fetch = vi.fn(async () => success(false));
    const port = createWorkflowEntitlementPort({
      activeRunLimit: 25_000,
      baseUrl: "https://java.example.com",
      fetch,
    });

    await expect(port.getTenantCapacity({ uid: 9 })).resolves.toEqual({
      activeRunLimit: 25_000,
    });
    await expect(port.check({ uid: 9, workflowType: "chatai_sop" })).resolves.toEqual({
      entitled: false,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("is unavailable without the required Java base URL", async () => {
    const port = createWorkflowEntitlementPort({});
    await expect(port.check({ uid: 9, workflowType: "chatai_sop" }))
      .rejects.toBeInstanceOf(WorkflowEntitlementUnavailableError);
    await expect(port.getTenantCapacity({ uid: 9 })).resolves.toEqual({
      activeRunLimit: 10_000,
    });
  });

  it.each([
    { data: true, success: false },
    { data: "true", success: true },
    { success: true },
    { data: true },
  ])("treats invalid Java envelopes as unavailable: %j", async (body) => {
    const port = createWorkflowEntitlementPort({
      baseUrl: "https://java.example.com",
      fetch: async () => new Response(JSON.stringify(body), { status: 200 }),
    });
    await expect(port.check({ uid: 9, workflowType: "chatai_sop" }))
      .rejects.toBeInstanceOf(WorkflowEntitlementUnavailableError);
  });

  it("ignores failure-only envelope fields after a successful decision", async () => {
    const port = createWorkflowEntitlementPort({
      baseUrl: "https://java.example.com",
      fetch: async () => new Response(JSON.stringify({
        data: false,
        error: 1,
        errorMsg: 1,
        error_msg: null,
        success: true,
      }), { status: 200 }),
    });

    await expect(port.check({ uid: 9, workflowType: "chatai_sop" }))
      .resolves.toEqual({ entitled: false });
  });

  it("shares Redis results and force-refreshes cached denials", async () => {
    const values = new Map<string, string>();
    const cache = {
      get: vi.fn(async (key: string) => values.get(key) ?? null),
      set: vi.fn(async (key: string, value: string) => { values.set(key, value); }),
    };
    const fetch = vi.fn()
      .mockResolvedValueOnce(success(false))
      .mockResolvedValueOnce(success(true));
    const first = createWorkflowEntitlementPort({
      baseUrl: "https://java.example.com",
      cache,
      cacheKeyPrefix: "tenant:",
      fetch,
      l1TtlMs: 0,
    });

    await expect(first.check({ uid: 9, workflowType: "wecom_sop" }))
      .resolves.toEqual({ entitled: false });
    expect(cache.set).toHaveBeenCalledWith(
      "tenant:workflow:entitlement:v1:9:wecom_sop",
      "0",
      1_800,
    );

    const second = createWorkflowEntitlementPort({
      baseUrl: "https://java.example.com",
      cache,
      cacheKeyPrefix: "tenant:",
      fetch,
    });
    await expect(second.check({ uid: 9, workflowType: "wecom_sop" }))
      .resolves.toEqual({ entitled: false });
    await expect(second.check({ forceRefresh: true, uid: 9, workflowType: "wecom_sop" }))
      .resolves.toEqual({ activeRunLimit: 10_000, entitled: true });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("deduplicates concurrent Java refreshes", async () => {
    let resolveResponse!: (response: Response) => void;
    const fetch = vi.fn(() => new Promise<Response>(resolve => { resolveResponse = resolve; }));
    const port = createWorkflowEntitlementPort({
      baseUrl: "https://java.example.com",
      fetch,
    });
    const checks = Array.from({ length: 8 }, () =>
      port.check({ uid: 9, workflowType: "member_sop" }));
    await Promise.resolve();
    resolveResponse(success(true));

    await expect(Promise.all(checks)).resolves.toHaveLength(8);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("bounds the process-local entitlement cache", async () => {
    const fetch = vi.fn(async () => success(true));
    const port = createWorkflowEntitlementPort({
      baseUrl: "https://java.example.com",
      fetch,
      l1MaxEntries: 2,
    });

    await port.check({ uid: 1, workflowType: "chatai_sop" });
    await port.check({ uid: 2, workflowType: "chatai_sop" });
    await port.check({ uid: 3, workflowType: "chatai_sop" });
    await port.check({ uid: 1, workflowType: "chatai_sop" });

    expect(fetch).toHaveBeenCalledTimes(4);
  });
});
