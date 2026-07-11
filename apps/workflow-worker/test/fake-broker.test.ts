import { describe, expect, it, vi } from "vitest";
import { FakeWorkflowBroker } from "../src/broker/fake.js";

describe("FakeWorkflowBroker", () => {
  it("delivers messages through independent Shared subscriptions and closes gracefully", async () => {
    const broker = new FakeWorkflowBroker();
    const entry = vi.fn(async message => message.ack());
    const task = vi.fn(async message => message.ack());

    await broker.subscribe({ handler: entry, subscription: "entry-sub", topic: "entry", type: "Shared" });
    await broker.subscribe({ handler: task, subscription: "task-sub", topic: "task", type: "Shared" });
    await broker.publish({ data: Buffer.from("entry"), key: "subject-1", topic: "entry" });
    await broker.publish({ data: Buffer.from("task"), key: "run-1", topic: "task" });
    await broker.drain();

    expect(entry).toHaveBeenCalledTimes(1);
    expect(task).toHaveBeenCalledTimes(1);
    await broker.close();
    await expect(broker.publish({ data: Buffer.from("late"), topic: "entry" }))
      .rejects.toThrow("closed");
  });

  it("redelivers negative acknowledgements and routes exhausted messages to the DLQ", async () => {
    const broker = new FakeWorkflowBroker();
    const deliveries: number[] = [];

    await broker.subscribe({
      deadLetterTopic: "entry-dlq",
      handler: async (message) => {
        deliveries.push(message.redeliveryCount);
        message.negativeAck();
      },
      maxRedeliverCount: 2,
      subscription: "entry-sub",
      topic: "entry",
      type: "Shared",
    });
    await broker.publish({ data: Buffer.from("bad"), topic: "entry" });
    await broker.drain();

    expect(deliveries).toEqual([0, 1, 2]);
    expect(broker.getPublished("entry-dlq")).toHaveLength(1);
  });
});
