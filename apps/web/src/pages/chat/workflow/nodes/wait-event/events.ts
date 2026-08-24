import type {
  WorkflowNodeOutputDefinition,
  WorkflowWaitEventType,
} from "../../types";
import { WORKFLOW_MESSAGES_SCHEMA_REF } from "@chatai/contracts";

export const WAIT_EVENT_TRIGGERED_HANDLE_ID = "triggered";
export const WAIT_EVENT_TIMEOUT_HANDLE_ID = "timeout";

type WorkflowWaitEventDefinition = {
  label: string;
  outputDefinitions: WorkflowNodeOutputDefinition[];
  shortLabel: string;
  type: WorkflowWaitEventType;
};

export const workflowWaitEventDefinitions = {
  "message.received": {
    label: "客户发送新消息",
    outputDefinitions: [
      {
        availableOnSourceHandles: [WAIT_EVENT_TRIGGERED_HANDLE_ID],
        description: "等待期间按时间顺序收集的文本、图片、视频及其他消息内容。",
        key: "messages",
        label: "消息列表",
        usages: ["intent-input", "variable"],
        valueType: { kind: "object", schemaRef: WORKFLOW_MESSAGES_SCHEMA_REF },
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
    type: "message.received",
  },
} satisfies Record<WorkflowWaitEventType, WorkflowWaitEventDefinition>;

export function getWorkflowWaitEventDefinition(type: WorkflowWaitEventType) {
  return workflowWaitEventDefinitions[type];
}
