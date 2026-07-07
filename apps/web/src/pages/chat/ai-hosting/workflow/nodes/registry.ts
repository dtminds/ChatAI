import type { ComponentType } from "react";
import { nodeDefinitions } from "../node-definitions";
import type { MarketingNodeKind } from "../types";
import type { NodeBodyProps } from "./node-bodies";

export const NodeComponentMap: Record<MarketingNodeKind, ComponentType<NodeBodyProps>> = {
  action: nodeDefinitions.action.body,
  ai: nodeDefinitions.ai.body,
  branch: nodeDefinitions.branch.body,
  goal: nodeDefinitions.goal.body,
  trigger: nodeDefinitions.trigger.body,
  wait: nodeDefinitions.wait.body,
};
