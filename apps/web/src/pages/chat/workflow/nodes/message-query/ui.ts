import type { WorkflowNodeUiBinding } from "../ui-types";
import {
  getMessageQueryMetric,
  normalizeMessageQueryTimeRange,
} from "./config";
import { MessageQueryConfig } from "./panel";
import {
  createWorkflowReferenceSummarySegments,
  type WorkflowNodeSummarySegment,
} from "../../workflow-node-summary";
import type {
  WorkflowDynamicTimeReference,
  WorkflowVariableDefinition,
  WorkflowVariableSelector,
} from "../../types";

export const messageQueryNodeUi: WorkflowNodeUiBinding<"message-query"> = {
  body: {
    getFields: (data) => {
      const timeRange = normalizeMessageQueryTimeRange(data.timeRange);
      const titleByNodeId = new Map((data.availableTimeReferences?.nodes ?? []).map((node) => [
        node.id,
        node.title,
      ]));
      const outputBySelector = new Map((data.availableTimeReferences?.outputs ?? []).map((variable) => [
        variable.selector.join("."),
        variable,
      ]));
      const rangeSegments = timeRange.mode === "fixed"
        ? [
            createFixedTimeSegment(timeRange.startAt),
            { kind: "operator" as const, text: " 至 " },
            createFixedTimeSegment(timeRange.endAt),
          ]
        : [
            ...createDynamicTimeReferenceSegments(
              timeRange.start,
              (nodeId) => titleByNodeId.get(nodeId),
              (selector) => outputBySelector.get(selector.join(".")),
            ),
            { kind: "operator" as const, text: " 至 " },
            ...createDynamicTimeReferenceSegments(
              timeRange.end,
              (nodeId) => titleByNodeId.get(nodeId),
              (selector) => outputBySelector.get(selector.join(".")),
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
  reference: WorkflowDynamicTimeReference,
  resolveNodeTitle: (nodeId: string) => string | undefined,
  resolveOutput: (selector: WorkflowVariableSelector) => WorkflowVariableDefinition | undefined,
): WorkflowNodeSummarySegment[] {
  if (reference.kind === "workflow-trigger") {
    return createWorkflowReferenceSummarySegments({ source: "开始", variable: "触发时间" });
  }
  if (reference.kind === "current-node-lifecycle") {
    return createWorkflowReferenceSummarySegments({ source: "当前节点", variable: "进入时间" });
  }
  if (reference.kind === "node-lifecycle") {
    const source = resolveNodeTitle(reference.nodeId);
    return source
      ? createWorkflowReferenceSummarySegments({
          source,
          variable: reference.field === "enteredAt" ? "进入时间" : "退出时间",
        })
      : [{ kind: "value", text: "前序节点不可用", tone: "warning" }];
  }

  const output = resolveOutput(reference.selector);
  return output
    ? createWorkflowReferenceSummarySegments({
        source: output.sourceNodeTitle,
        variable: output.label,
      })
    : [{ kind: "value", text: "前序节点时间不可用", tone: "warning" }];
}
