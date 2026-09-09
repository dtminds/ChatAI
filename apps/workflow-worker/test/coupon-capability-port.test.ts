import { describe, expect, it, vi } from "vitest";
import { WORKFLOW_COUPON_CAPABILITY_BINDING } from "@chatai/workflow-runtime";
import { HttpWorkflowCouponCapabilityPort } from "../src/coupon-capability-port.js";

const definition = WORKFLOW_COUPON_CAPABILITY_BINDING.definition;
const receipt = { couponId: 11, sendNum: 3, success: true, userCouponIds: [101, 102, 103] };
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
function request() {
  return {
    command: { couponId: 11, number: 3 }, deadlineAt: new Date("2026-09-05T10:00:15Z"),
    execution: { nodeId: "coupon", revision: 1, runId: "run", sequence: 2, workflowId: "workflow" },
    identities: { mallUserId: 202 }, idempotencyKey: "9:run:coupon:2",
    signal: new AbortController().signal, subjectId: "contact-1", subjectType: "chatai_contact" as const, uid: 9,
  };
}
describe("Coupon Java port", () => {
  it("sends all copies in one request with the stable key and recipient", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(json({ success: true, error: -1, data: [receipt] }));
    const port = new HttpWorkflowCouponCapabilityPort({ baseUrl: "https://java.internal", token: "token", fetch: fetchMock });
    await expect(port.execute(definition, request())).resolves.toEqual({});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(new URL(String(url)).searchParams.get("idempotentKey")).toBe(request().idempotencyKey);
    expect(JSON.parse(String(options?.body))).toEqual({ uid: 9, mallUserId: 202, couponSends: [{ couponId: 11, number: 3 }] });
    expect(options?.headers).toMatchObject({ authorization: "Bearer token" });
  });
  it.each([
    { success: false, error: -1, errorMsg: "库存不足" },
    { success: true, data: [{ ...receipt, success: false, sendNum: 0, failReason: "超过限领" }] },
    { success: true, data: [{ ...receipt, sendNum: 2, userCouponIds: [101, 102] }] },
  ])("terminates rejected or partial issuance without a second call", async body => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(json(body));
    const port = new HttpWorkflowCouponCapabilityPort({ baseUrl: "https://java.internal", fetch: fetchMock });
    await expect(port.execute(definition, request())).rejects.toMatchObject({ failureKind: "terminal", code: "WORKFLOW_COUPON_REJECTED" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("retries transport failure using the same idempotency key", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValueOnce(new TypeError("network")).mockResolvedValue(json({ success: true, data: [receipt] }));
    const port = new HttpWorkflowCouponCapabilityPort({ baseUrl: "https://java.internal", fetch: fetchMock });
    await expect(port.execute(definition, request())).rejects.toMatchObject({ failureKind: "retryable" });
    await expect(port.execute(definition, request())).resolves.toEqual({});
    expect(String(fetchMock.mock.calls[0]![0])).toBe(String(fetchMock.mock.calls[1]![0]));
  });
  it.each([
    { success: true, data: [] },
    { success: true, data: [{ ...receipt, couponId: 12 }] },
    { success: true, data: [{ ...receipt, userCouponIds: [1, 1, 2] }] },
    { data: [receipt] },
  ])("rejects malformed success receipts", async body => {
    const port = new HttpWorkflowCouponCapabilityPort({ baseUrl: "https://java.internal", fetch: vi.fn<typeof fetch>().mockResolvedValue(json(body)) });
    await expect(port.execute(definition, request())).rejects.toMatchObject({ failureKind: "terminal", code: "WORKFLOW_COUPON_RESPONSE_INVALID" });
  });
  it("does not call Java for invalid recipient, quantity or aborted execution", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const port = new HttpWorkflowCouponCapabilityPort({ baseUrl: "https://java.internal", fetch: fetchMock });
    for (const input of [{ ...request(), identities: {} }, { ...request(), command: { couponId: 11, number: 6 } }, { ...request(), idempotencyKey: "" }]) {
      await expect(port.execute(definition, input)).rejects.toMatchObject({ code: "WORKFLOW_COUPON_REQUEST_INVALID" });
    }
    const controller = new AbortController(); controller.abort();
    await expect(port.execute(definition, { ...request(), signal: controller.signal })).rejects.toBe(controller.signal.reason);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("propagates cancellation during an in-flight issuance without a second request", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    }));
    const port = new HttpWorkflowCouponCapabilityPort({ baseUrl: "https://java.internal", fetch: fetchMock });
    const pending = port.execute(definition, { ...request(), signal: controller.signal });
    const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();
    await rejected;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
