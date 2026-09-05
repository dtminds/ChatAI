import { decodeJavaInternalApiEnvelope, WorkflowCouponCommandSchema } from "@chatai/contracts";
import { Value } from "@sinclair/typebox/value";
import type { Static, TSchema } from "@sinclair/typebox";
import {
  WORKFLOW_COUPON_CAPABILITY_BINDING,
  type WorkflowCapabilityDefinition, type WorkflowCapabilityKind,
  type WorkflowCapabilityPort, type WorkflowCapabilityRequest,
} from "@chatai/workflow-runtime";
import { assertCapabilityDefinition, createAbortGuard, retryableError, terminalError } from "./capability-port-support.js";

const throwIfAborted = createAbortGuard("WORKFLOW_COUPON_ABORTED", "发券暂时失败", "Coupon request aborted");
const invalidResponse = (detail: string) => terminalError(
  "WORKFLOW_COUPON_RESPONSE_INVALID", "返回结果异常，流程已停止", detail,
);

export class HttpWorkflowCouponCapabilityPort implements WorkflowCapabilityPort {
  constructor(private readonly options: { baseUrl: string; token?: string | null; fetch?: typeof fetch }) {}

  async execute<TCommandSchema extends TSchema, TResultSchema extends TSchema, TKind extends WorkflowCapabilityKind>(
    definition: WorkflowCapabilityDefinition<TCommandSchema, TResultSchema, TKind>,
    request: WorkflowCapabilityRequest<Static<TCommandSchema>, TKind>,
  ): Promise<unknown> {
    assertCapabilityDefinition(definition, WORKFLOW_COUPON_CAPABILITY_BINDING.definition, "Coupon");
    const command = request.command;
    const mallUserId = request.identities.mallUserId;
    if (!Value.Check(WorkflowCouponCommandSchema, command)
      || !Number.isSafeInteger(mallUserId) || (mallUserId ?? 0) <= 0
      || !("idempotencyKey" in request) || typeof request.idempotencyKey !== "string" || !request.idempotencyKey) {
      throw terminalError("WORKFLOW_COUPON_REQUEST_INVALID", "执行所需数据不可用，流程已停止", "Invalid coupon command, recipient or idempotency key");
    }
    throwIfAborted(request.signal);
    const endpoint = new URL("/third-internal/mall-coupon/send-coupon-to-user", this.options.baseUrl);
    // Java owns deduplication, including a retry after the first response was lost.
    endpoint.searchParams.set("idempotentKey", request.idempotencyKey);
    let response: Response;
    try {
      response = await (this.options.fetch ?? fetch)(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", ...(this.options.token ? { authorization: `Bearer ${this.options.token}` } : {}) },
        body: JSON.stringify({ uid: request.uid, mallUserId, couponSends: [{ couponId: command.couponId, number: command.number }] }),
        signal: request.signal,
      });
    } catch (error) {
      if (request.signal.aborted) throwIfAborted(request.signal);
      throw retryableError("WORKFLOW_COUPON_UNAVAILABLE", "发券暂时失败", `Coupon transport failed: ${error instanceof Error ? error.name : "unknown"}`);
    }
    throwIfAborted(request.signal);
    if (response.status !== 200) {
      throw retryableError("WORKFLOW_COUPON_UNAVAILABLE", "发券暂时失败", `Coupon endpoint returned HTTP ${response.status}`);
    }
    let body: unknown;
    try { body = await response.json(); } catch {
      if (request.signal.aborted) throwIfAborted(request.signal);
      throw invalidResponse("Coupon endpoint returned invalid JSON");
    }
    throwIfAborted(request.signal);
    const envelope = decodeJavaInternalApiEnvelope(body);
    if (envelope.kind === "invalid") throw invalidResponse(`Invalid coupon envelope: ${envelope.reason}`);
    if (envelope.kind === "rejected") {
      throw terminalError("WORKFLOW_COUPON_REJECTED", "发券失败，流程已停止", `Coupon rejected: ${envelope.error} ${envelope.errorMsg}`);
    }
    const results = envelope.payload.data;
    if (!Array.isArray(results) || results.length !== 1) throw invalidResponse("Coupon response must contain exactly one result");
    const result: unknown = results[0];
    if (!result || typeof result !== "object" || Array.isArray(result)) throw invalidResponse("Invalid coupon result");
    const item = result as Record<string, unknown>;
    if (item.couponId !== command.couponId || typeof item.success !== "boolean") throw invalidResponse("Coupon result identity or success is invalid");
    if (!item.success || (Number.isInteger(item.sendNum) && item.sendNum !== command.number)) {
      // Partial issuance is terminal too. Never issue the missing quantity in a second call.
      throw terminalError("WORKFLOW_COUPON_REJECTED", "发券失败，流程已停止",
        `Coupon issuance failed or incomplete: couponId=${command.couponId}, sendNum=${item.sendNum}, reason=${typeof item.failReason === "string" ? item.failReason : "unknown"}`);
    }
    if (item.sendNum !== command.number || !Array.isArray(item.userCouponIds)
      || item.userCouponIds.length !== command.number
      || !item.userCouponIds.every(id => Number.isSafeInteger(id) && id > 0)
      || new Set(item.userCouponIds).size !== command.number) throw invalidResponse("Coupon success receipt is inconsistent");
    return {};
  }
}
