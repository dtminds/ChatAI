import type { WorkflowTaskMessage } from "@chatai/contracts";
import { WorkflowRuntimeError } from "@chatai/workflow-runtime";
import { describe, expect, it, vi } from "vitest";
import { createTaskConsumerHandler } from "../src/task-consumer.js";
import { createBrokerMessage } from "./helpers/broker-message.js";

describe("workflow task consumer", () => {
  it("executes a valid task and ACKs only after the runtime service resolves", async () => {
    const order: string[] = [];
    const executeTask = vi.fn(async () => { order.push("commit"); });
    const message = createBrokerMessage(taskMessage(), {
      onAck: () => order.push("ack"),
    });
    const handler = createTaskConsumerHandler({
      now: () => new Date("2026-07-12T00:00:00.000Z"),
      runtimeService: { executeTask },
      workerId: "worker-1",
    });

    await handler(message);

    expect(executeTask).toHaveBeenCalledWith(expect.objectContaining({
      messageId: "message-1",
      now: new Date("2026-07-12T00:00:00.000Z"),
      taskId: "7",
      taskVersion: 3,
      uid: 9,
      workerId: "worker-1",
    }));
    expect(order).toEqual(["commit", "ack"]);
  });

  it.each([
    "WORKFLOW_RUNTIME_PAUSED",
    "WORKFLOW_RUNTIME_UNAVAILABLE",
    "WORKFLOW_TASK_STALE",
    "WORKFLOW_TASK_ALREADY_PROCESSED",
    "WORKFLOW_TASK_NOT_FOUND",
  ])("ACKs the persisted or terminal boundary %s", async (code) => {
    const message = createBrokerMessage(taskMessage());
    const handler = createTaskConsumerHandler({
      runtimeService: {
        executeTask: vi.fn(async () => { throw new WorkflowRuntimeError(code, code); }),
      },
      workerId: "worker-1",
    });

    await handler(message);

    expect(message.ack).toHaveBeenCalledTimes(1);
    expect(message.negativeAck).not.toHaveBeenCalled();
  });

  it("NACKs malformed messages and transient runtime failures", async () => {
    const malformed = createBrokerMessage({ taskId: "invalid" });
    const transient = createBrokerMessage(taskMessage());
    const handler = createTaskConsumerHandler({
      runtimeService: { executeTask: vi.fn(async () => { throw new Error("database unavailable"); }) },
      workerId: "worker-1",
    });

    await handler(malformed);
    await handler(transient);

    expect(malformed.negativeAck).toHaveBeenCalledTimes(1);
    expect(transient.negativeAck).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      event: "workflow.action.retry.scheduled",
      result: {
        errorCode: "DOWNSTREAM_TEMPORARY",
        failureKind: "unknown",
        kind: "retry-scheduled",
        retryAt: new Date("2026-07-12T00:00:05.000Z"),
        task: { attempt: 1 },
      },
    },
    {
      event: "workflow.action.failed",
      result: {
        diagnosticMessage: "Java messaging API returned 503",
        errorCode: "DOWNSTREAM_REJECTED",
        failureKind: "terminal",
        kind: "failed",
        task: { attempt: 1 },
      },
    },
    {
      event: "workflow.node.failed",
      result: {
        diagnosticMessage: "Workflow node-output was 4110 bytes; limit is 4096 bytes",
        errorCode: "WORKFLOW_NODE_OUTPUT_TOO_LARGE",
        kind: "node-failed",
        nodeId: "branch",
        nodeKind: "branch",
      },
    },
  ])("logs and ACKs the persisted $event outcome", async ({ event, result }) => {
    const logger = { warn: vi.fn() };
    const message = createBrokerMessage(taskMessage());
    const handler = createTaskConsumerHandler({
      logger,
      runtimeService: { executeTask: vi.fn(async () => result) },
      workerId: "worker-1",
    });

    await handler(message);

    expect(message.ack).toHaveBeenCalledTimes(1);
    expect(message.negativeAck).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({
      ...(result.diagnosticMessage ? { diagnosticMessage: result.diagnosticMessage } : {}),
      errorCode: result.errorCode,
      event,
      ...("failureKind" in result ? { failureKind: result.failureKind } : {}),
      ...("nodeId" in result ? { nodeId: result.nodeId } : {}),
      ...("nodeKind" in result ? { nodeKind: result.nodeKind } : {}),
      runId: "5",
      taskId: "7",
      uid: "9",
    }), expect.any(String));
  });
});

function taskMessage(): WorkflowTaskMessage {
  return {
    messageId: "message-1",
    occurredAt: "2026-07-11T00:00:00.000Z",
    runId: "5",
    shardId: 1,
    taskId: "7",
    taskVersion: 3,
    uid: "9",
  };
}
