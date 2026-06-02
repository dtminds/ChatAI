-- Schema snapshot for the ChatAI backend.
-- The team currently applies database changes manually in the shared test DB.
-- Keep this file synchronized after schema changes.

CREATE TABLE IF NOT EXISTS xy_wap_embed_insight_sync_cursor (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
  source VARCHAR(128) NOT NULL COMMENT '同步源名称',
  uid BIGINT UNSIGNED NULL COMMENT '租户ID，为空表示全局水位',
  cursor_msgtime BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '当前同步到的平台消息时间戳',
  cursor_audit_id BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '当前同步到的平台消息ID',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  UNIQUE KEY uk_insight_sync_source_uid (source, uid)
) COMMENT='会话洞察消息同步水位表';

CREATE TABLE IF NOT EXISTS xy_wap_embed_sessionization_config (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
  uid BIGINT UNSIGNED NOT NULL COMMENT '租户ID',
  preset VARCHAR(32) NOT NULL COMMENT '切片预设类型',
  idle_timeout_minutes INT UNSIGNED NOT NULL COMMENT '空闲关闭时长，单位分钟',
  hard_max_duration_hours INT UNSIGNED NOT NULL COMMENT '逻辑会话最长持续时长，单位小时',
  analysis_delay_minutes INT UNSIGNED NOT NULL COMMENT '关闭后延迟分析时长，单位分钟',
  late_arrival_window_minutes INT UNSIGNED NOT NULL COMMENT '迟到消息窗口，单位分钟',
  enabled TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '是否启用，1启用0禁用',
  rule_version VARCHAR(64) NOT NULL COMMENT '切片规则版本',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  UNIQUE KEY uk_sessionization_uid (uid)
) COMMENT='会话洞察逻辑会话切片配置表';

CREATE TABLE IF NOT EXISTS xy_wap_embed_logical_session (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
  uid BIGINT UNSIGNED NOT NULL COMMENT '租户ID',
  conversation_id BIGINT UNSIGNED NOT NULL COMMENT '平台会话ID，关联xy_wap_embed_conversation.id',
  started_at BIGINT UNSIGNED NOT NULL COMMENT '逻辑会话开始时间戳',
  ended_at BIGINT UNSIGNED NULL COMMENT '逻辑会话结束时间戳',
  last_message_at BIGINT UNSIGNED NULL COMMENT '最后一条消息时间戳',
  last_meaningful_message_at BIGINT UNSIGNED NULL COMMENT '最后一条有效边界消息时间戳',
  status VARCHAR(32) NOT NULL COMMENT '逻辑会话状态',
  close_reason VARCHAR(64) NULL COMMENT '逻辑会话关闭原因',
  rule_version VARCHAR(64) NOT NULL COMMENT '切片规则版本',
  idle_timeout_minutes INT UNSIGNED NOT NULL COMMENT '创建时使用的空闲关闭时长',
  hard_max_duration_hours INT UNSIGNED NOT NULL COMMENT '创建时使用的最长持续时长',
  analysis_delay_minutes INT UNSIGNED NOT NULL COMMENT '创建时使用的延迟分析时长',
  current_snapshot_id BIGINT UNSIGNED NULL COMMENT '当前生效洞察快照ID',
  final_snapshot_id BIGINT UNSIGNED NULL COMMENT '最终洞察快照ID',
  message_count INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '消息总数',
  customer_message_count INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '客户消息数',
  agent_message_count INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '客服消息数',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  KEY idx_logical_session_uid_conversation_status (uid, conversation_id, status),
  KEY idx_logical_session_status_time (status, last_meaningful_message_at)
) COMMENT='会话洞察逻辑会话表';

CREATE TABLE IF NOT EXISTS xy_wap_embed_logical_session_message (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
  uid BIGINT UNSIGNED NOT NULL COMMENT '租户ID',
  session_id BIGINT UNSIGNED NOT NULL COMMENT '逻辑会话ID',
  conversation_id BIGINT UNSIGNED NOT NULL COMMENT '平台会话ID',
  source_message_id BIGINT UNSIGNED NOT NULL COMMENT '平台消息ID，关联xy_wap_embed_msg_audit_info.id',
  source_message_time BIGINT UNSIGNED NOT NULL COMMENT '平台消息发送时间戳',
  sender_role VARCHAR(32) NOT NULL COMMENT '发送方角色',
  occurred_at BIGINT UNSIGNED NOT NULL COMMENT '消息发生时间戳',
  message_type VARCHAR(64) NOT NULL COMMENT '标准化消息类型',
  included_for_ai TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '是否进入AI上下文，1是0否',
  meaningful_for_boundary TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '是否参与切片边界判断，1是0否',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  UNIQUE KEY uk_session_source_message (session_id, source_message_id),
  KEY idx_session_message_order (session_id, source_message_time, source_message_id),
  KEY idx_session_message_conversation_time (uid, conversation_id, source_message_time),
  KEY idx_session_message_source (source_message_id)
) COMMENT='逻辑会话消息归属表';

CREATE TABLE IF NOT EXISTS xy_wap_embed_insight_job (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
  uid BIGINT UNSIGNED NOT NULL COMMENT '租户ID',
  job_type VARCHAR(64) NOT NULL COMMENT '任务类型',
  analysis_scope VARCHAR(64) NOT NULL COMMENT '分析范围',
  target_type VARCHAR(64) NOT NULL COMMENT '任务目标类型',
  target_id VARCHAR(128) NOT NULL COMMENT '任务目标ID',
  status VARCHAR(32) NOT NULL COMMENT '任务状态',
  priority INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '任务优先级',
  run_after DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '最早执行时间',
  attempt_count INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '已尝试次数',
  max_attempts INT UNSIGNED NOT NULL DEFAULT 3 COMMENT '最大尝试次数',
  locked_by VARCHAR(128) NULL COMMENT '任务锁持有者',
  lease_until DATETIME NULL COMMENT '任务租约到期时间',
  idempotency_key VARCHAR(191) NOT NULL COMMENT '幂等键',
  error_code VARCHAR(128) NULL COMMENT '错误码',
  error_message VARCHAR(1024) NULL COMMENT '错误信息',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  UNIQUE KEY uk_insight_job_idempotency (idempotency_key),
  KEY idx_insight_job_runnable (status, run_after, priority),
  KEY idx_insight_job_target (uid, target_type, target_id)
) COMMENT='会话洞察异步任务表';

CREATE TABLE IF NOT EXISTS xy_wap_embed_analysis_run (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
  session_id BIGINT UNSIGNED NOT NULL COMMENT '逻辑会话ID',
  job_id BIGINT UNSIGNED NULL COMMENT '关联任务ID',
  mode VARCHAR(32) NOT NULL COMMENT '分析模式',
  analysis_scope VARCHAR(64) NOT NULL COMMENT '分析范围',
  source_message_from BIGINT UNSIGNED NULL COMMENT '输入消息起始ID',
  source_message_to BIGINT UNSIGNED NULL COMMENT '输入消息结束ID',
  status VARCHAR(32) NOT NULL COMMENT '运行状态',
  input_token_count INT UNSIGNED NULL COMMENT '输入token数',
  output_token_count INT UNSIGNED NULL COMMENT '输出token数',
  cost_estimate VARCHAR(64) NULL COMMENT '成本估算',
  provider_code VARCHAR(64) NULL COMMENT '模型服务商编码',
  model_name VARCHAR(128) NULL COMMENT '模型名称',
  prompt_version VARCHAR(64) NULL COMMENT '提示词版本',
  raw_output_ref VARCHAR(512) NULL COMMENT '原始输出引用',
  error_code VARCHAR(128) NULL COMMENT '错误码',
  error_message VARCHAR(1024) NULL COMMENT '错误信息',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  finished_at DATETIME NULL COMMENT '完成时间',
  KEY idx_analysis_run_session (session_id, create_time),
  KEY idx_analysis_run_job (job_id)
) COMMENT='会话洞察模型分析运行记录表';

CREATE TABLE IF NOT EXISTS xy_wap_embed_session_insight_snapshot (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
  session_id BIGINT UNSIGNED NOT NULL COMMENT '逻辑会话ID',
  phase VARCHAR(32) NOT NULL COMMENT '分析阶段',
  status VARCHAR(32) NOT NULL COMMENT '快照状态',
  source_message_high_watermark BIGINT UNSIGNED NULL COMMENT '输入消息高水位ID',
  analysis_version VARCHAR(64) NOT NULL COMMENT '分析逻辑版本',
  model_profile_id BIGINT UNSIGNED NULL COMMENT '模型配置ID',
  prompt_version VARCHAR(64) NOT NULL COMMENT '提示词版本',
  rule_version VARCHAR(64) NOT NULL COMMENT '规则版本',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  KEY idx_snapshot_session (session_id, create_time)
) COMMENT='逻辑会话洞察快照表';

CREATE TABLE IF NOT EXISTS xy_wap_embed_session_insight_current (
  session_id BIGINT UNSIGNED PRIMARY KEY COMMENT '逻辑会话ID',
  current_snapshot_id BIGINT UNSIGNED NOT NULL COMMENT '当前生效快照ID',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
) COMMENT='逻辑会话当前洞察快照指针表';

CREATE TABLE IF NOT EXISTS xy_wap_embed_session_summary (
  snapshot_id BIGINT UNSIGNED PRIMARY KEY COMMENT '洞察快照ID',
  customer_intent VARCHAR(2048) NOT NULL COMMENT '客户诉求摘要',
  process_summary VARCHAR(2048) NOT NULL COMMENT '处理过程摘要',
  result_summary VARCHAR(2048) NOT NULL COMMENT '当前结果摘要',
  follow_up VARCHAR(2048) NULL COMMENT '跟进建议',
  confidence DECIMAL(5,4) NULL COMMENT '置信度',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
) COMMENT='逻辑会话摘要结果表';

CREATE TABLE IF NOT EXISTS xy_wap_embed_session_sentiment (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
  snapshot_id BIGINT UNSIGNED NOT NULL COMMENT '洞察快照ID',
  polarity VARCHAR(32) NOT NULL COMMENT '情绪极性',
  reason VARCHAR(1024) NOT NULL COMMENT '情绪判断理由',
  confidence DECIMAL(5,4) NULL COMMENT '置信度',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  KEY idx_sentiment_snapshot (snapshot_id),
  KEY idx_sentiment_polarity (polarity)
) COMMENT='逻辑会话情绪分析结果表';

CREATE TABLE IF NOT EXISTS xy_wap_embed_session_tag (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
  snapshot_id BIGINT UNSIGNED NOT NULL COMMENT '洞察快照ID',
  tag_code VARCHAR(128) NOT NULL COMMENT '标签编码',
  tag_name VARCHAR(128) NOT NULL COMMENT '标签名称',
  confidence DECIMAL(5,4) NULL COMMENT '置信度',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  KEY idx_tag_snapshot (snapshot_id),
  KEY idx_tag_code (tag_code)
) COMMENT='逻辑会话标签结果表';

CREATE TABLE IF NOT EXISTS xy_wap_embed_session_problem_resolution (
  snapshot_id BIGINT UNSIGNED PRIMARY KEY COMMENT '洞察快照ID',
  problem_detected TINYINT UNSIGNED NOT NULL COMMENT '是否识别到客户问题，1是0否',
  problem_summary VARCHAR(2048) NOT NULL COMMENT '客户问题摘要',
  resolution_status VARCHAR(32) NOT NULL COMMENT '问题解决状态',
  unresolved_reason VARCHAR(2048) NULL COMMENT '未解决或部分解决原因',
  agent_action_summary VARCHAR(2048) NULL COMMENT '客服动作摘要',
  customer_final_state VARCHAR(2048) NULL COMMENT '客户最终状态',
  confidence DECIMAL(5,4) NULL COMMENT '置信度',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
) COMMENT='客户问题解决判定结果表';

CREATE TABLE IF NOT EXISTS xy_wap_embed_session_qa_finding (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
  snapshot_id BIGINT UNSIGNED NOT NULL COMMENT '洞察快照ID',
  rule_code VARCHAR(128) NOT NULL COMMENT '质检规则编码',
  severity VARCHAR(32) NOT NULL COMMENT '严重程度',
  passed TINYINT UNSIGNED NOT NULL COMMENT '是否通过，1通过0未通过',
  reason VARCHAR(1024) NOT NULL COMMENT '判定理由',
  confidence DECIMAL(5,4) NULL COMMENT '置信度',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  KEY idx_qa_snapshot (snapshot_id),
  KEY idx_qa_rule (rule_code, severity)
) COMMENT='逻辑会话质检命中结果表';

CREATE TABLE IF NOT EXISTS xy_wap_embed_session_risk (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
  snapshot_id BIGINT UNSIGNED NOT NULL COMMENT '洞察快照ID',
  risk_level VARCHAR(32) NOT NULL COMMENT '风险等级',
  risk_type VARCHAR(64) NOT NULL COMMENT '风险类型',
  reason VARCHAR(1024) NOT NULL COMMENT '风险理由',
  confidence DECIMAL(5,4) NULL COMMENT '置信度',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  KEY idx_risk_snapshot (snapshot_id),
  KEY idx_risk_type_level (risk_type, risk_level)
) COMMENT='逻辑会话风险结果表';

CREATE TABLE IF NOT EXISTS xy_wap_embed_session_entity (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
  snapshot_id BIGINT UNSIGNED NOT NULL COMMENT '洞察快照ID',
  entity_id VARCHAR(128) NOT NULL COMMENT '实体稳定ID',
  entity_type VARCHAR(64) NOT NULL COMMENT '实体类型',
  entity_name VARCHAR(255) NOT NULL COMMENT '实体展示名称',
  sentiment VARCHAR(32) NULL COMMENT '实体相关情绪',
  confidence DECIMAL(5,4) NULL COMMENT '置信度',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  KEY idx_session_entity_snapshot (snapshot_id),
  KEY idx_session_entity_identity (entity_type, entity_id)
) COMMENT='逻辑会话实体结果表';

CREATE TABLE IF NOT EXISTS xy_wap_embed_session_intent (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
  snapshot_id BIGINT UNSIGNED NOT NULL COMMENT '洞察快照ID',
  intent_code VARCHAR(128) NOT NULL COMMENT '意图编码',
  intent_label VARCHAR(128) NOT NULL COMMENT '意图名称',
  confidence DECIMAL(5,4) NULL COMMENT '置信度',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  KEY idx_session_intent_snapshot (snapshot_id),
  KEY idx_session_intent_code (intent_code)
) COMMENT='逻辑会话意图结果表';

CREATE TABLE IF NOT EXISTS xy_wap_embed_session_action_item (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
  snapshot_id BIGINT UNSIGNED NOT NULL COMMENT '洞察快照ID',
  action_type VARCHAR(64) NOT NULL COMMENT '行动项类型',
  title VARCHAR(255) NOT NULL COMMENT '行动项标题',
  priority VARCHAR(32) NOT NULL COMMENT '优先级',
  due_hint VARCHAR(64) NULL COMMENT '时效提示',
  status VARCHAR(32) NOT NULL COMMENT '处理状态',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  KEY idx_action_snapshot (snapshot_id),
  KEY idx_action_status_priority (status, priority)
) COMMENT='逻辑会话待处理行动项表';

CREATE TABLE IF NOT EXISTS xy_wap_embed_session_faq_candidate (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
  snapshot_id BIGINT UNSIGNED NOT NULL COMMENT '洞察快照ID',
  question VARCHAR(1024) NOT NULL COMMENT '候选问题',
  answer_hint VARCHAR(2048) NOT NULL COMMENT '答案建议',
  status VARCHAR(32) NOT NULL COMMENT '候选状态',
  confidence DECIMAL(5,4) NULL COMMENT '置信度',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  KEY idx_faq_snapshot (snapshot_id),
  KEY idx_faq_status (status)
) COMMENT='FAQ机会候选结果表';

CREATE TABLE IF NOT EXISTS xy_wap_embed_insight_evidence (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
  uid BIGINT UNSIGNED NOT NULL COMMENT '租户ID',
  snapshot_id BIGINT UNSIGNED NOT NULL COMMENT '洞察快照ID',
  dimension_type VARCHAR(64) NOT NULL COMMENT '结论维度类型',
  dimension_record_id BIGINT UNSIGNED NULL COMMENT '结论记录ID',
  session_id BIGINT UNSIGNED NOT NULL COMMENT '逻辑会话ID',
  conversation_id BIGINT UNSIGNED NOT NULL COMMENT '平台会话ID',
  source_message_id BIGINT UNSIGNED NOT NULL COMMENT '平台消息ID',
  evidence_role VARCHAR(32) NOT NULL COMMENT '证据角色',
  reason VARCHAR(512) NULL COMMENT '证据说明',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  KEY idx_evidence_dimension (snapshot_id, dimension_type, dimension_record_id),
  KEY idx_evidence_session_message (session_id, source_message_id),
  KEY idx_evidence_conversation_message (conversation_id, source_message_id),
  KEY idx_evidence_source_message (source_message_id)
) COMMENT='会话洞察证据消息关联表';

CREATE TABLE IF NOT EXISTS xy_wap_embed_insight_analysis_policy (
  uid BIGINT UNSIGNED PRIMARY KEY COMMENT '租户ID',
  live_analysis_enabled TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '是否启用实时分析',
  live_min_new_meaningful_messages INT UNSIGNED NOT NULL COMMENT '触发实时分析的最少新增有效消息数',
  live_min_interval_minutes INT UNSIGNED NOT NULL COMMENT '实时分析最小间隔分钟数',
  final_analysis_enabled TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '是否启用最终分析',
  rule_fallback_enabled TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '是否启用规则降级',
  low_confidence_threshold DECIMAL(5,4) NOT NULL COMMENT '低置信度阈值',
  enabled TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '是否启用，1启用0禁用',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
) COMMENT='会话洞察分析策略配置表';

CREATE TABLE IF NOT EXISTS xy_wap_embed_insight_label_config (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
  uid BIGINT UNSIGNED NOT NULL COMMENT '租户ID',
  label_code VARCHAR(128) NOT NULL COMMENT '标签编码',
  label_name VARCHAR(128) NOT NULL COMMENT '标签名称',
  description VARCHAR(512) NULL COMMENT '标签说明',
  positive_examples_json JSON NULL COMMENT '正例JSON',
  negative_examples_json JSON NULL COMMENT '反例JSON',
  enabled TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '是否启用，1启用0禁用',
  include_in_statistics TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '是否纳入统计，1是0否',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  UNIQUE KEY uk_label_uid_code (uid, label_code)
) COMMENT='会话洞察标签配置表';

CREATE TABLE IF NOT EXISTS xy_wap_embed_insight_qa_rule_config (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
  uid BIGINT UNSIGNED NOT NULL COMMENT '租户ID',
  rule_code VARCHAR(128) NOT NULL COMMENT '规则编码',
  rule_name VARCHAR(128) NOT NULL COMMENT '规则名称',
  description VARCHAR(512) NULL COMMENT '规则说明',
  severity VARCHAR(32) NOT NULL COMMENT '严重程度',
  applicable_scene VARCHAR(128) NULL COMMENT '适用场景',
  judgment_criteria VARCHAR(2048) NULL COMMENT '判定标准',
  positive_examples_json JSON NULL COMMENT '正例JSON',
  negative_examples_json JSON NULL COMMENT '反例JSON',
  enabled TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '是否启用，1启用0禁用',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  UNIQUE KEY uk_qa_rule_uid_code (uid, rule_code)
) COMMENT='会话洞察质检规则配置表';

CREATE TABLE IF NOT EXISTS xy_wap_embed_insight_entity_dictionary (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
  uid BIGINT UNSIGNED NOT NULL COMMENT '租户ID',
  entity_type VARCHAR(64) NOT NULL COMMENT '实体类型',
  canonical_name VARCHAR(255) NOT NULL COMMENT '实体标准名称',
  aliases_json JSON NULL COMMENT '别名JSON',
  attributes_json JSON NULL COMMENT '属性JSON',
  enabled TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '是否启用，1启用0禁用',
  include_in_aggregation TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '是否纳入聚合，1是0否',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  KEY idx_entity_dictionary_uid_type (uid, entity_type)
) COMMENT='会话洞察实体词库配置表';

CREATE TABLE IF NOT EXISTS xy_wap_embed_model_provider (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
  provider_code VARCHAR(64) NOT NULL COMMENT '服务商编码',
  display_name VARCHAR(128) NOT NULL COMMENT '服务商展示名称',
  base_url VARCHAR(512) NOT NULL COMMENT '模型API基础地址',
  enabled TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '是否启用，1启用0禁用',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  UNIQUE KEY uk_model_provider_code (provider_code)
) COMMENT='大模型服务商配置表';

CREATE TABLE IF NOT EXISTS xy_wap_embed_model_profile (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
  uid BIGINT UNSIGNED NULL COMMENT '租户ID，为空表示全局配置',
  task_type VARCHAR(64) NOT NULL COMMENT '任务类型',
  provider_id BIGINT UNSIGNED NOT NULL COMMENT '模型服务商ID',
  model_name VARCHAR(128) NOT NULL COMMENT '模型名称',
  temperature DECIMAL(4,3) NOT NULL COMMENT '采样温度',
  max_output_tokens INT UNSIGNED NOT NULL COMMENT '最大输出token数',
  timeout_ms INT UNSIGNED NOT NULL COMMENT '调用超时时间，单位毫秒',
  retry_count INT UNSIGNED NOT NULL COMMENT '重试次数',
  prompt_version VARCHAR(64) NOT NULL COMMENT '提示词版本',
  enabled TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '是否启用，1启用0禁用',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  KEY idx_model_profile_task_uid (task_type, uid)
) COMMENT='会话洞察模型调用配置表';
