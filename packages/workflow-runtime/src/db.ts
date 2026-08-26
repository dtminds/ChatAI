import type { ColumnType, Generated } from "kysely";

export type DatabaseId = bigint | number | string;
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
  draft_semantic_hash: string;
  draft_version: number;
  id: Generated<DatabaseId>;
  name: string;
  op_sub_uid: DatabaseId;
  published_revision: number | null;
  published_semantic_hash: string | null;
  runtime_status: string;
  status_reason: string | null;
  uid: number;
  update_time: GeneratedDate;
  workflow_type: number;
}

export interface WorkflowRevisionTable {
  create_time: GeneratedDate;
  draft_json: JsonText;
  dsl_schema_version: number;
  execution_spec_json: JsonText;
  id: Generated<DatabaseId>;
  publish_sub_uid: DatabaseId;
  publish_time: DatabaseDate;
  review_id: DatabaseId;
  revision: number;
  spec_hash: string;
  subject_type: number;
  uid: number;
  update_time: GeneratedDate;
  workflow_id: DatabaseId;
  workflow_type: number;
}

export interface WorkflowPublishReviewTable {
  base_published_revision: number | null;
  candidate_hash: string;
  change_summary_json: JsonText;
  checked_at: DatabaseDate;
  create_time: GeneratedDate;
  draft_json: JsonText;
  draft_semantic_hash: string;
  execution_spec_json: JsonText;
  id: Generated<DatabaseId>;
  publish_sub_uid: DatabaseId | null;
  publish_time: NullableDate;
  resulting_revision: number | null;
  review_comment: string | null;
  review_sub_uid: DatabaseId | null;
  review_time: NullableDate;
  source_draft_version: number;
  status: string;
  subject_type: number;
  submit_sub_uid: DatabaseId;
  submit_time: DatabaseDate;
  trigger_bindings_json: JsonText;
  uid: number;
  update_time: GeneratedDate;
  workflow_id: DatabaseId;
  workflow_type: number;
}

export interface WorkflowTriggerBindingTable {
  create_time: GeneratedDate;
  event_type: string;
  filter_spec_json: JsonText;
  id: Generated<DatabaseId>;
  revision: number;
  status: number;
  subject_type: number;
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
  subject_type: number;
  terminal_reason: string | null;
  uid: number;
  update_time: GeneratedDate;
  workflow_id: DatabaseId;
}

export interface WorkflowEntryGuardTable {
  create_time: GeneratedDate;
  id: Generated<DatabaseId>;
  subject_id: string;
  subject_type: number;
  total_entries: number;
  uid: number;
  update_time: GeneratedDate;
  workflow_id: DatabaseId;
}

export interface WorkflowCapacityGuardTable {
  active_run_count: number;
  create_time: GeneratedDate;
  uid: number;
  update_time: GeneratedDate;
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
  failure_kind: string | null;
  id: Generated<DatabaseId>;
  execution_key: string;
  input_snapshot_json: JsonText | null;
  node_id: string;
  node_kind: string;
  output_json: JsonText | null;
  run_id: DatabaseId;
  revision: number;
  sequence: number;
  source_outlet_id: string | null;
  started_at: NullableDate;
  status: string;
  uid: number;
  update_time: GeneratedDate;
}

export interface WorkflowRevisionCleanupTable {
  after_run_id: DatabaseId | null;
  attempt: number;
  create_time: GeneratedDate;
  id: Generated<DatabaseId>;
  last_error_code: string | null;
  lease_expires_at: NullableDate;
  lease_owner: string | null;
  next_attempt_at: DatabaseDate;
  node_id: string;
  node_kind: string;
  revision: number;
  status: string;
  uid: number;
  update_time: GeneratedDate;
  workflow_id: DatabaseId;
}

export interface WorkflowInferenceJobTable {
  attempt: number;
  completed_at: NullableDate;
  contract_version: number;
  create_time: GeneratedDate;
  deadline_at: DatabaseDate;
  error_code: string | null;
  error_message: string | null;
  execution_key: string;
  failure_kind: string | null;
  id: Generated<DatabaseId>;
  lease_expires_at: NullableDate;
  lease_owner: string | null;
  next_attempt_at: DatabaseDate;
  node_id: string;
  node_kind: string;
  paused_at: NullableDate;
  payload_json: JsonText;
  result_json: JsonText | null;
  run_id: DatabaseId;
  sequence: number;
  started_at: NullableDate;
  status: string;
  task_id: DatabaseId;
  uid: number;
  update_time: GeneratedDate;
}

export interface WorkflowLlmTestAttemptTable {
  attempt: number;
  completed_at: NullableDate;
  contract_version: number;
  create_time: GeneratedDate;
  deadline_at: DatabaseDate;
  error_code: string | null;
  error_message: string | null;
  execution_key: string;
  expires_at: DatabaseDate;
  id: Generated<DatabaseId>;
  input_values_json: JsonText;
  lease_expires_at: NullableDate;
  lease_owner: string | null;
  node_id: string;
  node_snapshot_json: JsonText;
  op_sub_uid: DatabaseId;
  output_json: JsonText | null;
  payload_json: JsonText;
  result_json: JsonText | null;
  started_at: NullableDate;
  status: string;
  uid: number;
  update_time: GeneratedDate;
  workflow_id: DatabaseId;
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

export interface WorkflowEventSubscriptionTable {
  create_time: GeneratedDate;
  effective_from: DatabaseDate;
  event_type: string;
  expires_at: DatabaseDate;
  id: Generated<DatabaseId>;
  node_id: string;
  revision: number;
  resume_at: NullableDate;
  run_id: DatabaseId;
  seat_id: DatabaseId | null;
  status: string;
  subject_id: string;
  subject_type: number;
  task_id: DatabaseId;
  trigger_event_id: string | null;
  trigger_occurred_at: NullableDate;
  trigger_projection_json: string | null;
  uid: number;
  update_time: GeneratedDate;
  workflow_id: DatabaseId;
}

export interface WorkflowNodeMetricEventTable {
  completed_delta: number;
  create_time: GeneratedDate;
  current_delta: number;
  entered_delta: number;
  event_key: string;
  id: Generated<DatabaseId>;
  incomplete_delta: number;
  node_id: string;
  passed_delta: number;
  processed_at: NullableDate;
  revision: number;
  run_id: DatabaseId;
  shard_id: number;
  uid: number;
  update_time: GeneratedDate;
  workflow_id: DatabaseId;
}

export interface WorkflowNodeMetricTable {
  completed_count: number;
  create_time: GeneratedDate;
  current_count: number;
  entered_count: number;
  id: Generated<DatabaseId>;
  incomplete_count: number;
  node_id: string;
  passed_count: number;
  revision: number;
  shard_id: number;
  uid: number;
  update_time: GeneratedDate;
  workflow_id: DatabaseId;
}

export interface WorkflowDatabase {
  xy_wap_embed_workflow_capacity_guard: WorkflowCapacityGuardTable;
  xy_wap_embed_workflow_definition: WorkflowDefinitionTable;
  xy_wap_embed_workflow_entry_guard: WorkflowEntryGuardTable;
  xy_wap_embed_workflow_event_subscription: WorkflowEventSubscriptionTable;
  xy_wap_embed_workflow_inbox: WorkflowInboxTable;
  xy_wap_embed_workflow_inference_job: WorkflowInferenceJobTable;
  xy_wap_embed_workflow_llm_test_attempt: WorkflowLlmTestAttemptTable;
  xy_wap_embed_workflow_node_execution: WorkflowNodeExecutionTable;
  xy_wap_embed_workflow_node_metric: WorkflowNodeMetricTable;
  xy_wap_embed_workflow_node_metric_event: WorkflowNodeMetricEventTable;
  xy_wap_embed_workflow_outbox: WorkflowOutboxTable;
  xy_wap_embed_workflow_publish_review: WorkflowPublishReviewTable;
  xy_wap_embed_workflow_revision: WorkflowRevisionTable;
  xy_wap_embed_workflow_revision_cleanup: WorkflowRevisionCleanupTable;
  xy_wap_embed_workflow_run: WorkflowRunTable;
  xy_wap_embed_workflow_task: WorkflowTaskTable;
  xy_wap_embed_workflow_trigger_binding: WorkflowTriggerBindingTable;
}
