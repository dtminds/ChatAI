import { AlarmClockIcon } from "@hugeicons/core-free-icons";
import type { WorkflowNodeDefinition } from "../definition-types";
import {
  createDefaultSourceHandles,
  createDefaultTargetHandles,
  createNodeData,
  compactNodeLayout,
  pickDefinedWorkflowConfig,
  sourceNodeKinds,
  targetNodeKinds,
} from "../definition-shared";

const waitUnitLabels = {
  day: "天",
  hour: "小时",
  minute: "分钟",
} as const;

export const waitNodeDefinition: WorkflowNodeDefinition<"wait"> = {
  availableNextKinds: targetNodeKinds,
  availablePrevKinds: sourceNodeKinds,
  canDelete: true,
  canDuplicate: true,
  canInsertAfter: true,
  canRename: true,
  configSections: [
    {
      fields: [
        {
          getValue: (data) => data.duration,
          id: "workflow-wait-duration",
          integer: true,
          kind: "number",
          label: "时长",
          min: 1,
          toPatch: (value, data) => ({
            duration: value,
            metric: `${value} ${waitUnitLabels[data.unit]}后唤醒`,
          }),
          validation: {
            number: {
              code: "wait-delay-required",
              message: "等待节点需要配置正整数时长",
            },
          },
        },
        {
          columns: 3,
          getOptions: () => [
            { label: "分钟", value: "minute" },
            { label: "小时", value: "hour" },
            { label: "天", value: "day" },
          ],
          getValue: (data) => data.unit,
          id: "workflow-wait-unit",
          kind: "option-cards",
          label: "单位",
          toPatch: (value, data) => {
            const unit = value as keyof typeof waitUnitLabels;
            return {
              metric: `${data.duration} ${waitUnitLabels[unit]}后唤醒`,
              unit,
            };
          },
        },
      ],
      id: "wait",
      title: "等待时间",
    },
  ],
  createDefaultData: () =>
    createNodeData("wait", 1, {
      duration: 1,
      label: "等待",
      metric: "1 天后唤醒",
      title: "等待",
      unit: "day",
    }),
  createExecutionConfig: (data) => pickDefinedWorkflowConfig({
    duration: data.duration,
    unit: data.unit,
  }),
  description: "按天、小时或固定窗口延迟触达",
  insertable: true,
  kind: "wait",
  layout: compactNodeLayout,
  paletteGroup: "flow",
  paletteLabel: "等待",
  schemaVersion: 1,
  getSourceHandles: createDefaultSourceHandles,
  getTargetHandles: createDefaultTargetHandles,
  sort: 10,
  visual: {
    accentClassName: "bg-indigo-500 text-white ring-indigo-500/20",
    accentRgb: "99 102 241",
    icon: AlarmClockIcon,
    label: "等待",
  },
};
