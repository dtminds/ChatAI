import { describe, expect, it } from "vitest";
import type {
  NodeConfigNumberField,
  NodeConfigOptionCardsField,
  NodeConfigTextareaField,
} from "@/pages/chat/workflow/node-config-schema";
import {
  getNodeConfigSections,
  getWorkflowNodeConfigSchema,
} from "@/pages/chat/workflow/node-config-schema";
import { validateNodeConfigSections } from "@/pages/chat/workflow/node-config-validation";
import { createDefaultNodeData } from "@/pages/chat/workflow/node-definitions";
import { WORKFLOW_NODE_TYPE } from "@/pages/chat/workflow/constants";

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

  it("maps the confirmed start, wait, and branch settings", () => {
    const waitField = getNodeConfigSections("wait")[0]!.fields[0] as NodeConfigNumberField;
    const branchField = getNodeConfigSections("branch")[0]!.fields[0] as NodeConfigTextareaField;
    const waitUnitField = getNodeConfigSections("wait")[0]!.fields[1] as NodeConfigOptionCardsField;

    expect(waitField.toPatch(3, createDefaultNodeData("wait"))).toEqual({
      duration: 3,
      metric: "3 天后唤醒",
    });
    expect(waitUnitField.toPatch("hour", createDefaultNodeData("wait"), {
      label: "小时",
      value: "hour",
    })).toEqual({
      metric: "1 小时后唤醒",
      unit: "hour",
    });
    expect(branchField.toPatch("", createDefaultNodeData("branch"))).toEqual({
      branchRule: "",
      metric: "未配置分支",
      status: "warning",
    });
  });

  it("validates numeric config through schema metadata", () => {
    const waitData = createDefaultNodeData("wait");

    expect(validateNodeConfigSections({
      data: {
        ...waitData,
        duration: -1,
      },
      id: "wait",
      position: { x: 0, y: 0 },
      type: WORKFLOW_NODE_TYPE,
    }, getNodeConfigSections("wait"))).toEqual([
      {
        code: "wait-delay-required",
        message: "等待节点需要配置正整数时长",
        severity: "warning",
        source: "config",
      },
    ]);
  });
});
