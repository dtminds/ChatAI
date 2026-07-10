import { describe, expect, it } from "vitest";
import { createEdge, createInitialEdges, createInitialNodes } from "@/pages/chat/workflow/graph";
import {
  getAvailableVariablesForNode,
  getGuaranteedUpstreamNodes,
  getInvalidMessageVariableSelectors,
  getWorkflowVariableDisplayLabel,
  getWorkflowVariableSelectorKey,
  resolveWorkflowVariable,
  scopeWorkflowNodeOutputs,
  workflowContextVariables,
} from "@/pages/chat/workflow/workflow-variables";

describe("workflow variables", () => {
  it("registers stable context selectors by scope", () => {
    expect(workflowContextVariables.map((variable) => variable.selector)).toEqual([
      ["system", "employeeId"],
      ["customer", "id"],
      ["customer", "name"],
      ["trigger", "occurredAt"],
    ]);
  });

  it("only exposes nodes that execute on every path to the current node", () => {
    const nodes = createInitialNodes();
    const edges = createInitialEdges();

    expect(getGuaranteedUpstreamNodes("message-welcome", nodes, edges).map((node) => node.id)).toEqual([
      "start",
      "wait-2d",
      "branch-intent",
    ]);

    const endEdges = [
      ...edges.filter((edge) => edge.target !== "end"),
      createEdge("message-welcome", "end"),
      createEdge("branch-intent", "end", undefined, { sourceHandle: "branch-default" }),
    ];
    expect(getGuaranteedUpstreamNodes("end", nodes, endEdges).map((node) => node.id)).toEqual([
      "start",
      "wait-2d",
      "branch-intent",
    ]);
  });

  it("resolves stable selectors and rejects unavailable message references", () => {
    const variables = getAvailableVariablesForNode("message-welcome", createInitialNodes(), createInitialEdges());

    expect(getWorkflowVariableSelectorKey(["customer", "name"])).toBe("customer.name");
    expect(resolveWorkflowVariable(variables, ["customer", "name"])).toEqual(expect.objectContaining({
      label: "客户昵称",
      scope: "customer",
    }));
    expect(resolveWorkflowVariable(variables, ["node", "missing", "result"])).toBeUndefined();
    expect(resolveWorkflowVariable(variables, ["node", "branch-intent", "matchedPathLabel"]))
      .toEqual(expect.objectContaining({
        label: "命中分支名称",
        scope: "node",
        sourceNodeId: "branch-intent",
        sourceNodeTitle: "意向判断",
      }));
    expect(getWorkflowVariableDisplayLabel(resolveWorkflowVariable(
      variables,
      ["node", "branch-intent", "matchedPathLabel"],
    )!)).toBe("意向判断.命中分支名称");
    expect(getWorkflowVariableDisplayLabel(resolveWorkflowVariable(
      variables,
      ["customer", "name"],
    )!)).toBe("客户昵称");
    expect(getInvalidMessageVariableSelectors([
      { selector: ["customer", "name"], type: "variable" },
      { selector: ["node", "missing", "result"], type: "variable" },
    ], variables)).toEqual([["node", "missing", "result"]]);
  });

  it("scopes declared node outputs by stable node id and output key", () => {
    const waitNode = createInitialNodes().find((node) => node.id === "wait-2d")!;

    expect(scopeWorkflowNodeOutputs(waitNode, [{
      key: "resumedAt",
      label: "继续时间",
      type: "datetime",
    }])).toEqual([{
      key: "resumedAt",
      label: "继续时间",
      scope: "node",
      selector: ["node", "wait-2d", "resumedAt"],
      sourceNodeId: "wait-2d",
      sourceNodeKind: "wait",
      sourceNodeTitle: "观察期",
      type: "datetime",
    }]);
  });
});
