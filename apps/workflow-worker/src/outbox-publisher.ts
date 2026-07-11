import type { WorkflowOutboxRepository } from "@chatai/workflow-runtime";
import type { WorkflowBroker } from "./broker/types.js";

type OutboxPublisherRepository = Pick<
  WorkflowOutboxRepository,
  "claimOutboxBatch" | "markOutboxFailed" | "markOutboxSent"
>;

export async function publishWorkflowOutboxBatch(input: {
  broker: Pick<WorkflowBroker, "publish">;
  leaseDurationMs: number;
  leaseOwner: string;
  limit: number;
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
  const result = { claimed: records.length, failed: 0, sent: 0 };
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
      await input.repository.markOutboxFailed({
        id: record.id,
        leaseOwner: input.leaseOwner,
        nextAttemptAt: new Date((input.now?.() ?? new Date()).getTime() + input.retryDelayMs),
      });
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
