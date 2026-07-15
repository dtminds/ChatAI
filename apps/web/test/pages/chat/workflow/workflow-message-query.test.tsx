import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { WORKFLOW_NODE_TYPE } from "@/pages/chat/workflow/constants";
import { createEdge, createNodeFromKind } from "@/pages/chat/workflow/graph";
import { createDefaultNodeData, getNodeDefinition } from "@/pages/chat/workflow/node-definitions";
import { MessageQueryConfig } from "@/pages/chat/workflow/nodes/message-query/panel";
import { messageQueryNodeUi } from "@/pages/chat/workflow/nodes/message-query/ui";
import type { WorkflowNode } from "@/pages/chat/workflow/types";
import { createWorkflowRenderElements } from "@/pages/chat/workflow/use-workflow-render-elements";
import { validateWorkflowNodeConfig } from "@/pages/chat/workflow/validation/workflow-validation";

describe("workflow message query", () => {
  it("defines a stable default execution contract and downstream outputs", () => {
    const definition = getNodeDefinition("message-query");
    const data = definition.createDefaultData();

    expect(definition.createExecutionConfig(data)).toEqual({
      limit: 10,
      take: "latest",
      timeRange: {
        end: { field: "enteredAt", kind: "current-node-lifecycle" },
        mode: "dynamic",
        start: { field: "occurredAt", kind: "workflow-trigger" },
      },
    });
    expect(definition.getOutputVariables?.(createMessageQueryNode())).toEqual([
      expect.objectContaining({ key: "messageIds", type: "message-id-list", usages: ["intent-input"] }),
      expect.objectContaining({ key: "textContent", type: "string", usages: ["intent-input", "message-content", "variable"] }),
      expect.objectContaining({ key: "messageCount", type: "number" }),
      expect.objectContaining({ key: "rangeStart", type: "datetime", usages: ["time-reference", "variable"] }),
      expect.objectContaining({ key: "rangeEnd", type: "datetime", usages: ["time-reference", "variable"] }),
    ]);
  });

  it("shows lifecycle references with their upstream node titles on the canvas node", () => {
    const waitNode = createNodeFromKind("wait", "wait", 0);
    waitNode.data.title = "等待";
    const queryNode = {
      ...createMessageQueryNode(),
      data: {
        ...createDefaultNodeData("message-query"),
        timeRange: {
          end: { field: "exitedAt" as const, kind: "node-lifecycle" as const, nodeId: waitNode.id },
          mode: "dynamic" as const,
          start: { field: "enteredAt" as const, kind: "node-lifecycle" as const, nodeId: waitNode.id },
        },
      },
    };
    const rendered = createWorkflowRenderElements({
      activeEdgeInsertMenuId: null,
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
        kind: "text",
        maxLines: 2,
        text: "等待.进入时间 至 等待.退出时间",
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
        kind: "text",
        maxLines: 2,
        text: "2026-07-17 00:00 至 未配置",
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
    await user.hover(screen.getByRole("menuitem", { name: "发送活动邀约" }));
    expect(await screen.findByRole("menuitem", { name: "进入时间" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "退出时间" })).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByRole("menuitem", { name: "发送成功时间" }));

    expect(onNodeChange).toHaveBeenLastCalledWith(expect.objectContaining({
      timeRange: expect.objectContaining({
        start: {
          kind: "node-output",
          selector: ["node", messageNode.id, "sentAt"],
        },
      }),
    }));
    expect(screen.getByRole("button", { name: "结束时间时间点" })).toHaveTextContent("当前节点.进入时间");
  });

  it("shows trigger time under start and only entry time under the current node", async () => {
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

    await user.click(screen.getByRole("button", { name: "开始时间时间点" }));
    const startMenuItem = screen.getByRole("menuitem", { name: "开始" });
    expect(startMenuItem.querySelector('[data-node-icon="start"]')).toBeInTheDocument();
    await user.hover(startMenuItem);
    expect(await screen.findByRole("menuitem", { name: "触发时间" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "进入时间" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "结束时间时间点" }));
    const currentNodeMenuItem = screen.getByRole("menuitem", { name: "当前节点" });
    expect(currentNodeMenuItem.querySelector('[data-node-icon="message-query"]')).toBeInTheDocument();
    await user.hover(currentNodeMenuItem);
    expect(await screen.findByRole("menuitem", { name: "进入时间" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "退出时间" })).not.toBeInTheDocument();
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
          end: { field: "enteredAt" as const, kind: "current-node-lifecycle" as const },
          mode: "dynamic" as const,
          start: {
            field: "exitedAt" as const,
            kind: "node-lifecycle" as const,
            nodeId: conditionalMessage.id,
          },
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

    expect(validateWorkflowNodeConfig(queryNode, nodes, edges)).toContainEqual({
      code: "message-query-start-time-invalid",
      message: "开始时间引用了不可用的前序节点时间",
      severity: "warning",
      source: "config",
    });
  });

  it("rejects reversed fixed ranges", () => {
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
