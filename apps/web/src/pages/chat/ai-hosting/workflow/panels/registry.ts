import type { ComponentType } from "react";
import { nodeDefinitions } from "../node-definitions";
import type { MarketingNodeKind } from "../types";
import type { NodeSettingsProps } from "./types";

export const PanelComponentMap: Record<MarketingNodeKind, ComponentType<NodeSettingsProps>> = {
  action: nodeDefinitions.action.settings,
  ai: nodeDefinitions.ai.settings,
  branch: nodeDefinitions.branch.settings,
  goal: nodeDefinitions.goal.settings,
  trigger: nodeDefinitions.trigger.settings,
  wait: nodeDefinitions.wait.settings,
};
