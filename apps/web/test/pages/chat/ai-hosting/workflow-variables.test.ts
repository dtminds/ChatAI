import { describe, expect, it } from "vitest";
import {
  createInitialEdges,
  createInitialNodes,
} from "@/pages/chat/ai-hosting/workflow/graph";
import {
  getBeforeNodesInSameBranch,
  getNodeVariables,
} from "@/pages/chat/ai-hosting/workflow/workflow-variables";

describe("workflow variables", () => {
  it("derives available upstream nodes from the current graph branch", () => {
    const nodes = createInitialNodes();
    const edges = createInitialEdges();

    expect(getBeforeNodesInSameBranch("action-message", nodes, edges).map((node) => node.id)).toEqual([
      "trigger",
      "wait-2d",
      "branch-intent",
    ]);
    expect(getBeforeNodesInSameBranch("trigger", nodes, edges)).toEqual([]);
  });

  it("builds node variables from system fields, upstream outputs and current outputs", () => {
    const nodes = createInitialNodes();
    const edges = createInitialEdges();
    const actionNode = nodes.find((node) => node.id === "action-message")!;
    const variables = getNodeVariables(actionNode, nodes, edges);

    expect(variables.inputs.map((variable) => variable.name)).toEqual([
      "customer.profile",
      "journey.currentNode",
      "trigger.trigger.result",
      "wait.wait-2d.result",
      "branch.branch-intent.result",
    ]);
    expect(variables.outputs.map((variable) => variable.name)).toEqual([
      "action.result",
      "journey.next",
    ]);
  });
});
