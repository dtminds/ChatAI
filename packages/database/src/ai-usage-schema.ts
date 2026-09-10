import type { ColumnType, Generated } from "kysely";

export type AiUsageOutboxDatabaseId = bigint | number | string;
type DatabaseDate = ColumnType<Date, Date | string, Date | string>;
type GeneratedDate = ColumnType<Date, Date | string | undefined, Date | string>;
type NullableDate = ColumnType<Date | null, Date | string | null, Date | string | null>;
type JsonValue = ColumnType<unknown, string, string>;

export interface AiUsageOutboxTable {
  attempt: number;
  billing_key: string;
  business_id: string;
  business_type: string;
  capability: string;
  create_time: GeneratedDate;
  delivered_at: NullableDate;
  event_key: string;
  id: Generated<AiUsageOutboxDatabaseId>;
  last_error_code: string | null;
  last_error_message: string | null;
  lease_expires_at: NullableDate;
  lease_owner: string | null;
  next_attempt_at: DatabaseDate;
  occurred_at: DatabaseDate;
  payload_hash: string;
  payload_json: JsonValue;
  status: string;
  uid: number;
  update_time: GeneratedDate;
}

export interface AiUsageTables {
  xy_wap_embed_ai_usage_outbox: AiUsageOutboxTable;
}
