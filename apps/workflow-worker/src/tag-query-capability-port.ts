import {
  WorkflowTagQueryCommandSchema,
  type WorkflowTagQueryCommand,
  type WorkflowTagQueryResult,
} from "@chatai/contracts";
import { WorkflowCapabilityExecutionError } from "@chatai/workflow-engine";
import {
  WORKFLOW_TAG_QUERY_CAPABILITY_BINDING,
  type WorkflowCapabilityDefinition,
  type WorkflowCapabilityKind,
  type WorkflowCapabilityPort,
  type WorkflowCapabilityRequest,
} from "@chatai/workflow-runtime";
import type { Static, TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

const JAVA_TAG_QUERY_PATH = "/third-internal/work-tag/get-wecom-contact-tags";

export class HttpWorkflowTagQueryCapabilityPort implements WorkflowCapabilityPort {
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
        !== WORKFLOW_TAG_QUERY_CAPABILITY_BINDING.definition.capabilityKey
      || definition.contractVersion
        !== WORKFLOW_TAG_QUERY_CAPABILITY_BINDING.definition.contractVersion
      || definition.kind !== "query"
    ) {
      throw terminalError(
        "WORKFLOW_CAPABILITY_UNSUPPORTED",
        "执行服务暂不可用，流程已停止",
        `Workflow Tag Query port received unsupported capability ${definition.capabilityKey}@${definition.contractVersion}`,
      );
    }
    const externalUserId = request.identities.externalUserId;
    if (
      !Value.Check(WorkflowTagQueryCommandSchema, request.command)
      || "idempotencyKey" in request
      || externalUserId === undefined
      || !Number.isSafeInteger(externalUserId)
      || externalUserId <= 0
    ) {
      throw terminalError(
        "WORKFLOW_TAG_QUERY_REQUEST_INVALID",
        "执行所需数据不可用，流程已停止",
        "Workflow Tag Query port received an invalid command or prepared identity",
      );
    }

    return executeWorkflowTagQuery({
      baseUrl: this.options.baseUrl,
      command: structuredClone(request.command) as WorkflowTagQueryCommand,
      externalUserId,
      fetch: this.fetch,
      signal: request.signal,
      token: this.options.token ?? null,
      uid: request.uid,
    });
  }
}

export async function executeWorkflowTagQuery(input: {
  baseUrl: string;
  command: WorkflowTagQueryCommand;
  externalUserId: number;
  fetch: typeof fetch;
  signal: AbortSignal;
  token: string | null;
  uid: number;
}): Promise<WorkflowTagQueryResult> {
  throwIfAborted(input.signal);
  let response: Response;
  try {
    response = await input.fetch(
      new URL(JAVA_TAG_QUERY_PATH, `${input.baseUrl}/`),
      {
        body: JSON.stringify({
          externalUserId: input.externalUserId,
          tagIds: [...input.command.tagIds],
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
      "WORKFLOW_TAG_QUERY_FAILED",
      "标签查询暂时失败",
      `Workflow Tag Query Java request failed: ${error instanceof Error ? error.name : "unknown"}`,
    );
  }

  if (!response.ok) {
    const diagnosticMessage = `Workflow Tag Query Java endpoint returned HTTP ${response.status}`;
    if (response.status === 408 || response.status === 429 || response.status >= 500) {
      throw retryableError(
        "WORKFLOW_TAG_QUERY_UNAVAILABLE",
        "标签查询暂时失败",
        diagnosticMessage,
      );
    }
    throw terminalError(
      "WORKFLOW_TAG_QUERY_REJECTED",
      response.status === 401 || response.status === 403
        ? "执行服务暂不可用，流程已停止"
        : "执行所需数据不可用，流程已停止",
      diagnosticMessage,
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw retryableError(
      "WORKFLOW_TAG_QUERY_RESPONSE_INVALID",
      "标签查询暂时失败",
      "Workflow Tag Query Java endpoint returned invalid JSON",
    );
  }
  return decodeWorkflowTagQueryJavaResponse(body, input.command.tagIds);
}

export function decodeWorkflowTagQueryJavaResponse(
  body: unknown,
  requestedTagIds: readonly number[],
): WorkflowTagQueryResult {
  if (!isRecord(body) || body.success !== true) {
    throw retryableError(
      "WORKFLOW_TAG_QUERY_FAILED",
      "标签查询暂时失败",
      "Workflow Tag Query Java endpoint reported failure",
    );
  }
  if (body.data === undefined || body.data === null) return { matchedTags: [] };
  if (!Array.isArray(body.data)) {
    throw retryableError(
      "WORKFLOW_TAG_QUERY_RESPONSE_INVALID",
      "标签查询暂时失败",
      "Workflow Tag Query Java endpoint returned an invalid data envelope",
    );
  }

  const requestedTagIdSet = new Set(requestedTagIds);
  const matchedTagIds = new Set<number>();
  const matchedTags = body.data.map((item): WorkflowTagQueryResult["matchedTags"][number] => {
    if (!isRecord(item)) throw invalidOutput("Tag Query Java result contains a non-object tag");
    const id = item.id;
    const name = typeof item.name === "string" ? item.name.trim() : "";
    if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) {
      throw invalidOutput("Tag Query Java result contains an invalid tag id");
    }
    if (!requestedTagIdSet.has(id)) {
      throw invalidOutput("Tag Query Java result contains a tag outside the requested intersection");
    }
    if (matchedTagIds.has(id)) {
      throw invalidOutput("Tag Query Java result contains a duplicate tag");
    }
    if (!name || name.length > 256) {
      throw invalidOutput("Tag Query Java result contains an invalid tag name");
    }
    matchedTagIds.add(id);
    return { id, name };
  });
  return { matchedTags };
}

function throwIfAborted(signal: AbortSignal): never | void {
  if (!signal.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  throw retryableError(
    "WORKFLOW_TAG_QUERY_ABORTED",
    "标签查询暂时失败",
    "Workflow Tag Query execution was aborted",
  );
}

function invalidOutput(diagnosticMessage: string) {
  return terminalError(
    "WORKFLOW_TAG_QUERY_OUTPUT_INVALID",
    "返回结果异常，流程已停止",
    diagnosticMessage,
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
