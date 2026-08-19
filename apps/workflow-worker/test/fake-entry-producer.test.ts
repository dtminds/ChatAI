import { describe, expect, it } from "vitest";
import { FakeWorkflowBroker } from "./support/fake-workflow-broker.js";
import { publishWorkflowEntryFixture } from "./support/fake-workflow-entry-producer.js";

describe("Fake Workflow Entry producer", () => {
  it("publishes shared fixtures with the source-event partition key", async () => {
    const broker = new FakeWorkflowBroker();

    await publishWorkflowEntryFixture({
      broker,
      fixturePath: "entry/v1/valid/contact-friend-added.json",
      topic: "entry",
    });
    await publishWorkflowEntryFixture({
      broker,
      fixturePath: "entry/v1/valid/message-received.json",
      topic: "entry",
    });

    expect(broker.getPublished("entry")).toEqual([
      expect.objectContaining({ key: "9:wecom_contact:3267" }),
      expect.objectContaining({ key: "9:chatai_contact:chatai-contact-1" }),
    ]);
    await broker.close();
  });
});
