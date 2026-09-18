import {
  WORKFLOW_MARKETING_PLAN_LIST_PAGE_SIZE,
  WORKFLOW_MARKETING_PLAN_LIST_PAGE_SIZE_MAX,
  WORKFLOW_MARKETING_PLAN_NAME_MAX_LENGTH,
} from "@chatai/contracts";
import type { AppLogger, RequestAwareLogger } from "../../shared/logger.js";
import { createMarketingPlanJavaClient, type MarketingPlanJavaClient } from "./marketing-plan-java-client.js";

export class MarketingPlanService {
  constructor(private readonly javaClient: MarketingPlanJavaClient) {}

  listPlans(uid: number, options: { page?: number; pageSize?: number; planName?: string } = {}) {
    const page = positiveInteger(options.page, 1);
    const pageSize = Math.min(
      WORKFLOW_MARKETING_PLAN_LIST_PAGE_SIZE_MAX,
      positiveInteger(options.pageSize, WORKFLOW_MARKETING_PLAN_LIST_PAGE_SIZE),
    );
    const planName = options.planName?.trim().slice(0, WORKFLOW_MARKETING_PLAN_NAME_MAX_LENGTH) ?? "";
    return this.javaClient.listPlans({ page, pageSize, uid, ...(planName ? { planName } : {}) });
  }
}

export function createMarketingPlanService(logger: AppLogger | RequestAwareLogger) {
  return new MarketingPlanService(createMarketingPlanJavaClient(logger));
}

function positiveInteger(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 ? value : fallback;
}
