import { describe, expect, it } from "vitest";
import { FakeWorkflowBroker } from "./support/fake-workflow-broker.js";
import { publishWorkflowEntryFixture } from "./support/fake-workflow-entry-producer.js";

describe("Fake Workflow Entry producer", () => {
  it("publishes shared fixtures with the complete Subject partition key", async () => {
    const broker = new FakeWorkflowBroker();

    await publishWorkflowEntryFixture({
      broker,
      fixturePath: "entry/v1/valid/chatai-contact.json",
      topic: "entry",
    });
    await publishWorkflowEntryFixture({
      broker,
      fixturePath: "entry/v1/valid/wecom-contact.json",
      topic: "entry",
    });

    expect(broker.getPublished("entry")).toEqual([
      expect.objectContaining({ key: "9:chatai_contact:chatai-contact-1" }),
      expect.objectContaining({ key: "9:wecom_contact:wecom-contact-1" }),
    ]);
    await broker.close();
  });
});
