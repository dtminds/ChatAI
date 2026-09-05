import type { WorkflowOrderQueryDraftCondition } from "@chatai/contracts";
import type { WorkflowNodeUiBinding } from "../ui-types";
import type { WorkflowNodeFieldValue } from "../node-field-list";
import { createWorkflowVariableReferenceSummarySegments } from "../../workflow-node-summary";
import { resolveWorkflowVariable } from "../../workflow-variables";
import type { WorkflowVariableDefinition } from "../../types";
import { normalizeOrderQuerySelector } from "./config";
import { OrderQueryConfig } from "./panel";

export const orderQueryNodeUi: WorkflowNodeUiBinding<"order-query"> = {
  body: {
    getFields: (data) => {
      if (data.mode === "conditions") {
        const conditions = data.conditions;
        return [
          {
            id: "query-mode",
            label: "查询方式",
            value: { kind: "text", text: "条件查询" },
          },
          {
            id: "platform",
            label: "下单平台",
            value: conditions
              ? { kind: "text", text: conditions.platformId === undefined ? "全部" : "指定平台" }
              : { kind: "empty" },
          },
          {
            id: "order-time",
            label: "下单时间",
            value: conditions
              ? getOrderQueryTimeRangeValue(conditions, data.availableVariables ?? [])
              : { kind: "empty" },
          },
        ];
      }
      const selector = normalizeOrderQuerySelector(data.orderNumberSelector);
      const variable = selector ? resolveWorkflowVariable(data.availableVariables ?? [], selector) : undefined;
      return [
        {
          id: "query-mode",
          label: "查询方式",
          value: { kind: "text", text: "订单号" },
        },
        {
          id: "order-number",
          label: "订单号",
          value: variable
            ? { items: createWorkflowVariableReferenceSummarySegments(variable), kind: "segments" }
            : { kind: "empty", text: selector ? "原节点输出不可用" : undefined },
        },
      ];
    },
    kind: "fields",
  },
  settings: { component: OrderQueryConfig, kind: "custom" },
};

function getOrderQueryTimeRangeValue(
  conditions: WorkflowOrderQueryDraftCondition,
  variables: WorkflowVariableDefinition[],
): WorkflowNodeFieldValue {
  const timeRange = conditions.timeRange;
  if (timeRange.mode === "absolute") {
    return timeRange.startAt && timeRange.endAt
      ? {
          kind: "text",
          text: `${formatDateTime(timeRange.startAt)} 至 ${formatDateTime(timeRange.endAt)}`,
        }
      : { kind: "empty" };
  }
  if (timeRange.mode === "relative") {
    return {
      kind: "text",
      text: `${formatRelativePoint(timeRange.start)} 至 ${formatRelativePoint(timeRange.end)}`,
    };
  }
  return {
    items: [
      ...createTimeReferenceSegments(timeRange.start, variables),
      { kind: "operator", text: " 至 " },
      ...createTimeReferenceSegments(timeRange.end, variables),
    ],
    kind: "segments",
    maxLines: 2,
  };
}

function createTimeReferenceSegments(
  selector: string[],
  variables: WorkflowVariableDefinition[],
) {
  const variable = resolveWorkflowVariable(variables, selector);
  return variable
    ? createWorkflowVariableReferenceSummarySegments(variable)
    : [{ kind: "value" as const, text: "时间变量不可用", tone: "warning" as const }];
}

function formatDateTime(value: string) {
  return value.replace("T", " ");
}

function formatRelativePoint(
  point: Extract<WorkflowOrderQueryDraftCondition["timeRange"], { mode: "relative" }>["start"],
) {
  const unit = point.unit === "day" ? "天" : point.unit === "hour" ? "小时" : "分钟";
  return `过去 ${point.amount} ${unit}${point.unit === "day" ? ` ${point.time}` : ""}`;
}
