import type { MarketingNodeData } from "./types";

type NodeConfigFieldBase = {
  id: string;
  label: string;
};

export type NodeConfigTextField = NodeConfigFieldBase & {
  kind: "text";
  getValue: (data: MarketingNodeData) => string;
  toPatch: (value: string, data: MarketingNodeData) => Partial<MarketingNodeData>;
};

export type NodeConfigTextareaField = NodeConfigFieldBase & {
  kind: "textarea";
  getValue: (data: MarketingNodeData) => string;
  minRows?: number;
  toPatch: (value: string, data: MarketingNodeData) => Partial<MarketingNodeData>;
};

export type NodeConfigNumberField = NodeConfigFieldBase & {
  kind: "number";
  getValue: (data: MarketingNodeData) => number;
  min?: number;
  suffix?: string;
  toPatch: (value: number, data: MarketingNodeData) => Partial<MarketingNodeData>;
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
