import type { ComponentType } from "react";
import type { MarketingNodeKind } from "../types";
import {
  ActionConfig,
  AiReceptionConfig,
  BranchConfig,
  GoalConfig,
  TriggerConfig,
  WaitConfig,
} from "./node-settings";
import type { NodeSettingsProps } from "./types";

export const PanelComponentMap: Record<MarketingNodeKind, ComponentType<NodeSettingsProps>> = {
  action: ActionConfig,
  ai: AiReceptionConfig,
  branch: BranchConfig,
  goal: GoalConfig,
  trigger: TriggerConfig,
  wait: WaitConfig,
};
