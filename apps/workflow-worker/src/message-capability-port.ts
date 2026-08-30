import {
  decodeJavaInternalApiEnvelope,
  WORKBENCH_MESSAGE_SOURCE,
  WorkflowMessageCommandSchema,
  type WorkflowMessageCommand,
} from "@chatai/contracts";
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
import {
  assertCapabilityDefinition,
  createAbortGuard,
  isRecord,
  readString,
  retryableError,
  terminalError,
} from "./capability-port-support.js";
import { findWorkflowSeat } from "./workflow-seat.js";

const JAVA_SEND_MESSAGE_PATH = "/third-internal/wap-embed/conversation/send-message";
const JAVA_SEND_TYPE_SINGLE = 1;
const throwIfAborted = createAbortGuard(
  "WORKFLOW_MESSAGE_SEND_ABORTED",
  "消息发送暂时失败",
  "Workflow Message execution was aborted",
);

type WorkflowMessageJavaData =
  | { msgtype: "text"; text: string }
  | { fileUrl: string; msgtype: "image" }
  | { fileName: string; fileUrl: string; msgtype: "file" }
  | { coverUrl?: string; desc?: string; href: string; msgtype: "link"; title: string }
  | { msgtype: "weapp" | "sphfeed"; transMsgInfoId: number };

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
    assertCapabilityDefinition(
      definition,
      WORKFLOW_MESSAGE_CAPABILITY_BINDING.definition,
      "Workflow Message",
    );
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
    token: string | null;
    uid: number;
  },
) {
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
      thirdExternalUserId: input.command.recipient.thirdExternalUserId,
      thirdUserId: seat.thirdUserId,
      token: input.token,
      uid: input.uid,
    });
  }

  return {};
}

export async function resolveWorkflowMessageSeat(
  database: Kysely<WorkflowDatabase>,
  input: {
    seatId: number;
    uid: number;
  },
) {
  const seat = await findWorkflowSeat(database, input);
  if (!seat) {
    throw terminalError(
      "WORKFLOW_MESSAGE_ACCOUNT_UNAVAILABLE",
      "执行所需数据不可用，流程已停止",
      `Workflow Message seat ${input.seatId} is unavailable`,
    );
  }
  return seat;
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

  if (response.status !== 200) {
    const diagnosticMessage = `Workflow Message Java endpoint returned HTTP ${response.status}`;
    throw retryableError(
      "WORKFLOW_MESSAGE_SEND_UNAVAILABLE",
      "消息发送暂时失败",
      diagnosticMessage,
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw terminalError(
      "WORKFLOW_MESSAGE_RESPONSE_INVALID",
      "返回结果异常，流程已停止",
      "Workflow Message Java endpoint returned invalid JSON",
    );
  }
  const envelope = decodeJavaInternalApiEnvelope(body);
  if (envelope.kind === "invalid") {
    throw terminalError(
      "WORKFLOW_MESSAGE_RESPONSE_INVALID",
      "返回结果异常，流程已停止",
      `Workflow Message Java endpoint returned an invalid envelope: ${envelope.reason}`,
    );
  }
  if (envelope.kind === "rejected") {
    throw terminalError(
      "WORKFLOW_MESSAGE_SEND_REJECTED",
      "执行所需数据不可用，流程已停止",
      `Workflow Message Java endpoint rejected the request: ${envelope.error} ${envelope.errorMsg.trim()}`.trim(),
    );
  }
  const optNo = isRecord(envelope.payload.data) ? envelope.payload.data.optNo : undefined;
  if ((typeof optNo !== "string" && typeof optNo !== "number") || !String(optNo).trim()) {
    throw terminalError(
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

function readPositiveInteger(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}
