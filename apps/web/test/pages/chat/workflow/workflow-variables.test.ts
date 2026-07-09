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
      "trigger.trigger.journey.next",
      "wait.wait-2d.result",
      "wait.wait-2d.journey.next",
      "branch.branch-intent.result",
      "branch.branch-intent.journey.next",
    ]);
    expect(variables.outputs.map((variable) => variable.name)).toEqual([
      "action.action-message.result",
      "action.action-message.journey.next",
    ]);
    expect(variables.outputs[0]?.selector).toEqual(["action-message", "result"]);
  });

  it("uses the selected node definition as the output variable boundary", () => {
    const nodes = createInitialNodes();
    const actionNode = nodes.find((currentNode) => currentNode.id === "action-message")!;
    const goalNode = nodes.find((currentNode) => currentNode.id === "goal")!;

    expect(getNodeDefinition("action").getOutputVariables?.(actionNode)).toEqual(expect.arrayContaining([
      {
        name: "journey.next",
        type: "string",
        value: "进入下一节点",
      },
    ]));
    expect(getNodeDefinition("goal").getOutputVariables?.(goalNode)).toEqual([
      {
        name: "result",
        type: "object",
        value: "目标 18.4%",
      },
      {
        name: "journey.next",
        type: "string",
        value: "退出旅程",
      },
    ]);
    expect(getNodeOutputVariables(goalNode)).toEqual([
      {
        name: "goal.goal.result",
        scope: "node",
        selector: ["goal", "result"],
        sourceNodeId: "goal",
        sourceNodeTitle: "首单转化",
        type: "object",
        value: "目标 18.4%",
      },
      {
        name: "goal.goal.journey.next",
        scope: "node",
        selector: ["goal", "journey.next"],
        sourceNodeId: "goal",
        sourceNodeTitle: "首单转化",
        type: "string",
        value: "退出旅程",
      },
    ]);
  });

  it("builds a variable context with system variables and scoped upstream outputs", () => {
    const nodes = createInitialNodes();
    const edges = createInitialEdges();
    const actionNode = nodes.find((node) => node.id === "action-message")!;
    const context = createWorkflowVariableContext(actionNode, nodes, edges);

    expect(context.upstreamNodes.map((node) => node.id)).toEqual([
      "trigger",
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
    const actionNode = nodes.find((node) => node.id === "action-message")!;
    const variables = getNodeVariables(actionNode, nodes, edges);

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
    const actionNode = nodes.find((node) => node.id === "action-message")!;
    const variables = getNodeVariables(actionNode, nodes, edges);

    expect(resolveWorkflowVariableSelector(variables, ["branch-intent", "result"])).toEqual({
      selector: ["branch-intent", "result"],
      selectorKey: "branch-intent.result",
      status: "invalid",
    });
  });
});
