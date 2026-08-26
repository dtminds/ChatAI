import { createHash } from "node:crypto";

export type WorkflowDirectEntryEndpointPort = {
  getEndpointKey(input: { uid: number; workflowId: string }): Promise<string>;
};

export class MockWorkflowDirectEntryEndpointPort implements WorkflowDirectEntryEndpointPort {
  async getEndpointKey(input: { uid: number; workflowId: string }) {
    const digest = createHash("sha256")
      .update(`workflow-direct-entry:${input.uid}:${input.workflowId}`)
      .digest("base64url");
    return `mock.${digest}`;
  }
}
