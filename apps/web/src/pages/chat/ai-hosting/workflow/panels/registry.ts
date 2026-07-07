import type { ComponentType } from "react";
import { nodeDefinitions } from "../node-definitions";
import type { WorkflowNodeKind } from "../types";
import type { NodeSettingsProps } from "./types";

export const PanelComponentMap = Object.fromEntries(
  Object.values(nodeDefinitions).map((definition) => [definition.kind, definition.settings]),
) as Record<WorkflowNodeKind, ComponentType<NodeSettingsProps>>;
