import { describe, expect, it } from "vitest";
import { createWorkflowBroker } from "../src/broker/index.js";

describe("workflow broker factory", () => {
  it("rejects startup without the required Pulsar connection", async () => {
    await expect(createWorkflowBroker({
      serviceUrl: null,
      token: null,
    })).rejects.toThrow("Missing required Workflow Pulsar configuration");
  });
});
