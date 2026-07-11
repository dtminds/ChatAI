import Pulsar from "pulsar-client";
import type {
  WorkflowBroker,
  WorkflowBrokerMessage,
  WorkflowBrokerPublishInput,
  WorkflowBrokerSubscribeInput,
  WorkflowBrokerSubscription,
} from "./types.js";

export class PulsarWorkflowBroker implements WorkflowBroker {
  private readonly client: Pulsar.Client;
  private readonly consumers = new Set<Pulsar.Consumer>();
  private readonly producers = new Map<string, Pulsar.Producer>();
  private closed = false;

  constructor(input: { serviceUrl: string; token: string }) {
    this.client = new Pulsar.Client({
      authentication: new Pulsar.AuthenticationToken({ token: input.token }),
      serviceUrl: input.serviceUrl,
    });
  }

  async publish(input: WorkflowBrokerPublishInput) {
    this.assertOpen();
    const producer = await this.getProducer(input.topic);
    const messageId = await producer.send({
      data: input.data,
      partitionKey: input.key,
      properties: input.properties,
    });
    return { messageId: messageId.toString() };
  }

  async subscribe(input: WorkflowBrokerSubscribeInput): Promise<WorkflowBrokerSubscription> {
    this.assertOpen();
    const consumer = await this.client.subscribe({
      deadLetterPolicy: input.deadLetterTopic ? {
        deadLetterTopic: input.deadLetterTopic,
        maxRedeliverCount: input.maxRedeliverCount,
      } : undefined,
      listener: (message, source) => {
        const wrapped = createMessage(message, source);
        void Promise.resolve(input.handler(wrapped)).catch(() => wrapped.negativeAck());
      },
      subscription: input.subscription,
      subscriptionInitialPosition: "Earliest",
      subscriptionType: input.type,
      topic: input.topic,
    });
    this.consumers.add(consumer);
    return {
      close: async () => {
        if (!this.consumers.delete(consumer)) return;
        await consumer.close();
      },
    };
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    await Promise.all([...this.consumers].map(async consumer => consumer.close()));
    await Promise.all([...this.producers.values()].map(async producer => {
      await producer.flush();
      await producer.close();
    }));
    this.consumers.clear();
    this.producers.clear();
    await this.client.close();
  }

  private async getProducer(topic: string) {
    const existing = this.producers.get(topic);
    if (existing) return existing;
    const producer = await this.client.createProducer({
      batchingEnabled: true,
      batchingMaxPublishDelayMs: 10,
      blockIfQueueFull: true,
      topic,
    });
    this.producers.set(topic, producer);
    return producer;
  }

  private assertOpen() {
    if (this.closed) throw new Error("Workflow broker is closed");
  }
}

function createMessage(message: Pulsar.Message, consumer: Pulsar.Consumer): WorkflowBrokerMessage {
  let settled = false;
  return {
    ack: async () => {
      if (settled) return;
      settled = true;
      await consumer.acknowledge(message);
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
