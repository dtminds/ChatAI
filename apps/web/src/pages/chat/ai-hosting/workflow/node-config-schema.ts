import type {
  MarketingNodeData,
  MarketingNodeKind,
} from "./types";

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

export const baseNodeConfigSections = [
  {
    fields: [
      {
        getValue: (data) => data.title,
        id: "workflow-node-title",
        kind: "text",
        label: "节点名称",
        toPatch: (value) => ({ title: value }),
      },
      {
        getValue: (data) => data.summary,
        id: "workflow-node-summary",
        kind: "textarea",
        label: "节点说明",
        minRows: 4,
        toPatch: (value) => ({ summary: value }),
      },
    ],
    id: "base",
    title: "基础信息",
  },
] satisfies NodeConfigSection[];

export const nodeConfigSections = {
  action: [],
  ai: [],
  branch: [
    {
      fields: [
        {
          getValue: (data) => data.branchRule ?? "",
          id: "workflow-branch-rule",
          kind: "textarea",
          label: "条件表达式",
          minRows: 5,
          toPatch: (value) => ({
            branchRule: value,
            metric: value ? "2 条分支" : "未配置分支",
            status: value ? "ready" : "warning",
          }),
        },
      ],
      id: "branch-rule",
      title: "分支条件",
    },
  ],
  goal: [
    {
      fields: [
        {
          getValue: (data) => data.conversion ?? 18.4,
          id: "workflow-conversion",
          kind: "number",
          label: "目标转化率",
          min: 0,
          suffix: "%",
          toPatch: (value) => ({
            conversion: value,
            metric: `目标 ${value}%`,
          }),
        },
      ],
      id: "goal",
      title: "目标设置",
    },
  ],
  trigger: [
    {
      fields: [
        {
          getValue: (data) => data.audience ?? "",
          id: "workflow-audience",
          kind: "text",
          label: "触发人群",
          toPatch: (value) => ({
            audience: value,
            metric: value ? "预计进入 124.8万人" : "未配置人群",
            status: value ? "running" : "warning",
          }),
        },
      ],
      id: "trigger",
      title: "进入规则",
    },
  ],
  wait: [
    {
      fields: [
        {
          getValue: (data) => data.delayDays ?? 2,
          id: "workflow-delay-days",
          kind: "number",
          label: "等待天数",
          min: 0,
          suffix: "天",
          toPatch: (value) => ({
            delayDays: value,
            metric: `${value} 天后唤醒`,
            summary: `等待 ${value} 天后继续触达`,
          }),
        },
      ],
      id: "wait",
      title: "等待时间",
    },
  ],
} satisfies Record<MarketingNodeKind, NodeConfigSection[]>;

export function getNodeConfigSections(kind: MarketingNodeKind) {
  return nodeConfigSections[kind];
}
