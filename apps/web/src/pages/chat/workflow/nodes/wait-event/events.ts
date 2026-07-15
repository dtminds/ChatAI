import type {
  WorkflowNodeOutputDefinition,
  WorkflowWaitEventType,
} from "../../types";

export const WAIT_EVENT_TRIGGERED_HANDLE_ID = "triggered";
export const WAIT_EVENT_TIMEOUT_HANDLE_ID = "timeout";
export const WAIT_EVENT_COLLECT_WINDOW_SECONDS = 10;

type WorkflowWaitEventDefinition = {
  label: string;
  outputDefinitions: WorkflowNodeOutputDefinition[];
  shortLabel: string;
  type: WorkflowWaitEventType;
};

const commonEventOutputs: WorkflowNodeOutputDefinition[] = [
  {
    availableOnSourceHandles: [WAIT_EVENT_TRIGGERED_HANDLE_ID],
    key: "eventId",
    label: "事件 ID",
    type: "string",
    usages: ["variable"],
  },
  {
    availableOnSourceHandles: [WAIT_EVENT_TRIGGERED_HANDLE_ID],
    key: "eventType",
    label: "事件类型",
    type: "string",
    usages: ["variable"],
  },
  {
    availableOnSourceHandles: [WAIT_EVENT_TRIGGERED_HANDLE_ID],
    key: "occurredAt",
    label: "事件发生时间",
    type: "datetime",
    usages: ["time-reference", "variable"],
  },
];

export const workflowWaitEventDefinitions = {
  "customer.message.received": {
    label: "客户发送新消息",
    outputDefinitions: [
      ...commonEventOutputs,
      {
        availableOnSourceHandles: [WAIT_EVENT_TRIGGERED_HANDLE_ID],
        key: "messageIds",
        label: "消息列表",
        type: "message-id-list",
        usages: ["intent-input"],
      },
      {
        availableOnSourceHandles: [WAIT_EVENT_TRIGGERED_HANDLE_ID],
        key: "textContent",
        label: "文本内容",
        type: "string",
        usages: ["intent-input", "message-content", "variable"],
      },
      {
        availableOnSourceHandles: [WAIT_EVENT_TRIGGERED_HANDLE_ID],
        key: "messageCount",
        label: "消息数量",
        type: "number",
        usages: ["variable"],
      },
      {
        availableOnSourceHandles: [WAIT_EVENT_TRIGGERED_HANDLE_ID],
        key: "lastMessageAt",
        label: "最后消息时间",
        type: "datetime",
        usages: ["time-reference", "variable"],
      },
    ],
    shortLabel: "新消息",
    type: "customer.message.received",
  },
} satisfies Record<WorkflowWaitEventType, WorkflowWaitEventDefinition>;

export function getWorkflowWaitEventDefinition(type: WorkflowWaitEventType) {
  return workflowWaitEventDefinitions[type];
}
