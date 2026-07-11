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
