import type {
  WorkflowOutboxRecord,
  WorkflowOutboxRepository,
} from "@chatai/workflow-runtime";
import type { WorkflowBroker } from "./broker/types.js";
import { chunksOf } from "./chunks.js";

const WORKFLOW_OUTBOX_MAX_CONSECUTIVE_BATCHES = 10;

type OutboxPublisherRepository = Pick<
  WorkflowOutboxRepository,
  "claimOutboxBatch" | "markOutboxDead" | "markOutboxFailed" | "markOutboxSentBatch"
>;

type WorkflowOutboxPublisherInput = {
  broker: Pick<WorkflowBroker, "publish">;
  leaseDurationMs: number;
  leaseOwner: string;
  limit: number;
  maxAttempts: number;
  maxRetryDelayMs: number;
  now?: () => Date;
  publishConcurrency: number;
  repository: OutboxPublisherRepository;
  retryDelayMs: number;
  topic: string;
};

type WorkflowOutboxPublishResult = {
  claimed: number;
  dead: number;
  failed: number;
  sent: number;
};

export async function publishWorkflowOutbox(
  input: WorkflowOutboxPublisherInput,
): Promise<WorkflowOutboxPublishResult> {
  const result = emptyResult();
  for (let batch = 0; batch < WORKFLOW_OUTBOX_MAX_CONSECUTIVE_BATCHES; batch += 1) {
    const current = await publishWorkflowOutboxBatch(input);
    addResult(result, current);
    if (current.claimed < input.limit) break;
  }
  return result;
}

export async function publishWorkflowOutboxBatch(
  input: WorkflowOutboxPublisherInput,
): Promise<WorkflowOutboxPublishResult> {
  assertPublishConcurrency(input.publishConcurrency);
  const now = input.now?.() ?? new Date();
  const records = await input.repository.claimOutboxBatch({
    leaseExpiresAt: new Date(now.getTime() + input.leaseDurationMs),
    leaseOwner: input.leaseOwner,
    limit: input.limit,
    now,
  });
  const result = { ...emptyResult(), claimed: records.length };
  for (const recordsToPublish of chunksOf(records, input.publishConcurrency)) {
    await publishOutboxChunk(input, recordsToPublish, result);
  }
  return result;
}

async function publishOutboxChunk(
  input: WorkflowOutboxPublisherInput,
  records: WorkflowOutboxRecord[],
  result: WorkflowOutboxPublishResult,
) {
  const outcomes = await Promise.all(records.map(async record => {
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
      return { kind: "sent" as const, record };
    } catch {
      return { kind: "failed" as const, record };
    }
  }));
  const errors: unknown[] = [];
  const sentIds = outcomes.flatMap(outcome => outcome.kind === "sent" ? [outcome.record.id] : []);
  if (sentIds.length > 0) {
    try {
      const sent = await input.repository.markOutboxSentBatch({
        ids: sentIds,
        leaseOwner: input.leaseOwner,
        sentAt: input.now?.() ?? new Date(),
      });
      if (sent !== sentIds.length) {
        throw new Error(
          `Workflow Outbox sent lease mismatch: expected ${sentIds.length}, updated ${sent}`,
        );
      }
      result.sent += sent;
    } catch (error) {
      errors.push(error);
    }
  }
  for (const outcome of outcomes) {
    if (outcome.kind !== "failed") continue;
    try {
      await handlePublishFailure(input, outcome.record);
      if (outcome.record.attempt >= input.maxAttempts) result.dead += 1;
      else result.failed += 1;
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) {
    throw new AggregateError(errors, "Workflow Outbox chunk persistence failed");
  }
}

async function handlePublishFailure(
  input: WorkflowOutboxPublisherInput,
  record: WorkflowOutboxRecord,
) {
  const failedAt = input.now?.() ?? new Date();
  if (record.attempt >= input.maxAttempts) {
    if (!await input.repository.markOutboxDead({
      failedAt,
      id: record.id,
      leaseOwner: input.leaseOwner,
    })) throw new Error("Workflow Outbox lease was lost while marking delivery dead");
    return;
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
}

function emptyResult(): WorkflowOutboxPublishResult {
  return { claimed: 0, dead: 0, failed: 0, sent: 0 };
}

function addResult(
  result: WorkflowOutboxPublishResult,
  current: WorkflowOutboxPublishResult,
) {
  result.claimed += current.claimed;
  result.dead += current.dead;
  result.failed += current.failed;
  result.sent += current.sent;
}

function assertPublishConcurrency(value: number) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("Workflow Outbox publish concurrency must be a positive safe integer");
  }
}
