import { describe, expect, it, vi } from "vitest";
import { createPulsarBrokerMessage } from "../src/broker/pulsar-message.js";

describe("Pulsar broker message", () => {
  it("allows negative acknowledgement when asynchronous ACK fails", async () => {
    const source = {
      acknowledge: vi.fn(async () => { throw new Error("ack failed"); }),
      negativeAcknowledge: vi.fn(),
    };
    const message = createPulsarBrokerMessage(pulsarMessage() as never, source as never);

    await expect(message.ack()).rejects.toThrow("ack failed");
    message.negativeAck();

    expect(source.negativeAcknowledge).toHaveBeenCalledTimes(1);
  });
});

function pulsarMessage() {
  return {
    getData: () => Buffer.from("payload"),
    getMessageId: () => ({ toString: () => "message-1" }),
    getPartitionKey: () => "key-1",
    getProperties: () => ({}),
    getRedeliveryCount: () => 0,
    getTopicName: () => "topic",
  };
}
