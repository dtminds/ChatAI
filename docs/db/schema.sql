-- Schema snapshot for the ChatAI backend.
-- The team currently applies database changes manually in the shared test DB.
-- Keep this file synchronized after schema changes.

CREATE TABLE IF NOT EXISTS xy_wap_embed_insight_sync_cursor (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  source VARCHAR(128) NOT NULL,
  tenant_id BIGINT NULL,
  cursor_msgtime BIGINT NOT NULL DEFAULT 0,
  cursor_audit_id BIGINT NOT NULL DEFAULT 0,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_insight_sync_source_tenant (source, tenant_id)
);

CREATE TABLE IF NOT EXISTS xy_wap_embed_sessionization_config (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  preset VARCHAR(32) NOT NULL,
  idle_timeout_minutes INT NOT NULL,
  hard_max_duration_hours INT NOT NULL,
  analysis_delay_minutes INT NOT NULL,
  late_arrival_window_minutes INT NOT NULL,
  enabled TINYINT NOT NULL DEFAULT 1,
  rule_version VARCHAR(64) NOT NULL,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_sessionization_tenant (tenant_id)
);

CREATE TABLE IF NOT EXISTS xy_wap_embed_logical_session (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  conversation_id BIGINT NOT NULL,
  started_at BIGINT NOT NULL,
  ended_at BIGINT NULL,
  last_message_at BIGINT NULL,
  last_meaningful_message_at BIGINT NULL,
  status VARCHAR(32) NOT NULL,
  close_reason VARCHAR(64) NULL,
  rule_version VARCHAR(64) NOT NULL,
  idle_timeout_minutes INT NOT NULL,
  hard_max_duration_hours INT NOT NULL,
  analysis_delay_minutes INT NOT NULL,
  current_snapshot_id BIGINT NULL,
  final_snapshot_id BIGINT NULL,
  message_count INT NOT NULL DEFAULT 0,
  customer_message_count INT NOT NULL DEFAULT 0,
  agent_message_count INT NOT NULL DEFAULT 0,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_logical_session_tenant_conversation_status (tenant_id, conversation_id, status),
  KEY idx_logical_session_status_time (status, last_meaningful_message_at)
);

CREATE TABLE IF NOT EXISTS xy_wap_embed_logical_session_message (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  session_id BIGINT NOT NULL,
  conversation_id BIGINT NOT NULL,
  source_message_id BIGINT NOT NULL,
  source_message_time BIGINT NOT NULL,
  sender_role VARCHAR(32) NOT NULL,
  occurred_at BIGINT NOT NULL,
  message_type VARCHAR(64) NOT NULL,
  included_for_ai TINYINT NOT NULL DEFAULT 1,
  meaningful_for_boundary TINYINT NOT NULL DEFAULT 1,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_session_source_message (session_id, source_message_id),
  KEY idx_session_message_order (session_id, source_message_time, source_message_id),
  KEY idx_session_message_conversation_time (tenant_id, conversation_id, source_message_time),
  KEY idx_session_message_source (source_message_id)
);

CREATE TABLE IF NOT EXISTS xy_wap_embed_insight_job (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  job_type VARCHAR(64) NOT NULL,
  analysis_scope VARCHAR(64) NOT NULL,
  target_type VARCHAR(64) NOT NULL,
  target_id VARCHAR(128) NOT NULL,
  status VARCHAR(32) NOT NULL,
  priority INT NOT NULL DEFAULT 0,
  run_after DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  attempt_count INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  locked_by VARCHAR(128) NULL,
  lease_until DATETIME NULL,
  idempotency_key VARCHAR(191) NOT NULL,
  error_code VARCHAR(128) NULL,
  error_message TEXT NULL,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_insight_job_idempotency (idempotency_key),
  KEY idx_insight_job_runnable (status, run_after, priority),
  KEY idx_insight_job_target (tenant_id, target_type, target_id)
);

CREATE TABLE IF NOT EXISTS xy_wap_embed_analysis_run (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  session_id BIGINT NOT NULL,
  job_id BIGINT NULL,
  mode VARCHAR(32) NOT NULL,
  analysis_scope VARCHAR(64) NOT NULL,
  source_message_from BIGINT NULL,
  source_message_to BIGINT NULL,
  status VARCHAR(32) NOT NULL,
  input_token_count INT NULL,
  output_token_count INT NULL,
  cost_estimate VARCHAR(64) NULL,
  provider_code VARCHAR(64) NULL,
  model_name VARCHAR(128) NULL,
  prompt_version VARCHAR(64) NULL,
  raw_output_ref VARCHAR(512) NULL,
  error_code VARCHAR(128) NULL,
  error_message TEXT NULL,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  finished_at DATETIME NULL,
  KEY idx_analysis_run_session (session_id, create_time),
  KEY idx_analysis_run_job (job_id)
);

CREATE TABLE IF NOT EXISTS xy_wap_embed_session_insight_snapshot (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  session_id BIGINT NOT NULL,
  phase VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL,
  source_message_high_watermark BIGINT NULL,
  analysis_version VARCHAR(64) NOT NULL,
  model_profile_id BIGINT NULL,
  prompt_version VARCHAR(64) NOT NULL,
  rule_version VARCHAR(64) NOT NULL,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_snapshot_session (session_id, create_time)
);

CREATE TABLE IF NOT EXISTS xy_wap_embed_session_insight_current (
  session_id BIGINT PRIMARY KEY,
  current_snapshot_id BIGINT NOT NULL,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS xy_wap_embed_session_summary (
  snapshot_id BIGINT PRIMARY KEY,
  customer_intent TEXT NOT NULL,
  process_summary TEXT NOT NULL,
  result_summary TEXT NOT NULL,
  follow_up TEXT NULL,
  confidence DECIMAL(5,4) NULL
);

CREATE TABLE IF NOT EXISTS xy_wap_embed_session_sentiment (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  snapshot_id BIGINT NOT NULL,
  polarity VARCHAR(32) NOT NULL,
  reason TEXT NOT NULL,
  confidence DECIMAL(5,4) NULL,
  KEY idx_sentiment_snapshot (snapshot_id),
  KEY idx_sentiment_polarity (polarity)
);

CREATE TABLE IF NOT EXISTS xy_wap_embed_session_tag (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  snapshot_id BIGINT NOT NULL,
  tag_code VARCHAR(128) NOT NULL,
  tag_name VARCHAR(128) NOT NULL,
  confidence DECIMAL(5,4) NULL,
  KEY idx_tag_snapshot (snapshot_id),
  KEY idx_tag_code (tag_code)
);

CREATE TABLE IF NOT EXISTS xy_wap_embed_session_problem_resolution (
  snapshot_id BIGINT PRIMARY KEY,
  problem_detected TINYINT NOT NULL,
  problem_summary TEXT NOT NULL,
  resolution_status VARCHAR(32) NOT NULL,
  unresolved_reason TEXT NULL,
  agent_action_summary TEXT NULL,
  customer_final_state TEXT NULL,
  confidence DECIMAL(5,4) NULL
);

CREATE TABLE IF NOT EXISTS xy_wap_embed_session_qa_finding (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  snapshot_id BIGINT NOT NULL,
  rule_code VARCHAR(128) NOT NULL,
  severity VARCHAR(32) NOT NULL,
  passed TINYINT NOT NULL,
  reason TEXT NOT NULL,
  confidence DECIMAL(5,4) NULL,
  KEY idx_qa_snapshot (snapshot_id),
  KEY idx_qa_rule (rule_code, severity)
);

CREATE TABLE IF NOT EXISTS xy_wap_embed_session_risk (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  snapshot_id BIGINT NOT NULL,
  risk_level VARCHAR(32) NOT NULL,
  risk_type VARCHAR(64) NOT NULL,
  reason TEXT NOT NULL,
  confidence DECIMAL(5,4) NULL,
  KEY idx_risk_snapshot (snapshot_id),
  KEY idx_risk_type_level (risk_type, risk_level)
);

CREATE TABLE IF NOT EXISTS xy_wap_embed_session_entity (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  snapshot_id BIGINT NOT NULL,
  entity_id VARCHAR(128) NOT NULL,
  entity_type VARCHAR(64) NOT NULL,
  entity_name VARCHAR(255) NOT NULL,
  sentiment VARCHAR(32) NULL,
  confidence DECIMAL(5,4) NULL,
  KEY idx_session_entity_snapshot (snapshot_id),
  KEY idx_session_entity_identity (entity_type, entity_id)
);

CREATE TABLE IF NOT EXISTS xy_wap_embed_session_intent (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  snapshot_id BIGINT NOT NULL,
  intent_code VARCHAR(128) NOT NULL,
  intent_label VARCHAR(128) NOT NULL,
  confidence DECIMAL(5,4) NULL,
  KEY idx_session_intent_snapshot (snapshot_id),
  KEY idx_session_intent_code (intent_code)
);

CREATE TABLE IF NOT EXISTS xy_wap_embed_session_action_item (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  snapshot_id BIGINT NOT NULL,
  action_type VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  priority VARCHAR(32) NOT NULL,
  due_hint VARCHAR(64) NULL,
  status VARCHAR(32) NOT NULL,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_action_snapshot (snapshot_id),
  KEY idx_action_status_priority (status, priority)
);

CREATE TABLE IF NOT EXISTS xy_wap_embed_session_faq_candidate (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  snapshot_id BIGINT NOT NULL,
  question TEXT NOT NULL,
  answer_hint TEXT NOT NULL,
  status VARCHAR(32) NOT NULL,
  confidence DECIMAL(5,4) NULL,
  KEY idx_faq_snapshot (snapshot_id),
  KEY idx_faq_status (status)
);

CREATE TABLE IF NOT EXISTS xy_wap_embed_insight_evidence (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  snapshot_id BIGINT NOT NULL,
  dimension_type VARCHAR(64) NOT NULL,
  dimension_record_id BIGINT NULL,
  session_id BIGINT NOT NULL,
  conversation_id BIGINT NOT NULL,
  source_message_id BIGINT NOT NULL,
  evidence_role VARCHAR(32) NOT NULL,
  reason TEXT NULL,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_evidence_dimension (snapshot_id, dimension_type, dimension_record_id),
  KEY idx_evidence_session_message (session_id, source_message_id),
  KEY idx_evidence_conversation_message (conversation_id, source_message_id),
  KEY idx_evidence_source_message (source_message_id)
);

CREATE TABLE IF NOT EXISTS xy_wap_embed_insight_analysis_policy (
  tenant_id BIGINT PRIMARY KEY,
  live_analysis_enabled TINYINT NOT NULL DEFAULT 1,
  live_min_new_meaningful_messages INT NOT NULL,
  live_min_interval_minutes INT NOT NULL,
  final_analysis_enabled TINYINT NOT NULL DEFAULT 1,
  rule_fallback_enabled TINYINT NOT NULL DEFAULT 1,
  low_confidence_threshold DECIMAL(5,4) NOT NULL,
  enabled TINYINT NOT NULL DEFAULT 1,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS xy_wap_embed_insight_label_config (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  label_code VARCHAR(128) NOT NULL,
  label_name VARCHAR(128) NOT NULL,
  description TEXT NULL,
  positive_examples_json JSON NULL,
  negative_examples_json JSON NULL,
  enabled TINYINT NOT NULL DEFAULT 1,
  include_in_statistics TINYINT NOT NULL DEFAULT 1,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_label_tenant_code (tenant_id, label_code)
);

CREATE TABLE IF NOT EXISTS xy_wap_embed_insight_qa_rule_config (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  rule_code VARCHAR(128) NOT NULL,
  rule_name VARCHAR(128) NOT NULL,
  description TEXT NULL,
  severity VARCHAR(32) NOT NULL,
  applicable_scene VARCHAR(128) NULL,
  judgment_criteria TEXT NULL,
  positive_examples_json JSON NULL,
  negative_examples_json JSON NULL,
  enabled TINYINT NOT NULL DEFAULT 1,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_qa_rule_tenant_code (tenant_id, rule_code)
);

CREATE TABLE IF NOT EXISTS xy_wap_embed_insight_risk_config (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  risk_code VARCHAR(128) NOT NULL,
  risk_name VARCHAR(128) NOT NULL,
  description TEXT NULL,
  severity VARCHAR(32) NOT NULL,
  keywords_json JSON NULL,
  priority_boost INT NOT NULL DEFAULT 0,
  unresolved_timeout_minutes INT NULL,
  enabled TINYINT NOT NULL DEFAULT 1,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_risk_tenant_code (tenant_id, risk_code)
);

CREATE TABLE IF NOT EXISTS xy_wap_embed_insight_entity_dictionary (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  entity_type VARCHAR(64) NOT NULL,
  canonical_name VARCHAR(255) NOT NULL,
  aliases_json JSON NULL,
  attributes_json JSON NULL,
  enabled TINYINT NOT NULL DEFAULT 1,
  include_in_aggregation TINYINT NOT NULL DEFAULT 1,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_entity_dictionary_tenant_type (tenant_id, entity_type)
);

CREATE TABLE IF NOT EXISTS xy_wap_embed_model_provider (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  provider_code VARCHAR(64) NOT NULL,
  display_name VARCHAR(128) NOT NULL,
  base_url VARCHAR(512) NOT NULL,
  enabled TINYINT NOT NULL DEFAULT 1,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_model_provider_code (provider_code)
);

CREATE TABLE IF NOT EXISTS xy_wap_embed_model_profile (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NULL,
  task_type VARCHAR(64) NOT NULL,
  provider_id BIGINT NOT NULL,
  model_name VARCHAR(128) NOT NULL,
  temperature DECIMAL(4,3) NOT NULL,
  max_output_tokens INT NOT NULL,
  timeout_ms INT NOT NULL,
  retry_count INT NOT NULL,
  prompt_version VARCHAR(64) NOT NULL,
  enabled TINYINT NOT NULL DEFAULT 1,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_model_profile_task_tenant (task_type, tenant_id)
);
