import { WorkflowCapabilityExecutionError } from "@chatai/workflow-engine";

type CapabilityDefinitionIdentity = {
  capabilityKey: string;
  contractVersion: number;
  kind: string;
};

export function assertCapabilityDefinition(
  actual: CapabilityDefinitionIdentity,
  expected: CapabilityDefinitionIdentity,
  portName: string,
) {
  if (
    actual.capabilityKey === expected.capabilityKey
    && actual.contractVersion === expected.contractVersion
    && actual.kind === expected.kind
  ) return;
  throw terminalError(
    "WORKFLOW_CAPABILITY_UNSUPPORTED",
    "执行服务暂不可用，流程已停止",
    `${portName} port received unsupported capability ${actual.capabilityKey}@${actual.contractVersion}`,
  );
}

export function createAbortGuard(
  code: string,
  message: string,
  diagnosticMessage: string,
) {
  return (signal: AbortSignal): never | void => {
    if (!signal.aborted) return;
    if (signal.reason instanceof Error) throw signal.reason;
    throw retryableError(code, message, diagnosticMessage);
  };
}

export function terminalError(code: string, message: string, diagnosticMessage: string) {
  return new WorkflowCapabilityExecutionError(
    "terminal",
    code,
    message,
    { diagnosticMessage },
  );
}

export function retryableError(code: string, message: string, diagnosticMessage: string) {
  return new WorkflowCapabilityExecutionError(
    "retryable",
    code,
    message,
    { diagnosticMessage },
  );
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
