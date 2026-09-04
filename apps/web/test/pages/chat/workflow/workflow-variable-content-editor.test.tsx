import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VariableContentEditor } from "@/pages/chat/workflow/nodes/variable-content/editor";
import { WorkflowCustomFieldResourceProvider } from "@/pages/chat/workflow/workflow-custom-field-resource";
import { workflowContextVariables } from "@/pages/chat/workflow/workflow-variables";

describe("VariableContentEditor unavailable tokens", () => {
  it("marks missing node variables as unavailable", async () => {
    render(
      <WorkflowCustomFieldResourceProvider resource={{
        fields: [],
        reload: vi.fn(),
        status: "ready",
      }}
      >
        <VariableContentEditor
          ariaLabel="给客服的转发提示"
          customFieldVisibility="all"
          onChange={() => undefined}
          placeholder="placeholder"
          segments={[
            { selector: ["subject", "id"], type: "variable" },
            { selector: ["node", "ai-collect-3", "field-132"], type: "variable" },
          ]}
          variables={workflowContextVariables}
        />
      </WorkflowCustomFieldResourceProvider>,
    );

    await waitFor(() => {
      expect(document.querySelectorAll("[data-workflow-variable=true]")).toHaveLength(2);
    });

    const chips = [...document.querySelectorAll("[data-workflow-variable=true]")];
    expect(chips[0]).not.toHaveAttribute("data-workflow-variable-unavailable");
    expect(chips[0]).toHaveTextContent("全局变量.客户 ID");
    expect(chips[1]).toHaveAttribute("data-workflow-variable-unavailable", "true");
    expect(chips[1]).toHaveTextContent("原变量不可用");
  });
});
