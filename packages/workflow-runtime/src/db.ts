import type { ColumnType, Generated } from "kysely";

type DatabaseId = bigint | number | string;
type DatabaseDate = ColumnType<Date, Date | string, Date | string>;
type GeneratedDate = ColumnType<Date, Date | string | undefined, Date | string>;
type NullableDate = ColumnType<Date | null, Date | string | null, Date | string | null>;
type JsonText = ColumnType<string, string, string>;

export interface WorkflowDefinitionTable {
  biz_status: number;
  client_request_id: string | null;
  create_time: GeneratedDate;
  description: string;
  draft_json: JsonText;
  draft_schema_version: number;
  draft_version: number;
  id: Generated<DatabaseId>;
  name: string;
  op_sub_uid: DatabaseId;
  published_revision: number | null;
  runtime_status: string;
  uid: number;
  update_time: GeneratedDate;
  validated_draft_version: number | null;
}

export interface WorkflowRevisionTable {
  create_time: GeneratedDate;
  draft_json: JsonText;
  dsl_schema_version: number;
  execution_spec_json: JsonText;
  id: Generated<DatabaseId>;
  publish_sub_uid: DatabaseId;
  publish_time: DatabaseDate;
  revision: number;
  spec_hash: string;
  uid: number;
  update_time: GeneratedDate;
  workflow_id: DatabaseId;
}

export interface WorkflowTriggerBindingTable {
  create_time: GeneratedDate;
  event_type: string;
  filter_spec_json: JsonText;
  id: Generated<DatabaseId>;
  revision: number;
  status: number;
  uid: number;
  update_time: GeneratedDate;
  workflow_id: DatabaseId;
}

export interface WorkflowRunTable {
  completed_at: NullableDate;
  context_json: JsonText;
  create_time: GeneratedDate;
  current_node_id: string;
  entry_event_id: string;
  id: Generated<DatabaseId>;
  lock_version: number;
  next_execute_at: NullableDate;
  revision: number;
  sequence: number;
  shard_id: number;
  status: string;
  subject_id: string;
  terminal_reason: string | null;
  uid: number;
  update_time: GeneratedDate;
  workflow_id: DatabaseId;
}

export interface WorkflowEntryGuardTable {
  create_time: GeneratedDate;
  id: Generated<DatabaseId>;
  subject_id: string;
  total_entries: number;
  uid: number;
  update_time: GeneratedDate;
  workflow_id: DatabaseId;
}

export interface WorkflowTaskTable {
  attempt: number;
  bucket_time: DatabaseDate;
  create_time: GeneratedDate;
  due_at: DatabaseDate;
  id: Generated<DatabaseId>;
  last_error_code: string | null;
  lease_expires_at: NullableDate;
  lease_owner: string | null;
  node_id: string;
  node_kind: string;
  revision: number;
  run_id: DatabaseId;
  sequence: number;
  shard_id: number;
  status: string;
  task_type: string;
  task_version: number;
  uid: number;
  update_time: GeneratedDate;
  workflow_id: DatabaseId;
}

export interface WorkflowNodeExecutionTable {
  completed_at: NullableDate;
  create_time: GeneratedDate;
  error_code: string | null;
  error_message: string | null;
  id: Generated<DatabaseId>;
  idempotency_key: string;
  input_snapshot_json: JsonText | null;
  node_id: string;
  node_kind: string;
  output_json: JsonText | null;
  run_id: DatabaseId;
  sequence: number;
  started_at: NullableDate;
  status: string;
  uid: number;
  update_time: GeneratedDate;
}

export interface WorkflowOutboxTable {
  aggregate_id: DatabaseId;
  aggregate_type: string;
  attempt: number;
  create_time: GeneratedDate;
  event_type: string;
  id: Generated<DatabaseId>;
  lease_expires_at: NullableDate;
  lease_owner: string | null;
  next_attempt_at: DatabaseDate;
  payload_json: JsonText;
  sent_at: NullableDate;
  status: string;
  task_version: number;
  uid: number;
  update_time: GeneratedDate;
}

export interface WorkflowInboxTable {
  consumer: string;
  create_time: GeneratedDate;
  expires_at: DatabaseDate;
  id: Generated<DatabaseId>;
  message_id: string;
  processed_at: DatabaseDate;
  uid: number;
  update_time: GeneratedDate;
}

export interface WorkflowDatabase {
  xy_wap_embed_workflow_definition: WorkflowDefinitionTable;
  xy_wap_embed_workflow_entry_guard: WorkflowEntryGuardTable;
  xy_wap_embed_workflow_inbox: WorkflowInboxTable;
  xy_wap_embed_workflow_node_execution: WorkflowNodeExecutionTable;
  xy_wap_embed_workflow_outbox: WorkflowOutboxTable;
  xy_wap_embed_workflow_revision: WorkflowRevisionTable;
  xy_wap_embed_workflow_run: WorkflowRunTable;
  xy_wap_embed_workflow_task: WorkflowTaskTable;
  xy_wap_embed_workflow_trigger_binding: WorkflowTriggerBindingTable;
}
