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

export class MysqlChatAgentPreflightRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async find(input: {
    conversationId: string;
    triggerMessageId: string;
    uid: number;
  }): Promise<StoredChatAgentPreflightResult | undefined> {
    const row = await this.db
      .selectFrom(TABLE)
      .select([
        "direction",
        "outcome",
        "reasoning_summary",
        "source",
      ])
      .where("uid", "=", input.uid)
      .where("conversation_id", "=", parseDatabaseId(input.conversationId))
      .where("trigger_message_seq", "=", parseDatabaseId(input.triggerMessageId))
      .executeTakeFirst();

    return mapStoredResult(row);
  }

  async insert(input: {
    conversationId: string;
    model?: string;
    result: StoredChatAgentPreflightResult;
    tokenUsage?: Record<string, unknown>;
    triggerMessageId: string;
    uid: number;
  }) {
    const assessment = input.result.assessment;
    const result = await this.db
      .insertInto(TABLE)
      .values({
        conversation_id: parseDatabaseId(input.conversationId),
        direction:
          assessment.outcome === "response_needed"
            ? assessment.direction
            : null,
        model: input.model ?? null,
        outcome: assessment.outcome,
        reasoning_summary: assessment.reasoningSummary,
        source: input.result.source,
        token_usage: input.tokenUsage
          ? JSON.stringify(input.tokenUsage)
          : null,
        trigger_message_seq: parseDatabaseId(input.triggerMessageId),
        uid: input.uid,
      })
      .ignore()
      .executeTakeFirst();

    return getAffectedRows(result) > 0;
  }
}

type PreflightRow = Pick<
  Selectable<Database[typeof TABLE]>,
  "direction" | "outcome" | "reasoning_summary" | "source"
>;

function mapStoredResult(
  row: PreflightRow | undefined,
): StoredChatAgentPreflightResult | undefined {
  if (!row || (row.source !== "model" && row.source !== "fallback")) {
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

function getAffectedRows(result: unknown) {
  if (!result || typeof result !== "object") {
    return 0;
  }

  const value = result as {
    affectedRows?: bigint | number;
    numAffectedRows?: bigint | number;
    numChangedRows?: bigint | number;
    numInsertedOrUpdatedRows?: bigint | number;
  };
  const count =
    value.numAffectedRows ??
    value.numInsertedOrUpdatedRows ??
    value.numChangedRows ??
    value.affectedRows ??
    0;

  return Number(count);
}
