import type { IconSvgElement } from "@hugeicons/react";
import type {
  WorkflowNodeConfigPatch,
  WorkflowNodeData,
} from "./types";

type NodeConfigFieldBase = {
  id: string;
  label: string;
};

export type NodeConfigTextField = NodeConfigFieldBase & {
  kind: "text";
  getValue: (data: WorkflowNodeData) => string;
  toPatch: (value: string, data: WorkflowNodeData) => WorkflowNodeConfigPatch;
};

export type NodeConfigTextareaField = NodeConfigFieldBase & {
  kind: "textarea";
  getValue: (data: WorkflowNodeData) => string;
  minRows?: number;
  toPatch: (value: string, data: WorkflowNodeData) => WorkflowNodeConfigPatch;
};

export type NodeConfigNumberField = NodeConfigFieldBase & {
  kind: "number";
  getValue: (data: WorkflowNodeData) => number;
  min?: number;
  suffix?: string;
  toPatch: (value: number, data: WorkflowNodeData) => WorkflowNodeConfigPatch;
};

export type NodeConfigSwitchField = NodeConfigFieldBase & {
  description?: string;
  getValue: (data: WorkflowNodeData) => boolean;
  kind: "switch";
  toPatch: (value: boolean, data: WorkflowNodeData) => WorkflowNodeConfigPatch;
};

export type NodeConfigOptionCard = {
  description?: string;
  icon?: IconSvgElement;
  label: string;
  value: string;
};

export type NodeConfigOptionCardsField = NodeConfigFieldBase & {
  columns?: 1 | 2;
  getOptions: (data: WorkflowNodeData) => NodeConfigOptionCard[];
  getValue: (data: WorkflowNodeData) => string;
  kind: "option-cards";
  toPatch: (
    value: string,
    data: WorkflowNodeData,
    option: NodeConfigOptionCard,
  ) => WorkflowNodeConfigPatch;
};

export type NodeConfigField =
  | NodeConfigNumberField
  | NodeConfigOptionCardsField
  | NodeConfigSwitchField
  | NodeConfigTextField
  | NodeConfigTextareaField;

export type NodeConfigSection = {
  fields: NodeConfigField[];
  id: string;
  title: string;
};
