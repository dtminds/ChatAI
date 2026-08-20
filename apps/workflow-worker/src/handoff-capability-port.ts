import {
  WorkflowHandoffCommandSchema,
  type WorkflowHandoffCommand,
} from "@chatai/contracts";
import { WorkflowCapabilityExecutionError } from "@chatai/workflow-engine";
import {
  WORKFLOW_HANDOFF_CAPABILITY_BINDING,
  type WorkflowCapabilityDefinition,
  type WorkflowCapabilityKind,
  type WorkflowCapabilityPort,
  type WorkflowCapabilityRequest,
  type WorkflowDatabase,
} from "@chatai/workflow-runtime";
import type { Static, TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import type { Kysely } from "kysely";
import { findWorkflowSeat } from "./workflow-seat.js";

const JAVA_HANDOFF_PATH = "/third-internal/wap-embed/conversation/close-full-auto-with-message";

export class MysqlWorkflowHandoffCapabilityPort implements WorkflowCapabilityPort {
  private readonly fetch: typeof fetch;

  constructor(
    private readonly database: Kysely<WorkflowDatabase>,
    private readonly options: {
      baseUrl: string;
      fetch?: typeof fetch;
      token?: string | null;
    },
  ) {
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
      definition.capabilityKey !== WORKFLOW_HANDOFF_CAPABILITY_BINDING.definition.capabilityKey
      || definition.contractVersion !== WORKFLOW_HANDOFF_CAPABILITY_BINDING.definition.contractVersion
      || definition.kind !== "action"
    ) {
      throw terminalError(
        "WORKFLOW_CAPABILITY_UNSUPPORTED",
        "执行服务暂不可用，流程已停止",
        `Workflow Handoff port received unsupported capability ${definition.capabilityKey}@${definition.contractVersion}`,
      );
    }
    if (
      !Value.Check(WorkflowHandoffCommandSchema, request.command)
      || !("idempotencyKey" in request)
      || typeof request.idempotencyKey !== "string"
      || !request.idempotencyKey
      || request.identities.thirdExternalUserId
        !== request.command.recipient.thirdExternalUserId
    ) {
      throw terminalError(
        "WORKFLOW_HANDOFF_REQUEST_INVALID",
        "执行所需数据不可用，流程已停止",
        "Workflow Handoff port received an invalid command, identity, or idempotency key",
      );
    }

    return executeWorkflowHandoff(this.database, {
      baseUrl: this.options.baseUrl,
      command: structuredClone(request.command) as WorkflowHandoffCommand,
      fetch: this.fetch,
      idempotencyKey: request.idempotencyKey,
      signal: request.signal,
      token: this.options.token ?? null,
      uid: request.uid,
    });
  }
}

export async function executeWorkflowHandoff(
  database: Kysely<WorkflowDatabase>,
  input: {
    baseUrl: string;
    command: WorkflowHandoffCommand;
    fetch: typeof fetch;
    idempotencyKey: string;
    signal: AbortSignal;
    token: string | null;
    uid: number;
  },
) {
  throwIfAborted(input.signal);
  const seat = await findWorkflowSeat(database, {
    seatId: input.command.seatId,
    uid: input.uid,
  });
  if (!seat) {
    throw terminalError(
      "WORKFLOW_HANDOFF_ACCOUNT_UNAVAILABLE",
      "执行所需数据不可用，流程已停止",
      `Workflow Handoff seat ${input.command.seatId} is unavailable`,
    );
  }
  throwIfAborted(input.signal);

  const endpoint = new URL(JAVA_HANDOFF_PATH, `${input.baseUrl}/`);
  endpoint.searchParams.set("idempotentKey", input.idempotencyKey);
  let response: Response;
  try {
    response = await input.fetch(endpoint, {
      body: JSON.stringify({
        ...(input.command.customerMessage
          ? { externalMessage: input.command.customerMessage }
          : {}),
        platform: seat.platform,
        systemMessage: input.command.operatorMessage,
        thirdExternalUserid: input.command.recipient.thirdExternalUserId,
        thirdUserid: seat.thirdUserId,
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
      "WORKFLOW_HANDOFF_FAILED",
      "转人工暂时失败",
      `Workflow Handoff Java request failed: ${error instanceof Error ? error.name : "unknown"}`,
    );
  }

  if (response.status !== 200) {
    throw retryableError(
      "WORKFLOW_HANDOFF_UNAVAILABLE",
      "转人工暂时失败",
      `Workflow Handoff Java endpoint returned HTTP ${response.status}`,
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    if (input.signal.aborted) throwIfAborted(input.signal);
    throw terminalError(
      "WORKFLOW_HANDOFF_RESPONSE_INVALID",
      "返回结果异常，流程已停止",
      "Workflow Handoff Java endpoint returned invalid JSON",
    );
  }
  if (!isRecord(body)) {
    throw terminalError(
      "WORKFLOW_HANDOFF_RESPONSE_INVALID",
      "返回结果异常，流程已停止",
      "Workflow Handoff Java endpoint returned an invalid envelope",
    );
  }
  if (body.success === false) {
    throw terminalError(
      "WORKFLOW_HANDOFF_REJECTED",
      "转人工失败，流程已停止",
      "Workflow Handoff Java endpoint reported failure",
    );
  }
  if (body.success !== true) {
    throw terminalError(
      "WORKFLOW_HANDOFF_RESPONSE_INVALID",
      "返回结果异常，流程已停止",
      "Workflow Handoff Java endpoint returned an invalid success flag",
    );
  }
  return {};
}

function throwIfAborted(signal: AbortSignal): never | void {
  if (!signal.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  throw retryableError(
    "WORKFLOW_HANDOFF_ABORTED",
    "转人工暂时失败",
    "Workflow Handoff execution was aborted",
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
