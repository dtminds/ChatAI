import type { WorkflowOutboxRepository } from "@chatai/workflow-runtime";
import type { WorkflowBroker } from "./broker/types.js";

type OutboxPublisherRepository = Pick<
  WorkflowOutboxRepository,
  "claimOutboxBatch" | "markOutboxDead" | "markOutboxFailed" | "markOutboxSent"
>;

export async function publishWorkflowOutboxBatch(input: {
  broker: Pick<WorkflowBroker, "publish">;
  leaseDurationMs: number;
  leaseOwner: string;
  limit: number;
  maxAttempts: number;
  maxRetryDelayMs: number;
  now?: () => Date;
  repository: OutboxPublisherRepository;
  retryDelayMs: number;
  topic: string;
}) {
  const now = input.now?.() ?? new Date();
  const records = await input.repository.claimOutboxBatch({
    leaseExpiresAt: new Date(now.getTime() + input.leaseDurationMs),
    leaseOwner: input.leaseOwner,
    limit: input.limit,
    now,
  });
  const result = { claimed: records.length, dead: 0, failed: 0, sent: 0 };
  for (const record of records) {
    try {
      await input.broker.publish({
        data: Buffer.from(JSON.stringify(record.payload)),
        key: record.payload.runId,
        properties: {
          eventType: record.eventType,
          outboxId: record.id,
        },
        topic: input.topic,
      });
    } catch (error) {
      const failedAt = input.now?.() ?? new Date();
      if (record.attempt >= input.maxAttempts) {
        if (!await input.repository.markOutboxDead({
          id: record.id,
          leaseOwner: input.leaseOwner,
        })) throw new Error("Workflow Outbox lease was lost while marking delivery dead");
        result.dead += 1;
        continue;
      }
      const retryDelayMs = Math.min(
        input.retryDelayMs * 2 ** Math.max(0, record.attempt - 1),
        input.maxRetryDelayMs,
      );
      if (!await input.repository.markOutboxFailed({
        id: record.id,
        leaseOwner: input.leaseOwner,
        nextAttemptAt: new Date(failedAt.getTime() + retryDelayMs),
      })) throw new Error("Workflow Outbox lease was lost while scheduling retry");
      result.failed += 1;
      continue;
    }
    if (!await input.repository.markOutboxSent({
      id: record.id,
      leaseOwner: input.leaseOwner,
      sentAt: input.now?.() ?? new Date(),
    })) throw new Error("Workflow Outbox lease was lost after publish");
    result.sent += 1;
  }
  return result;
}
