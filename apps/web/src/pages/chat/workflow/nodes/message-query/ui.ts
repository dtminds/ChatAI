import type { WorkflowNodeUiBinding } from "../ui-types";
import {
  getDynamicTimeReferenceLabel,
  getMessageQueryMetric,
  normalizeMessageQueryTimeRange,
} from "./config";
import { MessageQueryConfig } from "./panel";

export const messageQueryNodeUi: WorkflowNodeUiBinding<"message-query"> = {
  body: {
    getFields: (data) => {
      const timeRange = normalizeMessageQueryTimeRange(data.timeRange);
      const titleByNodeId = new Map((data.availableTimeReferences?.nodes ?? []).map((node) => [
        node.id,
        node.title,
      ]));
      const labelBySelector = new Map((data.availableTimeReferences?.outputs ?? []).map((variable) => [
        variable.selector.join("."),
        variable.sourceNodeTitle ? `${variable.sourceNodeTitle}.${variable.label}` : variable.label,
      ]));
      const rangeLabel = timeRange.mode === "fixed"
        ? `${formatFixedDateTime(timeRange.startAt)} 至 ${formatFixedDateTime(timeRange.endAt)}`
        : `${getDynamicTimeReferenceLabel(
            timeRange.start,
            (nodeId) => titleByNodeId.get(nodeId),
            (selector) => labelBySelector.get(selector.join(".")),
          )} 至 ${getDynamicTimeReferenceLabel(
            timeRange.end,
            (nodeId) => titleByNodeId.get(nodeId),
            (selector) => labelBySelector.get(selector.join(".")),
          )}`;

      return [
        {
          id: "time-range",
          label: "时间范围",
          value: { kind: "text", maxLines: 2, text: rangeLabel },
        },
        {
          id: "take",
          label: "取数方式",
          value: { kind: "text", text: getMessageQueryMetric(data) },
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
