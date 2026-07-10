import { PlayIcon } from "@hugeicons/core-free-icons";
import type { WorkflowNodeDefinition } from "../definition-types";
import {
  createDefaultOutputVariables,
  createDefaultSourceHandles,
  createNoTargetHandles,
  createNodeData,
  pickDefinedWorkflowConfig,
  standardNodeLayout,
  targetNodeKinds,
} from "../definition-shared";

export const triggerNodeDefinition: WorkflowNodeDefinition<"trigger"> = {
  availableNextKinds: targetNodeKinds,
  availablePrevKinds: [],
  canDelete: false,
  canDuplicate: false,
  canInsertAfter: true,
  configSections: [
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
          validation: {
            required: {
              code: "trigger-audience-required",
              message: "触发节点需要选择进入人群",
            },
          },
        },
        {
          description: "同一客户 7 天内最多进入一次",
          getValue: (data) => data.repeatEntryEnabled ?? true,
          id: "workflow-repeat-entry",
          kind: "switch",
          label: "允许重复进入",
          toPatch: (value) => ({ repeatEntryEnabled: value }),
        },
      ],
      id: "trigger",
      title: "进入规则",
    },
  ],
  createDefaultData: () =>
    createNodeData("trigger", 1, {
      audience: "添加标签、添加好友事件、用户输入",
      entryLimitSummary: "同一客户进入此SOP最多2次",
      hostingAccountSummary: "已选 4 个托管账号",
      label: "开始",
      metric: "已选 4 个托管账号",
      repeatEntryEnabled: true,
      sendWindow: "09:00:00 - 18:00:00",
      status: "running",
      summary: "添加标签、添加好友事件、用户输入",
      title: "开始",
    }),
  createExecutionConfig: (data) => pickDefinedWorkflowConfig({
    audience: data.audience,
    repeatEntryEnabled: data.repeatEntryEnabled,
  }),
  insertable: false,
  kind: "trigger",
  layout: standardNodeLayout,
  role: "entry",
  schemaVersion: 1,
  getOutputVariables: createDefaultOutputVariables,
  getSourceHandles: createDefaultSourceHandles,
  getTargetHandles: createNoTargetHandles,
  sort: 0,
  visual: {
    accentClassName: "bg-blue-600 text-white ring-blue-600/20",
    accentRgb: "37 99 235",
    icon: PlayIcon,
    label: "开始",
  },
};
