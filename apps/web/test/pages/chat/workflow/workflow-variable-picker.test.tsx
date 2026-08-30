import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createNewWorkflowDraft } from "@/pages/chat/workflow/graph";
import {
  WorkflowCustomFieldResourceProvider,
} from "@/pages/chat/workflow/workflow-custom-field-resource";
import { WorkflowVariablePicker } from "@/pages/chat/workflow/workflow-variable-picker";
import { WorkflowVariableSelect } from "@/pages/chat/workflow/workflow-variable-select";
import { getAvailableVariablesForNode } from "@/pages/chat/workflow/workflow-variables";

const customFields = [
  { id: 7, key: "level", options: [], sort: 1, title: "会员等级", type: 1 },
  { id: 8, key: "spend", options: [], sort: 2, title: "累计消费", type: 11 },
  { id: 9, key: "unknown", options: [], sort: 3, title: "多选偏好", type: 999 },
];

describe("Workflow variable picker custom fields", () => {
  it("shows custom fields as a flat section inside global variables", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const draft = createNewWorkflowDraft("chatai_sop");
    const variables = getAvailableVariablesForNode(
      "end",
      draft.nodes,
      draft.edges,
      customFields,
    );

    render(
      <WorkflowCustomFieldResourceProvider resource={{
        fields: customFields,
        reload: vi.fn(),
        status: "ready",
      }}>
        <WorkflowVariablePicker
          onOpenChange={() => undefined}
          onSelect={onSelect}
          open
          variables={variables}
        >
          <button type="button">选择变量</button>
        </WorkflowVariablePicker>
      </WorkflowCustomFieldResourceProvider>,
    );

    await user.click(screen.getByRole("menuitem", { name: "全局变量" }));

    expect(screen.getByText("客户自定义属性")).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "客户自定义属性" }))
      .not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "多选偏好暂不支持" }))
      .toHaveAttribute("aria-disabled", "true");

    fireEvent.pointerDown(screen.getByRole("menuitem", { name: "会员等级文本" }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({
      selector: ["subject", "customFields", "7"],
      valueType: { kind: "string" },
    }));
  });

  it("keeps a missing custom field selector visible as unavailable", () => {
    render(
      <WorkflowCustomFieldResourceProvider resource={{
        fields: [],
        reload: vi.fn(),
        status: "ready",
      }}>
        <WorkflowVariableSelect
          ariaLabel="客户属性"
          onSelect={() => undefined}
          value={["subject", "customFields", "7"]}
          variables={[]}
        />
      </WorkflowCustomFieldResourceProvider>,
    );

    expect(screen.getByRole("button", { name: "客户属性" }))
      .toHaveTextContent("原变量不可用");
  });
});
