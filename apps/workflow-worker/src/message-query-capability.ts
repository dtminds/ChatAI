import {
  type WorkflowCapabilityKind,
  WorkflowMessageQueryCommandSchema,
  type WorkflowMessageQueryCommand,
  type WorkflowMessageQueryResult,
} from "@chatai/contracts";
import { WorkflowCapabilityExecutionError } from "@chatai/workflow-engine";
import {
  assertWorkflowRuntimeValue,
  WORKFLOW_NODE_OUTPUT_MAX_BYTES,
  WorkflowRuntimeValueError,
  type WorkflowCapabilityDefinition,
  type WorkflowCapabilityPort,
  type WorkflowCapabilityRequest,
  type WorkflowDatabase,
} from "@chatai/workflow-runtime";
import { Value } from "@sinclair/typebox/value";
import type { Static, TSchema } from "@sinclair/typebox";
import type { Kysely } from "kysely";

const CHATAI_PLATFORM = 5;
const ACTIVE_SEAT_STATUS = 1;
const DIRECT_CHAT_TYPE = 1;
const SENT_MESSAGE_STATUS = 1;

type MessageQueryRow = {
  content: string | null;
  from_type: number | null;
  id: number | string;
  msgtype: string;
};

interface WorkflowMessageQueryMessageTable {
  chat_type: number;
  content: string | null;
  from_type: number | null;
  id: number | string;
  msgtime: number | string;
  msgtype: string;
  platform: number;
  revoke_status: number | null;
  status: number;
  third_external_id: string;
  third_user_id: string;
  uid: number;
}

interface WorkflowMessageQuerySeatTable {
  biz_status: number;
  id: number;
  platform: number;
  third_userid: string;
  uid: number;
}

type WorkflowMessageQueryDatabase = WorkflowDatabase & {
  xy_wap_embed_msg_audit_info: WorkflowMessageQueryMessageTable;
  xy_wap_embed_user_seat: WorkflowMessageQuerySeatTable;
};

export class WorkflowWorkerCapabilityPort implements WorkflowCapabilityPort {
  constructor(private readonly database: Kysely<WorkflowDatabase>) {}

  async execute<TCommandSchema extends TSchema,
    TResultSchema extends TSchema,
    TKind extends WorkflowCapabilityKind>(
    definition: WorkflowCapabilityDefinition<TCommandSchema, TResultSchema, TKind>,
    request: WorkflowCapabilityRequest<Static<TCommandSchema>, TKind>,
  ): Promise<unknown> {
    if (definition.capabilityKey !== "operation.chatai.message.query"
      || definition.contractVersion !== 1
      || definition.kind !== "query") {
      throw terminalError(
        "WORKFLOW_CAPABILITY_UNSUPPORTED",
        `Unsupported local workflow capability: ${definition.capabilityKey}@${definition.contractVersion}`,
      );
    }
    if (!Value.Check(WorkflowMessageQueryCommandSchema, request.command)) {
      throw terminalError(
        "WORKFLOW_MESSAGE_QUERY_COMMAND_INVALID",
        "Message Query command failed schema validation",
      );
    }
    if (request.subjectType !== "chatai_contact") {
      throw terminalError(
        "WORKFLOW_MESSAGE_QUERY_SUBJECT_INVALID",
        `Message Query does not support subject type ${request.subjectType}`,
      );
    }

    try {
      return await executeMessageQuery(this.database, {
        command: request.command,
        signal: request.signal,
        subjectId: request.subjectId,
        uid: request.uid,
      });
    } catch (error) {
      if (error instanceof WorkflowCapabilityExecutionError) throw error;
      throw new WorkflowCapabilityExecutionError(
        "retryable",
        "WORKFLOW_MESSAGE_QUERY_FAILED",
        "消息查询暂时失败",
        { diagnosticMessage: error instanceof Error ? error.message : "Message Query failed" },
      );
    }
  }
}

export async function executeMessageQuery(
  database: Kysely<WorkflowDatabase>,
  input: {
    command: WorkflowMessageQueryCommand;
    signal: AbortSignal;
    subjectId: string;
    uid: number;
  },
) {
  throwIfAborted(input.signal);
  const seat = await buildMessageQuerySeatQuery(database, {
    seatId: input.command.seatId,
    uid: input.uid,
  }).executeTakeFirst();
  throwIfAborted(input.signal);
  if (!seat) {
    throw terminalError(
      "WORKFLOW_MESSAGE_QUERY_SEAT_UNAVAILABLE",
      `Active ChatAI seat ${input.command.seatId} was not found`,
    );
  }

  const rows = await buildMessageQueryMessagesQuery(database, {
    ...input.command,
    subjectId: input.subjectId,
    thirdUserId: seat.third_userid,
    uid: input.uid,
  }).execute();
  throwIfAborted(input.signal);
  const chronologicalRows = input.command.take === "latest"
    ? [...rows].reverse()
    : rows;
  return fitMessageQueryResult({
    messageCount: chronologicalRows.length,
    messageIds: chronologicalRows.map(row => normalizeMessageId(row.id)),
    rangeEnd: new Date(input.command.rangeEnd).toISOString(),
    rangeStart: new Date(input.command.rangeStart).toISOString(),
    textContent: chronologicalRows.map(formatMessageQueryRow).join("\n"),
  });
}

export function buildMessageQuerySeatQuery(
  database: Kysely<WorkflowDatabase>,
  input: { seatId: number; uid: number },
) {
  return asMessageQueryDatabase(database)
    .selectFrom("xy_wap_embed_user_seat")
    .select("third_userid")
    .where("uid", "=", input.uid)
    .where("id", "=", input.seatId)
    .where("platform", "=", CHATAI_PLATFORM)
    .where("biz_status", "=", ACTIVE_SEAT_STATUS);
}

export function buildMessageQueryMessagesQuery(
  database: Kysely<WorkflowDatabase>,
  input: WorkflowMessageQueryCommand & {
    subjectId: string;
    thirdUserId: string;
    uid: number;
  },
) {
  const direction = input.take === "earliest" ? "asc" : "desc";
  return asMessageQueryDatabase(database)
    .selectFrom("xy_wap_embed_msg_audit_info")
    .select(["content", "from_type", "id", "msgtype"])
    .where("uid", "=", input.uid)
    .where("platform", "=", CHATAI_PLATFORM)
    .where("third_user_id", "=", input.thirdUserId)
    .where("third_external_id", "=", input.subjectId)
    .where("chat_type", "=", DIRECT_CHAT_TYPE)
    .where("status", "=", SENT_MESSAGE_STATUS)
    .where((expressionBuilder) => expressionBuilder.or([
      expressionBuilder("revoke_status", "=", 0),
      expressionBuilder("revoke_status", "is", null),
    ]))
    .where("msgtime", ">=", input.rangeStart)
    .where("msgtime", "<=", input.rangeEnd)
    .orderBy("msgtime", direction)
    .orderBy("id", direction)
    .limit(input.limit);
}

function asMessageQueryDatabase(database: Kysely<WorkflowDatabase>) {
  // Platform tables are a worker-local read boundary, not part of the Runtime repository schema.
  return database as unknown as Kysely<WorkflowMessageQueryDatabase>;
}

export function formatMessageQueryRow(row: MessageQueryRow) {
  const role = row.from_type === 2
    ? "客户"
    : row.from_type === 1
      ? "托管账号"
      : row.from_type === 3
        ? "机器人"
        : "消息";
  return `${role}: ${readMessageText(row.msgtype, row.content)}`;
}

function readMessageText(msgtype: string, rawContent: string | null) {
  const parsed = parseJson(rawContent);
  if (msgtype === "text" || msgtype === "markdown" || msgtype === "quote") {
    if (typeof parsed === "string") return parsed;
    if (isRecord(parsed)) {
      if (typeof parsed.text === "string") return parsed.text;
      if (typeof parsed.content === "string") return parsed.content;
    }
    return rawContent ?? "";
  }
  const label = MESSAGE_TYPE_LABELS[msgtype];
  return label ? `[${label}]` : `[${msgtype || "消息"}]`;
}

const MESSAGE_TYPE_LABELS: Record<string, string> = {
  card: "名片",
  chatrecord: "聊天记录",
  emotion: "表情",
  file: "文件",
  image: "图片",
  link: "链接",
  video: "视频",
  voice: "语音",
  weapp: "小程序",
};

function fitMessageQueryResult(result: WorkflowMessageQueryResult) {
  try {
    assertWorkflowRuntimeValue(result, "node-output", WORKFLOW_NODE_OUTPUT_MAX_BYTES);
    return result;
  } catch (error) {
    if (!(error instanceof WorkflowRuntimeValueError) || error.reason !== "too-large") throw error;
    const characters = Array.from(result.textContent);
    let lower = 0;
    let upper = characters.length;
    let fitted = { ...result, textContent: "" };
    while (lower <= upper) {
      const middle = Math.floor((lower + upper) / 2);
      const truncated = middle < characters.length;
      const candidate = {
        ...result,
        textContent: `${characters.slice(0, middle).join("")}${truncated ? "\n[内容已截断]" : ""}`,
      };
      try {
        assertWorkflowRuntimeValue(candidate, "node-output", WORKFLOW_NODE_OUTPUT_MAX_BYTES);
        fitted = candidate;
        lower = middle + 1;
      } catch (error) {
        if (!(error instanceof WorkflowRuntimeValueError) || error.reason !== "too-large") {
          throw error;
        }
        upper = middle - 1;
      }
    }
    return fitted;
  }
}

function normalizeMessageId(value: number | string) {
  const id = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw terminalError("WORKFLOW_MESSAGE_QUERY_OUTPUT_INVALID", "Message Query returned an invalid message id");
  }
  return id;
}

function parseJson(value: string | null) {
  if (value === null) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) throw signal.reason ?? new Error("Message Query was aborted");
}

function terminalError(code: string, diagnosticMessage: string) {
  return new WorkflowCapabilityExecutionError(
    "terminal",
    code,
    "消息查询无法执行",
    { diagnosticMessage },
  );
}
