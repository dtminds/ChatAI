import { vi } from "vitest";
import type { WorkflowBrokerMessage } from "../../src/broker/types.js";

export function createBrokerMessage(
  value: unknown,
  options: { onAck?: () => void } = {},
): WorkflowBrokerMessage & {
  ack: ReturnType<typeof vi.fn>;
  negativeAck: ReturnType<typeof vi.fn>;
} {
  return {
    ack: vi.fn(async () => { options.onAck?.(); }),
    data: Buffer.from(JSON.stringify(value)),
    id: "broker-message-1",
    key: null,
    negativeAck: vi.fn(),
    properties: {},
    redeliveryCount: 0,
    topic: "topic",
  };
}
