import { Rocket01Icon } from "@hugeicons/core-free-icons";
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

export const triggerNodeDefinition: WorkflowNodeDefinition = {
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
    createNodeData("trigger", {
      audience: "近 30 天新入会且未首购客户",
      label: "触发",
      metric: "预计进入 124.8万人",
      repeatEntryEnabled: true,
      status: "running",
      summary: "客户入会后立即进入新人转化旅程",
      title: "新人入会触发",
    }),
  createExecutionConfig: (data) => pickDefinedWorkflowConfig({
    audience: data.audience,
    repeatEntryEnabled: data.repeatEntryEnabled,
  }),
  insertable: false,
  kind: "trigger",
  layout: standardNodeLayout,
  role: "entry",
  getOutputVariables: createDefaultOutputVariables,
  getSourceHandles: createDefaultSourceHandles,
  getTargetHandles: createNoTargetHandles,
  sort: 0,
  visual: {
    accentClassName: "bg-rose-600 text-white ring-rose-600/20",
    icon: Rocket01Icon,
    label: "触发",
  },
};
