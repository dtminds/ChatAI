import {
  WorkflowInferenceMessageListResultSchema,
} from "@chatai/contracts";
import {
  type WorkflowInferenceRepository,
  type WorkflowChatCompletionPort,
} from "@chatai/workflow-runtime";
import { WorkflowCapabilityExecutionError } from "@chatai/workflow-engine";
import { Value } from "@sinclair/typebox/value";
import { raceAbort } from "./abort-race.js";

export async function processWorkflowInferenceBatch(input: {
  adapter: WorkflowChatCompletionPort;
  heartbeatIntervalMs: number;
  leaseDurationMs: number;
  leaseOwner: string;
  limit: number;
  maxAttempts: number;
  maxRetryDelayMs: number;
  now?: () => Date;
  repository: WorkflowInferenceRepository;
  retryDelayMs: number;
}) {
  const now = input.now ?? (() => new Date());
  const startedAt = now();
  const jobs = await input.repository.claimInferenceBatch({
    leaseExpiresAt: new Date(startedAt.getTime() + input.leaseDurationMs),
    leaseOwner: input.leaseOwner,
    limit: input.limit,
    now: startedAt,
  });
  const result = { claimed: jobs.length, failed: 0, retried: 0, succeeded: 0 };
  await Promise.all(jobs.map(async job => {
    const controller = new AbortController();
    let leaseLost = false;
    const remainingMs = Math.max(0, job.deadlineAt.getTime() - now().getTime());
    const deadlineTimer = setTimeout(() => controller.abort(), remainingMs);
    const heartbeat = setInterval(() => {
      void input.repository.renewInferenceLease({
        id: job.id,
        leaseExpiresAt: new Date(now().getTime() + input.leaseDurationMs),
        leaseOwner: input.leaseOwner,
      }).then(renewed => {
        if (renewed) return;
        leaseLost = true;
        controller.abort();
      }).catch(() => {
        leaseLost = true;
        controller.abort();
      });
    }, input.heartbeatIntervalMs);
    try {
      const output = await raceAbort(input.adapter.execute({
          contractVersion: job.contractVersion,
          deadlineAt: job.deadlineAt,
          executionKey: job.executionKey,
          payload: job.payload,
          signal: controller.signal,
          uid: job.uid,
        }), controller.signal, "Workflow inference aborted");
      const resultSchemaMatches = Value.Check(WorkflowInferenceMessageListResultSchema, output);
      const resultTypeMatches = resultSchemaMatches && (
        job.payload.responseFormat.type === "json"
          ? output.type === "json"
          : output.type === "text"
      );
      if (!resultSchemaMatches || !resultTypeMatches) {
        throw new WorkflowCapabilityExecutionError(
          "terminal",
          "WORKFLOW_INFERENCE_OUTPUT_INVALID",
          "返回结果异常，流程已停止",
          { diagnosticMessage: "Provider inference result did not match the requested response format" },
        );
      }
      if (controller.signal.aborted || now() >= job.deadlineAt) {
        throw new WorkflowCapabilityExecutionError(
          "unknown",
          "WORKFLOW_INFERENCE_DEADLINE_EXCEEDED",
          "执行超时",
        );
      }
      if (await input.repository.completeInference({
        completedAt: now(),
        id: job.id,
        leaseOwner: input.leaseOwner,
        result: output,
      })) result.succeeded += 1;
    } catch (error) {
      const classified = classifyInferenceError(error, controller.signal.aborted, leaseLost);
      const retryDelayMs = Math.min(
        input.retryDelayMs * 2 ** Math.max(0, job.attempt - 1),
        input.maxRetryDelayMs,
      );
      const nextAttemptAt = new Date(now().getTime() + retryDelayMs);
      const canRetry = classified.failureKind !== "terminal"
        && job.attempt < input.maxAttempts
        && nextAttemptAt < job.deadlineAt;
      if (canRetry && await input.repository.retryInference({
        errorCode: classified.errorCode,
        errorMessage: classified.errorMessage,
        failureKind: classified.failureKind,
        id: job.id,
        leaseOwner: input.leaseOwner,
        nextAttemptAt,
      })) {
        result.retried += 1;
      } else if (await input.repository.failInference({
        errorCode: classified.errorCode,
        errorMessage: classified.errorMessage,
        failedAt: now(),
        failureKind: classified.failureKind,
        id: job.id,
        leaseOwner: input.leaseOwner,
      })) {
        result.failed += 1;
      }
    } finally {
      clearInterval(heartbeat);
      clearTimeout(deadlineTimer);
    }
  }));
  const recovered = await input.repository.recoverInferenceJobs({
    limit: input.limit,
    maxAttempts: input.maxAttempts,
    now: now(),
  });
  result.failed += recovered.expired;
  return result;
}

function classifyInferenceError(error: unknown, aborted: boolean, leaseLost: boolean) {
  if (error instanceof WorkflowCapabilityExecutionError) {
    return {
      errorCode: error.code.slice(0, 128),
      errorMessage: error.message.slice(0, 512),
      failureKind: error.failureKind,
    };
  }
  return {
    errorCode: leaseLost
      ? "WORKFLOW_INFERENCE_LEASE_LOST"
      : aborted
        ? "WORKFLOW_INFERENCE_DEADLINE_EXCEEDED"
        : "WORKFLOW_INFERENCE_UNKNOWN",
    errorMessage: leaseLost
      ? "执行已失效"
      : aborted
        ? "执行超时"
        : "执行失败",
    failureKind: "unknown" as const,
  };
}
