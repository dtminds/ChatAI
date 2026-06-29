import type { AiHostingQuota } from "@chatai/contracts";

export const AI_HOSTING_AGENT_QUOTA_REACHED_MESSAGE = "Agent 数量已达上限";
export const AI_HOSTING_KB_QUOTA_REACHED_MESSAGE = "知识库数量已达上限";
export const AI_HOSTING_KB_DOC_STORAGE_QUOTA_REACHED_MESSAGE =
  "知识库存储空间已达上限";
export const AI_HOSTING_QUOTA_CHECK_FAILED_MESSAGE = "用量校验失败，请稍后重试";

export function isQuotaReached(quota: AiHostingQuota) {
  return quota.used >= quota.limit;
}

export function wouldExceedQuota(quota: AiHostingQuota, incomingUsage: number) {
  return quota.used + incomingUsage > quota.limit;
}
