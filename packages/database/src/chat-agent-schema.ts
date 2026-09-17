import type { ColumnType, Generated } from "kysely";

export type ChatAgentPreflightDatabaseId = bigint | number | string;
type GeneratedDate = ColumnType<Date, Date | string | undefined, Date | string>;
type NullableDate = ColumnType<
  Date | null,
  Date | string | null,
  Date | string | null
>;
type JsonValue = ColumnType<unknown, string, string>;

export interface ChatAgentPreflightTable {
  claim_token: string | null;
  completed_at: NullableDate;
  conversation_id: ChatAgentPreflightDatabaseId;
  create_time: GeneratedDate;
  direction: string | null;
  error_code: string | null;
  error_message: string | null;
  id: Generated<ChatAgentPreflightDatabaseId>;
  lease_expires_at: NullableDate;
  model: string | null;
  outcome: string | null;
  reasoning_summary: string | null;
  source: string | null;
  status: string;
  token_usage: JsonValue | null;
  trigger_message_seq: ChatAgentPreflightDatabaseId;
  uid: number;
  update_time: GeneratedDate;
}

export interface ChatAgentPreflightTables {
  xy_wap_embed_chat_agent_preflight: ChatAgentPreflightTable;
}
