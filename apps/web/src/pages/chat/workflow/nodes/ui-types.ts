import type { ComponentType, ReactNode } from "react";
import type { WorkflowNodeKind } from "../types";
import type { NodeSettingsProps } from "../panels/types";
import type { NodeBodyProps } from "./types";

export type WorkflowNodeSettingsBinding<TKind extends WorkflowNodeKind = WorkflowNodeKind> =
  | {
      kind: "custom";
      component: ComponentType<NodeSettingsProps<TKind>>;
    }
  | {
      after?: (props: NodeSettingsProps<TKind>) => ReactNode;
      kind: "schema";
      nodeKind: TKind;
    };

export type WorkflowNodeUiBinding<TKind extends WorkflowNodeKind = WorkflowNodeKind> = {
  body: ComponentType<NodeBodyProps<TKind>>;
  settings: WorkflowNodeSettingsBinding<TKind>;
};
