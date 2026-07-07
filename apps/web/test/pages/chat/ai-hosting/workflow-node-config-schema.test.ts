import { describe, expect, it } from "vitest";
import type { NodeConfigNumberField, NodeConfigTextField, NodeConfigTextareaField } from "@/pages/chat/ai-hosting/workflow/node-config-schema";
import {
  baseNodeConfigSections,
  getNodeConfigSections,
} from "@/pages/chat/ai-hosting/workflow/node-config-schema";
import { createDefaultNodeData } from "@/pages/chat/ai-hosting/workflow/node-definitions";

describe("workflow node config schema", () => {
  it("defines reusable base node fields", () => {
    const [section] = baseNodeConfigSections;
    const titleField = section.fields[0] as NodeConfigTextField;
    const summaryField = section.fields[1] as NodeConfigTextareaField;
    const data = createDefaultNodeData("action");

    expect(section.title).toBe("基础信息");
    expect(titleField.toPatch("新标题", data)).toEqual({ title: "新标题" });
    expect(summaryField.toPatch("新说明", data)).toEqual({ summary: "新说明" });
  });

  it("maps simple node settings to node data patches", () => {
    const waitField = getNodeConfigSections("wait")[0].fields[0] as NodeConfigNumberField;
    const branchField = getNodeConfigSections("branch")[0].fields[0] as NodeConfigTextareaField;
    const goalField = getNodeConfigSections("goal")[0].fields[0] as NodeConfigNumberField;
    const triggerField = getNodeConfigSections("trigger")[0].fields[0] as NodeConfigTextField;

    expect(waitField.toPatch(3, createDefaultNodeData("wait"))).toEqual({
      delayDays: 3,
      metric: "3 天后唤醒",
      summary: "等待 3 天后继续触达",
    });
    expect(branchField.toPatch("", createDefaultNodeData("branch"))).toEqual({
      branchRule: "",
      metric: "未配置分支",
      status: "warning",
    });
    expect(goalField.toPatch(12, createDefaultNodeData("goal"))).toEqual({
      conversion: 12,
      metric: "目标 12%",
    });
    expect(triggerField.toPatch("会员", createDefaultNodeData("trigger"))).toEqual({
      audience: "会员",
      metric: "预计进入 124.8万人",
      status: "running",
    });
  });
});
