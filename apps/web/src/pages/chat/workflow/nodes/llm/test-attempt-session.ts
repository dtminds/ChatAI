import type { WorkflowLlmOutputConfig } from "../../types";
import {
  normalizeLlmInputs,
  normalizeLlmModelId,
  normalizeLlmOutput,
  normalizeLlmPrompt,
} from "./config";
import type { WorkflowNode } from "../../types";

const STORAGE_PREFIX = "chatai.workflow.llmTestAttempt";

export type WorkflowLlmTestAttemptReference = {
  attemptId: string;
  configFingerprint: string;
  expiresAt: string;
  output: WorkflowLlmOutputConfig;
  version: 1;
};

export function createLlmTestConfigFingerprint(node: WorkflowNode<"llm">) {
  return JSON.stringify({
    inputs: normalizeLlmInputs(node.data.inputs),
    modelId: normalizeLlmModelId(node.data.modelId),
    output: normalizeLlmOutput(node.data.output),
    systemPrompt: normalizeLlmPrompt(node.data.systemPrompt),
    userPrompt: normalizeLlmPrompt(node.data.userPrompt),
  });
}

export function loadLlmTestAttemptReference(workflowId: string, nodeId: string) {
  const storage = getSessionStorage();
  if (!storage) return null;
  const key = getStorageKey(workflowId, nodeId);
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!isReference(value) || Date.parse(value.expiresAt) <= Date.now()) {
      storage.removeItem(key);
      return null;
    }
    return {
      ...value,
      output: normalizeLlmOutput(value.output),
    };
  } catch {
    storage.removeItem(key);
    return null;
  }
}

export function saveLlmTestAttemptReference(
  workflowId: string,
  nodeId: string,
  reference: WorkflowLlmTestAttemptReference,
) {
  try {
    getSessionStorage()?.setItem(getStorageKey(workflowId, nodeId), JSON.stringify(reference));
  } catch {
    // Session persistence is best-effort; the active Workspace still keeps the Attempt in memory.
  }
}

export function clearLlmTestAttemptReference(workflowId: string, nodeId: string) {
  try {
    getSessionStorage()?.removeItem(getStorageKey(workflowId, nodeId));
  } catch {
    // Ignore unavailable browser storage.
  }
}

function getStorageKey(workflowId: string, nodeId: string) {
  return `${STORAGE_PREFIX}:${workflowId}:${nodeId}`;
}

function getSessionStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function isReference(value: unknown): value is WorkflowLlmTestAttemptReference {
  if (!isRecord(value)) return false;
  return value.version === 1
    && typeof value.attemptId === "string"
    && /^[1-9][0-9]*$/.test(value.attemptId)
    && typeof value.configFingerprint === "string"
    && typeof value.expiresAt === "string"
    && Number.isFinite(Date.parse(value.expiresAt))
    && isRecord(value.output);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
