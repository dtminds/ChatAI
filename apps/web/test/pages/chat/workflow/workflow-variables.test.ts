import { describe, expect, it } from "vitest";
import {
  createEdge,
  createInitialEdges,
  createInitialNodes,
  createNewWorkflowDraft,
  createNodeFromKind,
} from "@/pages/chat/workflow/graph";
import {
  getAvailableLlmInputVariablesForNode,
  getAvailableBranchVariablesForNode,
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
      ["subject", "id"],
      ["trigger", "occurredAt"],
      ["trigger", "projection", "externalUserId"],
      ["trigger", "projection", "workUserId"],
      ["trigger", "projection", "seatId"],
    ]);
    expect(workflowContextVariables).toEqual(expect.arrayContaining([
      expect.objectContaining({
        selector: ["trigger", "projection", "externalUserId"],
        type: "number",
        valueType: { kind: "number" },
      }),
    ]));
  });

  it("limits trigger projection variables to the current Workflow Type", () => {
    const draft = createNewWorkflowDraft("wecom_sop");
    Object.assign(draft.nodes.find(node => node.data.kind === "start")!.data, {
      triggers: [{ tagIds: [1], type: "contact.tag_added" }],
    });
    const variables = getAvailableVariablesForNode("end", draft.nodes, draft.edges);

    expect(variables).toEqual(expect.arrayContaining([
      expect.objectContaining({ selector: ["trigger", "projection", "workUserId"] }),
      expect.objectContaining({ selector: ["trigger", "projection", "externalUserId"] }),
    ]));
    expect(variables).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ selector: ["trigger", "projection", "seatId"] }),
    ]));
  });

  it("exposes projections guaranteed by the selected entry event", () => {
    const draft = createNewWorkflowDraft("chatai_sop");
    Object.assign(draft.nodes.find(node => node.data.kind === "start")!.data, {
      triggers: [{ keywords: [], type: "message.received" }],
    });
    const variables = getAvailableVariablesForNode("end", draft.nodes, draft.edges);

    expect(variables).toEqual(expect.arrayContaining([
      expect.objectContaining({ selector: ["trigger", "projection", "workUserId"] }),
      expect.objectContaining({ selector: ["trigger", "projection", "seatId"] }),
    ]));
    expect(variables).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ selector: ["trigger", "projection", "externalUserId"] }),
    ]));
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
    const llmNode = createNodeFromKind("llm", "llm", 3);
    const nodes = [startNode, queryNode, intentNode, llmNode];
    const edges = [
      createEdge(queryNode.id, intentNode.id),
      createEdge(queryNode.id, llmNode.id),
    ];

    expect(getGuaranteedUpstreamNodes(intentNode.id, nodes, edges).map((node) => node.id))
      .toEqual([queryNode.id]);
    expect(getAvailableIntentInputOutputsForNode(intentNode.id, nodes, edges))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({
          selector: ["node", queryNode.id, "messages"],
        }),
      ]));
    expect(getAvailableLlmInputVariablesForNode(llmNode.id, nodes, edges))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({
          selector: ["node", queryNode.id, "messages"],
          valueType: { kind: "object", schemaRef: "workflow.messages.v1" },
        }),
        expect.objectContaining({
          selector: ["node-lifecycle", queryNode.id, "enteredAt"],
        }),
        expect.objectContaining({
          selector: ["node-lifecycle", queryNode.id, "exitedAt"],
        }),
        expect.objectContaining({
          selector: ["current-node-lifecycle", "enteredAt"],
          sourceNodeTitle: llmNode.data.title,
        }),
      ]));
    expect(getAvailableVariablesForNode(llmNode.id, nodes, edges))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ selector: ["node", queryNode.id, "messages"] }),
      ]));
  });

  it("resolves stable selectors and rejects unavailable references", () => {
    const variables = getAvailableVariablesForNode("end", createInitialNodes(), createInitialEdges());

    expect(getWorkflowVariableSelectorKey(["subject", "id"])).toBe("subject.id");
    expect(resolveWorkflowVariable(variables, ["subject", "id"])).toEqual(expect.objectContaining({
      label: "客户 ID",
      scope: "subject",
    }));
    expect(resolveWorkflowVariable(variables, ["node", "missing", "result"])).toBeUndefined();
    expect(resolveWorkflowVariable(variables, ["node-lifecycle", "message-welcome", "exitedAt"]))
      .toEqual(expect.objectContaining({
        label: "退出时间",
        scope: "node-lifecycle",
        sourceNodeId: "message-welcome",
        sourceNodeTitle: "发送欢迎消息",
      }));
    expect(getWorkflowVariableDisplayLabel(resolveWorkflowVariable(
      variables,
      ["node-lifecycle", "message-welcome", "exitedAt"],
    )!)).toBe("发送欢迎消息.退出时间");
    expect(getWorkflowVariableDisplayLabel(resolveWorkflowVariable(
      variables,
      ["subject", "id"],
    )!)).toBe("全局变量.客户 ID");
    expect(getInvalidVariableContentSelectors([
      { selector: ["subject", "id"], type: "variable" },
      { selector: ["node", "missing", "result"], type: "variable" },
    ], variables)).toEqual([["node", "missing", "result"]]);
  });

  it("exposes current and guaranteed predecessor lifecycle variables through one catalog", () => {
    const nodes = createInitialNodes();
    const edges = createInitialEdges();
    const branchVariables = getAvailableBranchVariablesForNode("branch-intent", nodes, edges);

    expect(branchVariables).toEqual(expect.arrayContaining([
      expect.objectContaining({
        selector: ["current-node-lifecycle", "enteredAt"],
        type: "datetime",
      }),
      expect.objectContaining({
        selector: ["node-lifecycle", "wait-2d", "enteredAt"],
        sourceNodeTitle: "观察期",
      }),
      expect.objectContaining({
        selector: ["node-lifecycle", "wait-2d", "exitedAt"],
        sourceNodeTitle: "观察期",
      }),
    ]));
    expect(branchVariables).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ selector: ["node-lifecycle", "message-welcome", "enteredAt"] }),
    ]));
    expect(getAvailableVariablesForNode("branch-intent", nodes, edges)).toEqual(expect.arrayContaining([
      expect.objectContaining({ selector: ["current-node-lifecycle", "enteredAt"] }),
    ]));
    const triggerVariable = branchVariables.find(variable => variable.selector[0] === "trigger");
    expect(triggerVariable).toEqual(expect.objectContaining({ scope: "trigger" }));
    expect(triggerVariable?.sourceNodeId).toBeUndefined();
  });

  it("keeps lifecycle values but hides outputs that are not guaranteed on every source outlet", () => {
    const startNode = createInitialNodes().find(node => node.data.kind === "start")!;
    const waitEventNode = createNodeFromKind("wait-event", "wait-event", 1);
    const llmNode = createNodeFromKind("llm", "llm", 2);
    const nodes = [startNode, waitEventNode, llmNode];
    const edges = [
      createEdge(startNode.id, waitEventNode.id),
      createEdge(waitEventNode.id, llmNode.id, undefined, { sourceHandle: "triggered" }),
      createEdge(waitEventNode.id, llmNode.id, undefined, { sourceHandle: "timeout" }),
    ];
    const variables = getAvailableLlmInputVariablesForNode(llmNode.id, nodes, edges);

    expect(variables).toEqual(expect.arrayContaining([
      expect.objectContaining({ selector: ["node-lifecycle", waitEventNode.id, "enteredAt"] }),
      expect.objectContaining({ selector: ["node-lifecycle", waitEventNode.id, "exitedAt"] }),
    ]));
    expect(variables).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ selector: ["node", waitEventNode.id, "messages"] }),
    ]));
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
    const outputId = llmNode.data.output.format === "json"
      ? llmNode.data.output.fields[0]!.id
      : llmNode.data.output.field.id;
    const nodes = [...createInitialNodes(), llmNode];
    const edges = [
      ...createInitialEdges().filter((edge) => edge.target !== "message-welcome"),
      createEdge("branch-intent", "llm-copy", undefined, { sourceHandle: "branch-high" }),
      createEdge("llm-copy", "message-welcome"),
    ];

    expect(getAvailableMessageContentOutputsForNode("message-welcome", nodes, edges)).toEqual([
      expect.objectContaining({
        label: "output",
        selector: ["node", "llm-copy", outputId],
        sourceNodeTitle: "生成营销文案",
      }),
    ]);
    expect(getAvailableMessageContentOutputsForNode("llm-copy", nodes, edges)).toEqual([]);
  });
});
