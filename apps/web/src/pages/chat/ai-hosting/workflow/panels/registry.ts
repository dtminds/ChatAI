import { Progress } from "@/components/ui/progress";
import {
  createElement,
  type ComponentType,
} from "react";
import type { WorkflowNodeKind } from "../types";
import {
  BranchConfig,
  createSchemaNodeSettingsPanel,
} from "./node-settings";
import type { NodeSettingsProps } from "./types";

const ActionConfig = createSchemaNodeSettingsPanel("action");
const AiReceptionConfig = createSchemaNodeSettingsPanel("ai");
const GoalConfig = createSchemaNodeSettingsPanel("goal", ({ node }) => {
  const conversion = node.data.conversion ?? 18.4;

  return createElement(Progress, {
    "aria-label": "目标达成进度",
    className: "h-2",
    value: conversion * 4,
  });
});
const TriggerConfig = createSchemaNodeSettingsPanel("trigger");
const WaitConfig = createSchemaNodeSettingsPanel("wait", () =>
  createElement(
    "div",
    { className: "rounded-[10px] border bg-card p-3 text-xs leading-5 text-muted-foreground" },
    "客户进入等待后，将在设定时间结束时继续执行下一步",
  ));

export const NodeSettingsPanelMap = {
  action: ActionConfig,
  ai: AiReceptionConfig,
  branch: BranchConfig,
  goal: GoalConfig,
  trigger: TriggerConfig,
  wait: WaitConfig,
} satisfies Record<WorkflowNodeKind, ComponentType<NodeSettingsProps>>;
