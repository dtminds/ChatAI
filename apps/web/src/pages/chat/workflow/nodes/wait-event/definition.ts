import { BellDotIcon } from "@hugeicons/core-free-icons";
import type { WorkflowNodeDefinition } from "../definition-types";
import {
  createCatalogIssue,
  createDefaultTargetHandles,
  createNodeData,
  sourceNodeKinds,
  targetNodeKinds,
} from "../definition-shared";
import {
  DEFAULT_WAIT_EVENT_TYPE,
  getWaitEventMetric,
  getWaitEventUnitLabel,
  normalizeWaitEventTimeout,
  normalizeWaitEventType,
  WAIT_EVENT_TIMEOUT_MAX_BY_UNIT,
} from "./config";
import {
  getWorkflowWaitEventDefinition,
  WAIT_EVENT_COLLECT_WINDOW_SECONDS,
  WAIT_EVENT_TIMEOUT_HANDLE_ID,
  WAIT_EVENT_TRIGGERED_HANDLE_ID,
} from "./events";

export const waitEventNodeDefinition: WorkflowNodeDefinition<"wait-event"> = {
  availableNextKinds: targetNodeKinds,
  availablePrevKinds: sourceNodeKinds,
  canDelete: true,
  canDuplicate: true,
  canInsertAfter: true,
  canRename: true,
  configSections: [],
  createDefaultData: () => createNodeData("wait-event", 1, {
    event: { type: DEFAULT_WAIT_EVENT_TYPE },
    label: "等待事件",
    metric: "等待新消息 · 最长 24 小时",
    timeout: { duration: 24, unit: "hour" },
    title: "等待事件",
  }),
  createExecutionConfig: (data) => ({
    event: {
      collectWindowSeconds: WAIT_EVENT_COLLECT_WINDOW_SECONDS,
      type: normalizeWaitEventType(data.event?.type),
    },
    timeout: normalizeWaitEventTimeout(data.timeout),
  }),
  description: "等待客户事件发生或超时后继续流程",
  getOutputVariables: (node) =>
    getWorkflowWaitEventDefinition(normalizeWaitEventType(node.data.event?.type))
      .outputDefinitions,
  getSourceHandles: (data) => {
    const event = getWorkflowWaitEventDefinition(normalizeWaitEventType(data.event?.type));
    return [
      {
        id: WAIT_EVENT_TRIGGERED_HANDLE_ID,
        label: `事件到达（${event.shortLabel}）`,
        outletKind: "outcome",
        top: 122,
      },
      {
        id: WAIT_EVENT_TIMEOUT_HANDLE_ID,
        label: "等待超时",
        outletKind: "outcome",
        top: 164,
      },
    ];
  },
  getTargetHandles: createDefaultTargetHandles,
  insertable: true,
  kind: "wait-event",
  layout: {
    estimatedHeight: 220,
    width: 320,
  },
  paletteGroup: "flow",
  paletteLabel: "等待事件",
  sanitizeData: (data) => {
    const event = { type: normalizeWaitEventType(data.event?.type) };
    const timeout = normalizeWaitEventTimeout(data.timeout);
    return {
      ...data,
      event,
      metric: getWaitEventMetric({ event, timeout }),
      timeout,
    };
  },
  schemaVersion: 1,
  sort: 15,
  validate: (node) => {
    const unit = node.data.timeout?.unit;
    const duration = node.data.timeout?.duration;
    if (unit !== "minute" && unit !== "hour" && unit !== "day") {
      return [createCatalogIssue("wait-event-timeout-unit-invalid", "等待事件需要选择最长等待时间单位")];
    }
    const maximum = WAIT_EVENT_TIMEOUT_MAX_BY_UNIT[unit];
    return Number.isInteger(duration) && duration >= 1 && duration <= maximum
      ? []
      : [createCatalogIssue(
          "wait-event-timeout-invalid",
          `最长等待时间需要为 1-${maximum} ${getWaitEventUnitLabel(unit)}`,
        )];
  },
  visual: {
    accentClassName: "bg-rose-500 text-white ring-rose-500/20",
    accentRgb: "244 63 94",
    icon: BellDotIcon,
    label: "等待事件",
  },
};
