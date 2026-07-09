import { Clock01Icon } from "@hugeicons/core-free-icons";
import type { WorkflowNodeDefinition } from "../definition-types";
import {
  createDefaultOutputVariables,
  createDefaultSourceHandles,
  createDefaultTargetHandles,
  createNodeData,
  pickDefinedWorkflowConfig,
  sourceNodeKinds,
  standardNodeLayout,
  targetNodeKinds,
} from "../definition-shared";

export const waitNodeDefinition: WorkflowNodeDefinition = {
  availableNextKinds: targetNodeKinds,
  availablePrevKinds: sourceNodeKinds,
  canDelete: true,
  canDuplicate: true,
  canInsertAfter: true,
  configSections: [
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
          validation: {
            number: {
              code: "wait-delay-required",
              message: "等待节点需要配置等待天数",
            },
          },
        },
      ],
      id: "wait",
      title: "等待时间",
    },
  ],
  createDefaultData: () =>
    createNodeData("wait", {
      delayDays: 1,
      label: "等待",
      metric: "1 天后唤醒",
      summary: "等待 1 天后继续触达",
      title: "等待",
    }),
  createExecutionConfig: (data) => pickDefinedWorkflowConfig({
    delayDays: data.delayDays,
  }),
  description: "按天、小时或固定窗口延迟触达",
  insertable: true,
  kind: "wait",
  layout: standardNodeLayout,
  paletteGroup: "flow",
  paletteLabel: "等待",
  getOutputVariables: createDefaultOutputVariables,
  getSourceHandles: createDefaultSourceHandles,
  getTargetHandles: createDefaultTargetHandles,
  sort: 10,
  visual: {
    accentClassName: "bg-indigo-600 text-white ring-indigo-600/20",
    icon: Clock01Icon,
    label: "等待",
  },
};
