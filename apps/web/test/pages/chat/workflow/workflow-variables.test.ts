import { describe, expect, it } from "vitest";
import {
  createInitialEdges,
  createInitialNodes,
} from "@/pages/chat/workflow/graph";
import {
  createWorkflowVariableContext,
  getBeforeNodesInSameBranch,
  getNodeOutputVariables,
  getNodeVariables,
  getWorkflowVariableSelectorKey,
  resolveWorkflowVariableSelector,
} from "@/pages/chat/workflow/workflow-variables";
import { getNodeDefinition } from "@/pages/chat/workflow/node-definitions";
import type { WorkflowNode } from "@/pages/chat/workflow/types";

describe("workflow variables", () => {
  it("derives available upstream nodes from the current graph branch", () => {
    const nodes = createInitialNodes();
    const edges = createInitialEdges();

    expect(getBeforeNodesInSameBranch("message-welcome", nodes, edges).map((node) => node.id)).toEqual([
      "start",
      "wait-2d",
      "branch-intent",
    ]);
    expect(getBeforeNodesInSameBranch("start", nodes, edges)).toEqual([]);
  });

  it("builds node variables from system fields, upstream outputs and current outputs", () => {
    const nodes = createInitialNodes();
    const edges = createInitialEdges();
    const messageNode = nodes.find((node) => node.id === "message-welcome")!;
    const variables = getNodeVariables(messageNode, nodes, edges);

    expect(variables.inputs.map((variable) => variable.name)).toEqual([
      "customer.profile",
      "journey.currentNode",
      "start.start.result",
      "start.start.journey.next",
      "wait.wait-2d.result",
      "wait.wait-2d.journey.next",
      "branch.branch-intent.result",
      "branch.branch-intent.journey.next",
    ]);
    expect(variables.outputs.map((variable) => variable.name)).toEqual([
      "message.message-welcome.result",
      "message.message-welcome.journey.next",
    ]);
    expect(variables.outputs[0]?.selector).toEqual(["message-welcome", "result"]);
  });

  it("uses the selected node definition as the output variable boundary", () => {
    const nodes = createInitialNodes();
    const messageNode = nodes.find(
      (currentNode): currentNode is WorkflowNode<"message"> =>
        currentNode.id === "message-welcome" && currentNode.data.kind === "message",
    )!;
    const endNode = nodes.find(
      (currentNode): currentNode is WorkflowNode<"end"> =>
        currentNode.id === "end" && currentNode.data.kind === "end",
    )!;

    expect(getNodeDefinition("message").getOutputVariables?.(messageNode)).toEqual(expect.arrayContaining([
      {
        name: "journey.next",
        type: "string",
        value: "进入下一节点",
      },
    ]));
    expect(getNodeDefinition("end").getOutputVariables?.(endNode)).toEqual([
      {
        name: "result",
        type: "object",
        value: "退出营销旅程",
      },
      {
        name: "journey.next",
        type: "string",
        value: "退出旅程",
      },
    ]);
    expect(getNodeOutputVariables(endNode)).toEqual([
      {
        name: "end.end.result",
        scope: "node",
        selector: ["end", "result"],
        sourceNodeId: "end",
        sourceNodeTitle: "结束",
        type: "object",
        value: "退出营销旅程",
      },
      {
        name: "end.end.journey.next",
        scope: "node",
        selector: ["end", "journey.next"],
        sourceNodeId: "end",
        sourceNodeTitle: "结束",
        type: "string",
        value: "退出旅程",
      },
    ]);
  });

  it("builds a variable context with system variables and scoped upstream outputs", () => {
    const nodes = createInitialNodes();
    const edges = createInitialEdges();
    const messageNode = nodes.find((node) => node.id === "message-welcome")!;
    const context = createWorkflowVariableContext(messageNode, nodes, edges);

    expect(context.upstreamNodes.map((node) => node.id)).toEqual([
      "start",
      "wait-2d",
      "branch-intent",
    ]);
    expect(context.systemVariables.map((variable) => variable.selector)).toEqual([
      ["customer", "profile"],
      ["journey", "currentNode"],
    ]);
    expect(context.upstreamNodeOutputs).toContainEqual(expect.objectContaining({
      name: "branch.branch-intent.result",
      scope: "node",
      selector: ["branch-intent", "result"],
      sourceNodeId: "branch-intent",
    }));
  });

  it("resolves variable selectors through the same boundary used by future node configs", () => {
    const nodes = createInitialNodes();
    const edges = createInitialEdges();
    const messageNode = nodes.find((node) => node.id === "message-welcome")!;
    const variables = getNodeVariables(messageNode, nodes, edges);

    expect(getWorkflowVariableSelectorKey(["branch-intent", "result"])).toBe("branch-intent.result");
    expect(resolveWorkflowVariableSelector(variables, ["branch-intent", "result"])).toEqual({
      selector: ["branch-intent", "result"],
      selectorKey: "branch-intent.result",
      status: "resolved",
      variable: expect.objectContaining({
        name: "branch.branch-intent.result",
        sourceNodeId: "branch-intent",
      }),
    });
    expect(resolveWorkflowVariableSelector(variables, ["customer", "profile"])).toEqual({
      selector: ["customer", "profile"],
      selectorKey: "customer.profile",
      status: "resolved",
      variable: expect.objectContaining({
        name: "customer.profile",
        scope: "system",
      }),
    });
    expect(resolveWorkflowVariableSelector(variables, [])).toEqual({
      reason: "empty-selector",
      status: "empty",
    });
    expect(resolveWorkflowVariableSelector(variables, ["missing-node", "result"])).toEqual({
      selector: ["missing-node", "result"],
      selectorKey: "missing-node.result",
      status: "invalid",
    });
  });

  it("marks selectors invalid after their source node leaves the upstream context", () => {
    const nodes = createInitialNodes().filter((node) => node.id !== "branch-intent");
    const edges = createInitialEdges().filter((edge) => edge.source !== "branch-intent" && edge.target !== "branch-intent");
    const messageNode = nodes.find((node) => node.id === "message-welcome")!;
    const variables = getNodeVariables(messageNode, nodes, edges);

    expect(resolveWorkflowVariableSelector(variables, ["branch-intent", "result"])).toEqual({
      selector: ["branch-intent", "result"],
      selectorKey: "branch-intent.result",
      status: "invalid",
    });
  });
});
