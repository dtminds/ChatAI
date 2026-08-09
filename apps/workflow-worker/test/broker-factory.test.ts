import { describe, expect, it, vi } from "vitest";

vi.mock("pulsar-client", () => {
  throw new Error("pulsar-client must not load for the fake broker");
});

describe("workflow broker factory", () => {
  it("creates the fake broker without loading the native Pulsar client", async () => {
    const { createWorkflowBroker } = await import("../src/broker/index.js");
    const broker = await createWorkflowBroker({
      broker: "fake",
      serviceUrl: null,
      token: null,
    });

    await expect(broker.publish({ data: Buffer.from("ok"), topic: "entry" }))
      .resolves.toMatchObject({ messageId: "1" });
    await broker.close();
  });
});
