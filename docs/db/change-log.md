# Database Change Log

Manual database changes for the backend should be recorded here.

## 2026-06-20

- Added `xy_wap_embed_material_collection.msg_info_id` to retain the source `xy_wap_embed_msg_audit_info.id` alongside the third-party `msgid`.
- Removed application dependency on `xy_wap_embed_material_collection.msgid`; after `msg_info_id` backfill is complete, `msg_info_id` is required and the legacy `msgid` column can be dropped.

Manual migration for existing databases:

```sql
ALTER TABLE xy_wap_embed_material_collection
  ADD COLUMN `msg_info_id` bigint unsigned DEFAULT NULL COMMENT 'xy_wap_embed_msg_audit_info.id' AFTER `content`;

UPDATE xy_wap_embed_material_collection AS material
INNER JOIN xy_wap_embed_msg_audit_info AS message
  ON message.uid = material.uid
  AND message.msgid = material.msgid
SET material.msg_info_id = message.id
WHERE material.msg_info_id IS NULL
  AND material.msgid <> '';

UPDATE xy_wap_embed_quick_reply AS quick_reply
INNER JOIN (
  SELECT
    quick_reply.id,
    JSON_ARRAYAGG(
      CASE
        WHEN material.msg_info_id IS NOT NULL
          AND JSON_UNQUOTE(JSON_EXTRACT(attachment.item, '$.msgInfoId')) IS NULL
        THEN JSON_SET(attachment.item, '$.msgInfoId', CAST(material.msg_info_id AS CHAR))
        ELSE attachment.item
      END
      ORDER BY attachment.ord
    ) AS next_attachments
  FROM xy_wap_embed_quick_reply AS quick_reply
  JOIN JSON_TABLE(
    quick_reply.attachments,
    '$[*]' COLUMNS (
      ord FOR ORDINALITY,
      item JSON PATH '$'
    )
  ) AS attachment
  LEFT JOIN xy_wap_embed_material_collection AS material
    ON material.id = CAST(JSON_UNQUOTE(JSON_EXTRACT(attachment.item, '$.materialCollectionId')) AS UNSIGNED)
    AND material.uid = quick_reply.uid
  WHERE quick_reply.attachments IS NOT NULL
  GROUP BY quick_reply.id
) AS rebuilt
  ON rebuilt.id = quick_reply.id
SET quick_reply.attachments = rebuilt.next_attachments;

ALTER TABLE xy_wap_embed_material_collection
  MODIFY COLUMN `msg_info_id` bigint unsigned NOT NULL COMMENT 'xy_wap_embed_msg_audit_info.id';

ALTER TABLE xy_wap_embed_material_collection
  DROP COLUMN `msgid`;
```

## 2026-06-15

- Added `xy_wap_embed_quick_reply_category` and `xy_wap_embed_quick_reply` for enterprise/personal quick replies.

Manual migration for existing databases:

If the quick reply tables were already created with the earlier schema, run:

```sql
ALTER TABLE xy_wap_embed_quick_reply_category
  DROP KEY idx_quick_reply_category_scope,
  ADD KEY idx_quick_reply_category_parent_sort (uid, sub_uid, parent_id, biz_status, sort);

ALTER TABLE xy_wap_embed_quick_reply
  DROP KEY idx_quick_reply_scope_category,
  DROP KEY idx_quick_reply_scope_update,
  ADD KEY idx_quick_reply_category_sort (uid, sub_uid, category_id, biz_status, sort);
```

For fresh databases, create the tables with:

```sql
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
```

## 2026-06-11

- Added tenant-scoped logical-session indexes for live-analysis scans, disabled-insight close updates, and future agent-scoped session paging.
- Moved expired insight-job lease takeover out of claim queries; added `idx_insight_job_expired_lease` for the lease reclaim update.
- Added snapshot-level uniqueness for tag, entity, intent, and QA finding result rows so duplicate LLM outputs cannot create repeated dimensions.
- Removed low-value or now-covered secondary indexes from insight asset, result, and rescan tables.

Manual migration for existing databases:

```sql
ALTER TABLE xy_wap_embed_logical_session
  DROP KEY idx_logical_session_uid_agent_started,
  ADD KEY idx_logical_session_uid_agent_started (uid, third_userid, started_at, id),
  ADD KEY idx_logical_session_uid_open_live (uid, status, last_message_at, id);

ALTER TABLE xy_wap_embed_insight_job
  ADD KEY idx_insight_job_expired_lease (status, lease_until, id);

ALTER TABLE xy_wap_embed_insight_asset
  DROP KEY idx_insight_asset_uid_last_seen,
  DROP KEY idx_insight_asset_uid_type_last_seen;

CREATE TEMPORARY TABLE tmp_insight_duplicate_dimension_rows AS
SELECT 'tag' AS dimension_type, duplicate_row.id AS duplicate_id, keep_row.keep_id
FROM xy_wap_embed_session_tag AS duplicate_row
INNER JOIN (
  SELECT snapshot_id, tag_id, MIN(id) AS keep_id
  FROM xy_wap_embed_session_tag
  GROUP BY snapshot_id, tag_id
  HAVING COUNT(*) > 1
) AS keep_row
  ON keep_row.snapshot_id = duplicate_row.snapshot_id
  AND keep_row.tag_id = duplicate_row.tag_id
  AND keep_row.keep_id <> duplicate_row.id
UNION ALL
SELECT 'entity' AS dimension_type, duplicate_row.id AS duplicate_id, keep_row.keep_id
FROM xy_wap_embed_session_entity AS duplicate_row
INNER JOIN (
  SELECT snapshot_id, entity_id, MIN(id) AS keep_id
  FROM xy_wap_embed_session_entity
  GROUP BY snapshot_id, entity_id
  HAVING COUNT(*) > 1
) AS keep_row
  ON keep_row.snapshot_id = duplicate_row.snapshot_id
  AND keep_row.entity_id = duplicate_row.entity_id
  AND keep_row.keep_id <> duplicate_row.id
UNION ALL
SELECT 'intent' AS dimension_type, duplicate_row.id AS duplicate_id, keep_row.keep_id
FROM xy_wap_embed_session_intent AS duplicate_row
INNER JOIN (
  SELECT snapshot_id, intent_id, MIN(id) AS keep_id
  FROM xy_wap_embed_session_intent
  GROUP BY snapshot_id, intent_id
  HAVING COUNT(*) > 1
) AS keep_row
  ON keep_row.snapshot_id = duplicate_row.snapshot_id
  AND keep_row.intent_id = duplicate_row.intent_id
  AND keep_row.keep_id <> duplicate_row.id
UNION ALL
SELECT 'qa_finding' AS dimension_type, duplicate_row.id AS duplicate_id, keep_row.keep_id
FROM xy_wap_embed_session_qa_finding AS duplicate_row
INNER JOIN (
  SELECT snapshot_id, rule_code, MIN(id) AS keep_id
  FROM xy_wap_embed_session_qa_finding
  GROUP BY snapshot_id, rule_code
  HAVING COUNT(*) > 1
) AS keep_row
  ON keep_row.snapshot_id = duplicate_row.snapshot_id
  AND keep_row.rule_code = duplicate_row.rule_code
  AND keep_row.keep_id <> duplicate_row.id;

UPDATE xy_wap_embed_insight_evidence AS evidence
INNER JOIN tmp_insight_duplicate_dimension_rows AS duplicate_row
  ON duplicate_row.dimension_type = evidence.dimension_type
  AND duplicate_row.duplicate_id = evidence.dimension_record_id
SET evidence.dimension_record_id = duplicate_row.keep_id;

DELETE duplicate_row
FROM xy_wap_embed_session_tag AS duplicate_row
INNER JOIN tmp_insight_duplicate_dimension_rows AS duplicate_map
  ON duplicate_map.dimension_type = 'tag'
  AND duplicate_map.duplicate_id = duplicate_row.id;

DELETE duplicate_row
FROM xy_wap_embed_session_entity AS duplicate_row
INNER JOIN tmp_insight_duplicate_dimension_rows AS duplicate_map
  ON duplicate_map.dimension_type = 'entity'
  AND duplicate_map.duplicate_id = duplicate_row.id;

DELETE duplicate_row
FROM xy_wap_embed_session_intent AS duplicate_row
INNER JOIN tmp_insight_duplicate_dimension_rows AS duplicate_map
  ON duplicate_map.dimension_type = 'intent'
  AND duplicate_map.duplicate_id = duplicate_row.id;

DELETE duplicate_row
FROM xy_wap_embed_session_qa_finding AS duplicate_row
INNER JOIN tmp_insight_duplicate_dimension_rows AS duplicate_map
  ON duplicate_map.dimension_type = 'qa_finding'
  AND duplicate_map.duplicate_id = duplicate_row.id;

DROP TEMPORARY TABLE tmp_insight_duplicate_dimension_rows;

ALTER TABLE xy_wap_embed_session_tag
  DROP KEY idx_tag_snapshot,
  ADD UNIQUE KEY uk_session_tag_snapshot_tag (snapshot_id, tag_id);

ALTER TABLE xy_wap_embed_session_entity
  DROP KEY idx_session_entity_snapshot,
  ADD UNIQUE KEY uk_session_entity_snapshot_entity (snapshot_id, entity_id);

ALTER TABLE xy_wap_embed_session_intent
  DROP KEY idx_session_intent_snapshot,
  ADD UNIQUE KEY uk_session_intent_snapshot_intent (snapshot_id, intent_id);

ALTER TABLE xy_wap_embed_session_qa_finding
  DROP KEY idx_qa_snapshot,
  DROP KEY idx_qa_rule,
  ADD UNIQUE KEY uk_qa_finding_snapshot_rule (snapshot_id, rule_code);

ALTER TABLE xy_wap_embed_session_sentiment
  DROP KEY idx_sentiment_polarity;

ALTER TABLE xy_wap_embed_session_faq_candidate
  DROP KEY idx_faq_status;

ALTER TABLE xy_wap_embed_insight_rescan_task
  DROP KEY idx_insight_rescan_task_status;
```

## 2026-06-01

- Added `xy_wap_embed_*` insight application tables for logical sessions, insight jobs, analysis runs, snapshots, quality/problem resolution, action items, evidence, seed-backed settings, and model provider/profile configuration.
- These tables are owned by the Node backend and are included in the backend writable table whitelist.

## 2026-06-04

- Added `xy_wap_embed_insight_rescan_task` for user-visible historical insight rescan task records and progress counters.
- Added nullable `rescan_task_id` to `xy_wap_embed_insight_job` so scan and reanalysis jobs can be associated with a rescan task.
- Added `xy_wap_embed_session_insight_current.idx_current_session_snapshot` to cover current pointer joins from session id to snapshot id.
- Rebuilt `xy_wap_embed_insight_job.idx_insight_job_runnable` as `(status ASC, run_after ASC, priority DESC, id ASC)` to match worker claim ordering.
- Added `xy_wap_embed_insight_job_archive` as the cold-storage target for succeeded or failed insight jobs before pruning the hot queue table.
- Changed `xy_wap_embed_session_sentiment.snapshot_id` from a non-unique secondary index to `uk_sentiment_snapshot_id` so each insight snapshot has at most one sentiment row.
- Added `xy_wap_embed_logical_session.idx_logical_session_uid_started` for overview and business-topic time-window queries.
- Added `xy_wap_embed_logical_session.next_close_at` and `idx_logical_session_status_next_close` so timeout-close scans can use a direct range condition instead of per-row duration expressions.
- Added `xy_wap_embed_insight_job.idx_insight_job_claim` for scoped worker job claims by target and job type.
- Added `xy_wap_embed_insight_rescan_task.idx_insight_rescan_task_uid_status` for active rescan checks.
- Added `xy_wap_embed_insight_evidence.idx_evidence_uid_session_snapshot` for detail evidence lookups scoped by uid, session, and snapshot.
- Added `xy_wap_embed_logical_session_message.idx_session_message_asset` for current-session asset hydration by session and message type.
- Added `uid` and tenant-first indexes to list/aggregate insight result tables (`xy_wap_embed_session_action_item`, `xy_wap_embed_session_tag`, `xy_wap_embed_session_entity`, `xy_wap_embed_session_intent`, `xy_wap_embed_session_faq_candidate`) so list and business insight queries can filter by tenant directly from result tables.

Manual migration for existing databases:

```sql
ALTER TABLE xy_wap_embed_session_action_item
  ADD COLUMN uid BIGINT UNSIGNED NULL COMMENT '租户UID' AFTER id;
ALTER TABLE xy_wap_embed_session_tag
  ADD COLUMN uid BIGINT UNSIGNED NULL COMMENT '租户UID' AFTER id;
ALTER TABLE xy_wap_embed_session_entity
  ADD COLUMN uid BIGINT UNSIGNED NULL COMMENT '租户UID' AFTER id;
ALTER TABLE xy_wap_embed_session_intent
  ADD COLUMN uid BIGINT UNSIGNED NULL COMMENT '租户UID' AFTER id;
ALTER TABLE xy_wap_embed_session_faq_candidate
  ADD COLUMN uid BIGINT UNSIGNED NULL COMMENT '租户UID' AFTER id;

UPDATE xy_wap_embed_session_action_item AS action
INNER JOIN xy_wap_embed_session_insight_snapshot AS snapshot
  ON snapshot.id = action.snapshot_id
INNER JOIN xy_wap_embed_logical_session AS session
  ON session.id = snapshot.session_id
SET action.uid = session.uid
WHERE action.uid IS NULL;

UPDATE xy_wap_embed_session_tag AS tag
INNER JOIN xy_wap_embed_session_insight_snapshot AS snapshot
  ON snapshot.id = tag.snapshot_id
INNER JOIN xy_wap_embed_logical_session AS session
  ON session.id = snapshot.session_id
SET tag.uid = session.uid
WHERE tag.uid IS NULL;

UPDATE xy_wap_embed_session_entity AS entity
INNER JOIN xy_wap_embed_session_insight_snapshot AS snapshot
  ON snapshot.id = entity.snapshot_id
INNER JOIN xy_wap_embed_logical_session AS session
  ON session.id = snapshot.session_id
SET entity.uid = session.uid
WHERE entity.uid IS NULL;

UPDATE xy_wap_embed_session_intent AS intent
INNER JOIN xy_wap_embed_session_insight_snapshot AS snapshot
  ON snapshot.id = intent.snapshot_id
INNER JOIN xy_wap_embed_logical_session AS session
  ON session.id = snapshot.session_id
SET intent.uid = session.uid
WHERE intent.uid IS NULL;

UPDATE xy_wap_embed_session_faq_candidate AS faq
INNER JOIN xy_wap_embed_session_insight_snapshot AS snapshot
  ON snapshot.id = faq.snapshot_id
INNER JOIN xy_wap_embed_logical_session AS session
  ON session.id = snapshot.session_id
SET faq.uid = session.uid
WHERE faq.uid IS NULL;

ALTER TABLE xy_wap_embed_session_action_item
  MODIFY COLUMN uid BIGINT UNSIGNED NOT NULL COMMENT '租户UID',
  ADD KEY idx_action_uid_status_id (uid, status, id);
ALTER TABLE xy_wap_embed_session_tag
  MODIFY COLUMN uid BIGINT UNSIGNED NOT NULL COMMENT '租户UID',
  ADD KEY idx_tag_uid_code_snapshot (uid, tag_code, snapshot_id);
ALTER TABLE xy_wap_embed_session_entity
  MODIFY COLUMN uid BIGINT UNSIGNED NOT NULL COMMENT '租户UID',
  ADD KEY idx_session_entity_uid_id_snapshot (uid, entity_id, snapshot_id);
ALTER TABLE xy_wap_embed_session_intent
  MODIFY COLUMN uid BIGINT UNSIGNED NOT NULL COMMENT '租户UID',
  ADD KEY idx_session_intent_uid_code_snapshot (uid, intent_code, snapshot_id);
ALTER TABLE xy_wap_embed_session_faq_candidate
  MODIFY COLUMN uid BIGINT UNSIGNED NOT NULL COMMENT '租户UID',
  ADD KEY idx_faq_uid_status_snapshot (uid, status, snapshot_id);
```

- Removed the standalone `xy_wap_embed_session_risk` dimension. Risk attention is represented through QA findings, problem resolution, entity sentiment, and action items instead of a separate LLM output/table/API field.

Manual migration for existing databases:

```sql
DROP TABLE IF EXISTS xy_wap_embed_session_risk;
```

- Removed redundant secondary indexes after query-path review:
  - `xy_wap_embed_insight_job.idx_insight_job_runnable`, covered by scoped job claim queries using `idx_insight_job_claim`.
  - `xy_wap_embed_insight_evidence.idx_evidence_session_message`, `idx_evidence_conversation_message`, and `idx_evidence_source_message`, because current evidence reads use snapshot/dimension or uid/session/snapshot lookups.
  - `xy_wap_embed_logical_session.idx_logical_session_status_time`, replaced by `idx_logical_session_status_next_close` for close scans.
  - `xy_wap_embed_session_tag.idx_tag_code`, `xy_wap_embed_session_entity.idx_session_entity_identity`, and `xy_wap_embed_session_intent.idx_session_intent_code`, replaced by uid-prefixed result-table indexes after filter joins were made uid-scoped.
  - `xy_wap_embed_session_action_item.idx_action_status_priority`, because follow-up and worker action-item queries are tenant-scoped and use uid-prefixed indexes.

Manual migration for existing databases:

```sql
ALTER TABLE xy_wap_embed_insight_job
  DROP KEY idx_insight_job_runnable;

ALTER TABLE xy_wap_embed_insight_evidence
  DROP KEY idx_evidence_session_message,
  DROP KEY idx_evidence_conversation_message,
  DROP KEY idx_evidence_source_message;

ALTER TABLE xy_wap_embed_session_action_item
  DROP KEY idx_action_status_priority;

ALTER TABLE xy_wap_embed_logical_session
  DROP KEY idx_logical_session_status_time;

ALTER TABLE xy_wap_embed_session_tag
  DROP KEY idx_tag_code;

ALTER TABLE xy_wap_embed_session_entity
  DROP KEY idx_session_entity_identity;

ALTER TABLE xy_wap_embed_session_intent
  DROP KEY idx_session_intent_code;
```

## 2026-06-07

- Replaced `xy_wap_embed_session_summary.customer_intent/process_summary/result_summary/follow_up` with `session_title/summary_text`. Runtime code now reads and writes the new summary shape only.
- Tightened `xy_wap_embed_insight_sync_cursor.uid` to `NOT NULL DEFAULT 0`; `uid = 0` is the global sync cursor sentinel and works with `uk_insight_sync_source_uid` to prevent duplicate global cursors.
- Changed `xy_wap_embed_insight_rescan_task.from_time/to_time` from `DATETIME` to UTC millisecond message watermarks so historical rescans align directly with `xy_wap_embed_msg_audit_info.msgtime`.

Manual DDL for development databases:

```sql
ALTER TABLE xy_wap_embed_insight_sync_cursor
  MODIFY COLUMN uid BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '租户ID，0表示全局水位';

ALTER TABLE xy_wap_embed_insight_rescan_task
  ADD COLUMN from_time_ms BIGINT UNSIGNED NULL COMMENT '重刷起始消息时间戳' AFTER from_time,
  ADD COLUMN to_time_ms BIGINT UNSIGNED NULL COMMENT '重刷结束消息时间戳' AFTER to_time;

UPDATE xy_wap_embed_insight_rescan_task
SET
  from_time_ms = CAST(UNIX_TIMESTAMP(from_time) * 1000 AS UNSIGNED),
  to_time_ms = CASE
    WHEN to_time IS NULL THEN NULL
    ELSE CAST(UNIX_TIMESTAMP(to_time) * 1000 AS UNSIGNED)
  END;

ALTER TABLE xy_wap_embed_insight_rescan_task
  DROP COLUMN from_time,
  DROP COLUMN to_time;

ALTER TABLE xy_wap_embed_insight_rescan_task
  CHANGE COLUMN from_time_ms from_time BIGINT UNSIGNED NOT NULL COMMENT '重刷起始消息时间戳' AFTER created_by,
  CHANGE COLUMN to_time_ms to_time BIGINT UNSIGNED NULL COMMENT '重刷结束消息时间戳' AFTER from_time;
```

Manual migration for existing databases:

```sql
ALTER TABLE xy_wap_embed_session_summary
  ADD COLUMN session_title VARCHAR(255) NULL COMMENT '会话短标题' AFTER snapshot_id,
  ADD COLUMN summary_text VARCHAR(2048) NULL COMMENT '会话摘要正文' AFTER session_title;

UPDATE xy_wap_embed_session_summary
SET
  session_title = COALESCE(LEFT(NULLIF(TRIM(customer_intent), ''), 255), ''),
  summary_text = COALESCE(
    LEFT(
      NULLIF(
        CONCAT_WS(
          '；',
          NULLIF(TRIM(customer_intent), ''),
          NULLIF(TRIM(process_summary), ''),
          NULLIF(TRIM(result_summary), '')
        ),
        ''
      ),
      2048
    ),
    ''
  );

ALTER TABLE xy_wap_embed_session_summary
  MODIFY COLUMN session_title VARCHAR(255) NOT NULL COMMENT '会话短标题',
  MODIFY COLUMN summary_text VARCHAR(2048) NOT NULL COMMENT '会话摘要正文',
  DROP COLUMN customer_intent,
  DROP COLUMN process_summary,
  DROP COLUMN result_summary,
  DROP COLUMN follow_up;
```

- Removed `xy_wap_embed_session_summary.confidence`; summary confidence is no longer produced, parsed, or stored.

Manual migration for existing databases:

```sql
ALTER TABLE xy_wap_embed_session_summary
  DROP COLUMN confidence;
```

- Added `xy_wap_embed_insight_analysis_policy.min_analysis_messages` as the tenant-level minimum AI-ready message count before model analysis runs. Live jobs below the threshold skip snapshot creation; final/manual jobs below the threshold write a deterministic insufficient-information final snapshot.

Manual migration for existing databases:

```sql
ALTER TABLE xy_wap_embed_insight_analysis_policy
  ADD COLUMN min_analysis_messages INT UNSIGNED NOT NULL DEFAULT 5 COMMENT '触发模型分析的最少AI有效消息数'
  AFTER low_confidence_threshold;
```

- Added live-analysis scheduling indexes so open-session checks can find recent live runs and count AI-ready session messages by source-message watermark.

Manual migration for existing databases:

```sql
ALTER TABLE xy_wap_embed_analysis_run
  ADD KEY idx_analysis_run_live_watermark (session_id, mode, status, id);

ALTER TABLE xy_wap_embed_logical_session_message
  ADD KEY idx_session_message_ai_count (session_id, included_for_ai, meaningful_for_boundary, source_message_id);
```

- Expanded `xy_wap_embed_session_action_item` so manual todos and AI todos share one session-scoped table. Todos now store the platform conversation, logical session, source type, operator audit fields, and terminal timestamps directly; `session_id` is required because manual todo creation must be anchored to an existing logical session.

Manual migration for existing databases:

```sql
ALTER TABLE xy_wap_embed_session_action_item
  ADD COLUMN conversation_id BIGINT UNSIGNED NULL COMMENT '平台会话ID' AFTER uid,
  MODIFY COLUMN snapshot_id BIGINT UNSIGNED NULL COMMENT 'AI来源洞察快照ID',
  ADD COLUMN session_id BIGINT UNSIGNED NULL COMMENT '逻辑会话ID' AFTER conversation_id,
  ADD COLUMN source_type VARCHAR(32) NOT NULL DEFAULT 'ai' COMMENT '来源，ai：AI生成，manual：人工创建' AFTER snapshot_id,
  ADD COLUMN created_by_sub_user_id BIGINT UNSIGNED NULL COMMENT '创建子账号ID' AFTER source_type,
  ADD COLUMN updated_by_sub_user_id BIGINT UNSIGNED NULL COMMENT '最后更新子账号ID' AFTER created_by_sub_user_id,
  ADD COLUMN completed_by_sub_user_id BIGINT UNSIGNED NULL COMMENT '完成人子账号ID' AFTER updated_by_sub_user_id,
  ADD COLUMN completed_at DATETIME NULL COMMENT '完成时间' AFTER completed_by_sub_user_id,
  ADD COLUMN dismissed_at DATETIME NULL COMMENT '忽略时间' AFTER completed_at;

UPDATE xy_wap_embed_session_action_item AS action
INNER JOIN xy_wap_embed_session_insight_snapshot AS snapshot
  ON snapshot.id = action.snapshot_id
INNER JOIN xy_wap_embed_logical_session AS session
  ON session.id = snapshot.session_id
SET
  action.conversation_id = session.conversation_id,
  action.session_id = session.id,
  action.source_type = 'ai'
WHERE action.session_id IS NULL;

ALTER TABLE xy_wap_embed_session_action_item
  MODIFY COLUMN conversation_id BIGINT UNSIGNED NOT NULL COMMENT '平台会话ID',
  MODIFY COLUMN session_id BIGINT UNSIGNED NOT NULL COMMENT '逻辑会话ID',
  ADD KEY idx_action_uid_conversation_status (uid, conversation_id, status, id),
  ADD KEY idx_action_uid_session_status (uid, session_id, status);
```

- Added customer and agent third-party identity snapshots to `xy_wap_embed_logical_session`. New sessions write these fields at creation time so overview, quality, and follow-up queries can hydrate actors without joining `xy_wap_embed_conversation` only to read identity fields.

Manual migration for existing databases:

```sql
ALTER TABLE xy_wap_embed_logical_session
  ADD COLUMN third_userid VARCHAR(128) NULL COMMENT '会话创建时客服第三方用户ID' AFTER conversation_id,
  ADD COLUMN third_external_userid VARCHAR(128) NULL COMMENT '会话创建时客户第三方用户ID' AFTER third_userid;

UPDATE xy_wap_embed_logical_session AS session
INNER JOIN xy_wap_embed_conversation AS conversation
  ON conversation.id = session.conversation_id
  AND conversation.uid = session.uid
SET
  session.third_userid = conversation.third_userid,
  session.third_external_userid = conversation.third_external_userid
WHERE session.third_userid IS NULL
  OR session.third_external_userid IS NULL;

SELECT COUNT(*) AS missing_identity_sessions
FROM xy_wap_embed_logical_session
WHERE third_userid IS NULL
   OR third_external_userid IS NULL;

ALTER TABLE xy_wap_embed_logical_session
  MODIFY COLUMN third_userid VARCHAR(128) NOT NULL COMMENT '会话创建时客服第三方用户ID',
  MODIFY COLUMN third_external_userid VARCHAR(128) NOT NULL COMMENT '会话创建时客户第三方用户ID',
  ADD KEY idx_logical_session_uid_agent_started (uid, third_userid, started_at);
```

## 2026-06-09

- Updated overview-query indexes for current-snapshot reverse lookups:
  - Replaced `xy_wap_embed_session_insight_current.idx_current_session_snapshot` with `idx_current_snapshot_session`; the existing unique key on `session_id` already covers session-to-current lookups, while overview entity/intent hotspot queries need the reverse current-snapshot-to-session direction.
  - Overview session entity filtering uses `xy_wap_embed_session_entity.idx_session_entity_uid_id_snapshot (uid, entity_id, snapshot_id)`, so no additional `entity_name` index is needed.
  - Simplified insight entity configuration: dictionary uses `entity_code` + `entity_name`, recognition results store `entity_id = xy_wap_embed_insight_entity_dictionary.id` plus redundant `entity_name`; `entity_type` and `canonical_name` are removed.
  - Kept `xy_wap_embed_insight_intent_config.intent_code` and `xy_wap_embed_insight_label_config.label_code` as the stable semantic codes exposed to the LLM.
  - Removed redundant result-table codes: intent/tag recognition results now store `intent_id`/`tag_id` pointing to config table `id`, plus `intent_label`/`tag_name` display snapshots; overview filters and result indexes use those IDs.

Manual migration for existing databases:

Before running the `xy_wap_embed_session_entity.entity_id` type change on a database with existing insight data, backfill existing string entity values to `xy_wap_embed_insight_entity_dictionary.id` first. MySQL may coerce non-numeric legacy values such as `sku-1` to `0` when `MODIFY COLUMN entity_id BIGINT UNSIGNED` is applied directly.

```sql
ALTER TABLE xy_wap_embed_session_insight_current
  DROP KEY idx_current_session_snapshot,
  ADD KEY idx_current_snapshot_session (current_snapshot_id, session_id);

ALTER TABLE xy_wap_embed_insight_entity_dictionary
  DROP KEY uk_entity_dictionary_uid_type_name,
  DROP KEY idx_entity_dictionary_uid_type,
  DROP COLUMN entity_type,
  CHANGE COLUMN canonical_name entity_name VARCHAR(255) NOT NULL COMMENT '实体名称',
  ADD COLUMN entity_code VARCHAR(128) NOT NULL COMMENT '实体编码' AFTER uid,
  ADD UNIQUE KEY uk_entity_dictionary_uid_code (uid, entity_code);

ALTER TABLE xy_wap_embed_session_entity
  DROP KEY idx_session_entity_uid_identity,
  DROP COLUMN entity_type,
  MODIFY COLUMN entity_id BIGINT UNSIGNED NOT NULL COMMENT '实体词库配置ID',
  ADD KEY idx_session_entity_uid_id_snapshot (uid, entity_id, snapshot_id);

ALTER TABLE xy_wap_embed_session_tag
  DROP KEY idx_tag_uid_code_snapshot,
  DROP COLUMN tag_code,
  ADD COLUMN tag_id BIGINT UNSIGNED NOT NULL COMMENT '标签配置ID' AFTER snapshot_id,
  MODIFY COLUMN tag_name VARCHAR(128) NOT NULL COMMENT '标签名称快照',
  ADD KEY idx_tag_uid_id_snapshot (uid, tag_id, snapshot_id);

ALTER TABLE xy_wap_embed_session_intent
  DROP KEY idx_session_intent_uid_code_snapshot,
  DROP COLUMN intent_code,
  ADD COLUMN intent_id BIGINT UNSIGNED NOT NULL COMMENT '意图配置ID' AFTER snapshot_id,
  MODIFY COLUMN intent_label VARCHAR(128) NOT NULL COMMENT '意图名称快照',
  ADD KEY idx_session_intent_uid_id_snapshot (uid, intent_id, snapshot_id);
```

## 2026-06-10

- Added `xy_wap_embed_logical_session.qa_status` as the service-quality read model status: `-1` not inspected, `0` has failed QA findings, `1` all QA findings passed.
- Added `xy_wap_embed_logical_session.idx_logical_session_uid_qa_status_started` so service-quality result lists can page directly from logical sessions by tenant, QA status, and session start time.

Manual migration for existing databases:

```sql
ALTER TABLE xy_wap_embed_logical_session
  ADD COLUMN qa_status TINYINT NOT NULL DEFAULT -1 COMMENT '质检状态，-1未质检，0有未通过，1全部通过' AFTER current_snapshot_id,
  ADD KEY idx_logical_session_uid_qa_status_started (uid, qa_status, started_at, id);
```

Backfill existing logical sessions after the column is added:

```sql
UPDATE xy_wap_embed_logical_session AS session
JOIN (
  SELECT
    snapshot_id,
    CASE
      WHEN SUM(CASE WHEN passed = 0 THEN 1 ELSE 0 END) > 0 THEN 0
      ELSE 1
    END AS qa_status
  FROM xy_wap_embed_session_qa_finding
  GROUP BY snapshot_id
) AS qa
  ON qa.snapshot_id = session.current_snapshot_id
SET session.qa_status = qa.qa_status
WHERE session.qa_status = -1;

ANALYZE TABLE xy_wap_embed_logical_session;
```

- Added the first-phase business asset read model for the business-insights asset tab:
  - Added `xy_wap_embed_insight_asset` as the app-owned asset dictionary for links, miniapp cards, and files.
  - Added nullable `asset_id` and `asset_type` to `xy_wap_embed_logical_session_message` so asset statistics and related-session drilldowns no longer parse platform messages during reads.
  - Replaced the old message-type asset index with asset-id based indexes for asset drilldown and bounded time-window asset aggregation.

Manual migration for existing databases:

If a database skipped older insight index migrations, confirm the old keys exist before running the `DROP KEY` clauses.

```sql
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

ALTER TABLE xy_wap_embed_logical_session_message
  ADD COLUMN asset_id BIGINT UNSIGNED NULL COMMENT '资产ID，关联xy_wap_embed_insight_asset.id；非链接/文件/小程序消息为空' AFTER message_type,
  ADD COLUMN asset_type VARCHAR(32) NULL COMMENT '资产类型，link：链接，miniapp：小程序，file：文件；非资产消息为空' AFTER asset_id,
  DROP KEY idx_session_message_asset,
  DROP KEY idx_session_message_asset_session,
  DROP KEY idx_session_message_conversation_time,
  DROP KEY idx_session_message_source,
  ADD KEY idx_session_message_asset_lookup (uid, asset_id, source_message_time, session_id),
  ADD KEY idx_session_message_asset_window (uid, source_message_time, asset_id, session_id);
```

## 2026-06-11

- Removed the separate statistics/aggregation visibility switches from insight intent, label, and entity dictionary configuration. Enabled configurations now participate in model matching and are available as report filter options; disabled configurations are excluded by `status`.
- Removed `xy_wap_embed_insight_label_config.include_in_statistics`, `xy_wap_embed_insight_intent_config.include_in_statistics`, and `xy_wap_embed_insight_entity_dictionary.include_in_aggregation`.
- Removed `xy_wap_embed_insight_intent_config.aliases_json`; intent matching and reporting use `intent_code`, and prompt classification boundaries are expressed through description plus positive/negative examples.
- Removed `xy_wap_embed_insight_entity_dictionary.uk_entity_dictionary_uid_name`; entity matching is based on `entity_code`, and display names are not unique business identifiers.

Manual migration for existing databases:

```sql
ALTER TABLE xy_wap_embed_insight_label_config
  DROP COLUMN include_in_statistics;

ALTER TABLE xy_wap_embed_insight_intent_config
  DROP COLUMN include_in_statistics;

ALTER TABLE xy_wap_embed_insight_intent_config
  DROP COLUMN aliases_json;

ALTER TABLE xy_wap_embed_insight_entity_dictionary
  DROP COLUMN include_in_aggregation;

ALTER TABLE xy_wap_embed_insight_entity_dictionary
  DROP KEY uk_entity_dictionary_uid_name;
```

## 2026-06-12

- Removed `xy_wap_embed_session_insight_current`; `xy_wap_embed_logical_session.current_snapshot_id` is the only current insight snapshot pointer.
- Removed unused `xy_wap_embed_logical_session.final_snapshot_id`; final analysis snapshots are identified by `xy_wap_embed_session_insight_snapshot.phase = 'final'` and published through `current_snapshot_id`.
- Added `xy_wap_embed_logical_session.idx_logical_session_current_snapshot (current_snapshot_id, id)` for topic-to-session drilldowns that resolve sessions from snapshot-scoped result rows.
- Added `xy_wap_embed_insight_analysis_policy.enabled`, which is used by API and worker queries to ignore disabled analysis-policy rows.

Manual migration for existing databases:

Run the read-only checks first and confirm any returned rows are expected before continuing.

```sql
-- 1. Preflight checks.
SELECT current.session_id, current.current_snapshot_id
FROM xy_wap_embed_session_insight_current AS current
LEFT JOIN xy_wap_embed_logical_session AS session
  ON session.id = current.session_id
WHERE session.id IS NULL;

SELECT current.session_id, current.current_snapshot_id
FROM xy_wap_embed_session_insight_current AS current
LEFT JOIN xy_wap_embed_session_insight_snapshot AS snapshot
  ON snapshot.id = current.current_snapshot_id
WHERE snapshot.id IS NULL;

SELECT session.id AS session_id,
       session.current_snapshot_id AS session_current_snapshot_id,
       current.current_snapshot_id AS current_table_snapshot_id
FROM xy_wap_embed_logical_session AS session
JOIN xy_wap_embed_session_insight_current AS current
  ON current.session_id = session.id
WHERE session.current_snapshot_id IS NOT NULL
  AND session.current_snapshot_id <> current.current_snapshot_id;

-- 2. Backfill logical_session.current_snapshot_id from the old current table.
UPDATE xy_wap_embed_logical_session AS session
JOIN xy_wap_embed_session_insight_current AS current
  ON current.session_id = session.id
SET session.current_snapshot_id = current.current_snapshot_id
WHERE session.current_snapshot_id IS NULL
   OR session.current_snapshot_id <> current.current_snapshot_id;

-- 3. Add the replacement reverse lookup index.
ALTER TABLE xy_wap_embed_logical_session
  ADD KEY idx_logical_session_current_snapshot (current_snapshot_id, id);

-- 4. Deploy backend code that reads logical_session.current_snapshot_id.

-- 5. Drop the old current pointer table after deployment.
DROP TABLE IF EXISTS xy_wap_embed_session_insight_current;

-- 6. Drop the unused final snapshot pointer.
ALTER TABLE xy_wap_embed_logical_session
  DROP COLUMN final_snapshot_id;

ALTER TABLE xy_wap_embed_insight_analysis_policy
  ADD COLUMN enabled TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '是否启用，1启用0禁用' AFTER uid;

ANALYZE TABLE xy_wap_embed_logical_session;
```
