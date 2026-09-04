import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { WORKFLOW_NODE_TYPE } from "@/pages/chat/workflow/constants";
import { createEdge, createNodeFromKind } from "@/pages/chat/workflow/graph";
import { createDefaultNodeData, getNodeDefinition } from "@/pages/chat/workflow/node-definitions";
import { OrderConversionConfig } from "@/pages/chat/workflow/nodes/order-conversion/panel";
import { orderConversionNodeUi } from "@/pages/chat/workflow/nodes/order-conversion/ui";
import { NodeOutputsSection } from "@/pages/chat/workflow/panels/node-outputs-section";
import type {
  WorkflowNode,
  WorkflowNodeConfigPatch,
} from "@/pages/chat/workflow/types";

describe("workflow Order Conversion node", () => {
  it("starts incomplete, sits in customer operations, and exposes the conversion result", () => {
    const definition = getNodeDefinition("order-conversion");
    const node = createOrderConversionNode();

    expect(definition.paletteGroup).toBe("operate");
    expect(definition.visual.label).toBe("代客转积分");
    expect(node.data.status).toBe("warning");
    expect(definition.validate?.(node, {
      availableVariables: [],
      edges: [],
      nodes: [node],
    })).toContainEqual(
      expect.objectContaining({ code: "order-conversion-selector-required" }),
    );
    expect(definition.getOutputVariables?.(node)).toEqual([
      expect.objectContaining({
        key: "result",
        label: "操作结果",
        valueType: { kind: "boolean" },
      }),
    ]);
    expect(orderConversionNodeUi.body.kind === "fields"
      ? orderConversionNodeUi.body.getFields(node.data)
      : []).toEqual([
      expect.objectContaining({
        id: "input",
        value: { kind: "empty" },
      }),
    ]);
  });

  it("lets the user pick an upstream order number", async () => {
    const user = userEvent.setup();
    const onNodeChange = vi.fn();
    const llm = createLlmOrderNumberNode();
    const node = createOrderConversionNode();

    render(
      <StatefulOrderConversionConfig
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
    expect(screen.getByRole("button", { name: "订单号" })).toHaveTextContent("大模型.订单号");

    const currentNode = createOrderConversionNode();
    currentNode.data = {
      ...currentNode.data,
      availableVariables: [{
        key: "orderNo",
        label: "订单号",
        scope: "node",
        selector: ["node", llm.id, "orderNo"],
        sourceNodeId: llm.id,
        sourceNodeKind: "llm",
        sourceNodeTitle: llm.data.title,
        type: "string",
        usages: ["variable"],
        valueType: { kind: "string" },
      }],
      orderNumberSelector: ["node", llm.id, "orderNo"],
    };
    expect(orderConversionNodeUi.body.kind === "fields"
      ? orderConversionNodeUi.body.getFields(currentNode.data)[0]
      : undefined).toMatchObject({
      id: "input",
      value: {
        items: [
          { kind: "source", text: "大模型" },
          { kind: "text", text: "." },
          { kind: "variable", text: "订单号" },
        ],
        kind: "segments",
      },
    });
  });

  it("shows the conversion result in the shared output section", () => {
    render(<NodeOutputsSection node={createOrderConversionNode()} />);

    expect(screen.getByText("节点输出")).toBeInTheDocument();
    expect(screen.getByText("操作结果")).toBeInTheDocument();
    expect(screen.getByText("是/否")).toBeInTheDocument();
  });
});

function StatefulOrderConversionConfig({
  llm,
  node,
  onNodeChange,
}: {
  llm: WorkflowNode<"llm">;
  node: WorkflowNode<"order-conversion">;
  onNodeChange: (patch: WorkflowNodeConfigPatch<"order-conversion">) => void;
}) {
  const [current, setCurrent] = useState(node);

  return (
    <OrderConversionConfig
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

function createOrderConversionNode(): WorkflowNode<"order-conversion"> {
  return {
    data: createDefaultNodeData("order-conversion"),
    id: "order-conversion",
    position: { x: 0, y: 0 },
    type: WORKFLOW_NODE_TYPE,
  };
}
