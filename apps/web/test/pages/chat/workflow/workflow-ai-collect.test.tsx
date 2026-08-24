import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { WORKFLOW_NODE_TYPE } from "@/pages/chat/workflow/constants";
import { createEdge, createNodeFromKind } from "@/pages/chat/workflow/graph";
import {
  createDefaultNodeData,
  getNodeDefinition,
  insertableNodeKinds,
} from "@/pages/chat/workflow/node-definitions";
import {
  AI_COLLECT_COMPLETED_HANDLE_ID,
  AI_COLLECT_FIELD_MAX_COUNT,
  AI_COLLECT_INCOMPLETE_HANDLE_ID,
} from "@/pages/chat/workflow/nodes/ai-collect/config";
import { AiCollectNodeBody } from "@/pages/chat/workflow/nodes/ai-collect/body";
import { AiCollectConfig } from "@/pages/chat/workflow/nodes/ai-collect/panel";
import type {
  WorkflowEdge,
  WorkflowNode,
  WorkflowNodeConfigPatch,
} from "@/pages/chat/workflow/types";
import { validateWorkflowNodeConfig } from "@/pages/chat/workflow/validation/workflow-validation";
import { hydrateWorkflowDraft } from "@/pages/chat/workflow/workflow-draft-normalizer";
import { getAvailableVariablesForNode } from "@/pages/chat/workflow/workflow-variables";
import { createWorkflowRenderElements } from "@/pages/chat/workflow/use-workflow-render-elements";

describe("workflow AI Collect", () => {
  it("renders both collection outcomes on the node card", () => {
    render(
      <AiCollectNodeBody
        data={createDefaultNodeData("ai-collect")}
        visual={getNodeDefinition("ai-collect").visual}
      />,
    );

    const outcomes = within(screen.getByLabelText("资料收集出口"));
    expect(outcomes.getByText("已完成")).toBeInTheDocument();
    expect(outcomes.getByText("未完成")).toBeInTheDocument();
  });

  it("creates a stable follow-up draft and preserves field IDs during hydration", () => {
    const first = createDefaultNodeData("ai-collect");
    const second = createDefaultNodeData("ai-collect");

    expect(first).toMatchObject({
      maxFollowUpCount: 3,
      openingMessage: "",
      timeout: { duration: 24, unit: "hour" },
    });
    expect(first.fields).toHaveLength(1);
    expect(first.fields[0]?.id).not.toBe(second.fields[0]?.id);

    const draft = hydrateWorkflowDraft({
      edges: [],
      nodes: [{
        data: {
          ...first,
          fields: [{
            id: "field-order",
            instruction: "提取完整订单号",
            name: "订单号",
            type: "text",
          }],
        },
        id: "collect",
        position: { x: 0, y: 0 },
        type: WORKFLOW_NODE_TYPE,
      }],
      viewport: { x: 0, y: 0, zoom: 1 },
    });
    const data = draft.nodes[0]?.data;
    expect(data?.kind).toBe("ai-collect");
    if (data?.kind !== "ai-collect") return;
    expect(data.fields[0]?.id).toBe("field-order");
    expect(hydrateWorkflowDraft(draft).nodes[0]?.data).toEqual(data);
  });

  it("adds editable templates, enforces the field limit, and switches follow-up controls", async () => {
    const user = userEvent.setup();
    const onNodeChange = vi.fn();
    const start = createStartNode();
    const query = createNodeFromKind("message-query", "query", 1);
    const collect = createAiCollectNode();
    const nodes = [start, query, collect];
    const edges = [
      createEdge(start.id, query.id),
      createEdge(query.id, collect.id),
    ];

    render(
      <StatefulAiCollectConfig
        edges={edges}
        initialNode={collect}
        nodes={nodes}
        onNodeChange={onNodeChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "从模板选择" }));
    await user.click(screen.getByRole("menuitem", { name: "订单号" }));
    const fieldName = screen.getByRole("textbox", { name: "字段 1 名称" });
    expect(fieldName).toHaveValue("订单号");
    await user.clear(fieldName);
    await user.type(fieldName, "交易单号");
    expect(onNodeChange).toHaveBeenLastCalledWith(expect.objectContaining({
      fields: [expect.objectContaining({ name: "交易单号" })],
    }));

    expect(screen.getByRole("textbox", { name: "开场白" })).toBeInTheDocument();
    await user.click(screen.getByRole("combobox", { name: "最多追问轮次" }));
    expect(screen.getByRole("option", { name: "1 轮" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "10 轮" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "11 轮" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "10 轮" }));
    expect(onNodeChange).toHaveBeenLastCalledWith(expect.objectContaining({
      maxFollowUpCount: 10,
    }));

    await user.click(screen.getByRole("switch", { name: "智能体辅助" }));
    expect(screen.getByRole("textbox", { name: "开场白" })).toBeInTheDocument();
    expect(screen.queryByRole("spinbutton", { name: "最长等待时间" })).not.toBeInTheDocument();
    expect(onNodeChange).toHaveBeenLastCalledWith(expect.objectContaining({
      maxFollowUpCount: 0,
      status: "warning",
    }));

    await user.click(screen.getByRole("button", { name: "输入" }));
    await user.click(screen.getByRole("menuitem", { name: /消息查询/ }));
    fireEvent.pointerDown(screen.getByRole("menuitem", { name: /消息列表/ }));
    expect(onNodeChange).toHaveBeenLastCalledWith(expect.objectContaining({
      inputSelector: ["node", query.id, "messages"],
      status: "ready",
    }));

    await user.click(screen.getByRole("switch", { name: "智能体辅助" }));
    expect(screen.getByRole("combobox", { name: "最多追问轮次" }))
      .toHaveTextContent("10 轮");
    expect(onNodeChange).toHaveBeenLastCalledWith(expect.objectContaining({
      maxFollowUpCount: 10,
    }));

    for (let index = 1; index < AI_COLLECT_FIELD_MAX_COUNT; index += 1) {
      await user.click(screen.getByRole("button", { name: "添加字段" }));
    }
    expect(screen.getAllByRole("textbox", { name: /^字段 \d+ 名称$/ }))
      .toHaveLength(AI_COLLECT_FIELD_MAX_COUNT);
    expect(screen.getByRole("button", { name: "添加字段" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "从模板选择" })).toBeDisabled();
  });

  it("caps follow-up collection at 48 hours and offers no day unit", async () => {
    const user = userEvent.setup();
    const onNodeChange = vi.fn();
    const collect = createAiCollectNode();

    render(
      <StatefulAiCollectConfig
        edges={[]}
        initialNode={collect}
        nodes={[collect]}
        onNodeChange={onNodeChange}
      />,
    );

    await user.click(screen.getByRole("combobox", { name: "最长等待时间单位" }));
    expect(screen.getByRole("option", { name: "分钟" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "小时" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "天" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "小时" }));

    const duration = screen.getByRole("spinbutton", { name: "最长等待时间" });
    fireEvent.change(duration, { target: { value: "49" } });
    fireEvent.blur(duration);
    expect(duration).toHaveValue(48);
    expect(onNodeChange).toHaveBeenLastCalledWith(expect.objectContaining({
      timeout: { duration: 48, unit: "hour" },
    }));
  });

  it("requires input without follow-ups and exposes dynamic outputs only after completion", () => {
    const definition = getNodeDefinition("ai-collect");
    const collect = createAiCollectNode({
      fields: [
        { id: "field-order", instruction: "提取订单号", name: "订单号", type: "text" },
        { id: "field-paid", instruction: "判断是否支付", name: "已支付", type: "boolean" },
      ],
      maxFollowUpCount: 0,
    });
    const completedTarget = createNodeFromKind("message", "completed-target", 2);
    const incompleteTarget = createNodeFromKind("message", "incomplete-target", 3);
    const completedEdge = createEdge(collect.id, completedTarget.id, undefined, {
      sourceHandle: AI_COLLECT_COMPLETED_HANDLE_ID,
    });
    const incompleteEdge = createEdge(collect.id, incompleteTarget.id, undefined, {
      sourceHandle: AI_COLLECT_INCOMPLETE_HANDLE_ID,
    });

    expect(validateWorkflowNodeConfig(collect, [collect], []).map(issue => issue.code))
      .toContain("ai-collect-input-required");
    expect(definition.getOutputVariables?.(collect)).toEqual([
      expect.objectContaining({
        availableOnSourceHandles: [AI_COLLECT_COMPLETED_HANDLE_ID],
        key: "field-order",
        label: "订单号",
        valueType: { kind: "string" },
      }),
      expect.objectContaining({
        availableOnSourceHandles: [AI_COLLECT_COMPLETED_HANDLE_ID],
        key: "field-paid",
        label: "已支付",
        valueType: { kind: "boolean" },
      }),
    ]);
    expect(getAvailableVariablesForNode(
      completedTarget.id,
      [collect, completedTarget, incompleteTarget],
      [completedEdge, incompleteEdge],
    ).map(variable => variable.selector)).toEqual(expect.arrayContaining([
      ["node", collect.id, "field-order"],
      ["node", collect.id, "field-paid"],
    ]));
    expect(getAvailableVariablesForNode(
      incompleteTarget.id,
      [collect, completedTarget, incompleteTarget],
      [completedEdge, incompleteEdge],
    ).map(variable => variable.selector)).not.toEqual(expect.arrayContaining([
      ["node", collect.id, "field-order"],
    ]));
  });

  it("derives warning status when a configured input becomes unavailable", () => {
    const start = createStartNode();
    const query = createNodeFromKind("message-query", "query", 1);
    const collect = createAiCollectNode({
      fields: [{ id: "field-order", instruction: "提取订单号", name: "订单号", type: "text" }],
      inputSelector: ["node", query.id, "messages"],
      status: "ready",
    });
    const connectedEdges = [
      createEdge(start.id, query.id),
      createEdge(query.id, collect.id),
    ];
    const options = {
      ...createRenderHandlers(),
      activeEdgeInsertMenuId: null,
      allowedInsertableNodeKinds: insertableNodeKinds,
      nodes: [start, query, collect],
      quickInsertTarget: null,
      selectedEdgeId: null,
      selectedNodeIdSet: new Set<string>(),
    };

    expect(createWorkflowRenderElements({
      ...options,
      edges: connectedEdges,
    }).nodes.find(node => node.id === collect.id)?.data.status).toBe("ready");
    expect(createWorkflowRenderElements({
      ...options,
      edges: [connectedEdges[0]!],
    }).nodes.find(node => node.id === collect.id)?.data.status).toBe("warning");
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

function StatefulAiCollectConfig({ edges, initialNode, nodes, onNodeChange }: {
  edges: WorkflowEdge[];
  initialNode: WorkflowNode<"ai-collect">;
  nodes: WorkflowNode[];
  onNodeChange: (patch: WorkflowNodeConfigPatch<"ai-collect">) => void;
}) {
  const [node, setNode] = useState(initialNode);
  return (
    <AiCollectConfig
      edges={edges}
      node={node}
      nodes={nodes.map(item => item.id === node.id ? node : item)}
      onNodeChange={(patch) => {
        onNodeChange(patch);
        setNode(current => ({ ...current, data: { ...current.data, ...patch } }));
      }}
    />
  );
}

function createAiCollectNode(
  overrides: Partial<WorkflowNode<"ai-collect">["data"]> = {},
): WorkflowNode<"ai-collect"> {
  return {
    data: { ...createDefaultNodeData("ai-collect"), ...overrides },
    id: "ai-collect",
    position: { x: 0, y: 0 },
    type: WORKFLOW_NODE_TYPE,
  };
}

function createStartNode(): WorkflowNode<"start"> {
  return {
    data: createDefaultNodeData("start"),
    id: "start",
    position: { x: 0, y: 0 },
    type: WORKFLOW_NODE_TYPE,
  };
}
