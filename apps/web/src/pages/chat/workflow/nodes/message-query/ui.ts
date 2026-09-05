import type { WorkflowNodeUiBinding } from "../ui-types";
import {
  getMessageQueryMetric,
  normalizeMessageQueryTimeRange,
} from "./config";
import { MessageQueryConfig } from "./panel";
import {
  createWorkflowVariableReferenceSummarySegments,
  type WorkflowNodeSummarySegment,
} from "../../workflow-node-summary";
import type {
  WorkflowVariableDefinition,
  WorkflowVariableSelector,
} from "../../types";

export const messageQueryNodeUi: WorkflowNodeUiBinding<"message-query"> = {
  body: {
    getFields: (data) => {
      const timeRange = normalizeMessageQueryTimeRange(data.timeRange);
      const variableBySelector = new Map((data.availableTimeReferences ?? []).map((variable) => [
        variable.selector.join("."),
        variable,
      ]));
      const rangeSegments = timeRange.mode === "fixed"
        ? [
            createFixedTimeSegment(timeRange.startAt),
            { kind: "operator" as const, text: " 至 " },
            createFixedTimeSegment(timeRange.endAt),
          ]
        : timeRange.mode === "relative"
          ? [
              { kind: "value" as const, text: formatRelativePoint(timeRange.start) },
              { kind: "operator" as const, text: " 至 " },
              { kind: "value" as const, text: formatRelativePoint(timeRange.end) },
            ]
        : [
            ...createDynamicTimeReferenceSegments(
              timeRange.start,
              (selector) => variableBySelector.get(selector.join(".")),
            ),
            { kind: "operator" as const, text: " 至 " },
            ...createDynamicTimeReferenceSegments(
              timeRange.end,
              (selector) => variableBySelector.get(selector.join(".")),
            ),
          ];

      return [
        {
          id: "time-range",
          label: "时间范围",
          value: { items: rangeSegments, kind: "segments", maxLines: 2 },
        },
        {
          id: "take",
          label: "取数方式",
          value: {
            items: [{ kind: "value", text: getMessageQueryMetric(data) }],
            kind: "segments",
          },
        },
      ];
    },
    kind: "fields",
  },
  settings: { component: MessageQueryConfig, kind: "custom" },
};

function formatRelativePoint(point: { amount: number; unit: "day" | "hour" | "minute"; time: string }) {
  const unit = point.unit === "day" ? "天" : point.unit === "hour" ? "小时" : "分钟";
  return `过去 ${point.amount} ${unit} ${point.time}`;
}

function formatFixedDateTime(value: string) {
  return value ? value.replace("T", " ") : "未配置";
}

function createFixedTimeSegment(value: string): WorkflowNodeSummarySegment {
  return {
    kind: "value",
    text: formatFixedDateTime(value),
    ...(value ? {} : { tone: "warning" as const }),
  };
}

function createDynamicTimeReferenceSegments(
  selector: WorkflowVariableSelector,
  resolveVariable: (selector: WorkflowVariableSelector) => WorkflowVariableDefinition | undefined,
): WorkflowNodeSummarySegment[] {
  const variable = resolveVariable(selector);
  return variable
    ? createWorkflowVariableReferenceSummarySegments(variable)
    : [{ kind: "value", text: "时间变量不可用", tone: "warning" }];
}
