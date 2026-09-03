import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type {
  CustomFieldItem,
  WorkflowCustomerUpdateDraftField,
} from "@chatai/contracts";
import { WORKFLOW_NODE_TYPE } from "@/pages/chat/workflow/constants";
import { createEdge, createNodeFromKind } from "@/pages/chat/workflow/graph";
import { createDefaultNodeData, getNodeDefinition } from "@/pages/chat/workflow/node-definitions";
import {
  getCompatibleCustomerUpdateVariables,
  getCustomerUpdateNodePatch,
} from "@/pages/chat/workflow/nodes/customer-update/config";
import { CustomerUpdateConfig } from "@/pages/chat/workflow/nodes/customer-update/panel";
import { customerUpdateNodeUi } from "@/pages/chat/workflow/nodes/customer-update/ui";
import type {
  WorkflowNode,
  WorkflowNodeConfigPatch,
  WorkflowOutputValueType,
  WorkflowVariableDefinition,
} from "@/pages/chat/workflow/types";

const customFields: CustomFieldItem[] = [
  { id: 1, key: "remark", options: [], sort: 1, title: "客户备注", type: 1 },
  { id: 4, key: "gender", options: [], sort: 4, title: "性别", type: 2 },
  { id: 2, key: "birthday", options: [], sort: 2, title: "生日", type: 12 },
  { id: 3, key: "score", options: [], sort: 3, title: "客户评分", type: 11 },
];

describe("workflow Customer Update node", () => {
  it("uses shared active fields, disables unsupported types, and prevents duplicate selection", async () => {
    const user = userEvent.setup();
    const onNodeChange = vi.fn();
    render(<StatefulCustomerUpdateConfig onNodeChange={onNodeChange} />);

    const addButton = await screen.findByRole("button", { name: "添加客户属性" });
    await waitFor(() => expect(addButton).toBeEnabled());

    const firstFieldSelect = screen.getByRole("combobox", { name: "客户属性" });
    expect(screen.getByRole("button", { name: "删除客户属性" })).toBeDisabled();
    await user.click(firstFieldSelect);
    expect(screen.getAllByRole("option").map(option => option.textContent)).toEqual([
      "客户备注",
      "生日",
      "客户评分",
      "性别（暂不支持）",
    ]);
    expect(screen.getByRole("option", { name: "性别（暂不支持）" }))
      .toHaveAttribute("aria-disabled", "true");
    await user.click(screen.getByRole("option", { name: "客户备注" }));

    await user.click(addButton);
    screen.getAllByRole("button", { name: "删除客户属性" })
      .forEach(button => expect(button).toBeEnabled());
    const fieldSelects = screen.getAllByRole("combobox", { name: "客户属性" });
    await user.click(fieldSelects[1]!);
    expect(screen.getByRole("option", { name: "客户备注" }))
      .toHaveAttribute("aria-disabled", "true");
    await user.click(screen.getByRole("option", { name: "生日" }));
    expect(screen.getByRole("button", { name: "生日的值" })).toBeInTheDocument();

    expect(onNodeChange).toHaveBeenLastCalledWith(expect.objectContaining({
      fields: [
        expect.objectContaining({ field: expect.objectContaining({ id: 1, type: 1 }) }),
        expect.objectContaining({ field: expect.objectContaining({ id: 2, type: 12 }) }),
      ],
      status: "warning",
    }));
  });

  it("only offers variables compatible with each customer field type", () => {
    const variables = [
      variable("text", { kind: "string" }),
      variable("time", { kind: "datetime" }),
      variable("count", { kind: "number" }),
    ];

    expect(getCompatibleCustomerUpdateVariables(fieldSnapshot(1), variables).map(item => item.key))
      .toEqual(["text"]);
    expect(getCompatibleCustomerUpdateVariables(fieldSnapshot(4), variables).map(item => item.key))
      .toEqual(["text", "time"]);
    expect(getCompatibleCustomerUpdateVariables(fieldSnapshot(12), variables).map(item => item.key))
      .toEqual(["text", "time"]);
    expect(getCompatibleCustomerUpdateVariables(fieldSnapshot(11), variables).map(item => item.key))
      .toEqual(["count"]);
  });

  it("shows a referenced number variable label in the value input", async () => {
    const source = createNodeFromKind("message-query", "message-query", 0);
    const node = createCustomerUpdateNode([{
      field: fieldSnapshot(11),
      id: "row-score",
      value: {
        kind: "variable",
        selector: ["node", source.id, "messageCount"],
        valueType: { kind: "number" },
      },
    }]);

    render(
      <CustomerUpdateConfig
        edges={[createEdge(source.id, node.id)]}
        node={node}
        nodes={[source, node]}
        onNodeChange={vi.fn()}
        resources={{
          customFields: {
            fields: customFields,
            reload: () => undefined,
            status: "ready",
          },
        }}
      />,
    );

    await waitFor(() => expect(screen.getByRole("combobox", { name: "客户属性" })).toBeEnabled());
    expect(screen.getByRole("textbox", { name: "属性 11的值" }))
      .toHaveValue("消息查询.消息数量");
  });

  it("creates and restores one incomplete field row by default", () => {
    const definition = getNodeDefinition("customer-update");
    expect(definition.createDefaultData().fields).toEqual([
      expect.objectContaining({ value: { kind: "literal", value: "" } }),
    ]);
    const sanitized = definition.sanitizeData?.({
      ...definition.createDefaultData(),
      fields: [],
    });
    expect(sanitized?.fields).toHaveLength(1);
  });

  it("reports a variable that is no longer available or changed type", () => {
    const definition = getNodeDefinition("customer-update");
    const node = createCustomerUpdateNode([{
      field: fieldSnapshot(4),
      id: "row-1",
      value: {
        kind: "variable",
        selector: ["node", "source", "date"],
        valueType: { kind: "string" },
      },
    }]);

    expect(definition.validate?.(node, {
      availableVariables: [variable("date", { kind: "datetime" })],
      edges: [],
      nodes: [node],
    })).toContainEqual(expect.objectContaining({ code: "customer-update-variable-invalid" }));
  });

  it("limits one node to ten fields and summarizes complete configuration", async () => {
    const fields = Array.from({ length: 10 }, (_, index) => completeField(index + 1));

    render(<StatefulCustomerUpdateConfig initialFields={fields} onNodeChange={vi.fn()} />);
    const addButton = await screen.findByRole("button", { name: "添加客户属性" });
    await waitFor(() => expect(addButton).toBeDisabled());

    const definition = getNodeDefinition("customer-update");
    const data = {
      ...createDefaultNodeData("customer-update"),
      ...getCustomerUpdateNodePatch(fields),
    };
    const node = dataToNode(data);
    expect(definition.validate?.(node, {
      availableVariables: [],
      edges: [],
      nodes: [node],
    })).toEqual([]);
    if (customerUpdateNodeUi.body.kind !== "fields") return;
    expect(customerUpdateNodeUi.body.getFields(data)).toEqual([
      expect.objectContaining({
        id: "fields",
        value: { kind: "text", text: "已设置 10 个" },
      }),
    ]);
  });
});

function StatefulCustomerUpdateConfig({
  initialFields = [],
  onNodeChange,
}: {
  initialFields?: WorkflowCustomerUpdateDraftField[];
  onNodeChange: (patch: WorkflowNodeConfigPatch<"customer-update">) => void;
}) {
  const [node, setNode] = useState(() => createCustomerUpdateNode(initialFields));
  return (
    <CustomerUpdateConfig
      edges={[]}
      node={node}
      nodes={[node]}
      onNodeChange={(patch) => {
        onNodeChange(patch);
        setNode(current => ({ ...current, data: { ...current.data, ...patch } }));
      }}
      resources={{
        customFields: {
          fields: customFields,
          reload: () => undefined,
          status: "ready",
        },
      }}
    />
  );
}

function createCustomerUpdateNode(fields: WorkflowCustomerUpdateDraftField[]): WorkflowNode<"customer-update"> {
  return dataToNode({
    ...createDefaultNodeData("customer-update"),
    ...getCustomerUpdateNodePatch(fields),
  });
}

function dataToNode(data: WorkflowNode<"customer-update">["data"]): WorkflowNode<"customer-update"> {
  return {
    data,
    id: "customer-update",
    position: { x: 0, y: 0 },
    type: WORKFLOW_NODE_TYPE,
  };
}

function completeField(id: number): WorkflowCustomerUpdateDraftField {
  return {
    field: {
      id,
      key: `field-${id}`,
      title: `属性 ${id}`,
      type: 1,
    },
    id: `row-${id}`,
    value: { kind: "literal", value: `值 ${id}` },
  };
}

function fieldSnapshot(type: 1 | 4 | 5 | 6 | 11 | 12) {
  return { id: type, key: `field-${type}`, title: `属性 ${type}`, type };
}

function variable(
  key: string,
  valueType: Extract<WorkflowOutputValueType, { kind: "datetime" | "number" | "string" }>,
): WorkflowVariableDefinition {
  return {
    key,
    label: key,
    scope: "node",
    selector: ["node", "source", key],
    sourceNodeId: "source",
    sourceNodeKind: "llm",
    sourceNodeTitle: "上游节点",
    type: valueType.kind === "datetime" ? "datetime" : valueType.kind,
    usages: ["variable"],
    valueType,
  };
}
