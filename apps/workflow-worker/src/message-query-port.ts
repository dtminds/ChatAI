import {
  type WorkflowMessage,
  type WorkflowMessagePart,
  type WorkflowMessageQueryCommand,
  type WorkflowMessageQueryResult,
} from "@chatai/contracts";
import { WorkflowCapabilityExecutionError } from "@chatai/workflow-engine";
import {
  fitWorkflowMessagesOutput,
  type WorkflowDatabase,
  type WorkflowMessageQueryPort,
  type WorkflowMessageQueryRequest,
} from "@chatai/workflow-runtime";
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

type MessageQueryResultInput = {
  rangeEnd: string;
  rangeStart: string;
  rows: WorkflowMessage[];
  take: WorkflowMessageQueryCommand["take"];
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

export class MysqlWorkflowMessageQueryPort implements WorkflowMessageQueryPort {
  constructor(private readonly database: Kysely<WorkflowDatabase>) {}

  async execute(request: WorkflowMessageQueryRequest): Promise<unknown> {
    if (request.subjectType !== "chatai_contact") {
      throw terminalError(
        "WORKFLOW_MESSAGE_QUERY_SUBJECT_INVALID",
        `Message Query does not support subject type ${request.subjectType}`,
      );
    }
    const thirdExternalUserId = request.identities.thirdExternalUserId;
    if (!thirdExternalUserId) {
      throw terminalError(
        "WORKFLOW_MESSAGE_QUERY_SUBJECT_INVALID",
        "Message Query requires thirdExternalUserId",
      );
    }

    try {
      return await executeMessageQuery(this.database, {
        command: request.command,
        signal: request.signal,
        subjectId: thirdExternalUserId,
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
    rangeEnd: new Date(input.command.rangeEnd).toISOString(),
    rangeStart: new Date(input.command.rangeStart).toISOString(),
    rows: chronologicalRows.map(createMessageQueryOutputRow),
    take: input.command.take,
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
  const message = createWorkflowMessage(row);
  return `${getMessageQueryRoleLabel(message.role)}: ${message.parts.map(part =>
    part.type === "text" ? part.text : `[${part.type === "unsupported" ? part.label : part.type === "image" ? "图片" : "视频"}]`
  ).join("")}`;
}

function createMessageQueryOutputRow(row: MessageQueryRow) {
  return createWorkflowMessage(row);
}

function createWorkflowMessage(row: MessageQueryRow): WorkflowMessage {
  return {
    id: normalizeMessageId(row.id),
    parts: readMessageParts(row.msgtype, row.content),
    role: getMessageQueryRole(row.from_type),
  };
}

function getMessageQueryRole(fromType: number | null) {
  return fromType === 2
    ? "customer" as const
    : fromType === 1
      ? "agent" as const
      : fromType === 3
        ? "bot" as const
        : "unknown" as const;
}

function getMessageQueryRoleLabel(role: WorkflowMessage["role"]) {
  if (role === "customer") return "客户";
  if (role === "agent") return "托管账号";
  if (role === "bot") return "机器人";
  return "消息";
}

function readMessageParts(msgtype: string, rawContent: string | null): WorkflowMessagePart[] {
  const parsed = parseJson(rawContent);
  if (Array.isArray(parsed)) {
    const parts = parsed.flatMap(item => isRecord(item)
      ? readParsedMessagePart(
          typeof item.msgtype === "string" ? item.msgtype : msgtype,
          item,
        )
      : []);
    if (parts.length) return parts.slice(0, 20);
  }
  return readParsedMessagePart(msgtype, parsed);
}

function readParsedMessagePart(msgtype: string, parsed: unknown): WorkflowMessagePart[] {
  if (msgtype === "text" || msgtype === "markdown" || msgtype === "quote") {
    if (typeof parsed === "string") return [{ text: parsed, type: "text" }];
    if (isRecord(parsed)) {
      if (typeof parsed.text === "string") return [{ text: parsed.text, type: "text" }];
      if (typeof parsed.content === "string") return [{ text: parsed.content, type: "text" }];
    }
    return [{ text: "", type: "text" }];
  }
  if (msgtype === "image" || msgtype === "video") {
    const url = readMediaUrl(parsed, msgtype);
    if (url) return [{ type: msgtype, url }];
  }
  const label = MESSAGE_TYPE_LABELS[msgtype];
  return [{ label: label ?? (msgtype || "消息"), type: "unsupported" }];
}

function readMediaUrl(parsed: unknown, type: "image" | "video") {
  if (!isRecord(parsed)) return "";
  const candidates = type === "image"
    ? [parsed.fileUrl, parsed.imageUrl, parsed.url]
    : [parsed.fileUrl, parsed.videoUrl, parsed.url];
  const url = candidates.find(value => typeof value === "string" && value.trim());
  return typeof url === "string" && url.trim().length <= 2_048 ? url.trim() : "";
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

function fitMessageQueryResult(input: MessageQueryResultInput) {
  return fitWorkflowMessagesOutput(
    input.rows,
    input.take,
    visibleRows => createMessageQueryResult(input, visibleRows),
  );
}

function createMessageQueryResult(
  input: MessageQueryResultInput,
  visibleRows: WorkflowMessage[],
): WorkflowMessageQueryResult {
  return {
    messageCount: input.rows.length,
    messages: visibleRows,
    rangeEnd: input.rangeEnd,
    rangeStart: input.rangeStart,
  };
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

function terminalError(
  code:
    | "WORKFLOW_MESSAGE_QUERY_OUTPUT_INVALID"
    | "WORKFLOW_MESSAGE_QUERY_SEAT_UNAVAILABLE"
    | "WORKFLOW_MESSAGE_QUERY_SUBJECT_INVALID",
  diagnosticMessage: string,
) {
  return new WorkflowCapabilityExecutionError(
    "terminal",
    code,
    code === "WORKFLOW_MESSAGE_QUERY_OUTPUT_INVALID"
      ? "返回结果异常，流程已停止"
      : "执行所需数据不可用，流程已停止",
    { diagnosticMessage },
  );
}
