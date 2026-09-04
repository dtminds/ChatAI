import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { WORKFLOW_NODE_TYPE } from "@/pages/chat/workflow/constants";
import { createDefaultNodeData } from "@/pages/chat/workflow/node-definitions";
import { orderedWorkflowNodeDefinitions } from "@/pages/chat/workflow/nodes/registry";
import {
  NodeConfigPanel,
} from "@/pages/chat/workflow/panels";
import {
  NodeOutputsSection,
  WorkflowOutputDescription,
} from "@/pages/chat/workflow/panels/node-outputs-section";
import type {
  WorkflowNode,
  WorkflowNodeOutputDefinition,
} from "@/pages/chat/workflow/types";
import {
  getWorkflowNodeOutputDefinitions,
  getWorkflowOutputTypeLabel,
  validateWorkflowNodeOutputDefinitions,
} from "@/pages/chat/workflow/workflow-node-outputs";

describe("workflow node outputs", () => {
  it("keeps every registered node output declaration valid", () => {
    for (const [index, definition] of orderedWorkflowNodeDefinitions.entries()) {
      const node = createNode(definition.kind, index);
      const outputs = getWorkflowNodeOutputDefinitions(node);

      expect(outputs).toEqual(expect.any(Array));
    }
  });

  it("rejects unstable declarations before they reach variable consumers", () => {
    const node = createNode("agent", 0);
    const outputs: WorkflowNodeOutputDefinition[] = [
      {
        availableOnSourceHandles: ["missing-handle"],
        key: "invalid key",
        label: "",
        usages: ["message-content", "time-reference"],
        valueType: { kind: "number" },
      },
      {
        key: "invalid key",
        label: "重复输出",
        usages: ["variable"],
        valueType: { kind: "string" },
      },
    ];

    expect(validateWorkflowNodeOutputDefinitions(node, outputs)).toEqual(expect.arrayContaining([
      expect.stringContaining("stable identifier"),
      expect.stringContaining("label is required"),
      expect.stringContaining("incompatible with message-content"),
      expect.stringContaining("incompatible with time-reference"),
      expect.stringContaining("references missing-handle"),
      expect.stringContaining("duplicates invalid key"),
    ]));
    expect(validateWorkflowNodeOutputDefinitions(node, [{
      key: "records",
      label: "消息列表",
      usages: ["variable"],
      valueType: { itemType: "bigint", kind: "array", semantic: "message" },
    }])).toContainEqual(expect.stringContaining("incompatible with variable"));
    expect(validateWorkflowNodeOutputDefinitions(node, [{
      key: "query_result",
      label: "查询结果",
      usages: [],
      valueType: { kind: "object", schemaRef: "query-result" },
    }])).toEqual([]);
  });

  it("rejects output declarations that drift from the shared node contract", () => {
    const node = createNode("message-query", 0);

    expect(validateWorkflowNodeOutputDefinitions(node, [{
      key: "rangeStart",
      label: "查询开始时间",
      usages: ["variable"],
      valueType: { kind: "string" },
    }])).toContainEqual("output contract mismatch for rangeStart");
  });

  it("uses product-facing labels instead of implementation types", () => {
    expect(getWorkflowOutputTypeLabel({ kind: "string" })).toBe("文本");
    expect(getWorkflowOutputTypeLabel({ kind: "boolean" })).toBe("是/否");
    expect(getWorkflowOutputTypeLabel({ kind: "datetime" })).toBe("日期时间");
    expect(getWorkflowOutputTypeLabel({
      itemType: "bigint",
      kind: "array",
      semantic: "message",
    })).toBe("多条消息");
    expect(getWorkflowOutputTypeLabel({ kind: "object", schemaRef: "query-result" }))
      .toBe("结构化内容");
  });

  it("shows declared outputs in the shared settings section and hides empty nodes", () => {
    const queryNode = createNode("message-query", 0);
    const { rerender } = render(<NodeOutputsSection node={queryNode} />);

    expect(screen.getByText("节点输出")).toBeInTheDocument();
    expect(screen.getByText("消息列表")).toBeInTheDocument();
    expect(screen.getByText("结构化内容")).toBeInTheDocument();

    rerender(<NodeOutputsSection node={createNode("message", 1)} />);
    expect(screen.queryByText("节点输出")).not.toBeInTheDocument();
  });

  it("lets nodes that own output configuration suppress the shared output section", () => {
    render(
      <NodeConfigPanel
        allowedEntryEventTypes={["contact.friend_added", "contact.tag_added", "message.received"]}
        edges={[]}
        node={createNode("llm", 0)}
        nodes={[createNode("llm", 0)]}
        onClose={() => undefined}
        onNodeChange={() => undefined}
        onRenameNode={() => undefined}
      />,
    );

    expect(screen.getByRole("heading", { name: "输出" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "节点输出" })).not.toBeInTheDocument();
  });

  it.each([
    ["hover", async (button: HTMLElement, user: ReturnType<typeof userEvent.setup>) => user.hover(button)],
    ["click", async (button: HTMLElement) => fireEvent.click(button)],
    ["focus", async (button: HTMLElement) => fireEvent.focus(button)],
  ])("opens output descriptions with %s", async (_interaction, openDescription) => {
    const user = userEvent.setup();
    render(<NodeOutputsSection node={createNode("message-query", 0)} />);
    const button = screen.getByRole("button", { name: "查看消息列表说明" });

    await openDescription(button, user);

    expect(await screen.findByText(/时间顺序/)).toBeInTheDocument();
  });

  it("renders only the supported output description markdown", () => {
    render(
      <WorkflowOutputDescription
        content={'**重点** `示例`\n\n- 第一项\n\n[外部链接](https://example.com)<script>alert("x")</script>'}
      />,
    );

    expect(screen.getByText("重点").tagName).toBe("STRONG");
    expect(screen.getByText("示例").tagName).toBe("CODE");
    expect(screen.getByText("第一项").closest("li")).not.toBeNull();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(document.querySelector("script")).toBeNull();
  });
});

function createNode<TKind extends Parameters<typeof createDefaultNodeData>[0]>(
  kind: TKind,
  index: number,
): WorkflowNode<TKind> {
  return {
    data: createDefaultNodeData(kind),
    id: `node-${kind}`,
    position: { x: index * 100, y: 0 },
    type: WORKFLOW_NODE_TYPE,
  };
}
