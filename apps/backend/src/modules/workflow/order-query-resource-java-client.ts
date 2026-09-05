import { decodeJavaInternalApiEnvelope } from "@chatai/contracts";
import { BadGatewayError, ServiceUnavailableError } from "../../shared/errors.js";
import { noopLogger, type AppLogger, type RequestAwareLogger } from "../../shared/logger.js";
import { postJavaInternalApi } from "./java-internal-api-client.js";

const USER_MESSAGE = "操作失败，请稍后重试";

export function createOrderQueryResourceJavaClient(
  logger: AppLogger | RequestAwareLogger = noopLogger,
) {
  const baseUrl = process.env.JAVA_INTERNAL_API_BASE_URL?.replace(/\/$/, "");
  const token = process.env.JAVA_INTERNAL_API_TOKEN;
  const post = async (path: string, body: Record<string, unknown>, operation: string) => {
    const response = await postJavaInternalApi<unknown>({
      baseUrl,
      body: JSON.stringify(body),
      createFailureError: () => new BadGatewayError("ORDER_QUERY_RESOURCE_FAILED", USER_MESSAGE),
      createNotConfiguredError: () => new ServiceUnavailableError(
        "ORDER_QUERY_RESOURCE_NOT_CONFIGURED",
        USER_MESSAGE,
      ),
      logContext: body,
      logger,
      operation,
      path,
      token,
    });
    const envelope = decodeJavaInternalApiEnvelope(response);
    if (envelope.kind !== "success") {
      logger.error(
        envelope.kind === "rejected"
          ? { error: envelope.error, errorMsg: envelope.errorMsg, operation }
          : { operation, reason: envelope.reason },
        "订单查询资源接口失败",
      );
      throw new BadGatewayError("ORDER_QUERY_RESOURCE_FAILED", USER_MESSAGE);
    }
    if (!Array.isArray(envelope.payload.data)) {
      logger.error({ operation, reason: "data must be an array" }, "订单查询资源接口返回异常");
      throw new BadGatewayError("ORDER_QUERY_RESOURCE_FAILED", USER_MESSAGE);
    }
    return envelope.payload.data;
  };
  return {
    async listPlatforms(uid: number) {
      const data = await post(
        "/third-internal/cdp-platform/list-platform",
        { uid },
        "workflow-order-platform-list",
      );
      return data.flatMap((item) => {
        if (!isRecord(item)
          || !isPositiveInteger(item.id)
          || typeof item.name !== "string"
          || !item.name.trim()) return [];
        return [{ id: item.id, name: item.name.trim().slice(0, 256) }];
      });
    },
    async listOrderStatuses() {
      const data = await post(
        "/third-internal/cdp-order/select-order-status",
        {},
        "workflow-order-status-list",
      );
      return data.flatMap((item) => {
        if (!isRecord(item)
          || !isNonNegativeInteger(item.status)
          || typeof item.name !== "string"
          || !item.name.trim()) return [];
        return [{ name: item.name.trim().slice(0, 256), status: item.status }];
      });
    },
    async listShops(uid: number, platformIds?: number[]) {
      const data = await post(
        "/third-internal/cdp-shop/list-auth-shop",
        { ...(platformIds ? { platformIds } : {}), uid },
        "workflow-order-shop-list",
      );
      return data.flatMap((item) => {
        if (!isRecord(item)
          || item.auth !== true
          || item.status !== 0
          || !isPositiveInteger(item.shopId)
          || !isPositiveInteger(item.platformId)
          || !isPositiveInteger(item.shopModel)
          || item.shopModel > 3
          || typeof item.shopName !== "string"
          || !item.shopName.trim()) return [];
        return [{
          id: item.shopId,
          model: item.shopModel,
          name: item.shopName.trim().slice(0, 256),
          platformId: item.platformId,
        }];
      });
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
