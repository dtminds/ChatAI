import {
  WorkflowInferenceMessageListResultSchema,
  WorkflowJsonObjectSchema,
  type WorkflowJsonObject,
} from "@chatai/contracts";
import { Value } from "@sinclair/typebox/value";
import {
  assertWorkflowRuntimeValue,
  mapWorkflowInferenceResult,
  WORKFLOW_NODE_OUTPUT_MAX_BYTES,
  WorkflowRuntimeValueError,
  type WorkflowLlmTestAttemptRepository,
} from "@chatai/workflow-runtime";
import { WorkflowCapabilityExecutionError } from "@chatai/workflow-engine";
import type { WorkflowLlmTestAdapter } from "./llm-test-adapter.js";

export async function processWorkflowLlmTestAttemptBatch(input: {
  adapter: WorkflowLlmTestAdapter;
  heartbeatIntervalMs: number;
  leaseDurationMs: number;
  leaseOwner: string;
  limit: number;
  now?: () => Date;
  repository: WorkflowLlmTestAttemptRepository;
}) {
  const now = input.now ?? (() => new Date());
  const claimedAt = now();
  const attempts = await input.repository.claimLlmTestAttemptBatch({
    leaseExpiresAt: new Date(claimedAt.getTime() + input.leaseDurationMs),
    leaseOwner: input.leaseOwner,
    limit: input.limit,
    now: claimedAt,
  });
  const result = { claimed: attempts.length, failed: 0, succeeded: 0, timedOut: 0 };

  await Promise.all(attempts.map(async attempt => {
    const controller = new AbortController();
    let leaseLost = false;
    const remainingMs = Math.max(0, attempt.deadlineAt.getTime() - now().getTime());
    const deadlineTimer = setTimeout(() => controller.abort(), remainingMs);
    const heartbeat = setInterval(() => {
      void input.repository.renewLlmTestAttemptLease({
        attemptId: attempt.id,
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
      const inferenceResult = await raceAbort(input.adapter.execute({
        deadlineAt: attempt.deadlineAt,
        executionKey: attempt.executionKey,
        payload: attempt.payload,
        signal: controller.signal,
        uid: attempt.uid,
      }), controller.signal);
      if (!Value.Check(WorkflowInferenceMessageListResultSchema, inferenceResult)) {
        throw new WorkflowCapabilityExecutionError(
          "terminal",
          "WORKFLOW_LLM_TEST_OUTPUT_INVALID",
          "试运行结果无法处理",
        );
      }
      if (controller.signal.aborted || now() >= attempt.deadlineAt) {
        throw new WorkflowCapabilityExecutionError(
          "unknown",
          "WORKFLOW_LLM_TEST_TIMEOUT",
          "试运行超时",
        );
      }
      const { output } = mapWorkflowInferenceResult(attempt.node, inferenceResult);
      if (!Value.Check(WorkflowJsonObjectSchema, output)) {
        throw new WorkflowCapabilityExecutionError(
          "terminal",
          "WORKFLOW_LLM_TEST_OUTPUT_INVALID",
          "试运行结果无法处理",
        );
      }
      assertWorkflowRuntimeValue(output, "node-output", WORKFLOW_NODE_OUTPUT_MAX_BYTES);
      if (await input.repository.completeLlmTestAttempt({
        attemptId: attempt.id,
        completedAt: now(),
        leaseOwner: input.leaseOwner,
        output: output as WorkflowJsonObject,
        result: inferenceResult,
      })) result.succeeded += 1;
    } catch (error) {
      if (leaseLost) return;
      const classified = classifyAttemptError(error, controller.signal.aborted);
      if (await input.repository.failLlmTestAttempt({
        attemptId: attempt.id,
        errorCode: classified.errorCode,
        errorMessage: classified.errorMessage,
        failedAt: now(),
        leaseOwner: input.leaseOwner,
        status: classified.status,
      })) {
        if (classified.status === "timed_out") result.timedOut += 1;
        else result.failed += 1;
      }
    } finally {
      clearInterval(heartbeat);
      clearTimeout(deadlineTimer);
    }
  }));

  result.timedOut += await input.repository.expireTimedOutLlmTestAttempts({
    limit: input.limit,
    now: now(),
  });
  await input.repository.cleanupExpiredLlmTestAttempts({ limit: input.limit, now: now() });
  return result;
}

function raceAbort<T>(operation: Promise<T>, signal: AbortSignal) {
  if (signal.aborted) return Promise.reject(new Error("Workflow LLM test Attempt aborted"));
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(new Error("Workflow LLM test Attempt aborted"));
    signal.addEventListener("abort", onAbort, { once: true });
  });
  return Promise.race([operation, aborted]).finally(() => {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  });
}

function classifyAttemptError(error: unknown, aborted: boolean) {
  if (error instanceof WorkflowCapabilityExecutionError) {
    return {
      errorCode: error.code.slice(0, 128),
      errorMessage: error.message.slice(0, 512),
      status: error.code === "WORKFLOW_LLM_TEST_TIMEOUT"
        ? "timed_out" as const
        : "failed" as const,
    };
  }
  if (error instanceof WorkflowRuntimeValueError) {
    return {
      errorCode: error.reason === "too-large"
        ? "WORKFLOW_LLM_TEST_OUTPUT_TOO_LARGE"
        : "WORKFLOW_LLM_TEST_OUTPUT_INVALID",
      errorMessage: "试运行结果无法处理",
      status: "failed" as const,
    };
  }
  return {
    errorCode: aborted ? "WORKFLOW_LLM_TEST_TIMEOUT" : "WORKFLOW_LLM_TEST_FAILED",
    errorMessage: aborted ? "试运行超时" : "试运行失败",
    status: aborted ? "timed_out" as const : "failed" as const,
  };
}
