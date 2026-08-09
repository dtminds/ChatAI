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
    usages: ["variable"],
    valueType: { kind: "string" },
  },
  {
    availableOnSourceHandles: [WAIT_EVENT_TRIGGERED_HANDLE_ID],
    key: "eventType",
    label: "事件类型",
    usages: ["variable"],
    valueType: { kind: "string" },
  },
  {
    availableOnSourceHandles: [WAIT_EVENT_TRIGGERED_HANDLE_ID],
    key: "occurredAt",
    label: "事件发生时间",
    usages: ["time-reference", "variable"],
    valueType: { kind: "datetime" },
  },
];

export const workflowWaitEventDefinitions = {
  "customer.message.received": {
    label: "客户发送新消息",
    outputDefinitions: [
      ...commonEventOutputs,
      {
        availableOnSourceHandles: [WAIT_EVENT_TRIGGERED_HANDLE_ID],
        description: "等待期间收到的消息编号列表，可供意图识别等支持多模态消息的节点读取原始消息。",
        key: "messageIds",
        label: "消息列表",
        usages: ["intent-input"],
        valueType: { itemType: "bigint", kind: "array", semantic: "message" },
      },
      {
        availableOnSourceHandles: [WAIT_EVENT_TRIGGERED_HANDLE_ID],
        key: "textContent",
        label: "文本内容",
        usages: ["intent-input", "message-content", "variable"],
        valueType: { kind: "string" },
      },
      {
        availableOnSourceHandles: [WAIT_EVENT_TRIGGERED_HANDLE_ID],
        key: "messageCount",
        label: "消息数量",
        usages: ["variable"],
        valueType: { kind: "number" },
      },
      {
        availableOnSourceHandles: [WAIT_EVENT_TRIGGERED_HANDLE_ID],
        key: "lastMessageAt",
        label: "最后消息时间",
        usages: ["time-reference", "variable"],
        valueType: { kind: "datetime" },
      },
    ],
    shortLabel: "新消息",
    type: "customer.message.received",
  },
} satisfies Record<WorkflowWaitEventType, WorkflowWaitEventDefinition>;

export function getWorkflowWaitEventDefinition(type: WorkflowWaitEventType) {
  return workflowWaitEventDefinitions[type];
}
