import { describe, expect, it } from "vitest";
import {
  getVariableContentText,
  truncateVariableContent,
} from "@/pages/chat/workflow/nodes/variable-content/content";
import { workflowContextVariables } from "@/pages/chat/workflow/workflow-variables";

describe("workflow variable content", () => {
  it("limits persisted content by the displayed token length", () => {
    const content = truncateVariableContent([
      { type: "text", value: "前置说明" },
      { selector: ["customer", "name"], type: "variable" },
      { type: "text", value: "后续".repeat(50) },
    ], workflowContextVariables, 100);

    expect(getVariableContentText(content, workflowContextVariables)).toHaveLength(100);
    expect(content).toContainEqual({ selector: ["customer", "name"], type: "variable" });
  });
});
