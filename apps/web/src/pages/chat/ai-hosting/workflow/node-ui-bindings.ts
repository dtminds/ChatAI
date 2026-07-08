import type { ComponentType } from "react";
import type { WorkflowNodeKind } from "./types";
import type { NodeBodyProps } from "./nodes/types";
import {
  BranchNodeBody,
  StandardNodeBody,
} from "./nodes/node-bodies";

export type WorkflowNodeUiBinding = {
  body: ComponentType<NodeBodyProps>;
};

export const workflowNodeUiBindings = {
  action: {
    body: StandardNodeBody,
  },
  ai: {
    body: StandardNodeBody,
  },
  branch: {
    body: BranchNodeBody,
  },
  goal: {
    body: StandardNodeBody,
  },
  trigger: {
    body: StandardNodeBody,
  },
  wait: {
    body: StandardNodeBody,
  },
} satisfies Record<WorkflowNodeKind, WorkflowNodeUiBinding>;
