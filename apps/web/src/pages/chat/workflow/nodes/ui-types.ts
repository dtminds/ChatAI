import type { ComponentType, ReactNode } from "react";
import type { WorkflowNodeKind } from "../types";
import type { NodeSettingsProps } from "../panels/types";
import type { NodeBodyProps } from "./types";
import type { WorkflowNodeField } from "./node-field-list";

export type WorkflowNodeBodyBinding<TKind extends WorkflowNodeKind = WorkflowNodeKind> =
  | {
      component: ComponentType<NodeBodyProps<TKind>>;
      kind: "custom";
    }
  | {
      getFields: (data: NodeBodyProps<TKind>["data"]) => WorkflowNodeField[];
      kind: "fields";
    }
  | {
      kind: "none";
    };

export type WorkflowNodeSettingsBinding<TKind extends WorkflowNodeKind = WorkflowNodeKind> =
  | {
      kind: "custom";
      component: ComponentType<NodeSettingsProps<TKind>>;
    }
  | {
      kind: "none";
    }
  | {
      after?: (props: NodeSettingsProps<TKind>) => ReactNode;
      kind: "schema";
      nodeKind: TKind;
    };

export type WorkflowNodeUiBinding<TKind extends WorkflowNodeKind = WorkflowNodeKind> = {
  body: WorkflowNodeBodyBinding<TKind>;
  settings: WorkflowNodeSettingsBinding<TKind>;
};
