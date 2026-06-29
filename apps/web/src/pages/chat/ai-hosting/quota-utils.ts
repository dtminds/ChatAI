import type { AiHostingQuota } from "@chatai/contracts";

export function isQuotaReached(quota: AiHostingQuota | null) {
  return quota != null && quota.used >= quota.limit;
}

export function formatQuotaText(quota: AiHostingQuota, unit: string) {
  return `已用 ${quota.used}/${quota.limit} ${unit}`;
}
