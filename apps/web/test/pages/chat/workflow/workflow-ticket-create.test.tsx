import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createNodeFromKind } from "@/pages/chat/workflow/graph";
import { ticketCreateNodeDefinition } from "@/pages/chat/workflow/nodes/ticket-create/definition";
import { TicketCreateConfig } from "@/pages/chat/workflow/nodes/ticket-create/panel";
import { ticketCreateNodeUi } from "@/pages/chat/workflow/nodes/ticket-create/ui";
import { WorkflowCustomFieldResourceProvider } from "@/pages/chat/workflow/workflow-custom-field-resource";

describe("workflow ticket create node", () => {
  it("warns for an empty title and updates content variables and priority", async () => {
    const user = userEvent.setup();
    const onNodeChange = vi.fn();
    const node = createNodeFromKind("ticket-create", "ticket-create", 0);

    expect(ticketCreateNodeDefinition.validate?.(node, {
      availableVariables: [],
      edges: [],
      nodes: [node],
    })).toEqual([expect.objectContaining({
      code: "ticket-create-title-required",
      severity: "warning",
    })]);

    render(
      <WorkflowCustomFieldResourceProvider resource={{ fields: [], reload: vi.fn(), status: "ready" }}>
        <TicketCreateConfig
          edges={[]}
          node={node}
          nodes={[node]}
          onNodeChange={onNodeChange}
        />
      </WorkflowCustomFieldResourceProvider>,
    );

    const titleSection = screen.getByRole("textbox", { name: "工单标题" }).closest("section");
    const descriptionSection = screen.getByRole("textbox", { name: "工单描述" }).closest("section");
    if (!titleSection || !descriptionSection) {
      throw new Error("ticket create content sections were not rendered");
    }

    await insertGlobalCustomerIdVariable(titleSection);
    expect(onNodeChange).toHaveBeenCalledWith(expect.objectContaining({
      status: "ready",
      ticketTitle: expect.arrayContaining([
        expect.objectContaining({ selector: ["subject", "id"], type: "variable" }),
      ]),
    }));

    await insertGlobalCustomerIdVariable(descriptionSection);
    expect(onNodeChange).toHaveBeenCalledWith(expect.objectContaining({
      description: expect.arrayContaining([
        expect.objectContaining({ selector: ["subject", "id"], type: "variable" }),
      ]),
    }));

    await user.click(screen.getByRole("radio", { name: "高" }));
    expect(onNodeChange).toHaveBeenCalledWith({ priority: "high" });
  });

  it("normalizes invalid priority data and renders the configured summary", () => {
    const node = createNodeFromKind("ticket-create", "ticket-create", 0);
    const sanitized = ticketCreateNodeDefinition.sanitizeData?.({
      ...node.data,
      priority: "urgent",
    } as never);

    expect(sanitized?.priority).toBe("medium");
    if (ticketCreateNodeUi.body.kind !== "fields") {
      throw new Error("ticket create node body is not field-based");
    }

    expect(ticketCreateNodeUi.body.getFields({
      ...node.data,
      priority: "medium",
      ticketTitle: [{ type: "text", value: "处理退款" }],
    }).map(field => ({ id: field.id, value: field.value }))).toEqual([
      {
        id: "title",
        value: expect.objectContaining({ kind: "segments" }),
      },
      {
        id: "priority",
        value: { kind: "text", text: "中" },
      },
    ]);
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
