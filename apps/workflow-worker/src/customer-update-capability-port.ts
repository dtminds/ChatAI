import {
  WorkflowCustomerUpdateCommandSchema,
  type WorkflowCustomerUpdateCommand,
} from "@chatai/contracts";
import { WorkflowCapabilityExecutionError } from "@chatai/workflow-engine";
import {
  WORKFLOW_CUSTOMER_UPDATE_CAPABILITY_BINDING,
  type WorkflowCapabilityDefinition,
  type WorkflowCapabilityKind,
  type WorkflowCapabilityPort,
  type WorkflowCapabilityRequest,
} from "@chatai/workflow-runtime";
import type { Static, TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

const JAVA_CUSTOMER_UPDATE_PATH =
  "/third-internal/custom-field/update-contact-custom-field";

export class HttpWorkflowCustomerUpdateCapabilityPort implements WorkflowCapabilityPort {
  private readonly fetch: typeof fetch;

  constructor(private readonly options: {
    baseUrl: string;
    fetch?: typeof fetch;
    token?: string | null;
  }) {
    this.fetch = options.fetch ?? fetch;
  }

  async execute<
    TCommandSchema extends TSchema,
    TResultSchema extends TSchema,
    TKind extends WorkflowCapabilityKind,
  >(
    definition: WorkflowCapabilityDefinition<TCommandSchema, TResultSchema, TKind>,
    request: WorkflowCapabilityRequest<Static<TCommandSchema>, TKind>,
  ): Promise<unknown> {
    if (
      definition.capabilityKey
        !== WORKFLOW_CUSTOMER_UPDATE_CAPABILITY_BINDING.definition.capabilityKey
      || definition.contractVersion
        !== WORKFLOW_CUSTOMER_UPDATE_CAPABILITY_BINDING.definition.contractVersion
      || definition.kind !== "action"
    ) {
      throw terminalError(
        "WORKFLOW_CAPABILITY_UNSUPPORTED",
        "执行服务暂不可用，流程已停止",
        `Workflow Customer Update port received unsupported capability ${definition.capabilityKey}@${definition.contractVersion}`,
      );
    }
    const externalUserId = request.identities.externalUserId;
    const command = request.command as WorkflowCustomerUpdateCommand;
    if (
      !Value.Check(WorkflowCustomerUpdateCommandSchema, command)
      || !hasUniqueFieldIds(command.updates)
      || !hasValidFieldValues(command.updates)
      || !("idempotencyKey" in request)
      || typeof request.idempotencyKey !== "string"
      || !request.idempotencyKey
      || externalUserId === undefined
      || !Number.isSafeInteger(externalUserId)
      || externalUserId <= 0
    ) {
      throw terminalError(
        "WORKFLOW_CUSTOMER_UPDATE_REQUEST_INVALID",
        "执行所需数据不可用，流程已停止",
        "Workflow Customer Update port received an invalid command, prepared identity, or idempotency key",
      );
    }

    return executeWorkflowCustomerUpdate({
      baseUrl: this.options.baseUrl,
      command: structuredClone(command),
      externalUserId,
      fetch: this.fetch,
      idempotencyKey: request.idempotencyKey,
      signal: request.signal,
      token: this.options.token ?? null,
      uid: request.uid,
    });
  }
}

export async function executeWorkflowCustomerUpdate(input: {
  baseUrl: string;
  command: WorkflowCustomerUpdateCommand;
  externalUserId: number;
  fetch: typeof fetch;
  idempotencyKey: string;
  signal: AbortSignal;
  token: string | null;
  uid: number;
}) {
  throwIfAborted(input.signal);
  if (input.command.updates.length === 0) return {};

  const endpoint = new URL(JAVA_CUSTOMER_UPDATE_PATH, `${input.baseUrl}/`);
  endpoint.searchParams.set("idempotentKey", input.idempotencyKey);
  let response: Response;
  try {
    response = await input.fetch(endpoint, {
      body: JSON.stringify({
        externalUserId: input.externalUserId,
        fieldValues: input.command.updates.map(update => ({
          fieldId: update.fieldId,
          value: toPlainString(update.value),
        })),
        uid: input.uid,
      }),
      headers: {
        "content-type": "application/json",
        ...(input.token ? { authorization: `Bearer ${input.token}` } : {}),
      },
      method: "POST",
      signal: input.signal,
    });
  } catch (error) {
    if (input.signal.aborted) throwIfAborted(input.signal);
    throw retryableError(
      "WORKFLOW_CUSTOMER_UPDATE_FAILED",
      "客户信息更新暂时失败",
      `Workflow Customer Update Java request failed: ${error instanceof Error ? error.name : "unknown"}`,
    );
  }

  if (response.status !== 200) {
    throw retryableError(
      "WORKFLOW_CUSTOMER_UPDATE_UNAVAILABLE",
      "客户信息更新暂时失败",
      `Workflow Customer Update Java endpoint returned HTTP ${response.status}`,
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    if (input.signal.aborted) throwIfAborted(input.signal);
    throw terminalError(
      "WORKFLOW_CUSTOMER_UPDATE_RESPONSE_INVALID",
      "返回结果异常，流程已停止",
      "Workflow Customer Update Java endpoint returned invalid JSON",
    );
  }
  if (!isRecord(body)) {
    throw terminalError(
      "WORKFLOW_CUSTOMER_UPDATE_RESPONSE_INVALID",
      "返回结果异常，流程已停止",
      "Workflow Customer Update Java endpoint returned an invalid envelope",
    );
  }
  if (body.success === false) {
    throw terminalError(
      "WORKFLOW_CUSTOMER_UPDATE_REJECTED",
      "客户信息更新失败，流程已停止",
      `Workflow Customer Update Java endpoint rejected the request: ${String(body.error ?? "unknown")} ${readString(body.errorMsg)}`.trim(),
    );
  }
  if (body.success !== true || body.data !== true) {
    throw terminalError(
      "WORKFLOW_CUSTOMER_UPDATE_RESPONSE_INVALID",
      "返回结果异常，流程已停止",
      "Workflow Customer Update Java endpoint returned an invalid success result",
    );
  }
  return {};
}

function toPlainString(value: number | string) {
  if (typeof value === "string") return value;
  const serialized = String(value);
  if (!/[eE]/.test(serialized)) return serialized;

  const [coefficient, exponentText] = serialized.toLowerCase().split("e");
  const exponent = Number(exponentText);
  const negative = coefficient!.startsWith("-");
  const unsigned = negative ? coefficient!.slice(1) : coefficient!;
  const [integerPart, fractionalPart = ""] = unsigned.split(".");
  const digits = `${integerPart}${fractionalPart}`;
  const decimalIndex = integerPart!.length + exponent;
  const expanded = decimalIndex <= 0
    ? `0.${"0".repeat(-decimalIndex)}${digits}`
    : decimalIndex >= digits.length
      ? `${digits}${"0".repeat(decimalIndex - digits.length)}`
      : `${digits.slice(0, decimalIndex)}.${digits.slice(decimalIndex)}`;
  return negative ? `-${expanded}` : expanded;
}

function hasUniqueFieldIds(updates: WorkflowCustomerUpdateCommand["updates"]) {
  return new Set(updates.map(update => update.fieldId)).size === updates.length;
}

function hasValidFieldValues(updates: WorkflowCustomerUpdateCommand["updates"]) {
  return updates.every(update => update.fieldType === 11
    ? typeof update.value === "number" && Number.isFinite(update.value)
    : typeof update.value === "string" && Boolean(update.value.trim()));
}

function throwIfAborted(signal: AbortSignal): never | void {
  if (!signal.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  throw retryableError(
    "WORKFLOW_CUSTOMER_UPDATE_ABORTED",
    "客户信息更新暂时失败",
    "Workflow Customer Update execution was aborted",
  );
}

function terminalError(code: string, message: string, diagnosticMessage: string) {
  return new WorkflowCapabilityExecutionError(
    "terminal",
    code,
    message,
    { diagnosticMessage },
  );
}

function retryableError(code: string, message: string, diagnosticMessage: string) {
  return new WorkflowCapabilityExecutionError(
    "retryable",
    code,
    message,
    { diagnosticMessage },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
