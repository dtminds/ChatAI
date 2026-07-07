import type { WorkflowNodeData } from "./types";

type NodeConfigFieldBase = {
  id: string;
  label: string;
};

export type NodeConfigTextField = NodeConfigFieldBase & {
  kind: "text";
  getValue: (data: WorkflowNodeData) => string;
  toPatch: (value: string, data: WorkflowNodeData) => Partial<WorkflowNodeData>;
};

export type NodeConfigTextareaField = NodeConfigFieldBase & {
  kind: "textarea";
  getValue: (data: WorkflowNodeData) => string;
  minRows?: number;
  toPatch: (value: string, data: WorkflowNodeData) => Partial<WorkflowNodeData>;
};

export type NodeConfigNumberField = NodeConfigFieldBase & {
  kind: "number";
  getValue: (data: WorkflowNodeData) => number;
  min?: number;
  suffix?: string;
  toPatch: (value: number, data: WorkflowNodeData) => Partial<WorkflowNodeData>;
};

export type NodeConfigField =
  | NodeConfigNumberField
  | NodeConfigTextField
  | NodeConfigTextareaField;

export type NodeConfigSection = {
  fields: NodeConfigField[];
  id: string;
  title: string;
};
