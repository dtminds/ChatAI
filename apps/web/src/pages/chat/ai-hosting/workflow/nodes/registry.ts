import type { ComponentType } from "react";
import { nodeDefinitions } from "../node-definitions";
import type { MarketingNodeKind } from "../types";
import type { NodeBodyProps } from "./node-bodies";

export const NodeComponentMap = Object.fromEntries(
  Object.values(nodeDefinitions).map((definition) => [definition.kind, definition.body]),
) as Record<MarketingNodeKind, ComponentType<NodeBodyProps>>;
