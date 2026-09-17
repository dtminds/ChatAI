import type { ColumnType, Generated } from "kysely";

export type ChatAgentPreflightDatabaseId = bigint | number | string;
type GeneratedDate = ColumnType<Date, Date | string | undefined, Date | string>;
type JsonValue = ColumnType<unknown, string, string>;

export interface ChatAgentPreflightTable {
  conversation_id: ChatAgentPreflightDatabaseId;
  create_time: GeneratedDate;
  direction: string | null;
  id: Generated<ChatAgentPreflightDatabaseId>;
  model: string | null;
  outcome: string;
  reasoning_summary: string;
  source: string;
  token_usage: JsonValue | null;
  trigger_message_seq: ChatAgentPreflightDatabaseId;
  uid: number;
  update_time: GeneratedDate;
}

export interface ChatAgentPreflightTables {
  xy_wap_embed_chat_agent_preflight: ChatAgentPreflightTable;
}
