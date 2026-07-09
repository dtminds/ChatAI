import type { ComponentType, ReactNode } from "react";
import type { WorkflowNodeKind } from "../types";
import type { NodeSettingsProps } from "../panels/types";
import type { NodeBodyProps } from "./types";

export type WorkflowNodeSettingsBinding =
  | {
      kind: "custom";
      component: ComponentType<NodeSettingsProps>;
    }
  | {
      after?: (props: NodeSettingsProps) => ReactNode;
      kind: "schema";
      nodeKind: WorkflowNodeKind;
    };

export type WorkflowNodeUiBinding = {
  body: ComponentType<NodeBodyProps>;
  settings: WorkflowNodeSettingsBinding;
};
