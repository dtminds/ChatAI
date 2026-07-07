import type { ComponentType } from "react";
import type { MarketingNodeKind } from "../types";
import type { NodeBodyProps } from "./node-bodies";
import { nodeBodyComponentMap } from "./node-bodies";

export const NodeComponentMap: Record<MarketingNodeKind, ComponentType<NodeBodyProps>> = nodeBodyComponentMap;
