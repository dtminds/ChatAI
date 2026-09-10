import {
  isAiUsageEvent,
  normalizeAiUsageUtcInstant,
  type AiUsageEvent,
} from "@chatai/contracts";

type WithoutSchemaVersion<Event> = Event extends AiUsageEvent
  ? Omit<Event, "schemaVersion">
  : never;

export type AiUsageEventInput = WithoutSchemaVersion<AiUsageEvent>;

export class InvalidAiUsageEventError extends Error {
  constructor() {
    super("Invalid AI usage event");
    this.name = "InvalidAiUsageEventError";
  }
}

export function createAiUsageEvent(input: AiUsageEventInput): AiUsageEvent {
  const occurredAt = normalizeAiUsageUtcInstant(input.occurredAt);
  const event = { ...input, occurredAt, schemaVersion: 1 };
  if (!isAiUsageEvent(event)) {
    throw new InvalidAiUsageEventError();
  }
  return event;
}
