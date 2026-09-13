import type { WorkflowMarketingMessageExecutionConfig } from "@chatai/contracts";

export type WorkflowMarketingMessagePushInput = {
  bizId: number;
  externalUserId: number;
  planId: number;
  signal: AbortSignal;
  uid: number;
};

export type WorkflowMarketingMessageQueryInput = {
  bizId: number;
  signal: AbortSignal;
  uid: number;
};

export interface WorkflowMarketingMessagePort {
  pushUser(input: WorkflowMarketingMessagePushInput): Promise<void>;
  queryPushResult(input: WorkflowMarketingMessageQueryInput): Promise<{ pushSuccess: boolean }>;
}

export function getWorkflowMarketingMessageDueAt(
  config: WorkflowMarketingMessageExecutionConfig,
  pushedAt: Date,
) {
  const unitMilliseconds = config.wait.unit === "minute" ? 60_000 : 3_600_000;
  return new Date(pushedAt.getTime() + config.wait.duration * unitMilliseconds);
}
