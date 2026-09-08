import type { WorkflowNodeUiBinding } from "../ui-types";
import { getVariableContentSummarySegments } from "../variable-content/content";
import { TicketCreateConfig } from "./panel";

const priorityLabels = { high: "高", low: "低", medium: "中" } as const;

export const ticketCreateNodeUi: WorkflowNodeUiBinding<"ticket-create"> = {
  body: {
    getFields: data => [
      {
        id: "title",
        label: "标题",
        value: data.ticketTitle.length
          ? {
              items: getVariableContentSummarySegments(data.ticketTitle, data.availableVariables),
              kind: "segments",
              maxLines: 2,
            }
          : { kind: "empty" },
      },
      {
        id: "priority",
        label: "优先级",
        value: { kind: "text", text: priorityLabels[data.priority] },
      },
    ],
    kind: "fields",
  },
  settings: { component: TicketCreateConfig, kind: "custom" },
};
