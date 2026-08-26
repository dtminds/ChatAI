const DEFAULT_CUSTOMER_LIMIT = 100;
const CANDIDATE_SESSION_MULTIPLIER = 2;
const MIN_CANDIDATE_SESSION_LIMIT = 200;
const SUPPORTED_CUSTOMER_LIMITS = new Set([100, 200, 500]);

export const USER_MEMORY_SCHEDULE = "02:00" as const;
export const USER_MEMORY_TIMEZONE = "Asia/Shanghai" as const;
export const USER_MEMORY_PLATFORM = 5;

export interface UserMemoryCustomerLimitResolver {
  resolve(uid: number): number;
}

export const DEFAULT_USER_MEMORY_CUSTOMER_LIMIT_RESOLVER: UserMemoryCustomerLimitResolver = {
  resolve: () => DEFAULT_CUSTOMER_LIMIT,
};

export function resolveUserMemoryCustomerLimit(
  resolver: UserMemoryCustomerLimitResolver,
  uid: number,
) {
  const value = resolver.resolve(uid);

  if (!Number.isSafeInteger(value) || !SUPPORTED_CUSTOMER_LIMITS.has(value)) {
    throw new Error("AGENT_USER_MEMORY_CUSTOMER_LIMIT_UNSUPPORTED");
  }

  return value;
}

export function resolveCandidateSessionLimit(customerLimit: number) {
  return Math.max(
    MIN_CANDIDATE_SESSION_LIMIT,
    customerLimit * CANDIDATE_SESSION_MULTIPLIER,
  );
}

export function resolveTerminalRunStatus(counts: {
  success: number;
  failure: number;
  skipped: number;
}) {
  return counts.failure === 0
    ? "succeeded" as const
    : counts.success > 0 || counts.skipped > 0
      ? "partial" as const
      : "failed" as const;
}

export function countUserMemoryRunItems(items: Array<{ status: string }>) {
  return {
    success: items.filter((item) => item.status === "succeeded").length,
    failure: items.filter((item) => item.status === "failed").length,
    skipped: items.filter((item) => item.status === "skipped").length,
  };
}

export function sumUserMemoryChanges(items: Array<{
  memory_added_count: number | null;
  memory_removed_count: number | null;
  memory_updated_count: number | null;
}>) {
  return items.reduce((total, item) => ({
    added: total.added + (item.memory_added_count ?? 0),
    removed: total.removed + (item.memory_removed_count ?? 0),
    updated: total.updated + (item.memory_updated_count ?? 0),
  }), { added: 0, removed: 0, updated: 0 });
}
