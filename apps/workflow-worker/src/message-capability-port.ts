import {
  WORKBENCH_MESSAGE_SOURCE,
  WorkflowMessageCommandSchema,
  type WorkflowMessageCommand,
} from "@chatai/contracts";
import { WorkflowCapabilityExecutionError } from "@chatai/workflow-engine";
import {
  WORKFLOW_MESSAGE_CAPABILITY_BINDING,
  type WorkflowCapabilityDefinition,
  type WorkflowCapabilityKind,
  type WorkflowCapabilityPort,
  type WorkflowCapabilityRequest,
  type WorkflowDatabase,
} from "@chatai/workflow-runtime";
import type { Static, TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import type { Kysely } from "kysely";

const JAVA_SEND_MESSAGE_PATH = "/third-internal/wap-embed/conversation/send-message";
const JAVA_SEND_TYPE_SINGLE = 1;

type WorkflowMessageJavaApiResponse = {
  data?: { optNo?: number | string } | null;
  error?: number;
  errorMsg?: string;
  success?: boolean;
};

type WorkflowMessageJavaData =
  | { msgtype: "text"; text: string }
  | { fileUrl: string; msgtype: "image" }
  | { fileName: string; fileUrl: string; msgtype: "file" }
  | { coverUrl?: string; desc?: string; href: string; msgtype: "link"; title: string }
  | { msgtype: "weapp" | "sphfeed"; transMsgInfoId: number };

interface WorkflowMessageSeatTable {
  id: number;
  platform: number;
  third_userid: string;
  uid: number;
}

type WorkflowMessageDatabase = WorkflowDatabase & {
  xy_wap_embed_user_seat: WorkflowMessageSeatTable;
};

type WorkflowMessageSeat = {
  id: number;
  platform: number;
  thirdUserId: string;
};

export class MysqlWorkflowMessageCapabilityPort implements WorkflowCapabilityPort {
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
      definition.capabilityKey !== WORKFLOW_MESSAGE_CAPABILITY_BINDING.definition.capabilityKey
      || definition.contractVersion !== WORKFLOW_MESSAGE_CAPABILITY_BINDING.definition.contractVersion
      || definition.kind !== "action"
    ) {
      throw terminalError(
        "WORKFLOW_CAPABILITY_UNSUPPORTED",
        "执行服务暂不可用，流程已停止",
        `Workflow Message port received unsupported capability ${definition.capabilityKey}@${definition.contractVersion}`,
      );
    }
    if (
      !Value.Check(WorkflowMessageCommandSchema, request.command)
      || !("idempotencyKey" in request)
      || typeof request.idempotencyKey !== "string"
      || !request.idempotencyKey
      || request.identities.thirdExternalUserId
        !== request.command.recipient.thirdExternalUserId
    ) {
      throw terminalError(
        "WORKFLOW_MESSAGE_REQUEST_INVALID",
        "执行所需数据不可用，流程已停止",
        "Workflow Message port received an invalid command or idempotency key",
      );
    }

    return executeWorkflowMessage(this.database, {
      baseUrl: this.options.baseUrl,
      command: structuredClone(request.command) as WorkflowMessageCommand,
      fetch: this.fetch,
      idempotencyKey: request.idempotencyKey,
      signal: request.signal,
      subjectId: request.subjectId,
      subjectType: request.subjectType,
      token: this.options.token ?? null,
      uid: request.uid,
    });
  }
}

export async function executeWorkflowMessage(
  database: Kysely<WorkflowDatabase>,
  input: {
    baseUrl: string;
    command: WorkflowMessageCommand;
    fetch: typeof fetch;
    idempotencyKey: string;
    signal: AbortSignal;
    subjectId: string;
    subjectType: string;
    token: string | null;
    uid: number;
  },
) {
  if (
    input.subjectType !== "chatai_contact"
    || input.subjectId !== input.command.recipient.thirdExternalUserId
  ) {
    throw terminalError(
      "WORKFLOW_MESSAGE_RECIPIENT_INVALID",
      "执行所需数据不可用，流程已停止",
      "Workflow Message subject does not match the command recipient",
    );
  }

  throwIfAborted(input.signal);
  const seat = await resolveWorkflowMessageSeat(database, {
    seatId: input.command.seatId,
    uid: input.uid,
  });
  throwIfAborted(input.signal);
  const messages = buildWorkflowJavaMessages(input.command);

  for (const [index, msgData] of messages.entries()) {
    throwIfAborted(input.signal);
    await sendWorkflowJavaMessage({
      baseUrl: input.baseUrl,
      fetch: input.fetch,
      idempotencyKey: `${input.idempotencyKey}:${index}`,
      msgData,
      platform: seat.platform,
      signal: input.signal,
      thirdExternalUserId: input.subjectId,
      thirdUserId: seat.thirdUserId,
      token: input.token,
      uid: input.uid,
    });
  }

  return {};
}

export function buildWorkflowMessageSeatQuery(
  database: Kysely<WorkflowDatabase>,
  input: { seatId: number; uid: number },
) {
  return asWorkflowMessageDatabase(database)
    .selectFrom("xy_wap_embed_user_seat")
    .select(["id", "platform", "third_userid"])
    .where("uid", "=", input.uid)
    .where("id", "=", input.seatId);
}

export async function resolveWorkflowMessageSeat(
  database: Kysely<WorkflowDatabase>,
  input: {
    seatId: number;
    uid: number;
  },
): Promise<WorkflowMessageSeat> {
  const row = await buildWorkflowMessageSeatQuery(database, input).executeTakeFirst();
  const id = readPositiveInteger(row?.id);
  const platform = readPositiveInteger(row?.platform);
  const thirdUserId = readString(row?.third_userid);
  if (!id || !platform || !thirdUserId) {
    throw terminalError(
      "WORKFLOW_MESSAGE_ACCOUNT_UNAVAILABLE",
      "执行所需数据不可用，流程已停止",
      `Workflow Message seat ${input.seatId} is unavailable`,
    );
  }
  return { id, platform, thirdUserId };
}

export function buildWorkflowJavaMessages(command: WorkflowMessageCommand) {
  const messages: WorkflowMessageJavaData[] = [];
  if (command.content) {
    messages.push({ msgtype: "text", text: command.content });
  }
  for (const attachment of command.attachments) {
    messages.push(buildWorkflowJavaAttachment(attachment));
  }
  if (messages.length === 0) {
    throw terminalError(
      "WORKFLOW_MESSAGE_COMMAND_INVALID",
      "执行所需数据不可用，流程已停止",
      "Workflow Message command has no sendable messages",
    );
  }
  return messages;
}

function buildWorkflowJavaAttachment(
  attachment: WorkflowMessageCommand["attachments"][number],
): WorkflowMessageJavaData {
  if (attachment.type === "image") {
    return { fileUrl: requireContentString(attachment.content, "fileUrl"), msgtype: "image" };
  }
  if (attachment.type === "file") {
    return {
      fileName: requireContentString(attachment.content, "fileName"),
      fileUrl: requireContentString(attachment.content, "fileUrl"),
      msgtype: "file",
    };
  }
  if (attachment.type === "h5") {
    const coverUrl = readFirstContentString(attachment.content, [
      "coverUrl",
      "previewImageUrl",
      "imageUrl",
    ]);
    const desc = readFirstContentString(attachment.content, ["desc", "description"]);
    return {
      ...(coverUrl ? { coverUrl } : {}),
      ...(desc ? { desc } : {}),
      href: requireFirstContentString(attachment.content, ["href", "url", "linkUrl"]),
      msgtype: "link",
      title: requireContentString(attachment.content, "title"),
    };
  }
  const transMsgInfoId = readPositiveInteger(attachment.msgInfoId);
  if (!transMsgInfoId) {
    throw terminalError(
      "WORKFLOW_MESSAGE_ATTACHMENT_INVALID",
      "执行所需数据不可用，流程已停止",
      `Workflow Message ${attachment.type} attachment has an invalid msgInfoId`,
    );
  }
  return { msgtype: attachment.type, transMsgInfoId };
}

async function sendWorkflowJavaMessage(input: {
  baseUrl: string;
  fetch: typeof fetch;
  idempotencyKey: string;
  msgData: WorkflowMessageJavaData;
  platform: number;
  signal: AbortSignal;
  thirdExternalUserId: string;
  thirdUserId: string;
  token: string | null;
  uid: number;
}) {
  const endpoint = new URL(JAVA_SEND_MESSAGE_PATH, `${input.baseUrl}/`);
  endpoint.searchParams.set("idempotentKey", input.idempotencyKey);
  let response: Response;
  try {
    response = await input.fetch(endpoint, {
      body: JSON.stringify({
        msgData: input.msgData,
        platform: input.platform,
        sendType: JAVA_SEND_TYPE_SINGLE,
        source: WORKBENCH_MESSAGE_SOURCE.AGENT,
        thirdExternalUserid: input.thirdExternalUserId,
        thirdUserId: input.thirdUserId,
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
      "WORKFLOW_MESSAGE_SEND_FAILED",
      "消息发送暂时失败",
      `Workflow Message Java request failed: ${error instanceof Error ? error.name : "unknown"}`,
    );
  }

  if (!response.ok) {
    const diagnosticMessage = `Workflow Message Java endpoint returned HTTP ${response.status}`;
    if (response.status === 408 || response.status === 429 || response.status >= 500) {
      throw retryableError(
        "WORKFLOW_MESSAGE_SEND_UNAVAILABLE",
        "消息发送暂时失败",
        diagnosticMessage,
      );
    }
    throw terminalError(
      "WORKFLOW_MESSAGE_SEND_REJECTED",
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
      "WORKFLOW_MESSAGE_RESPONSE_INVALID",
      "返回结果异常，流程已停止",
      "Workflow Message Java endpoint returned invalid JSON",
    );
  }
  if (!isRecord(body)) {
    throw retryableError(
      "WORKFLOW_MESSAGE_RESPONSE_INVALID",
      "返回结果异常，流程已停止",
      "Workflow Message Java endpoint returned an invalid envelope",
    );
  }
  const envelope = body as WorkflowMessageJavaApiResponse;
  if (envelope.success !== true && envelope.error !== 0) {
    throw terminalError(
      "WORKFLOW_MESSAGE_SEND_REJECTED",
      "执行所需数据不可用，流程已停止",
      `Workflow Message Java endpoint rejected the request: ${String(envelope.error ?? "unknown")} ${envelope.errorMsg?.trim() ?? ""}`.trim(),
    );
  }
  const optNo = envelope.data?.optNo;
  if ((typeof optNo !== "string" && typeof optNo !== "number") || !String(optNo).trim()) {
    throw retryableError(
      "WORKFLOW_MESSAGE_RESPONSE_INVALID",
      "返回结果异常，流程已停止",
      "Workflow Message Java response is missing optNo",
    );
  }
}

function requireContentString(content: Record<string, unknown>, key: string) {
  const value = readString(content[key]);
  if (value) return value;
  throw terminalError(
    "WORKFLOW_MESSAGE_ATTACHMENT_INVALID",
    "执行所需数据不可用，流程已停止",
    `Workflow Message attachment is missing ${key}`,
  );
}

function requireFirstContentString(content: Record<string, unknown>, keys: string[]) {
  const value = readFirstContentString(content, keys);
  if (value) return value;
  throw terminalError(
    "WORKFLOW_MESSAGE_ATTACHMENT_INVALID",
    "执行所需数据不可用，流程已停止",
    `Workflow Message attachment is missing ${keys.join(" or ")}`,
  );
}

function readFirstContentString(content: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = readString(content[key]);
    if (value) return value;
  }
  return "";
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readPositiveInteger(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function throwIfAborted(signal: AbortSignal): never | void {
  if (!signal.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  throw retryableError(
    "WORKFLOW_MESSAGE_SEND_ABORTED",
    "消息发送暂时失败",
    "Workflow Message execution was aborted",
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

function asWorkflowMessageDatabase(database: Kysely<WorkflowDatabase>) {
  return database as unknown as Kysely<WorkflowMessageDatabase>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
