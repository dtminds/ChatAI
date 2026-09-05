import {
  decodeJavaInternalApiEnvelope,
  type WorkflowCouponListQuery, type WorkflowCouponListResponse,
} from "@chatai/contracts";
import { BadGatewayError, ServiceUnavailableError } from "../../shared/errors.js";
import { noopLogger, type AppLogger, type RequestAwareLogger } from "../../shared/logger.js";
import { postJavaInternalApi } from "./java-internal-api-client.js";

export function createCouponResourceJavaClient(logger: AppLogger | RequestAwareLogger = noopLogger) {
  const failure = () => new BadGatewayError("WORKFLOW_COUPON_RESOURCE_FAILED", "操作失败，请稍后重试");
  return {
    async list(uid: number, query: WorkflowCouponListQuery): Promise<WorkflowCouponListResponse> {
      const response = await postJavaInternalApi<unknown>({
        baseUrl: process.env.JAVA_INTERNAL_API_BASE_URL?.replace(/\/$/, ""),
        token: process.env.JAVA_INTERNAL_API_TOKEN,
        path: "/third-internal/mall-coupon/page-coupon",
        // Eligibility and pagination stay in Java; never filter/slice a fetched page locally.
        body: JSON.stringify({ uid, getMode: 2, page: query.page, pageSize: query.pageSize,
          ...(query.couponId ? { couponIds: String(query.couponId) } : {}),
          ...(query.couponName?.trim() ? { couponName: query.couponName.trim() } : {}) }),
        operation: "workflow-coupon-list", logger,
        createFailureError: failure,
        createNotConfiguredError: () => new ServiceUnavailableError("WORKFLOW_COUPON_RESOURCE_UNAVAILABLE", "操作失败，请稍后重试"),
      });
      const envelope = decodeJavaInternalApiEnvelope(response);
      if (envelope.kind !== "success") {
        logger.error(envelope.kind === "rejected"
          ? { error: envelope.error, errorMsg: envelope.errorMsg }
          : { reason: envelope.reason }, "优惠券列表接口失败");
        throw failure();
      }
      const data = envelope.payload;
      if (!Array.isArray(data.list)) throw failure();
      const items = data.list.flatMap((raw: unknown) => {
        if (!isRecord(raw)) return [];
        const item = raw as Record<string, unknown>;
        if (!isPositiveSafeInteger(item.couponId) || typeof item.couponName !== "string"
          || !item.couponName.trim() || !isCouponType(item.couponType)) return [];
        return [{
          couponId: item.couponId,
          couponName: item.couponName.trim(),
          couponType: item.couponType,
          couponContent: typeof item.couponContent === "string" ? item.couponContent : "",
          stocks: readNonNegativeInteger(item.stocks),
          limitNum: readNonNegativeInteger(item.limitNum),
        }];
      });
      // Java's success flag is authoritative. Only fields consumed by this resource are read;
      // omitted pagination metadata is tolerated because the live endpoint omits hasNext.
      const total = isNonNegativeSafeInteger(data.count) ? data.count : items.length;
      const hasNext = typeof data.hasNext === "boolean"
        ? data.hasNext : query.page * query.pageSize < total;
      return { items, total, page: query.page, pageSize: query.pageSize, hasNext };
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function readNonNegativeInteger(value: unknown) {
  return isNonNegativeSafeInteger(value) ? value : 0;
}

function isCouponType(value: unknown): value is 1 | 2 | 3 {
  return value === 1 || value === 2 || value === 3;
}
