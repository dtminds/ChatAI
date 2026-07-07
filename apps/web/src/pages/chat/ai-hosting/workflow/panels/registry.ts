import type { ComponentType } from "react";
import { nodeDefinitions } from "../node-definitions";
import type { MarketingNodeKind } from "../types";
import type { NodeSettingsProps } from "./types";

export const PanelComponentMap = Object.fromEntries(
  Object.values(nodeDefinitions).map((definition) => [definition.kind, definition.settings]),
) as Record<MarketingNodeKind, ComponentType<NodeSettingsProps>>;
