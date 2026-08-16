import {
  QUICK_REPLY_CONTENT_TEXT_MAX_LENGTH,
  isWorkflowMessageExecutionConfigComplete,
  WorkflowMessageCommandSchema,
  WorkflowMessageResultSchema,
  type WorkflowMessageCommand,
  type WorkflowMessageExecutionConfig,
  type WorkflowStartConfig,
  type WorkflowVariableContentSegment,
  type WorkflowVariableSelector,
} from "@chatai/contracts";
import { WorkflowCapabilityExecutionError } from "@chatai/workflow-engine";
import type {
  WorkflowCapabilityCommandContext,
  WorkflowCapabilityExecutionBinding,
} from "./capability-port.js";

export const WORKFLOW_MESSAGE_CAPABILITY_BINDING = {
  createCommand: createWorkflowMessageCommand,
  definition: {
    capabilityKey: "chatai.message.send",
    commandSchema: WorkflowMessageCommandSchema,
    contractVersion: 1,
    kind: "action",
    resultSchema: WorkflowMessageResultSchema,
  },
  nodeKind: "message",
} satisfies WorkflowCapabilityExecutionBinding<
  typeof WorkflowMessageCommandSchema,
  typeof WorkflowMessageResultSchema,
  "action"
>;

export function createWorkflowMessageCommand(input: {
  config: Record<string, unknown>;
  context: WorkflowCapabilityCommandContext;
}): WorkflowMessageCommand {
  if (!isWorkflowMessageExecutionConfigComplete(input.config)) {
    throw messageCommandError("Message execution config failed schema validation");
  }
  const config = input.config as WorkflowMessageExecutionConfig;
  const content = renderMessageContent(config, input.context);
  if (content.length > QUICK_REPLY_CONTENT_TEXT_MAX_LENGTH) {
    throw messageCommandError("Rendered Message content exceeds the supported length");
  }
  if (!content.trim() && config.attachments.length === 0) {
    throw messageCommandError("Rendered Message command has no content or attachments");
  }
  const accountSelection = readAccountSelection(input.context.workflow);
  if (accountSelection === null || !input.context.subjectId.trim()) {
    throw messageCommandError("Message recipient is unavailable in the Run context");
  }
  return {
    accountSelection,
    attachments: config.attachments.map(attachment => ({
      content: structuredClone(attachment.content),
      materialCollectionId: attachment.materialCollectionId!,
      msgInfoId: attachment.msgInfoId!,
      ...(attachment.msgid ? { msgid: attachment.msgid } : {}),
      type: attachment.type,
    })),
    content: content.trim() ? content : "",
    recipient: {
      thirdExternalUserId: input.context.subjectId,
    },
    source: "workflow",
  };
}

export function createWorkflowMessageRunContext(startConfig: WorkflowStartConfig) {
  if (!("seatIds" in startConfig)) return {};
  return {
    message: {
      accountSelection: {
        seatIds: [...startConfig.seatIds],
        strategy: startConfig.pushAccountStrategy ?? "earliest-added",
      },
    },
  };
}

export function hasWorkflowMessageRunContext(context: Record<string, unknown>) {
  return readAccountSelection(context) !== null;
}

function renderMessageContent(
  config: WorkflowMessageExecutionConfig,
  context: WorkflowCapabilityCommandContext,
) {
  if (config.contentMode === "node-output") {
    if (!config.outputSelector) {
      throw messageCommandError("Message node output selector is missing");
    }
    const value = requireSelectorValue(config.outputSelector, context);
    if (typeof value !== "string") {
      throw messageCommandError("Message node output did not resolve to text");
    }
    return value;
  }
  return config.content.map(segment => renderMessageSegment(segment, context)).join("");
}

function renderMessageSegment(
  segment: WorkflowVariableContentSegment,
  context: WorkflowCapabilityCommandContext,
) {
  if (segment.type === "text") return segment.value;
  return stringifyMessageValue(requireSelectorValue(segment.selector, context));
}

function requireSelectorValue(
  selector: WorkflowVariableSelector,
  context: WorkflowCapabilityCommandContext,
) {
  const resolved = resolveSelector(selector, context);
  if (!resolved.available) {
    throw messageCommandError(`Message references unavailable data: ${selector.join(".")}`);
  }
  return resolved.value;
}

function resolveSelector(
  selector: WorkflowVariableSelector,
  context: WorkflowCapabilityCommandContext,
) {
  const [scope, key, ...path] = selector;
  if (!scope || !key) return { available: false, value: undefined };
  if (scope === "subject" && key === "id" && path.length === 0) {
    return { available: true, value: context.subjectId };
  }
  if (scope === "trigger") return readPath(context.trigger, [key, ...path]);
  if (scope === "node") return readPath(context.outputs[key], path);
  if (scope === "node-lifecycle") return readPath(context.nodeLifecycle[key], path);
  if (scope === "current-node-lifecycle") {
    return readPath(context.currentNodeLifecycle, [key, ...path]);
  }
  return { available: false, value: undefined };
}

function readAccountSelection(
  workflow: Record<string, unknown>,
): WorkflowMessageCommand["accountSelection"] | null {
  const message = isRecord(workflow.message) ? workflow.message : null;
  const selection = message && isRecord(message.accountSelection)
    ? message.accountSelection
    : null;
  const seatIds = selection?.seatIds;
  const strategy = selection?.strategy;
  if (!Array.isArray(seatIds)
    || seatIds.length === 0
    || seatIds.length > 100
    || new Set(seatIds).size !== seatIds.length
    || !seatIds.every(seatId =>
      typeof seatId === "number" && Number.isSafeInteger(seatId) && seatId > 0)) {
    return null;
  }
  if (strategy !== "earliest-added" && strategy !== "latest-added") {
    return null;
  }
  return { seatIds: [...seatIds] as number[], strategy };
}

function readPath(value: unknown, path: readonly string[]) {
  if (value === undefined) return { available: false, value: undefined };
  let current: unknown = value;
  for (const part of path) {
    if (!isRecord(current) || !Object.prototype.hasOwnProperty.call(current, part)) {
      return { available: false, value: undefined };
    }
    current = (current as Record<string, unknown>)[part];
  }
  return { available: true, value: current };
}

function stringifyMessageValue(value: unknown) {
  if (typeof value === "string") return value;
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw messageCommandError("Message variable cannot be serialized");
  }
  return serialized;
}

function messageCommandError(diagnosticMessage: string) {
  return new WorkflowCapabilityExecutionError(
    "terminal",
    "WORKFLOW_MESSAGE_COMMAND_INVALID",
    "节点配置无法执行",
    { diagnosticMessage },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
