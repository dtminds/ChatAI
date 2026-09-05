import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createNewWorkflowDraft } from "@/pages/chat/workflow/graph";
import {
  WorkflowCustomFieldResourceProvider,
} from "@/pages/chat/workflow/workflow-custom-field-resource";
import { WorkflowVariablePicker } from "@/pages/chat/workflow/workflow-variable-picker";
import { WorkflowVariableSelect } from "@/pages/chat/workflow/workflow-variable-select";
import {
  getAvailableTimeReferenceVariablesForNode,
  getAvailableVariablesForNode,
} from "@/pages/chat/workflow/workflow-variables";

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
          customFieldVisibility="all"
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

  it("hides incompatible custom fields when the picker usage accepts none", async () => {
    const user = userEvent.setup();
    const draft = createNewWorkflowDraft("chatai_sop");
    const variables = getAvailableTimeReferenceVariablesForNode(
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
          customFieldVisibility="compatible"
          onOpenChange={() => undefined}
          onSelect={() => undefined}
          open
          variables={variables}
        >
          <button type="button">选择时间变量</button>
        </WorkflowVariablePicker>
      </WorkflowCustomFieldResourceProvider>,
    );

    await user.click(screen.getByRole("menuitem", { name: "全局变量" }));

    expect(screen.getByRole("menuitem", { name: "触发时间日期时间" })).toBeInTheDocument();
    expect(screen.queryByText("客户自定义属性")).not.toBeInTheDocument();
    expect(screen.queryByText("暂不支持")).not.toBeInTheDocument();
  });

  it("shows only compatible custom fields for a constrained picker", async () => {
    const user = userEvent.setup();
    const draft = createNewWorkflowDraft("chatai_sop");
    const variables = getAvailableVariablesForNode(
      "end",
      draft.nodes,
      draft.edges,
      customFields,
    ).filter(variable => variable.valueType.kind === "number");

    render(
      <WorkflowCustomFieldResourceProvider resource={{
        fields: customFields,
        reload: vi.fn(),
        status: "ready",
      }}>
        <WorkflowVariablePicker
          customFieldVisibility="compatible"
          onOpenChange={() => undefined}
          onSelect={() => undefined}
          open
          variables={variables}
        >
          <button type="button">选择数字变量</button>
        </WorkflowVariablePicker>
      </WorkflowCustomFieldResourceProvider>,
    );

    await user.click(screen.getByRole("menuitem", { name: "全局变量" }));

    expect(screen.getByRole("menuitem", { name: "累计消费数字" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "会员等级文本" })).not.toBeInTheDocument();
    expect(screen.queryByText("暂不支持")).not.toBeInTheDocument();
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
          customFieldVisibility="compatible"
          onSelect={() => undefined}
          value={["subject", "customFields", "7"]}
          variables={[]}
        />
      </WorkflowCustomFieldResourceProvider>,
    );

    expect(screen.getByRole("button", { name: "客户属性" }))
      .toHaveTextContent("原变量不可用");
  });

  it("clears a selected variable without opening the picker", async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
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
        <WorkflowVariableSelect
          ariaLabel="客户属性"
          customFieldVisibility="compatible"
          onClear={onClear}
          onSelect={() => undefined}
          value={["subject", "customFields", "7"]}
          variables={variables}
        />
      </WorkflowCustomFieldResourceProvider>,
    );

    await user.click(screen.getByRole("button", { name: "清除客户属性" }));

    expect(onClear).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
