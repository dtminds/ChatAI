import {
  WorkflowMessagesV1Schema,
  type WorkflowMessage,
} from "@chatai/contracts";
import { Value } from "@sinclair/typebox/value";
import {
  assertWorkflowRuntimeValue,
  WORKFLOW_NODE_OUTPUT_MAX_BYTES,
  WorkflowRuntimeValueError,
} from "./runtime-value-limits.js";

export function fitWorkflowMessagesOutput<T extends Record<string, unknown>>(
  messages: WorkflowMessage[],
  take: "earliest" | "latest",
  createOutput: (visibleMessages: WorkflowMessage[]) => T,
) {
  let visibleMessages = messages;
  while (true) {
    const candidate = createOutput(visibleMessages);
    try {
      assertWorkflowRuntimeValue(candidate, "node-output", WORKFLOW_NODE_OUTPUT_MAX_BYTES);
      return candidate;
    } catch (error) {
      if (!(error instanceof WorkflowRuntimeValueError) || error.reason !== "too-large") throw error;
      if (!visibleMessages.length) throw error;
      visibleMessages = take === "latest"
        ? visibleMessages.slice(1)
        : visibleMessages.slice(0, -1);
    }
  }
}

export function renderWorkflowMessagesText(value: unknown) {
  if (!Value.Check(WorkflowMessagesV1Schema, value)) return null;
  return value.map(message => {
    const content = message.parts.map(part => {
      if (part.type === "text") return part.text;
      if (part.type === "unsupported") return `[${part.label}]`;
      return part.type === "image" ? "[图片]" : "[视频]";
    }).join("");
    return `${getWorkflowMessageRoleLabel(message.role)}: ${content}`;
  }).join("\n");
}

export function getWorkflowMessageRoleLabel(role: WorkflowMessage["role"]) {
  if (role === "customer") return "用户";
  if (role === "agent") return "客服";
  if (role === "bot") return "机器人";
  return "消息";
}
