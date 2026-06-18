-- Schema snapshot for the ChatAI backend.
-- The team currently applies database changes manually in the shared test DB.
-- Keep this file synchronized after schema changes.
-- Only document Node-owned writable tables from apps/backend/src/db/writable-tables.ts.
-- Platform-owned xy_wap_embed_* tables outside that whitelist remain read-only here.

CREATE TABLE IF NOT EXISTS xy_wap_embed_insight_sync_cursor (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  source VARCHAR(128) NOT NULL COMMENT '同步源名称',
  uid BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '租户ID，0表示全局水位',
  cursor_msgtime BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '当前同步到的平台消息时间戳',
  cursor_audit_id BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '当前同步到的平台消息ID',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_insight_sync_source_uid (source, uid)
) COMMENT='会话洞察消息同步水位表';

CREATE TABLE IF NOT EXISTS xy_wap_embed_insight_feature_config (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  uid BIGINT UNSIGNED NOT NULL COMMENT '租户ID',
  insight_enabled TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '是否启用会话洞察总开关，1启用0停用',
  todo_enabled TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '是否自动创建待办，1启用0停用',
  intent_enabled TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '是否抽取意图，1启用0停用',
  qa_enabled TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '是否进行质检，1启用0停用',
  entity_enabled TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '是否抽取实体，1启用0停用',
  label_enabled TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '是否抽取标签，1启用0停用',
  last_enable_time BIGINT UNSIGNED NULL COMMENT '最近一次启用会话洞察的时间戳',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_insight_feature_config_uid (uid)
) COMMENT='会话洞察租户能力开关配置表';

CREATE TABLE IF NOT EXISTS xy_wap_embed_sessionization_config (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  uid BIGINT UNSIGNED NOT NULL COMMENT '租户ID',
  preset VARCHAR(32) NOT NULL COMMENT '切片预设类型，realtime_service：实时客服，private_domain：私域运营，custom：自定义',
  idle_timeout_minutes INT UNSIGNED NOT NULL COMMENT '空闲关闭时长，单位分钟',
  hard_max_duration_hours INT UNSIGNED NOT NULL COMMENT '逻辑会话最长持续时长，单位小时',
  analysis_delay_minutes INT UNSIGNED NOT NULL COMMENT '关闭后延迟分析时长，单位分钟',
  late_arrival_window_minutes INT UNSIGNED NOT NULL COMMENT '迟到消息窗口，单位分钟',
  enabled TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '是否启用，1启用0禁用',
  rule_version VARCHAR(64) NOT NULL COMMENT '切片规则版本',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_sessionization_uid (uid)
) COMMENT='会话洞察逻辑会话切片配置表';

CREATE TABLE IF NOT EXISTS xy_wap_embed_logical_session (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  uid BIGINT UNSIGNED NOT NULL COMMENT '租户ID',
  conversation_id BIGINT UNSIGNED NOT NULL COMMENT '平台会话ID，关联xy_wap_embed_conversation.id',
  third_userid VARCHAR(128) NOT NULL COMMENT '第三方成员id',
  third_external_userid VARCHAR(128) NOT NULL COMMENT '第三方用户id',
  started_at BIGINT UNSIGNED NOT NULL COMMENT '逻辑会话开始时间戳',
  ended_at BIGINT UNSIGNED NULL COMMENT '逻辑会话结束时间戳',
  last_message_at BIGINT UNSIGNED NULL COMMENT '最后一条消息时间戳',
  last_meaningful_message_at BIGINT UNSIGNED NULL COMMENT '最后一条有效边界消息时间戳',
  next_close_at BIGINT UNSIGNED NULL COMMENT '下一次可关闭检查时间戳',
  status VARCHAR(32) NOT NULL COMMENT '逻辑会话状态，open：进行中，canceled：洞察关闭暂停，closed_pending_analysis：待最终分析，analyzed：已分析',
  close_reason VARCHAR(64) NULL COMMENT '逻辑会话关闭原因，idle_timeout：空闲超时，hard_max_duration：达到最长持续时长，insight_disabled：洞察关闭',
  rule_version VARCHAR(64) NOT NULL COMMENT '切片规则版本',
  idle_timeout_minutes INT UNSIGNED NOT NULL COMMENT '创建时使用的空闲关闭时长',
  hard_max_duration_hours INT UNSIGNED NOT NULL COMMENT '创建时使用的最长持续时长',
  analysis_delay_minutes INT UNSIGNED NOT NULL COMMENT '创建时使用的延迟分析时长',
  current_snapshot_id BIGINT UNSIGNED NULL COMMENT '当前生效洞察快照ID，关联xy_wap_embed_session_insight_snapshot.id',
  qa_status TINYINT NOT NULL DEFAULT -1 COMMENT '质检状态，-1未质检，0有未通过，1全部通过',
  message_count INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '消息总数',
  customer_message_count INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '客户消息数',
  agent_message_count INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '客服消息数',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  KEY idx_logical_session_uid_conversation_status (uid, conversation_id, status),
  KEY idx_logical_session_uid_agent_started (uid, third_userid, started_at, id),
  KEY idx_logical_session_status_next_close (status, next_close_at),
  KEY idx_logical_session_uid_open_live (uid, status, last_message_at, id),
  KEY idx_logical_session_uid_started (uid, started_at),
  KEY idx_logical_session_uid_qa_status_started (uid, qa_status, started_at, id),
  KEY idx_logical_session_current_snapshot (current_snapshot_id, id)
) COMMENT='会话洞察逻辑会话表';

CREATE TABLE IF NOT EXISTS xy_wap_embed_logical_session_message (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  uid BIGINT UNSIGNED NOT NULL COMMENT '租户ID',
  session_id BIGINT UNSIGNED NOT NULL COMMENT '逻辑会话ID',
  conversation_id BIGINT UNSIGNED NOT NULL COMMENT '平台会话ID',
  source_message_id BIGINT UNSIGNED NOT NULL COMMENT '平台消息ID，关联xy_wap_embed_msg_audit_info.id',
  source_message_time BIGINT UNSIGNED NOT NULL COMMENT '平台消息发送时间戳',
  sender_role VARCHAR(32) NOT NULL COMMENT '发送方角色，customer：客户，agent：客服，system：系统，bot：机器人，unknown：未知',
  occurred_at BIGINT UNSIGNED NOT NULL COMMENT '消息发生时间戳',
  message_type VARCHAR(64) NOT NULL COMMENT '标准化消息类型，text：文本，voice：语音，file：文件，link：链接，miniapp：小程序，image：图片，system：系统，unsupported：暂不支持',
  asset_id BIGINT UNSIGNED NULL COMMENT '资产ID，关联xy_wap_embed_insight_asset.id；非链接/文件/小程序消息为空',
  asset_type VARCHAR(32) NULL COMMENT '资产类型，link：链接，miniapp：小程序，file：文件；非资产消息为空',
  included_for_ai TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '是否进入AI上下文，1是0否',
  meaningful_for_boundary TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '是否参与切片边界判断，1是0否',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_session_message_source_uid (uid, source_message_id),
  KEY idx_session_message_order (session_id, source_message_time, source_message_id),
  KEY idx_session_message_asset_lookup (uid, asset_id, source_message_time, session_id),
  KEY idx_session_message_asset_window (uid, source_message_time, asset_id, session_id),
  KEY idx_session_message_ai_count (session_id, included_for_ai, meaningful_for_boundary, source_message_id)
) COMMENT='逻辑会话消息归属表';

CREATE TABLE IF NOT EXISTS xy_wap_embed_insight_asset (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  uid BIGINT UNSIGNED NOT NULL COMMENT '租户ID',
  asset_type VARCHAR(32) NOT NULL COMMENT '资产类型，link：链接，miniapp：小程序，file：文件',
  asset_key VARCHAR(512) NOT NULL COMMENT '资产稳定唯一键，链接为规范化URL，小程序为appId+pagePath，文件为fileId/fileUrl/fileName兜底',
  asset_name VARCHAR(512) NOT NULL COMMENT '资产展示名称',
  first_seen_at BIGINT UNSIGNED NOT NULL COMMENT '首次出现的平台消息时间戳',
  last_seen_at BIGINT UNSIGNED NOT NULL COMMENT '最近出现的平台消息时间戳',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_insight_asset_uid_type_key (uid, asset_type, asset_key)
) COMMENT='会话洞察资产表';

CREATE TABLE IF NOT EXISTS xy_wap_embed_insight_job (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  uid BIGINT UNSIGNED NOT NULL COMMENT '租户ID',
  rescan_task_id BIGINT UNSIGNED NULL COMMENT '历史重刷任务ID',
  job_type VARCHAR(64) NOT NULL COMMENT '任务类型，maintain_insight_uid：维护启用洞察租户，sync_messages：同步消息，analyze_session：分析会话，reanalyze_session：重分析会话，cleanup_disabled_insights：清理已关闭洞察会话',
  analysis_scope VARCHAR(64) NOT NULL COMMENT '分析范围，all：全部，qaFindings：质检，classification：分类',
  target_type VARCHAR(64) NOT NULL COMMENT '任务目标类型，uid：租户，logical_session：逻辑会话',
  target_id VARCHAR(128) NOT NULL COMMENT '任务目标ID',
  status VARCHAR(32) NOT NULL COMMENT '任务状态，pending：待执行，running：执行中，succeeded：成功，failed：失败',
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
  PRIMARY KEY (id),
  UNIQUE KEY uk_insight_job_idempotency (idempotency_key),
  KEY idx_insight_job_claim (target_type, job_type, status, run_after ASC, priority DESC, id ASC),
  KEY idx_insight_job_expired_lease (status, lease_until, id),
  KEY idx_insight_job_rescan_task (rescan_task_id),
  KEY idx_insight_job_target (uid, target_type, target_id)
) COMMENT='会话洞察异步任务表';

CREATE TABLE IF NOT EXISTS xy_wap_embed_insight_job_archive (
  id BIGINT UNSIGNED NOT NULL COMMENT '原任务主键ID',
  uid BIGINT UNSIGNED NOT NULL COMMENT '租户ID',
  rescan_task_id BIGINT UNSIGNED NULL COMMENT '历史重刷任务ID',
  job_type VARCHAR(64) NOT NULL COMMENT '任务类型，maintain_insight_uid：维护启用洞察租户，sync_messages：同步消息，analyze_session：分析会话，reanalyze_session：重分析会话，cleanup_disabled_insights：清理已关闭洞察会话',
  analysis_scope VARCHAR(64) NOT NULL COMMENT '分析范围，all：全部，qaFindings：质检，classification：分类',
  target_type VARCHAR(64) NOT NULL COMMENT '任务目标类型，uid：租户，logical_session：逻辑会话',
  target_id VARCHAR(128) NOT NULL COMMENT '任务目标ID',
  status VARCHAR(32) NOT NULL COMMENT '任务状态，pending：待执行，running：执行中，succeeded：成功，failed：失败',
  priority INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '任务优先级',
  run_after DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '最早执行时间',
  attempt_count INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '已尝试次数',
  max_attempts INT UNSIGNED NOT NULL DEFAULT 3 COMMENT '最大尝试次数',
  locked_by VARCHAR(128) NULL COMMENT '任务锁持有者',
  lease_until DATETIME NULL COMMENT '任务租约到期时间',
  idempotency_key VARCHAR(191) NOT NULL COMMENT '幂等键',
  error_code VARCHAR(128) NULL COMMENT '错误码',
  error_message VARCHAR(1024) NULL COMMENT '错误信息',
  create_time DATETIME NOT NULL COMMENT '原任务创建时间',
  update_time DATETIME NOT NULL COMMENT '原任务更新时间',
  archived_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '归档时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_insight_job_archive_idempotency (idempotency_key),
  KEY idx_insight_job_archive_uid_time (uid, update_time),
  KEY idx_insight_job_archive_status_time (status, update_time),
  KEY idx_insight_job_archive_rescan_task (rescan_task_id)
) COMMENT='会话洞察异步任务归档表';

CREATE TABLE IF NOT EXISTS xy_wap_embed_insight_rescan_task (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  uid BIGINT UNSIGNED NOT NULL COMMENT '租户ID',
  created_by VARCHAR(128) NULL COMMENT '创建人展示名或ID',
  from_time BIGINT UNSIGNED NOT NULL COMMENT '重刷起始消息时间戳',
  to_time BIGINT UNSIGNED NULL COMMENT '重刷结束消息时间戳',
  analysis_scope VARCHAR(64) NOT NULL COMMENT '重刷范围，all：全部，qaFindings：质检，classification：分类',
  status VARCHAR(32) NOT NULL COMMENT '任务状态，pending：待执行，running：执行中，succeeded：成功，partial：部分成功，failed：失败',
  total_sessions INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '需重刷会话数',
  queued_sessions INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '已入队会话数',
  succeeded_sessions INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '成功会话数',
  failed_sessions INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '失败会话数',
  started_at DATETIME NULL COMMENT '开始时间',
  finished_at DATETIME NULL COMMENT '完成时间',
  error_message VARCHAR(1024) NULL COMMENT '错误信息',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  KEY idx_insight_rescan_task_uid_time (uid, create_time),
  KEY idx_insight_rescan_task_uid_status (uid, status)
) COMMENT='会话洞察历史重刷任务表';

CREATE TABLE IF NOT EXISTS xy_wap_embed_analysis_run (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  session_id BIGINT UNSIGNED NOT NULL COMMENT '逻辑会话ID',
  job_id BIGINT UNSIGNED NULL COMMENT '关联任务ID',
  mode VARCHAR(32) NOT NULL COMMENT '分析模式，live：实时分析，final：最终分析，manual_reanalyze：人工重分析',
  analysis_scope VARCHAR(64) NOT NULL COMMENT '分析范围，all：全部，qaFindings：质检，classification：分类',
  source_message_from BIGINT UNSIGNED NULL COMMENT '输入消息起始ID',
  source_message_to BIGINT UNSIGNED NULL COMMENT '输入消息结束ID',
  status VARCHAR(32) NOT NULL COMMENT '运行状态，running：执行中，succeeded：成功，partial：部分成功，failed：失败',
  input_token_count INT UNSIGNED NULL COMMENT '输入token数',
  output_token_count INT UNSIGNED NULL COMMENT '输出token数',
  cost_estimate VARCHAR(64) NULL COMMENT '成本估算',
  provider_code VARCHAR(64) NULL COMMENT '模型服务商编码',
  model_name VARCHAR(128) NULL COMMENT '模型名称',
  prompt_version VARCHAR(64) NULL COMMENT '提示词版本',
  raw_output_ref VARCHAR(512) NULL COMMENT '原始输出引用',
  error_code VARCHAR(128) NULL COMMENT '错误或跳过原因码',
  error_message VARCHAR(1024) NULL COMMENT '错误或跳过原因说明',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  finished_at DATETIME NULL COMMENT '完成时间',
  PRIMARY KEY (id),
  KEY idx_analysis_run_session (session_id, create_time),
  KEY idx_analysis_run_live_watermark (session_id, mode, status, id),
  KEY idx_analysis_run_job (job_id)
) COMMENT='会话洞察模型分析运行记录表';

CREATE TABLE IF NOT EXISTS xy_wap_embed_session_insight_snapshot (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  session_id BIGINT UNSIGNED NOT NULL COMMENT '逻辑会话ID',
  phase VARCHAR(32) NOT NULL COMMENT '分析阶段，live：实时分析，final：最终分析',
  status VARCHAR(32) NOT NULL COMMENT '快照状态，building：构建中，ready：可用，partial：部分可用',
  source_message_high_watermark BIGINT UNSIGNED NULL COMMENT '输入消息高水位ID',
  analysis_version VARCHAR(64) NOT NULL COMMENT '分析逻辑版本',
  model_profile_id BIGINT UNSIGNED NULL COMMENT '模型配置ID',
  prompt_version VARCHAR(64) NOT NULL COMMENT '提示词版本',
  rule_version VARCHAR(64) NOT NULL COMMENT '规则版本',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  KEY idx_snapshot_session (session_id, create_time)
) COMMENT='逻辑会话洞察快照表';

CREATE TABLE IF NOT EXISTS xy_wap_embed_session_summary (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  snapshot_id BIGINT UNSIGNED NOT NULL COMMENT '洞察快照ID',
  session_title VARCHAR(255) NOT NULL COMMENT '会话短标题',
  summary_text VARCHAR(2048) NOT NULL COMMENT '会话摘要正文',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_session_summary_snapshot_id (snapshot_id)
) COMMENT='逻辑会话摘要结果表';

CREATE TABLE IF NOT EXISTS xy_wap_embed_session_sentiment (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  snapshot_id BIGINT UNSIGNED NOT NULL COMMENT '洞察快照ID',
  polarity VARCHAR(32) NOT NULL COMMENT '情绪极性，positive：正向，neutral：中性，negative：负向，mixed：混合，unknown：未知',
  reason VARCHAR(1024) NOT NULL COMMENT '情绪判断理由',
  confidence DECIMAL(5,4) NULL COMMENT '置信度',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_sentiment_snapshot_id (snapshot_id)
) COMMENT='逻辑会话情绪分析结果表';

CREATE TABLE IF NOT EXISTS xy_wap_embed_session_tag (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  uid BIGINT UNSIGNED NOT NULL COMMENT '租户UID',
  snapshot_id BIGINT UNSIGNED NOT NULL COMMENT '洞察快照ID',
  tag_id BIGINT UNSIGNED NOT NULL COMMENT '标签配置ID',
  tag_name VARCHAR(128) NOT NULL COMMENT '标签名称快照',
  confidence DECIMAL(5,4) NULL COMMENT '置信度',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_session_tag_snapshot_tag (snapshot_id, tag_id),
  KEY idx_tag_uid_id_snapshot (uid, tag_id, snapshot_id)
) COMMENT='逻辑会话标签结果表';

CREATE TABLE IF NOT EXISTS xy_wap_embed_session_problem_resolution (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  snapshot_id BIGINT UNSIGNED NOT NULL COMMENT '洞察快照ID',
  problem_detected TINYINT UNSIGNED NOT NULL COMMENT '是否识别到客户问题，1是0否',
  problem_summary VARCHAR(2048) NOT NULL COMMENT '客户问题摘要',
  resolution_status VARCHAR(32) NOT NULL COMMENT '问题解决状态，resolved：已解决，unresolved：未解决，partially_resolved：部分解决，no_customer_problem：无客户问题，unknown：未知',
  unresolved_reason VARCHAR(2048) NULL COMMENT '未解决或部分解决原因',
  agent_action_summary VARCHAR(2048) NULL COMMENT '客服动作摘要',
  customer_final_state VARCHAR(2048) NULL COMMENT '客户最终状态',
  confidence DECIMAL(5,4) NULL COMMENT '置信度',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_session_problem_resolution_snapshot_id (snapshot_id)
) COMMENT='客户问题解决判定结果表';

CREATE TABLE IF NOT EXISTS xy_wap_embed_session_qa_finding (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  snapshot_id BIGINT UNSIGNED NOT NULL COMMENT '洞察快照ID',
  rule_code VARCHAR(128) NOT NULL COMMENT '质检规则编码',
  rule_name VARCHAR(128) NOT NULL COMMENT '质检规则名称快照',
  severity VARCHAR(32) NOT NULL COMMENT '严重程度，low：低，medium：中，high：高',
  passed TINYINT UNSIGNED NOT NULL COMMENT '是否通过，1通过0未通过',
  reason VARCHAR(1024) NOT NULL COMMENT '判定理由',
  confidence DECIMAL(5,4) NULL COMMENT '置信度',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_qa_finding_snapshot_rule (snapshot_id, rule_code)
) COMMENT='逻辑会话质检命中结果表';

CREATE TABLE IF NOT EXISTS xy_wap_embed_session_entity (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  uid BIGINT UNSIGNED NOT NULL COMMENT '租户UID',
  snapshot_id BIGINT UNSIGNED NOT NULL COMMENT '洞察快照ID',
  entity_id BIGINT UNSIGNED NOT NULL COMMENT '实体词库配置ID',
  entity_name VARCHAR(255) NOT NULL COMMENT '实体展示名称',
  sentiment VARCHAR(32) NULL COMMENT '实体相关情绪，positive：正向，neutral：中性，negative：负向，mixed：混合',
  confidence DECIMAL(5,4) NULL COMMENT '置信度',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_session_entity_snapshot_entity (snapshot_id, entity_id),
  KEY idx_session_entity_uid_id_snapshot (uid, entity_id, snapshot_id)
) COMMENT='逻辑会话实体结果表';

CREATE TABLE IF NOT EXISTS xy_wap_embed_session_intent (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  uid BIGINT UNSIGNED NOT NULL COMMENT '租户UID',
  snapshot_id BIGINT UNSIGNED NOT NULL COMMENT '洞察快照ID',
  intent_id BIGINT UNSIGNED NOT NULL COMMENT '意图配置ID',
  intent_label VARCHAR(128) NOT NULL COMMENT '意图名称快照',
  confidence DECIMAL(5,4) NULL COMMENT '置信度',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_session_intent_snapshot_intent (snapshot_id, intent_id),
  KEY idx_session_intent_uid_id_snapshot (uid, intent_id, snapshot_id)
) COMMENT='逻辑会话意图结果表';

CREATE TABLE IF NOT EXISTS xy_wap_embed_session_action_item (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  uid BIGINT UNSIGNED NOT NULL COMMENT '租户UID',
  conversation_id BIGINT UNSIGNED NOT NULL COMMENT '平台会话ID',
  session_id BIGINT UNSIGNED NOT NULL COMMENT '逻辑会话ID',
  snapshot_id BIGINT UNSIGNED NULL COMMENT 'AI来源洞察快照ID',
  source_type VARCHAR(32) NOT NULL DEFAULT 'ai' COMMENT '来源，ai：AI生成，manual：人工创建',
  created_by_sub_user_id BIGINT UNSIGNED NULL COMMENT '创建子账号ID',
  updated_by_sub_user_id BIGINT UNSIGNED NULL COMMENT '最后更新子账号ID',
  completed_by_sub_user_id BIGINT UNSIGNED NULL COMMENT '完成人子账号ID',
  completed_at DATETIME NULL COMMENT '完成时间',
  dismissed_at DATETIME NULL COMMENT '忽略时间',
  action_type VARCHAR(64) NOT NULL COMMENT '行动项类型，当前固定follow_up：跟进',
  title VARCHAR(255) NOT NULL COMMENT '行动项标题',
  priority VARCHAR(32) NOT NULL COMMENT '优先级，low：低，medium：中，high：高',
  due_hint VARCHAR(64) NULL COMMENT '时效提示',
  status VARCHAR(32) NOT NULL COMMENT '处理状态，open：待处理，done：已完成，dismissed：已忽略，expired：已过期',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  KEY idx_action_snapshot (snapshot_id),
  KEY idx_action_uid_conversation_status (uid, conversation_id, status, id),
  KEY idx_action_uid_session_status (uid, session_id, status),
  KEY idx_action_uid_status_id (uid, status, id)
) COMMENT='逻辑会话待处理行动项表';

CREATE TABLE IF NOT EXISTS xy_wap_embed_session_faq_candidate (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  uid BIGINT UNSIGNED NOT NULL COMMENT '租户UID',
  snapshot_id BIGINT UNSIGNED NOT NULL COMMENT '洞察快照ID',
  question VARCHAR(1024) NOT NULL COMMENT '候选问题',
  answer_hint VARCHAR(2048) NOT NULL COMMENT '答案建议',
  status VARCHAR(32) NOT NULL COMMENT '候选状态，当前为candidate：候选',
  confidence DECIMAL(5,4) NULL COMMENT '置信度',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  KEY idx_faq_snapshot (snapshot_id),
  KEY idx_faq_uid_status_snapshot (uid, status, snapshot_id)
) COMMENT='FAQ机会候选结果表';

CREATE TABLE IF NOT EXISTS xy_wap_embed_insight_evidence (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  uid BIGINT UNSIGNED NOT NULL COMMENT '租户ID',
  snapshot_id BIGINT UNSIGNED NOT NULL COMMENT '洞察快照ID',
  dimension_type VARCHAR(64) NOT NULL COMMENT '结论维度类型，problem_resolution：问题解决，sentiment：情绪，tag：标签，qa_finding：质检，entity：实体，intent：意图，action_item：行动项，faq_candidate：FAQ候选',
  dimension_record_id BIGINT UNSIGNED NULL COMMENT '结论记录ID',
  session_id BIGINT UNSIGNED NOT NULL COMMENT '逻辑会话ID',
  conversation_id BIGINT UNSIGNED NOT NULL COMMENT '平台会话ID',
  source_message_id BIGINT UNSIGNED NOT NULL COMMENT '平台消息ID',
  evidence_role VARCHAR(32) NOT NULL COMMENT '证据角色，primary：主要证据，customer_problem：客户问题，agent_solution：客服方案，closure_signal：闭环信号，unresolved_signal：未解决信号',
  reason VARCHAR(512) NULL COMMENT '证据说明',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  KEY idx_evidence_dimension (snapshot_id, dimension_type, dimension_record_id),
  KEY idx_evidence_uid_session_snapshot (uid, session_id, snapshot_id)
) COMMENT='会话洞察证据消息关联表';

CREATE TABLE IF NOT EXISTS xy_wap_embed_insight_analysis_policy (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  uid BIGINT UNSIGNED NOT NULL COMMENT '租户ID',
  enabled TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '是否启用，1启用0禁用',
  live_analysis_enabled TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '是否启用实时分析',
  live_min_new_meaningful_messages INT UNSIGNED NOT NULL COMMENT '触发实时分析的最少新增有效消息数',
  live_min_interval_minutes INT UNSIGNED NOT NULL COMMENT '实时分析最小间隔分钟数',
  final_analysis_enabled TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '是否启用最终分析',
  rule_fallback_enabled TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '是否启用规则降级',
  low_confidence_threshold DECIMAL(5,4) NOT NULL COMMENT '低置信度阈值',
  min_analysis_messages INT UNSIGNED NOT NULL DEFAULT 5 COMMENT '触发模型分析的最少AI有效消息数',
  status TINYINT NOT NULL DEFAULT 1 COMMENT '配置状态，1启用0禁用-1删除',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_insight_analysis_policy_uid (uid)
) COMMENT='会话洞察分析策略配置表';

CREATE TABLE IF NOT EXISTS xy_wap_embed_insight_label_config (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  uid BIGINT UNSIGNED NOT NULL COMMENT '租户ID',
  label_code VARCHAR(128) NOT NULL COMMENT '标签编码',
  label_name VARCHAR(128) NOT NULL COMMENT '标签名称',
  description VARCHAR(512) NULL COMMENT '标签说明',
  positive_examples_json JSON NULL COMMENT '正例JSON',
  negative_examples_json JSON NULL COMMENT '反例JSON',
  status TINYINT NOT NULL DEFAULT 1 COMMENT '配置状态，1启用0禁用-1删除',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_label_uid_code (uid, label_code)
) COMMENT='会话洞察标签配置表';

CREATE TABLE IF NOT EXISTS xy_wap_embed_insight_intent_config (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  uid BIGINT UNSIGNED NOT NULL COMMENT '租户ID',
  intent_code VARCHAR(128) NOT NULL COMMENT '意图编码',
  intent_name VARCHAR(128) NOT NULL COMMENT '意图名称',
  description VARCHAR(512) NULL COMMENT '意图说明',
  positive_examples_json JSON NULL COMMENT '正例JSON',
  negative_examples_json JSON NULL COMMENT '反例JSON',
  status TINYINT NOT NULL DEFAULT 1 COMMENT '配置状态，1启用0禁用-1删除',
  sort_order INT UNSIGNED NOT NULL DEFAULT 5 COMMENT '权重，1-10',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_intent_uid_code (uid, intent_code),
  KEY idx_intent_uid_sort (uid, sort_order)
) COMMENT='会话洞察意图配置表';

CREATE TABLE IF NOT EXISTS xy_wap_embed_insight_qa_rule_config (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  uid BIGINT UNSIGNED NOT NULL COMMENT '租户ID',
  rule_code VARCHAR(128) NOT NULL COMMENT '规则编码',
  rule_name VARCHAR(128) NOT NULL COMMENT '规则名称',
  description VARCHAR(512) NULL COMMENT '规则说明',
  severity VARCHAR(32) NOT NULL COMMENT '严重程度，low：低，medium：中，high：高',
  applicable_scene VARCHAR(128) NULL COMMENT '适用场景',
  judgment_criteria VARCHAR(2048) NULL COMMENT '判定标准',
  positive_examples_json JSON NULL COMMENT '正例JSON',
  negative_examples_json JSON NULL COMMENT '反例JSON',
  status TINYINT NOT NULL DEFAULT 1 COMMENT '配置状态，1启用0禁用-1删除',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_qa_rule_uid_code (uid, rule_code)
) COMMENT='会话洞察质检规则配置表';

CREATE TABLE IF NOT EXISTS xy_wap_embed_insight_entity_dictionary (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  uid BIGINT UNSIGNED NOT NULL COMMENT '租户ID',
  entity_code VARCHAR(128) NOT NULL COMMENT '实体编码',
  entity_name VARCHAR(255) NOT NULL COMMENT '实体名称',
  aliases_json JSON NULL COMMENT '别名JSON',
  attributes_json JSON NULL COMMENT '属性JSON',
  status TINYINT NOT NULL DEFAULT 1 COMMENT '配置状态，1启用0禁用-1删除',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_entity_dictionary_uid_code (uid, entity_code)
) COMMENT='会话洞察实体词库配置表';

CREATE TABLE `xy_wap_embed_material_collection` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT 'id',
  `uid` bigint unsigned NOT NULL COMMENT '租户id',
  `sub_uid` bigint unsigned NOT NULL DEFAULT '0' COMMENT '控制可见性，0：全员可见，其他：对应子账号可见，xy_wap_embed_sub_user.id',
  `biz_type` tinyint NOT NULL DEFAULT '1' COMMENT '业务类型',
  `group_id` bigint unsigned NOT NULL DEFAULT '0' COMMENT '分组ID，xy_wap_embed_material_collection_group.id',
  `title` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL DEFAULT '' COMMENT '标题',
  `content` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci COMMENT '内容',
  `msgid` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL DEFAULT '' COMMENT '消息ID，第三方消息ID',
  `biz_status` tinyint NOT NULL DEFAULT '1' COMMENT '状态，0：已删除，1：正常',
  `op_sub_uid` bigint unsigned NOT NULL COMMENT '收藏人ID，xy_wap_embed_sub_user.id',
  `sort` bigint unsigned NOT NULL DEFAULT '0' COMMENT '排序值',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '插入时间',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_material_collection_msg_scope` (`uid`,`biz_type`,`sub_uid`,`msgid`),
  KEY `idx_uid_bizStatus_subUid_bizType_groupId` (`uid`,`biz_status`,`sub_uid`,`biz_type`,`group_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='chatAI-素材收藏表';

CREATE TABLE `xy_wap_embed_material_collection_group` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT 'id',
  `uid` bigint unsigned NOT NULL COMMENT '租户id',
  `sub_uid` bigint unsigned NOT NULL DEFAULT '0' COMMENT '控制可见性，0：全员可见，其他：对应子账号可见，xy_wap_embed_sub_user.id',
  `biz_type` tinyint NOT NULL DEFAULT '1' COMMENT '业务类型',
  `title` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL DEFAULT '' COMMENT '标题',
  `desc` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL DEFAULT '' COMMENT '描述',
  `biz_status` tinyint NOT NULL DEFAULT '1' COMMENT '状态，0：已删除，1：正常',
  `sort` bigint unsigned NOT NULL DEFAULT '0' COMMENT '排序值',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '插入时间',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_uid_bizStatus_subUid_bizType` (`uid`,`biz_status`,`sub_uid`,`biz_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='chatAI-素材收藏分组表';

CREATE TABLE `xy_wap_embed_quick_reply_category` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT 'id',
  `uid` bigint unsigned NOT NULL COMMENT '租户id',
  `scope_type` tinyint NOT NULL DEFAULT '1' COMMENT '话术范围：1企业话术，2个人话术',
  `sub_uid` bigint unsigned NOT NULL DEFAULT '0' COMMENT '控制可见性，0：全员可见，其他：对应子账号可见，xy_wap_embed_sub_user.id',
  `parent_id` bigint unsigned NOT NULL DEFAULT '0' COMMENT '父分类ID，0表示一级分类',
  `title` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL DEFAULT '' COMMENT '分类名称',
  `biz_status` tinyint NOT NULL DEFAULT '1' COMMENT '状态，0：已删除，1：正常',
  `op_sub_uid` bigint unsigned NOT NULL DEFAULT '0' COMMENT '操作人ID，xy_wap_embed_sub_user.id',
  `sort` bigint unsigned NOT NULL DEFAULT '0' COMMENT '排序值',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '插入时间',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_quick_reply_category_parent_sort` (`uid`,`sub_uid`,`parent_id`,`biz_status`,`sort`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='chatAI-快捷话术分类表';

CREATE TABLE `xy_wap_embed_quick_reply` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT 'id',
  `uid` bigint unsigned NOT NULL COMMENT '租户id',
  `scope_type` tinyint NOT NULL DEFAULT '1' COMMENT '话术范围：1企业话术，2个人话术',
  `sub_uid` bigint unsigned NOT NULL DEFAULT '0' COMMENT '控制可见性，0：全员可见，其他：对应子账号可见，xy_wap_embed_sub_user.id',
  `category_id` bigint unsigned NOT NULL DEFAULT '0' COMMENT '分类ID，0表示未分类',
  `content_text` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci COMMENT '主文本',
  `attachments` json DEFAULT NULL COMMENT '附件JSON，最多5个',
  `label_text` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL DEFAULT '' COMMENT '徽标文字',
  `label_color` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL DEFAULT '' COMMENT '徽标颜色key',
  `biz_status` tinyint NOT NULL DEFAULT '1' COMMENT '状态，0：已删除，1：正常',
  `op_sub_uid` bigint unsigned NOT NULL DEFAULT '0' COMMENT '操作人ID，xy_wap_embed_sub_user.id',
  `sort` bigint unsigned NOT NULL DEFAULT '0' COMMENT '排序值',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '插入时间',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_quick_reply_category_sort` (`uid`,`sub_uid`,`category_id`,`biz_status`,`sort`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='chatAI-快捷话术表';
