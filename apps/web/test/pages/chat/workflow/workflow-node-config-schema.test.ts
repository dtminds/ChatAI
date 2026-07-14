import { describe, expect, it } from "vitest";
import type { NodeConfigTextareaField } from "@/pages/chat/workflow/node-config-schema";
import {
  getNodeConfigSections,
  getWorkflowNodeConfigSchema,
} from "@/pages/chat/workflow/node-config-schema";
import { createDefaultNodeData } from "@/pages/chat/workflow/node-definitions";

describe("workflow node config schema", () => {
  it("keeps undecided action nodes free of placeholder configuration", () => {
    for (const kind of ["message", "tag", "coupon", "handoff"] as const) {
      const schema = getWorkflowNodeConfigSchema(kind);

      expect(schema.nodeSections).toEqual([]);
      expect(schema.fields).toEqual([]);
    }

    expect(getWorkflowNodeConfigSchema("start").fields.map((field) => field.id))
      .not.toContain("workflow-node-title");
    expect(getWorkflowNodeConfigSchema("end").fields).toEqual([]);
  });

  it("keeps custom settings out of the generic schema and maps branch settings", () => {
    const branchField = getNodeConfigSections("branch")[0]!.fields[0] as NodeConfigTextareaField;

    expect(getNodeConfigSections("wait")).toEqual([]);
    expect(branchField.toPatch("", createDefaultNodeData("branch"))).toEqual({
      branchRule: "",
      metric: "未配置分支",
      status: "warning",
    });
  });
});
