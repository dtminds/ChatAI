import type {
  AiIntentNodeData,
  WorkflowIntentOption,
  WorkflowVariableSelector,
} from "../../types";

export const AI_INTENT_MIN_COUNT = 1;
export const AI_INTENT_MAX_COUNT = 10;
export const AI_INTENT_DESCRIPTION_MAX_LENGTH = 200;
export const AI_INTENT_DESCRIPTION_COUNT_THRESHOLD = 150;
export const AI_INTENT_PROMPT_MAX_LENGTH = 2000;
export const AI_INTENT_FALLBACK_HANDLE_ID = "fallback";
export const AI_INTENT_FIRST_HANDLE_TOP = 96;
export const AI_INTENT_HANDLE_ROW_GAP = 42;
export const AI_INTENT_NODE_BASE_HEIGHT = 96;

let workflowIntentIdSequence = 0;

export function createWorkflowIntentId(intents: WorkflowIntentOption[] = []) {
  const existingIds = new Set(intents.map((intent) => intent.id));
  let candidate = "";

  do {
    candidate = createWorkflowIntentIdCandidate();
  } while (existingIds.has(candidate));

  return candidate;
}

function createWorkflowIntentIdCandidate() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  workflowIntentIdSequence += 1;
  return `intent-${Date.now().toString(36)}-${workflowIntentIdSequence.toString(36)}`;
}

export function createWorkflowIntentOption(
  intents: WorkflowIntentOption[] = [],
): WorkflowIntentOption {
  return {
    description: "",
    id: createWorkflowIntentId(intents),
  };
}

export function normalizeAiIntentAdvancedEnabled(value: unknown) {
  return value === true;
}

export function normalizeAiIntentInputSelector(
  value: unknown,
): WorkflowVariableSelector | undefined {
  if (
    !Array.isArray(value)
    || value.length !== 3
    || value[0] !== "node"
    || value.some((part) => typeof part !== "string" || !part.trim())
  ) {
    return undefined;
  }

  return [...value];
}

export function normalizeAiIntentOptions(value: unknown): WorkflowIntentOption[] {
  if (!Array.isArray(value)) {
    return [createWorkflowIntentOption()];
  }

  const normalized: WorkflowIntentOption[] = [];
  const seenIds = new Set<string>();

  for (const [index, item] of value.entries()) {
    if (!isRecord(item) || normalized.length >= AI_INTENT_MAX_COUNT) {
      continue;
    }

    const rawId = typeof item.id === "string" ? item.id.trim() : "";
    const id = rawId && !seenIds.has(rawId)
      ? rawId
      : createNormalizedIntentId(index, seenIds);
    seenIds.add(id);
    normalized.push({
      description: typeof item.description === "string"
        ? item.description.slice(0, AI_INTENT_DESCRIPTION_MAX_LENGTH)
        : "",
      id,
    });
  }

  return normalized.length > 0 ? normalized : [createWorkflowIntentOption()];
}

function createNormalizedIntentId(index: number, seenIds: Set<string>) {
  const baseId = `intent-${index + 1}`;
  let candidate = baseId;
  let suffix = 1;

  while (seenIds.has(candidate)) {
    candidate = `${baseId}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

export function normalizeAiIntentPrompt(value: unknown) {
  return typeof value === "string"
    ? value.slice(0, AI_INTENT_PROMPT_MAX_LENGTH)
    : "";
}

export function getAiIntentHandleId(intentId: string) {
  return `intent:${intentId}`;
}

export function getAiIntentHandleLabel(description: string) {
  const normalized = description.trim();
  if (!normalized) return "未配置意图";
  return normalized.length > 24 ? `${normalized.slice(0, 24)}...` : normalized;
}

export function getAiIntentHandleTop(index: number) {
  return AI_INTENT_FIRST_HANDLE_TOP + index * AI_INTENT_HANDLE_ROW_GAP;
}

export function getAiIntentEstimatedHeight(data: Pick<AiIntentNodeData, "intents">) {
  return AI_INTENT_NODE_BASE_HEIGHT
    + (normalizeAiIntentOptions(data.intents).length + 1) * AI_INTENT_HANDLE_ROW_GAP;
}

export function getAiIntentMetric(data: Pick<AiIntentNodeData, "intents">) {
  const configuredCount = normalizeAiIntentOptions(data.intents)
    .filter((intent) => intent.description.trim()).length;

  return configuredCount > 0
    ? `${configuredCount} 个意图`
    : "待配置意图识别";
}

export function getAiIntentStatus(data: Pick<
  AiIntentNodeData,
  "inputSelector" | "intents"
>) {
  const intents = normalizeAiIntentOptions(data.intents);
  const descriptions = intents.map((intent) => intent.description.trim());
  const hasValidDescriptions = descriptions.every(Boolean)
    && new Set(descriptions).size === descriptions.length;
  return normalizeAiIntentInputSelector(data.inputSelector)
    && hasValidDescriptions
    ? "ready" as const
    : "warning" as const;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
