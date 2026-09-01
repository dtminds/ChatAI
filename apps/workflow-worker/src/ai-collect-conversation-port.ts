import type { WorkflowMessage } from "@chatai/contracts";
import {
  fitWorkflowMessageOutput,
  fitWorkflowMessagesOutput,
  type WorkflowAiCollectConversationPort,
  type WorkflowDatabase,
} from "@chatai/workflow-runtime";
import { WorkflowCapabilityExecutionError } from "@chatai/workflow-engine";
import type { Kysely } from "kysely";
import { executeWorkflowMessage } from "./message-capability-port.js";
import { createWorkflowMessage, type MessageQueryRow } from "./message-query-port.js";
import { findWorkflowSeat } from "./workflow-seat.js";

const CHATAI_PLATFORM = 5;
const ACTIVE_STATUS = 1;
const DIRECT_CHAT_TYPE = 1;
const CUSTOMER_FROM_TYPE = 2;
const SENT_MESSAGE_STATUS = 1;
const QUERY_LIMIT = 51;

interface AiCollectConversationTable {
  biz_status: number;
  chat_type: number;
  id: number | string;
  platform: number;
  third_external_userid: string;
  third_userid: string;
  uid: number;
}

interface AiCollectMessageTable {
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

type AiCollectConversationDatabase = WorkflowDatabase & {
  xy_wap_embed_conversation: AiCollectConversationTable;
  xy_wap_embed_msg_audit_info: AiCollectMessageTable;
};

type AiCollectMessageRow = MessageQueryRow & { msgtime: number | string };

export class MysqlWorkflowAiCollectConversationPort implements WorkflowAiCollectConversationPort {
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

  async resolveConversation(
    input: Parameters<WorkflowAiCollectConversationPort["resolveConversation"]>[0],
  ) {
    let seat: Awaited<ReturnType<typeof findWorkflowSeat>>;
    let row: { id: number | string } | undefined;
    try {
      seat = await findWorkflowSeat(this.database, input);
      if (seat?.platform === CHATAI_PLATFORM) {
        row = await asAiCollectDatabase(this.database)
          .selectFrom("xy_wap_embed_conversation")
          .select("id")
          .where("uid", "=", input.uid)
          .where("platform", "=", CHATAI_PLATFORM)
          .where("third_userid", "=", seat.thirdUserId)
          .where("third_external_userid", "=", input.thirdExternalUserId)
          .where("chat_type", "=", DIRECT_CHAT_TYPE)
          .where("biz_status", "=", ACTIVE_STATUS)
          .orderBy("id", "desc")
          .limit(1)
          .executeTakeFirst();
      }
    } catch (error) {
      throw retryable(
        "WORKFLOW_AI_COLLECT_CONVERSATION_UNAVAILABLE",
        error instanceof Error ? error.message : "AI Collect conversation query failed",
      );
    }
    if (!seat || seat.platform !== CHATAI_PLATFORM) {
      throw terminal("WORKFLOW_AI_COLLECT_CONVERSATION_UNAVAILABLE", "AI Collect seat is unavailable");
    }
    if (!row) {
      throw terminal(
        "WORKFLOW_AI_COLLECT_CONVERSATION_UNAVAILABLE",
        "AI Collect active conversation was not found",
      );
    }
    return { conversationId: normalizePositiveInteger(row.id, "conversation id") };
  }

  async readCustomerMessages(
    input: Parameters<WorkflowAiCollectConversationPort["readCustomerMessages"]>[0],
  ) {
    let seat: Awaited<ReturnType<typeof findWorkflowSeat>>;
    try {
      seat = await findWorkflowSeat(this.database, input);
    } catch (error) {
      throw retryable(
        "WORKFLOW_AI_COLLECT_MESSAGE_QUERY_FAILED",
        error instanceof Error ? error.message : "AI Collect seat query failed",
      );
    }
    if (!seat || seat.platform !== CHATAI_PLATFORM) {
      throw terminal("WORKFLOW_AI_COLLECT_MESSAGE_QUERY_FAILED", "AI Collect seat is unavailable");
    }
    let query = asAiCollectDatabase(this.database)
      .selectFrom("xy_wap_embed_msg_audit_info")
      .select(["content", "from_type", "id", "msgtime", "msgtype"])
      .where("uid", "=", input.uid)
      .where("platform", "=", CHATAI_PLATFORM)
      .where("third_user_id", "=", seat.thirdUserId)
      .where("third_external_id", "=", input.thirdExternalUserId)
      .where("chat_type", "=", DIRECT_CHAT_TYPE)
      .where("from_type", "=", CUSTOMER_FROM_TYPE)
      .where("status", "=", SENT_MESSAGE_STATUS)
      .where(eb => eb.or([
        eb("revoke_status", "=", 0),
        eb("revoke_status", "is", null),
      ]))
      .where("msgtime", "<=", input.until.getTime());
    if (input.after) {
      query = query.where(eb => eb.or([
        eb("msgtime", ">", input.after!.timestamp),
        eb.and([
          eb("msgtime", "=", input.after!.timestamp),
          eb("id", ">", input.after!.id),
        ]),
      ]));
    }
    let rows: AiCollectMessageRow[];
    try {
      rows = await query.orderBy("msgtime", "asc").orderBy("id", "asc")
        .limit(QUERY_LIMIT).execute() as AiCollectMessageRow[];
    } catch (error) {
      throw retryable(
        "WORKFLOW_AI_COLLECT_MESSAGE_QUERY_FAILED",
        error instanceof Error ? error.message : "AI Collect message query failed",
      );
    }
    const candidates = rows.slice(0, QUERY_LIMIT - 1).map(row => ({
      message: fitWorkflowMessageOutput(
        createWorkflowMessage(row),
        message => ({ message }),
      ).message,
      timestamp: normalizeNonNegativeInteger(row.msgtime, "message timestamp"),
    }));
    const fitted = fitWorkflowMessagesOutput(
      candidates.map(item => item.message),
      "earliest",
      messages => ({ messages }),
    ).messages as WorkflowMessage[];
    const last = fitted.at(-1);
    const lastCandidate = last
      ? candidates.find(item => item.message.id === last.id)
      : undefined;
    return {
      cursor: last && lastCandidate
        ? { id: last.id, timestamp: lastCandidate.timestamp }
        : null,
      hasMore: rows.length > fitted.length,
      messages: fitted,
    };
  }

  async sendOpeningMessage(
    input: Parameters<WorkflowAiCollectConversationPort["sendOpeningMessage"]>[0],
  ) {
    await executeWorkflowMessage(this.database, {
      baseUrl: this.options.baseUrl,
      command: {
        attachments: [],
        content: input.message,
        recipient: { thirdExternalUserId: input.thirdExternalUserId },
        seatId: input.seatId,
        source: "workflow",
      },
      fetch: this.fetch,
      idempotencyKey: input.idempotencyKey,
      signal: input.signal,
      token: this.options.token ?? null,
      uid: input.uid,
      workflowId: input.workflowId,
    });
  }
}

function asAiCollectDatabase(database: Kysely<WorkflowDatabase>) {
  return database as unknown as Kysely<AiCollectConversationDatabase>;
}

function normalizePositiveInteger(value: unknown, name: string) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (Number.isSafeInteger(parsed) && parsed > 0) return parsed;
  throw terminal("WORKFLOW_AI_COLLECT_MESSAGE_QUERY_FAILED", `Invalid AI Collect ${name}`);
}

function normalizeNonNegativeInteger(value: unknown, name: string) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (Number.isSafeInteger(parsed) && parsed >= 0) return parsed;
  throw terminal("WORKFLOW_AI_COLLECT_MESSAGE_QUERY_FAILED", `Invalid AI Collect ${name}`);
}

function terminal(code: string, diagnosticMessage: string) {
  return new WorkflowCapabilityExecutionError(
    "terminal",
    code,
    "执行所需数据不可用，流程已停止",
    { diagnosticMessage },
  );
}

function retryable(code: string, diagnosticMessage: string) {
  return new WorkflowCapabilityExecutionError(
    "retryable",
    code,
    "资料收集消息查询暂时失败",
    { diagnosticMessage },
  );
}
