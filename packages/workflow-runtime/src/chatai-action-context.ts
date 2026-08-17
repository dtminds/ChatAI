import type {
  WorkflowChatAiAccountSelection,
  WorkflowStartConfig,
} from "@chatai/contracts";

export function createWorkflowChatAiRunContext(startConfig: WorkflowStartConfig) {
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

export function hasWorkflowChatAiRunContext(context: Record<string, unknown>) {
  return readWorkflowChatAiAccountSelection(context) !== null;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
