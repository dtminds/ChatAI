import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { projectWorkflowNodeExecutionConfig } from "@chatai/workflow-engine/node-contract-registry";
import { WORKFLOW_NODE_TYPE } from "@/pages/chat/workflow/constants";
import { createEdge, createNodeFromKind } from "@/pages/chat/workflow/graph";
import { createDefaultNodeData, getNodeDefinition, insertableNodeKinds } from "@/pages/chat/workflow/node-definitions";
import { MessageQueryConfig } from "@/pages/chat/workflow/nodes/message-query/panel";
import { messageQueryNodeUi } from "@/pages/chat/workflow/nodes/message-query/ui";
import type { WorkflowNode } from "@/pages/chat/workflow/types";
import { createWorkflowRenderElements } from "@/pages/chat/workflow/use-workflow-render-elements";
import { validateWorkflowNodeConfig } from "@/pages/chat/workflow/validation/workflow-validation";
import { WorkflowCustomFieldResourceProvider } from "@/pages/chat/workflow/workflow-custom-field-resource";

describe("workflow message query", () => {
  it("edits relative times with the existing panel controls and preserves saved values", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    function StatefulPanel() {
      const [node, setNode] = useState(createMessageQueryNode);
      return <MessageQueryConfig
        edges={[createEdge("start", node.id)]} node={node} nodes={[createStartNode(), node]}
        onNodeChange={patch => {
          onChange(patch);
          setNode(current => ({ ...current, data: { ...current.data, ...patch } }));
        }}
      />;
    }
    const view = render(<StatefulPanel />);
    expect(screen.getByRole("radio", { name: "动态时间" })).toBeChecked();
    await user.click(screen.getByRole("radio", { name: "相对时间" }));
    const startInput = screen.getByRole("spinbutton", { name: "开始时间相对数值" });
    await user.clear(startInput);
    await user.type(startInput, "7");
    await user.tab();
    await user.click(screen.getByRole("combobox", { name: "开始时间相对单位" }));
    await user.click(screen.getByRole("option", { name: "小时前" }));
    await user.click(screen.getByRole("button", { name: "结束时间时间点" }));
    await user.click(screen.getByRole("button", { name: "22时" }));
    await user.keyboard("{Escape}");
    const patch = onChange.mock.calls.at(-1)![0];
    expect(patch.timeRange).toEqual({
      mode: "relative",
      start: { amount: 7, unit: "hour", time: "00:00" },
      end: { amount: 0, unit: "day", time: "22:59" },
    });
    view.unmount();
    const node = createMessageQueryNode();
    node.data = { ...node.data, ...patch };
    render(<MessageQueryConfig edges={[]} node={node} nodes={[node]} onNodeChange={vi.fn()} />);
    expect(screen.getByRole("radio", { name: "相对时间" })).toBeChecked();
    expect(screen.getByRole("spinbutton", { name: "开始时间相对数值" })).toHaveValue(7);
    expect(messageQueryNodeUi.body.kind === "fields" && messageQueryNodeUi.body.getFields(node.data))
      .toEqual(expect.arrayContaining([expect.objectContaining({
        id: "time-range",
        value: expect.objectContaining({ items: expect.arrayContaining([
          expect.objectContaining({ text: "过去 7 小时 00:00" }),
          expect.objectContaining({ text: "过去 0 天 22:59" }),
        ]) }),
      })]));
  });

  it("defines a stable default execution contract and downstream outputs", () => {
    const definition = getNodeDefinition("message-query");
    const data = definition.createDefaultData();

    expect(projectWorkflowNodeExecutionConfig({ data, kind: "message-query" })).toEqual({
      limit: 10,
      take: "latest",
      timeRange: {
        end: ["current-node-lifecycle", "enteredAt"],
        mode: "dynamic",
        start: ["trigger", "occurredAt"],
      },
    });
    expect(definition.getOutputVariables?.(createMessageQueryNode())).toEqual([
      expect.objectContaining({ key: "messages", usages: ["intent-input", "variable"], valueType: { kind: "object", schemaRef: "workflow.messages.v1" } }),
      expect.objectContaining({ key: "messageCount", valueType: { kind: "number" } }),
      expect.objectContaining({ key: "rangeStart", usages: ["time-reference", "variable"], valueType: { kind: "datetime" } }),
      expect.objectContaining({ key: "rangeEnd", usages: ["time-reference", "variable"], valueType: { kind: "datetime" } }),
    ]);
  });

  it("shows global and lifecycle references correctly on the canvas node", () => {
    const waitNode = createNodeFromKind("wait", "wait", 0);
    waitNode.data.title = "等待";
    const queryNode = {
      ...createMessageQueryNode(),
      data: {
        ...createDefaultNodeData("message-query"),
        timeRange: {
          end: ["node-lifecycle", waitNode.id, "exitedAt"],
          mode: "dynamic" as const,
          start: ["trigger", "occurredAt"],
        },
      },
    };
    const rendered = createWorkflowRenderElements({
      activeEdgeInsertMenuId: null,
      allowedInsertableNodeKinds: insertableNodeKinds,
      edges: [createEdge("start", waitNode.id), createEdge(waitNode.id, queryNode.id)],
      nodes: [createStartNode(), waitNode, queryNode],
      onDeleteNode: vi.fn(),
      onDuplicateNode: vi.fn(),
      onInsertNodeAfter: vi.fn(),
      onInsertNodeBetween: vi.fn(),
      onRenameNode: vi.fn(),
      onSelectNode: vi.fn(),
      onToggleEdgeInsertMenu: vi.fn(),
      onToggleNodeInsertMenu: vi.fn(),
      onToggleNodeSelection: vi.fn(),
      quickInsertTarget: null,
      selectedEdgeId: null,
      selectedNodeIdSet: new Set(),
    });
    const renderData = rendered.nodes.find((node) => node.id === queryNode.id)?.data;

    expect(renderData).toBeDefined();
    if (
      !renderData
      || renderData.kind !== "message-query"
      || messageQueryNodeUi.body.kind !== "fields"
    ) return;
    expect(messageQueryNodeUi.body.getFields(renderData)).toContainEqual(expect.objectContaining({
      id: "time-range",
      value: {
        items: [
          { kind: "source", text: "全局变量" },
          { kind: "text", text: ".", tone: "muted" },
          { kind: "variable", text: "触发时间" },
          { kind: "operator", text: " 至 " },
          { kind: "source", text: "等待" },
          { kind: "text", text: ".", tone: "muted" },
          { kind: "variable", text: "退出时间" },
        ],
        kind: "segments",
        maxLines: 2,
      },
    }));
  });

  it("formats fixed date-time values for the canvas node without changing stored values", () => {
    const data = {
      ...createDefaultNodeData("message-query"),
      timeRange: {
        endAt: "",
        mode: "fixed" as const,
        startAt: "2026-07-17T00:00",
      },
    };

    if (messageQueryNodeUi.body.kind !== "fields") return;
    expect(messageQueryNodeUi.body.getFields(data)).toContainEqual(expect.objectContaining({
      id: "time-range",
      value: {
        items: [
          { kind: "value", text: "2026-07-17 00:00" },
          { kind: "operator", text: " 至 " },
          { kind: "value", text: "未配置", tone: "warning" },
        ],
        kind: "segments",
        maxLines: 2,
      },
    }));
    expect(data.timeRange.startAt).toBe("2026-07-17T00:00");
  });

  it("selects lifecycle and business times from nested node menus", async () => {
    const user = userEvent.setup();
    const onNodeChange = vi.fn();
    const messageNode = createMessageNode("message-source", "发送活动邀约");
    const queryNode = createMessageQueryNode();
    const nodes = [createStartNode(), messageNode, queryNode];
    const edges = [
      createEdge("start", messageNode.id),
      createEdge(messageNode.id, queryNode.id),
    ];

    render(
      <MessageQueryConfig
        edges={edges}
        node={queryNode}
        nodes={nodes}
        onNodeChange={onNodeChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "开始时间时间点" }));
    await user.click(screen.getByRole("menuitem", { name: "发送活动邀约" }));
    expect(await screen.findByRole("menuitem", { name: /进入时间.*日期时间/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /退出时间.*日期时间/ })).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByRole("menuitem", { name: /退出时间.*日期时间/ }));

    expect(onNodeChange).toHaveBeenLastCalledWith(expect.objectContaining({
      timeRange: expect.objectContaining({
        start: ["node-lifecycle", messageNode.id, "exitedAt"],
      }),
    }));
    expect(screen.getByRole("button", { name: "结束时间时间点" })).toHaveTextContent("消息查询.进入时间");
  });

  it("keeps trigger time global and shows lifecycle values under their nodes", async () => {
    const user = userEvent.setup();
    const queryNode = createMessageQueryNode();
    render(
      <MessageQueryConfig
        edges={[createEdge("start", queryNode.id)]}
        node={queryNode}
        nodes={[createStartNode(), queryNode]}
        onNodeChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "开始时间时间点" }))
      .toHaveTextContent("全局变量.触发时间");
    await user.click(screen.getByRole("button", { name: "开始时间时间点" }));
    const startMenuItem = screen.getByRole("menuitem", { name: "开始" });
    await user.click(startMenuItem);
    expect(await screen.findByRole("menuitem", { name: /进入时间.*日期时间/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /退出时间.*日期时间/ })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /触发时间.*日期时间/ })).not.toBeInTheDocument();

    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "开始时间时间点" }));
    await user.click(screen.getByRole("menuitem", { name: "全局变量" }));
    expect(await screen.findByRole("menuitem", { name: /触发时间.*日期时间/ })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "结束时间时间点" }));
    const currentNodeMenuItem = screen.getByRole("menuitem", { name: "消息查询（当前节点）" });
    await user.click(currentNodeMenuItem);
    expect(await screen.findByRole("menuitem", { name: /进入时间.*日期时间/ })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /退出时间.*日期时间/ })).not.toBeInTheDocument();
    await user.hover(currentNodeMenuItem);
    expect(await screen.findByRole("menuitem", { name: /进入时间.*日期时间/ })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /退出时间.*日期时间/ })).not.toBeInTheDocument();
  });

  it("hides incompatible custom fields from dynamic time selectors", async () => {
    const user = userEvent.setup();
    const queryNode = createMessageQueryNode();
    const customFieldResource = {
      fields: [
        { id: 7, key: "level", options: [], sort: 1, title: "会员等级", type: 1 },
        { id: 8, key: "spend", options: [], sort: 2, title: "累计消费", type: 11 },
        { id: 9, key: "unknown", options: [], sort: 3, title: "多选偏好", type: 999 },
      ],
      reload: vi.fn(),
      status: "ready" as const,
    };

    render(
      <WorkflowCustomFieldResourceProvider resource={customFieldResource}>
        <MessageQueryConfig
          edges={[createEdge("start", queryNode.id)]}
          node={queryNode}
          nodes={[createStartNode(), queryNode]}
          onNodeChange={vi.fn()}
          resources={{ customFields: customFieldResource }}
        />
      </WorkflowCustomFieldResourceProvider>,
    );

    await user.click(screen.getByRole("button", { name: "开始时间时间点" }));
    await user.click(screen.getByRole("menuitem", { name: "全局变量" }));

    expect(screen.getByRole("menuitem", { name: "触发时间日期时间" })).toBeInTheDocument();
    expect(screen.queryByText("客户自定义属性")).not.toBeInTheDocument();
    expect(screen.queryByText("暂不支持")).not.toBeInTheDocument();
  });

  it("switches between fixed and dynamic ranges and keeps query limits bounded", async () => {
    const user = userEvent.setup();
    const onNodeChange = vi.fn();
    const queryNode = createMessageQueryNode();

    render(
      <MessageQueryConfig
        edges={[createEdge("start", queryNode.id)]}
        node={queryNode}
        nodes={[createStartNode(), queryNode]}
        onNodeChange={onNodeChange}
      />,
    );

    await user.click(screen.getByRole("radio", { name: "固定时间" }));
    expect(onNodeChange).toHaveBeenLastCalledWith(expect.objectContaining({
      status: "warning",
      timeRange: { endAt: "", mode: "fixed", startAt: "" },
    }));

    await user.click(screen.getByRole("combobox", { name: "消息取数顺序" }));
    await user.click(screen.getByRole("option", { name: "最早" }));
    expect(onNodeChange).toHaveBeenLastCalledWith(expect.objectContaining({ take: "earliest" }));

    const limitInput = screen.getByRole("spinbutton", { name: "消息数量" });
    fireEvent.change(limitInput, { target: { value: "99" } });
    fireEvent.blur(limitInput);
    expect(onNodeChange).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 50 }));
  });

  it("only accepts lifecycle and business times from guaranteed upstream nodes", () => {
    const guaranteedMessage = createMessageNode("message-guaranteed", "确定发送");
    const conditionalMessage = createMessageNode("message-conditional", "分支发送");
    const queryNode = {
      ...createMessageQueryNode(),
      data: {
        ...createDefaultNodeData("message-query"),
        timeRange: {
          end: ["current-node-lifecycle", "enteredAt"],
          mode: "dynamic" as const,
          start: ["node-lifecycle", conditionalMessage.id, "exitedAt"],
        },
      },
    };
    const nodes = [createStartNode(), guaranteedMessage, conditionalMessage, queryNode];
    const edges = [
      createEdge("start", guaranteedMessage.id),
      createEdge(guaranteedMessage.id, queryNode.id),
      createEdge("start", conditionalMessage.id),
      createEdge(conditionalMessage.id, "end"),
    ];

    expect(validateWorkflowNodeConfig(queryNode, nodes, edges)).toContainEqual(expect.objectContaining({
      code: "message-query-start-time-invalid",
      source: "config",
    }));
  });

  it("allows one complete minute and rejects reversed fixed ranges", () => {
    const queryNode = {
      ...createMessageQueryNode(),
      data: {
        ...createDefaultNodeData("message-query"),
        timeRange: {
          endAt: "2026-07-10T10:00",
          mode: "fixed" as const,
          startAt: "2026-07-10T11:00",
        },
      },
    };

    expect(validateWorkflowNodeConfig(
      queryNode,
      [createStartNode(), queryNode],
      [createEdge("start", queryNode.id)],
    )).toContainEqual(expect.objectContaining({ code: "message-query-time-range-invalid" }));

    const sameMinuteNode = {
      ...createMessageQueryNode(),
      data: {
        ...createDefaultNodeData("message-query"),
        timeRange: {
          endAt: "2026-07-10T10:00",
          mode: "fixed" as const,
          startAt: "2026-07-10T10:00",
        },
      },
    };
    expect(validateWorkflowNodeConfig(
      sameMinuteNode,
      [createStartNode(), sameMinuteNode],
      [createEdge("start", sameMinuteNode.id)],
    )).not.toContainEqual(expect.objectContaining({ code: "message-query-time-range-invalid" }));
  });

  it("rejects causally reversed dynamic ranges", () => {
    const queryNode = {
      ...createMessageQueryNode(),
      data: {
        ...createDefaultNodeData("message-query"),
        timeRange: {
          end: ["trigger", "occurredAt"],
          mode: "dynamic" as const,
          start: ["current-node-lifecycle", "enteredAt"],
        },
      },
    };

    expect(validateWorkflowNodeConfig(
      queryNode,
      [createStartNode(), queryNode],
      [createEdge("start", queryNode.id)],
    )).toContainEqual(expect.objectContaining({ code: "message-query-time-range-invalid" }));
  });

  it("rejects impossible fixed dates and identical dynamic references", () => {
    const impossibleDateNode = {
      ...createMessageQueryNode(),
      data: {
        ...createDefaultNodeData("message-query"),
        timeRange: {
          endAt: "2026-03-01T09:30",
          mode: "fixed" as const,
          startAt: "2026-02-30T09:30",
        },
      },
    };
    const identicalRangeNode = {
      ...createMessageQueryNode(),
      data: {
        ...createDefaultNodeData("message-query"),
        timeRange: {
          end: ["trigger", "occurredAt"],
          mode: "dynamic" as const,
          start: ["trigger", "occurredAt"],
        },
      },
    };

    expect(validateWorkflowNodeConfig(
      impossibleDateNode,
      [createStartNode(), impossibleDateNode],
      [createEdge("start", impossibleDateNode.id)],
    )).toContainEqual(expect.objectContaining({ code: "message-query-start-time-required" }));
    expect(validateWorkflowNodeConfig(
      identicalRangeNode,
      [createStartNode(), identicalRangeNode],
      [createEdge("start", identicalRangeNode.id)],
    )).toContainEqual(expect.objectContaining({ code: "message-query-time-range-identical" }));
  });
});

function createStartNode(): WorkflowNode<"start"> {
  return {
    data: createDefaultNodeData("start"),
    id: "start",
    position: { x: 0, y: 0 },
    type: WORKFLOW_NODE_TYPE,
  };
}

function createMessageNode(id: string, title: string): WorkflowNode<"message"> {
  const node = createNodeFromKind("message", id, 0);
  return { ...node, data: { ...node.data, title } };
}

function createMessageQueryNode(): WorkflowNode<"message-query"> {
  return createNodeFromKind("message-query", "message-query", 1);
}
