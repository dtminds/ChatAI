import type { ComponentType } from "react";
import { nodeDefinitions } from "../node-definitions";
import type { WorkflowNodeKind } from "../types";
import type { NodeBodyProps } from "./types";

export const NodeComponentMap = Object.fromEntries(
  Object.values(nodeDefinitions).map((definition) => [definition.kind, definition.body]),
) as Record<WorkflowNodeKind, ComponentType<NodeBodyProps>>;
