import Pulsar from "pulsar-client";
import type {
  WorkflowBroker,
  WorkflowBrokerPublishInput,
  WorkflowBrokerSubscribeInput,
  WorkflowBrokerSubscription,
} from "./types.js";
import { createPulsarBrokerMessage } from "./pulsar-message.js";

export class PulsarWorkflowBroker implements WorkflowBroker {
  private readonly client: Pulsar.Client;
  private readonly consumers = new Map<Pulsar.Consumer, {
    closing: boolean;
    loops: Promise<void>[];
  }>();
  private readonly producers = new Map<string, Pulsar.Producer>();
  private closed = false;

  constructor(input: { serviceUrl: string; token: string }) {
    this.client = new Pulsar.Client({
      authentication: new Pulsar.AuthenticationToken({ token: input.token }),
      serviceUrl: input.serviceUrl,
    });
  }

  async checkHealth(topics: string[]) {
    this.assertOpen();
    await Promise.all(topics.map(topic => this.client.getPartitionsForTopic(topic)));
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
      receiverQueueSize: input.maxInFlight,
      receiverQueueSizeAcrossPartitions: input.maxInFlight,
      subscription: input.subscription,
      subscriptionInitialPosition: "Earliest",
      subscriptionType: input.type,
      topic: input.topic,
    });
    const state = { closing: false, loops: [] as Promise<void>[] };
    state.loops = startConcurrentReceiveLoops({
      handle: async message => {
        const wrapped = createPulsarBrokerMessage(message, consumer);
        try {
          await input.handler(wrapped);
        } catch {
          wrapped.negativeAck();
        }
      },
      isClosing: () => state.closing,
      maxInFlight: input.maxInFlight,
      receive: () => consumer.receive(),
    });
    this.consumers.set(consumer, state);
    return {
      close: () => this.closeConsumer(consumer),
      isConnected: () => !this.closed && this.consumers.has(consumer) && consumer.isConnected(),
    };
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    await Promise.all([...this.consumers.keys()].map(consumer => this.closeConsumer(consumer)));
    await Promise.all([...this.producers.values()].map(async producer => {
      await producer.flush();
      await producer.close();
    }));
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

  private async closeConsumer(consumer: Pulsar.Consumer) {
    const state = this.consumers.get(consumer);
    if (!state) return;
    state.closing = true;
    this.consumers.delete(consumer);
    try {
      await consumer.close();
    } finally {
      await Promise.all(state.loops);
    }
  }

  private assertOpen() {
    if (this.closed) throw new Error("Workflow broker is closed");
  }
}

export function startConcurrentReceiveLoops<T>(input: {
  handle(value: T): Promise<void>;
  isClosing(): boolean;
  maxInFlight: number;
  receive(): Promise<T>;
}) {
  if (!Number.isSafeInteger(input.maxInFlight) || input.maxInFlight <= 0) {
    throw new Error("Workflow broker maxInFlight must be a positive safe integer");
  }
  return Array.from({ length: input.maxInFlight }, async () => {
    while (!input.isClosing()) {
      let value: T;
      try {
        value = await input.receive();
      } catch {
        if (input.isClosing()) return;
        await new Promise(resolve => setTimeout(resolve, 100));
        continue;
      }
      await input.handle(value);
    }
  });
}
