import type {
  WorkflowNodeOutputDefinition,
  WorkflowWaitEventType,
} from "../../types";
import { WORKFLOW_MESSAGE_SCHEMA_REF } from "@chatai/contracts";

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
        description: "首次触发等待事件的消息内容",
        key: "message",
        label: "触发消息",
        usages: ["intent-input", "variable"],
        valueType: { kind: "object", schemaRef: WORKFLOW_MESSAGE_SCHEMA_REF },
      },
      {
        availableOnSourceHandles: [WAIT_EVENT_TRIGGERED_HANDLE_ID],
        key: "triggeredAt",
        label: "事件触发时间",
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
