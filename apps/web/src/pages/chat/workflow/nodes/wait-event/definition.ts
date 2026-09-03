import { HourglassIcon } from "@hugeicons/core-free-icons";
import {
  DEFAULT_WORKFLOW_WAIT_EVENT_DELAY,
  WORKFLOW_WAIT_EVENT_DELAY_MAX_BY_UNIT,
} from "@chatai/contracts";
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
  normalizeWaitEventDelay,
  normalizeWaitEventTimeout,
  normalizeWaitEventType,
  WAIT_EVENT_TIMEOUT_MAX_BY_UNIT,
} from "./config";
import {
  getWorkflowWaitEventDefinition,
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
  createDefaultData: () => createNodeData("wait-event", {
    delay: DEFAULT_WORKFLOW_WAIT_EVENT_DELAY,
    event: { type: DEFAULT_WAIT_EVENT_TYPE },
    label: "等待事件",
    metric: "等待新消息 · 达到后等待 30 秒 · 最长 24 小时",
    timeout: { duration: 24, unit: "hour" },
    title: "等待事件",
  }),
  description: "流经该节点时，系统会根据设定的客户事件持续等待，直到该事件发生或超时，再自动推进至后续节点",
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
        top: 164,
      },
      {
        id: WAIT_EVENT_TIMEOUT_HANDLE_ID,
        label: "等待超时",
        outletKind: "outcome",
        top: 206,
      },
    ];
  },
  getTargetHandles: createDefaultTargetHandles,
  insertable: true,
  kind: "wait-event",
  layout: {
    estimatedHeight: 262,
    width: 320,
  },
  paletteGroup: "flow",
  paletteLabel: "等待事件",
  sanitizeData: (data) => {
    const delay = normalizeWaitEventDelay(data.delay);
    const event = { type: normalizeWaitEventType(data.event?.type) };
    const timeout = normalizeWaitEventTimeout(data.timeout);
    return {
      ...data,
      delay,
      event,
      metric: getWaitEventMetric({ delay, event, timeout }),
      timeout,
    };
  },
  sort: 15,
  validate: (node) => {
    const delayUnit = node.data.delay?.unit;
    const delayDuration = node.data.delay?.duration;
    if (delayUnit !== "second" && delayUnit !== "minute" && delayUnit !== "hour" && delayUnit !== "day") {
      return [createCatalogIssue("wait-event-delay-unit-invalid", "未选择事件到达后等待时间单位")];
    }
    const delayMinimum = delayUnit === "second" ? 0 : 1;
    const delayMaximum = WORKFLOW_WAIT_EVENT_DELAY_MAX_BY_UNIT[delayUnit];
    if (!Number.isInteger(delayDuration)
      || delayDuration < delayMinimum
      || delayDuration > delayMaximum) {
      return [createCatalogIssue(
        "wait-event-delay-invalid",
        `事件到达后等待时间需为 ${delayMinimum}-${delayMaximum} ${getWaitEventUnitLabel(delayUnit)}`,
      )];
    }
    const unit = node.data.timeout?.unit;
    const duration = node.data.timeout?.duration;
    if (unit !== "minute" && unit !== "hour" && unit !== "day") {
      return [createCatalogIssue("wait-event-timeout-unit-invalid", "未选择最长等待时间单位")];
    }
    const maximum = WAIT_EVENT_TIMEOUT_MAX_BY_UNIT[unit];
    return Number.isInteger(duration) && duration >= 1 && duration <= maximum
      ? []
      : [createCatalogIssue(
          "wait-event-timeout-invalid",
          `最长等待时间需为 1-${maximum} ${getWaitEventUnitLabel(unit)}`,
        )];
  },
  visual: {
    accentClassName: "bg-rose-400 text-white",
    accentRgb: "244 63 94",
    icon: HourglassIcon,
    label: "等待事件",
  },
};
