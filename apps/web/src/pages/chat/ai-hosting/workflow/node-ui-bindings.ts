import type { ComponentType } from "react";
import type { WorkflowNodeKind } from "./types";
import type { NodeBodyProps } from "./nodes/node-bodies";
import {
  BranchNodeBody,
  StandardNodeBody,
} from "./nodes/node-bodies";
import {
  ActionConfig,
  AiReceptionConfig,
  BranchConfig,
  GoalConfig,
  TriggerConfig,
  WaitConfig,
} from "./panels/node-settings";
import type { NodeSettingsProps } from "./panels/types";

export type WorkflowNodeUiBinding = {
  body: ComponentType<NodeBodyProps>;
  settings: ComponentType<NodeSettingsProps>;
};

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
