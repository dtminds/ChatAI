import { AlarmClockIcon } from "@hugeicons/core-free-icons";
import {
  WORKFLOW_WAIT_DAY_OFFSET_MAX,
  WORKFLOW_WAIT_DURATION_MAX_BY_UNIT,
} from "@chatai/contracts";
import type { WorkflowNodeDefinition } from "../definition-types";
import {
  createCatalogIssue,
  createDefaultSourceHandles,
  createDefaultTargetHandles,
  createNodeData,
  compactNodeLayout,
  sourceNodeKinds,
  targetNodeKinds,
} from "../definition-shared";

export const waitNodeDefinition: WorkflowNodeDefinition<"wait"> = {
  availableNextKinds: targetNodeKinds,
  availablePrevKinds: sourceNodeKinds,
  canDelete: true,
  canDuplicate: true,
  canInsertAfter: true,
  canRename: true,
  configSections: [],
  createDefaultData: () =>
    createNodeData("wait", {
      duration: 1,
      label: "等待",
      metric: "1 天后唤醒",
      mode: "duration",
      title: "等待",
      unit: "day",
    }),
  description: "流经该节点时，系统会根据设定的规则暂停执行，待等待时间到达后，再自动推进至后续节点",
  insertable: true,
  kind: "wait",
  layout: compactNodeLayout,
  paletteGroup: "flow",
  paletteLabel: "等待",
  sanitizeData: (data) => {
    const commonData = Object.fromEntries(
      Object.entries(data).filter(([key]) =>
        !["dayOffset", "duration", "mode", "time", "unit"].includes(key),
      ),
    );
    return data.mode === "fixed-time"
      ? {
          ...commonData,
          dayOffset: data.dayOffset,
          mode: data.mode,
          time: data.time,
        } as typeof data
      : {
          ...commonData,
          duration: data.duration,
          mode: "duration",
          unit: data.unit,
        } as typeof data;
  },
  getSourceHandles: createDefaultSourceHandles,
  getTargetHandles: createDefaultTargetHandles,
  sort: 10,
  validate: (node) => {
    if (node.data.mode === "fixed-time") {
      const issues = [];
      if (!Number.isInteger(node.data.dayOffset)
        || node.data.dayOffset < 1
        || node.data.dayOffset > WORKFLOW_WAIT_DAY_OFFSET_MAX) {
        issues.push(createCatalogIssue(
          "wait-day-offset-invalid",
          `等待天数需为 1-${WORKFLOW_WAIT_DAY_OFFSET_MAX} 天`,
        ));
      }
      if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(node.data.time)) {
        issues.push(createCatalogIssue("wait-time-invalid", "未选择执行时间"));
      }
      return issues;
    }
    const maximum = WORKFLOW_WAIT_DURATION_MAX_BY_UNIT[node.data.unit];
    return Number.isInteger(node.data.duration)
      && node.data.duration >= 1
      && node.data.duration <= maximum
      ? []
      : [createCatalogIssue(
          "wait-delay-required",
          `等待时长需为 1-${maximum} ${getWaitUnitLabel(node.data.unit)}`,
        )];
  },
  visual: {
    accentClassName: "bg-indigo-500 text-white",
    accentRgb: "99 102 241",
    icon: AlarmClockIcon,
    label: "等待",
  },
};

function getWaitUnitLabel(unit: "day" | "hour" | "minute") {
  if (unit === "minute") return "分钟";
  if (unit === "hour") return "小时";
  return "天";
}
