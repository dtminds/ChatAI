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
    createNodeData("wait", 1, {
      duration: 1,
      label: "等待",
      metric: "1 天后唤醒",
      mode: "duration",
      title: "等待",
      unit: "day",
    }),
  createExecutionConfig: (data) => data.mode === "fixed-time"
    ? { dayOffset: data.dayOffset, mode: data.mode, time: data.time }
    : { duration: data.duration, mode: data.mode, unit: data.unit },
  description: "按天、小时或固定窗口延迟触达",
  insertable: true,
  kind: "wait",
  layout: compactNodeLayout,
  paletteGroup: "flow",
  paletteLabel: "等待",
  schemaVersion: 1,
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
          `固定时间等待需要配置 1-${WORKFLOW_WAIT_DAY_OFFSET_MAX} 天`,
        ));
      }
      if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(node.data.time)) {
        issues.push(createCatalogIssue("wait-time-invalid", "固定时间等待需要选择执行时间"));
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
          `等待时长需要为 1-${maximum} ${getWaitUnitLabel(node.data.unit)}`,
        )];
  },
  visual: {
    accentClassName: "bg-indigo-500 text-white ring-indigo-500/20",
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
