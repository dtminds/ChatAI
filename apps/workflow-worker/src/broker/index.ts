import type { WorkflowBroker } from "./types.js";

export async function createWorkflowBroker(input: {
  serviceUrl: string | null;
  token: string | null;
}): Promise<WorkflowBroker> {
  if (!input.serviceUrl || !input.token) throw new Error("Missing required Workflow Pulsar configuration");
  const { PulsarWorkflowBroker } = await import("./pulsar.js");
  return new PulsarWorkflowBroker({ serviceUrl: input.serviceUrl, token: input.token });
}

export * from "./types.js";
