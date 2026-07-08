import type { ComponentType } from "react";
import { createElement } from "react";
import { Progress } from "@/components/ui/progress";
import type { WorkflowNodeKind } from "./types";
import type { NodeBodyProps } from "./nodes/types";
import {
  BranchNodeBody,
  StandardNodeBody,
} from "./nodes/node-bodies";
import {
  BranchConfig,
  createSchemaNodeSettingsPanel,
} from "./panels/node-settings";
import type { NodeSettingsProps } from "./panels/types";

export type WorkflowNodeUiBinding = {
  body: ComponentType<NodeBodyProps>;
  settings: ComponentType<NodeSettingsProps>;
};

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

export const workflowNodeUiBindings = {
  action: {
    body: StandardNodeBody,
    settings: ActionConfig,
  },
  ai: {
    body: StandardNodeBody,
    settings: AiReceptionConfig,
  },
  branch: {
    body: BranchNodeBody,
    settings: BranchConfig,
  },
  goal: {
    body: StandardNodeBody,
    settings: GoalConfig,
  },
  trigger: {
    body: StandardNodeBody,
    settings: TriggerConfig,
  },
  wait: {
    body: StandardNodeBody,
    settings: WaitConfig,
  },
} satisfies Record<WorkflowNodeKind, WorkflowNodeUiBinding>;
