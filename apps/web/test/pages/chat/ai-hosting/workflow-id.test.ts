import { describe, expect, it } from "vitest";
import {
  createInitialEdges,
  createInitialNodes,
} from "@/pages/chat/ai-hosting/workflow/graph";
import { createUniqueWorkflowNodeIdFactory } from "@/pages/chat/ai-hosting/workflow/workflow-id";

describe("workflow id generation", () => {
  it("creates unique node ids against the current draft", () => {
    const createNodeId = createUniqueWorkflowNodeIdFactory({
      edges: createInitialEdges(),
      nodes: createInitialNodes(),
    }, () => "wait-2d");

    expect(createNodeId("wait")).toBe("wait-2d-1");
    expect(createNodeId("wait")).toBe("wait-2d-2");
  });
});
