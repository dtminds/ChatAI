import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createNodeFromKind } from "@/pages/chat/workflow/graph";
import { HandoffConfig } from "@/pages/chat/workflow/nodes/handoff/panel";
import { handoffNodeUi } from "@/pages/chat/workflow/nodes/handoff/ui";
import type { HandoffNodeData } from "@/pages/chat/workflow/types";
import { WorkflowCustomFieldResourceProvider } from "@/pages/chat/workflow/workflow-custom-field-resource";

describe("workflow handoff node", () => {
  it("configures operator and customer handoff messages from nested variables", async () => {
    const onNodeChange = vi.fn();
    const node = createNodeFromKind("handoff", "handoff", 0);

    render(
      <WorkflowCustomFieldResourceProvider resource={{
        fields: [],
        reload: vi.fn(),
        status: "ready",
      }}
      >
        <HandoffConfig
          edges={[]}
          node={node}
          nodes={[node]}
          onNodeChange={onNodeChange}
        />
      </WorkflowCustomFieldResourceProvider>,
    );

    const operatorSection = screen.getByRole("textbox", { name: "给客服的转发提示" }).closest("section");
    const customerSection = screen.getByRole("textbox", { name: "对客话术" }).closest("section");
    if (!operatorSection || !customerSection) {
      throw new Error("handoff message sections were not rendered");
    }

    await insertGlobalCustomerIdVariable(operatorSection);
    expect(onNodeChange).toHaveBeenCalledWith(expect.objectContaining({
      operatorMessage: expect.arrayContaining([
        expect.objectContaining({
          selector: ["subject", "id"],
          type: "variable",
        }),
      ]),
      status: "ready",
    }));

    await insertGlobalCustomerIdVariable(customerSection);
    expect(onNodeChange).toHaveBeenCalledWith(expect.objectContaining({
      customerMessage: expect.arrayContaining([
        expect.objectContaining({
          selector: ["subject", "id"],
          type: "variable",
        }),
      ]),
    }));

    const variableMessage = [{ selector: ["subject", "id"], type: "variable" as const }];
    const labels = handoffBodyLabels({
      ...node.data,
      customerMessage: variableMessage,
      operatorMessage: variableMessage,
    });
    expect(labels.operator).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "source", text: "全局变量" }),
      expect.objectContaining({ kind: "variable", text: "客户 ID" }),
    ]));
    expect(labels.customer).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "source", text: "全局变量" }),
      expect.objectContaining({ kind: "variable", text: "客户 ID" }),
    ]));
  });
});

async function insertGlobalCustomerIdVariable(section: HTMLElement) {
  const insertButton = within(section).getByRole("button", { name: "插入变量" });
  fireEvent.pointerDown(insertButton);
  fireEvent.click(insertButton);
  fireEvent.click(await screen.findByRole("menuitem", { name: "全局变量" }));
  fireEvent.pointerDown(await screen.findByRole("menuitem", { name: /^客户 ID文本$/ }));
  await waitFor(() => {
    expect(within(section).getByText("全局变量.客户 ID")).toBeInTheDocument();
  });
}

function handoffBodyLabels(data: HandoffNodeData) {
  if (handoffNodeUi.body.kind !== "fields") {
    throw new Error("handoff node body is not field-based");
  }

  const fields = handoffNodeUi.body.getFields(data);
  const operator = fields.find((field) => field.id === "operator-message")?.value;
  const customer = fields.find((field) => field.id === "customer-message")?.value;

  return {
    customer: customer?.kind === "segments" ? customer.items : [],
    operator: operator?.kind === "segments" ? operator.items : [],
  };
}
