import {
  WorkflowTagCommandSchema,
  type WorkflowTagCommand,
} from "@chatai/contracts";
import {
  WORKFLOW_TAG_CAPABILITY_BINDING,
  type WorkflowCapabilityDefinition,
  type WorkflowCapabilityKind,
  type WorkflowCapabilityPort,
  type WorkflowCapabilityRequest,
} from "@chatai/workflow-runtime";
import type { Static, TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import {
  assertCapabilityDefinition,
  createAbortGuard,
  isRecord,
  readString,
  retryableError,
  terminalError,
} from "./capability-port-support.js";

const JAVA_TAG_UPDATE_PATH = "/third-internal/work-tag/update-wecom-contact-tag";
const throwIfAborted = createAbortGuard(
  "WORKFLOW_TAG_ABORTED",
  "客户标签更新暂时失败",
  "Workflow Tag execution was aborted",
);

export class HttpWorkflowTagCapabilityPort implements WorkflowCapabilityPort {
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
    assertCapabilityDefinition(
      definition,
      WORKFLOW_TAG_CAPABILITY_BINDING.definition,
      "Workflow Tag",
    );
    const externalUserId = request.identities.externalUserId;
    if (
      !Value.Check(WorkflowTagCommandSchema, request.command)
      || !("idempotencyKey" in request)
      || typeof request.idempotencyKey !== "string"
      || !request.idempotencyKey
      || externalUserId === undefined
      || !Number.isSafeInteger(externalUserId)
      || externalUserId <= 0
    ) {
      throw terminalError(
        "WORKFLOW_TAG_REQUEST_INVALID",
        "执行所需数据不可用，流程已停止",
        "Workflow Tag port received an invalid command, prepared identity, or idempotency key",
      );
    }

    return executeWorkflowTag({
      baseUrl: this.options.baseUrl,
      command: structuredClone(request.command) as WorkflowTagCommand,
      externalUserId,
      fetch: this.fetch,
      idempotencyKey: request.idempotencyKey,
      signal: request.signal,
      token: this.options.token ?? null,
      uid: request.uid,
    });
  }
}

export async function executeWorkflowTag(input: {
  baseUrl: string;
  command: WorkflowTagCommand;
  externalUserId: number;
  fetch: typeof fetch;
  idempotencyKey: string;
  signal: AbortSignal;
  token: string | null;
  uid: number;
}) {
  throwIfAborted(input.signal);
  const endpoint = new URL(JAVA_TAG_UPDATE_PATH, `${input.baseUrl}/`);
  endpoint.searchParams.set("idempotentKey", input.idempotencyKey);
  let response: Response;
  try {
    response = await input.fetch(endpoint, {
      body: JSON.stringify({
        externalUserId: input.externalUserId,
        tagIds: [...input.command.tagIds],
        type: input.command.operation === "add" ? 1 : 2,
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
      "WORKFLOW_TAG_FAILED",
      "客户标签更新暂时失败",
      `Workflow Tag Java request failed: ${error instanceof Error ? error.name : "unknown"}`,
    );
  }

  if (response.status !== 200) {
    throw retryableError(
      "WORKFLOW_TAG_UNAVAILABLE",
      "客户标签更新暂时失败",
      `Workflow Tag Java endpoint returned HTTP ${response.status}`,
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw terminalError(
      "WORKFLOW_TAG_RESPONSE_INVALID",
      "返回结果异常，流程已停止",
      "Workflow Tag Java endpoint returned invalid JSON",
    );
  }
  if (!isRecord(body)) {
    throw terminalError(
      "WORKFLOW_TAG_RESPONSE_INVALID",
      "返回结果异常，流程已停止",
      "Workflow Tag Java endpoint returned an invalid envelope",
    );
  }
  if (body.success === false) {
    throw terminalError(
      "WORKFLOW_TAG_REJECTED",
      "客户标签更新失败，流程已停止",
      `Workflow Tag Java endpoint rejected the request: ${String(body.error ?? "unknown")} ${readString(body.errorMsg)}`.trim(),
    );
  }
  if (body.success !== true) {
    throw terminalError(
      "WORKFLOW_TAG_RESPONSE_INVALID",
      "返回结果异常，流程已停止",
      "Workflow Tag Java endpoint returned an invalid success flag",
    );
  }
  return {};
}
