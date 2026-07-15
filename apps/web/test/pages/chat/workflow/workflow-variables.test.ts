import { describe, expect, it } from "vitest";
import {
  createEdge,
  createInitialEdges,
  createInitialNodes,
  createNodeFromKind,
} from "@/pages/chat/workflow/graph";
import {
  getAvailableMessageContentOutputsForNode,
  getAvailableIntentInputOutputsForNode,
  getAvailableVariablesForNode,
  getGuaranteedUpstreamNodes,
  getInvalidVariableContentSelectors,
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

  it("exposes guaranteed predecessor outputs while a local chain is not connected to start", () => {
    const startNode = createInitialNodes().find((node) => node.id === "start")!;
    const queryNode = createNodeFromKind("message-query", "message-query", 1);
    const intentNode = createNodeFromKind("ai-intent", "ai-intent", 2);
    const nodes = [startNode, queryNode, intentNode];
    const edges = [createEdge(queryNode.id, intentNode.id)];

    expect(getGuaranteedUpstreamNodes(intentNode.id, nodes, edges).map((node) => node.id))
      .toEqual([queryNode.id]);
    expect(getAvailableIntentInputOutputsForNode(intentNode.id, nodes, edges))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({
          selector: ["node", queryNode.id, "messageIds"],
        }),
        expect.objectContaining({
          selector: ["node", queryNode.id, "textContent"],
        }),
      ]));
  });

  it("resolves stable selectors and rejects unavailable message references", () => {
    const variables = getAvailableVariablesForNode("end", createInitialNodes(), createInitialEdges());

    expect(getWorkflowVariableSelectorKey(["customer", "name"])).toBe("customer.name");
    expect(resolveWorkflowVariable(variables, ["customer", "name"])).toEqual(expect.objectContaining({
      label: "客户昵称",
      scope: "customer",
    }));
    expect(resolveWorkflowVariable(variables, ["node", "missing", "result"])).toBeUndefined();
    expect(resolveWorkflowVariable(variables, ["node", "message-welcome", "sentAt"]))
      .toEqual(expect.objectContaining({
        label: "发送成功时间",
        scope: "node",
        sourceNodeId: "message-welcome",
        sourceNodeTitle: "发送欢迎消息",
      }));
    expect(getWorkflowVariableDisplayLabel(resolveWorkflowVariable(
      variables,
      ["node", "message-welcome", "sentAt"],
    )!)).toBe("发送欢迎消息.发送成功时间");
    expect(getWorkflowVariableDisplayLabel(resolveWorkflowVariable(
      variables,
      ["customer", "name"],
    )!)).toBe("客户昵称");
    expect(getInvalidVariableContentSelectors([
      { selector: ["customer", "name"], type: "variable" },
      { selector: ["node", "missing", "result"], type: "variable" },
    ], variables)).toEqual([["node", "missing", "result"]]);
  });

  it("scopes declared node outputs by stable node id and output key", () => {
    const waitNode = createInitialNodes().find((node) => node.id === "wait-2d")!;

    expect(scopeWorkflowNodeOutputs(waitNode, [{
      description: "节点完成等待的时间。",
      key: "resumedAt",
      label: "继续时间",
      usages: ["variable"],
      valueType: { kind: "datetime" },
    }])).toEqual([{
      description: "节点完成等待的时间。",
      key: "resumedAt",
      label: "继续时间",
      scope: "node",
      selector: ["node", "wait-2d", "resumedAt"],
      sourceNodeId: "wait-2d",
      sourceNodeKind: "wait",
      sourceNodeTitle: "观察期",
      type: "datetime",
      usages: ["variable"],
      valueType: { kind: "datetime" },
    }]);
  });

  it("only exposes guaranteed upstream outputs explicitly declared as message content", () => {
    const baseLlmNode = createNodeFromKind("llm", "llm-copy", 0);
    const llmNode = {
      ...baseLlmNode,
      data: {
        ...baseLlmNode.data,
        title: "生成营销文案",
      },
    };
    const nodes = [...createInitialNodes(), llmNode];
    const edges = [
      ...createInitialEdges().filter((edge) => edge.target !== "message-welcome"),
      createEdge("branch-intent", "llm-copy", undefined, { sourceHandle: "branch-high" }),
      createEdge("llm-copy", "message-welcome"),
    ];

    expect(getAvailableMessageContentOutputsForNode("message-welcome", nodes, edges)).toEqual([
      expect.objectContaining({
        label: "生成文本",
        selector: ["node", "llm-copy", "text"],
        sourceNodeTitle: "生成营销文案",
      }),
    ]);
    expect(getAvailableMessageContentOutputsForNode("llm-copy", nodes, edges)).toEqual([]);
  });
});
