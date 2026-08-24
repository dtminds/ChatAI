import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { WORKFLOW_NODE_TYPE } from "@/pages/chat/workflow/constants";
import { createEdge, createNodeFromKind } from "@/pages/chat/workflow/graph";
import { createDefaultNodeData, getNodeDefinition } from "@/pages/chat/workflow/node-definitions";
import { OrderBindConfig } from "@/pages/chat/workflow/nodes/order-bind/panel";
import { orderBindNodeUi } from "@/pages/chat/workflow/nodes/order-bind/ui";
import { NodeOutputsSection } from "@/pages/chat/workflow/panels/node-outputs-section";
import type {
  WorkflowNode,
  WorkflowNodeConfigPatch,
} from "@/pages/chat/workflow/types";

describe("workflow Order Bind node", () => {
  it("starts incomplete, sits in customer operations, and exposes bind result", () => {
    const definition = getNodeDefinition("order-bind");
    const node = createOrderBindNode();

    expect(definition.paletteGroup).toBe("operate");
    expect(definition.visual.label).toBe("绑定订单");
    expect(node.data.status).toBe("warning");
    expect(definition.validate?.(node, {
      availableVariables: [],
      edges: [],
      nodes: [node],
    })).toContainEqual(
      expect.objectContaining({ code: "order-bind-selector-required" }),
    );
    expect(definition.getOutputVariables?.(node)).toEqual([
      expect.objectContaining({
        key: "result",
        label: "操作结果",
        valueType: { kind: "string" },
      }),
    ]);
    expect(orderBindNodeUi.body.kind === "fields"
      ? orderBindNodeUi.body.getFields(node.data)
      : []).toEqual([
      expect.objectContaining({
        id: "order-number",
        value: { kind: "empty" },
      }),
    ]);
  });

  it("lets the user pick an upstream order number", async () => {
    const user = userEvent.setup();
    const onNodeChange = vi.fn();
    const llm = createLlmOrderNumberNode();
    const node = createOrderBindNode();

    render(
      <StatefulOrderBindConfig
        llm={llm}
        node={node}
        onNodeChange={onNodeChange}
      />,
    );

    expect(screen.getByText("节点输入")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "订单号" }));
    await user.click(screen.getByRole("menuitem", { name: llm.data.title }));
    fireEvent.pointerDown(screen.getByRole("menuitem", { name: /订单号/ }));

    expect(onNodeChange).toHaveBeenLastCalledWith(expect.objectContaining({
      orderNumberSelector: ["node", llm.id, "orderNo"],
      status: "ready",
    }));
  });

  it("shows the bind result in the shared output section", () => {
    render(<NodeOutputsSection node={createOrderBindNode()} />);

    expect(screen.getByText("节点输出")).toBeInTheDocument();
    expect(screen.getByText("操作结果")).toBeInTheDocument();
    expect(screen.getByText("文本")).toBeInTheDocument();
  });
});

function StatefulOrderBindConfig({
  llm,
  node,
  onNodeChange,
}: {
  llm: WorkflowNode<"llm">;
  node: WorkflowNode<"order-bind">;
  onNodeChange: (patch: WorkflowNodeConfigPatch<"order-bind">) => void;
}) {
  const [current, setCurrent] = useState(node);

  return (
    <OrderBindConfig
      edges={[createEdge(llm.id, current.id)]}
      node={current}
      nodes={[llm, current]}
      onNodeChange={(patch) => {
        onNodeChange(patch);
        setCurrent({
          ...current,
          data: { ...current.data, ...patch },
        });
      }}
    />
  );
}

function createLlmOrderNumberNode(): WorkflowNode<"llm"> {
  const node = createNodeFromKind("llm", "llm-1", 0);
  node.data = {
    ...node.data,
    output: {
      field: { description: "", id: "orderNo", name: "订单号", type: "string" },
      format: "text",
    },
  };
  return node;
}

function createOrderBindNode(): WorkflowNode<"order-bind"> {
  return {
    data: createDefaultNodeData("order-bind"),
    id: "order-bind",
    position: { x: 0, y: 0 },
    type: WORKFLOW_NODE_TYPE,
  };
}
