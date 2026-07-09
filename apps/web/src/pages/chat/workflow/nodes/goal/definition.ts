import { Target01Icon } from "@hugeicons/core-free-icons";
import type { WorkflowNodeDefinition } from "../definition-types";
import {
  createDefaultOutputVariables,
  createDefaultTargetHandles,
  createNoSourceHandles,
  createNodeData,
  pickDefinedWorkflowConfig,
  sourceNodeKinds,
  standardNodeLayout,
} from "../definition-shared";

export const goalNodeDefinition: WorkflowNodeDefinition = {
  availableNextKinds: [],
  availablePrevKinds: sourceNodeKinds,
  canDelete: false,
  canDuplicate: false,
  canInsertAfter: false,
  configSections: [
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
          validation: {
            number: {
              code: "goal-conversion-required",
              message: "目标节点需要配置有效转化指标",
            },
          },
        },
      ],
      id: "goal",
      title: "目标设置",
    },
  ],
  createDefaultData: () =>
    createNodeData("goal", {
      conversion: 18.4,
      label: "目标",
      metric: "目标 18.4%",
      summary: "完成首单或领取新人券后退出",
      title: "首单转化",
    }),
  createExecutionConfig: (data) => pickDefinedWorkflowConfig({
    conversion: data.conversion,
  }),
  insertable: false,
  kind: "goal",
  layout: standardNodeLayout,
  role: "terminal",
  getOutputVariables: createDefaultOutputVariables,
  getSourceHandles: createNoSourceHandles,
  getTargetHandles: createDefaultTargetHandles,
  sort: 100,
  visual: {
    accentClassName: "bg-emerald-600 text-white ring-emerald-600/20",
    icon: Target01Icon,
    label: "目标",
  },
};
