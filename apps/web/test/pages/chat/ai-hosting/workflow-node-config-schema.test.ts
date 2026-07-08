import { describe, expect, it } from "vitest";
import type {
  NodeConfigNumberField,
  NodeConfigOptionCardsField,
  NodeConfigSwitchField,
  NodeConfigTextField,
  NodeConfigTextareaField,
} from "@/pages/chat/ai-hosting/workflow/node-config-schema";
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

  it("keeps panel-only controls backed by persisted node data defaults", () => {
    expect(createDefaultNodeData("trigger").repeatEntryEnabled).toBe(true);
    expect(createDefaultNodeData("ai").handoffRule).toBe("客户要求人工、投诉升级、识别到价格异议");
  });

  it("maps simple node settings to node data patches", () => {
    const waitField = getNodeConfigSections("wait")[0]!.fields[0] as NodeConfigNumberField;
    const branchField = getNodeConfigSections("branch")[0]!.fields[0] as NodeConfigTextareaField;
    const goalField = getNodeConfigSections("goal")[0]!.fields[0] as NodeConfigNumberField;
    const triggerField = getNodeConfigSections("trigger")[0]!.fields[0] as NodeConfigTextField;

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

  it("maps option and switch node settings through reusable schema fields", () => {
    const actionField = getNodeConfigSections("action")[0]!.fields[0] as NodeConfigOptionCardsField;
    const aiAgentField = getNodeConfigSections("ai")[0]!.fields[0] as NodeConfigOptionCardsField;
    const aiHandoffField = getNodeConfigSections("ai")[0]!.fields[1] as NodeConfigTextareaField;
    const triggerRepeatField = getNodeConfigSections("trigger")[0]!.fields[1] as NodeConfigSwitchField;
    const couponOption = actionField.getOptions(createDefaultNodeData("action"))
      .find((option) => option.value === "coupon")!;
    const agentOption = aiAgentField.getOptions(createDefaultNodeData("ai"))
      .find((option) => option.value === "转化小助理")!;

    expect(actionField.kind).toBe("option-cards");
    expect(actionField.toPatch("coupon", createDefaultNodeData("action"), couponOption)).toEqual({
      actionType: "coupon",
      label: "发优惠券",
      metric: "新人券 · 满 199 减 30",
      status: "ready",
      summary: "新人券 · 满 199 减 30",
      title: "发优惠券",
    });
    expect(aiAgentField.toPatch("转化小助理", createDefaultNodeData("ai"), agentOption)).toEqual({
      actionType: "ai",
      agentName: "转化小助理",
      label: "AI 接待",
      metric: "直播活动、会员权益",
      status: "ready",
      summary: "转化小助理",
    });
    expect(aiHandoffField.toPatch("投诉升级", createDefaultNodeData("ai"))).toEqual({
      handoffRule: "投诉升级",
    });
    expect(triggerRepeatField.toPatch(false, createDefaultNodeData("trigger"))).toEqual({
      repeatEntryEnabled: false,
    });
  });
});
