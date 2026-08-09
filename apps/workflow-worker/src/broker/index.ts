import { FakeWorkflowBroker } from "./fake.js";
import type { WorkflowBroker } from "./types.js";

export async function createWorkflowBroker(input: {
  broker: "fake" | "pulsar";
  serviceUrl: string | null;
  token: string | null;
}): Promise<WorkflowBroker> {
  if (input.broker === "fake") return new FakeWorkflowBroker();
  if (!input.serviceUrl || !input.token) throw new Error("Missing required Workflow Pulsar configuration");
  const { PulsarWorkflowBroker } = await import("./pulsar.js");
  return new PulsarWorkflowBroker({ serviceUrl: input.serviceUrl, token: input.token });
}

export * from "./fake.js";
export * from "./types.js";
