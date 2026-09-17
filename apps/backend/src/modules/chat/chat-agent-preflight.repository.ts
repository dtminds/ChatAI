import {
  ChatAgentAssessmentSchema,
  type ChatAgentAssessment,
} from "@chatai/contracts";
import { Value } from "@sinclair/typebox/value";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "../../db/schema.js";

const TABLE = "xy_wap_embed_chat_agent_preflight" as const;

export type StoredChatAgentPreflightResult = {
  assessment: ChatAgentAssessment;
  source: "fallback" | "model";
};

export type ChatAgentPreflightClaimResult =
  | { kind: "claimed" }
  | { kind: "completed"; result: StoredChatAgentPreflightResult }
  | { kind: "running" };

export interface ChatAgentPreflightRecordStore {
  claim(input: {
    claimToken: string;
    conversationId: string;
    leaseExpiresAt: Date;
    now: Date;
    triggerMessageId: string;
    uid: number;
  }): Promise<ChatAgentPreflightClaimResult>;
  complete(input: {
    claimToken: string;
    conversationId: string;
    errorCode?: string;
    errorMessage?: string;
    model?: string;
    result: StoredChatAgentPreflightResult;
    tokenUsage?: Record<string, unknown>;
    triggerMessageId: string;
    uid: number;
  }): Promise<boolean>;
  findCompleted(input: {
    conversationId: string;
    triggerMessageId: string;
    uid: number;
  }): Promise<StoredChatAgentPreflightResult | undefined>;
}

export class MysqlChatAgentPreflightRecordStore
  implements ChatAgentPreflightRecordStore
{
  constructor(private readonly db: Kysely<Database>) {}

  async claim(
    input: Parameters<ChatAgentPreflightRecordStore["claim"]>[0],
  ): Promise<ChatAgentPreflightClaimResult> {
    const conversationId = parseDatabaseId(input.conversationId);
    const triggerMessageSeq = parseDatabaseId(input.triggerMessageId);

    try {
      await this.db
        .insertInto(TABLE)
        .values({
          claim_token: input.claimToken,
          completed_at: null,
          conversation_id: conversationId,
          direction: null,
          error_code: null,
          error_message: null,
          lease_expires_at: input.leaseExpiresAt,
          model: null,
          outcome: null,
          reasoning_summary: null,
          source: null,
          status: "running",
          token_usage: null,
          trigger_message_seq: triggerMessageSeq,
          uid: input.uid,
        })
        .executeTakeFirstOrThrow();

      return { kind: "claimed" };
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
    }

    const existing = await this.findRow({
      conversationId,
      triggerMessageSeq,
      uid: input.uid,
    });
    const completed = mapCompletedResult(existing);

    if (completed) {
      return { kind: "completed", result: completed };
    }

    if (
      existing?.status === "running" &&
      existing.lease_expires_at != null &&
      toTimestamp(existing.lease_expires_at) <= input.now.getTime()
    ) {
      const result = await this.db
        .updateTable(TABLE)
        .set({
          claim_token: input.claimToken,
          error_code: null,
          error_message: null,
          lease_expires_at: input.leaseExpiresAt,
          model: null,
        })
        .where("id", "=", existing.id)
        .where("status", "=", "running")
        .where("lease_expires_at", "<=", input.now)
        .executeTakeFirst();

      if (getAffectedRows(result) > 0) {
        return { kind: "claimed" };
      }

      const refreshed = await this.findRow({
        conversationId,
        triggerMessageSeq,
        uid: input.uid,
      });
      const refreshedResult = mapCompletedResult(refreshed);

      if (refreshedResult) {
        return { kind: "completed", result: refreshedResult };
      }
    }

    return { kind: "running" };
  }

  async complete(
    input: Parameters<ChatAgentPreflightRecordStore["complete"]>[0],
  ) {
    const assessment = input.result.assessment;
    const result = await this.db
      .updateTable(TABLE)
      .set({
        claim_token: null,
        completed_at: new Date(),
        direction:
          assessment.outcome === "response_needed"
            ? assessment.direction
            : null,
        error_code: input.errorCode ?? null,
        error_message: input.errorMessage?.slice(0, 1_024) ?? null,
        lease_expires_at: null,
        model: input.model ?? null,
        outcome: assessment.outcome,
        reasoning_summary: assessment.reasoningSummary,
        source: input.result.source,
        status: "completed",
        token_usage: input.tokenUsage
          ? JSON.stringify(input.tokenUsage)
          : null,
      })
      .where("uid", "=", input.uid)
      .where("conversation_id", "=", parseDatabaseId(input.conversationId))
      .where("trigger_message_seq", "=", parseDatabaseId(input.triggerMessageId))
      .where("status", "=", "running")
      .where("claim_token", "=", input.claimToken)
      .executeTakeFirst();

    return getAffectedRows(result) > 0;
  }

  async findCompleted(
    input: Parameters<ChatAgentPreflightRecordStore["findCompleted"]>[0],
  ) {
    const row = await this.findRow({
      conversationId: parseDatabaseId(input.conversationId),
      triggerMessageSeq: parseDatabaseId(input.triggerMessageId),
      uid: input.uid,
    });

    return mapCompletedResult(row);
  }

  private findRow(input: {
    conversationId: number;
    triggerMessageSeq: number;
    uid: number;
  }): Promise<PreflightRow | undefined> {
    return this.db
      .selectFrom(TABLE)
      .select([
        "id",
        "direction",
        "lease_expires_at",
        "outcome",
        "reasoning_summary",
        "source",
        "status",
      ])
      .where("uid", "=", input.uid)
      .where("conversation_id", "=", input.conversationId)
      .where("trigger_message_seq", "=", input.triggerMessageSeq)
      .executeTakeFirst();
  }
}

type PreflightRow = Pick<
  Selectable<Database[typeof TABLE]>,
  | "direction"
  | "id"
  | "lease_expires_at"
  | "outcome"
  | "reasoning_summary"
  | "source"
  | "status"
>;

function mapCompletedResult(
  row: PreflightRow | undefined,
): StoredChatAgentPreflightResult | undefined {
  if (
    !row ||
    row.status !== "completed" ||
    (row.source !== "model" && row.source !== "fallback")
  ) {
    return undefined;
  }

  const assessment = {
    ...(row.direction ? { direction: row.direction } : {}),
    outcome: row.outcome,
    reasoningSummary: row.reasoning_summary,
  };

  if (!Value.Check(ChatAgentAssessmentSchema, assessment)) {
    return undefined;
  }

  return {
    assessment,
    source: row.source,
  };
}

function parseDatabaseId(value: string) {
  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error("Chat agent preflight received an invalid database ID");
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed)) {
    throw new Error("Chat agent preflight received an unsafe database ID");
  }

  return parsed;
}

function toTimestamp(value: Date | string) {
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    throw new Error("Chat agent preflight returned an invalid lease timestamp");
  }

  return timestamp;
}

function getAffectedRows(result: unknown) {
  if (!result || typeof result !== "object") {
    return 0;
  }

  const value = result as {
    affectedRows?: bigint | number;
    numAffectedRows?: bigint | number;
    numChangedRows?: bigint | number;
    numUpdatedRows?: bigint | number;
  };
  const count =
    value.numAffectedRows ??
    value.numUpdatedRows ??
    value.numChangedRows ??
    value.affectedRows ??
    0;

  return Number(count);
}

function isDuplicateKeyError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const value = error as { code?: unknown; errno?: unknown };
  return value.code === "ER_DUP_ENTRY" || value.errno === 1_062;
}
