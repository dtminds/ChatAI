export type WorkflowBrokerPublishInput = {
  data: Buffer;
  key?: string;
  properties?: Record<string, string>;
  topic: string;
};

export type WorkflowBrokerMessage = {
  ack(): Promise<void>;
  readonly data: Buffer;
  readonly id: string;
  readonly key: string | null;
  negativeAck(): void;
  readonly properties: Readonly<Record<string, string>>;
  readonly redeliveryCount: number;
  readonly topic: string;
};

export type WorkflowBrokerSubscription = {
  close(): Promise<void>;
};

export type WorkflowBrokerSubscribeInput = {
  deadLetterTopic?: string;
  handler(message: WorkflowBrokerMessage): Promise<void> | void;
  maxRedeliverCount?: number;
  subscription: string;
  topic: string;
  type: "Shared";
};

export interface WorkflowBroker {
  close(): Promise<void>;
  publish(input: WorkflowBrokerPublishInput): Promise<{ messageId: string }>;
  subscribe(input: WorkflowBrokerSubscribeInput): Promise<WorkflowBrokerSubscription>;
}
