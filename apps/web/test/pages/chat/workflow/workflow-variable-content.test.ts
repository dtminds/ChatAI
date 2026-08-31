import { describe, expect, it } from "vitest";
import {
  getVariableContentSummarySegments,
  getVariableContentText,
  truncateVariableContent,
} from "@/pages/chat/workflow/nodes/variable-content/content";
import { workflowContextVariables } from "@/pages/chat/workflow/workflow-variables";

describe("workflow variable content", () => {
  it("limits persisted content by the displayed token length", () => {
    const content = truncateVariableContent([
      { type: "text", value: "前置说明" },
      { selector: ["subject", "id"], type: "variable" },
      { type: "text", value: "后续".repeat(50) },
    ], workflowContextVariables, 100);

    expect(getVariableContentText(content, workflowContextVariables)).toHaveLength(100);
    expect(content).toContainEqual({ selector: ["subject", "id"], type: "variable" });
  });

  it("keeps a missing custom field selector while displaying it as unavailable", () => {
    const content = [
      { selector: ["subject", "customFields", "7"], type: "variable" as const },
    ];

    expect(getVariableContentText(content, [])).toBe("{原变量不可用}");
    expect(getVariableContentSummarySegments(content, [])).toEqual([
      { kind: "variable", text: "原变量不可用", tone: "warning" },
    ]);
    expect(content[0]?.selector).toEqual(["subject", "customFields", "7"]);
  });
});
