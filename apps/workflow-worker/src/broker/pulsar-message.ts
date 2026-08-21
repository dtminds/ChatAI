import type { WorkflowBrokerMessage } from "./types.js";

type PulsarMessageLike = {
  getData(): Buffer;
  getMessageId(): { toString(): string };
  getPartitionKey(): string;
  getProperties(): Record<string, string>;
  getRedeliveryCount(): number;
  getTopicName(): string;
};

type PulsarConsumerLike<TMessage> = {
  acknowledge(message: TMessage): Promise<unknown>;
  negativeAcknowledge(message: TMessage): void;
};

export function createPulsarBrokerMessage<TMessage extends PulsarMessageLike>(
  message: TMessage,
  consumer: PulsarConsumerLike<TMessage>,
): WorkflowBrokerMessage {
  let settled = false;
  return {
    ack: async () => {
      if (settled) return;
      await consumer.acknowledge(message);
      settled = true;
    },
    data: message.getData(),
    id: message.getMessageId().toString(),
    key: message.getPartitionKey() || null,
    negativeAck: () => {
      if (settled) return;
      settled = true;
      consumer.negativeAcknowledge(message);
    },
    properties: Object.freeze({ ...message.getProperties() }),
    redeliveryCount: message.getRedeliveryCount(),
    topic: message.getTopicName(),
  };
}
