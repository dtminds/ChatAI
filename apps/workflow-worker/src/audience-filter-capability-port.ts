import {
  decodeJavaInternalApiEnvelope,
  WorkflowAudienceFilterCommandSchema,
  type WorkflowAudienceFilterCommand,
  type WorkflowAudienceFilterResult,
} from "@chatai/contracts";
import {
  WORKFLOW_AUDIENCE_FILTER_CAPABILITY_BINDING,
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
  retryableError,
  terminalError,
} from "./capability-port-support.js";

const JAVA_AUDIENCE_FILTER_PATH = "/third-internal/cdp-group-operate/check-contact-exist";
const throwIfAborted = createAbortGuard(
  "WORKFLOW_AUDIENCE_FILTER_ABORTED",
  "人群筛选失败",
  "Workflow Audience Filter execution was aborted",
);

export class HttpWorkflowAudienceFilterCapabilityPort implements WorkflowCapabilityPort {
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
      WORKFLOW_AUDIENCE_FILTER_CAPABILITY_BINDING.definition,
      "Workflow Audience Filter",
    );
    const externalUserId = request.identities.externalUserId;
    if (
      !Value.Check(WorkflowAudienceFilterCommandSchema, request.command)
      || "idempotencyKey" in request
      || externalUserId === undefined
      || !Number.isSafeInteger(externalUserId)
      || externalUserId <= 0
    ) {
      throw terminalError(
        "WORKFLOW_AUDIENCE_FILTER_REQUEST_INVALID",
        "执行所需数据不可用，流程已停止",
        "Workflow Audience Filter port received an invalid command or prepared identity",
      );
    }

    return executeWorkflowAudienceFilter({
      baseUrl: this.options.baseUrl,
      command: structuredClone(request.command) as WorkflowAudienceFilterCommand,
      externalUserId,
      fetch: this.fetch,
      signal: request.signal,
      token: this.options.token ?? null,
      uid: request.uid,
    });
  }
}

export async function executeWorkflowAudienceFilter(input: {
  baseUrl: string;
  command: WorkflowAudienceFilterCommand;
  externalUserId: number;
  fetch: typeof fetch;
  signal: AbortSignal;
  token: string | null;
  uid: number;
}): Promise<WorkflowAudienceFilterResult> {
  throwIfAborted(input.signal);
  let response: Response;
  try {
    response = await input.fetch(
      new URL(JAVA_AUDIENCE_FILTER_PATH, `${input.baseUrl}/`),
      {
        body: JSON.stringify({
          externalUserId: input.externalUserId,
          groupIds: [...input.command.groupIds],
          uid: input.uid,
        }),
        headers: {
          "content-type": "application/json",
          ...(input.token ? { authorization: `Bearer ${input.token}` } : {}),
        },
        method: "POST",
        signal: input.signal,
      },
    );
  } catch (error) {
    if (input.signal.aborted) throwIfAborted(input.signal);
    throw retryableError(
      "WORKFLOW_AUDIENCE_FILTER_FAILED",
      "人群筛选失败",
      `Workflow Audience Filter Java request failed: ${error instanceof Error ? error.name : "unknown"}`,
    );
  }

  if (response.status !== 200) {
    throw retryableError(
      "WORKFLOW_AUDIENCE_FILTER_UNAVAILABLE",
      "人群筛选失败",
      `Workflow Audience Filter Java endpoint returned HTTP ${response.status}`,
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw terminalError(
      "WORKFLOW_AUDIENCE_FILTER_RESPONSE_INVALID",
      "返回结果异常，流程已停止",
      "Workflow Audience Filter Java endpoint returned invalid JSON",
    );
  }
  return decodeWorkflowAudienceFilterJavaResponse(body, input.command.groupIds);
}

export function decodeWorkflowAudienceFilterJavaResponse(
  body: unknown,
  requestedGroupIds: readonly number[],
): WorkflowAudienceFilterResult {
  const envelope = decodeJavaInternalApiEnvelope(body);
  if (envelope.kind === "invalid") {
    throw terminalError(
      "WORKFLOW_AUDIENCE_FILTER_RESPONSE_INVALID",
      "返回结果异常，流程已停止",
      `Workflow Audience Filter Java endpoint returned an invalid envelope: ${envelope.reason}`,
    );
  }
  if (envelope.kind === "rejected") {
    throw terminalError(
      "WORKFLOW_AUDIENCE_FILTER_REJECTED",
      "人群筛选失败，流程已停止",
      `Workflow Audience Filter Java endpoint rejected the request: ${envelope.error} ${envelope.errorMsg.trim()}`.trim(),
    );
  }
  const data = envelope.payload.data;
  if (!isRecord(data)) {
    throw terminalError(
      "WORKFLOW_AUDIENCE_FILTER_RESPONSE_INVALID",
      "返回结果异常，流程已停止",
      "Workflow Audience Filter Java endpoint returned an invalid data envelope",
    );
  }
  if (typeof data.exist !== "boolean") {
    throw terminalError(
      "WORKFLOW_AUDIENCE_FILTER_OUTPUT_INVALID",
      "返回结果异常，流程已停止",
      "Workflow Audience Filter Java result is missing exist",
    );
  }
  if (data.groupIds != null && !Array.isArray(data.groupIds)) {
    throw terminalError(
      "WORKFLOW_AUDIENCE_FILTER_OUTPUT_INVALID",
      "返回结果异常，流程已停止",
      "Workflow Audience Filter Java result contains invalid groupIds",
    );
  }

  const requestedGroupIdSet = new Set(requestedGroupIds);
  const membershipIds = new Set<number>();
  for (const item of Array.isArray(data.groupIds) ? data.groupIds : []) {
    if (typeof item !== "number" || !Number.isSafeInteger(item) || item <= 0) {
      throw terminalError(
        "WORKFLOW_AUDIENCE_FILTER_OUTPUT_INVALID",
        "返回结果异常，流程已停止",
        "Workflow Audience Filter Java result contains an invalid group id",
      );
    }
    if (!requestedGroupIdSet.has(item)) continue;
    if (membershipIds.has(item)) {
      throw terminalError(
        "WORKFLOW_AUDIENCE_FILTER_OUTPUT_INVALID",
        "返回结果异常，流程已停止",
        "Workflow Audience Filter Java result contains a duplicate group id",
      );
    }
    membershipIds.add(item);
  }
  return {
    exist: data.exist,
    groupIds: requestedGroupIds.filter((groupId) => membershipIds.has(groupId)),
  };
}
