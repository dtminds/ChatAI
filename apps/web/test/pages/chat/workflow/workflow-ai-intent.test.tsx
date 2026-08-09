import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { WORKFLOW_NODE_TYPE } from "@/pages/chat/workflow/constants";
import { createEdge, createNodeFromKind } from "@/pages/chat/workflow/graph";
import { updateNodeDataOperation } from "@/pages/chat/workflow/graph-operations";
import { getWorkflowNodeEstimatedHeight } from "@/pages/chat/workflow/layout";
import { createDefaultNodeData, getNodeDefinition } from "@/pages/chat/workflow/node-definitions";
import {
  AI_INTENT_DESCRIPTION_MAX_LENGTH,
  AI_INTENT_DESCRIPTION_COUNT_THRESHOLD,
  AI_INTENT_FALLBACK_HANDLE_ID,
  AI_INTENT_MAX_COUNT,
  AI_INTENT_PROMPT_MAX_LENGTH,
  getAiIntentHandleId,
  normalizeAiIntentOptions,
} from "@/pages/chat/workflow/nodes/ai-intent/config";
import { AiIntentConfig } from "@/pages/chat/workflow/nodes/ai-intent/panel";
import type {
  AiIntentNodeData,
  WorkflowEdge,
  WorkflowNode,
  WorkflowNodeConfigPatch,
} from "@/pages/chat/workflow/types";
import { validateWorkflowGraph } from "@/pages/chat/workflow/validation/workflow-graph-validation";
import { validateWorkflowNodeConfig } from "@/pages/chat/workflow/validation/workflow-validation";
import { hydrateWorkflowDraft } from "@/pages/chat/workflow/workflow-draft-normalizer";
import { createWorkflowRenderElements } from "@/pages/chat/workflow/use-workflow-render-elements";

describe("workflow AI intent", () => {
  it("normalizes missing intent data with stable handle ids", () => {
    expect(normalizeAiIntentOptions(undefined)).toEqual([{
      description: "",
      id: "intent-1",
    }]);
    expect(normalizeAiIntentOptions([])).toEqual([{
      description: "",
      id: "intent-1",
    }]);
  });

  it("creates independent stable intent IDs and preserves valid IDs during hydration", () => {
    const first = createDefaultNodeData("ai-intent");
    const second = createDefaultNodeData("ai-intent");
    expect(first.intents[0].id).not.toBe(second.intents[0].id);

    const draft = hydrateWorkflowDraft({
      edges: [],
      nodes: [{
        data: {
          advancedEnabled: "invalid",
          inputSelector: ["node", "message-query", "messageIds"],
          availableIntentInputs: [{
            key: "messageIds",
            label: "消息列表",
            scope: "node",
            selector: ["node", "message-query", "messageIds"],
            type: "message-id-list",
          }],
          intents: [
            { description: "愿意参加活动", id: "stable-intent" },
            { description: "x".repeat(AI_INTENT_DESCRIPTION_MAX_LENGTH + 20), id: "stable-intent" },
          ],
          kind: "ai-intent",
          prompt: "x".repeat(AI_INTENT_PROMPT_MAX_LENGTH + 20),
          title: "识别活动意向",
        },
        id: "intent-node",
        position: { x: 0, y: 0 },
      }],
      viewport: { x: 0, y: 0, zoom: 1 },
    });
    const data = draft.nodes[0]?.data;
    expect(data?.kind).toBe("ai-intent");
    if (data?.kind !== "ai-intent") return;

    expect(data.inputSelector).toEqual(["node", "message-query", "messageIds"]);
    expect(data).not.toHaveProperty("availableIntentInputs");
    expect(data.advancedEnabled).toBe(false);
    expect(data).not.toHaveProperty("mode");
    expect(data.prompt).toHaveLength(AI_INTENT_PROMPT_MAX_LENGTH);
    expect(data.intents).toHaveLength(2);
    expect(data.intents[0]).toEqual({ description: "愿意参加活动", id: "stable-intent" });
    expect(data.intents[1].id).toBe("intent-2");
    expect(data.intents[1].description).toHaveLength(AI_INTENT_DESCRIPTION_MAX_LENGTH);

    const hydratedAgain = hydrateWorkflowDraft(draft);
    expect(hydratedAgain.nodes[0]?.data).toEqual(draft.nodes[0]?.data);
  });

  it("uses stable local IDs for dynamic outcomes and short model codes", () => {
    const definition = getNodeDefinition("ai-intent");
    const node = createAiIntentNode([
      { description: "愿意参加活动", id: "intent-accept" },
      { description: "明确拒绝活动", id: "intent-reject" },
    ]);

    expect(definition.getSourceHandles(node.data)).toEqual([
      expect.objectContaining({
        id: "intent:intent-accept",
        label: "愿意参加活动",
        outletKind: "outcome",
        top: 96,
      }),
      expect.objectContaining({
        id: "intent:intent-reject",
        label: "明确拒绝活动",
        outletKind: "outcome",
        top: 138,
      }),
      expect.objectContaining({
        id: AI_INTENT_FALLBACK_HANDLE_ID,
        label: "其他意图",
        outletKind: "outcome",
        top: 180,
      }),
    ]);
    expect(definition.createExecutionConfig({
      ...node.data,
      inputSelector: ["node", "message-query", "messageIds"],
    })).toEqual({
      fallback: { id: "fallback" },
      inputSelector: ["node", "message-query", "messageIds"],
      intents: [
        { description: "愿意参加活动", id: "intent-accept", modelCode: "I1" },
        { description: "明确拒绝活动", id: "intent-reject", modelCode: "I2" },
      ],
    });
    expect(definition.createExecutionConfig({
      ...node.data,
      advancedEnabled: true,
      inputSelector: ["node", "message-query", "messageIds"],
      prompt: "优先参考客户最近一条消息",
    })).toEqual(expect.objectContaining({
      prompt: "优先参考客户最近一条消息",
    }));
    expect(definition.getOutputVariables?.(node)).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "matchedIntentId", valueType: { kind: "string" } }),
      expect.objectContaining({ key: "matchedIntentDescription", valueType: { kind: "string" } }),
      expect.objectContaining({ key: "reason", valueType: { kind: "string" } }),
    ]));
  });

  it("derives node height and requires every intent outcome including fallback to connect", () => {
    const startNode = createStartNode();
    const intentNode = createAiIntentNode([
      { description: "愿意参加活动", id: "intent-accept" },
      { description: "明确拒绝活动", id: "intent-reject" },
    ]);
    const acceptNode = createNodeFromKind("message", "accept-message", 2);
    const rejectNode = createNodeFromKind("message", "reject-message", 3);
    const fallbackNode = createNodeFromKind("message", "fallback-message", 4);
    const nodes = [startNode, intentNode, acceptNode, rejectNode, fallbackNode];
    const missingFallbackEdges = [
      createEdge(startNode.id, intentNode.id),
      createEdge(intentNode.id, acceptNode.id, undefined, {
        sourceHandle: getAiIntentHandleId("intent-accept"),
      }),
      createEdge(intentNode.id, rejectNode.id, undefined, {
        sourceHandle: getAiIntentHandleId("intent-reject"),
      }),
    ];

    expect(getWorkflowNodeEstimatedHeight(intentNode)).toBe(222);
    expect(validateWorkflowGraph(nodes, missingFallbackEdges).graphIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "source-handle-unconnected",
        nodeId: intentNode.id,
      }),
    ]));

    const completeEdges = [
      ...missingFallbackEdges,
      createEdge(intentNode.id, fallbackNode.id, undefined, {
        sourceHandle: AI_INTENT_FALLBACK_HANDLE_ID,
      }),
    ];
    expect(validateWorkflowGraph(nodes, completeEdges).graphIssues.some((issue) =>
      issue.code === "source-handle-unconnected" && issue.nodeId === intentNode.id,
    )).toBe(false);
  });

  it("selects a guaranteed upstream input and preserves the prompt across advanced toggle changes", async () => {
    const user = userEvent.setup();
    const onNodeChange = vi.fn();
    const startNode = createStartNode();
    const queryNode = createNodeFromKind("message-query", "message-query", 1);
    const intentNode = createAiIntentNode([
      { description: "愿意参加活动", id: "intent-accept" },
    ]);
    const nodes = [startNode, queryNode, intentNode];
    const edges = [
      createEdge(startNode.id, queryNode.id),
      createEdge(queryNode.id, intentNode.id),
    ];

    render(
      <StatefulAiIntentConfig
        edges={edges}
        initialNode={intentNode}
        nodes={nodes}
        onNodeChange={onNodeChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "输入" }));
    await user.click(screen.getByRole("menuitem", { name: /消息查询/ }));
    fireEvent.pointerDown(screen.getByRole("menuitem", { name: /消息列表/ }));
    expect(onNodeChange).toHaveBeenLastCalledWith(expect.objectContaining({
      inputSelector: ["node", queryNode.id, "messageIds"],
    }));

    await user.click(screen.getByRole("switch", { name: "高级调教" }));
    const prompt = screen.getByRole("textbox", { name: "提示词" });
    expect(prompt).toHaveAttribute("maxlength", String(AI_INTENT_PROMPT_MAX_LENGTH));
    await user.type(prompt, "优先根据客户最后一条消息判断");
    await user.click(screen.getByRole("switch", { name: "高级调教" }));
    expect(screen.queryByRole("textbox", { name: "提示词" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("switch", { name: "高级调教" }));
    expect(screen.getByRole("textbox", { name: "提示词" })).toHaveValue("优先根据客户最后一条消息判断");
  });

  it("projects only available predecessor intent inputs into render data", () => {
    const startNode = createStartNode();
    const queryNode = createNodeFromKind("message-query", "message-query", 1);
    const intentNode = createAiIntentNode([
      { description: "愿意参加活动", id: "intent-accept" },
    ]);
    const rendered = createWorkflowRenderElements({
      ...createRenderHandlers(),
      activeEdgeInsertMenuId: null,
      edges: [
        createEdge(startNode.id, queryNode.id),
        createEdge(queryNode.id, intentNode.id),
      ],
      nodes: [startNode, queryNode, intentNode],
      quickInsertTarget: null,
      selectedEdgeId: null,
      selectedNodeIdSet: new Set(),
    });

    expect(rendered.nodes.find((node) => node.id === intentNode.id)?.data.availableIntentInputs)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({
          selector: ["node", queryNode.id, "messageIds"],
          type: "message-id-list",
        }),
        expect.objectContaining({
          selector: ["node", queryNode.id, "textContent"],
          type: "string",
        }),
      ]));
    expect(rendered.nodes.find((node) => node.id === queryNode.id)?.data.availableIntentInputs)
      .toBeUndefined();
  });

  it("limits intent rows and confirms deletion when the outcome is connected", async () => {
    const user = userEvent.setup();
    const onNodeChange = vi.fn();
    const intents = [
      { description: "愿意参加活动", id: "intent-accept" },
      { description: "明确拒绝活动", id: "intent-reject" },
    ];
    const intentNode = createAiIntentNode(intents);
    const targetNode = createNodeFromKind("message", "accept-message", 2);
    const edges = [createEdge(intentNode.id, targetNode.id, undefined, {
      sourceHandle: getAiIntentHandleId("intent-accept"),
    })];

    render(
      <StatefulAiIntentConfig
        edges={edges}
        initialNode={intentNode}
        nodes={[intentNode, targetNode]}
        onNodeChange={onNodeChange}
      />,
    );

    expect(screen.getByRole("textbox", { name: "意图 1" }))
      .toHaveAttribute("maxlength", String(AI_INTENT_DESCRIPTION_MAX_LENGTH));
    expect(screen.getByRole("textbox", { name: "意图 1" })).toHaveAttribute("rows", "1");
    fireEvent.change(screen.getByRole("textbox", { name: "意图 1" }), {
      target: { value: "x".repeat(AI_INTENT_DESCRIPTION_COUNT_THRESHOLD) },
    });
    expect(screen.queryByText(`${AI_INTENT_DESCRIPTION_COUNT_THRESHOLD}/${AI_INTENT_DESCRIPTION_MAX_LENGTH}`))
      .not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "意图 1" }), {
      target: { value: "x".repeat(AI_INTENT_DESCRIPTION_COUNT_THRESHOLD + 1) },
    });
    expect(screen.getByText(`${AI_INTENT_DESCRIPTION_COUNT_THRESHOLD + 1}/${AI_INTENT_DESCRIPTION_MAX_LENGTH}`))
      .toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "删除意图 1" }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "确认删除" }));
    expect(screen.queryByDisplayValue("x".repeat(AI_INTENT_DESCRIPTION_COUNT_THRESHOLD + 1)))
      .not.toBeInTheDocument();

    for (let count = 1; count < AI_INTENT_MAX_COUNT; count += 1) {
      await user.click(screen.getByRole("button", { name: "添加意图" }));
    }
    expect(screen.getAllByRole("textbox", { name: /^意图 \d+$/ })).toHaveLength(AI_INTENT_MAX_COUNT);
    expect(screen.getByRole("button", { name: "添加意图" })).toBeDisabled();
  });

  it("removes the matching edge after an intent is deleted from node data", () => {
    const intentNode = createAiIntentNode([
      { description: "愿意参加活动", id: "intent-accept" },
      { description: "明确拒绝活动", id: "intent-reject" },
    ]);
    const targetNode = createNodeFromKind("message", "accept-message", 2);
    const edge = createEdge(intentNode.id, targetNode.id, undefined, {
      sourceHandle: getAiIntentHandleId("intent-accept"),
    });
    const operation = updateNodeDataOperation({
      edges: [edge],
      nodes: [intentNode, targetNode],
      viewport: { x: 0, y: 0, zoom: 1 },
    }, intentNode.id, {
      intents: [{ description: "明确拒绝活动", id: "intent-reject" }],
    });

    expect(operation?.draft.edges).toEqual([]);
  });

  it("preserves intent edges across reorder and description changes", () => {
    const acceptIntent = { description: "愿意参加活动", id: "intent-accept" };
    const rejectIntent = { description: "明确拒绝活动", id: "intent-reject" };
    const intentNode = createAiIntentNode([acceptIntent, rejectIntent]);
    const acceptNode = createNodeFromKind("message", "accept-message", 2);
    const rejectNode = createNodeFromKind("message", "reject-message", 3);
    const edges = [
      createEdge(intentNode.id, acceptNode.id, undefined, {
        sourceHandle: getAiIntentHandleId(acceptIntent.id),
      }),
      createEdge(intentNode.id, rejectNode.id, undefined, {
        sourceHandle: getAiIntentHandleId(rejectIntent.id),
      }),
    ];
    const operation = updateNodeDataOperation({
      edges,
      nodes: [intentNode, acceptNode, rejectNode],
      viewport: { x: 0, y: 0, zoom: 1 },
    }, intentNode.id, {
      intents: [rejectIntent, acceptIntent],
    });

    expect(operation?.draft.edges).toEqual([
      expect.objectContaining({
        sourceHandle: getAiIntentHandleId(acceptIntent.id),
        target: acceptNode.id,
      }),
      expect.objectContaining({
        sourceHandle: getAiIntentHandleId(rejectIntent.id),
        target: rejectNode.id,
      }),
    ]);

    const renamedOperation = operation && updateNodeDataOperation(
      operation.draft,
      intentNode.id,
      {
        intents: [
          rejectIntent,
          { ...acceptIntent, description: "愿意了解活动" },
        ],
      },
    );
    expect(renamedOperation?.draft.edges.find((edge) =>
      edge.sourceHandle === getAiIntentHandleId(acceptIntent.id),
    )).toEqual(expect.objectContaining({
      data: expect.objectContaining({ label: "愿意了解活动" }),
      target: acceptNode.id,
    }));
  });

  it("validates input, intent descriptions and advanced prompt limits", () => {
    const node = createAiIntentNode([
      { description: "", id: "intent-empty" },
      { description: "重复意图", id: "intent-one" },
      { description: "重复意图", id: "intent-two" },
      { description: "x".repeat(AI_INTENT_DESCRIPTION_MAX_LENGTH + 1), id: "intent-long" },
    ]);
    const invalidNode: WorkflowNode<"ai-intent"> = {
      ...node,
      data: {
        ...node.data,
        advancedEnabled: true,
        prompt: "x".repeat(AI_INTENT_PROMPT_MAX_LENGTH + 1),
      },
    };
    const issueCodes = validateWorkflowNodeConfig(invalidNode, [invalidNode], [])
      .map((issue) => issue.code);

    expect(issueCodes).toEqual(expect.arrayContaining([
      "ai-intent-input-required",
      "ai-intent-description-required",
      "ai-intent-description-duplicate",
      "ai-intent-description-too-long",
      "ai-intent-prompt-too-long",
    ]));

    expect(validateWorkflowNodeConfig({
      ...invalidNode,
      data: { ...invalidNode.data, advancedEnabled: false },
    }, [invalidNode], []).map((issue) => issue.code))
      .not.toContain("ai-intent-prompt-too-long");

    const invalidInputNode: WorkflowNode<"ai-intent"> = {
      ...createAiIntentNode([{ description: "愿意参加活动", id: "intent-accept" }]),
      data: {
        ...createDefaultNodeData("ai-intent"),
        inputSelector: ["node", "missing-node", "messageIds"],
        intents: [{ description: "愿意参加活动", id: "intent-accept" }],
      },
    };
    expect(validateWorkflowNodeConfig(invalidInputNode, [invalidInputNode], []))
      .toContainEqual(expect.objectContaining({ code: "ai-intent-input-invalid" }));

  });
});

function createRenderHandlers() {
  return {
    onDeleteNode: vi.fn(),
    onDuplicateNode: vi.fn(),
    onInsertNodeAfter: vi.fn(),
    onInsertNodeBetween: vi.fn(),
    onRenameNode: vi.fn(),
    onSelectNode: vi.fn(),
    onToggleEdgeInsertMenu: vi.fn(),
    onToggleNodeInsertMenu: vi.fn(),
    onToggleNodeSelection: vi.fn(),
  };
}

function StatefulAiIntentConfig({
  edges,
  initialNode,
  nodes,
  onNodeChange,
}: {
  edges: WorkflowEdge[];
  initialNode: WorkflowNode<"ai-intent">;
  nodes: WorkflowNode[];
  onNodeChange: (patch: WorkflowNodeConfigPatch<"ai-intent">) => void;
}) {
  const [node, setNode] = useState(initialNode);

  return (
    <AiIntentConfig
      edges={edges}
      node={node}
      nodes={nodes.map((item) => item.id === node.id ? node : item)}
      onNodeChange={(patch) => {
        onNodeChange(patch);
        setNode((current) => ({
          ...current,
          data: { ...current.data, ...patch },
        }));
      }}
    />
  );
}

function createStartNode(): WorkflowNode<"start"> {
  return {
    data: createDefaultNodeData("start"),
    id: "start",
    position: { x: 0, y: 0 },
    type: WORKFLOW_NODE_TYPE,
  };
}

function createAiIntentNode(
  intents: AiIntentNodeData["intents"],
): WorkflowNode<"ai-intent"> {
  return {
    data: {
      ...createDefaultNodeData("ai-intent"),
      intents,
    },
    id: "ai-intent",
    position: { x: 0, y: 0 },
    type: WORKFLOW_NODE_TYPE,
  };
}
