import {
  WORKFLOW_AI_COLLECT_DIRECTIVE_TYPE,
  type WorkflowAiCollectRepository,
  type WorkflowConversationDirectivePort,
} from "@chatai/workflow-runtime";

export async function processWorkflowConversationDirectiveDisableBatch(input: {
  leaseDurationMs: number;
  leaseOwner: string;
  limit: number;
  maxRetryDelayMs: number;
  now?: () => Date;
  port: WorkflowConversationDirectivePort;
  repository: WorkflowAiCollectRepository;
  retryDelayMs: number;
  timeoutMs: number;
}) {
  const now = input.now ?? (() => new Date());
  const startedAt = now();
  const states = await input.repository.claimAiCollectDirectiveDisableBatch({
    leaseExpiresAt: new Date(startedAt.getTime() + input.leaseDurationMs),
    leaseOwner: input.leaseOwner,
    limit: input.limit,
    now: startedAt,
  });
  const result = { claimed: states.length, disabled: 0, retried: 0 };
  await Promise.all(states.map(async state => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), input.timeoutMs);
    try {
      await input.port.disable({
        bizId: state.bizId,
        reason: state.disableReason ?? "workflow-stopped",
        signal: controller.signal,
        type: WORKFLOW_AI_COLLECT_DIRECTIVE_TYPE,
        uid: state.uid,
      });
      if (await input.repository.completeAiCollectDirectiveDisable({
        leaseOwner: input.leaseOwner,
        now: now(),
        taskId: state.taskId,
        uid: state.uid,
      })) result.disabled += 1;
    } catch {
      const delayMs = Math.min(
        input.retryDelayMs * 2 ** Math.max(0, state.directiveAttempt - 1),
        input.maxRetryDelayMs,
      );
      if (await input.repository.retryAiCollectDirectiveDisable({
        leaseOwner: input.leaseOwner,
        nextAttemptAt: new Date(now().getTime() + delayMs),
        now: now(),
        taskId: state.taskId,
        uid: state.uid,
      })) result.retried += 1;
    } finally {
      clearTimeout(timer);
    }
  }));
  return result;
}
