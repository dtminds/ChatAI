import { describe, expect, it } from "vitest";
import {
  createInitialDraft,
} from "@/pages/chat/workflow/graph";
import { createUniqueWorkflowNodeIdFactory } from "@/pages/chat/workflow/workflow-id";

describe("workflow id generation", () => {
  it("creates unique node ids against the current draft", () => {
    const createNodeId = createUniqueWorkflowNodeIdFactory({
      ...createInitialDraft(),
    }, () => "wait-2d");

    expect(createNodeId("wait")).toBe("wait-2d-1");
    expect(createNodeId("wait")).toBe("wait-2d-2");
  });
});
