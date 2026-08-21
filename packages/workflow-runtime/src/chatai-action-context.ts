import type {
  WorkflowChatAiAccountSelection,
  WorkflowMessageSendingWindow,
  WorkflowStartConfig,
} from "@chatai/contracts";
import {
  DEFAULT_WORKFLOW_MESSAGE_SENDING_WINDOW,
  isWorkflowMessageSendingWindowValid,
} from "@chatai/contracts";

const UTC_8_OFFSET_MS = 8 * 60 * 60 * 1_000;

export function createWorkflowChatAiRunContext(startConfig: WorkflowStartConfig) {
  if (!("seatIds" in startConfig)) return {};
  return {
    message: {
      accountSelection: {
        seatIds: [...startConfig.seatIds],
        strategy: startConfig.pushAccountStrategy ?? "earliest-added",
      },
      sendingWindow: structuredClone(
        startConfig.messageSendingWindow ?? DEFAULT_WORKFLOW_MESSAGE_SENDING_WINDOW,
      ),
    },
  };
}

export function hasWorkflowChatAiRunContext(context: Record<string, unknown>) {
  return readWorkflowChatAiAccountSelection(context) !== null
    && readWorkflowMessageSendingWindow(context) !== null;
}

export function readWorkflowChatAiAccountSelection(
  workflow: Record<string, unknown>,
): WorkflowChatAiAccountSelection | null {
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

export function readWorkflowMessageSendingWindow(
  workflow: Record<string, unknown>,
): WorkflowMessageSendingWindow | null {
  const message = isRecord(workflow.message) ? workflow.message : null;
  const sendingWindow = message?.sendingWindow;
  return isWorkflowMessageSendingWindowValid(sendingWindow)
    ? structuredClone(sendingWindow)
    : null;
}

export function getNextWorkflowMessageExecutionAt(
  workflow: Record<string, unknown>,
  now: Date,
) {
  const sendingWindow = readWorkflowMessageSendingWindow(workflow);
  if (!sendingWindow) return null;
  const localNow = now.getTime() + UTC_8_OFFSET_MS;
  const localDate = new Date(localNow);
  const localDayStart = Date.UTC(
    localDate.getUTCFullYear(),
    localDate.getUTCMonth(),
    localDate.getUTCDate(),
  );
  const startAt = localDayStart + parseClockMinutes(sendingWindow.startTime) * 60_000;
  const endAt = localDayStart + parseClockMinutes(sendingWindow.endTime) * 60_000;
  if (localNow >= startAt && localNow < endAt) return null;
  const nextLocalStart = localNow < startAt ? startAt : startAt + 24 * 60 * 60 * 1_000;
  return new Date(nextLocalStart - UTC_8_OFFSET_MS);
}

function parseClockMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours! * 60 + minutes!;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
