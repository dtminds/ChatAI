import {
  WorkflowMessageSchema,
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
      if (visibleMessages.length === 1) return candidate;
      visibleMessages = take === "latest"
        ? visibleMessages.slice(1)
        : visibleMessages.slice(0, -1);
    }
  }
}

export function fitWorkflowMessageOutput<T extends Record<string, unknown>>(
  message: WorkflowMessage,
  createOutput: (visibleMessage: WorkflowMessage) => T,
) {
  const visibleMessage = structuredClone(message);
  while (true) {
    const candidate = createOutput(visibleMessage);
    if (fitsNodeOutput(candidate)) return candidate;

    const lastPart = visibleMessage.parts.at(-1)!;
    if (lastPart.type === "text" && lastPart.text.length > 0) {
      const characters = Array.from(lastPart.text);
      let low = 0;
      let high = characters.length;
      let fittedLength = -1;
      while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        lastPart.text = characters.slice(0, middle).join("");
        const truncated = createOutput(visibleMessage);
        if (fitsNodeOutput(truncated)) {
          fittedLength = middle;
          low = middle + 1;
        } else {
          high = middle - 1;
        }
      }
      if (fittedLength >= 0) {
        lastPart.text = characters.slice(0, fittedLength).join("");
        return createOutput(visibleMessage);
      }
      lastPart.text = "";
    }
    if (visibleMessage.parts.length === 1) {
      assertWorkflowRuntimeValue(
        createOutput(visibleMessage),
        "node-output",
        WORKFLOW_NODE_OUTPUT_MAX_BYTES,
      );
      throw new Error("Unreachable Workflow message output size state");
    }
    visibleMessage.parts.pop();
  }
}

export function renderWorkflowMessagesText(value: unknown) {
  if (!Value.Check(WorkflowMessagesV1Schema, value)) return null;
  return value.map(renderWorkflowMessage).join("\n");
}

export function renderWorkflowMessageText(value: unknown) {
  return Value.Check(WorkflowMessageSchema, value) ? renderWorkflowMessage(value) : null;
}

export function getWorkflowMessageRoleLabel(role: WorkflowMessage["role"]) {
  if (role === "customer") return "用户";
  if (role === "agent") return "客服";
  if (role === "bot") return "机器人";
  return "消息";
}

function renderWorkflowMessage(message: WorkflowMessage) {
  const content = message.parts.map(part => {
    if (part.type === "text") return part.text;
    if (part.type === "unsupported") return `[${part.label}]`;
    return part.type === "image" ? "[图片]" : "[视频]";
  }).join("");
  return `${getWorkflowMessageRoleLabel(message.role)}: ${content}`;
}

function fitsNodeOutput(value: Record<string, unknown>) {
  try {
    assertWorkflowRuntimeValue(value, "node-output", WORKFLOW_NODE_OUTPUT_MAX_BYTES);
    return true;
  } catch (error) {
    if (error instanceof WorkflowRuntimeValueError && error.reason === "too-large") return false;
    throw error;
  }
}
