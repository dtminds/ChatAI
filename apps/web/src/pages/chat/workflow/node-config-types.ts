import type { IconSvgElement } from "@hugeicons/react";
import type {
  WorkflowNodeConfigPatch,
  WorkflowNodeData,
  WorkflowNodeKind,
} from "./types";

type NodeConfigFieldBase<TKind extends WorkflowNodeKind> = {
  getValidationValue?: (data: WorkflowNodeData<TKind>) => unknown;
  id: string;
  label: string;
  validation?: {
    number?: NodeConfigValidationIssue;
    required?: NodeConfigValidationIssue;
  };
};

export type NodeConfigValidationIssue = {
  code: string;
  message: string;
};

export type NodeConfigTextField<TKind extends WorkflowNodeKind = WorkflowNodeKind> =
  NodeConfigFieldBase<TKind> & {
  kind: "text";
  getValue: (data: WorkflowNodeData<TKind>) => string;
  toPatch: (value: string, data: WorkflowNodeData<TKind>) => WorkflowNodeConfigPatch<TKind>;
};

export type NodeConfigTextareaField<TKind extends WorkflowNodeKind = WorkflowNodeKind> =
  NodeConfigFieldBase<TKind> & {
  kind: "textarea";
  getValue: (data: WorkflowNodeData<TKind>) => string;
  minRows?: number;
  toPatch: (value: string, data: WorkflowNodeData<TKind>) => WorkflowNodeConfigPatch<TKind>;
};

export type NodeConfigNumberField<TKind extends WorkflowNodeKind = WorkflowNodeKind> =
  NodeConfigFieldBase<TKind> & {
  kind: "number";
  getValue: (data: WorkflowNodeData<TKind>) => number;
  min?: number;
  suffix?: string;
  toPatch: (value: number, data: WorkflowNodeData<TKind>) => WorkflowNodeConfigPatch<TKind>;
};

export type NodeConfigSwitchField<TKind extends WorkflowNodeKind = WorkflowNodeKind> =
  NodeConfigFieldBase<TKind> & {
  description?: string;
  getValue: (data: WorkflowNodeData<TKind>) => boolean;
  kind: "switch";
  toPatch: (value: boolean, data: WorkflowNodeData<TKind>) => WorkflowNodeConfigPatch<TKind>;
};

export type NodeConfigOptionCard = {
  description?: string;
  icon?: IconSvgElement;
  label: string;
  value: string;
};

export type NodeConfigOptionCardsField<TKind extends WorkflowNodeKind = WorkflowNodeKind> =
  NodeConfigFieldBase<TKind> & {
  columns?: 1 | 2;
  getOptions: (data: WorkflowNodeData<TKind>) => NodeConfigOptionCard[];
  getValue: (data: WorkflowNodeData<TKind>) => string;
  kind: "option-cards";
  toPatch: (
    value: string,
    data: WorkflowNodeData<TKind>,
    option: NodeConfigOptionCard,
  ) => WorkflowNodeConfigPatch<TKind>;
};

export type NodeConfigField<TKind extends WorkflowNodeKind = WorkflowNodeKind> =
  | NodeConfigNumberField<TKind>
  | NodeConfigOptionCardsField<TKind>
  | NodeConfigSwitchField<TKind>
  | NodeConfigTextField<TKind>
  | NodeConfigTextareaField<TKind>;

export type NodeConfigSection<TKind extends WorkflowNodeKind = WorkflowNodeKind> = {
  fields: NodeConfigField<TKind>[];
  id: string;
  title: string;
};
