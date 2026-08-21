import { readFileSync } from "node:fs";
import {
  createWorkflowEntryPartitionKey,
  validateWorkflowEntryEvent,
} from "@chatai/contracts";
import type { WorkflowBroker } from "../../src/broker/types.js";

const fixtureRoot = new URL(
  "../../../../packages/contracts/test/fixtures/workflow/",
  import.meta.url,
);

export async function publishWorkflowEntryFixture(input: {
  broker: WorkflowBroker;
  fixturePath: string;
  topic: string;
}) {
  const raw = readFileSync(new URL(input.fixturePath, fixtureRoot));
  const parsed = validateWorkflowEntryEvent(JSON.parse(raw.toString("utf8")), {
    encodedByteLength: raw.byteLength,
  });
  if (parsed.kind !== "accepted") {
    throw new Error(`Invalid Workflow Entry fixture: ${input.fixturePath}`);
  }
  return input.broker.publish({
    data: raw,
    key: createWorkflowEntryPartitionKey(parsed.event),
    topic: input.topic,
  });
}
