import {
  decodeJavaInternalApiEnvelope,
  WORKFLOW_MARKETING_PLAN_NAME_MAX_LENGTH,
  type WorkflowMarketingPlanListItem,
  type WorkflowMarketingPlanListResponse,
} from "@chatai/contracts";
import { BadGatewayError, ServiceUnavailableError } from "../../shared/errors.js";
import { noopLogger, type AppLogger, type RequestAwareLogger } from "../../shared/logger.js";
import { postJavaInternalApi } from "./java-internal-api-client.js";

export const CDP_MARKET_PLAN_LIST_PATH = "/third-internal/cdp-market-plan/list-plan";
const ERROR_CODE = "CDP_MARKET_PLAN_INTERNAL_API_FAILED";
const NOT_CONFIGURED_CODE = "CDP_MARKET_PLAN_INTERNAL_API_NOT_CONFIGURED";
const USER_MESSAGE = "操作失败，请稍后重试";

export type MarketingPlanJavaClient = {
  listPlans(input: {
    page: number;
    pageSize: number;
    planName?: string;
    uid: number;
  }): Promise<WorkflowMarketingPlanListResponse>;
};

export function createMarketingPlanJavaClient(
  logger: AppLogger | RequestAwareLogger = noopLogger,
): MarketingPlanJavaClient {
  const baseUrl = process.env.JAVA_INTERNAL_API_BASE_URL?.replace(/\/$/, "");
  const token = process.env.JAVA_INTERNAL_API_TOKEN;
  return {
    async listPlans(input) {
      const requestBody = {
        page: input.page,
        pageSize: input.pageSize,
        uid: input.uid,
        ...(input.planName ? { planName: input.planName } : {}),
      };
      const response = await postJavaInternalApi<unknown>({
        baseUrl,
        body: JSON.stringify(requestBody),
        createFailureError: status => new BadGatewayError(
          ERROR_CODE,
          USER_MESSAGE,
          { operation: "cdp-market-plan-list", ...(status === undefined ? {} : { status }) },
        ),
        createNotConfiguredError: () => new ServiceUnavailableError(NOT_CONFIGURED_CODE, USER_MESSAGE),
        logContext: requestBody,
        logger,
        operation: "cdp-market-plan-list",
        path: CDP_MARKET_PLAN_LIST_PATH,
        token,
      });
      const envelope = decodeJavaInternalApiEnvelope(response);
      if (envelope.kind !== "success") {
        throw new BadGatewayError(
          ERROR_CODE,
          USER_MESSAGE,
          envelope.kind === "rejected"
            ? { error: envelope.error, errorMsg: envelope.errorMsg, operation: "cdp-market-plan-list" }
            : { operation: "cdp-market-plan-list", reason: envelope.reason },
        );
      }
      const plans = extractPlans(envelope.payload.list, input.pageSize);
      const hasNext = envelope.payload.hasNext === true;
      return {
        pagination: {
          hasNext,
          page: input.page,
          pageSize: input.pageSize,
          total: resolveTotal(envelope.payload.count, plans.length, hasNext, input.page, input.pageSize),
        },
        plans,
      };
    },
  };
}

function extractPlans(value: unknown, limit: number): WorkflowMarketingPlanListItem[] {
  if (!Array.isArray(value)) return [];
  const plans: WorkflowMarketingPlanListItem[] = [];
  const seen = new Set<number>();
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const planId = readPositiveInteger(record.planId);
    const name = typeof record.name === "string"
      ? record.name.trim().slice(0, WORKFLOW_MARKETING_PLAN_NAME_MAX_LENGTH)
      : "";
    const status = record.status;
    const sendChannels = Array.isArray(record.sendChannels)
      ? [...new Set(record.sendChannels.filter(channel => channel === 1 || channel === 3))]
      : [];
    if (!planId || !name || seen.has(planId) || sendChannels.length === 0
      || (status !== 0 && status !== 1 && status !== 2 && status !== 3)) continue;
    seen.add(planId);
    plans.push({ name, planId, sendChannels, status });
    if (plans.length >= limit) break;
  }
  return plans;
}

function readPositiveInteger(value: unknown) {
  const parsed = typeof value === "string" && value.trim() ? Number(value) : value;
  return typeof parsed === "number" && Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function resolveTotal(count: unknown, size: number, hasNext: boolean, page: number, pageSize: number) {
  const filled = (page - 1) * pageSize + size;
  return typeof count === "number" && Number.isSafeInteger(count) && count >= 0
    ? Math.max(count, filled)
    : hasNext ? Math.max(filled, page * pageSize + 1) : filled;
}
