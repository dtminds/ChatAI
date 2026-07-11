import { describe, expect, it } from "vitest";
import type {
  NodeConfigNumberField,
  NodeConfigOptionCardsField,
  NodeConfigTextareaField,
} from "@/pages/chat/workflow/node-config-schema";
import {
  baseNodeConfigSections,
  getNodeConfigSections,
  getWorkflowNodeConfigSchema,
} from "@/pages/chat/workflow/node-config-schema";
import { validateNodeConfigSections } from "@/pages/chat/workflow/node-config-validation";
import { createDefaultNodeData } from "@/pages/chat/workflow/node-definitions";
import { WORKFLOW_NODE_TYPE } from "@/pages/chat/workflow/constants";

describe("workflow node config schema", () => {
  it("defines reusable base node fields", () => {
    const [section] = baseNodeConfigSections;
    const summaryField = section.fields[0] as NodeConfigTextareaField;
    const data = createDefaultNodeData("message");

    expect(section.title).toBe("基础信息");
    expect(summaryField.toPatch("新说明", data)).toEqual({ summary: "新说明" });
  });

  it("keeps undecided action fields behind base configuration only", () => {
    for (const kind of ["message", "tag", "coupon", "handoff"] as const) {
      const schema = getWorkflowNodeConfigSchema(kind);

      expect(schema.nodeSections).toEqual([]);
      expect(schema.fields.map((field) => field.id)).toEqual(["workflow-node-summary"]);
    }

    expect(getWorkflowNodeConfigSchema("start").fields.map((field) => field.id))
      .not.toContain("workflow-node-title");
    expect(getWorkflowNodeConfigSchema("end").fields.map((field) => field.id)).toEqual([
      "workflow-node-summary",
    ]);
  });

  it("maps the confirmed start, wait, and branch settings", () => {
    const waitField = getNodeConfigSections("wait")[0]!.fields[0] as NodeConfigNumberField;
    const branchField = getNodeConfigSections("branch")[0]!.fields[0] as NodeConfigTextareaField;
    const waitUnitField = getNodeConfigSections("wait")[0]!.fields[1] as NodeConfigOptionCardsField;

    expect(waitField.toPatch(3, createDefaultNodeData("wait"))).toEqual({
      duration: 3,
      metric: "3 天后唤醒",
      summary: "等待 3 天后继续触达",
    });
    expect(waitUnitField.toPatch("hour", createDefaultNodeData("wait"), {
      label: "小时",
      value: "hour",
    })).toEqual({
      metric: "1 小时后唤醒",
      summary: "等待 1 小时后继续触达",
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
