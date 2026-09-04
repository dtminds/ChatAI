import { beforeEach, describe, expect, it, vi } from "vitest";

const pulsar = vi.hoisted(() => ({
  clientClose: vi.fn(async () => undefined),
  createProducer: vi.fn(),
  producerClose: vi.fn(async () => undefined),
  producerFlush: vi.fn(async () => undefined),
  producerSend: vi.fn(async () => ({ toString: () => "message-1" })),
  subscribe: vi.fn(),
}));

vi.mock("pulsar-client", () => ({
  default: {
    AuthenticationToken: class AuthenticationToken {},
    Client: class Client {
      close = pulsar.clientClose;
      createProducer = pulsar.createProducer;
      subscribe = pulsar.subscribe;
    },
  },
}));

import { PulsarWorkflowBroker } from "../src/broker/pulsar.js";

describe("Pulsar workflow broker", () => {
  beforeEach(() => {
    pulsar.createProducer.mockReset();
    pulsar.subscribe.mockReset();
  });

  it("always creates Shared subscriptions", async () => {
    pulsar.subscribe.mockRejectedValueOnce(new Error("stop after config capture"));
    const broker = new PulsarWorkflowBroker({
      serviceUrl: "pulsar://broker.example.com:6650",
      token: "token",
    });

    await expect(broker.subscribe({
      handler: async () => undefined,
      maxInFlight: 2,
      subscription: "entry-sub",
      topic: "entry-topic",
    })).rejects.toThrow("stop after config capture");
    expect(pulsar.subscribe).toHaveBeenCalledWith(expect.objectContaining({
      subscription: "entry-sub",
      subscriptionType: "Shared",
      topic: "entry-topic",
    }));

    await broker.close();
  });

  it("shares one in-flight Producer creation across concurrent publishes to a topic", async () => {
    let resolveProducer: ((producer: unknown) => void) | undefined;
    const producerCreation = new Promise(resolve => {
      resolveProducer = resolve;
    });
    pulsar.createProducer.mockImplementation(() => producerCreation);
    const producer = {
      close: pulsar.producerClose,
      flush: pulsar.producerFlush,
      send: pulsar.producerSend,
    };
    const broker = new PulsarWorkflowBroker({
      serviceUrl: "pulsar://broker.example.com:6650",
      token: "token",
    });

    const publishes = ["run-1", "run-2", "run-3"].map(key => broker.publish({
      data: Buffer.from(key),
      key,
      topic: "task-topic",
    }));
    await vi.waitFor(() => expect(pulsar.createProducer).toHaveBeenCalledTimes(1));
    resolveProducer?.(producer);

    await expect(Promise.all(publishes)).resolves.toEqual([
      { messageId: "message-1" },
      { messageId: "message-1" },
      { messageId: "message-1" },
    ]);
    expect(pulsar.producerSend.mock.calls.map(([message]) => message.partitionKey))
      .toEqual(["run-1", "run-2", "run-3"]);

    await broker.close();
    expect(pulsar.producerFlush).toHaveBeenCalledTimes(1);
    expect(pulsar.producerClose).toHaveBeenCalledTimes(1);
  });

  it("retries Producer creation after an initialization failure", async () => {
    const producer = {
      close: pulsar.producerClose,
      flush: pulsar.producerFlush,
      send: pulsar.producerSend,
    };
    pulsar.createProducer
      .mockRejectedValueOnce(new Error("broker unavailable"))
      .mockResolvedValueOnce(producer);
    const broker = new PulsarWorkflowBroker({
      serviceUrl: "pulsar://broker.example.com:6650",
      token: "token",
    });
    const input = {
      data: Buffer.from("run-1"),
      key: "run-1",
      topic: "task-topic",
    };

    await expect(broker.publish(input)).rejects.toThrow("broker unavailable");
    await expect(broker.publish(input)).resolves.toEqual({ messageId: "message-1" });
    expect(pulsar.createProducer).toHaveBeenCalledTimes(2);

    await broker.close();
  });
});
