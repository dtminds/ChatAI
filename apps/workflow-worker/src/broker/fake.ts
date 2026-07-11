import type {
  WorkflowBroker,
  WorkflowBrokerMessage,
  WorkflowBrokerPublishInput,
  WorkflowBrokerSubscribeInput,
  WorkflowBrokerSubscription,
} from "./types.js";

type StoredMessage = WorkflowBrokerPublishInput & {
  id: string;
  redeliveryCount: number;
};

type SubscriptionState = WorkflowBrokerSubscribeInput & { closed: boolean };

export class FakeWorkflowBroker implements WorkflowBroker {
  private closed = false;
  private draining: Promise<void> = Promise.resolve();
  private nextMessageId = 1n;
  private readonly published = new Map<string, StoredMessage[]>();
  private readonly subscriptions: SubscriptionState[] = [];

  async publish(input: WorkflowBrokerPublishInput) {
    this.assertOpen();
    const message = this.store(input);
    this.scheduleDelivery(message);
    return { messageId: message.id };
  }

  async subscribe(input: WorkflowBrokerSubscribeInput): Promise<WorkflowBrokerSubscription> {
    this.assertOpen();
    const state: SubscriptionState = { ...input, closed: false };
    this.subscriptions.push(state);
    return {
      close: async () => {
        state.closed = true;
      },
    };
  }

  async close() {
    if (this.closed) return;
    await this.drain();
    this.closed = true;
    for (const subscription of this.subscriptions) subscription.closed = true;
  }

  async drain() {
    await this.draining;
  }

  getPublished(topic: string) {
    return (this.published.get(topic) ?? []).map(message => ({
      ...message,
      data: Buffer.from(message.data),
      properties: message.properties ? { ...message.properties } : undefined,
    }));
  }

  private scheduleDelivery(message: StoredMessage) {
    this.draining = this.draining.then(() => this.deliver(message));
  }

  private async deliver(message: StoredMessage) {
    const subscription = this.subscriptions.find(item => !item.closed && item.topic === message.topic);
    if (!subscription) return;

    let decision: "ack" | "negative-ack" | null = null;
    const brokerMessage: WorkflowBrokerMessage = {
      ack: async () => { decision = "ack"; },
      data: Buffer.from(message.data),
      id: message.id,
      key: message.key ?? null,
      negativeAck: () => { decision = "negative-ack"; },
      properties: Object.freeze({ ...(message.properties ?? {}) }),
      redeliveryCount: message.redeliveryCount,
      topic: message.topic,
    };
    try {
      await subscription.handler(brokerMessage);
    } catch {
      decision = "negative-ack";
    }
    if (decision !== "negative-ack") return;

    const maxRedeliverCount = subscription.maxRedeliverCount ?? 0;
    if (message.redeliveryCount >= maxRedeliverCount) {
      if (subscription.deadLetterTopic) {
        this.store({
          data: message.data,
          key: message.key,
          properties: message.properties,
          topic: subscription.deadLetterTopic,
        });
      }
      return;
    }
    await this.deliver({ ...message, redeliveryCount: message.redeliveryCount + 1 });
  }

  private store(input: WorkflowBrokerPublishInput): StoredMessage {
    const message: StoredMessage = {
      ...input,
      data: Buffer.from(input.data),
      id: String(this.nextMessageId++),
      properties: input.properties ? { ...input.properties } : undefined,
      redeliveryCount: 0,
    };
    const messages = this.published.get(input.topic) ?? [];
    messages.push(message);
    this.published.set(input.topic, messages);
    return message;
  }

  private assertOpen() {
    if (this.closed) throw new Error("Workflow broker is closed");
  }
}
